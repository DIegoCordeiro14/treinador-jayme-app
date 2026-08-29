const { conditionNutritionAdjustment } = require('./.tmp/ca/nutrition-condition-adjust.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

ok('sem condições => sem ajuste', conditionNutritionAdjustment([]).reduceDeficit===false);
const one = conditionNutritionAdjustment([{status:'rehab',active:true,bodyRegion:'joelho'}]);
ok('reabilitação => reduz déficit', one.reduceDeficit && one.prioritizeRecovery && one.trainingReduced);
ok('penalidade de recuperação moderada', one.recoveryScorePenalty>0 && one.recoveryScorePenalty<20);
const two = conditionNutritionAdjustment([{status:'injury',active:true},{status:'recovery',active:true}]);
ok('duas condições => penalidade maior', two.recoveryScorePenalty>=20);
ok('condição inativa ignorada', conditionNutritionAdjustment([{status:'injury',active:false}]).reduceDeficit===false);
ok('status não redutor ignorado', conditionNutritionAdjustment([{status:'monitorando',active:true}]).trainingReduced===false);
ok('nota tem disclaimer', /profissional de saúde/i.test(one.note));
console.log(`\ncondition-adjust: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
