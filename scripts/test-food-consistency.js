const { analyzeFoodConsistency } = require('./.tmp/fc2/food-consistency-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const targets={calories:2400,protein:180};
const day=(i,wd,o={})=>({dateISO:`2026-08-${String(i).padStart(2,'0')}`,weekday:wd,calories:2400,protein:180,carbs:250,fat:70,logged:true,...o});

// 7 dias no alvo => heatmap todo 'on', média correta
const good=analyzeFoodConsistency(Array.from({length:7},(_,i)=>day(i+1,i%7)),targets);
ok('7 dias registrados', good.loggedDays===7);
ok('média calorias ~2400', good.avg.calories===2400);
ok('heatmap todo on', good.heatmap.every(h=>h.status==='on'));
ok('baixa variação', good.calorieVariationPct<10);

// proteína melhorando (sobe na 2a metade)
const pUp=analyzeFoodConsistency(Array.from({length:8},(_,i)=>day(i+1,i%7,{protein:i<4?120:190})),targets);
ok('tendência proteína up', pUp.trends.some(t=>t.id==='protein'&&t.direction==='up'));

// registro caindo
const logDrop=analyzeFoodConsistency([day(1,1),day(2,2),day(3,3),day(4,4,{logged:false}),{dateISO:'2026-08-05',weekday:5,calories:null,protein:null,carbs:null,fat:null,logged:false},{dateISO:'2026-08-06',weekday:6,calories:null,protein:null,carbs:null,fat:null,logged:false}],targets);
ok('tendência registro caindo', logDrop.trends.some(t=>t.id==='logging'));

// alta variação calórica
const varDays=analyzeFoodConsistency([day(1,1,{calories:1500}),day(2,2,{calories:3400}),day(3,3,{calories:1800}),day(4,4,{calories:3200}),day(5,5,{calories:2000})],targets);
ok('alta variação detectada', varDays.trends.some(t=>t.id==='variation') && varDays.calorieVariationPct>=25);

// dia fora do alvo => off/partial
const off=analyzeFoodConsistency([day(1,1,{calories:3600,protein:90})],targets);
ok('dia bem fora => off', off.heatmap[0].status==='off');

// sem registros
const empty=analyzeFoodConsistency([{dateISO:'2026-08-01',weekday:1,calories:null,protein:null,carbs:null,fat:null,logged:false}],targets);
ok('sem registros => none e summary', empty.heatmap[0].status==='none' && /Sem registros/.test(empty.summary));

console.log(`\nfood-consistency: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
