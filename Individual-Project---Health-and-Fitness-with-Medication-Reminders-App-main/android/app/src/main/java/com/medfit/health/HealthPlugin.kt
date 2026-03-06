package com.medfit.health

import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * HealthPlugin — custom Capacitor plugin bridging JavaScript to Android Health Connect.
 *
 * Registered in MainActivity.kt so it appears on the JS bridge as:
 *   window.Capacitor.Plugins.HealthConnect
 *
 * Key design decisions:
 * - All Health Connect calls run on Dispatchers.IO (background thread) so the UI
 *   never freezes while waiting for data.
 * - We always call call.resolve() not call.reject() — the JS side handles zeros
 *   gracefully, whereas an unhandled rejection would silently swallow the error.
 * - Weekly data is returned as a JSArray (Capacitor's own type), NOT a raw JSONArray.
 *   Using JSONArray with JSObject.put() produces an inconsistent type that comes
 *   through the bridge as an object, not an array — JSArray avoids this entirely.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthPlugin : Plugin() {

    private val TAG = "HealthPlugin"
    private var healthClient: HealthConnectClient? = null

    // Background scope for all Health Connect queries
    private val ioScope = CoroutineScope(Dispatchers.IO)

    // The three data types we request read access to.
    // These must match the <uses-permission> entries in AndroidManifest.xml.
    private val REQUIRED_PERMISSIONS = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class)
    )

    // Returns the Health Connect client, creating it on first use
    private fun client(): HealthConnectClient {
        if (healthClient == null) {
            healthClient = HealthConnectClient.getOrCreate(context)
        }
        return healthClient!!
    }

    // ── checkAvailability ─────────────────────────────────────────────────────
    // Checks if Health Connect is installed and ready on this device.
    // Android 14+ has it built in. Earlier versions need the Play Store app.
    // Returns: { available: Boolean, status: "installed" | "not_installed" | "update_required" }
    @PluginMethod
    fun checkAvailability(call: PluginCall) {
        try {
            val sdkStatus = HealthConnectClient.getSdkStatus(context)
            val ret = JSObject()
            when (sdkStatus) {
                HealthConnectClient.SDK_AVAILABLE -> {
                    ret.put("available", true)
                    ret.put("status", "installed")
                    // Pre-warm the client so the first query is faster
                    healthClient = HealthConnectClient.getOrCreate(context)
                    Log.d(TAG, "Health Connect: installed and ready")
                }
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                    ret.put("available", false)
                    ret.put("status", "update_required")
                    Log.d(TAG, "Health Connect: needs update")
                }
                else -> {
                    ret.put("available", false)
                    ret.put("status", "not_installed")
                    Log.d(TAG, "Health Connect: not installed")
                }
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "checkAvailability error: ${e.message}")
            val ret = JSObject()
            ret.put("available", false)
            ret.put("status", "error")
            call.resolve(ret)
        }
    }

    // ── requestPermissions ────────────────────────────────────────────────────
    // Opens the Health Connect permissions screen where the user ticks which
    // data types they want to share (Steps, Calories, Distance).
    // After they close the screen, handlePermissionResult() is called automatically.
    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        try {
            if (healthClient == null) {
                healthClient = HealthConnectClient.getOrCreate(context)
            }
            // Use Health Connect's own contract to build the permission intent.
            // This is the official way — more reliable than constructing an Intent manually.
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent   = contract.createIntent(context, REQUIRED_PERMISSIONS)
            saveCall(call)
            startActivityForResult(call, intent, "handlePermissionResult")
        } catch (e: Exception) {
            Log.e(TAG, "requestPermissions launch error: ${e.message}")
            val ret = JSObject()
            ret.put("granted", false)
            ret.put("error", e.message)
            call.resolve(ret)
        }
    }

    // Capacitor calls this when the permissions screen closes.
    // Health Connect does NOT tell us the result (by design — it's a privacy feature),
    // so we always resolve granted:true and let the data queries confirm access.
    @ActivityCallback
    private fun handlePermissionResult(call: PluginCall, result: ActivityResult) {
        Log.d(TAG, "Returned from Health Connect permissions screen")
        val ret = JSObject()
        ret.put("granted", true)
        call.resolve(ret)
    }

    // ── getTodaySteps ─────────────────────────────────────────────────────────
    // Queries Health Connect for total steps from midnight to now.
    // The Aggregation API sums all step records from all sources automatically
    // (phone pedometer, smartwatch, fitness tracker — everything).
    // Returns: { steps: Long }
    @PluginMethod
    fun getTodaySteps(call: PluginCall) {
        ioScope.launch {
            try {
                val (start, end) = todayRange()
                val request = AggregateRequest(
                    metrics         = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end)
                )
                val result = client().aggregate(request)
                // COUNT_TOTAL is null when there are zero records for the period,
                // not when permission is denied — both cases we treat as 0
                val steps = result[StepsRecord.COUNT_TOTAL] ?: 0L
                Log.d(TAG, "Today steps: $steps")
                val ret = JSObject()
                ret.put("steps", steps)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getTodaySteps error: ${e.message}")
                val ret = JSObject()
                ret.put("steps", 0)
                call.resolve(ret)
            }
        }
    }

    // ── getTodayCalories ──────────────────────────────────────────────────────
    // Returns active (exercise) calories burned today in kcal.
    // "Active" excludes resting/basal metabolism — it's only calories from movement.
    // Returns: { calories: Long }
    @PluginMethod
    fun getTodayCalories(call: PluginCall) {
        ioScope.launch {
            try {
                val (start, end) = todayRange()
                val request = AggregateRequest(
                    metrics         = setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end)
                )
                val result = client().aggregate(request)
                val energy = result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]
                // inKilocalories is a property in newer SDK versions, not a function
                val kcal = energy?.inKilocalories?.toLong() ?: 0L
                Log.d(TAG, "Today calories: $kcal kcal")
                val ret = JSObject()
                ret.put("calories", kcal)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getTodayCalories error: ${e.message}")
                val ret = JSObject()
                ret.put("calories", 0)
                call.resolve(ret)
            }
        }
    }

    // ── getTodayDistance ──────────────────────────────────────────────────────
    // Returns distance walked/run today in kilometres (e.g. 3.45).
    // Returns: { distance: Double }
    @PluginMethod
    fun getTodayDistance(call: PluginCall) {
        ioScope.launch {
            try {
                val (start, end) = todayRange()
                val request = AggregateRequest(
                    metrics         = setOf(DistanceRecord.DISTANCE_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end)
                )
                val result   = client().aggregate(request)
                val distance = result[DistanceRecord.DISTANCE_TOTAL]
                // inMeters is a property in newer SDK versions, not a function
                val km = distance?.let {
                    Math.round(it.inMeters / 1000.0 * 100.0) / 100.0
                } ?: 0.0
                Log.d(TAG, "Today distance: $km km")
                val ret = JSObject()
                ret.put("distance", km)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getTodayDistance error: ${e.message}")
                val ret = JSObject()
                ret.put("distance", 0.0)
                call.resolve(ret)
            }
        }
    }

    // ── getWeeklySteps ────────────────────────────────────────────────────────
    // Returns step counts for each of the past 7 days, oldest first.
    // Uses JSArray (Capacitor's type) — NOT JSONArray — so it comes through
    // the bridge as a proper JavaScript array on the other side.
    // Returns: { week: [ { date, dayName, steps }, ... ] }
    @PluginMethod
    fun getWeeklySteps(call: PluginCall) {
        ioScope.launch {
            try {
                val today  = LocalDate.now()
                val dayFmt = DateTimeFormatter.ofPattern("EEE") // "Mon", "Tue" etc.

                // JSArray is Capacitor's array type — it serialises correctly over the bridge
                val weekArray = JSArray()

                // i=6 → 6 days ago (oldest), i=0 → today (newest)
                for (daysAgo in 6 downTo 0) {
                    val day      = today.minusDays(daysAgo.toLong())
                    val dayStart = day.atStartOfDay(ZoneId.systemDefault()).toInstant()
                    // Use start of NEXT day as end, not 23:59:59, to avoid missing last-minute steps
                    val dayEnd   = day.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant()

                    var daySteps = 0L
                    try {
                        val req = AggregateRequest(
                            metrics         = setOf(StepsRecord.COUNT_TOTAL),
                            timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd)
                        )
                        val res  = client().aggregate(req)
                        daySteps = res[StepsRecord.COUNT_TOTAL] ?: 0L
                    } catch (inner: Exception) {
                        Log.e(TAG, "Error fetching steps for $day: ${inner.message}")
                    }

                    val obj = JSObject()
                    obj.put("date",    day.toString())
                    obj.put("dayName", day.format(dayFmt))
                    obj.put("steps",   daySteps)
                    weekArray.put(obj)
                }

                val ret = JSObject()
                ret.put("week", weekArray)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getWeeklySteps error: ${e.message}")
                val ret = JSObject()
                ret.put("week", JSArray())
                call.resolve(ret)
            }
        }
    }

    // ── checkPermissions ──────────────────────────────────────────────────────
    // Checks if the user has already granted Step, Calorie and Distance permissions.
    // Returns: { granted: Boolean }
    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        ioScope.launch {
            try {
                val grantedPermissions = client().permissionController.getGrantedPermissions()
                val allGranted = grantedPermissions.containsAll(REQUIRED_PERMISSIONS)
                Log.d(TAG, "Permissions check: $allGranted")
                val ret = JSObject()
                ret.put("granted", allGranted)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "checkPermissions error: ${e.message}")
                val ret = JSObject()
                ret.put("granted", false)
                call.resolve(ret)
            }
        }
    }

    // Helper: returns the start (00:00:00) and end (now) of the current day as Instants.
    private fun todayRange(): Pair<Instant, Instant> {
        val start = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant()
        val end   = Instant.now()
        return Pair(start, end)
    }
}
