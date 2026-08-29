const { computeRecoveryBudget } = require('./.tmp/pb/priority-budget-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const base=(o={})=>({recoveryScore:70,hrvTrendPerWeek:1,sleepHours:7.5,acwr:1.0,recentWeeklySets:14,avgRir:2,sessionDurationMin:60,weeklyFrequency:4,cardioSessionsPerWeek:1,experience:'intermediate',priorVolumeResponsePositive:true,...o});

const good = computeRecoveryBudget(base({recoveryScore:85,sleepHours:8,priorVolumeResponsePositive:true}));
ok('boa recuperação => add_stimulus', good.verdict==='add_stimulus');
ok('permite séries extras', good.extraSetsAllowed>=2);

const mid = computeRecoveryBudget(base({recoveryScore:55,cardioSessionsPerWeek:3,sleepHours:6.5}));
ok('capacidade média => redistribute', mid.verdict==='redistribute' && mid.extraSetsAllowed===0);

const bad = computeRecoveryBudget(base({recoveryScore:30,sleepHours:5,acwr:1.7,avgRir:0,cardioSessionsPerWeek:4,priorVolumeResponsePositive:false}));
ok('recuperação ruim => reduce', bad.verdict==='reduce' && bad.extraSetsAllowed===0);
ok('cita causas', bad.reasons.length>1);

ok('ACWR alto reduz capacidade', computeRecoveryBudget(base({acwr:1.8})).capacityScore < computeRecoveryBudget(base({acwr:1.0})).capacityScore);
ok('sono ruim reduz', computeRecoveryBudget(base({sleepHours:5})).capacityScore < computeRecoveryBudget(base({sleepHours:8})).capacityScore);
ok('avançado tem mais capacidade que iniciante', computeRecoveryBudget(base({experience:'advanced'})).capacityScore > computeRecoveryBudget(base({experience:'beginner'})).capacityScore);
ok('capacity 0..100', good.capacityScore<=100 && bad.capacityScore>=0);

// nunca adicionar volume automaticamente sem capacidade
ok('sem capacidade nunca libera séries', computeRecoveryBudget(base({recoveryScore:35})).extraSetsAllowed===0);

console.log(`\npriority-budget: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
