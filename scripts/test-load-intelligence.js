const E = require('./.tmp/load-intelligence.js');
let pass=0,fail=0; const check=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?' → '+x:'')));};
const inp = (over={}) => Object.assign({ history:[{weightKg:82.5,reps:12,rir:1,dateMs:1}], repsMin:8, repsMax:12, isCompound:true, workingSetsCount:3, recoveryCategory:'good' }, over);

console.log('\n== escada completa (todas as séries) ==');
let p=E.prescribeLoads(inp());
check('gera aquecimento(s) + feeder(s) + top + working', ['aquecimento','feeder','top','working'].every(k=>p.sets.some(s=>s.kind===k)), p.sets.map(s=>s.kind).join(','));
check('todas as séries têm carga > 0', p.sets.every(s=>s.weightKg>0));
check('todas têm pctOfTop e confiança', p.sets.every(s=>s.pctOfTop!=null && s.confidence!=null));
const warm=p.sets.filter(s=>s.kind==='aquecimento'), feed=p.sets.filter(s=>s.kind==='feeder'), work=p.sets.filter(s=>s.kind==='working');
check('aquecimento < feeder < top', Math.max(...warm.map(s=>s.weightKg)) <= Math.max(...feed.map(s=>s.weightKg)) && Math.max(...feed.map(s=>s.weightKg)) < p.topSet.weightKg);
check('working < top e decrescente', work.every(s=>s.weightKg<p.topSet.weightKg) && work[0].weightKg>=work[work.length-1].weightKg, work.map(s=>s.weightKg).join(','));
check('reps do working dentro do intervalo', work.every(s=>s.reps>=8 && s.reps<=12));
check('reps do aquecimento decrescem', warm.length<2 || warm[0].reps>=warm[warm.length-1].reps);
check('confiança geral 0-100', p.confidence>=0 && p.confidence<=100);

console.log('\n== progressão proporcional (top sobe → tudo sobe) ==');
let p1=E.prescribeLoads(inp({ history:[{weightKg:82.5,reps:12,rir:1,dateMs:1}] })); // bate topo → sobe
let p0=E.prescribeLoads(inp({ history:[{weightKg:82.5,reps:9,rir:3,dateMs:1}] }));  // mantém
check('top sobe quando bate o teto', p1.topSet.weightKg>82.5, String(p1.topSet.weightKg));
check('feeders/working acompanham o top', p1.sets.find(s=>s.kind==='feeder').weightKg >= p0.sets.find(s=>s.kind==='feeder').weightKg);

console.log('\n== recuperação/deload afetam a sessão ==');
let plow=E.prescribeLoads(inp({ recoveryCategory:'low' }));
check('recuperação baixa → working mais leve que em good', plow.sets.filter(s=>s.kind==='working')[0].weightKg <= p.sets.filter(s=>s.kind==='working')[0].weightKg);
let pdel=E.prescribeLoads(inp({ deloadActive:true }));
check('deload → top reduzido', pdel.topSet.weightKg<82.5 && /Deload/i.test(pdel.strategy));

console.log('\n== roundToAvailableLoad ==');
check('sem opções → 2.5kg', E.roundToAvailableLoad(83.7)===82.5 || E.roundToAvailableLoad(83.7)===85);
check('halteres disponíveis → mais próximo', E.roundToAvailableLoad(23, { available:[20,22,24,26] })===22 || E.roundToAvailableLoad(23,{available:[20,22,24,26]})===24);
check('step custom 5kg', E.roundToAvailableLoad(83.7, { step:5 })===85);

console.log('\n== lastSetPerformanceScore ==');
check('mesma carga +1 rep → progresso', E.lastSetPerformanceScore({weightKg:70,reps:8,rir:0},{weightKg:70,reps:9,rir:1}).score>=60);
check('caiu → score baixo', E.lastSetPerformanceScore({weightKg:70,reps:9,rir:1},{weightKg:70,reps:6,rir:0}).score<50);

console.log('\n== adjustWorkingAfterTop ==');
check('top abaixo → reduz working', E.adjustWorkingAfterTop({kind:'top',weightKg:85,reps:8},6,0,75).weightKg<75);
check('top forte → mantém', E.adjustWorkingAfterTop({kind:'top',weightKg:85,reps:8},10,2,75).weightKg===75);

console.log('\n== sem histórico → null ==');
check('sem histórico → null', E.prescribeLoads(inp({ history:[] }))===null);
console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`); process.exit(fail?1:0);
