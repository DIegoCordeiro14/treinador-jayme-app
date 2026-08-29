const { getCanonicalBodyState, resolveCanonicalMeasurement } = require('./.tmp/cbs/canonical-body-state.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const NOW=new Date('2026-08-29T12:00:00Z').getTime();
const iso=(d)=>new Date(NOW-d*86400000).toISOString();

// conflito de peso: bioimpedância 96 (2d), manual 97 (0d), wearable 96.7 (1d) => mais recente vence (manual, 0d)
const wRes=resolveCanonicalMeasurement([
  {metric:'weight',value:96,source:'bioimpedance',measuredAtISO:iso(2)},
  {metric:'weight',value:97,source:'manual',measuredAtISO:iso(0)},
  {metric:'weight',value:96.7,source:'wearable',measuredAtISO:iso(1)},
], NOW);
ok('mais recente vence (manual 97)', wRes.value===97 && wRes.source==='manual');

// empate no MESMO dia => fonte de maior confiança (bioimpedância) vence
const sameDay=resolveCanonicalMeasurement([
  {metric:'weight',value:96,source:'manual',measuredAtISO:iso(0)},
  {metric:'weight',value:95.8,source:'bioimpedance',measuredAtISO:iso(0)},
], NOW);
ok('empate no dia => bioimpedância', sameDay.value===95.8 && sameDay.source==='bioimpedance');

// canonical body state completo
const st=getCanonicalBodyState({
  facts:[
    {metric:'weight',value:96.4,source:'bioimpedance',measuredAtISO:iso(2)},
    {metric:'bodyFat',value:22,source:'bioimpedance',measuredAtISO:iso(2)},
    {metric:'muscleMass',value:40,source:'bioimpedance',measuredAtISO:iso(2)},
    {metric:'restingHr',value:55,source:'wearable',measuredAtISO:iso(1)},
  ],
  weightSeries:[
    {dateISO:iso(28),weightKg:98,bodyFatPct:24,source:'bioimpedance'},
    {dateISO:iso(14),weightKg:97,bodyFatPct:23,source:'weight_log'},
    {dateISO:iso(2),weightKg:96.4,bodyFatPct:22,source:'bioimpedance'},
  ],
  profile:{heightCm:178, age:30, gender:'male'},
  nowMs:NOW,
});
ok('peso canônico com proveniência', st.currentWeightKg.value===96.4 && st.currentWeightKg.source==='bioimpedance');
ok('proveniência tem ageDays', st.currentWeightKg.ageDays===2 && st.currentWeightKg.confidence==='high');
ok('BF canônico', st.bodyFatPct.value===22);
ok('FC repouso do wearable', st.restingHr.value===55 && st.restingHr.source==='wearable');
ok('altura/idade do perfil', st.heightCm.value===178 && st.age.value===30 && st.gender==='male');
ok('ritmo de peso negativo (perdendo)', st.weeklyWeightRateKg<0);
ok('dataConfidence 0..100', st.dataConfidence>=0 && st.dataConfidence<=100);
ok('lastMeasurement definido', !!st.lastMeasurementISO);

// dados antigos reduzem confiança
const stale=getCanonicalBodyState({ facts:[{metric:'weight',value:96,source:'weight_log',measuredAtISO:iso(60)}], weightSeries:[], profile:{heightCm:null,age:null,gender:null}, nowMs:NOW });
ok('peso antigo => confiança menor', stale.dataConfidence < st.dataConfidence);
ok('sem perfil => campos null', stale.heightCm===null && stale.gender===null);

// vazio
const empty=getCanonicalBodyState({ facts:[], weightSeries:[], profile:{heightCm:null,age:null,gender:null}, nowMs:NOW });
ok('sem fatos => peso null', empty.currentWeightKg===null);

console.log(`\ncanonical-body-state: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
