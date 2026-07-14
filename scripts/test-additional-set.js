const E=require('./.tmp/as/additional-set-engine.js');
let pass=0,fail=0; const check=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?' → '+x:'')));};
const ctx=(over={})=>Object.assign({ requestedSetType:'working', topSetKg:100, completedSets:[{kind:'top',weightKg:100,reps:8,rir:2},{kind:'working',weightKg:90,reps:9,rir:1}], muscleWeeklySets:10, estimatedMrv:22, recoveryScore:80, repsMin:8, repsMax:12 }, over);
console.log('\n== evaluateAdditionalSet ==');
let d=E.evaluateAdditionalSet(ctx({ requestedSetType:'aquecimento' }));
check('aquecimento → permitido, não conta volume, ~65% top', d.allowed && !d.impactsWeeklyVolume && d.suggested.weightKg<=70);
d=E.evaluateAdditionalSet(ctx({ requestedSetType:'feeder' }));
check('feeder → ~80% top, RIR alto', Math.abs(d.suggested.weightKg-80)<=5 && d.suggested.rir>=4);
d=E.evaluateAdditionalSet(ctx({ requestedSetType:'top' }));
check('top extra → exige confirmação + warning high', d.requiresConfirmation && d.warningLevel==='high');
d=E.evaluateAdditionalSet(ctx({ requestedSetType:'corrective' }));
check('corretiva → não conta volume, técnica', !d.impactsWeeklyVolume && /técnica/i.test(d.reason));

console.log('\n== working: volume/fadiga ==');
d=E.evaluateAdditionalSet(ctx()); // estável
check('desempenho estável → permitido, warning none', d.allowed && d.warningLevel==='none', d.warningLevel);
d=E.evaluateAdditionalSet(ctx({ completedSets:[{kind:'top',weightKg:100,reps:8,rir:2},{kind:'working',weightKg:100,reps:5,rir:0}] })); // queda grande
check('queda >=20% → NÃO recomendado', d.allowed===false && d.warningLevel==='high', JSON.stringify({a:d.allowed,w:d.warningLevel}));
d=E.evaluateAdditionalSet(ctx({ muscleWeeklySets:24 })); // acima do MRV
check('acima do MRV → warning moderate/high', d.warningLevel==='moderate'||d.warningLevel==='high');
d=E.evaluateAdditionalSet(ctx({ recoveryScore:40 }));
check('recuperação baixa → warning', d.warningLevel!=='none');
d=E.evaluateAdditionalSet(ctx({ requestedSetType:'backoff' }));
check('back-off → sugere carga reduzida do último working', d.suggested.weightKg<=90);
console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`); process.exit(fail?1:0);
