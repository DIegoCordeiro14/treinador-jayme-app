const { computeAdaptiveEnergy } = require('./.tmp/ae/adaptive-energy-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// wearable medido tem prioridade
const r1 = computeAdaptiveEnergy([
  { id:'1', dateISO:'2026-08-20', kind:'cardio', measuredKcal:650, distanceKm:8, bodyWeightKg:88 },
]);
ok('usa kcal do wearable', r1.activities[0].energyKcal===650 && r1.activities[0].source==='wearable');

// dupla contagem: mesma corrida via wearable e via EDN (mesmo dedupeKey) => conta uma
const r2 = computeAdaptiveEnergy([
  { id:'w', dateISO:'2026-08-20', kind:'cardio', measuredKcal:650, dedupeKey:'run-123' },
  { id:'e', dateISO:'2026-08-20', kind:'cardio', distanceKm:8, bodyWeightKg:88, dedupeKey:'run-123' },
]);
ok('evita dupla contagem', r2.doubleCountsAvoided===1);
ok('só a medida conta', r2.weeklyActivityKcal===650);
ok('segunda marcada counted=false', r2.activities.some(a=>!a.counted));

// estimativa de cardio por distância quando não há wearable
const r3 = computeAdaptiveEnergy([
  { id:'1', dateISO:'2026-08-21', kind:'cardio', distanceKm:10, bodyWeightKg:80 },
]);
ok('estima cardio por distância', r3.activities[0].energyKcal>0 && r3.activities[0].source==='edn_session');

// estimativa de musculação por duração
const r4 = computeAdaptiveEnergy([
  { id:'1', dateISO:'2026-08-21', kind:'strength', durationMin:60, bodyWeightKg:80 },
]);
ok('estima musculação por duração', r4.activities[0].energyKcal>0);

// média diária sobre a janela
const r5 = computeAdaptiveEnergy([
  { id:'1', dateISO:'2026-08-20', kind:'cardio', measuredKcal:700 },
  { id:'2', dateISO:'2026-08-22', kind:'cardio', measuredKcal:700 },
], 7);
ok('média diária = 1400/7', r5.dailyAvgActivityKcal===200);
ok('weekly = 1400', r5.weeklyActivityKcal===1400);

// vazio
ok('sem atividades => 0', computeAdaptiveEnergy([]).weeklyActivityKcal===0);

console.log(`\nadaptive-energy: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
