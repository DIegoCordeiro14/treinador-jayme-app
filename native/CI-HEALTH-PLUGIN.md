# (a) Verificar o deploy do Vercel + (b) Patch do CI para o plugin CoachEdnHealth

## (a) Confirmar que as modificações estão no ar (shell remoto → Vercel)
O `capacitor.config` usa `server.url: https://treinador-jayme-app.vercel.app`, então o
app carrega o site hospedado. As mudanças aparecem assim que a `main` faz deploy.

Como confirmar (qualquer um destes):
1. **Vercel** → projeto `treinador-jayme-app` → Deployments → o commit `7ce3406`
   (ou mais novo) deve estar **Ready/Production**.
2. **No app** → abrir a rota `/app/debug/health`. Essa tela só existe nos commits
   recentes; se ela abre, o shell já está servindo o código novo.
3. **No navegador** (logado) → `.../app/dashboard` deve mostrar o card
   "Seu momento — treino de hoje" quando o dia não for normal.

Se aparecer a versão antiga: force o redeploy na Vercel e feche/reabra o app
(limpar dados do app uma vez resolve cache agressivo do WebView).

## (b) Incluir o plugin CoachEdnHealth no APK — patch do android-build.yml

> ⚠️ Pré-requisito: os arquivos em `native/android/*.kt` são **scaffolding de
> referência**, não um módulo compilável ainda (faltam as data classes
> `NativeWorkout/NativeWorkoutDetails/GpsPoint/HrSample`, o `SportMap.normalize`,
> o fluxo de permissões via ActivityResult e o `.toJs()`). Adicioná-los ao build
> AGORA quebra a compilação. Complete o Kotlin e compile contra o Android SDK
> antes de ligar no CI. O caminho legado (`capacitor-health`) já entrega
> importação de atividades e FC hoje — o CoachEdnHealth adiciona FC ao vivo e
> multiesporte nativo.

Passos a ADICIONAR ao workflow (após `npx cap add android && npx cap sync android`),
somente depois que o módulo Kotlin estiver completo:

```yaml
      - name: Adicionar plugin CoachEdnHealth (nativo)
        run: |
          pkg=android/app/src/main/java/com/coachedn/health
          mkdir -p "$pkg"
          cp native/android/CoachEdnHealthPlugin.kt "$pkg/"
          cp native/android/HealthConnectReader.kt "$pkg/"
          cp native/android/WearHealthService.kt "$pkg/"
          cp native/android/HealthBackgroundSyncWorker.kt "$pkg/"
          # + criar $pkg/NativeModels.kt (data classes) e $pkg/SportMap.kt (normalizacao)

      - name: Registrar o plugin no MainActivity
        run: |
          mact=android/app/src/main/java/com/coachedn/app/MainActivity.java
          # inserir no onCreate, antes de super.onCreate:
          #   registerPlugin(com.coachedn.health.CoachEdnHealthPlugin.class);

      - name: Dependencias Gradle (Health Connect / Services / WorkManager)
        run: |
          f=android/app/build.gradle
          sed -i "/dependencies {/a \\    implementation 'androidx.health.connect:connect-client:1.1.0-alpha07'\\n    implementation 'androidx.health:health-services-client:1.1.0-alpha03'\\n    implementation 'androidx.work:work-runtime-ktx:2.9.1'" "$f"

      - name: Permissoes Health Connect completas
        run: |
          # mesclar native/android/AndroidManifest.reference.xml no manifest gerado
          # (READ_EXERCISE, READ_HEART_RATE, READ_DISTANCE, READ_*_CALORIES, READ_SPEED,
          #  READ_ELEVATION_GAINED, READ_EXERCISE_ROUTES, READ_HEALTH_DATA_IN_BACKGROUND)
```

Depois: `npx cap sync android` novamente e o `./gradlew assembleDebug` já existente.

### Recomendação
Fazer isso numa branch, rodar o workflow por `workflow_dispatch` nela, e só
promover para `main` quando o APK compilar e passar o protocolo de QA físico
(`native/REGISTRO-E-QA.md`). Não mexer no workflow verde da `main` com Kotlin
incompleto.
