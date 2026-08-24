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
 * FC ao vivo via Health Services (Wear OS / companion). Emite "liveMetrics".
 * Foco em FC (SampleDataPoint) para compilar de forma estável; métricas
 * cumulativas (calorias/distância) podem ser adicionadas depois.
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
    val config = ExerciseConfig.builder(ExerciseType.WORKOUT)
      .setDataTypes(setOf(DataType.HEART_RATE_BPM))
      .setIsAutoPauseAndResumeEnabled(false)
      .setIsGpsEnabled(false)
      .build()

    val cb = object : ExerciseUpdateCallback {
      override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
        val hr = update.latestMetrics.getData(DataType.HEART_RATE_BPM).lastOrNull()?.value
        val e = JSObject()
          .put("timestamp", System.currentTimeMillis().toString())
          .put("source", "wear_os")
        if (hr != null) e.put("heartRate", hr.toInt())
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
