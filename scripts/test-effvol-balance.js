const { computeEffectiveVolume, directSetsNeededForEffectiveTarget } = require('./.tmp/eb/effective-muscle-volume-engine.js');
const { checkBalance } = require('./.tmp/eb/muscle-balance-guard.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// supino (peito, 6) + puxada (costas, 6) + remada (costas, 6) — bíceps/tríceps só indiretos
const ev = computeEffectiveVolume([
  { muscle_group:'chest', pattern:'horizontal_push', sets:6 },
  { muscle_group:'back', pattern:'vertical_pull', sets:6 },
  { muscle_group:'back', pattern:'horizontal_pull', sets:6 },
]);
ok('peito direto 6', ev.direct.chest===6);
ok('costas direto 12', ev.direct.back===12);
ok('tríceps recebe indireto do supino', ev.indirect.triceps>0);
ok('bíceps recebe indireto de puxada+remada', ev.indirect.biceps>0);
ok('efetivo biceps = indireto (sem direto)', ev.effective.biceps===ev.indirect.biceps);
// bíceps já tem estímulo indireto: precisa de menos direto para atingir alvo efetivo
ok('desconta indireto do alvo', directSetsNeededForEffectiveTarget('biceps', 10, ev) < 10);

// balance guard: peito 6 vs costas 12 => desequilíbrio? ratio 0.5 < 0.6 min
const floor = { chest:8, back:8, legs:8, glutes:6, biceps:6, triceps:6, shoulders:8 };
const bal = checkBalance({ effectiveVolume:{ chest:6, back:12, legs:14, glutes:8, biceps:ev.effective.biceps, triceps:ev.effective.triceps, shoulders:6 }, minFloor:floor });
ok('detecta desequilíbrio peito×costas', bal.pairs.find(p=>p.pair.includes('Peito')).balanced===false);
ok('peito abaixo do piso => violação', bal.floorViolations.some(v=>v.muscle==='chest'));
ok('gera ajustes', bal.adjustments.length>0);
ok('não está equilibrado', bal.balanced===false);

// caso equilibrado
const ok2 = checkBalance({ effectiveVolume:{ chest:12, back:14, legs:14, glutes:10, biceps:10, triceps:10, shoulders:10 }, minFloor:floor });
ok('caso equilibrado => balanced true', ok2.balanced===true && ok2.floorViolations.length===0);

console.log(`\neffective-volume + balance: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
