const { deriveAosFacts } = require('./.tmp/an/aos-facts-engine.js');
const { computeNextBestAction } = require('./.tmp/an/next-best-action-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const NOW=Date.now();

// AOS FACTS
ok('lesão aguda => injuryRisk high', deriveAosFacts({activePhysicalConditions:1,severePhysicalConditions:1,recurringDiscomfort:false,recoveryCategory:'good',deloadSignalActive:false,planCreatedAtISO:null,declaredExperience:'intermediate',advancedPerformanceSignals:0,nowMs:NOW}).injuryRisk==='high');
ok('condição + recuperação baixa => moderate', deriveAosFacts({activePhysicalConditions:1,severePhysicalConditions:0,recurringDiscomfort:false,recoveryCategory:'low',deloadSignalActive:false,planCreatedAtISO:null,declaredExperience:'intermediate',advancedPerformanceSignals:0}).injuryRisk==='moderate');
ok('só desconforto => low', deriveAosFacts({activePhysicalConditions:0,severePhysicalConditions:0,recurringDiscomfort:true,recoveryCategory:'good',deloadSignalActive:false,planCreatedAtISO:null,declaredExperience:'beginner',advancedPerformanceSignals:0}).injuryRisk==='low');
ok('nada => none', deriveAosFacts({activePhysicalConditions:0,severePhysicalConditions:0,recurringDiscomfort:false,recoveryCategory:'good',deloadSignalActive:false,planCreatedAtISO:null,declaredExperience:'beginner',advancedPerformanceSignals:0}).injuryRisk==='none');
ok('deload signal => inDeload', deriveAosFacts({activePhysicalConditions:0,severePhysicalConditions:0,recurringDiscomfort:false,recoveryCategory:'good',deloadSignalActive:true,planCreatedAtISO:null,declaredExperience:'beginner',advancedPerformanceSignals:0}).inDeload===true);
ok('recuperação crítica => inDeload', deriveAosFacts({activePhysicalConditions:0,severePhysicalConditions:0,recurringDiscomfort:false,recoveryCategory:'critical',deloadSignalActive:false,planCreatedAtISO:null,declaredExperience:'beginner',advancedPerformanceSignals:0}).inDeload===true);
// weeksOnPlan a partir do início
const w=deriveAosFacts({activePhysicalConditions:0,severePhysicalConditions:0,recurringDiscomfort:false,recoveryCategory:'good',deloadSignalActive:false,planCreatedAtISO:new Date(NOW-56*86400000).toISOString(),declaredExperience:'advanced',advancedPerformanceSignals:0,nowMs:NOW});
ok('weeksOnPlan ~8', w.weeksOnPlan===8);
ok('experience declarada advanced', w.experience==='advanced');
// promoção a avançado por desempenho
const promo=deriveAosFacts({activePhysicalConditions:0,severePhysicalConditions:0,recurringDiscomfort:false,recoveryCategory:'good',deloadSignalActive:false,planCreatedAtISO:new Date(NOW-70*86400000).toISOString(),declaredExperience:'intermediate',advancedPerformanceSignals:6,nowMs:NOW});
ok('bom desempenho promove a avançado', promo.experience==='advanced');

// NEXT BEST ACTION
const base=(o={})=>({injuryRisk:'none',recoveryScore:70,proteinBelowTarget:false,trainedToday:false,hasWorkoutToday:true,cardioPlannedToday:false,weightStaleDays:2,acwrHigh:false,plateau:false,...o});
ok('recuperação muito baixa => ação crítica principal', computeNextBestAction(base({recoveryScore:30})).primary.priority==='critical');
ok('crítico vence importante', computeNextBestAction(base({recoveryScore:30,proteinBelowTarget:true})).primary.domain==='recovery');
ok('proteína baixa (sem crítico) => important', computeNextBestAction(base({proteinBelowTarget:true})).primary.id==='protein');
ok('só treino de hoje => recommended', computeNextBestAction(base()).primary.id==='workout');
ok('peso desatualizado => optional quando nada mais', computeNextBestAction(base({hasWorkoutToday:false,weightStaleDays:10})).primary.id==='weight');
ok('lesão alta => ação de segurança', computeNextBestAction(base({injuryRisk:'high'})).primary.domain==='safety');
ok('uma ação principal + lista', (()=>{const r=computeNextBestAction(base({recoveryScore:30,proteinBelowTarget:true})); return r.primary!==null && r.all.length>=2;})());
ok('nada relevante => primary null', computeNextBestAction(base({hasWorkoutToday:false,weightStaleDays:2})).primary===null);

console.log(`\naos-facts + next-best-action: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
