import { wearableToMetrics, cardioToMetrics, nutritionToMetrics } from '../src/lib/athlete-data/athlete-metrics-collector';
import { resolveMetrics } from '../src/lib/athlete-data/data-resolution-engine';
let pass=0, fail=0;
const ok=(n:string,c:boolean,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('FAIL  '+n+(x?'  » '+x:''));}};

// wearable → recuperação/FC
{
  const ms=wearableToMetrics([{recorded_at:'2026-09-24T07:00:00Z',source:'Garmin',resting_hr:58,hrv_ms:72,sleep_hours:7.5,training_readiness:81,stress_score:30}]);
  const keys=ms.map(m=>m.metric);
  ok('wearable gera RHR/HRV/sono/recovery/stress', ['restingHeartRate','hrv','sleepHours','recoveryScore','stress'].every(k=>keys.includes(k as any)), keys.join(','));
  ok('wearable vira fonte "wearable"', ms.every(m=>m.source==='wearable'));
}
// health connect provider
{
  const ms=wearableToMetrics([{recorded_at:'2026-09-24T07:00:00Z',source:'health_connect',resting_hr:60}]);
  ok('provider health connect → health_connect', ms[0].source==='health_connect');
}
// cardio → pace derivado
{
  const ms=cardioToMetrics([{performed_at:'2026-09-24T06:00:00Z',source_provider:'Strava',distance_km:10,duration_min:60,avg_hr:150,max_hr:175,calories_burned:600,elevation_gain_m:120}]);
  const pace=ms.find(m=>m.metric==='pace');
  ok('cardio deriva pace = 6 min/km', pace?.value===6, JSON.stringify(pace));
  ok('cardio inclui distância/duração/FC', ['cardioDistanceKm','cardioDurationMin','avgHr','maxHr','cardioCalories','elevationM'].every(k=>ms.some(m=>m.metric===k)));
}
// cardio deletado é ignorado
{
  ok('cardio deletado ignorado', cardioToMetrics([{performed_at:'x',distance_km:5,deleted_at:'2026-09-01'}]).length===0);
}
// nutrição soma do dia
{
  const rows=[
    {log_date:'2026-09-24',logged_at:'2026-09-24T12:00:00Z',calories_kcal:500,protein_g:40,carbs_g:50,fat_g:15},
    {log_date:'2026-09-24',logged_at:'2026-09-24T19:00:00Z',calories_kcal:700,protein_g:50,carbs_g:60,fat_g:20},
    {log_date:'2026-09-23',calories_kcal:999,protein_g:1,carbs_g:1,fat_g:1},
  ];
  const ms=nutritionToMetrics(rows,'2026-09-24');
  const kcal=ms.find(m=>m.metric==='calories');
  ok('nutrição soma só o dia (1200 kcal)', kcal?.value===1200, JSON.stringify(kcal));
  ok('nutrição source=nutrition', ms.every(m=>m.source==='nutrition'));
}
// integração: resolver sobre a coleta multi-domínio
{
  const all=[...wearableToMetrics([{recorded_at:'2026-09-24T07:00:00Z',source:'Garmin',resting_hr:58,sleep_hours:7.5}]), ...nutritionToMetrics([{log_date:'2026-09-24',logged_at:'x',calories_kcal:2000,protein_g:150,carbs_g:200,fat_g:60}],'2026-09-24')];
  const r=resolveMetrics(all);
  ok('resolve multi-domínio (RHR + sono + calorias + macros)', Object.keys(r).length>=4, Object.keys(r).join(','));
}
console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail===0?0:1);
