import { computeCardioRecommendationPatch } from '../src/lib/edn/cardio-recommendation';
let pass=0, fail=0;
const ok=(n:string,c:boolean,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('FAIL  '+n+(x?'  » '+x:''));}};

const base={training_days:{type:'HIIT',duration_min:15,intensity:'moderada',when:'após treino',notes:'sprints'},rest_days:{type:'Z2',duration_min:30,intensity:'leve',notes:''},frequency_per_week:3,general_notes:'x'};

// trocar HIIT por Z2 LISS
{
  const r=computeCardioRecommendationPatch(base,{trainingType:'Z2 LISS',trainingDurationMin:30,trainingIntensity:'leve'})!;
  ok('HIIT→Z2 LISS 30 leve', r.training_days.type==='Z2 LISS'&&r.training_days.duration_min===30&&r.training_days.intensity==='leve', JSON.stringify(r.training_days));
  ok('preserva when/notes', r.training_days.when==='após treino'&&r.training_days.notes==='sprints');
  ok('rest_days preservado', r.rest_days.type==='Z2'&&r.rest_days.duration_min===30);
}
// remover
{
  ok('remove → null', computeCardioRecommendationPatch(base,{remove:true})===null);
}
// merge parcial (só intensidade)
{
  const r=computeCardioRecommendationPatch(base,{trainingIntensity:'leve'})!;
  ok('só intensidade muda; type/duração ficam', r.training_days.type==='HIIT'&&r.training_days.duration_min===15&&r.training_days.intensity==='leve');
}
// sem cardio atual → usa defaults
{
  const r=computeCardioRecommendationPatch(null,{trainingType:'Z2 LISS'})!;
  ok('cardio ausente → cria com defaults', r.training_days.type==='Z2 LISS'&&r.rest_days.type==='Z2 LISS'&&r.training_days.duration_min===20);
}
console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail===0?0:1);
