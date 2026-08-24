const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/athlete-os/athlete-state-2.ts src/lib/edn/physical-condition-engine.ts src/lib/edn/condition-mapping.ts --outDir scripts/.tmp/as2 --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/as2/athlete-os/athlete-state-2.js');
let fail=0; const ok=(c,msg)=>{ if(!c){console.error('FAIL:',msg);fail++;} else console.log('ok:',msg); };
const base=(o={})=>({ recovery:{category:'good',score:70,usedWearable:true}, nutrition:{adherencePct:90}, injuryRisk:'none', ...o });
const extras=(o={})=>({ conditions:[], discomforts:[], sleep:{hours:8,quality:'good'}, calendar:{plannedThisWeek:4,doneThisWeek:2,nextWorkoutLabel:'A'}, race:{date:null,weeksAway:null,name:null}, adherence:{training:90,nutrition:90,overall:90}, strengths:['chest'], trends:{strengthPct:2,volumePct:3,weightKgPerWeek:-0.3,cardioAcwr:0.9}, ...o });

// segurança
ok(m.deriveSafetyLevel({conditions:[{confirmed:true,status:'recovering',restricted:[]}],discomforts:[]},'none')==='block','condição recovering -> block');
ok(m.deriveSafetyLevel({conditions:[],discomforts:[{recommend:true}]},'none')==='block','desconforto recorrente -> block');
ok(m.deriveSafetyLevel({conditions:[{confirmed:true,status:'cleared',restricted:[]}],discomforts:[]},'none')==='intervene','condição liberada -> intervene');
ok(m.deriveSafetyLevel({conditions:[],discomforts:[]},'low')==='watch','risco baixo -> watch');
ok(m.deriveSafetyLevel({conditions:[],discomforts:[]},'none')==='none','sem nada -> none');

// limitador: prioridade segurança
const s1=m.buildAthleteStateV2(base(), extras({conditions:[{id:'x',region:'knee',side:'na',status:'recovering',restricted:['agachamento'],confirmed:true}]}));
ok(s1.safetyLevel==='block' && s1.limiter.key==='safety','limitador = segurança quando bloqueado');

// recuperação limita
const s2=m.buildAthleteStateV2(base({recovery:{category:'low',score:45,usedWearable:true}}), extras());
ok(s2.limiter.key==='recovery','recuperação baixa -> limitador recovery');

// sono
const s3=m.buildAthleteStateV2(base(), extras({sleep:{hours:5,quality:'poor'}}));
ok(s3.limiter.key==='sleep','sono<6 -> limitador sleep');

// cardio load
const s4=m.buildAthleteStateV2(base(), extras({trends:{strengthPct:2,volumePct:2,weightKgPerWeek:-0.2,cardioAcwr:1.6}}));
ok(s4.limiter.key==='cardio_load','ACWR alto -> limitador cardio_load');

// superset preserva base + adiciona blocos
ok(Array.isArray(s1.conditions) && s1.sleep && s1.calendar && s1.trends && 'safetyLevel' in s1,'superset com blocos novos');
ok(s1.recovery.category==='good','base preservada');

if(fail){console.error(fail+' falharam');process.exit(1);} else console.log('TODOS OS TESTES PASSARAM');
