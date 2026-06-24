/* Testes do Athlete Intelligence Engine (EDN 360 + Weak Point). */
const E = require('./.tmp/athlete-intelligence-engine.js');
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${x ? ' → ' + x : ''}`); } }

console.log('\n== computeEdn360 ==');
let r = E.computeEdn360({ training: 82, nutrition: 76, recovery: 40, cardio: 80 });
check('recuperação <55 → limitador recovery', r.limiter === 'recovery', r.limiter);
check('overall 0..100', r.overall >= 0 && r.overall <= 100, String(r.overall));
check('próxima ação menciona reduzir/sono', /sono|reduz|volume/i.test(r.nextAction), r.nextAction);
r = E.computeEdn360({ training: 50, nutrition: 90, recovery: 88, cardio: 85 });
check('treino mais baixo (rec ok) → limitador training', r.limiter === 'training', r.limiter);
r = E.computeEdn360({ training: 90, nutrition: 55, recovery: 90, cardio: 92 });
check('nutrição mais baixa → limitador nutrition', r.limiter === 'nutrition', r.limiter);

console.log('\n== detectWeakPoint ==');
let w = E.detectWeakPoint([
  { muscle: 'chest', recentVolume: 1010, priorVolume: 1000, sessions: 4 },  // +1%
  { muscle: 'back', recentVolume: 1080, priorVolume: 1000, sessions: 6 },   // +8%
]);
check('peito 1% vs costas 8% → recomenda especialização de peito', !!w.recommendation && /Peitoral/i.test(w.recommendation), w.recommendation);
check('weakest = Peitoral', w.weakest && w.weakest.muscle === 'Peitoral', w.weakest && w.weakest.muscle);
check('strongest = Costas', w.strongest && w.strongest.muscle === 'Costas', w.strongest && w.strongest.muscle);
w = E.detectWeakPoint([
  { muscle: 'chest', recentVolume: 1050, priorVolume: 1000, sessions: 4 },  // +5%
  { muscle: 'back', recentVolume: 1060, priorVolume: 1000, sessions: 4 },   // +6%
]);
check('gap pequeno e evolução ok → sem recomendação', w.recommendation === null, String(w.recommendation));
w = E.detectWeakPoint([{ muscle: 'chest', recentVolume: 1000, priorVolume: 1000, sessions: 4 }]);
check('1 músculo só → sem weakest', w.weakest === null);

console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`);
process.exit(fail === 0 ? 0 : 1);
