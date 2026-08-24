const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/edn/deload-engine.ts src/lib/edn/reps-range.ts --outDir scripts/.tmp/dl --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/dl/deload-engine.js');
let fail = 0; const ok = (c, msg) => { if (!c) { console.error('FAIL:', msg); fail++; } else console.log('ok:', msg); };

const S = (day, w, reps, rir, type='working') => ({ performedAt: `2026-01-0${day}T10:00:00Z`, weightKg: w, reps, rir, setType: type, completed: true });

// histórico: 3 sessões, top 100kg estável, working 90kg
const hist = [
  S(1,100,6,2,'top'), S(1,90,8,2), S(1,90,8,2),
  S(2,100,6,1,'top'), S(2,90,8,1), S(2,90,7,1),
  S(3,100,5,0,'top'), S(3,90,7,0), S(3,90,6,0),
];

// recentTopKg
ok(m.recentTopKg(hist) === 100, 'top recente = 100kg');

// deload signal: estagnado + RIR baixo -> recomendado
ok(m.deloadSignal(hist).recommended === true, 'sinal de deload recomendado (estagnação+RIR baixo)');
// histórico progredindo -> não recomendado
const prog = [ S(1,80,8,3,'top'), S(2,85,8,3,'top'), S(3,90,8,3,'top') ];
ok(m.deloadSignal(prog).recommended === false, 'progredindo -> deload não recomendado');
// histórico curto -> não recomendado
ok(m.deloadSignal([S(1,80,8,2,'top')]).recommended === false, 'histórico curto -> não recomendado');

// computeExerciseDeload: carga -12% arredondada a 2.5, séries *0.6
const d = m.computeExerciseDeload(hist, 4, 6, 12);
ok(d.fromTopKg === 100, 'deload fromTop 100');
ok(d.deloadLoadKg === 87.5 || d.deloadLoadKg === 90, 'carga deload ~88kg (' + d.deloadLoadKg + ')'); // 100*0.88=88 -> round 2.5 = 87.5
ok(d.deloadSets === 2, 'séries deload 4*0.6->2');
ok(d.deloadReps >= 6 && d.deloadReps <= 12, 'reps deload dentro da faixa');
ok(d.confidence > 0 && d.confidence <= 1, 'confiança 0..1');

// sem histórico: só reduz volume, carga null
const none = m.computeExerciseDeload([], 3, 8, 12);
ok(none.fromTopKg === null && none.deloadLoadKg === null && none.deloadSets === 2, 'sem histórico: reduz volume, carga null');

// reps fora da faixa são clampeadas: histórico com reps 20 e faixa 6-10
const hr = [ S(1,50,20,2,'top'), S(2,50,20,2,'top'), S(3,50,20,2,'top') ];
const dr = m.computeExerciseDeload(hr, 3, 6, 10);
ok(dr.deloadReps === 10, 'reps clampeadas ao máx da faixa (10)');

if (fail) { console.error(fail + ' testes falharam'); process.exit(1); } else console.log('TODOS OS TESTES PASSARAM');
