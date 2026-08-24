const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/edn/feedback-loop-engine.ts --outDir scripts/.tmp/fl --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/fl/feedback-loop-engine.js');
let fail = 0; const ok = (c, msg) => { if (!c) { console.error('FAIL:', msg); fail++; } else console.log('ok:', msg); };
const S = (d,w,reps,rir) => ({ performedAt:`2026-01-0${d}T10:00Z`, topWeightKg:w, reps, rir, repsMin:8, repsMax:12 });

// overreaching: carga sobe, RIR cai
ok(m.analyzeFeedbackLoop([S(1,80,10,3),S(2,82.5,9,2),S(3,85,8,1),S(4,87.5,8,0)]).trajectory === 'overreaching', 'overreaching detectado');
const ov = m.analyzeFeedbackLoop([S(1,80,10,3),S(2,82.5,9,2),S(3,85,8,1),S(4,87.5,8,0)]);
ok(ov.model === 'deload', 'overreaching na falha -> deload');
ok(/subiu|caindo|esforço/i.test(ov.reason) && ov.learned.length > 0, 'explica e aprende');

// progressão saudável
const pr = m.analyzeFeedbackLoop([S(1,80,10,3),S(2,82.5,10,3),S(3,85,10,3)]);
ok(pr.trajectory === 'progressing' && pr.model === 'double_progression', 'progressão saudável');

// estagnação com margem -> reps_first (reps abaixo do topo)
const st = m.analyzeFeedbackLoop([S(1,80,9,3),S(2,80,9,3),S(3,80,9,2)]);
ok(st.trajectory === 'stalling' && st.model === 'reps_first', 'estagnado c/ margem -> reps_first');

// estagnação no topo -> double_progression
const top = m.analyzeFeedbackLoop([S(1,80,12,2),S(2,80,12,2),S(3,80,12,2)]);
ok(top.model === 'double_progression', 'estagnado no topo -> subir carga');

// regressão profunda -> trocar exercício
const rg = m.analyzeFeedbackLoop([S(1,80,7,0),S(2,80,7,0),S(3,80,6,0)]);
ok(rg.trajectory === 'regressing' && rg.model === 'change_exercise', 'plateau profundo -> trocar exercício');

// histórico curto
ok(m.analyzeFeedbackLoop([S(1,80,10,2)]).trajectory === 'insufficient', 'curto -> insufficient');

if (fail) { console.error(fail+' falharam'); process.exit(1);} else console.log('TODOS OS TESTES PASSARAM');
