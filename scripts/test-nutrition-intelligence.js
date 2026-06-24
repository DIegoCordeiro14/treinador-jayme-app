/* Testes dos limiares do Nutrition Intelligence Engine V7.2. */
const E = require('./.tmp/nutrition-intelligence.js');
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${x ? ' → ' + x : ''}`); } }

console.log('\n== deriveAthleteCycle ==');
let c = E.deriveAthleteCycle({ phase: 'cutting', recoveryCategory: 'critical', bodyFatPct: 28, cardioKmThisWeek: 5, sessionsLast7: 5 });
check('recuperação crítica → ciclo recovery', c.cycle === 'recovery', c.cycle);
c = E.deriveAthleteCycle({ phase: 'cutting', recoveryCategory: 'good', bodyFatPct: 28, cardioKmThisWeek: 5, sessionsLast7: 5 });
check('cutting + boa recuperação → cutting', c.cycle === 'cutting', c.cycle);
c = E.deriveAthleteCycle({ phase: 'performance', recoveryCategory: 'good', bodyFatPct: 14, cardioKmThisWeek: 40, sessionsLast7: 3, upcomingRaceWeeks: 1 });
check('prova em 1 semana → peak_performance', c.cycle === 'peak_performance', c.cycle);
c = E.deriveAthleteCycle({ phase: 'lean_bulk', recoveryCategory: 'good', bodyFatPct: 15, cardioKmThisWeek: 0, sessionsLast7: 4 });
check('lean_bulk → build', c.cycle === 'build', c.cycle);

console.log('\n== computeTrainingDemand ==');
let d = E.computeTrainingDemand({ isRestDay: false, todayLabel: 'Pernas + abdômen', todayHasCardio: false, recoveryCategory: 'good' });
check('pernas → demanda Alta (>=75)', d.score >= 75 && d.level === 'Alta', `${d.score}/${d.level}`);
d = E.computeTrainingDemand({ isRestDay: true, todayLabel: null, todayHasCardio: false, recoveryCategory: 'good' });
check('descanso → nível Descanso', d.level === 'Descanso', `${d.score}/${d.level}`);
d = E.computeTrainingDemand({ isRestDay: false, todayLabel: 'Bíceps e tríceps', todayHasCardio: false, recoveryCategory: 'good' });
check('braços → demanda menor que pernas', d.score < 75, String(d.score));
check('score sempre 0..100', [0,25,50,100].every(()=>d.score>=0&&d.score<=100));

console.log('\n== recoveryNutritionAdvice ==');
let r = E.recoveryNutritionAdvice({ recoveryCategory: 'critical', recoveryScore: 30, sessionsLast7: 6, phase: 'cutting' });
check('crítica em cutting → active + menciona recuperação não déficit', r.active && /recupera/i.test(r.message), r.title);
r = E.recoveryNutritionAdvice({ recoveryCategory: 'good', recoveryScore: 80, sessionsLast7: 3, phase: 'cutting' });
check('boa recuperação → não active', r.active === false, r.title);

console.log('\n== enduranceMode ==');
check('cardio baixo e sem prova → null', E.enduranceMode({ cardioKmThisWeek: 5 }) === null);
let en = E.enduranceMode({ cardioKmThisWeek: 35 });
check('35km/sem → endurance ativo', en && en.active, JSON.stringify(en));
en = E.enduranceMode({ cardioKmThisWeek: 10, upcomingRaceWeeks: 1 });
check('prova em 1 sem → tapering/pico', en && /Pico|Tapering/.test(en.phase), en && en.phase);

console.log('\n== diagnoseProgress ==');
let dg = E.diagnoseProgress({ phase: 'cutting', weightTrendKg: -2.5, bfTrendPct: -1, strengthTrendPct: 1, periodDays: 30 });
check('cutting eficiente → conclusão eficiente', /eficiente/i.test(dg.conclusion), dg.conclusion);
dg = E.diagnoseProgress({ phase: 'cutting', weightTrendKg: -3, bfTrendPct: 0, strengthTrendPct: -12, periodDays: 30 });
check('peso↓ BF= força↓↓ → possível perda muscular', /muscular/i.test(dg.conclusion), dg.conclusion);

console.log('\n== simulateAdjustments ==');
let sims = E.simulateAdjustments({ phase: 'cutting', tdeeKcal: 2500, weightTrendKgPerWeek: -0.2 });
check('cutting → 3 opções', sims.length === 3, String(sims.length));
check('reduzir 150kcal prevê perda maior que ritmo atual', sims.find(o=>o.id==='cut_150').predictedPerWeekKg < -0.2);
check('manter == ritmo atual', sims.find(o=>o.id==='hold').predictedPerWeekKg === -0.2, String(sims.find(o=>o.id==='hold').predictedPerWeekKg));

console.log('\n== buildMoment ==');
let m = E.buildMoment({ phaseLabel: 'Cutting', cycleLabel: 'Cutting Estratégico', score: 84, scoreLabel: 'Excelente', recoveryCategory: 'low', scoreBreakdown: [{label:'Progresso vs objetivo',points:40,max:40},{label:'Consistência de treino',points:28,max:30},{label:'Aderência (registros)',points:16,max:30}], sex: 'male' });
check('recuperação baixa → limitador Recuperação/Sono', /Recupera|Sono/i.test(m.limiter), m.limiter);
m = E.buildMoment({ phaseLabel: 'Cutting', cycleLabel: 'X', score: 60, scoreLabel: 'Bom', recoveryCategory: 'good', scoreBreakdown: [{label:'Progresso vs objetivo',points:40,max:40},{label:'Consistência de treino',points:28,max:30},{label:'Aderência (registros)',points:6,max:30}], sex: 'female' });
check('boa recuperação → limitador = componente mais fraco (aderência)', /ader/i.test(m.limiter), m.limiter);
check('perfil feminino → nota personalizada', /feminino/i.test(m.personalNote||''), m.personalNote);

console.log('\n== V8: deriveSportProfile ==');
let sp = E.deriveSportProfile('maratona');
check('maratona → endurance', sp.category === 'endurance' && sp.enduranceBias === true, sp.category);
sp = E.deriveSportProfile('musculacao');
check('musculacao → bodybuilding', sp.category === 'bodybuilding' && sp.enduranceBias === false, sp.category);
sp = E.deriveSportProfile('futebol');
check('futebol → performance', sp.category === 'performance', sp.category);
sp = E.deriveSportProfile(null);
check('null → bodybuilding (default)', sp.category === 'bodybuilding', sp.category);

console.log('\n== V8: enduranceMode com bias ==');
check('endurance bias + 8km → ativo (mesmo <20km)', !!E.enduranceMode({ cardioKmThisWeek: 8, enduranceBias: true }));
check('sem bias + 8km → null', E.enduranceMode({ cardioKmThisWeek: 8, enduranceBias: false }) === null);

console.log('\n== V8: diagnoseProgress com causas ==');
let dgc = E.diagnoseProgress({ phase: 'cutting', weightTrendKg: 0.1, bfTrendPct: 0, strengthTrendPct: 0, periodDays: 28, adherencePct: 40, recoveryCategory: 'low' });
check('platô + baixa aderência → causa de aderência', dgc.causes.some(c => /ader/i.test(c)), dgc.causes.join(','));
check('platô → tem ao menos 1 causa', dgc.causes.length >= 1, String(dgc.causes.length));
let dgc2 = E.diagnoseProgress({ phase: 'cutting', weightTrendKg: -2, bfTrendPct: -1, strengthTrendPct: 1, periodDays: 30, adherencePct: 90, recoveryCategory: 'good' });
check('cutting eficiente → sem causas', dgc2.causes.length === 0, dgc2.causes.join(','));

console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`);
process.exit(fail === 0 ? 0 : 1);
