const { computePriorityScore, allocatePriority, allocateAll } = require('./.tmp/pa/priority-allocation-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const base=(o={})=>({muscle_group:'chest',userDeclared:false,isWeakPoint:false,aestheticGoalMatch:false,historicalResponse:null,stagnant:false,recoveryCapacity:0.7,timeAvailability:0.7,fatigue:0.3,cardioLoad:0.2,...o});

// declarado + ponto fraco + boa recuperação => PRIMARY/HIGH com volume liberado
const strong = allocatePriority(base({userDeclared:true,isWeakPoint:true,recoveryCapacity:0.9,fatigue:0.2}));
ok('prioridade forte => PRIMARY/HIGH', ['PRIMARY','HIGH'].includes(strong.level));
ok('com folga inclui volume', strong.interventionOrder.includes('volume'));
ok('posição vem antes de volume', strong.interventionOrder.indexOf('position') < strong.interventionOrder.indexOf('volume'));

// declarado MAS recuperação baixa + fadiga alta => não libera volume
const noRoom = allocatePriority(base({userDeclared:true,isWeakPoint:true,recoveryCapacity:0.2,fatigue:0.8,cardioLoad:0.7}));
ok('sem folga => não inclui volume', !noRoom.interventionOrder.includes('volume'));
ok('sem folga cita orçamento', /sem folga|recupera/i.test(noRoom.reason));
ok('frequência/posição antes de volume', noRoom.interventionOrder.includes('position'));

// score responde aos fatores
ok('declarado aumenta score', computePriorityScore(base({userDeclared:true})) > computePriorityScore(base()));
ok('fadiga reduz score', computePriorityScore(base({fatigue:0.9})) < computePriorityScore(base({fatigue:0.1})));
ok('cardio reduz score', computePriorityScore(base({cardioLoad:1})) < computePriorityScore(base({cardioLoad:0})));
ok('resposta histórica boa aumenta', computePriorityScore(base({historicalResponse:1})) > computePriorityScore(base({historicalResponse:-1})));

// não declarado, nada especial => LOW/MODERATE
const low = allocatePriority(base({recoveryCapacity:0.4,fatigue:0.5}));
ok('neutro => LOW ou MODERATE', ['LOW','MODERATE'].includes(low.level));

// ordenação por score desc
const all = allocateAll([base({muscle_group:'legs'}), base({muscle_group:'chest',userDeclared:true,isWeakPoint:true})]);
ok('ordena por score desc', all[0].score >= all[1].score);
ok('score 0..100', all.every(a=>a.score>=0&&a.score<=100));

console.log(`\npriority-allocation: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
