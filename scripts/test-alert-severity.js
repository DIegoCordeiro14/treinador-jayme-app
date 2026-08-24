const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/edn/alert-severity.ts --outDir scripts/.tmp/al --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/al/alert-severity.js');
let fail=0; const ok=(c,x)=>{ if(!c){console.error('FAIL:',x);fail++;} else console.log('ok:',x); };
ok(m.computeAlerts({safetyLevel:'none',recoveryCategory:'good'}).level==='normal','tudo ok -> normal');
const b=m.computeAlerts({safetyLevel:'block',recoveryCategory:'good'});
ok(b.level==='block' && b.blocks===true,'safety block -> 🔴 e blocks=true');
ok(m.computeAlerts({safetyLevel:'none',recoveryCategory:'low'}).level==='intervene','recuperacao baixa -> intervene');
ok(m.computeAlerts({safetyLevel:'none',recoveryCategory:'moderate'}).level==='watch','moderada -> watch');
ok(m.computeAlerts({safetyLevel:'none',recoveryCategory:'good',cardioLoadRisk:'alto'}).level==='intervene','cardio alto -> intervene');
ok(m.computeAlerts({safetyLevel:'none',recoveryCategory:'good',nutritionAdherencePct:40}).level==='intervene','aderencia baixa -> intervene');
ok(m.computeAlerts({safetyLevel:'none',recoveryCategory:'good',strengthTrendPct:-8}).level==='intervene','performance caindo -> intervene');
// safety domina mesmo com outros sinais
const mix=m.computeAlerts({safetyLevel:'block',recoveryCategory:'low',cardioLoadRisk:'alto'});
ok(mix.level==='block' && mix.items[0].domain==='safety','safety no topo mesmo com outros alertas');
if(fail){console.error(fail+' falharam');process.exit(1);} else console.log('TODOS OS TESTES PASSARAM');
