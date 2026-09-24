import { buildCurrentAthleteSnapshot } from '../src/lib/athlete-data/current-athlete-snapshot';
import { resolveMetrics } from '../src/lib/athlete-data/data-resolution-engine';
import type { MetricMeasurement } from '../src/lib/athlete-data/data-resolution-engine';
let pass=0, fail=0;
const ok=(n:string,c:boolean,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('FAIL  '+n+(x?'  » '+x:''));}};
const iso=(d:number)=>new Date(Date.now()-d*86400000).toISOString();

const ms:MetricMeasurement[]=[
  {metric:'weight',value:90.7,source:'wearable',measuredAt:iso(0)},
  {metric:'bodyFat',value:28.8,source:'bioimpedance',measuredAt:iso(2)},
  {metric:'sleepHours',value:7.5,source:'wearable',measuredAt:iso(0)},
  {metric:'calories',value:2180,source:'nutrition',measuredAt:iso(0)},
  {metric:'restingHeartRate',value:58,source:'wearable',measuredAt:iso(0)},
];
const snap=buildCurrentAthleteSnapshot({metrics:resolveMetrics(ms),identity:{name:'Diego',sex:'male',age:32,experience:'intermediate'},goalKey:'fat_loss'});

ok('objetivo rotulado (Emagrecimento)', snap.goal.label==='Emagrecimento', snap.goal.label);
ok('body.weight com proveniência', snap.body.weight?.value===90.7 && snap.body.weight?.source==='wearable');
ok('body.weight carrega unidade e confiança', snap.body.weight?.unit==='kg' && !!snap.body.weight?.confidence);
ok('recovery.restingHeartRate presente', snap.recovery.restingHeartRate?.value===58);
ok('nutrition.calories presente', snap.nutrition.calories?.value===2180);
ok('globalConfidence 0..100', snap.globalConfidence>0 && snap.globalConfidence<=100, String(snap.globalConfidence));
ok('missingData lista métricas sem dado (ex.: HRV)', snap.missingData.includes('HRV'));
ok('identity preservada', snap.identity.name==='Diego' && snap.identity.age===32);

// conflito propagado ao snapshot
const ms2:MetricMeasurement[]=[
  {metric:'weight',value:94.1,source:'wearable',measuredAt:iso(0)},
  {metric:'weight',value:90.6,source:'bioimpedance',measuredAt:iso(0)},
];
const snap2=buildCurrentAthleteSnapshot({metrics:resolveMetrics(ms2),identity:{name:null,sex:null,age:null,experience:null},goalKey:null});
ok('conflito de peso aparece no snapshot', snap2.conflicts.length>=1, JSON.stringify(snap2.conflicts));
ok('objetivo ausente → não vira Hipertrofia (neutro)', snap2.goal.label!=='Hipertrofia', snap2.goal.label);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail===0?0:1);
