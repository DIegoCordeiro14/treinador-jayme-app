const { rankSplits, bestSplit } = require('./.tmp/e4/split-generation-engine.js');
const { scoreExercise, rankBySuitability } = require('./.tmp/e4/exercise-suitability-score.js');
const { analyzeStagnation } = require('./.tmp/e4/stagnation-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// ── SPLIT ──
ok('iniciante 3 dias => full body', bestSplit({days_per_week:3,experience:'beginner'}).type==='full_body');
ok('intermediário 4 dias => upper/lower', bestSplit({days_per_week:4,experience:'intermediate'}).type==='upper_lower');
ok('avançado 6 dias => PPL', bestSplit({days_per_week:6,experience:'advanced'}).type==='push_pull_legs');
const wp = rankSplits({days_per_week:5,experience:'advanced',weak_point:'shoulders'});
ok('ponto fraco aparece com specialization no ranking', wp.some(s=>s.type==='specialization'));
ok('split calcula frequência semanal', Object.keys(bestSplit({days_per_week:4,experience:'intermediate'}).weekly_frequency).length>0);
ok('bro split fora p/ 3 dias', !rankSplits({days_per_week:3,experience:'advanced'}).some(s=>s.type==='bro_split'));
ok('scores 0..100', rankSplits({days_per_week:4,experience:'intermediate'}).every(s=>s.score>=0&&s.score<=100));

// ── SUITABILITY ──
const ctx = { objective:'hypertrophy', experience:'intermediate', muscle_priority:['chest','back','legs'],
  weak_points:['back'], liked_ids:['fav'], disliked_ids:['bad'], retained_ids:['keep'], recent_ids:['keep','old'], available_equipment:['barbell','machine'] };
const supino = scoreExercise({id:'s',name:'Supino',muscle_group:'chest',equipment:'barbell',difficulty:'intermediate',is_compound:true,objective_tags:['hypertrophy']}, ctx);
const remadaWeak = scoreExercise({id:'keep',name:'Remada',muscle_group:'back',equipment:'barbell',difficulty:'intermediate',is_compound:true,objective_tags:['hypertrophy']}, ctx);
const avancado = scoreExercise({id:'a',name:'Muscle up',muscle_group:'back',equipment:'bodyweight',difficulty:'advanced'}, ctx);
const semEquip = scoreExercise({id:'k',name:'Kettlebell swing',muscle_group:'legs',equipment:'kettlebell',difficulty:'beginner'}, ctx);
ok('supino score alto', supino.score>=70);
ok('retido+ponto fraco pontua muito', remadaWeak.score>=supino.score);
ok('exercício avançado penalizado', avancado.factors.difficulty<0);
ok('equipamento indisponível zera', semEquip.score===0);
ok('ranking ordena desc', (()=>{const r=rankBySuitability([{id:'x',name:'x',muscle_group:'chest',equipment:'barbell',difficulty:'beginner'},{id:'bad',name:'bad',muscle_group:'chest',equipment:'barbell',difficulty:'beginner'}],ctx); return r[0].score>=r[1].score;})());

// ── STAGNATION ──
// sistêmica com recuperação baixa => recuperação primeiro, sem replace
const sys = analyzeStagnation({
  exercises:[
    {exercise_id:'1',exercise_name:'Supino',muscle_group:'chest',trend:'plateau',weeks_stagnant:7},
    {exercise_id:'2',exercise_name:'Agacho',muscle_group:'legs',trend:'plateau',weeks_stagnant:6},
    {exercise_id:'3',exercise_name:'Remada',muscle_group:'back',trend:'regressing',weeks_stagnant:4},
  ],
  recovery:'low', sleep_h:5,
});
ok('estagnação detectada', sys.stagnated && sys.systemic);
ok('1ª ação é melhorar recuperação', sys.actions[0].kind==='improve_recovery');
ok('não sugere replace quando recuperação ruim', !sys.actions.some(a=>a.kind==='replace_exercise'));

// pontual, recuperação ok, 1 exercício estagnado 7 sem => replace
const local = analyzeStagnation({
  exercises:[
    {exercise_id:'1',exercise_name:'Rosca',muscle_group:'biceps',trend:'plateau',weeks_stagnant:7},
    {exercise_id:'2',exercise_name:'Supino',muscle_group:'chest',trend:'progressing',weeks_stagnant:0},
    {exercise_id:'3',exercise_name:'Agacho',muscle_group:'legs',trend:'progressing',weeks_stagnant:0},
  ],
  recovery:'good',
});
ok('não sistêmica', !local.systemic && local.stagnated);
ok('sugere replace do exercício estagnado', local.actions.some(a=>a.kind==='replace_exercise'&&a.scope==='Rosca'));

// volume excessivo => reduce_volume antes de trocar
const vol = analyzeStagnation({
  exercises:[{exercise_id:'1',exercise_name:'Leg press',muscle_group:'legs',trend:'plateau',weeks_stagnant:4}],
  volume:[{muscle_group:'legs',status:'over_mrv'}], recovery:'good',
});
ok('reduce_volume tem prioridade sobre rotate', vol.actions.findIndex(a=>a.kind==='reduce_volume') < vol.actions.findIndex(a=>a.kind==='rotate_exercise'));

// sem estagnação
const none = analyzeStagnation({exercises:[{exercise_id:'1',exercise_name:'X',muscle_group:'chest',trend:'progressing',weeks_stagnant:0}]});
ok('sem estagnação => none', !none.stagnated && none.actions[0].kind==='none');

console.log(`\nsplit+suitability+stagnation: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
