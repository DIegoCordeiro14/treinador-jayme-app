const { computeFueling } = require('./.tmp/fb/fueling-engine.js');
const { analyzeFoodBehavior } = require('./.tmp/fb/food-behavior-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// FUELING — treino 18h, rotina real
const meals=[{key:'cafe',label:'Café',time:'07:00'},{key:'almoco',label:'Almoço',time:'12:30'},{key:'lanche',label:'Lanche',time:'16:30'},{key:'jantar',label:'Jantar',time:'21:00'}];
const f = computeFueling({ workoutTime:'18:00', carbPriority:'high', energyDemand:'high', recoveryPriority:false, phase:'hipertrofia', isEndurance:false, meals, totalCarbsG:300, totalProteinG:180 });
ok('pré = lanche (última antes das 18h)', f.priorityMeals.includes('lanche'));
ok('pós = jantar (primeira depois)', f.priorityMeals.includes('jantar'));
ok('estratégia performance (demanda alta)', f.mealTimingStrategy==='performance');
ok('carbo do dia distribuído ~= total', Math.abs(f.mealPlan.reduce((a,m)=>a+m.carbsG,0)-300)<=4);
ok('proteína do dia ~= total', Math.abs(f.mealPlan.reduce((a,m)=>a+m.proteinG,0)-180)<=4);
const pre=f.mealPlan.find(m=>m.key==='lanche');
ok('pré-treino tem role de energia', /energia/.test(pre.role));
// recuperação prioritária => strategy recovery
ok('recuperação => strategy recovery', computeFueling({workoutTime:'18:00',carbPriority:'moderate',energyDemand:'moderate',recoveryPriority:true,phase:'cutting',isEndurance:false,meals,totalCarbsG:200,totalProteinG:170}).mealTimingStrategy==='recovery');
// endurance
ok('endurance => strategy endurance', computeFueling({workoutTime:null,carbPriority:'high',energyDemand:'high',recoveryPriority:false,phase:'performance',isEndurance:true,meals,totalCarbsG:400,totalProteinG:140}).mealTimingStrategy==='endurance');
// sem rotina
ok('sem refeições => standard vazio', computeFueling({workoutTime:'18:00',carbPriority:'high',energyDemand:'high',recoveryPriority:false,phase:'x',isEndurance:false,meals:[],totalCarbsG:300,totalProteinG:180}).mealPlan.length===0);

// FOOD BEHAVIOR
const mkDay=(iso,wd,o={})=>({dateISO:iso,weekday:wd,calories:2400,protein:180,carbs:250,logged:true,trainingDay:true,...o});
// carbo baixo em treino pesado (severidade high) deve ser a oportunidade principal
const days=[];
for(let i=0;i<14;i++){ const wd=i%7; days.push(mkDay(`2026-08-${String(i+1).padStart(2,'0')}`,wd,{ heavyTraining:i%3===0, carbs:i%3===0?80:250 })); }
const b = analyzeFoodBehavior(days);
ok('detecta padrões', b.patterns.length>=1);
ok('oportunidade principal = carbo baixo em treino pesado', b.primaryOpportunity && b.primaryOpportunity.id==='low_carb_heavy_days');
ok('no máximo 2 secundárias', b.secondary.length<=2);
ok('consistencyScore 0..1', b.consistencyScore>=0 && b.consistencyScore<=1);
// fim de semana come mais
const days2=[]; for(let i=0;i<14;i++){ const wd=i%7; const we=wd===0||wd===6; days2.push(mkDay(`2026-08-${String(i+1).padStart(2,'0')}`,wd,{ calories: we?3200:2400, heavyTraining:false, carbs:300 })); }
const b2 = analyzeFoodBehavior(days2);
ok('detecta surplus de fim de semana', b2.patterns.some(p=>p.id==='weekend_surplus'));
// poucos dados
ok('poucos dados => sem padrões', analyzeFoodBehavior(days.slice(0,3)).patterns.length===0);

console.log(`\nfueling + behavior: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
