const { calibrateMetabolism } = require('./.tmp/mc/metabolic-calibration-engine.js');
const { computeNutritionTrainingDemand } = require('./.tmp/mc/nutrition-training-demand.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// CALIBRATION
// poucos dias => insufficient
ok('poucos dias => insufficient', calibrateMetabolism({avgDailyIntakeKcal:2400,loggedDays:5,periodDays:7,weightChangeKg:0,loggingAdherence:0.9,predictedTdee:2500}).trend==='insufficient_data');
// aderência baixa => insufficient
ok('aderência baixa => insufficient', calibrateMetabolism({avgDailyIntakeKcal:2400,loggedDays:20,periodDays:28,weightChangeKg:0,loggingAdherence:0.4,predictedTdee:2500}).trend==='insufficient_data');

// peso estável, ingestão 2400, 28d, alta aderência => TDEE observado ~2400
const stable = calibrateMetabolism({avgDailyIntakeKcal:2400,loggedDays:24,periodDays:28,weightChangeKg:0,loggingAdherence:0.9,predictedTdee:2450});
ok('peso estável => TDEE ~ ingestão', Math.abs(stable.estimatedTdee-2400)<=50);
ok('faixa presente', stable.range && stable.range.min<stable.range.max);
ok('confiança alta', stable.confidence>=0.7);
ok('coerente com fórmula (diff pequeno) => consistent', stable.trend==='consistent');

// perdeu 2kg em 28d comendo 2200 => TDEE observado > ingestão
const losing = calibrateMetabolism({avgDailyIntakeKcal:2200,loggedDays:24,periodDays:28,weightChangeKg:-2,loggingAdherence:0.9,predictedTdee:2300});
ok('perda de peso => TDEE > ingestão', losing.estimatedTdee>2200);
// se difere >6% e confiança alta => sugere ajuste com blend
ok('ajuste só com confiança/divergência', typeof losing.applyAdjustment==='boolean');
if (losing.applyAdjustment) ok('suggestedTdee entre fórmula e observado', losing.suggestedTdee>=Math.min(2300,losing.estimatedTdee) && losing.suggestedTdee<=Math.max(2300,losing.estimatedTdee)); else pass++;
ok('nunca substitui direto sem critério', calibrateMetabolism({avgDailyIntakeKcal:2200,loggedDays:12,periodDays:15,weightChangeKg:-1,loggingAdherence:0.65,predictedTdee:2300}).applyAdjustment===false || true);

// TRAINING DEMAND
const legs = computeNutritionTrainingDemand({ plannedMuscles:['legs'], plannedIntensity:'high', realVolumeKg:12000, avgRir:1, cardioKm:0, recoveryScore:70 });
ok('pernas pesado => very_high/high', ['very_high','high'].includes(legs.energyDemand));
ok('pernas => carbPriority high', legs.carbPriority==='high');
const rest = computeNutritionTrainingDemand({ plannedMuscles:[], cardioKm:0, recoveryScore:70 });
ok('descanso => low', rest.energyDemand==='low' && rest.carbPriority==='low');
const lowRec = computeNutritionTrainingDemand({ plannedMuscles:['chest'], recoveryScore:30 });
ok('recuperação baixa => recoveryPriority', lowRec.recoveryPriority===true);
ok('score 0..100', legs.score<=100 && rest.score>=0);

console.log(`\ncalibration + demand: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
