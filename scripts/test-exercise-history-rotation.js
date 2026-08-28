const { analyzeExerciseHistory, retainedExerciseIds, exercisesToSwap } =
  require('./.tmp/ehr/exercise-history-intelligence.js');
const { classifyPattern, pickRotation } = require('./.tmp/ehr/exercise-rotation-engine.js');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('  FAIL:', name); } }

function snap(id, name, mg, trend, weeks, fam) {
  return { exercise_id: id, exercise_name: name, muscle_group: mg, sessions: fam === 'high' ? 8 : 2,
    familiarity: fam, last_performed_days_ago: 3, best_top_kg: 80, recent_top_kg: 80,
    avg_rir: 2, trend, weeks_stagnant: weeks };
}

// ── history intelligence ──
const decisions = analyzeExerciseHistory({
  exercises: [
    snap('prog', 'Supino reto', 'chest', 'progressing', 0, 'high'),
    snap('plat3', 'Rosca direta', 'biceps', 'plateau', 4, 'high'),
    snap('plat6', 'Leg press', 'legs', 'plateau', 7, 'high'),
    snap('new', 'Crucifixo', 'chest', 'new', 0, 'low'),
    snap('reg', 'Remada', 'back', 'regressing', 1, 'high'),
  ],
  recovery: 'good',
});
const byId = Object.fromEntries(decisions.map(d => [d.exercise_id, d]));
ok('progressing => progress', byId.prog.action === 'progress');
ok('progressing retido', byId.prog.retain === true);
ok('plateau 4sem => rotate', byId.plat3.action === 'rotate');
ok('plateau 4sem não retido', byId.plat3.retain === false);
ok('plateau 7sem boa recup => replace', byId.plat6.action === 'replace');
ok('novo => maintain', byId.new.action === 'maintain');
ok('regressing leve => reduce', byId.reg.action === 'reduce');
ok('retidos incluem prog e new', retainedExerciseIds(decisions).includes('prog') && retainedExerciseIds(decisions).includes('new'));
ok('swap inclui plat3 e plat6', exercisesToSwap(decisions).map(d=>d.exercise_id).sort().join() === 'plat3,plat6');

// plateau MAS recuperação ruim => reduce (não troca), Bloco 13
const poor = analyzeExerciseHistory({
  exercises: [snap('p', 'Agachamento', 'legs', 'plateau', 8, 'high')],
  recovery: 'low',
});
ok('plateau + recup baixa => reduce', poor[0].action === 'reduce');
ok('plateau + recup baixa retido', poor[0].retain === true);

// ── rotation: preserva padrão biomecânico ──
const inclineBarbell = { id: 'ib', name: 'Supino inclinado com barra', muscle_group: 'chest', equipment: 'barbell', is_compound: true };
const candidates = [
  { id: 'id', name: 'Supino inclinado com halteres', muscle_group: 'chest', equipment: 'dumbbell', is_compound: true },
  { id: 'fly', name: 'Crucifixo inclinado', muscle_group: 'chest', equipment: 'dumbbell', is_compound: false },
  { id: 'flat', name: 'Supino reto com barra', muscle_group: 'chest', equipment: 'barbell', is_compound: true },
  { id: 'row', name: 'Remada curvada', muscle_group: 'back', equipment: 'barbell', is_compound: true },
];
const rot = pickRotation(inclineBarbell, candidates);
ok('rotação escolhe supino inclinado halteres', rot.replacement && rot.replacement.id === 'id');
ok('crucifixo pontua menos que supino halteres',
   rot.ranked.find(r=>r.candidate.id==='id').score > rot.ranked.find(r=>r.candidate.id==='fly').score);
ok('remada (outro grupo) fica de fora', !rot.ranked.some(r=>r.candidate.id==='row'));

// classificação de padrões
ok('supino inclinado = horizontal_push/incline', (()=>{const p=classifyPattern(inclineBarbell); return p.pattern==='horizontal_push' && p.angle==='incline';})());
ok('crucifixo = isolation', classifyPattern(candidates[1]).pattern === 'isolation');
ok('puxada = vertical_pull', classifyPattern({id:'x',name:'Puxada alta',muscle_group:'back',equipment:'cable',is_compound:true}).pattern==='vertical_pull');
ok('agachamento = squat', classifyPattern({id:'y',name:'Agachamento livre',muscle_group:'legs',equipment:'barbell',is_compound:true}).pattern==='squat');
ok('stiff = hinge', classifyPattern({id:'z',name:'Levantamento terra stiff',muscle_group:'legs',equipment:'barbell',is_compound:true}).pattern==='hinge');

// sem substituto do mesmo grupo => null
const none = pickRotation(inclineBarbell, [{ id: 'r', name: 'Remada', muscle_group: 'back', equipment: 'barbell', is_compound: true }]);
ok('sem candidato compatível => replacement null', none.replacement === null);

console.log(`\nexercise-history + rotation: ${pass} passaram, ${fail} falharam`);
if (fail > 0) process.exit(1);
