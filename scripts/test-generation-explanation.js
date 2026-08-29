const { buildGenerationExplanation } = require('./.tmp/ge/generation-explanation-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

const exp = buildGenerationExplanation({
  goal:'hypertrophy', splitName:'Upper / Lower', splitReason:'4 dias casam com upper/lower',
  priorities:[{muscle_group:'chest',level:'PRIMARY',interventionOrder:['position','frequency','volume']}],
  weakPoints:['back'],
  volumeVerdict:'add_stimulus', volumeCapacity:82,
  balanceAdjustments:[],
  retained:[{id:'rem',name:'Remada máquina',reason:'progressão consistente nas últimas 5 semanas'}],
  changes:[{from:'Supino inclinado barra',to:'Supino inclinado halteres',reason:'estagnado 6 semanas'}],
  recoveryLabel:'moderada', cardioSessionsPerWeek:3,
  removedForSafety:['Agachamento livre'],
  equilibriumScore:91,
});
ok('goalStrategy de hipertrofia', /hipertrofia/i.test(exp.goalStrategy));
ok('split propagado', exp.selectedSplit==='Upper / Lower');
ok('prioridade formatada', exp.musclePriorities[0].includes('chest') && exp.musclePriorities[0].includes('PRIMARY'));
ok('volumeStrategy cita capacidade', /82\/100|estímulo adicional/i.test(exp.volumeStrategy));
ok('retenção com motivo', /progressão consistente/.test(exp.exerciseRetention[0]));
ok('mudança com motivo (§18)', /→.*halteres.*estagnado/.test(exp.exerciseChanges[0]));
ok('cardio frequente citado', /Cardio frequente/.test(exp.cardioConstraints));
ok('segurança lista removidos', /Agachamento livre/.test(exp.physicalSafety));
ok('equilibrium propagado', exp.equilibriumScore===91);
ok('expectedFocus cita ponto fraco', /back/.test(exp.expectedFocus));

// caso sem prioridade/segurança/cardio
const plain = buildGenerationExplanation({ goal:'maintenance', splitName:null, splitReason:null, priorities:[], weakPoints:[], volumeVerdict:'redistribute', volumeCapacity:50, balanceAdjustments:['Reequilibrar Peito × Costas.'], retained:[], changes:[], recoveryLabel:null, cardioSessionsPerWeek:1, removedForSafety:[], equilibriumScore:null });
ok('redistribute explicado', /redistribu/i.test(plain.volumeStrategy));
ok('balance ajustes citados', /Reequilibrar/.test(plain.balanceStrategy));
ok('sem restrição física', /Nenhuma restrição/.test(plain.physicalSafety));

console.log(`\ngeneration-explanation: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
