package com.coachedn.health

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

/**
 * §22/§23 — sync incremental em background via WorkManager.
 * Cursor last_health_sync_at é mantido no app (health-sync.ts). Este worker apenas
 * dispara a leitura recente; a deduplicação/normalização é feita na camada TS.
 * Agenda: periódico (ex.: 3h) + one-shot prioritário ao finalizar treino.
 */
class HealthBackgroundSyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
  override suspend fun doWork(): Result {
    return try {
      // Lê a janela recente e entrega ao bridge/WebView (JS roda runHealthSync()).
      // Aqui apenas garante que o Health Connect foi consultado enquanto o app está fechado.
      HealthConnectReader(applicationContext).queryWorkouts(
        java.time.Instant.now().minusSeconds(6 * 3600).toString(),
        java.time.Instant.now().toString(),
      )
      Result.success()
    } catch (_: Exception) {
      Result.retry()
    }
  }

  companion object {
    fun schedulePeriodic(ctx: Context) {
      val req = PeriodicWorkRequestBuilder<HealthBackgroundSyncWorker>(3, TimeUnit.HOURS)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build()
      WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
        "coachedn_health_sync", ExistingPeriodicWorkPolicy.KEEP, req,
      )
    }
    fun runNow(ctx: Context) {
      val req = OneTimeWorkRequestBuilder<HealthBackgroundSyncWorker>()
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST).build()
      WorkManager.getInstance(ctx).enqueue(req)
    }
  }
}
