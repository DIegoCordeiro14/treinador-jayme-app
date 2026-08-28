const { scoreMuscleDevelopment, scoreAllMuscles, weakPointsFromScores } = require('./.tmp/mm/muscle-development-score.js');
const { classifyMatrix } = require('./.tmp/mm/performance-composition-matrix.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// grupo bem desenvolvido
const good = scoreMuscleDevelopment({muscle_group:'back',weekly_sets:16,target_weekly_sets:16,load_progression_pct:6,reps_trend_pct:2,avg_rir:1.5,frequency_per_week:2,recovery_ok:true});
ok('costas boas => score alto', good.score>=75 && !good.is_weak_point);
// grupo negligenciado
const weak = scoreMuscleDevelopment({muscle_group:'legs',weekly_sets:6,target_weekly_sets:16,load_progression_pct:-2,reps_trend_pct:0,avg_rir:4,frequency_per_week:1,recovery_ok:true});
ok('pernas negligenciadas => weak point', weak.is_weak_point && weak.score<55);
ok('weak cita causas', /volume|carga|intensidade|frequ/.test(weak.reason));
// recuperação ruim reduz
const noRec = scoreMuscleDevelopment({muscle_group:'chest',weekly_sets:16,target_weekly_sets:16,load_progression_pct:6,reps_trend_pct:2,avg_rir:1.5,frequency_per_week:2,recovery_ok:false});
ok('recuperação ruim reduz score', noRec.score < good.score);
// ordenação e weak points
const all = scoreAllMuscles([good,weak].map(s=>({muscle_group:s.muscle_group,weekly_sets:s.muscle_group==='legs'?6:16,target_weekly_sets:16,load_progression_pct:s.muscle_group==='legs'?-2:6,reps_trend_pct:0,avg_rir:s.muscle_group==='legs'?4:1.5,frequency_per_week:s.muscle_group==='legs'?1:2,recovery_ok:true})));
ok('piores primeiro', all[0].score <= all[1].score);
ok('weakPointsFromScores retorna legs', weakPointsFromScores(all).includes('legs'));
ok('componentes 0..100', Object.values(good.components).every(v=>v>=0&&v<=100));

// MATRIZ
ok('comp↑ perf↑ => ideal', classifyMatrix({compositionDelta:2,performanceDelta:3}).quadrant==='ideal');
const rec = classifyMatrix({compositionDelta:2,performanceDelta:-3,inDeficit:true,sleepShort:true});
ok('comp↑ perf↓ => recovery', rec.quadrant==='recovery');
ok('recovery lista causas (déficit/sono)', rec.likelyCauses.some(c=>/déficit|sono/.test(c)));
ok('comp↓ perf↑ => strategy', classifyMatrix({compositionDelta:-2,performanceDelta:3}).quadrant==='strategy');
const prob = classifyMatrix({compositionDelta:-2,performanceDelta:-3,recoveryScore:30,volumeHigh:true});
ok('comp↓ perf↓ => problem', prob.quadrant==='problem' && prob.emoji==='🔴');
ok('estável => neutral', classifyMatrix({compositionDelta:0.1,performanceDelta:-0.1}).quadrant==='neutral');
ok('sem dados => neutral', classifyMatrix({compositionDelta:null,performanceDelta:3}).quadrant==='neutral');

console.log(`\nmuscle-dev + matrix: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
