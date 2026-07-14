const R=require('./.tmp/rr/reps-range.js');
const L=require('./.tmp/rr/load-intelligence.js');
const A=require('./.tmp/rr/additional-set-engine.js');
let pass=0,fail=0; const check=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?' → '+x:'')));};
console.log('\n== clamp central ==');
check('acima do teto → teto', R.clampRepsToExerciseRange(20,8,12)===12);
check('abaixo do minimo → minimo', R.clampRepsToExerciseRange(3,8,12)===8);
check('dentro → mantem', R.clampRepsToExerciseRange(10,8,12)===10);
check('validate fora → adjusted', R.validateReps(20,8,12).adjusted===true && R.validateReps(20,8,12).reps===12);
check('validate dentro → nao adjusted', R.validateReps(9,8,12).adjusted===false);
check('duracao clamp', R.clampDurationToRange(120,30,60)===60);
console.log('\n== load-intelligence: TODAS as series dentro da faixa ==');
let p=L.prescribeLoads({ history:[{weightKg:80,reps:12,rir:1,dateMs:1}], repsMin:8, repsMax:12, isCompound:true, workingSetsCount:3, recoveryCategory:'good' });
check('nenhuma serie com reps fora de 8-12', p.sets.every(s=>s.reps>=8 && s.reps<=12), JSON.stringify(p.sets.map(s=>s.kind+':'+s.reps)));
// faixa estreita 6-6
let p2=L.prescribeLoads({ history:[{weightKg:100,reps:6,rir:1,dateMs:1}], repsMin:6, repsMax:6, isCompound:true, workingSetsCount:2, recoveryCategory:'good' });
check('faixa 6-6 → todas exatamente 6', p2.sets.every(s=>s.reps===6), JSON.stringify(p2.sets.map(s=>s.reps)));
console.log('\n== additional-set: dentro da faixa ==');
const ctx={ topSetKg:100, completedSets:[{kind:'top',weightKg:100,reps:8,rir:2}], muscleWeeklySets:8, estimatedMrv:22, recoveryScore:80, repsMin:8, repsMax:10 };
['aquecimento','feeder','working','backoff','corrective','top'].forEach(t=>{
  const d=A.evaluateAdditionalSet({...ctx, requestedSetType:t});
  check(t+' → reps dentro de 8-10', d.suggested && d.suggested.reps>=8 && d.suggested.reps<=10, JSON.stringify(d.suggested));
});
console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`); process.exit(fail?1:0);
