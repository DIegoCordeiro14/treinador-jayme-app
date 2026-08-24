const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/edn/physical-condition-engine.ts src/lib/edn/condition-mapping.ts --outDir scripts/.tmp/sf --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/sf/physical-condition-engine.js');
let fail=0; const ok=(c,msg)=>{ if(!c){console.error('FAIL:',msg);fail++;} else console.log('ok:',msg); };
const cond=(o)=>({ conditionType:'injury', side:'na', userConfirmed:true, ...o });

// sem condição -> compatível
ok(m.evaluateExerciseSafety({name:'Agachamento livre'},[]).status==='compatible','sem condição -> compatível');

// joelho em recuperação + agachamento -> restrito
let r=m.evaluateExerciseSafety({name:'Agachamento livre'},[cond({bodyRegion:'knee',status:'recovering'})]);
ok(r.status==='restricted','joelho recovering + agachamento -> restrito');
ok(r.reasons.length>0 && r.matchedRegions.includes('knee'),'motivo e região presentes');

// joelho + supino (não bate) -> compatível
ok(m.evaluateExerciseSafety({name:'Supino reto'},[cond({bodyRegion:'knee',status:'recovering'})]).status==='compatible','joelho + supino -> compatível');

// ombro liberado + desenvolvimento -> cautela (não bloqueia)
ok(m.evaluateExerciseSafety({name:'Desenvolvimento militar'},[cond({bodyRegion:'shoulder',status:'cleared'})]).status==='caution','ombro liberado -> cautela');

// status parcial -> cautela
ok(m.evaluateExerciseSafety({name:'Leg press'},[cond({bodyRegion:'knee',status:'partial'})]).status==='caution','parcial -> cautela');

// desconhecido -> cautela + requiresProfessionalReview
let u=m.evaluateExerciseSafety({name:'Extensora'},[cond({bodyRegion:'knee',status:'unknown'})]);
ok(u.status==='caution' && u.requiresProfessionalReview===true,'desconhecido -> cautela + revisão profissional');

// movimento restrito explícito confirmado -> restrito
ok(m.evaluateExerciseSafety({name:'Rosca direta com barra'},[cond({bodyRegion:'elbow',status:'cleared',restrictedMovements:['rosca direta']})]).status==='restricted','movimento restrito explícito -> restrito');

// condição não confirmada -> ignorada
ok(m.evaluateExerciseSafety({name:'Agachamento livre'},[cond({bodyRegion:'knee',status:'recovering',userConfirmed:false})]).status==='compatible','não confirmada -> ignorada');

// bilateral: mesma regra
ok(m.evaluateExerciseSafety({name:'Afundo'},[cond({bodyRegion:'knee',status:'rehab',side:'bilateral'})]).status==='restricted','bilateral rehab -> restrito');

// cardio: joelho recovering + corrida -> restrito; bicicleta -> compatível
ok(m.evaluateCardioSafety('Corrida',[cond({bodyRegion:'knee',status:'recovering'})]).status==='restricted','corrida + joelho recovering -> restrito');
ok(m.evaluateCardioSafety('Bicicleta',[cond({bodyRegion:'knee',status:'recovering'})]).status==='compatible','bicicleta + joelho -> compatível');

// status geral
ok(m.trainingSafetyStatus([]).level==='none','status none');
ok(m.trainingSafetyStatus([cond({bodyRegion:'knee',status:'recovering'})]).level==='restricted','status restricted');
ok(m.trainingSafetyStatus([cond({bodyRegion:'knee',status:'cleared'})]).level==='watch','status watch (liberado mas acompanhando)');

// normalização de região/lado
ok(m.__proto__ === undefined || true, 'noop');
const cm=require('./.tmp/sf/condition-mapping.js');
ok(cm.normalizeRegion('Reconstrução do LCA joelho direito')==='knee','normaliza LCA -> knee');
ok(cm.normalizeRegion('hérnia de disco lombar')==='spine','normaliza lombar -> spine');
ok(cm.normalizeSide('joelho direito')==='right','normaliza lado direito');

if(fail){console.error(fail+' falharam');process.exit(1);} else console.log('TODOS OS TESTES PASSARAM');
