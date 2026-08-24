const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/athlete-os/athlete-state-2.ts src/lib/edn/physical-condition-engine.ts src/lib/edn/condition-mapping.ts src/lib/edn/alert-severity.ts src/lib/athlete-os/index.ts --outDir scripts/.tmp/v9 --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const S2 = require('./.tmp/v9/athlete-os/athlete-state-2.js');
const AL = require('./.tmp/v9/edn/alert-severity.js');
const OS = require('./.tmp/v9/athlete-os/index.js');
let fail=0; const ok=(c,x)=>{ if(!c){console.error('FAIL:',x);fail++;} else console.log('ok:',x); };

// Cenário-bandeira V9: cutting + recuperação boa MAS lesão de joelho + performance caindo.
// A segurança física deve dominar; cutting NÃO deve forçar treino agressivo.
const base = { recovery:{category:'good',score:78,usedWearable:true}, nutrition:{adherencePct:88}, injuryRisk:'none' };
const extras = { conditions:[{id:'k',region:'knee',side:'na',status:'recovering',restricted:['agachamento'],confirmed:true}], discomforts:[], sleep:{hours:7,quality:'good'}, calendar:{plannedThisWeek:4,doneThisWeek:2,nextWorkoutLabel:'Pernas'}, race:{date:null,weeksAway:null,name:null}, adherence:{training:80,nutrition:88,overall:80}, strengths:['back'], trends:{strengthPct:-8,volumePct:-2,weightKgPerWeek:-0.4,cardioAcwr:1.0} };

const st = S2.buildAthleteStateV2(base, extras);
ok(st.safetyLevel==='block','1) condição de joelho -> safetyLevel=block');
ok(st.limiter.key==='safety','2) limitador principal = segurança (acima do cutting)');

const alerts = AL.computeAlerts({ safetyLevel: st.safetyLevel, recoveryCategory:'good', cardioLoadRisk:'ideal', nutritionAdherencePct:88, strengthTrendPct:-8 });
ok(alerts.level==='block' && alerts.blocks===true,'3) alerta consolidado = 🔴 bloqueante');

const aos = OS.orchestrate({ recoveryCategory:'good', recoveryScore:78, hrvDropPct:0, sleepHours:7, injuryRisk:'none', physicalRestricted:true, recurringDiscomfort:false, restrictedRegions:['knee'], overreaching:false, plateau:false, inDeload:false, cardioLoadRisk:'ideal', strengthTrendPct:-8, weightTrendKg:-0.4, goalIsCut:true, nutritionScore:88, adherencePct:88, weakPointMuscle:'legs', prReady:false });
ok(aos.nextBestAction.domain==='safety','4) decisão única do sistema = segurança (cutting não força treino agressivo)');
ok(aos.decisions.every(d=> d.domain==='safety' || d.kind!=='increase' || d.suppressed),'5) toda progressão suprimida sob restrição física');

if(fail){console.error(fail+' falharam');process.exit(1);} else console.log('TODOS OS TESTES PASSARAM');
