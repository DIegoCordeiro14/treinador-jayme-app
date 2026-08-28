// Test: athlete-training-snapshot (Bloco 1)
const { buildAthleteTrainingSnapshot } = require('./.tmp/ats/athlete-training-snapshot.js');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', name); } }

const NOW = new Date('2026-08-28T12:00:00Z').getTime();
const MS_DAY = 86400000;
const iso = (d) => new Date(NOW - d * MS_DAY).toISOString();

// exercício progredindo (supino): carga sobe ao longo da janela
function supino(d, kg) {
  return { exercise_id: 'ex_supino', exercise_name: 'Supino reto', muscle_group: 'chest',
    performed_at: iso(d), weight_kg: kg, reps: 8, rir: 2 };
}
// exercício estagnado (rosca): mesma carga há semanas
function rosca(d, kg) {
  return { exercise_id: 'ex_rosca', exercise_name: 'Rosca direta', muscle_group: 'biceps',
    performed_at: iso(d), weight_kg: kg, reps: 10, rir: 1 };
}

const sets = [
  supino(60, 60), supino(53, 60), supino(46, 62.5), supino(39, 62.5),
  supino(21, 65), supino(14, 67.5), supino(7, 70),
  rosca(40, 20), rosca(33, 20), rosca(26, 20), rosca(12, 20), rosca(5, 20),
];

const snap = buildAthleteTrainingSnapshot({
  profile: { sex: 'male', experience: 'intermediate', objective: 'hypertrophy', days_per_week: 4 },
  sets,
  recovery: { category: 'low', sleep_h: 5 },
  cardio: { sessions_last_7d: 3, minutes_last_7d: 120, interfering_muscles: ['legs', 'chest'] },
  restrictions: [{ muscle_group: 'shoulders', severity: 'caution', reason: 'ombro sensível' }],
  nowMs: NOW,
});

ok('tem histórico', snap.hasHistory === true);
ok('conta séries de trabalho', snap.totalWorkingSets === 12);
const sup = snap.perExercise.find((e) => e.exercise_id === 'ex_supino');
const ros = snap.perExercise.find((e) => e.exercise_id === 'ex_rosca');
ok('supino existe', !!sup);
ok('supino best_top 70', sup.best_top_kg === 70);
ok('supino progredindo', sup.trend === 'progressing');
ok('supino familiaridade high', sup.familiarity === 'high');
ok('rosca plateau', ros.trend === 'plateau');
ok('rosca weeks_stagnant >=3', ros.weeks_stagnant >= 3);
ok('perMuscle tem chest e biceps', snap.perMuscle.length === 2);
ok('cardio interfere só em grupos treinados', JSON.stringify(snap.cardioInterferenceMuscles.sort()) === JSON.stringify(['chest','legs']));
ok('bullet de recuperação baixa', snap.summaryBullets.some((b) => b.toLowerCase().includes('recupera')));
ok('bullet de estagnação', snap.summaryBullets.some((b) => b.toLowerCase().includes('estagna')));
ok('restrições preservadas', snap.restrictions.length === 1);

// caso sem histórico
const empty = buildAthleteTrainingSnapshot({
  profile: { sex: 'female', experience: 'beginner', objective: 'weight_loss', days_per_week: 3 },
  sets: [], nowMs: NOW,
});
ok('sem histórico => hasHistory false', empty.hasHistory === false);
ok('sem histórico => bullet inicial', empty.summaryBullets[0].includes('Sem histórico'));

console.log(`\nathlete-training-snapshot: ${pass} passaram, ${fail} falharam`);
if (fail > 0) process.exit(1);
