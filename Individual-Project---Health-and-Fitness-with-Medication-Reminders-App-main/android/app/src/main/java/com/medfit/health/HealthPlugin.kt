package com.medfit.health

import android.content.Intent
import android.net.Uri
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
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
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

    private fun getClient(): HealthConnectClient? {
        return try {
            if (healthClient == null) {
                healthClient = HealthConnectClient.getOrCreate(context)
            }
            healthClient
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create HealthConnectClient: ${e.message}", e)
            null
        }
    }

    @PluginMethod
    fun checkAvailability(call: PluginCall) {
        val ret = JSObject()
        try {
            val sdkStatus = HealthConnectClient.getSdkStatus(context)
            Log.d(TAG, "SDK status code: $sdkStatus")
            when (sdkStatus) {
                HealthConnectClient.SDK_AVAILABLE -> {
                    ret.put("available", true)
                    ret.put("status", "installed")
                    healthClient = HealthConnectClient.getOrCreate(context)
                    Log.d(TAG, "Health Connect is AVAILABLE and client created")
                }
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                    ret.put("available", false)
                    ret.put("status", "update_required")
                    Log.d(TAG, "Health Connect needs UPDATE")
                }
                else -> {
                    ret.put("available", false)
                    ret.put("status", "not_installed")
                    Log.d(TAG, "Health Connect NOT INSTALLED (status=$sdkStatus)")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "checkAvailability error: ${e.message}", e)
            ret.put("available", false)
            ret.put("status", "error")
            ret.put("error", e.message ?: "Unknown error")
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun openHealthConnectSettings(call: PluginCall) {
        try {
            val intent = Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            val ret = JSObject()
            ret.put("opened", true)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "openHealthConnectSettings error: ${e.message}")
            try {
                // Fallback: open Health Connect app directly
                val intent = context.packageManager.getLaunchIntentForPackage("com.google.android.apps.healthdata")
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    val ret = JSObject()
                    ret.put("opened", true)
                    call.resolve(ret)
                } else {
                    val ret = JSObject()
                    ret.put("opened", false)
                    ret.put("error", "Health Connect app not found")
                    call.resolve(ret)
                }
            } catch (e2: Exception) {
                val ret = JSObject()
                ret.put("opened", false)
                ret.put("error", e2.message)
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        val client = getClient()
        if (client == null) {
            Log.e(TAG, "checkPermissions: client is null")
            val ret = JSObject()
            ret.put("granted", false)
            ret.put("error", "Health Connect client not available")
            call.resolve(ret)
            return
        }

        ioScope.launch {
            try {
                val grantedPermissions = client.permissionController.getGrantedPermissions()
                val allGranted = grantedPermissions.containsAll(REQUIRED_PERMISSIONS)
                Log.d(TAG, "checkPermissions: granted=$allGranted (have ${grantedPermissions.size} of ${REQUIRED_PERMISSIONS.size} required)")
                Log.d(TAG, "checkPermissions: granted permissions = $grantedPermissions")
                Log.d(TAG, "checkPermissions: required permissions = $REQUIRED_PERMISSIONS")
                val ret = JSObject()
                ret.put("granted", allGranted)
                ret.put("grantedCount", grantedPermissions.size)
                ret.put("requiredCount", REQUIRED_PERMISSIONS.size)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "checkPermissions error: ${e.message}", e)
                val ret = JSObject()
                ret.put("granted", false)
                ret.put("error", e.message)
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        try {
            val client = getClient()
            if (client == null) {
                Log.e(TAG, "requestPermissions: client is null")
                val ret = JSObject()
                ret.put("granted", false)
                ret.put("error", "Health Connect client not available")
                call.resolve(ret)
                return
            }

            Log.d(TAG, "requestPermissions: launching permission request for ${REQUIRED_PERMISSIONS.size} permissions")
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent = contract.createIntent(context, REQUIRED_PERMISSIONS)
            saveCall(call)
            startActivityForResult(call, intent, "handlePermissionResult")
        } catch (e: Exception) {
            Log.e(TAG, "requestPermissions error: ${e.message}", e)
            val ret = JSObject()
            ret.put("granted", false)
            ret.put("error", e.message)
            call.resolve(ret)
        }
    }

    @ActivityCallback
    private fun handlePermissionResult(call: PluginCall, result: ActivityResult) {
        Log.d(TAG, "handlePermissionResult: resultCode=${result.resultCode}")
        val client = getClient()
        if (client == null) {
            val ret = JSObject()
            ret.put("granted", false)
            ret.put("error", "Client unavailable after permission request")
            call.resolve(ret)
            return
        }

        ioScope.launch {
            try {
                val grantedPermissions = client.permissionController.getGrantedPermissions()
                val allGranted = grantedPermissions.containsAll(REQUIRED_PERMISSIONS)
                Log.d(TAG, "handlePermissionResult: granted=$allGranted (${grantedPermissions.size}/${REQUIRED_PERMISSIONS.size})")
                Log.d(TAG, "handlePermissionResult: grantedPermissions=$grantedPermissions")
                val ret = JSObject()
                ret.put("granted", allGranted)
                ret.put("grantedCount", grantedPermissions.size)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "handlePermissionResult error: ${e.message}", e)
                val ret = JSObject()
                ret.put("granted", false)
                ret.put("error", e.message)
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    fun getTodaySteps(call: PluginCall) {
        val client = getClient()
        if (client == null) {
            val ret = JSObject()
            ret.put("steps", 0)
            ret.put("error", "Client not available")
            call.resolve(ret)
            return
        }

        ioScope.launch {
            try {
                val (start, end) = todayRange()
                Log.d(TAG, "getTodaySteps: querying $start to $end")

                // Method 1: Aggregate query
                val request = AggregateRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end)
                )
                val result = client.aggregate(request)
                val aggregateSteps = result[StepsRecord.COUNT_TOTAL] ?: 0L
                Log.d(TAG, "getTodaySteps aggregate: $aggregateSteps")

                // Method 2: Also try reading individual records as fallback
                if (aggregateSteps == 0L) {
                    Log.d(TAG, "getTodaySteps: aggregate returned 0, trying individual records...")
                    try {
                        val readRequest = ReadRecordsRequest(
                            recordType = StepsRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(start, end)
                        )
                        val readResult = client.readRecords(readRequest)
                        var manualSum = 0L
                        for (record in readResult.records) {
                            manualSum += record.count
                            Log.d(TAG, "  StepsRecord: count=${record.count}, start=${record.startTime}, end=${record.endTime}, source=${record.metadata.dataOrigin.packageName}")
                        }
                        Log.d(TAG, "getTodaySteps individual records sum: $manualSum (${readResult.records.size} records)")

                        if (manualSum > 0) {
                            val ret = JSObject()
                            ret.put("steps", manualSum)
                            ret.put("source", "individual_records")
                            ret.put("recordCount", readResult.records.size)
                            call.resolve(ret)
                            return@launch
                        }
                    } catch (readErr: Exception) {
                        Log.e(TAG, "getTodaySteps readRecords fallback error: ${readErr.message}")
                    }
                }

                val ret = JSObject()
                ret.put("steps", aggregateSteps)
                ret.put("source", "aggregate")
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
        val client = getClient()
        if (client == null) {
            val ret = JSObject()
            ret.put("calories", 0)
            ret.put("error", "Client not available")
            call.resolve(ret)
            return
        }

        ioScope.launch {
            try {
                val (start, end) = todayRange()
                val request = AggregateRequest(
                    metrics = setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end)
                )
                val result = client.aggregate(request)
                val energy = result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]
                val kcal = energy?.inKilocalories?.toLong() ?: 0L
                Log.d(TAG, "getTodayCalories: $kcal kcal")
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
        val client = getClient()
        if (client == null) {
            val ret = JSObject()
            ret.put("distance", 0.0)
            ret.put("error", "Client not available")
            call.resolve(ret)
            return
        }

        ioScope.launch {
            try {
                val (start, end) = todayRange()
                val request = AggregateRequest(
                    metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end)
                )
                val result = client.aggregate(request)
                val distance = result[DistanceRecord.DISTANCE_TOTAL]
                val km = distance?.let {
                    Math.round(it.inMeters / 1000.0 * 100.0) / 100.0
                } ?: 0.0
                Log.d(TAG, "getTodayDistance: $km km")
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
        val client = getClient()
        if (client == null) {
            val ret = JSObject()
            ret.put("week", JSArray())
            ret.put("error", "Client not available")
            call.resolve(ret)
            return
        }

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
                        // Try aggregate first
                        val req = AggregateRequest(
                            metrics = setOf(StepsRecord.COUNT_TOTAL),
                            timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd)
                        )
                        val res = client.aggregate(req)
                        daySteps = res[StepsRecord.COUNT_TOTAL] ?: 0L

                        // If aggregate returns 0, try individual records
                        if (daySteps == 0L) {
                            val readReq = ReadRecordsRequest(
                                recordType = StepsRecord::class,
                                timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd)
                            )
                            val readRes = client.readRecords(readReq)
                            for (record in readRes.records) {
                                daySteps += record.count
                            }
                        }
                    } catch (inner: Exception) {
                        Log.e(TAG, "getWeeklySteps error for $day: ${inner.message}")
                    }

                    Log.d(TAG, "getWeeklySteps: $day = $daySteps steps")

                    val obj = JSObject()
                    obj.put("date", day.toString())
                    obj.put("dayName", day.format(dayFmt))
                    obj.put("steps", daySteps)
                    weekArray.put(obj)
                }

                val ret = JSObject()
                ret.put("week", weekArray)
                Log.d(TAG, "getWeeklySteps: returned ${weekArray.length()} days")
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getWeeklySteps error: ${e.message}", e)
                val ret = JSObject()
                ret.put("week", JSArray())
                ret.put("error", e.message)
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    fun getDataSources(call: PluginCall) {
        val client = getClient()
        if (client == null) {
            val ret = JSObject()
            ret.put("sources", JSArray())
            call.resolve(ret)
            return
        }

        ioScope.launch {
            try {
                val (start, end) = todayRange()
                // Read individual step records to see data sources
                val readRequest = ReadRecordsRequest(
                    recordType = StepsRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(
                        LocalDate.now().minusDays(7).atStartOfDay(ZoneId.systemDefault()).toInstant(),
                        end
                    )
                )
                val result = client.readRecords(readRequest)
                val sources = mutableSetOf<String>()
                for (record in result.records) {
                    sources.add(record.metadata.dataOrigin.packageName)
                }
                Log.d(TAG, "getDataSources: found ${sources.size} sources: $sources")
                
                val sourcesArray = JSArray()
                for (source in sources) {
                    sourcesArray.put(source)
                }
                val ret = JSObject()
                ret.put("sources", sourcesArray)
                ret.put("recordCount", result.records.size)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getDataSources error: ${e.message}", e)
                val ret = JSObject()
                ret.put("sources", JSArray())
                ret.put("error", e.message)
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
