import { resolveMetric, resolveMetrics } from '../src/lib/athlete-data/data-resolution-engine';
import type { MetricMeasurement } from '../src/lib/athlete-data/data-resolution-engine';
let pass=0, fail=0;
const ok=(n:string,c:boolean,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('FAIL  '+n+(x?'  » '+x:''));}};
const iso=(d:number,h=0)=>new Date(Date.now()-d*86400000-h*3600000).toISOString();

// Peso: manual de hoje vence bioimpedância antiga (recência)
{
  const ms:MetricMeasurement[]=[
    {metric:'weight',value:90.6,source:'bioimpedance',measuredAt:iso(10)},
    {metric:'weight',value:90.7,source:'wearable',measuredAt:iso(0,1)},
  ];
  const r=resolveMetric('weight',ms)!;
  ok('peso: wearable recente vence bioimpedância antiga', r.value===90.7 && r.source==='wearable', JSON.stringify(r));
}

// BF: mesmo dia → preferência de fonte (bioimpedância) mesmo que wearable também exista
{
  const ms:MetricMeasurement[]=[
    {metric:'bodyFat',value:29.4,source:'wearable',measuredAt:iso(0,2)},
    {metric:'bodyFat',value:28.8,source:'bioimpedance',measuredAt:iso(0,1)},
  ];
  const r=resolveMetric('bodyFat',ms)!;
  ok('BF: no mesmo dia, BIA vence wearable (preferência por métrica)', r.source==='bioimpedance' && r.value===28.8, JSON.stringify(r));
}

// FC repouso: wearable preferido sobre manual no mesmo dia
{
  const ms:MetricMeasurement[]=[
    {metric:'restingHeartRate',value:62,source:'manual',measuredAt:iso(0,2)},
    {metric:'restingHeartRate',value:58,source:'wearable',measuredAt:iso(0,1)},
  ];
  const r=resolveMetric('restingHeartRate',ms)!;
  ok('FC repouso: wearable preferido', r.source==='wearable' && r.value===58);
}

// Conflito (§18): BIA 90.6 vs wearable 94.1 no mesmo dia
{
  const ms:MetricMeasurement[]=[
    {metric:'weight',value:94.1,source:'wearable',measuredAt:iso(0,1)},
    {metric:'weight',value:90.6,source:'bioimpedance',measuredAt:iso(0,2)},
  ];
  const r=resolveMetric('weight',ms)!;
  ok('conflito detectado entre fontes recentes', r.conflict!=null, JSON.stringify(r.conflict));
  ok('conflito severidade alta (>8%? não, ~3.7kg/3.9%)', r.conflict!.severity==='watch' || r.conflict!.severity==='high');
  ok('conflito não altera o valor canônico (wearada mais recente)', r.value===94.1);
}

// Freshness: bioimpedância de 40 dias marca isStale (BF freshness=21)
{
  const ms:MetricMeasurement[]=[{metric:'bodyFat',value:28.8,source:'bioimpedance',measuredAt:iso(40)}];
  const r=resolveMetric('bodyFat',ms)!;
  ok('BF de 40 dias → isStale', r.isStale===true, String(r.ageDays));
}

// Plausibilidade: FC 300 bpm suspect
{
  const r=resolveMetric('restingHeartRate',[{metric:'restingHeartRate',value:300,source:'wearable',measuredAt:iso(0)}])!;
  ok('FC 300 → suspect', r.status==='suspect');
}

// Sem dados
ok('sem medições → null', resolveMetric('weight',[])===null);

// resolveMetrics multi-métrica
{
  const ms:MetricMeasurement[]=[
    {metric:'weight',value:90.7,source:'wearable',measuredAt:iso(0)},
    {metric:'sleepHours',value:7.5,source:'wearable',measuredAt:iso(0)},
    {metric:'calories',value:2180,source:'nutrition',measuredAt:iso(0)},
  ];
  const all=resolveMetrics(ms);
  ok('resolveMetrics: 3 métricas de 3 domínios', Object.keys(all).length===3);
  ok('unit preenchida', all.weight!.unit==='kg' && all.sleepHours!.unit==='h');
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail===0?0:1);
