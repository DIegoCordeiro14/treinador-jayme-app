# Coach EDN — Registro do plugin nativo + Protocolo de QA físico (§32/§33)

Estes passos rodam no **repositório do wrapper Capacitor** (projeto do APK/iOS), não no
repositório Next.js. O código TS já consome o contrato `CoachEdnHealth` (ver
`src/native/health/`), então basta registrar o plugin e validar em aparelho.

## Registro — Android
1. Copiar `native/android/*.kt` para `android/app/src/main/java/com/coachedn/health/`.
2. Mesclar `native/android/AndroidManifest.reference.xml` no manifest do app.
3. Registrar o plugin no `MainActivity.java/kt`: `registerPlugin(CoachEdnHealthPlugin.class)`.
4. Agendar o sync em background: `HealthBackgroundSyncWorker.schedulePeriodic(context)` no boot do app
   e `HealthBackgroundSyncWorker.runNow(context)` ao finalizar um treino.
5. Dependências Gradle: `androidx.health.connect:connect-client`, `androidx.health:health-services-client`, `androidx.work:work-runtime-ktx`.

## Registro — iOS
1. Copiar `native/ios/*.swift` para o target do app.
2. Mesclar `native/ios/Info.reference.plist` no `Info.plist`.
3. Ativar capabilities: HealthKit (+ Background Delivery), Location (Background), Workout Processing.
4. O plugin é autodescoberto via `@objc(CoachEdnHealthPlugin)`.

## Protocolo de QA físico (obrigatório — §27/§33)
Marcar cada item só após validar em **aparelho real** com relógio pareado.

### Teste 1 — Força (treino de 60 min com relógio)
- [ ] Treino identificado e casado com a sessão do Coach (sem cardio duplicado).
- [ ] BPMs importados com timestamp.
- [ ] FC por série calculada (avg/max/%FCmax/zona) via `strength-physiology`.
- [ ] Calorias importadas.
- [ ] Enriquecimento retroativo funciona quando o relógio sincroniza depois (fila com backoff).

### Teste 2 — Corrida
- [ ] Distância, rota, pontos GPS, FC temporal, FC média/máx.
- [ ] Mapa e replay corretos; sem teleporte/spikes no traçado exibido (auditoria `gps-track-audit`).

### Teste 3 — Ciclismo
- [ ] Classificação, distância, FC, rota (quando disponível).

### Teste 4 — HIIT
- [ ] Classificação, duração, FC, calorias.

### Teste 5 — Natação
- [ ] Apenas os dados realmente disponibilizados pelo provider.

### Background / robustez
- [ ] Tela bloqueada: tracker segue contando por timestamp.
- [ ] Minimizar/voltar: sessão retomável.
- [ ] Perder e recuperar conexão: fila offline reenvia sem duplicar.

## Critérios de aceite (§29/§34)
Não aceitar: dados duplicados, FC inventada, rota falsa, distância negativa, GPS teleportando,
cargas inventadas, reps fora do intervalo, alterações automáticas sem confirmação, plano/atividade duplicados.

> `tsc --noEmit` limpo é pré-requisito, **não** é evidência de integração concluída.
> A integração só está concluída quando os itens acima passam em dispositivo físico.
