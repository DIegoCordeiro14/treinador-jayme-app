const { decideNutrition } = require('./.tmp/nde/nutrition-decision-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const base=(o={})=>({goal:'weight_loss',periodDays:28,weightTrendKg:null,bodyFatTrendPct:null,leanMassTrendKg:null,strengthTrendPct:null,volumeTrendPct:null,cardioLoad:0,recoveryScore:70,hrvTrend:'flat',sleepTrend:'flat',loggingAdherence:0.9,targetAdherence:0.85,dataConfidence:0.8,...o});

// dados insuficientes
ok('sem séries => insufficient_data', decideNutrition(base({weightTrendKg:null,strengthTrendPct:null,bodyFatTrendPct:null})).state==='insufficient_data');
ok('período curto => insufficient_data', decideNutrition(base({periodDays:5,weightTrendKg:-1})).state==='insufficient_data');

// recomposição (peso estável + BF↓ + força↑) — NÃO pode virar platô nem muscle_loss
const recomp = decideNutrition(base({goal:'recomposition',weightTrendKg:0.1,bodyFatTrendPct:-1.2,leanMassTrendKg:0.6,strengthTrendPct:6}));
ok('recomposição detectada', recomp.state==='recomposition');
ok('recomposição não contradiz (positivo)', recomp.primarySignal.level==='positivo');
ok('recomposição sem ajuste', recomp.adjustmentAllowed===false);

// perda muscular no corte tem precedência sobre platô
const ml = decideNutrition(base({goal:'weight_loss',weightTrendKg:-1.5,leanMassTrendKg:-0.8,strengthTrendPct:-9,bodyFatTrendPct:-0.1}));
ok('perda muscular no corte', ml.state==='muscle_loss_risk' && ml.limitingFactor==='nutrition');

// low energy availability (déficit+cardio+perf↓+recuperação↓)
const lea = decideNutrition(base({goal:'weight_loss',weightTrendKg:-4,strengthTrendPct:-5,cardioLoad:30,recoveryScore:35,hrvTrend:'down',sleepTrend:'down'}));
ok('low_energy_availability_risk', lea.state==='low_energy_availability_risk');
ok('LEA não diagnostica doença (texto)', !/RED-S|doen[çc]a/i.test(lea.primarySignal.message));

// recovery risk
ok('recovery_risk', decideNutrition(base({recoveryScore:30,strengthTrendPct:-5,weightTrendKg:0})).state==='recovery_risk');

// baixa aderência de registro
ok('low_adherence', decideNutrition(base({loggingAdherence:0.4,weightTrendKg:-0.5})).state==='low_adherence');

// bulk acelerado
ok('bulk_too_fast', decideNutrition(base({goal:'lean_bulk',weightTrendKg:3,strengthTrendPct:2})).state==='bulk_too_fast');

// corte agressivo (sem perda muscular)
ok('cut_too_aggressive', decideNutrition(base({goal:'weight_loss',weightTrendKg:-4.5,strengthTrendPct:1,leanMassTrendKg:0})).state==='cut_too_aggressive');

// progresso normal no corte
const prog = decideNutrition(base({goal:'weight_loss',weightTrendKg:-1.5,strengthTrendPct:1,leanMassTrendKg:0,bodyFatTrendPct:-0.8}));
ok('progressing no corte', prog.state==='progressing' && prog.recommendedAction==='maintain');

// platô só quando nada mais casa
const plat = decideNutrition(base({goal:'weight_loss',weightTrendKg:0.05,bodyFatTrendPct:0.05,strengthTrendPct:0,periodDays:28}));
ok('platô', plat.state==='plateau' && plat.recommendedAction==='recalculate_targets');

// confiança 0..1 e adjustmentAllowed exige confiança >=0.5
ok('confidence 0..1', recomp.confidence>=0 && recomp.confidence<=1);
const lowConf = decideNutrition(base({goal:'weight_loss',weightTrendKg:-4.5,dataConfidence:0.1,loggingAdherence:0.2,periodDays:11}));
ok('baixa confiança bloqueia ou insufficient', lowConf.adjustmentAllowed===false);

console.log(`\nnutrition-decision: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
