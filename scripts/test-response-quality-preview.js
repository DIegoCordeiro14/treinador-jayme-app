const { learnResponseProfile, toIndividualLandmarks } = require('./.tmp/e5/training-response-profile.js');
const { scoreWorkoutQuality } = require('./.tmp/e5/workout-quality-score.js');
const { buildPlanPreview, diffPlans } = require('./.tmp/e5/workout-plan-preview.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// ── RESPONSE PROFILE ──
const base = { chest:{mev:10,mav:16,mrv:22}, biceps:{mev:8,mav:14,mrv:20} };
const prof = learnResponseProfile({ baseLandmarks: base, observations:[
  {muscle_group:'chest',weekly_sets:18,outcome:'progressed',recovery_ok:true},
  {muscle_group:'chest',weekly_sets:20,outcome:'progressed',recovery_ok:true},
  {muscle_group:'biceps',weekly_sets:14,outcome:'regressed',recovery_ok:true},
  {muscle_group:'biceps',weekly_sets:13,outcome:'regressed',recovery_ok:true},
]});
ok('chest high responder', prof.chest.responder==='high_responder');
ok('chest MRV subiu', prof.chest.individual_landmarks.mrv > base.chest.mrv);
ok('biceps low responder', prof.biceps.responder==='low_responder');
ok('biceps MRV desceu', prof.biceps.individual_landmarks.mrv < base.biceps.mrv);
ok('confidence entre 0 e 1', prof.chest.confidence>0 && prof.chest.confidence<=1);
const ind = toIndividualLandmarks(prof);
ok('landmarks individuais exportados', ind.chest && ind.chest.mrv===prof.chest.individual_landmarks.mrv);
const noData = learnResponseProfile({baseLandmarks:{legs:{mev:10,mav:18,mrv:25}},observations:[]});
ok('sem dados => unknown/confidence 0', noData.legs.responder==='unknown' && noData.legs.confidence===0);
ok('unknown não entra em landmarks individuais', !toIndividualLandmarks(noData).legs);

// ── QUALITY SCORE ──
const exercises = [
  {exercise_id:'a',name:'Supino',muscle_group:'chest',sets:6,is_compound:true,pattern:'push'},
  {exercise_id:'b',name:'Crucifixo',muscle_group:'chest',sets:4,is_compound:false,pattern:'push'},
  {exercise_id:'c',name:'Remada',muscle_group:'back',sets:6,is_compound:true,pattern:'pull'},
  {exercise_id:'d',name:'Puxada',muscle_group:'back',sets:6,is_compound:true,pattern:'pull'},
];
const good = scoreWorkoutQuality(exercises, { target_weekly_sets:{chest:10,back:12}, weak_points:['back'] });
ok('plano equilibrado score alto', good.score>=75);
ok('volume por grupo calculado', good.weekly_volume.chest===10 && good.weekly_volume.back===12);
// plano com exercício restrito
const unsafe = scoreWorkoutQuality(exercises, { target_weekly_sets:{chest:10,back:12}, restricted_exercise_ids:['a'] });
ok('exercício restrito zera segurança', unsafe.breakdown.safety===0);
ok('issue de restrição alta', unsafe.issues.some(i=>i.severity==='high' && /restrito/i.test(i.message)));
// grupo sem volume
const missing = scoreWorkoutQuality(exercises, { target_weekly_sets:{chest:10,back:12,legs:14} });
ok('grupo faltante gera issue high', missing.issues.some(i=>/legs/.test(i.message)&&i.severity==='high'));

// ── PREVIEW + DIFF ──
const preview = buildPlanPreview({
  days:[
    {label:'A',exercises:[{exercise_id:'a',name:'Supino',muscle_group:'chest',sets:6},{exercise_id:'b',name:'Crucifixo',muscle_group:'chest',sets:4}]},
    {label:'B',exercises:[{exercise_id:'c',name:'Remada',muscle_group:'back',sets:6}]},
  ],
  quality: good,
  rationaleBullets:['Ponto fraco: costas priorizado.'],
});
ok('preview conta exercícios', preview.total_exercises===3);
ok('preview soma séries', preview.total_weekly_sets===16);
ok('preview frequência chest 1x', preview.weekly_frequency.chest===1);
ok('preview traz why', preview.why_bullets.length===1);

const diff = diffPlans(
  [{exercise_id:'a',name:'Supino',muscle_group:'chest'},{exercise_id:'x',name:'Voador',muscle_group:'chest'}],
  [{exercise_id:'a',name:'Supino',muscle_group:'chest'},{exercise_id:'c',name:'Remada',muscle_group:'back'}],
  {x:'Estagnado 6 semanas'}
);
ok('diff adiciona c', diff.added.some(e=>e.exercise_id==='c'));
ok('diff remove x', diff.removed.some(e=>e.exercise_id==='x'));
ok('diff mantém a', diff.kept.some(e=>e.exercise_id==='a'));
ok('diff explica motivo de remoção', /Estagnado/.test(diff.summary));

console.log(`\nresponse+quality+preview: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
