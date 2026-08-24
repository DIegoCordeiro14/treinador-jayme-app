package com.coachedn.health

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Ponte Capacitor "CoachEdnHealth". Histórico via Health Connect; FC ao vivo via
 * Health Services (Wear). Devolve o contrato normalizado (definitions.ts).
 */
@CapacitorPlugin(name = "CoachEdnHealth")
class CoachEdnHealthPlugin : Plugin() {

  private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private val reader by lazy { HealthConnectReader(context) }

  @PluginMethod
  fun isAvailable(call: PluginCall) {
    call.resolve(JSObject().put("available", reader.isAvailable()).put("platform", "android"))
  }

  @PluginMethod
  fun getHealthPermissionsStatus(call: PluginCall) {
    scope.launch {
      try { call.resolve(reader.permissionStatus().toJs()) }
      catch (e: Exception) { call.reject("HEALTH_PERMISSIONS", e) }
    }
  }

  @PluginMethod
  fun requestHealthPermissions(call: PluginCall) {
    // O fluxo de request usa ActivityResultContract registrado no MainActivity.
    // Aqui devolvemos o status atual; a UI dispara a tela de permissões do HC.
    scope.launch {
      try { call.resolve(reader.permissionStatus().toJs()) }
      catch (e: Exception) { call.reject("HEALTH_PERMISSIONS", e) }
    }
  }

  @PluginMethod
  fun queryWorkouts(call: PluginCall) {
    val start = call.getString("startTime") ?: return call.reject("startTime obrigatório")
    val end = call.getString("endTime") ?: return call.reject("endTime obrigatório")
    scope.launch {
      try {
        val list = reader.queryWorkouts(start, end)
        call.resolve(JSObject().put("workouts", JSArray(list.map { it.toJs() })))
      } catch (e: Exception) { call.reject("HEALTH_QUERY_WORKOUTS", e) }
    }
  }

  @PluginMethod
  fun queryWorkoutDetails(call: PluginCall) {
    val id = call.getString("externalId") ?: return call.reject("externalId obrigatório")
    val start = call.getString("startTime") ?: return call.reject("startTime obrigatório")
    val end = call.getString("endTime") ?: return call.reject("endTime obrigatório")
    scope.launch {
      try { call.resolve(reader.queryWorkoutDetails(id, start, end).toJs()) }
      catch (e: Exception) { call.reject("HEALTH_QUERY_DETAILS", e) }
    }
  }

  @PluginMethod
  fun queryHeartRateSamples(call: PluginCall) {
    val start = call.getString("startTime") ?: return call.reject("startTime obrigatório")
    val end = call.getString("endTime") ?: return call.reject("endTime obrigatório")
    scope.launch {
      try {
        val samples = reader.readHeartRate(start, end)
        call.resolve(JSObject().put("samples", JSArray(samples.map { it.toJs() })))
      } catch (e: Exception) { call.reject("HEALTH_QUERY_HR", e) }
    }
  }

  @PluginMethod
  fun queryWorkoutRoute(call: PluginCall) {
    val id = call.getString("externalId") ?: return call.reject("externalId obrigatório")
    val start = call.getString("startTime") ?: return call.reject("startTime obrigatório")
    val end = call.getString("endTime") ?: return call.reject("endTime obrigatório")
    scope.launch {
      try {
        val route = reader.readRoute(id, start, end)
        call.resolve(JSObject().put("route", JSArray(route.map { it.toJs() })))
      } catch (e: Exception) { call.reject("HEALTH_QUERY_ROUTE", e) }
    }
  }

  // FC ao vivo (Health Services) exige minSdk 30 — desativado neste build (minSdk 26).
  // Sera adicionado em um build voltado ao Wear OS. Stubs mantem o contrato.
  @PluginMethod
  fun startLiveMetrics(call: PluginCall) { call.resolve() }

  @PluginMethod
  fun stopLiveMetrics(call: PluginCall) { call.resolve() }
}
