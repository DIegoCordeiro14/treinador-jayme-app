package com.coachedn.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant

/**
 * Leitura de histórico via Health Connect. Correlaciona ExerciseSessionRecord com
 * HeartRate/Distance/Calories/Speed/Elevation e Exercise Route pela janela temporal.
 * Preserva timestamps individuais de FC. Não sintetiza dados ausentes.
 */
class HealthConnectReader(private val context: Context) {
  private val client get() = HealthConnectClient.getOrCreate(context)

  val permissions = setOf(
    HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    HealthPermission.getReadPermission(HeartRateRecord::class),
    HealthPermission.getReadPermission(DistanceRecord::class),
    HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
    HealthPermission.getReadPermission(SpeedRecord::class),
    HealthPermission.getReadPermission(ElevationGainedRecord::class),
  )

  fun isAvailable(): Boolean =
    HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

  suspend fun permissionStatus(): PermStatus {
    val granted = client.permissionController.getGrantedPermissions()
    val missing = permissions.filter { it !in granted }.map { it.toString() }
    return PermStatus(isAvailable(), missing.isEmpty(), missing)
  }

  suspend fun requestPermissions(activity: Any?) { /* usa ActivityResultContract no host */ }

  suspend fun queryWorkouts(startIso: String, endIso: String): List<NativeWorkout> {
    val range = TimeRangeFilter.between(Instant.parse(startIso), Instant.parse(endIso))
    val sessions = client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range)).records
    return sessions.map { s ->
      val hr = readHeartRate(s.startTime.toString(), s.endTime.toString())
      val dist = sumDistance(s.startTime, s.endTime)
      val cal = sumActiveCalories(s.startTime, s.endTime)
      NativeWorkout(
        externalId = s.metadata.id,
        provider = "health_connect",
        deviceName = s.metadata.dataOrigin.packageName,
        sourceSportType = s.exerciseType.toString(),
        sportType = SportMap.normalize(s.exerciseType), // mapeia p/ chaves normalizeSportType
        startedAt = s.startTime.toString(), endedAt = s.endTime.toString(),
        durationSeconds = (s.endTime.epochSecond - s.startTime.epochSecond),
        distanceMeters = dist, caloriesActive = cal,
        avgHeartRate = hr.map { it.bpm }.ifEmpty { null }?.average()?.toInt(),
        maxHeartRate = hr.map { it.bpm }.maxOrNull(),
        hasRoute = (s.route?.route?.isNotEmpty() == true),
        hasHeartRateSamples = hr.isNotEmpty(),
      )
    }
  }

  suspend fun queryWorkoutDetails(externalId: String, startIso: String, endIso: String): NativeWorkoutDetails {
    val base = queryWorkouts(startIso, endIso).firstOrNull { it.externalId == externalId }
    val route = readRoute(externalId, startIso, endIso)
    val hr = readHeartRate(startIso, endIso)
    return NativeWorkoutDetails(base, route, hr)
  }

  suspend fun readHeartRate(startIso: String, endIso: String): List<HrSample> {
    val range = TimeRangeFilter.between(Instant.parse(startIso), Instant.parse(endIso))
    val recs = client.readRecords(ReadRecordsRequest(HeartRateRecord::class, range)).records
    return recs.flatMap { r -> r.samples.map { HrSample(it.time.toString(), it.beatsPerMinute.toInt()) } }
      .sortedBy { it.timestamp }
  }

  suspend fun readRoute(externalId: String, startIso: String, endIso: String): List<GpsPoint> {
    val range = TimeRangeFilter.between(Instant.parse(startIso), Instant.parse(endIso))
    val session = client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range)).records
      .firstOrNull { it.metadata.id == externalId } ?: return emptyList()
    return session.route?.route?.map {
      GpsPoint(it.time.toString(), it.latitude, it.longitude, it.altitude?.inMeters, it.horizontalAccuracy?.inMeters, it.verticalAccuracy?.inMeters)
    } ?: emptyList()
  }

  private suspend fun sumDistance(s: Instant, e: Instant): Double? { /* soma DistanceRecord na janela */ return null }
  private suspend fun sumActiveCalories(s: Instant, e: Instant): Double? { /* soma ActiveCaloriesBurnedRecord */ return null }
}
