import { computeDataQuality, dedupeMeasurements } from '../src/lib/athlete-data/data-quality-engine';
import { resolveMetrics } from '../src/lib/athlete-data/data-resolution-engine';
import type { MetricMeasurement } from '../src/lib/athlete-data/data-resolution-engine';
let pass=0, fail=0;
const ok=(n:string,c:boolean,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('FAIL  '+n+(x?'  » '+x:''));}};
const iso=(d:number)=>new Date(Date.now()-d*86400000).toISOString();

// tudo íntegro → score alto, sem missing crítico
{
  const ms:MetricMeasurement[]=[
    {metric:'weight',value:90.7,source:'wearable',measuredAt:iso(0)},
    {metric:'bodyFat',value:28.8,source:'bioimpedance',measuredAt:iso(1)},
  ];
  const rep=computeDataQuality(resolveMetrics(ms));
  ok('íntegro → score >= 90', rep.score>=90, String(rep.score));
  ok('sem conflito/implausível', rep.counts.conflict===0 && rep.counts.implausible===0);
}
// missing obrigatório
{
  const rep=computeDataQuality(resolveMetrics([{metric:'sleepHours',value:7,source:'wearable',measuredAt:iso(0)}]));
  ok('peso ausente → issue missing', rep.issues.some(i=>i.metric==='weight' && i.kind==='missing'));
}
// stale
{
  const rep=computeDataQuality(resolveMetrics([{metric:'weight',value:90,source:'wearable',measuredAt:iso(0)},{metric:'bodyFat',value:29,source:'bioimpedance',measuredAt:iso(40)}]));
  ok('BF 40d → stale', rep.issues.some(i=>i.metric==='bodyFat' && i.kind==='stale'));
}
// implausível
{
  const rep=computeDataQuality(resolveMetrics([{metric:'weight',value:700,source:'manual',measuredAt:iso(0)},{metric:'bodyFat',value:28,source:'bioimpedance',measuredAt:iso(0)}]));
  ok('peso 700 → implausible crítico', rep.issues.some(i=>i.kind==='implausible' && i.severity==='critical'));
}
// conflito
{
  const rep=computeDataQuality(resolveMetrics([{metric:'weight',value:94.1,source:'wearable',measuredAt:iso(0)},{metric:'weight',value:90.6,source:'bioimpedance',measuredAt:iso(0)},{metric:'bodyFat',value:28,source:'bioimpedance',measuredAt:iso(0)}]));
  ok('divergência de peso → conflict', rep.counts.conflict>=1);
}
// abrupt change
{
  const rep=computeDataQuality(resolveMetrics([{metric:'weight',value:98,source:'wearable',measuredAt:iso(0)},{metric:'bodyFat',value:28,source:'bioimpedance',measuredAt:iso(0)}]),{previous:{weight:90}});
  ok('peso 90→98 (8.9%) → abrupt_change', rep.issues.some(i=>i.kind==='abrupt_change'));
}
// dedup idempotente
{
  const dup:MetricMeasurement[]=[
    {metric:'weight',value:90.7,source:'wearable',measuredAt:'2026-09-24T07:00:30Z'},
    {metric:'weight',value:90.7,source:'wearable',measuredAt:'2026-09-24T07:00:45Z'},
    {metric:'weight',value:90.7,source:'manual',measuredAt:'2026-09-24T07:00:30Z'},
  ];
  ok('dedup por metric+source+valor+minuto', dedupeMeasurements(dup).length===2, String(dedupeMeasurements(dup).length));
  const ext=[{metric:'cardioDistanceKm' as const,value:10,source:'wearable' as const,measuredAt:iso(0),externalId:'A'},{metric:'cardioDistanceKm' as const,value:10,source:'wearable' as const,measuredAt:iso(1),externalId:'A'}];
  ok('dedup por externalId (mesmo id = 1)', dedupeMeasurements(ext).length===1);
}
console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail===0?0:1);
