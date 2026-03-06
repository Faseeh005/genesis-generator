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
import kotlinx.coroutines.runBlocking
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@CapacitorPlugin(name = "HealthConnect")
class HealthPlugin : Plugin() {

    private val TAG = "HealthPlugin"
    private var healthClient: HealthConnectClient? = null
    private val ioScope = CoroutineScope(Dispatchers.IO)

    private val REQUIRED_PERMISSIONS = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class)
    )

    private fun client(): HealthConnectClient {
        if (healthClient == null) {
            healthClient = HealthConnectClient.getOrCreate(context)
        }
        return healthClient!!
    }

    @PluginMethod
    fun checkAvailability(call: PluginCall) {
        try {
            val sdkStatus = HealthConnectClient.getSdkStatus(context)
            val ret = JSObject()
            when (sdkStatus) {
                HealthConnectClient.SDK_AVAILABLE -> {
                    ret.put("available", true)
                    ret.put("status", "installed")
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

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        try {
            if (healthClient == null) {
                healthClient = HealthConnectClient.getOrCreate(context)
            }
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent = contract.createIntent(context, REQUIRED_PERMISSIONS)
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

    // After the permissions screen closes, VERIFY actual granted permissions
    @ActivityCallback
    private fun handlePermissionResult(call: PluginCall, result: ActivityResult) {
        Log.d(TAG, "Returned from Health Connect permissions screen")
        ioScope.launch {
            try {
                val grantedPermissions = client().permissionController.getGrantedPermissions()
                val allGranted = grantedPermissions.containsAll(REQUIRED_PERMISSIONS)
                Log.d(TAG, "After permission request, granted: $allGranted (got ${grantedPermissions.size} permissions)")
                val ret = JSObject()
                ret.put("granted", allGranted)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "handlePermissionResult check error: ${e.message}")
                val ret = JSObject()
                ret.put("granted", false)
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    fun getTodaySteps(call: PluginCall) {
        ioScope.launch {
            try {
                val (start, end) = todayRange()
                Log.d(TAG, "Querying steps from $start to $end")
                val request = AggregateRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end)
                )
                val result = client().aggregate(request)
                val steps = result[StepsRecord.COUNT_TOTAL] ?: 0L
                Log.d(TAG, "Today steps: $steps")
                val ret = JSObject()
                ret.put("steps", steps)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getTodaySteps error: ${e.message}", e)
                val ret = JSObject()
                ret.put("steps", 0)
                ret.put("error", e.message)
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    fun getTodayCalories(call: PluginCall) {
        ioScope.launch {
            try {
                val (start, end) = todayRange()
                val request = AggregateRequest(
                    metrics = setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end)
                )
                val result = client().aggregate(request)
                val energy = result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]
                val kcal = energy?.inKilocalories?.toLong() ?: 0L
                Log.d(TAG, "Today calories: $kcal kcal")
                val ret = JSObject()
                ret.put("calories", kcal)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getTodayCalories error: ${e.message}", e)
                val ret = JSObject()
                ret.put("calories", 0)
                ret.put("error", e.message)
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    fun getTodayDistance(call: PluginCall) {
        ioScope.launch {
            try {
                val (start, end) = todayRange()
                val request = AggregateRequest(
                    metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end)
                )
                val result = client().aggregate(request)
                val distance = result[DistanceRecord.DISTANCE_TOTAL]
                val km = distance?.let {
                    Math.round(it.inMeters / 1000.0 * 100.0) / 100.0
                } ?: 0.0
                Log.d(TAG, "Today distance: $km km")
                val ret = JSObject()
                ret.put("distance", km)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getTodayDistance error: ${e.message}", e)
                val ret = JSObject()
                ret.put("distance", 0.0)
                ret.put("error", e.message)
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    fun getWeeklySteps(call: PluginCall) {
        ioScope.launch {
            try {
                val today = LocalDate.now()
                val dayFmt = DateTimeFormatter.ofPattern("EEE")
                val weekArray = JSArray()

                for (daysAgo in 6 downTo 0) {
                    val day = today.minusDays(daysAgo.toLong())
                    val dayStart = day.atStartOfDay(ZoneId.systemDefault()).toInstant()
                    val dayEnd = day.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant()

                    var daySteps = 0L
                    try {
                        val req = AggregateRequest(
                            metrics = setOf(StepsRecord.COUNT_TOTAL),
                            timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd)
                        )
                        val res = client().aggregate(req)
                        daySteps = res[StepsRecord.COUNT_TOTAL] ?: 0L
                    } catch (inner: Exception) {
                        Log.e(TAG, "Error fetching steps for $day: ${inner.message}")
                    }

                    val obj = JSObject()
                    obj.put("date", day.toString())
                    obj.put("dayName", day.format(dayFmt))
                    obj.put("steps", daySteps)
                    weekArray.put(obj)
                }

                val ret = JSObject()
                ret.put("week", weekArray)
                Log.d(TAG, "Weekly steps: ${weekArray.length()} days")
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getWeeklySteps error: ${e.message}", e)
                val ret = JSObject()
                ret.put("week", JSArray())
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        ioScope.launch {
            try {
                val grantedPermissions = client().permissionController.getGrantedPermissions()
                val allGranted = grantedPermissions.containsAll(REQUIRED_PERMISSIONS)
                Log.d(TAG, "Permissions check: $allGranted (${grantedPermissions.size} granted)")
                val ret = JSObject()
                ret.put("granted", allGranted)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "checkPermissions error: ${e.message}", e)
                val ret = JSObject()
                ret.put("granted", false)
                call.resolve(ret)
            }
        }
    }

    private fun todayRange(): Pair<Instant, Instant> {
        val start = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant()
        val end = Instant.now()
        return Pair(start, end)
    }
}
