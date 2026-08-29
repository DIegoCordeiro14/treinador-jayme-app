const { applyChangeBudget } = require('./.tmp/ce/plan-change-budget-engine.js');
const { computeEquilibriumScore } = require('./.tmp/ce/equilibrium-score-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// 10 exercícios, propõe trocar 5 => orçamento 30% = 3, barra 2
const prev = ['a','b','c','d','e','f','g','h','i','j'];
const proposed = ['a','b','c','d','e','k','l','m','n','o']; // 5 novos (k..o)
const r = applyChangeBudget({ previousExerciseIds:prev, proposedExerciseIds:proposed });
ok('orçamento ~30% de 10 = 3', r.allowedChanges===3);
ok('aceita 3 trocas', r.changedIds.length===3);
ok('barra 2 trocas', r.blockedChanges.length===2);
ok('não é overhaul', r.overhaulAllowed===false);

// gatilho de lesão libera tudo
const overhaul = applyChangeBudget({ previousExerciseIds:prev, proposedExerciseIds:proposed, injuryOrCondition:true });
ok('lesão => overhaul', overhaul.overhaulAllowed && overhaul.blockedChanges.length===0);
// mudança de objetivo libera
ok('objetivo mudou => overhaul', applyChangeBudget({previousExerciseIds:prev,proposedExerciseIds:proposed,goalChanged:true}).overhaulAllowed);
// changePriority: troca os piores primeiro
const pr = applyChangeBudget({ previousExerciseIds:prev, proposedExerciseIds:proposed, changePriority:['o','n','m','l','k'] });
ok('troca prioriza piores (o,n,m)', pr.changedIds.includes('o') && pr.changedIds.includes('n') && pr.changedIds.includes('m'));

// EQUILIBRIUM
const good = { priorityRespected:true,muscleBalanced:true,volumeWithinTargets:true,frequencyAdequate:true,recoveryRespected:true,sessionDurationOk:true,cardioConsidered:true,safetyRespected:true,patternCoverageOk:true,historyRespected:true,adherenceFriendly:true };
const eqGood = computeEquilibriumScore(good);
ok('tudo ok => score alto', eqGood.score>=88 && eqGood.verdict==='excellent' && !eqGood.needsRebalance);

// falha de segurança => rebalance mesmo com score alto
const unsafe = computeEquilibriumScore({ ...good, safetyRespected:false });
ok('falha de segurança => rebalance', unsafe.needsRebalance && unsafe.verdict==='rebalance' && unsafe.failing.includes('segurança'));

// muitas falhas => rebalance
const bad = computeEquilibriumScore({ ...good, muscleBalanced:false, volumeWithinTargets:false, recoveryRespected:false });
ok('muitas falhas => rebalance', bad.needsRebalance && bad.failing.length>=3);

console.log(`\nchange-budget + equilibrium: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
