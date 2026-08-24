package com.coachedn.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant

/**
 * Leitura de histórico via Health Connect. Correlaciona a sessão de exercício com
 * FC/distância/calorias/elevação e a Exercise Route pela janela temporal.
 * Preserva timestamps individuais de FC. Não sintetiza dados ausentes.
 */
class HealthConnectReader(private val context: Context) {

  private val client: HealthConnectClient get() = HealthConnectClient.getOrCreate(context)

  val permissions: Set<String> = setOf(
    HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    HealthPermission.getReadPermission(HeartRateRecord::class),
    HealthPermission.getReadPermission(DistanceRecord::class),
    HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
    HealthPermission.getReadPermission(ElevationGainedRecord::class),
  )

  fun isAvailable(): Boolean =
    HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

  fun permissionRequestContract() = PermissionController.createRequestPermissionResultContract()

  suspend fun permissionStatus(): PermStatus {
    if (!isAvailable()) return PermStatus(false, false, permissions.toList())
    val granted = client.permissionController.getGrantedPermissions()
    val missing = permissions.filter { it !in granted }
    return PermStatus(true, missing.isEmpty(), missing)
  }

  private suspend fun heartRateWindow(start: Instant, end: Instant): List<HrSample> {
    val recs = client.readRecords(
      ReadRecordsRequest(HeartRateRecord::class, TimeRangeFilter.between(start, end))
    ).records
    return recs.flatMap { r -> r.samples.map { HrSample(it.time.toString(), it.beatsPerMinute.toInt()) } }
      .sortedBy { it.timestamp }
  }

  private suspend fun sumDistanceMeters(start: Instant, end: Instant): Double? {
    val recs = client.readRecords(
      ReadRecordsRequest(DistanceRecord::class, TimeRangeFilter.between(start, end))
    ).records
    if (recs.isEmpty()) return null
    return recs.sumOf { it.distance.inMeters }
  }

  private suspend fun sumActiveCalories(start: Instant, end: Instant): Double? {
    val recs = client.readRecords(
      ReadRecordsRequest(ActiveCaloriesBurnedRecord::class, TimeRangeFilter.between(start, end))
    ).records
    if (recs.isEmpty()) return null
    return recs.sumOf { it.energy.inKilocalories }
  }

  private suspend fun sumElevationMeters(start: Instant, end: Instant): Double? {
    return try {
      val recs = client.readRecords(
        ReadRecordsRequest(ElevationGainedRecord::class, TimeRangeFilter.between(start, end))
      ).records
      if (recs.isEmpty()) null else recs.sumOf { it.elevation.inMeters }
    } catch (_: Exception) { null }
  }

  private fun routeOf(session: ExerciseSessionRecord): List<GpsPoint> {
    return try {
      val route = session.route ?: return emptyList()
      route.route.map { loc ->
        GpsPoint(
          timestamp = loc.time.toString(),
          latitude = loc.latitude,
          longitude = loc.longitude,
          altitude = loc.altitude?.inMeters,
          accuracyHorizontal = loc.horizontalAccuracy?.inMeters,
          accuracyVertical = loc.verticalAccuracy?.inMeters,
        )
      }
    } catch (_: Exception) { emptyList() }
  }

  private suspend fun mapSession(s: ExerciseSessionRecord): NativeWorkout {
    val hr = heartRateWindow(s.startTime, s.endTime)
    val dist = sumDistanceMeters(s.startTime, s.endTime)
    val cal = sumActiveCalories(s.startTime, s.endTime)
    val elev = sumElevationMeters(s.startTime, s.endTime)
    val bpms = hr.map { it.bpm }
    val hasRoute = try { s.route?.route?.isNotEmpty() == true } catch (_: Exception) { false }
    return NativeWorkout(
      externalId = s.metadata.id,
      provider = "health_connect",
      deviceName = s.metadata.dataOrigin.packageName,
      sportType = SportMap.keyword(s.exerciseType),
      sourceSportType = SportMap.rawName(s.exerciseType),
      startedAt = s.startTime.toString(),
      endedAt = s.endTime.toString(),
      durationSeconds = (s.endTime.epochSecond - s.startTime.epochSecond),
      distanceMeters = dist,
      caloriesActive = cal,
      caloriesTotal = null,
      avgHeartRate = if (bpms.isNotEmpty()) bpms.average().toInt() else null,
      maxHeartRate = bpms.maxOrNull(),
      cadence = null,
      elevationGainMeters = elev,
      hasRoute = hasRoute,
      hasHeartRateSamples = hr.isNotEmpty(),
    )
  }

  suspend fun queryWorkouts(startIso: String, endIso: String): List<NativeWorkout> {
    val range = TimeRangeFilter.between(Instant.parse(startIso), Instant.parse(endIso))
    val sessions = client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range)).records
    return sessions.map { mapSession(it) }
  }

  suspend fun queryWorkoutDetails(externalId: String, startIso: String, endIso: String): NativeWorkoutDetails {
    val range = TimeRangeFilter.between(Instant.parse(startIso), Instant.parse(endIso))
    val sessions = client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range)).records
    val s = sessions.firstOrNull { it.metadata.id == externalId } ?: sessions.firstOrNull()
      ?: return NativeWorkoutDetails(
        NativeWorkout(externalId, "health_connect", null, "other", null, startIso, endIso, 0, null, null, null, null, null, null, null, false, false),
        emptyList(), emptyList()
      )
    val workout = mapSession(s)
    return NativeWorkoutDetails(workout, routeOf(s), heartRateWindow(s.startTime, s.endTime))
  }

  suspend fun readHeartRate(startIso: String, endIso: String): List<HrSample> =
    heartRateWindow(Instant.parse(startIso), Instant.parse(endIso))

  suspend fun readRoute(externalId: String, startIso: String, endIso: String): List<GpsPoint> =
    queryWorkoutDetails(externalId, startIso, endIso).route
}
