const { planSpecializationBlock, reviewSpecializationBlock } = require('./.tmp/sr/specialization-block-engine.js');
const { evaluatePriorityResponse } = require('./.tmp/sr/priority-response-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// planejar bloco
const blk = planSpecializationBlock('chest', { experience:'advanced', extraSetsBudget:6 });
ok('avançado => 6 semanas', blk.durationWeeks===6);
ok('adiciona séries até orçamento', blk.addedWeeklySets===6);
ok('volume alto => +frequência', blk.addedFrequency===1);
const blkNoBudget = planSpecializationBlock('chest', { experience:'beginner', extraSetsBudget:0 });
ok('sem orçamento => 0 séries extra', blkNoBudget.addedWeeklySets===0 && blkNoBudget.addedFrequency===0);

// review: desconforto => REDUCE
ok('desconforto => REDUCE', reviewSpecializationBlock({weeksElapsed:3,durationWeeks:6,loadProgressionPct:2,repsProgressionPct:0,volumeTolerated:true,discomfort:true,measurableGain:false}).decision==='REDUCE');
// em andamento progredindo => CONTINUE
ok('progredindo => CONTINUE', reviewSpecializationBlock({weeksElapsed:2,durationWeeks:6,loadProgressionPct:5,repsProgressionPct:0,volumeTolerated:true,discomfort:false,measurableGain:true}).decision==='CONTINUE');
// terminou sem resposta => CHANGE_PRIORITY
ok('fim sem ganho => CHANGE_PRIORITY', reviewSpecializationBlock({weeksElapsed:6,durationWeeks:6,loadProgressionPct:0,repsProgressionPct:0,volumeTolerated:true,discomfort:false,measurableGain:false}).decision==='CHANGE_PRIORITY');
// em andamento sem ganho => MAINTAIN
ok('andamento sem ganho => MAINTAIN', reviewSpecializationBlock({weeksElapsed:2,durationWeeks:6,loadProgressionPct:0,repsProgressionPct:0,volumeTolerated:true,discomfort:false,measurableGain:false}).decision==='MAINTAIN');

// priority response
ok('progredindo => MAINTAIN', evaluatePriorityResponse({loadProgressionPct:4,repsProgressionPct:0,avgRir:2,volumeTolerated:true,discomfort:false,recoveryOk:true,weeksSinceProgress:0}).action==='MAINTAIN');
const inv = evaluatePriorityResponse({loadProgressionPct:0,repsProgressionPct:0,avgRir:4,volumeTolerated:true,discomfort:false,recoveryOk:false,weeksSinceProgress:3});
ok('estagnado => INVESTIGATE', inv.action==='INVESTIGATE');
ok('recuperação vem antes de volume', inv.investigationOrder.indexOf('recuperação') < inv.investigationOrder.findIndex(x=>/volume/.test(x)));
ok('RIR alto entra na investigação', inv.investigationOrder.some(x=>/RIR/.test(x)));
ok('seleção/frequência por último', /frequência/.test(inv.investigationOrder[inv.investigationOrder.length-1]));

console.log(`\nspecialization + priority-response: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
