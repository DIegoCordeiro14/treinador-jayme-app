const E = require('./.tmp/cardio-progression-engine.js');
let pass=0,fail=0; const check=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?' → '+x:'')));};
const day=86400000, now=Date.now();
const mk=(i,km,paceMin,hr)=>({dateMs:now-(20-i)*day, km, durationMin:paceMin*km, avgHr:hr});

console.log('\n== detectPersonalRecords ==');
let prs=E.detectPersonalRecords([mk(0,5,6.4,160), mk(1,5,5.6,158), mk(2,10,6.0,165)]);
check('PR de 5km usa a corrida mais rápida', prs.find(p=>p.label==='5km').paceMinPerKm===5.6, JSON.stringify(prs.find(p=>p.label==='5km')));
check('detecta PR de 10km', prs.some(p=>p.label==='10km'));

console.log('\n== computeCardioEvolution ==');
// pace melhorando + recuperação boa → pode subir, metas progressivas
let runs=[]; for(let i=0;i<10;i++) runs.push(mk(i, 5, i<5?6.2:5.7, i<5?162:150));
let ev=E.computeCardioEvolution({ runs, recoveryCategory:'good', goal:'performance' });
check('eficiência melhorando', ev.efficiency==='melhorando', ev.efficiency+' pace'+ev.paceTrendPct);
check('validateIncrease true → progressão', ev.validateIncrease===true && ev.nextTargets[0].type==='progressao', JSON.stringify(ev.nextTargets[0]));
check('semana 4 é deload', ev.nextTargets[3].type==='deload');

// volume subindo + FC subindo + pace piorando → não subir
let runs2=[]; for(let i=0;i<10;i++) runs2.push(mk(i, i<5?3:7, i<5?6.0:6.4, i<5?150:165));
let ev2=E.computeCardioEvolution({ runs: runs2, recoveryCategory:'good', goal:'performance' });
check('volume↑+FC↑+pace↓ → validateIncrease false', ev2.validateIncrease===false, JSON.stringify({v:ev2.validateIncrease,p:ev2.paceTrendPct,h:ev2.hrTrendPct}));
check('metas viram consolidação', ev2.nextTargets[0].type==='consolidacao');

// recuperação baixa → não subir
let ev3=E.computeCardioEvolution({ runs, recoveryCategory:'low', goal:'fat_loss' });
check('recuperação baixa → não subir', ev3.validateIncrease===false);

check('relatório tem próxima estratégia', typeof ev.report.nextStrategy==='string' && ev.report.nextStrategy.length>0);
console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`); process.exit(fail?1:0);
