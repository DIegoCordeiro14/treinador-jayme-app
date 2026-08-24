package com.coachedn.health

import androidx.health.connect.client.records.ExerciseSessionRecord as ESR

/**
 * Mapeia o exerciseType (Int) do Health Connect para uma palavra-chave em inglês
 * que o normalizeSportType() do TS reconhece (regex). Mantém o valor original em
 * sourceSportType para auditoria. Não filtra por modalidade — devolve tudo.
 */
object SportMap {
  fun keyword(exerciseType: Int): String = when (exerciseType) {
    ESR.EXERCISE_TYPE_RUNNING, ESR.EXERCISE_TYPE_RUNNING_TREADMILL -> "running"
    ESR.EXERCISE_TYPE_WALKING -> "walking"
    ESR.EXERCISE_TYPE_HIKING -> "hiking"
    ESR.EXERCISE_TYPE_BIKING -> "cycling"
    ESR.EXERCISE_TYPE_BIKING_STATIONARY -> "cycling"
    ESR.EXERCISE_TYPE_SWIMMING_POOL, ESR.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swimming"
    ESR.EXERCISE_TYPE_ROWING, ESR.EXERCISE_TYPE_ROWING_MACHINE -> "rowing"
    ESR.EXERCISE_TYPE_ELLIPTICAL -> "elliptical"
    ESR.EXERCISE_TYPE_STRENGTH_TRAINING, ESR.EXERCISE_TYPE_WEIGHTLIFTING -> "strength"
    ESR.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "hiit"
    ESR.EXERCISE_TYPE_CALISTHENICS -> "functional"
    ESR.EXERCISE_TYPE_YOGA -> "yoga"
    ESR.EXERCISE_TYPE_STRETCHING -> "mobility"
    ESR.EXERCISE_TYPE_SOCCER -> "soccer"
    ESR.EXERCISE_TYPE_FUTSAL -> "futsal"
    ESR.EXERCISE_TYPE_BASKETBALL -> "basketball"
    ESR.EXERCISE_TYPE_VOLLEYBALL -> "volleyball"
    ESR.EXERCISE_TYPE_TENNIS -> "tennis"
    ESR.EXERCISE_TYPE_BOXING -> "boxing"
    ESR.EXERCISE_TYPE_MARTIAL_ARTS -> "martial arts"
    else -> "other"
  }

  fun rawName(exerciseType: Int): String = "EXERCISE_TYPE_$exerciseType"
}
