const E = require('./.tmp/load-intelligence.js');
let pass=0,fail=0; const check=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?' → '+x:'')));};
console.log('\n== prescribeLoads ==');
// bateu o topo (12 reps, RIR 1) → sobe carga
let p=E.prescribeLoads({ history:[{weightKg:80,reps:12,rir:1,dateMs:1}], repsMin:8, repsMax:12, isCompound:true, workingSetsCount:3, recoveryCategory:'good' });
check('bateu topo → top set sobe (>80)', p.topSet.weightKg>80, JSON.stringify(p.topSet));
check('tem aquecimento/feeder/top/working', ['aquecimento','feeder','top','working'].every(k=>p.sets.some(s=>s.kind===k)), p.sets.map(s=>s.kind).join(','));
check('warmup ~45% do top', p.sets.find(s=>s.kind==='aquecimento').weightKg < p.topSet.weightKg*0.6);
check('working < top', p.sets.filter(s=>s.kind==='working').every(s=>s.weightKg<p.topSet.weightKg));
check('estratégia dupla progressão', /Dupla progress/i.test(p.strategy), p.strategy);

// dentro da faixa folgado → progressão por reps (mantém carga)
p=E.prescribeLoads({ history:[{weightKg:80,reps:9,rir:3,dateMs:1}], repsMin:8, repsMax:12, isCompound:true, workingSetsCount:2, recoveryCategory:'good' });
check('folgado dentro da faixa → mantém carga', p.topSet.weightKg===80 && /repeti/i.test(p.strategy), JSON.stringify({w:p.topSet.weightKg,s:p.strategy}));

// recuperação baixa → consolidação
p=E.prescribeLoads({ history:[{weightKg:100,reps:12,rir:1,dateMs:1}], repsMin:8, repsMax:12, isCompound:true, workingSetsCount:3, recoveryCategory:'low' });
check('recuperação baixa → consolidação (mantém)', /Consolida/i.test(p.strategy) && p.topSet.weightKg===100, p.strategy);

// deload → reduz
p=E.prescribeLoads({ history:[{weightKg:100,reps:10,rir:1,dateMs:1}], repsMin:8, repsMax:12, isCompound:true, workingSetsCount:3, recoveryCategory:'good', deloadActive:true });
check('deload → carga reduzida (<100)', p.topSet.weightKg<100 && /Deload/i.test(p.strategy), JSON.stringify(p.topSet));

// sem histórico → null
check('sem histórico → null', E.prescribeLoads({ history:[], repsMin:8, repsMax:12, isCompound:true, workingSetsCount:3, recoveryCategory:'good' })===null);

console.log('\n== adjustWorkingAfterTop ==');
let a=E.adjustWorkingAfterTop({kind:'top',weightKg:85,reps:8}, 6, 0, 75);
check('top abaixo do alvo → reduz working', a.weightKg<75, JSON.stringify(a));
a=E.adjustWorkingAfterTop({kind:'top',weightKg:85,reps:8}, 10, 2, 75);
check('top forte → mantém working', a.weightKg===75);

console.log('\n== roundToIncrement ==');
check('arredonda p/ 2.5', E.roundToIncrement(81.3)===82.5 || E.roundToIncrement(81.3)===80, String(E.roundToIncrement(81.3)));
console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`); process.exit(fail?1:0);
