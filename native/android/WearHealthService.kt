package com.coachedn.health

import android.content.Context
import androidx.health.services.client.ExerciseClient
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import com.getcapacitor.JSObject

/**
 * FC/calorias/distância/velocidade ao vivo via Health Services (Wear OS / companion).
 * Emite eventos "liveMetrics" para a WebView. NÃO substitui o histórico do Health Connect.
 * Best-effort: em telefones sem Health Services o start() falha silenciosamente.
 */
class WearHealthService(
  private val context: Context,
  private val emit: (JSObject) -> Unit,
) {
  private val exerciseClient: ExerciseClient by lazy {
    HealthServices.getClient(context).exerciseClient
  }
  private var callback: ExerciseUpdateCallback? = null

  fun start(sportType: String?) {
    val dataTypes = setOf(
      DataType.HEART_RATE_BPM,
      DataType.CALORIES_TOTAL,
      DataType.DISTANCE_TOTAL,
      DataType.SPEED,
    )
    val config = ExerciseConfig.builder(ExerciseType.WORKOUT)
      .setDataTypes(dataTypes)
      .setIsAutoPauseAndResumeEnabled(false)
      .setIsGpsEnabled(false)
      .build()

    val cb = object : ExerciseUpdateCallback {
      override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
        val e = JSObject()
          .put("timestamp", System.currentTimeMillis().toString())
          .put("source", "wear_os")
        val hr = update.latestMetrics.getData(DataType.HEART_RATE_BPM).lastOrNull()?.value
        if (hr != null) e.put("heartRate", hr.toInt())
        val cal = update.latestMetrics.getData(DataType.CALORIES_TOTAL).lastOrNull()?.total
        if (cal != null) e.put("calories", cal)
        val dist = update.latestMetrics.getData(DataType.DISTANCE_TOTAL).lastOrNull()?.total
        if (dist != null) e.put("distanceMeters", dist)
        val spd = update.latestMetrics.getData(DataType.SPEED).lastOrNull()?.value
        if (spd != null) e.put("speedMps", spd)
        emit(e)
      }
      override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
      override fun onRegistered() {}
      override fun onRegistrationFailed(throwable: Throwable) {}
      override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
    }
    callback = cb
    exerciseClient.setUpdateCallback(cb)
    exerciseClient.startExerciseAsync(config)
  }

  fun stop() {
    try { exerciseClient.endExerciseAsync() } catch (_: Exception) {}
    callback = null
  }
}
