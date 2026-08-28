// Suíte agregada Evolução v2 (Fase 1) — compila e roda todos os motores.
const cp = require('child_process'); const path = require('path');
const tsc = path.join(__dirname,'..','node_modules','.bin','tsc');
const files = ['body-metrics-unifier','evolution-signal-engine','recomposition-plateau-engine',
  'goal-progress-engine','before-after-engine','evolution-intelligence-engine']
  .map(f=>`src/lib/edn/${f}.ts`);
cp.execSync(`${tsc} ${files.join(' ')} --outDir scripts/.tmp/suite --module commonjs --target es2019 --skipLibCheck`,{cwd:path.join(__dirname,'..'),stdio:'inherit'});
const { buildEvolutionState } = require('./.tmp/suite/evolution-intelligence-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const day=(d)=>{const b=new Date('2026-08-28').getTime(); return new Date(b-d*86400000).toISOString().slice(0,10);};

// cenário integrado: cutting indo bem
const pts=[]; for(let i=0;i<8;i++){const d=48-i*6; pts.push({dateISO:day(d),weightKg:98-i*0.35,bodyFatPct:24-i*0.3,leanKg:73,waistCm:92-i*0.25,source:'bioimpedance'});}
const st = buildEvolutionState({goalRaw:'emagrecimento',bodyPoints:pts,strengthDeltaPct:2,volumeDeltaPct:3,sessionsDone:16,sessionsPlanned:16,recoveryScore:72,recoveryLabel:'boa',daysLogged:11,logWindowDays:14});
ok('cutting: objetivo', st.goal==='cutting');
ok('cutting: status positivo', st.status==='positive');
ok('cutting: peso sinal confirmado (perda longa)', st.metrics.find(m=>m.key==='weightKg').signal==='confirmed');
ok('cutting: goal progress on track', st.goalProgress.onTrack);
ok('cutting: whatChanged menciona gordura/peso', st.whatChanged.join(' ').toLowerCase().match(/gordura|peso/)!=null);

console.log(`\nevolution-suite (integração): ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
