const { simulateNutritionChange } = require('./.tmp/sn/edn/nutrition-simulation-engine.js');
const { buildNutritionState } = require('./.tmp/sn/athlete-os/nutrition-state.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// SIMULATION
const s = simulateNutritionChange({ currentWeightKg:98, weeklyRateKg:-0.4, calorieDeltaKcal:-150, horizonDays:30, confidence:0.8 });
ok('mudança esperada negativa', s.expectedChangeKg<0);
ok('faixa envolve o esperado', s.changeRange.min<=s.expectedChangeKg && s.expectedChangeKg<=s.changeRange.max);
ok('peso esperado < atual', s.expectedWeightKg<98);
ok('disclaimer de faixa', /não garantia|Faixa/.test(s.disclaimer));
// menor confiança => faixa mais larga
const wide = simulateNutritionChange({ currentWeightKg:98, weeklyRateKg:-0.4, calorieDeltaKcal:-150, horizonDays:30, confidence:0.3 });
ok('menor confiança => faixa mais larga', (wide.changeRange.max-wide.changeRange.min) > (s.changeRange.max-s.changeRange.min));

// NUTRITION STATE
const decision = { state:'progressing', confidence:0.8, primarySignal:{level:'positivo',title:'',message:''}, secondarySignals:[], limitingFactor:'recovery', recommendedAction:'maintain', adjustmentAllowed:false, reasons:[] };
const st = buildNutritionState({ phase:'cutting', calorieTarget:2000, tdee:2450, proteinAdherence:0.9, carbVsDemand:'below_training_demand', hydrationStatus:'unknown', loggingAdherence:0.85, targetAdherence:0.81, metabolicConfidence:0.78, decision });
ok('déficit detectado', st.calorieBalance==='strong_deficit' || st.calorieBalance==='moderate_deficit');
ok('proteína adequada', st.proteinStatus==='adequate');
ok('carbo abaixo da demanda', st.carbStatus==='below_training_demand');
ok('risco primário = recovery', st.primaryRisk==='recovery');
ok('nextAction combina carbo timing', st.nextAction==='maintain_calories_improve_carb_timing');
ok('adherence do target', st.adherence===0.81);
// superávit
const bulkSt = buildNutritionState({ phase:'lean_bulk', calorieTarget:2900, tdee:2450, proteinAdherence:0.7, carbVsDemand:'aligned', loggingAdherence:0.8, targetAdherence:0.8, metabolicConfidence:0.6, decision:null });
ok('superávit detectado', bulkSt.calorieBalance==='moderate_surplus' || bulkSt.calorieBalance==='strong_surplus');

console.log(`\nsimulation + nutrition-state: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
