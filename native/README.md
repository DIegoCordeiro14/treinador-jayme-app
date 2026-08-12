# Coach EDN — Native Data Bridge (referência)

Arquivos de referência para o **wrapper Capacitor** (repositório do APK/iOS), não fazem
parte do build Next.js. Copie para o projeto nativo e registre o plugin `CoachEdnHealth`.

- `android/` — Health Connect (histórico) + Health Services / Wear (FC ao vivo).
- `ios/` — HealthKit (histórico + rota) + HKLiveWorkoutBuilder (FC ao vivo).

O contrato TypeScript vive em `src/native/health/definitions.ts`. A camada nativa só
**transporta** dados reais (timestamps preservados); toda fisiologia é calculada pelos
motores determinísticos (`strength-physiology.ts`, `endurance-engine`, etc.).

## Registro (capacitor)
Android: adicione `CoachEdnHealthPlugin` ao `MainActivity` (`registerPlugin`).
iOS: o plugin é auto-descoberto via `@objc(CoachEdnHealthPlugin)`.

## Permissões Android (AndroidManifest / Health Connect)
READ_EXERCISE, READ_HEART_RATE, READ_DISTANCE, READ_ACTIVE_CALORIES_BURNED,
READ_TOTAL_CALORIES_BURNED, READ_SPEED, READ_ELEVATION_GAINED, READ_EXERCISE_ROUTE.
Background: `READ_HEALTH_DATA_IN_BACKGROUND` + WorkManager.

## Não fazer
- Não sintetizar rota/FC quando o provider não forneceu.
- Não usar histórico do Health Connect como streaming ao vivo.
- Não criar dependência nova em Google Fit (em descontinuação) — priorize Health Connect.
- Nunca embarcar `client_secret` do Strava no app (troca de token no backend).
