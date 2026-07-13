const E = require('./.tmp/athlete-os/index.js');
let pass=0,fail=0; const check=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?' → '+x:'')));};
const base = { recoveryCategory:'good', recoveryScore:80, hrvDropPct:null, sleepHours:7, injuryRisk:'none', overreaching:false, plateau:false, inDeload:false, cardioLoadRisk:'ideal', strengthTrendPct:1, weightTrendKg:-0.5, goalIsCut:true, nutritionScore:70, adherencePct:80, weakPointMuscle:null, prReady:false };

console.log('\n== orchestrate: prioridade e conflito ==');
// recuperação baixa deve vencer e suprimir PR (increase)
let r = E.orchestrate({ ...base, recoveryCategory:'low', hrvDropPct:-20, prReady:true });
check('recuperação baixa → nextBestAction = recovery', r.nextBestAction.domain==='recovery', r.nextBestAction.domain);
check('PR (increase) suprimido por recovery', r.decisions.find(d=>d.domain==='training' && d.kind==='increase')?.suppressed===true);
check('conflitos resolvidos > 0', r.conflictsResolved>0, String(r.conflictsResolved));

// recuperação boa + prReady → decisão de treino (increase) permitida
r = E.orchestrate({ ...base, prReady:true, strengthTrendPct:5, recoveryCategory:'good' });
check('boa recuperação + prReady → training não suprimido', !r.decisions.find(d=>d.domain==='training' && d.kind==='increase')?.suppressed);
check('decisão traz confiança 0-100', r.nextBestAction.confidence>=0 && r.nextBestAction.confidence<=100);
check('decisão traz evidência', Array.isArray(r.nextBestAction.evidence) && r.nextBestAction.evidence.length>0);

// injury bloqueia progressão
r = E.orchestrate({ ...base, injuryRisk:'high', prReady:true });
check('lesão alta → nextBestAction = injury', r.nextBestAction.domain==='injury');
check('lesão suprime increase', r.decisions.find(d=>d.kind==='increase' && d.domain==='training')?.suppressed===true);

// overreaching → deload prioritário
r = E.orchestrate({ ...base, overreaching:true, prReady:true });
check('overreaching → deload no topo', r.nextBestAction.domain==='overreaching' && r.nextBestAction.kind==='deload');

// sem sinais → manter
r = E.orchestrate(base);
check('sem sinais críticos → manter/train', ['training','nutrition'].includes(r.nextBestAction.domain), r.nextBestAction.domain);

// hierarquia de prioridade
check('recovery(100) > injury(95) > overreaching(85)', E.DOMAIN_PRIORITY.recovery>E.DOMAIN_PRIORITY.injury && E.DOMAIN_PRIORITY.injury>E.DOMAIN_PRIORITY.overreaching);
console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`); process.exit(fail?1:0);
