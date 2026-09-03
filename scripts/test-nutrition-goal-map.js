const { normalizeGoal, deriveGoalPhase, CANONICAL_GOAL_LABEL } = require('./.tmp/ngm/nutrition-goal-map.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// normalizeGoal — todas as variações
const cases = {
  weight_loss:'weight_loss', fat_loss:'weight_loss', emagrecimento:'weight_loss', cutting:'weight_loss',
  definition:'definition', definicao:'definition',
  hypertrophy:'hypertrophy', hipertrofia:'hypertrophy', muscle_gain:'hypertrophy', massa:'hypertrophy',
  lean_bulk:'lean_bulk', bulk:'lean_bulk', mass_gain:'lean_bulk', ganho_massa:'lean_bulk',
  recomposition:'recomposition', recomposicao:'recomposition', recomp:'recomposition',
  performance:'performance', endurance:'performance', corrida:'performance',
  maintenance:'maintenance', manutencao:'maintenance', health:'maintenance',
};
for (const [raw, exp] of Object.entries(cases)) ok(`normalizeGoal(${raw})=${exp}`, normalizeGoal(raw)===exp);
ok('maiúsculas/espaços', normalizeGoal('  Fat_Loss ')==='weight_loss');
ok('null => maintenance (default neutro, nao hipertrofia)', normalizeGoal(null)==='maintenance');
ok('desconhecido => maintenance (neutro)', normalizeGoal('xyz')==='maintenance');
ok('substring fallback', normalizeGoal('weight_loss_fast')==='weight_loss');

// deriveGoalPhase — fase PT-BR
ok('weight_loss => cutting', deriveGoalPhase('weight_loss')==='cutting');
ok('cutting => cutting (corrigido)', deriveGoalPhase('cutting')==='cutting');
ok('definition => definicao', deriveGoalPhase('definition')==='definicao');
ok('hypertrophy => hipertrofia (explícito, não default)', deriveGoalPhase('hypertrophy')==='hipertrofia');
ok('muscle_gain => hipertrofia', deriveGoalPhase('muscle_gain')==='hipertrofia');
ok('bulk => lean_bulk', deriveGoalPhase('bulk')==='lean_bulk');
ok('recomp => recomposicao', deriveGoalPhase('recomp')==='recomposicao');
ok('performance => performance', deriveGoalPhase('performance')==='performance');
ok('maintenance => manutencao', deriveGoalPhase('maintenance')==='manutencao');
ok('label existe', !!CANONICAL_GOAL_LABEL.hypertrophy);

console.log(`\nnutrition-goal-map: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
