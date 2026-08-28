const { computeGoalProgress, normalizeGoal } = require('./.tmp/gpe/goal-progress-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// normalização
ok('emagrecimento => cutting', normalizeGoal('emagrecimento')==='cutting');
ok('hipertrofia => hypertrophy', normalizeGoal('hipertrofia')==='hypertrophy');
ok('recomp => recomposition', normalizeGoal('recomposicao')==='recomposition');
ok('running => performance', normalizeGoal('running')==='performance');
ok('default => hypertrophy', normalizeGoal(null)==='hypertrophy');

// cutting indo bem: BF -1.5, magra preservada, força +5, consistente, recovery ok
const cut = computeGoalProgress({ goal:'cutting', weightDeltaKg:-2, bodyFatDeltaPct:-1.5, leanDeltaKg:-0.1,
  strengthDeltaPct:5, volumeDeltaPct:2, sessionsDone:12, sessionsPlanned:12, recoveryScore:75 });
ok('cutting bom => score alto', cut.score>=65 && cut.onTrack);
ok('cutting componentes 0..100', Object.values(cut.components).every(v=>v>=0&&v<=100));

// cutting perdendo músculo => composição penalizada
const badCut = computeGoalProgress({ goal:'cutting', weightDeltaKg:-3, bodyFatDeltaPct:-0.2, leanDeltaKg:-1.5,
  strengthDeltaPct:-4, volumeDeltaPct:-5, sessionsDone:6, sessionsPlanned:12, recoveryScore:40 });
ok('cutting ruim => score baixo', badCut.score < cut.score);
ok('limitador identificado', typeof badCut.topLimiter==='string' && badCut.topLimiter.length>0);

// hipertrofia: ganho de magra + força
const hyp = computeGoalProgress({ goal:'hypertrophy', weightDeltaKg:1.2, bodyFatDeltaPct:0.4, leanDeltaKg:1.1,
  strengthDeltaPct:7, volumeDeltaPct:10, sessionsDone:16, sessionsPlanned:16, recoveryScore:70 });
ok('hipertrofia boa => on track', hyp.onTrack);
ok('avanço = composição ou performance', ['Composição corporal','Performance'].includes(hyp.topAdvance));

// recuperação limitando
const lowRec = computeGoalProgress({ goal:'hypertrophy', weightDeltaKg:1, bodyFatDeltaPct:0.3, leanDeltaKg:0.9,
  strengthDeltaPct:6, volumeDeltaPct:8, sessionsDone:16, sessionsPlanned:16, recoveryScore:20 });
ok('recuperação baixa aparece como limitador', lowRec.topLimiter==='Recuperação');

// performance goal usa cardio
const perf = computeGoalProgress({ goal:'performance', weightDeltaKg:0, bodyFatDeltaPct:-0.3, leanDeltaKg:0,
  strengthDeltaPct:4, volumeDeltaPct:2, cardioDeltaPct:8, sessionsDone:10, sessionsPlanned:12, recoveryScore:65 });
ok('performance score válido', perf.score>=0 && perf.score<=100 && perf.goal==='performance');

console.log(`\ngoal-progress: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
