package com.coachedn.health

import android.content.Context
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.*
import com.getcapacitor.JSObject

/**
 * FC/calorias/distância/velocidade ao vivo via Health Services (Wear OS / companion).
 * Emite eventos "liveMetrics" para a WebView. NÃO substitui o histórico do Health Connect.
 */
class WearHealthService(private val context: Context, private val emit: (JSObject) -> Unit) {
  private val client by lazy { HealthServices.getClient(context).exerciseClient }

  fun start(sportType: String?) {
    val config = ExerciseConfig.builder(ExerciseType.WORKOUT)
      .setDataTypes(setOf(DataType.HEART_RATE_BPM, DataType.CALORIES_TOTAL, DataType.DISTANCE_TOTAL, DataType.SPEED))
      .setIsAutoPauseAndResumeEnabled(false)
      .build()
    client.setUpdateCallback(object : ExerciseUpdateCallback {
      override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
        val hr = update.latestMetrics.getData(DataType.HEART_RATE_BPM).lastOrNull()?.value
        val e = JSObject()
          .put("timestamp", System.currentTimeMillis().toString())
          .put("source", "wear_os")
        if (hr != null) e.put("heartRate", hr)
        emit(e)
      }
      override fun onLapSummaryReceived(summary: ExerciseLapSummary) {}
      override fun onRegistered() {}
      override fun onRegistrationFailed(throwable: Throwable) {}
      override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
    })
    client.startExerciseAsync(config)
  }

  fun stop() { client.endExerciseAsync() }
}
