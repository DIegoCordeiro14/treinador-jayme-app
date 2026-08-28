const { unifyBodyMetrics, linearTrend, halvesDelta, seriesOf, spanDaysOf } =
  require('./.tmp/bmu/body-metrics-unifier.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// mesmo dia: bioimpedância vence measurement e weight_log no peso
const points = [
  { dateISO:'2026-08-01', weightKg:100, bodyFatPct:25, source:'weight_log' },
  { dateISO:'2026-08-01', weightKg:99.5, bodyFatPct:24.5, waistCm:90, source:'measurement' },
  { dateISO:'2026-08-01', weightKg:99.2, bodyFatPct:24, leanKg:74, muscleKg:40, source:'bioimpedance' },
  { dateISO:'2026-08-10', weightKg:98.0, bodyFatPct:23, source:'weight_log' },
  { dateISO:'2026-08-20', weightKg:97.0, bodyFatPct:null, source:'weight_log' },
  { dateISO:'2026-08-20', weightKg:null, bodyFatPct:22.5, source:'bioimpedance' },
];
const u = unifyBodyMetrics(points);
ok('deduplica por dia (3 dias)', u.length===3);
ok('peso do dia 1 vem da bioimpedância', u[0].weightKg===99.2 && u[0].weightSource==='bioimpedance');
ok('bf do dia 1 vem da bioimpedância', u[0].bodyFatPct===24 && u[0].bodyFatSource==='bioimpedance');
ok('lean/muscle preservados', u[0].leanKg===74 && u[0].muscleKg===40);
ok('waist do measurement preservado', u[0].waistCm===90);
ok('ordenado por data', u[0].dateISO<u[1].dateISO && u[1].dateISO<u[2].dateISO);
// dia 20: peso vem do weight_log (bio tinha null), bf vem da bio
ok('fallback independente de campo', u[2].weightKg===97.0 && u[2].weightSource==='weight_log' && u[2].bodyFatPct===22.5 && u[2].bodyFatSource==='bioimpedance');

// tendência: peso caindo ~100->97 em ~19 dias
const wSeries = seriesOf(u,'weightKg');
const tr = linearTrend(wSeries);
ok('slope negativo (perda)', tr.slopePerWeek < 0);
ok('nPoints=3, span~19d', tr.nPoints===3 && tr.spanDays>=18 && tr.spanDays<=20);
ok('rSquared alto (linha bem ajustada)', tr.rSquared >= 0.9);

// halvesDelta robusto
ok('halvesDelta negativo', halvesDelta([100,99.2,98,97]) < 0);
ok('halvesDelta null com 1 ponto', halvesDelta([100])===null);

// trend com <2 pontos
ok('linearTrend degrada com 1 ponto', linearTrend([{dateISO:'2026-08-01',value:100}]).slopePerDay===null);
ok('spanDaysOf', spanDaysOf(u)>=18);

// série vazia
ok('unify vazio => []', unifyBodyMetrics([]).length===0);

console.log(`\nbody-metrics-unifier: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
