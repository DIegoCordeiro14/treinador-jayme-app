const { diagnoseCardio } = require('./.tmp/cd/cardio-diagnosis-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const base=(o={})=>({runsCount:8,periodDays:28,paceTrendPct:0,hrTrendPct:0,volumeTrendPct:0,acwr:1.0,recoveryScore:70,sessions7:3,plannedSessions:3,km7:24,km28:88,dataConfidence:0.8,...o});

ok('poucos dados => insufficient', diagnoseCardio(base({runsCount:2})).state==='insufficient_data');
ok('ACWR alto + pace pior => overreaching', diagnoseCardio(base({acwr:1.8,paceTrendPct:5})).state==='overreaching');
ok('overreaching => reduzir carga', diagnoseCardio(base({acwr:1.8,paceTrendPct:5})).recommendedAction.kind==='reduce_load');
ok('recuperação baixa => recovery_limited', diagnoseCardio(base({recoveryScore:30,hrTrendPct:3,acwr:1.0})).state==='recovery_limited');
ok('eficiência melhorando (pace↓ FC↓)', diagnoseCardio(base({paceTrendPct:-4,hrTrendPct:-4})).state==='efficiency_improving');
ok('eficiência caindo (pace↑ FC↑)', diagnoseCardio(base({paceTrendPct:5,hrTrendPct:4,acwr:1.0,recoveryScore:70})).state==='efficiency_declining');
ok('progredindo', diagnoseCardio(base({paceTrendPct:-3,hrTrendPct:0})).state==='progressing');
ok('volume caindo + baixa consistência => undertraining/detraining', ['undertraining','detraining'].includes(diagnoseCardio(base({volumeTrendPct:-40,sessions7:1,plannedSessions:4})).state));
ok('platô', diagnoseCardio(base({paceTrendPct:0,hrTrendPct:0,volumeTrendPct:0})).state==='plateau');
ok('confidence 0..1', diagnoseCardio(base()).confidence>=0 && diagnoseCardio(base()).confidence<=1);
ok('limitador presente em estados negativos', diagnoseCardio(base({acwr:1.8,paceTrendPct:5})).primaryLimiter==='recovery');
ok('headline e evidência', (()=>{const d=diagnoseCardio(base({paceTrendPct:-4,hrTrendPct:-4})); return d.headline.length>0 && d.evidence.length>0;})());

console.log(`\ncardio-diagnosis: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
