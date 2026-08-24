package com.coachedn.health

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject

/**
 * Modelo normalizado devolvido pela camada nativa (espelha
 * src/native/health/definitions.ts). A camada nativa NÃO calcula fisiologia —
 * apenas transporta dados reais com timestamps preservados.
 */
data class GpsPoint(
  val timestamp: String,
  val latitude: Double,
  val longitude: Double,
  val altitude: Double? = null,
  val accuracyHorizontal: Double? = null,
  val accuracyVertical: Double? = null,
) {
  fun toJs(): JSObject = JSObject()
    .put("timestamp", timestamp)
    .put("latitude", latitude)
    .put("longitude", longitude)
    .apply { altitude?.let { put("altitude", it) } }
    .apply { accuracyHorizontal?.let { put("accuracyHorizontal", it) } }
    .apply { accuracyVertical?.let { put("accuracyVertical", it) } }
}

data class HrSample(val timestamp: String, val bpm: Int) {
  fun toJs(): JSObject = JSObject().put("timestamp", timestamp).put("bpm", bpm)
}

data class NativeWorkout(
  val externalId: String,
  val provider: String,
  val deviceName: String?,
  val sportType: String,
  val sourceSportType: String?,
  val startedAt: String,
  val endedAt: String,
  val durationSeconds: Long,
  val distanceMeters: Double?,
  val caloriesActive: Double?,
  val caloriesTotal: Double?,
  val avgHeartRate: Int?,
  val maxHeartRate: Int?,
  val cadence: Double?,
  val elevationGainMeters: Double?,
  val hasRoute: Boolean,
  val hasHeartRateSamples: Boolean,
) {
  fun toJs(): JSObject = JSObject()
    .put("externalId", externalId)
    .put("provider", provider)
    .put("deviceName", deviceName)
    .put("sportType", sportType)
    .put("sourceSportType", sourceSportType)
    .put("startedAt", startedAt)
    .put("endedAt", endedAt)
    .put("durationSeconds", durationSeconds)
    .apply { distanceMeters?.let { put("distanceMeters", it) } }
    .apply { caloriesActive?.let { put("caloriesActive", it) } }
    .apply { caloriesTotal?.let { put("caloriesTotal", it) } }
    .apply { avgHeartRate?.let { put("avgHeartRate", it) } }
    .apply { maxHeartRate?.let { put("maxHeartRate", it) } }
    .apply { cadence?.let { put("cadence", it) } }
    .apply { elevationGainMeters?.let { put("elevationGainMeters", it) } }
    .put("hasRoute", hasRoute)
    .put("hasHeartRateSamples", hasHeartRateSamples)
}

data class NativeWorkoutDetails(
  val workout: NativeWorkout,
  val route: List<GpsPoint>,
  val heartRateSamples: List<HrSample>,
) {
  fun toJs(): JSObject {
    val js = workout.toJs()
    js.put("route", JSArray(route.map { it.toJs() }))
    js.put("heartRateSamples", JSArray(heartRateSamples.map { it.toJs() }))
    return js
  }
}

data class PermStatus(val available: Boolean, val granted: Boolean, val missing: List<String>) {
  fun toJs(): JSObject = JSObject()
    .put("available", available)
    .put("granted", granted)
    .put("missing", JSArray(missing))
}
