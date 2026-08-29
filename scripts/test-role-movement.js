const { assignRole, targetComposition, compositionGaps } = require('./.tmp/rm/exercise-role-engine.js');
const { analyzeCoverage } = require('./.tmp/rm/movement-pattern-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// ROLE
ok('composto+força => PRIMARY_STRENGTH', assignRole({id:'a',name:'Agacho',is_compound:true,difficulty:'advanced',objective:'strength'})==='PRIMARY_STRENGTH');
ok('composto+hipertrofia => PRIMARY_HYPERTROPHY', assignRole({id:'b',name:'Supino',is_compound:true,difficulty:'intermediate',objective:'hypertrophy'})==='PRIMARY_HYPERTROPHY');
ok('isolado => ISOLATION', assignRole({id:'c',name:'Rosca',is_compound:false,difficulty:'beginner',objective:'hypertrophy'})==='ISOLATION');
ok('corretivo => CORRECTIVE', assignRole({id:'d',name:'Face pull',is_compound:false,difficulty:'beginner',objective:'hypertrophy',isCorrective:true})==='CORRECTIVE');

const comp = targetComposition('hypertrophy', 6);
ok('composição soma ~6', comp.PRIMARY+comp.SECONDARY+comp.HYPERTROPHY+comp.ISOLATION===6);
ok('força tem 2 primários', targetComposition('strength',6).PRIMARY===2);

const gaps = compositionGaps(['ISOLATION','ISOLATION','ISOLATION'], comp);
ok('detecta falta de primário', gaps.some(g=>/primário/.test(g)));
ok('sem gaps quando composição ok', compositionGaps(['PRIMARY_HYPERTROPHY','SECONDARY_COMPOUND','PRIMARY_HYPERTROPHY','ISOLATION'], comp).length===0);

// MOVEMENT COVERAGE
const cov = analyzeCoverage('hypertrophy', ['squat','horizontal_push','horizontal_pull','vertical_pull']);
ok('cobertura calculada', cov.coveragePct>0 && cov.coveragePct<=100);
ok('lista faltantes', cov.missing.length>0 && cov.missing.includes('hinge'));
const full = analyzeCoverage('definition', ['squat','horizontal_push','horizontal_pull','vertical_pull']);
ok('definição coberta => adequate', full.adequate===true);
ok('objetivo desconhecido cai em default', analyzeCoverage('hypertrophy',[]).coveragePct===0);

console.log(`\nrole + movement: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
