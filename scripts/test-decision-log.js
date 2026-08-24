const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/edn/decision-log.ts --outDir scripts/.tmp/dlog --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/dlog/decision-log.js');
let fail=0; const ok=(c,x)=>{ if(!c){console.error('FAIL:',x);fail++;} else console.log('ok:',x); };
ok(m.evaluateOutcome(null)==='sem dados suficientes','sem dados');
ok(m.evaluateOutcome(3)==='performance voltou a subir','subiu');
ok(m.evaluateOutcome(0)==='performance estabilizou','estabilizou');
ok(m.evaluateOutcome(-5)==='performance ainda em queda','queda');
if(fail){process.exit(1);} else console.log('TODOS OS TESTES PASSARAM');
