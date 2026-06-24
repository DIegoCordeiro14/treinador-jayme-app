const V = require('./.tmp/volume-analysis.js');
const P = require('./.tmp/progression-engine.js');
let pass=0,fail=0; const check=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?' → '+x:'')));};

console.log('\n== volume-analysis ==');
let v=V.analyzeMuscleVolume({ muscle:'chest', setsThisWeek:24, setsPrevWeek:12, frequency:2, perfTrendPct:-5 });
check('peito 12→24 + perf↓ → excessivo, reduz', v.status==='excessivo' && v.recommendedSets<24, JSON.stringify(v));
v=V.analyzeMuscleVolume({ muscle:'back', setsThisWeek:15, setsPrevWeek:14, frequency:2, perfTrendPct:2 });
check('15 séries → ideal', v.status==='ideal');
v=V.analyzeMuscleVolume({ muscle:'biceps', setsThisWeek:5, setsPrevWeek:5, frequency:1, perfTrendPct:0 });
check('5 séries → abaixo, recomenda subir', v.status==='abaixo' && v.recommendedSets>5);
v=V.analyzeMuscleVolume({ muscle:'legs', setsThisWeek:26, setsPrevWeek:24, frequency:2, perfTrendPct:1 });
check('26 séries (>MRV) → excessivo', v.status==='excessivo');

console.log('\n== progression-engine ==');
let p=P.suggestProgression({ weightKg:80, reps:12, rir:2, repsMin:8, repsMax:12 });
check('bateu topo + folga → sobe carga', p.type==='increase_load' && p.nextWeightKg===82.5, JSON.stringify(p));
p=P.suggestProgression({ weightKg:100, reps:10, rir:1, repsMin:6, repsMax:10 });
check('100kg topo → +5kg', p.nextWeightKg===105, String(p.nextWeightKg));
p=P.suggestProgression({ weightKg:80, reps:9, rir:3, repsMin:8, repsMax:12 });
check('dentro da faixa folgado → +1 rep', p.type==='increase_reps' && p.nextReps===10, JSON.stringify(p));
p=P.suggestProgression({ weightKg:80, reps:6, rir:0, repsMin:8, repsMax:12 });
check('abaixo do mínimo + falha → reduzir', p.type==='reduce', JSON.stringify(p));
p=P.suggestProgression({ weightKg:0, reps:40, rir:null, repsMin:30, repsMax:45, isIsometric:true, lastSeconds:45 });
check('isométrico no topo → +10s', p.type==='increase_time' && p.nextSeconds===55, JSON.stringify(p));

console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`); process.exit(fail?1:0);
