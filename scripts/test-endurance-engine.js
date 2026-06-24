/* Testes do Endurance Engine (Cardio V8). */
const E = require('./.tmp/endurance-engine.js');
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${x ? ' → ' + x : ''}`); } }

console.log('\n== classifyRunner ==');
check('alto volume/consistência → avançado+', ['avancado','competitivo'].includes(E.classifyRunner({ weeklyKmAvg: 45, sessionsPerWeek: 4, weeksConsistent: 10, longestKm: 21 }).level));
check('baixo volume → iniciante', E.classifyRunner({ weeklyKmAvg: 5, sessionsPerWeek: 1, weeksConsistent: 1, longestKm: 4 }).level === 'iniciante');
check('regular → intermediário', E.classifyRunner({ weeklyKmAvg: 18, sessionsPerWeek: 3, weeksConsistent: 5, longestKm: 10 }).level === 'intermediario');

console.log('\n== computeCardioLoad ==');
let l = E.computeCardioLoad({ km7: 40, km28: 80, km90: 240, sessions7: 4 }); // ACWR=40/20=2
check('rampa forte → risco alto', l.risk === 'alto', `${l.acwr}/${l.risk}`);
check('score sobe com ACWR alto (>70)', l.score > 70, String(l.score));
l = E.computeCardioLoad({ km7: 22, km28: 80, km90: 240, sessions7: 3 }); // ACWR=22/20=1.1
check('ACWR ~1.1 → ideal', l.risk === 'ideal', `${l.acwr}/${l.risk}`);

console.log('\n== computeTrainingZones ==');
let z = E.computeTrainingZones({ age: 30, maxHrMeasured: null, restingHr: null });
check('idade → estimado, 5 zonas', z.source === 'estimado' && z.zones.length === 5, z && z.source);
check('Z5 termina na FC máx', z.zones[4].hrHigh === z.maxHr, String(z.maxHr));
z = E.computeTrainingZones({ age: 30, maxHrMeasured: 190, restingHr: 50 });
check('FC máx do relógio → medido', z.source === 'medido' && z.maxHr === 190);
check('sem idade nem máx → null', E.computeTrainingZones({ age: null, maxHrMeasured: null, restingHr: null }) === null);

console.log('\n== analyzeRunPerformance ==');
const mk = (i, pace, hr) => ({ dateMs: Date.now() - (10 - i) * 86400000, km: 5, durationMin: pace * 5, avgHr: hr });
let p = E.analyzeRunPerformance({ runs: [mk(0,6,160),mk(1,6,160),mk(2,5.4,158),mk(3,5.3,157)], periodDays: 90 });
check('pace melhorando → evolução', p.status === 'evolucao', `${p.status}/${p.paceTrendPct}`);
p = E.analyzeRunPerformance({ runs: [mk(0,5,150),mk(1,5,150),mk(2,5,150),mk(3,5,150)], periodDays: 90 });
check('pace estável → platô', p.status === 'plato', p.status);
p = E.analyzeRunPerformance({ runs: [mk(0,5,150),mk(1,5,151)], periodDays: 90 });
check('poucas corridas → dados_insuficientes', p.status === 'dados_insuficientes', p.status);

console.log('\n== deriveRacePhase ==');
check('12 sem → base', E.deriveRacePhase({ weeksToRace: 12 }).phase === 'base');
check('6 sem → construção', E.deriveRacePhase({ weeksToRace: 6 }).phase === 'construcao');
check('2 sem → pico', E.deriveRacePhase({ weeksToRace: 2 }).phase === 'pico');
check('1 sem → taper', E.deriveRacePhase({ weeksToRace: 1 }).phase === 'taper');
check('sem prova → null', E.deriveRacePhase({ weeksToRace: null }).phase === null);

console.log('\n== adaptiveWorkout ==');
let a = E.adaptiveWorkout({ plannedKm: 10, plannedZone: 'Z4', recoveryCategory: 'low' });
check('recuperação baixa → ajusta p/ menos km e Z2', a.adjusted && a.zone === 'Z2' && a.km < 10, JSON.stringify(a));
a = E.adaptiveWorkout({ plannedKm: 10, plannedZone: 'Z4', recoveryCategory: 'good' });
check('boa recuperação → mantém', a.adjusted === false && a.km === 10);

console.log('\n== computeGpsConfidence ==');
let g = E.computeGpsConfidence({ totalPoints: 300, removedPoints: 3, weakSignalSeconds: 15 });
check('poucos removidos → confiança alta (>=85)', g.score >= 85, String(g.score));
check('lista problemas detectados', g.issues.length >= 1, g.issues.join(','));
check('sem pontos → 0', E.computeGpsConfidence({ totalPoints: 0, removedPoints: 0, weakSignalSeconds: 0 }).score === 0);

console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`);
process.exit(fail === 0 ? 0 : 1);
