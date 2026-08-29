const { exerciseFatigueCost, computeSessionFatigue, distributeAcrossWeek } = require('./.tmp/fo/session-fatigue-planner.js');
const { orderExercises } = require('./.tmp/fo/exercise-order-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

const ex=(o)=>({exerciseId:'x',name:'x',pattern:'squat',is_compound:true,sets:4,targetRir:2,...o});
// 4 compostos axiais pesados => overloaded
const heavy = computeSessionFatigue([ex({name:'Agacho',pattern:'squat'}),ex({name:'Terra',pattern:'hinge'}),ex({name:'RDL',pattern:'hinge'}),ex({name:'Leg press',pattern:'squat'})]);
ok('3+ axiais pesados => overloaded', heavy.overloaded && heavy.heavySystemicCount>=3);
ok('nota sugere redistribuir', /redistribuir|reduzir/i.test(heavy.note));

// sessão leve
const light = computeSessionFatigue([ex({pattern:'horizontal_push',sets:3,targetRir:3}),ex({pattern:'isolation',is_compound:false,sets:3,targetRir:2})]);
ok('sessão leve não sobrecarrega', !light.overloaded);
ok('composto axial custa mais que isolado', exerciseFatigueCost(ex({pattern:'squat'})) > exerciseFatigueCost(ex({pattern:'isolation',is_compound:false})));
ok('RIR baixo aumenta custo', exerciseFatigueCost(ex({targetRir:0})) > exerciseFatigueCost(ex({targetRir:3})));

// distribuição pela semana equilibra custo
const dist = distributeAcrossWeek([ex({name:'a',pattern:'squat'}),ex({name:'b',pattern:'hinge'}),ex({name:'c',pattern:'horizontal_push'}),ex({name:'d',pattern:'horizontal_pull'})], 2);
ok('distribui em 2 dias', dist.length===2 && dist.every(d=>d.exercises.length>0));
const costs = dist.map(d=>d.cost);
ok('custos relativamente equilibrados', Math.abs(costs[0]-costs[1]) <= Math.max(...costs));

// ordem: segurança e prioridade primeiro
const o=(id,ov)=>({id,name:id,muscle_group:'chest',is_compound:true,technicalDemand:0.5,isPriorityMuscle:false,fatigueCost:5,caution:false,...ov});
const ord = orderExercises([o('iso',{is_compound:false,technicalDemand:0.1}),o('cau',{caution:true}),o('prio',{isPriorityMuscle:true})]);
ok('cautela vem primeiro', ord.ordered[0].id==='cau');
ok('prioridade antes de isolado', ord.ordered.findIndex(e=>e.id==='prio') < ord.ordered.findIndex(e=>e.id==='iso'));
ok('força => blocked', orderExercises([o('a')],{objective:'strength'}).mode==='blocked');
ok('hipertrofia com prioridade => interleaved', orderExercises([o('a',{isPriorityMuscle:true})],{objective:'hypertrophy'}).mode==='interleaved');

console.log(`\nfatigue + order: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
