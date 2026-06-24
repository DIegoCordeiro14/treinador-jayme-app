/* Testes dos motores V8.1: progress, periodization, workout-intelligence. */
const P = require('./.tmp/progress-intelligence-engine.js');
const T = require('./.tmp/training-periodization-engine.js');
const W = require('./.tmp/workout-intelligence-engine.js');
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${x ? ' → ' + x : ''}`); } }

console.log('\n== progress-intelligence ==');
let d = P.analyzeProgress({ weightTrendKg: -3, bfTrendPct: 0, leanTrendKg: -1.2, volumeTrendPct: -5, goal: 'fat_loss', periodDays: 30 });
check('peso↓ + magra↓ → perda muscular', d.status === 'perda_muscular', d.status);
d = P.analyzeProgress({ weightTrendKg: 0.1, bfTrendPct: -1, leanTrendKg: 0.5, volumeTrendPct: 2, goal: 'recomposition', periodDays: 30 });
check('peso estável + BF↓ + magra↑ → recomposição', d.status === 'recomposicao', d.status);
d = P.analyzeProgress({ weightTrendKg: -1.5, bfTrendPct: -1, leanTrendKg: 0, volumeTrendPct: 0, goal: 'fat_loss', periodDays: 30 });
check('cutting perde gordura preservando magra → evolução positiva', d.status === 'evolucao_positiva', d.status);
d = P.analyzeProgress({ weightTrendKg: 0.1, bfTrendPct: null, leanTrendKg: null, volumeTrendPct: 8, goal: 'fat_loss', periodDays: 28 });
check('peso parado 28d → platô', d.status === 'plato', d.status);
d = P.analyzeProgress({ weightTrendKg: null, bfTrendPct: null, leanTrendKg: null, volumeTrendPct: null, goal: 'fat_loss', periodDays: 30 });
check('sem dados → dados_insuficientes', d.status === 'dados_insuficientes', d.status);

console.log('\n== projectAthlete ==');
let pj = P.projectAthlete({ currentWeightKg: 90, currentBfPct: 25, currentLeanKg: 67, weeklyWeightDeltaKg: -0.5, adherencePct: 100 });
check('3 horizontes', pj.length === 3 && pj[2].day === 90, String(pj.length));
check('cutting → peso projetado cai', pj[2].weightKg < 90, String(pj[2].weightKg));

console.log('\n== training-periodization ==');
let m = T.detectMesocyclePhase({ weeksOnPlan: 2, recentVolumeTrendPct: 5, recoveryCategory: 'good', hadPrRecently: true });
check('semana 2 + ok → volume', m.phase === 'volume', m.phase);
m = T.detectMesocyclePhase({ weeksOnPlan: 6, recentVolumeTrendPct: -2, recoveryCategory: 'good', hadPrRecently: false });
check('6 sem sem PR + volume parado → deload', m.phase === 'deload', m.phase);
m = T.detectMesocyclePhase({ weeksOnPlan: 1, recentVolumeTrendPct: 0, recoveryCategory: 'good', hadPrRecently: false });
check('semana inicial → base', m.phase === 'base', m.phase);

let wk = T.planWeek({ pattern: [1,3,5], dayAssignments: {'1':'Peito','3':'Pernas','5':'Costas'}, cardioDays: [2], todayWeekday: 3, recoveryCategory: 'low' });
check('7 dias', wk.length === 7);
const wed = wk.find(d => d.weekday === 3);
check('pernas hoje + recuperação baixa → adaptado p/ cardio leve', !!wed.adapted && wed.type === 'cardio', JSON.stringify(wed));

console.log('\n== computeSessionPerformance ==');
let sp = T.computeSessionPerformance({ setsCompleted: 12, setsPlanned: 12, volumeKg: 5500, prevVolumeKg: 5000, avgRir: 1 });
check('progressão + RIR baixo → score alto (>=75)', sp.score >= 75, String(sp.score));
sp = T.computeSessionPerformance({ setsCompleted: 6, setsPlanned: 12, volumeKg: 3000, prevVolumeKg: 5000, avgRir: 4 });
check('incompleto + regressão → score baixo', sp.score < 50, String(sp.score));

console.log('\n== workout-intelligence ==');
let g = W.analyzeWorkoutContext({ sex: 'male', age: 30, bodyFatPct: 30, goal: 'fat_loss', experience: 'intermediate', weeklyVolumeKg: null, volumeTrendPct: null, weakMuscle: 'Peitoral', recoveryCategory: 'good', equipment: 'full_gym', limitations: null });
check('homem BF30 cutting → ênfase recomposição/gasto', /recomp|gasto|déficit|preserv/i.test(g.emphasis + g.volumeNote + g.priorities.join(' ')), g.emphasis);
check('weak muscle entra como prioridade', g.priorities.some(p => /Peitoral/i.test(p)), g.priorities.join(','));
g = W.analyzeWorkoutContext({ sex: 'female', age: 28, bodyFatPct: 24, goal: 'definition', experience: 'beginner', weeklyVolumeKg: null, volumeTrendPct: null, weakMuscle: null, recoveryCategory: 'low', equipment: 'home', limitations: 'joelho' });
check('mulher definição → glúteos/posteriores', g.priorities.some(p => /gl[úu]teo|posterior|quadr/i.test(p)), g.priorities.join(','));
check('recuperação baixa → cautela de volume', g.cautions.some(c => /recupera/i.test(c)), g.cautions.join(','));

console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`);
process.exit(fail === 0 ? 0 : 1);
