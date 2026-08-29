const { reorderDay, reorderPlan } = require('./.tmp/pp/plan-postprocess.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

const meta = {
  sup:{id:'sup',name:'Supino reto',muscle_group:'chest',equipment:'barbell',is_compound:true,difficulty:'intermediate'},
  rosca:{id:'rosca',name:'Rosca direta',muscle_group:'biceps',equipment:'dumbbell',is_compound:false,difficulty:'beginner'},
  agacho:{id:'agacho',name:'Agachamento livre',muscle_group:'legs',equipment:'barbell',is_compound:true,difficulty:'advanced'},
  cruc:{id:'cruc',name:'Crucifixo',muscle_group:'chest',equipment:'dumbbell',is_compound:false,difficulty:'beginner'},
};
// IA entregou isolado antes do composto — pós-processo deve corrigir
const day = [
  {exerciseId:'rosca',sets:3,targetRir:2},
  {exerciseId:'cruc',sets:3,targetRir:2},
  {exerciseId:'sup',sets:4,targetRir:2},
  {exerciseId:'agacho',sets:4,targetRir:1},
];
const ordered = reorderDay(day, { metaById:meta, priorityMuscles:['chest'], objective:'hypertrophy' });
ok('preserva o conjunto (4 exercícios)', ordered.length===4);
ok('não duplica', new Set(ordered.map(e=>e.exerciseId)).size===4);
const idx=(id)=>ordered.findIndex(e=>e.exerciseId===id);
ok('composto de prioridade (supino) antes de isolado (rosca)', idx('sup') < idx('rosca'));
ok('composto (agacho) antes de isolado (crucifixo? peito prioridade)', idx('agacho') < idx('rosca'));

// cautela vem primeiro
const withCaution = reorderDay(day, { metaById:meta, priorityMuscles:['chest'], cautionIds:['agacho'], objective:'hypertrophy' });
ok('exercício com cautela vai para o início', withCaution[0].exerciseId==='agacho');

// preserva sets/notes
ok('preserva atributos (sets)', ordered.find(e=>e.exerciseId==='sup').sets===4);

// plano inteiro
const plan = reorderPlan([{dayIndex:0,exercises:day}], { metaById:meta, priorityMuscles:['chest'], objective:'hypertrophy' });
ok('reordena todos os dias', plan[0].exercises.length===4 && plan[0].dayIndex===0);

// ids desconhecidos não quebram
const weird = reorderDay([{exerciseId:'zzz',sets:3}], { metaById:meta, priorityMuscles:[] });
ok('id desconhecido preservado', weird.length===1 && weird[0].exerciseId==='zzz');

console.log(`\nplan-postprocess: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
