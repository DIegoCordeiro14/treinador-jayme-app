const { buildEvolutionState } = require('./.tmp/eie/evolution-intelligence-engine.js');
const { compareBeforeAfter } = require('./.tmp/eie/before-after-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

const day=(d)=>{const b=new Date('2026-08-28').getTime(); return new Date(b-d*86400000).toISOString().slice(0,10);};
// série de recomposição: peso ~estável, BF caindo, magra subindo, ao longo de 40d
function body(){
  const pts=[];
  for(let i=0;i<7;i++){
    const d=40-i*6;
    pts.push({dateISO:day(d), weightKg:90+ (i%2?0.1:-0.1), bodyFatPct:22 - i*0.25, leanKg:70 + i*0.18, waistCm:85 - i*0.15, source:'bioimpedance'});
  }
  return pts;
}

const st = buildEvolutionState({
  goalRaw:'recomposicao', bodyPoints:body(),
  strengthDeltaPct:8, volumeDeltaPct:9, sessionsDone:12, sessionsPlanned:12,
  recoveryScore:70, recoveryLabel:'boa', daysLogged:10, logWindowDays:14,
});
ok('objetivo normalizado', st.goal==='recomposition');
ok('período detectado ~40d', st.periodDays>=36 && st.periodDays<=42);
ok('recomposição detectada', st.recomposition.verdict==='recomposition');
ok('status positivo', st.status==='positive');
ok('não é platô (progresso)', st.plateau.isPlateau===false);
ok('headline fala de recomposição', /recomposi/i.test(st.headline));
ok('whatChanged não vazio', st.whatChanged.length>0);
ok('goal progress presente', st.goalProgress.score>=0 && st.goalProgress.score<=100);
ok('data confidence corpo>0', st.dataConfidence.body>0);
ok('nutrition confidence ~ (10/14)', st.dataConfidence.nutrition>=65 && st.dataConfidence.nutrition<=75);
ok('métricas incluem peso e força', st.metrics.some(m=>m.key==='weightKg') && st.metrics.some(m=>m.key==='strength'));

// recuperação baixa entra no headline
const stLowRec = buildEvolutionState({ goalRaw:'recomposicao', bodyPoints:body(),
  strengthDeltaPct:8, volumeDeltaPct:9, sessionsDone:12, sessionsPlanned:12,
  recoveryScore:30, recoveryLabel:'baixa', daysLogged:2, logWindowDays:14 });
ok('recuperação baixa citada no headline', /recupera/i.test(stLowRec.headline));
ok('nutrição baixa confiança', stLowRec.dataConfidence.nutrition < 40 && /Baixa/.test(stLowRec.dataConfidence.nutritionNote));

// dados insuficientes
const empty = buildEvolutionState({ goalRaw:'hipertrofia', bodyPoints:[], strengthDeltaPct:null, volumeDeltaPct:null,
  sessionsDone:0, sessionsPlanned:0, recoveryScore:null, daysLogged:0, logWindowDays:14 });
ok('sem dados => insufficient', empty.status==='insufficient');

// before/after
const ba = compareBeforeAfter(30, [
  { label:'Peso', unit:'kg', before:98.2, after:96.8, higherIsBetter:false },
  { label:'Supino', unit:'kg', before:80, after:87.5, higherIsBetter:true },
  { label:'Gordura', unit:'%', before:24.1, after:22.8, higherIsBetter:false },
]);
ok('before/after calcula delta', ba.metrics[0].deltaAbs===-1.4);
ok('peso caindo é bom (higherIsBetter=false)', ba.metrics[0].good===true);
ok('supino subindo é bom', ba.metrics[1].good===true && ba.metrics[1].direction==='up');
ok('summary de balanço', /positivo|Aten/.test(ba.summary));

console.log(`\nevolution-intelligence + before/after: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
