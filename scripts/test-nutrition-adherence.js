const { analyzeNutritionAdherence, toleranceFor } = require('./.tmp/nad/nutrition-adherence-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

const targets = { calories:2400, protein:180, carbs:250, fat:70 };
const day=(d,o={})=>({dateISO:`2026-08-${String(d).padStart(2,'0')}`,calories:2400,protein:180,carbs:250,fat:70,...o});

// 10 dias no alvo, período 14 => logging ~0.71, target alto
const good = analyzeNutritionAdherence(Array.from({length:10},(_,i)=>day(i+1)), targets, 'weight_loss', 14);
ok('logging = 10/14', Math.abs(good.loggingAdherence-0.71)<0.02);
ok('target adherence alto', good.targetAdherence>=0.9);
ok('logged days = 10', good.loggedDays===10);

// proteína abaixo penaliza; acima não
const lowP = analyzeNutritionAdherence(Array.from({length:8},(_,i)=>day(i+1,{protein:120})), targets, 'weight_loss', 8);
ok('proteína baixa reduz aderência de proteína', lowP.perMacro.protein.adherence < 0.5);
const highP = analyzeNutritionAdherence(Array.from({length:8},(_,i)=>day(i+1,{protein:230})), targets, 'weight_loss', 8);
ok('proteína acima do alvo conta como ok', highP.perMacro.protein.adherence===1);

// carbo tem tolerância maior no cutting que proteína
const tol = toleranceFor('weight_loss');
ok('carbo mais tolerante que proteína (cutting)', tol.carbs > tol.protein);
const endur = toleranceFor('performance');
ok('endurance aperta carbo', endur.carbs < tol.carbs);

// separação logging vs target: registra tudo mas fora das metas
const off = analyzeNutritionAdherence(Array.from({length:14},(_,i)=>day(i+1,{calories:3200,carbs:400})), targets, 'weight_loss', 14);
ok('logging alto', off.loggingAdherence>=0.95);
ok('target adherence baixo (fora das metas)', off.targetAdherence < 0.8);
ok('weakest macro identificado', off.weakestMacro!==null);

// zero registros
const empty = analyzeNutritionAdherence([], targets, 'hypertrophy', 14);
ok('sem registros => logging 0', empty.loggingAdherence===0 && empty.loggedDays===0);
ok('nota de sem registros', /Sem registros/.test(empty.note));

console.log(`\nnutrition-adherence: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
