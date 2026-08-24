const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/edn/adaptive-session-engine.ts --outDir scripts/.tmp/as --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/as/adaptive-session-engine.js');
let fail = 0; const ok = (c, msg) => { if (!c) { console.error('FAIL:', msg); fail++; } else console.log('ok:', msg); };

// Cenário-bandeira V8: recuperação baixa + cardio alto + performance caindo + pernas pesado hoje
const flag = m.recommendSessionAdaptation({
  recoveryScore: 48, recoveryCategory: 'low',
  cardioAcwr: 1.6, recentPerformanceDeltaPct: -8,
  todayIsHeavyCompound: true, primaryMuscleToday: 'legs', daysSinceLastWorkout: 2,
});
ok(flag.intensity === 'deload', 'cenário-bandeira -> deload (' + flag.intensity + ')');
ok(flag.workingVolumePct <= 70, 'reduz volume Working');
ok(flag.targetRirMin >= 2, 'RIR alvo elevado');
ok(!flag.allowPr, 'não permite PR');
ok(/pernas/.test(flag.explanation) && /fadiga|deload/i.test(flag.explanation), 'explicação menciona pernas e fadiga/deload');
ok(flag.drivers.length >= 3, 'múltiplos fatores considerados');

// Recuperação excelente, tudo tranquilo -> push com PR
const great = m.recommendSessionAdaptation({ recoveryScore: 90, recoveryCategory: 'excellent', cardioAcwr: 0.9, recentPerformanceDeltaPct: 3, todayIsHeavyCompound: true, primaryMuscleToday: 'chest', daysSinceLastWorkout: 3 });
ok(great.intensity === 'push' && great.allowPr && great.loadDeltaPct > 0, 'excelente -> push + PR + progressão');

// Excelente mas cardio altíssimo -> rebaixa para normal (não permite PR)
const greatButTired = m.recommendSessionAdaptation({ recoveryScore: 88, recoveryCategory: 'excellent', cardioAcwr: 1.7, daysSinceLastWorkout: 2 });
ok(greatButTired.intensity === 'normal' && !greatButTired.allowPr, 'excelente+cardio alto -> normal, sem PR');

// Boa recuperação, dia leve, sem sinais -> normal 100%
const normal = m.recommendSessionAdaptation({ recoveryScore: 75, recoveryCategory: 'good', daysSinceLastWorkout: 2 });
ok(normal.intensity === 'normal' && normal.workingVolumePct === 100 && normal.targetRirMin === 2, 'boa -> normal 100%');

// Crítica -> rest
const crit = m.recommendSessionAdaptation({ recoveryScore: 30, recoveryCategory: 'critical', daysSinceLastWorkout: 1 });
ok(crit.intensity === 'rest' && crit.workingVolumePct === 0, 'crítica -> descanso');

// Moderada + dia pesado + 1 sinal -> reduce
const mod = m.recommendSessionAdaptation({ recoveryScore: 60, recoveryCategory: 'moderate', cardioAcwr: 1.35, todayIsHeavyCompound: true, primaryMuscleToday: 'back', daysSinceLastWorkout: 2 });
ok(mod.intensity === 'reduce' && mod.workingVolumePct === 70, 'moderada+pesado -> reduce 30%');

// Primeiro treino -> segue plano
const first = m.recommendSessionAdaptation({ recoveryScore: 70, recoveryCategory: 'good', daysSinceLastWorkout: 999 });
ok(first.intensity === 'normal' && first.workingVolumePct === 100 && /Primeiro treino/.test(first.explanation), 'primeiro treino -> segue plano');

if (fail) { console.error(fail + ' testes falharam'); process.exit(1); } else console.log('TODOS OS TESTES PASSARAM');
