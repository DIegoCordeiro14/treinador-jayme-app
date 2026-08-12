package com.coachedn.health

import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.*

/**
 * Ponte Capacitor para dados de saúde. Histórico via Health Connect;
 * FC ao vivo via Health Services (Wear). Retorna o contrato normalizado
 * definido em src/native/health/definitions.ts.
 */
@CapacitorPlugin(name = "CoachEdnHealth")
class CoachEdnHealthPlugin : Plugin() {
  private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private val reader by lazy { HealthConnectReader(context) }
  private val live by lazy { WearHealthService(context) { emitLive(it) } }

  @PluginMethod fun isAvailable(call: PluginCall) {
    val r = JSObject().put("available", reader.isAvailable()).put("platform", "android")
    call.resolve(r)
  }

  @PluginMethod fun getHealthPermissionsStatus(call: PluginCall) = scope.launch {
    val status = reader.permissionStatus()
    call.resolve(status.toJs())
  }.let {}

  @PluginMethod fun requestHealthPermissions(call: PluginCall) = scope.launch {
    reader.requestPermissions(activity)
    call.resolve(reader.permissionStatus().toJs())
  }.let {}

  @PluginMethod fun queryWorkouts(call: PluginCall) = scope.launch {
    try {
      val list = reader.queryWorkouts(call.getString("startTime")!!, call.getString("endTime")!!)
      call.resolve(JSObject().put("workouts", JSArray(list.map { it.toJs() })))
    } catch (e: Exception) { call.reject("HEALTH_QUERY_WORKOUTS", e) }
  }.let {}

  @PluginMethod fun queryWorkoutDetails(call: PluginCall) = scope.launch {
    try {
      val d = reader.queryWorkoutDetails(call.getString("externalId")!!, call.getString("startTime")!!, call.getString("endTime")!!)
      call.resolve(d.toJs())
    } catch (e: Exception) { call.reject("HEALTH_QUERY_DETAILS", e) }
  }.let {}

  @PluginMethod fun queryHeartRateSamples(call: PluginCall) = scope.launch {
    try {
      val samples = reader.readHeartRate(call.getString("startTime")!!, call.getString("endTime")!!)
      call.resolve(JSObject().put("samples", JSArray(samples.map { it.toJs() })))
    } catch (e: Exception) { call.reject("HEALTH_QUERY_HR", e) }
  }.let {}

  @PluginMethod fun queryWorkoutRoute(call: PluginCall) = scope.launch {
    try {
      val route = reader.readRoute(call.getString("externalId")!!, call.getString("startTime")!!, call.getString("endTime")!!)
      call.resolve(JSObject().put("route", JSArray(route.map { it.toJs() })))
    } catch (e: Exception) { call.reject("HEALTH_QUERY_ROUTE", e) }
  }.let {}

  @PluginMethod fun startLiveMetrics(call: PluginCall) { live.start(call.getString("sportType")); call.resolve() }
  @PluginMethod fun stopLiveMetrics(call: PluginCall) { live.stop(); call.resolve() }

  private fun emitLive(e: JSObject) { notifyListeners("liveMetrics", e) }
}
