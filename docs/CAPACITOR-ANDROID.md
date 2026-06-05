# Coach EDN — Build Nativo (Capacitor) · V6.2 Pilares 4–8

Guia para transformar o Coach EDN em app **Android (APK/AAB)** e **iOS (IPA)**,
com GPS em background (Pilares 5–6) e integrações nativas de saúde (Pilares 7–8).

> Estratégia: **shell nativo com URL remota** — o app Capacitor carrega
> `https://treinador-jayme-app.vercel.app` dentro de uma WebView nativa.
> Vantagens: zero mudança no Next.js (APIs server continuam no Vercel),
> deploys continuam instantâneos, e os plugins nativos (GPS background,
> HealthKit, Health Connect) ficam disponíveis via `window.Capacitor`.
> O `src/lib/integrations/wearable-hub.ts` e o tracker já detectam o shell.

---

## 1. Pré-requisitos (sua máquina)

- Node 18+
- **Android Studio** (SDK 34+) — para APK/AAB
- **Xcode 15+ num Mac** — apenas para o IPA iOS
- Conta Google Play Console (US$ 25 único) · Apple Developer (US$ 99/ano)

## 2. Instalar o Capacitor no projeto

```bash
git clone https://github.com/DIegoCordeiro14/treinador-jayme-app
cd treinador-jayme-app
npm install
npm install @capacitor/core @capacitor/cli @capacitor/geolocation
npm install @capacitor-community/background-geolocation   # GPS background (Pilar 5/6)
npm install capacitor-health-connect                       # Health Connect (Pilar 7)
npm install @perfood/capacitor-healthkit                   # HealthKit (Pilar 8)
npx cap init "Coach EDN" "com.coachedn.app" --web-dir public
```

## 3. capacitor.config.ts (criar na raiz)

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coachedn.app',
  appName: 'Coach EDN',
  webDir: 'public', // placeholder — usamos URL remota
  server: {
    url: 'https://treinador-jayme-app.vercel.app',
    cleartext: false,
  },
  plugins: {
    Geolocation: { permissions: ['location'] },
  },
};

export default config;
```

> Se o build do Next/Vercel reclamar do arquivo, adicione `capacitor.config.ts`
> ao `exclude` do `tsconfig.json`.

## 4. Android — APK/AAB (Pilares 4, 5, 6, 7)

```bash
npx cap add android
```

### 4.1 Permissões — `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.health.READ_STEPS" />
<uses-permission android:name="android.permission.health.READ_SLEEP" />
<uses-permission android:name="android.permission.health.READ_HEART_RATE" />
<uses-permission android:name="android.permission.health.READ_RESTING_HEART_RATE" />
<uses-permission android:name="android.permission.health.READ_TOTAL_CALORIES_BURNED" />
<uses-permission android:name="android.permission.health.READ_HEART_RATE_VARIABILITY" />
```

O plugin `@capacitor-community/background-geolocation` cria automaticamente o
**Foreground Service** com notificação persistente ("Coach EDN — gravando
corrida"), mantendo GPS + cronômetro ativos com a tela bloqueada (Pilar 6).

### 4.2 Build

```bash
npx cap sync android
npx cap open android   # abre o Android Studio
```

No Android Studio:
- **APK de teste**: Build → Build Bundle(s)/APK(s) → Build APK(s)
  → `android/app/build/outputs/apk/debug/app-debug.apk`
- **AAB para a Play Store**: Build → Generate Signed Bundle → criar keystore
  (GUARDE o keystore e a senha!) → upload no Play Console.

## 5. iOS — IPA (Pilares 4, 5, 6, 8) — requer Mac

```bash
npx cap add ios && npx cap sync ios && npx cap open ios
```

No Xcode → target App → **Signing & Capabilities**:
- Adicionar **Background Modes** → marcar `Location updates` (Pilar 5/6)
- Adicionar **HealthKit** (Pilar 8)

`ios/App/App/Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array><string>location</string></array>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>O Coach EDN usa sua localização para registrar corridas com precisão, inclusive em segundo plano.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>O Coach EDN usa sua localização para registrar suas corridas.</string>
<key>NSHealthShareUsageDescription</key>
<string>O Coach EDN lê HRV, sono e FC para ajustar seus treinos automaticamente.</string>
```

Build: Product → Archive → Distribute (TestFlight/App Store).

## 6. GPS profissional no shell (Pilar 5)

No app nativo, o tracker usa o plugin de background no lugar do
`watchPosition` web. Integração (já preparada para o futuro — o tracker web
continua funcionando como fallback):

```ts
import { registerPlugin } from '@capacitor/core';
const BackgroundGeolocation = registerPlugin<any>('BackgroundGeolocation');

const watcherId = await BackgroundGeolocation.addWatcher(
  {
    backgroundMessage: 'Coach EDN está gravando sua corrida',
    backgroundTitle: 'Corrida em andamento',
    requestPermissions: true,
    stale: false,
    distanceFilter: 3, // metros — densidade similar ao Strava
  },
  (location) => {
    // mesmo pipeline do tracker: evaluatePoint() + Haversine + persistência
  },
);
// ao finalizar: BackgroundGeolocation.removeWatcher({ id: watcherId });
```

O motor de distância (`src/lib/edn/run-tracking.ts`), a persistência
(`active_cardio_sessions` + `cardio_gps_points`) e o `resumeTracking()`
são os MESMOS do web — só muda a fonte dos pontos. Meta de erro <3% validável
com `src/lib/edn/gps-validation.ts`.

## 7. Saúde nativa (Pilares 7–8)

`src/lib/integrations/wearable-hub.ts` já contém:
- `autoSync()` — detecta a plataforma e sincroniza HealthKit (iOS) ou
  Health Connect (Android) → normaliza → `POST /api/wearable-sync` →
  Recovery Engine usa com prioridade sobre a anamnese.
- Registro oficial de fontes suportadas e **blocklist** (DT Ultra, HK Series,
  clones sem API — nunca integrar).
- Garmin/Fitbit/Polar/Coros/Suunto: adapters cloud aguardando as credenciais
  OAuth de desenvolvedor (registre os apps e configure no Vercel:
  `GARMIN_CLIENT_ID/SECRET`, `FITBIT_CLIENT_ID/SECRET`, …).

Chame `autoSync()` na abertura do app (ex.: layout do dashboard) — no
navegador ele degrada graciosamente para a mensagem do token pessoal.

## 8. Checklist de publicação

- [ ] Ícone 512px + splash (use `@capacitor/assets`: `npx capacitor-assets generate`)
- [ ] Keystore Android criado e guardado em local seguro
- [ ] Play Console: ficha da loja + declaração de permissões de localização em background (exige justificativa em vídeo)
- [ ] App Store: revisão do uso de HealthKit + Background Location
- [ ] Testar critério de aceitação V6.6: corrida com tela bloqueada do início ao fim, erro <3% vs Strava
