/* Teste rápido dos limiares do motor de nutrição V7 (sinais + score + targets).
   Uso: node scripts/test-nutrition-engine.js
   (compila o engine antes com:
    node node_modules/typescript/bin/tsc src/lib/edn/nutrition-autopilot.ts --outDir scripts/.tmp --module commonjs --target es2019 --skipLibCheck) */
const E = require('./.tmp/nutrition-autopilot.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' → ' + extra : ''}`); }
}
function titles(sigs) { return sigs.map(s => s.title); }

console.log('\n== detectNutritionAdjustments ==');

// 1) Recomposição em curso: peso estável, BF caindo
let s = E.detectNutritionAdjustments({ phase: 'recomposicao', weightTrendKg: 0.2, bfTrendPct: -0.8, strengthTrendPct: 1, periodDays: 30 });
check('recomp: peso estável + BF caindo → "Recomposição corporal em curso"', titles(s).includes('Recomposição corporal em curso'), titles(s).join(','));

// 2) Déficit impactando performance: cutting, perdendo peso, força caiu
s = E.detectNutritionAdjustments({ phase: 'cutting', weightTrendKg: -1.2, bfTrendPct: -0.5, strengthTrendPct: -6, periodDays: 30 });
check('cutting: peso↓ + força↓ → "Déficit pode estar impactando a performance"', titles(s).includes('Déficit pode estar impactando a performance'), titles(s).join(','));

// 3) Platô de emagrecimento: peso e BF parados por 21+ dias
s = E.detectNutritionAdjustments({ phase: 'cutting', weightTrendKg: 0.1, bfTrendPct: 0.0, strengthTrendPct: 0, periodDays: 28 });
check('cutting: peso/BF parados 28d → "Platô de emagrecimento"', titles(s).includes('Platô de emagrecimento'), titles(s).join(','));

// 4) Bulk acelerado: >0.6kg/sem
s = E.detectNutritionAdjustments({ phase: 'lean_bulk', weightTrendKg: 2.4, bfTrendPct: 0.5, strengthTrendPct: 1, periodDays: 21 }); // ~0.8kg/sem
check('bulk: ganho >0.6kg/sem → "Ganho de peso acelerado"', titles(s).includes('Ganho de peso acelerado'), titles(s).join(','));

// 5) Bulk no ritmo certo
s = E.detectNutritionAdjustments({ phase: 'lean_bulk', weightTrendKg: 0.6, bfTrendPct: 0, strengthTrendPct: 4, periodDays: 28 }); // 0.15kg/sem
check('bulk: ganho controlado + força↑ → "Ganho de massa no ritmo certo"', titles(s).includes('Ganho de massa no ritmo certo'), titles(s).join(','));

// 6) Sem dados → "Sem ajustes necessários"
s = E.detectNutritionAdjustments({ phase: 'hipertrofia', weightTrendKg: null, bfTrendPct: null, strengthTrendPct: null, periodDays: 14 });
check('sem dados → "Sem ajustes necessários"', titles(s).includes('Sem ajustes necessários'), titles(s).join(','));

console.log('\n== computeNutritionScore ==');

// Score alto: cutting perdendo peso, treino completo, aderência total
let sc = E.computeNutritionScore({ phase: 'cutting', weightTrendKg: -1.0, bfTrendPct: -0.5, sessionsLast7: 4, plannedPerWeek: 4, loggedDays: 14, periodDays: 14 });
check('cutting ideal → score >= 80 (Excelente)', sc.score >= 80, `score=${sc.score} (${sc.label})`);
check('score nunca passa de 100', sc.score <= 100, `score=${sc.score}`);

// Score baixo: cutting ganhando peso, sem treino, sem registro
sc = E.computeNutritionScore({ phase: 'cutting', weightTrendKg: +1.0, bfTrendPct: null, sessionsLast7: 0, plannedPerWeek: 4, loggedDays: 0, periodDays: 14 });
check('cutting ruim → score baixo (< 40, Atenção)', sc.score < 40, `score=${sc.score} (${sc.label})`);

// Breakdown soma confere com o total
sc = E.computeNutritionScore({ phase: 'hipertrofia', weightTrendKg: 0.4, bfTrendPct: null, sessionsLast7: 3, plannedPerWeek: 4, loggedDays: 7, periodDays: 14 });
const sum = sc.breakdown.reduce((a, b) => a + b.points, 0);
check('breakdown soma == score', sum === sc.score, `soma=${sum} score=${sc.score}`);
check('cada componente respeita o teto', sc.breakdown.every(b => b.points <= b.max), JSON.stringify(sc.breakdown));

console.log('\n== computeNutritionTargets (fases + day types) ==');

const baseBio = { weight_kg: 85, body_fat_pct: 22, lean_mass_kg: 66, basal_metabolic_rate_kcal: 1800, measured_at: '2026-06-01' };
function targets(goal, training) {
  return E.computeNutritionTargets({
    bio: baseBio,
    training: training ?? null,
    profile: { weight_kg: 85, height_cm: 178, age: 30, gender: 'male', main_goal: goal, weekly_frequency: 4, work_type: 'moderate', cardio_frequency: '1_2x', meals_per_day: 5 },
  });
}

let t = targets('fat_loss');
check('fat_loss → fase cutting', t.phase === 'cutting', t.phase);
check('cutting → déficit (adj < 0)', t.goalAdjustmentKcal < 0, String(t.goalAdjustmentKcal));
check('cutting → meta < TDEE', t.targetKcal < t.tdeeKcal);

t = targets('mass_gain');
check('mass_gain → fase lean_bulk', t.phase === 'lean_bulk', t.phase);
check('lean_bulk → superávit (adj > 0)', t.goalAdjustmentKcal > 0, String(t.goalAdjustmentKcal));

t = targets('performance');
check('performance → manutenção (adj == 0)', t.goalAdjustmentKcal === 0, String(t.goalAdjustmentKcal));

// Day types: high > moderate > rest em kcal/carbo
t = targets('hypertrophy');
const [hi, mo, re] = t.dayTypes;
check('day types: high.kcal > moderate.kcal > rest.kcal', hi.kcal > mo.kcal && mo.kcal > re.kcal, `${hi.kcal}/${mo.kcal}/${re.kcal}`);
check('day types: high.carbs > rest.carbs', hi.carbsG > re.carbsG, `${hi.carbsG}/${re.carbsG}`);
check('proteína constante entre os dias', hi.proteinG === mo.proteinG && mo.proteinG === re.proteinG);

// whyThisPlan + phaseReason preenchidos
check('whyThisPlan tem ao menos 2 frases', t.whyThisPlan.length >= 2, String(t.whyThisPlan.length));
check('phaseReason menciona a fase', /Hipertrofia/i.test(t.phaseReason), t.phaseReason);

// Macros fecham a conta (kcal de macros ≈ targetKcal, tolerância de 1 carbo)
const macroKcal = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
check('soma dos macros ≈ targetKcal (±20kcal)', Math.abs(macroKcal - t.targetKcal) <= 20, `macros=${macroKcal} alvo=${t.targetKcal}`);

// Alinhamento de treino: muito cardio em cutting gera observação
t = targets('fat_loss', { sessionsLast7: 4, weeklyVolumeKg: 30000, cardioKmThisWeek: 20 });
check('cutting + 20km cardio → trainingAlignment preenchido', !!t.trainingAlignment, String(t.trainingAlignment));

console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`);
process.exit(fail === 0 ? 0 : 1);
