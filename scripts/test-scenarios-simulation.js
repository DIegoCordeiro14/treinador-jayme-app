const { projectScenarios } = require('./.tmp/ss/body-projection-scenarios.js');
const { simulateDecision, simulateAll } = require('./.tmp/ss/decision-simulation-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// cenários de cutting: perdendo 0.35kg/sem
const res = projectScenarios({ currentWeightKg:98, currentBfPct:24, currentLeanKg:73, weeklyWeightDeltaKg:-0.35, adherencePct:90 });
ok('3 cenários', res.scenarios.length===3);
const cons = res.scenarios.find(s=>s.scenario==='conservative').points;
const exp = res.scenarios.find(s=>s.scenario==='expected').points;
const opt = res.scenarios.find(s=>s.scenario==='optimistic').points;
ok('horizontes padrão 30/60/90/180', exp.map(p=>p.day).join(',')==='30,60,90,180');
// otimista perde mais peso que conservador (em cutting)
ok('otimista < esperado < conservador (peso 90d)',
   opt.find(p=>p.day===90).weightKg <= exp.find(p=>p.day===90).weightKg &&
   exp.find(p=>p.day===90).weightKg <= cons.find(p=>p.day===90).weightKg);
ok('BF cai no cenário esperado', exp[exp.length-1].bfPct < 24);
ok('massa magra preservada (partição 0.75/0.25)', exp.find(p=>p.day===90).leanKg >= 71);
ok('disclaimer presente', /não é previsão garantida/i.test(res.disclaimer));
ok('partição unificada exposta', res.partitionUsed.deficit===0.75 && res.partitionUsed.surplus===0.5);

// aderência baixa reduz o ritmo
const lowAdh = projectScenarios({ currentWeightKg:98, currentBfPct:24, currentLeanKg:73, weeklyWeightDeltaKg:-0.35, adherencePct:40 });
ok('aderência baixa => menos peso perdido em 90d', Math.abs(lowAdh.scenarios[1].points.find(p=>p.day===90).weightKg-98) < Math.abs(exp.find(p=>p.day===90).weightKg-98));

// SIMULAÇÃO
const addDay = simulateDecision('add_training_day', { currentTrainingDays:4, currentRecoveryScore:70, volumeStatus:'optimal' });
ok('+1 dia: volume↑ recovery↓', addDay.effects.volume==='up' && addDay.effects.recovery==='down');
ok('+1 dia com boa recuperação => alta probabilidade', addDay.likelihood==='high');

const addDayTired = simulateDecision('add_training_day', { currentTrainingDays:6, currentRecoveryScore:30, volumeStatus:'near_mrv' });
ok('+1 dia fatigado => cautela + baixa prob', addDayTired.caution!==null && addDayTired.likelihood==='low');

const deload = simulateDecision('apply_deload', { currentTrainingDays:5, currentRecoveryScore:35, volumeStatus:'over_mrv' });
ok('deload: recovery↑ e performance↑', deload.effects.recovery==='up' && deload.effects.performancePotential==='up');

const incVol = simulateDecision('increase_volume', { currentTrainingDays:5, currentRecoveryScore:60, volumeStatus:'over_mrv' });
ok('aumentar volume acima do MRV => cautela', incVol.caution!==null && incVol.effects.performancePotential==='down');

ok('simulateAll retorna várias', simulateAll({ currentTrainingDays:4, currentRecoveryScore:60, volumeStatus:'optimal' }).length>=5);

console.log(`\nscenarios + simulation: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
