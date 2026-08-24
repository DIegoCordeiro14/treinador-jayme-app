const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/edn/workout-improvement-engine.ts --outDir scripts/.tmp/wi --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/wi/workout-improvement-engine.js');
let fail = 0; const ok = (c, msg) => { if (!c) { console.error('FAIL:', msg); fail++; } else console.log('ok:', msg); };
const ex = (name, mg, sets, rmin=8, rmax=12) => ({ name, muscleGroup: mg, sets, repsMin: rmin, repsMax: rmax });

const plan = [
  { name: 'A - Peito/Tríceps', exercises: [ ex('Supino', 'chest', 4), ex('Crucifixo', 'chest', 3), ex('Tríceps', 'triceps', 3) ] },
  { name: 'B - Costas/Bíceps', exercises: [ ex('Remada', 'back', 4), ex('Rosca', 'biceps', 2) ] },
];

// ponto fraco = biceps -> +1 série na rosca; estrutura mantida alta
const r = m.improveImportedWorkout(plan, { weakPointMuscle: 'biceps', goal: 'hypertrophy' });
const bicChange = r.changes.find(c => c.target === 'Rosca' && c.type === 'increase_volume');
ok(!!bicChange, 'ponto fraco biceps -> +1 série na rosca');
ok(r.structureKeptPct >= 80 && r.structureKeptPct < 100, 'mantém a maioria da estrutura (' + r.structureKeptPct + '%)');
ok(/Mantive \d+% da estrutura/.test(r.summary), 'summary explica % mantido');

// overtrained chest -> reduz 1 série do supino
const r2 = m.improveImportedWorkout(plan, { overtrainedMuscles: ['chest'] });
ok(r2.changes.some(c => c.type === 'reduce_volume' && c.target === 'Supino'), 'chest MRV -> reduz supino');

// cutting -> sobe repsMax
const r3 = m.improveImportedWorkout([{ name:'A', exercises:[ ex('Supino','chest',4,8,10) ] }], { goal: 'fat_loss' });
ok(r3.changes.some(c => c.type === 'adjust_reps'), 'cutting -> ajusta faixa de reps');

// abaixo do MEV -> sinaliza slot
const r4 = m.improveImportedWorkout([{ name:'A', exercises:[ ex('Rosca','biceps',2) ] }], {});
ok(r4.changes.some(c => c.type === 'add_exercise_slot' && c.target === 'biceps'), 'abaixo do MEV -> sugere slot');

// nada a mudar -> summary neutro
const r5 = m.improveImportedWorkout([{ name:'A', exercises:[ ex('Supino','chest',4), ex('Crucifixo','chest',4), ex('Cross','chest',4) ] }], {});
ok(r5.structureKeptPct === 100, 'sem mudanças -> 100% mantido');

if (fail) { console.error(fail+' falharam'); process.exit(1);} else console.log('TODOS OS TESTES PASSARAM');
