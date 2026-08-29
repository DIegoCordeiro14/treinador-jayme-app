const { computeFatigueState } = require('./.tmp/fs/fatigue-state-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const NOW=Date.now(); const h=(x)=>NOW-x*3600000;

// pedalada forte há 12h => fadiga inferior alta, sugere aliviar pernas
const bike=computeFatigueState([{dateMs:h(12),kind:'cycling',durationMin:90,avgHrPctMax:0.85,distanceKm:40}], NOW);
ok('ciclismo recente => fadiga inferior', bike.lowerBodyFatigue>0);
ok('dominante é lower', bike.dominantRegion==='lower' || bike.dominantRegion==='central');

// corrida longa forte há 8h => reduzir pernas
const run=computeFatigueState([{dateMs:h(8),kind:'running',durationMin:70,avgHrPctMax:0.88,distanceKm:12,elevationGainM:200}], NOW);
ok('corrida forte recente => reduceLegVolume', run.reduceLegVolume===true && run.dominantRegion==='lower');

// mesma corrida há 5 dias => já dissipou
const old=computeFatigueState([{dateMs:h(120),kind:'running',durationMin:70,avgHrPctMax:0.88,distanceKm:12}], NOW);
ok('atividade antiga não gera fadiga', old.lowerBodyFatigue===0 && old.dominantRegion==='none');

// decaimento: 36h reduz ~metade
const fresh=computeFatigueState([{dateMs:h(1),kind:'running',durationMin:60,avgHrPctMax:0.85,distanceKm:10}], NOW).lowerBodyFatigue;
const decayed=computeFatigueState([{dateMs:h(36),kind:'running',durationMin:60,avgHrPctMax:0.85,distanceKm:10}], NOW).lowerBodyFatigue;
ok('decaimento ~metade em 36h', decayed < fresh && decayed >= fresh*0.35 && decayed <= fresh*0.65);

// natação => fadiga superior, não reduz pernas
const swim=computeFatigueState([{dateMs:h(6),kind:'swimming',durationMin:50,avgHrPctMax:0.8}], NOW);
ok('natação => upper dominante', swim.upperBodyFatigue>=swim.lowerBodyFatigue);
ok('natação não alivia pernas', swim.reduceLegVolume===false);

// HIIT forte => fadiga central alta => reduzir intensidade
const hiit=computeFatigueState([{dateMs:h(10),kind:'hiit',durationMin:35,avgHrPctMax:0.95}], NOW);
ok('HIIT => fadiga central', hiit.centralFatigue>0);

// múltiplas atividades acumulam
const multi=computeFatigueState([{dateMs:h(10),kind:'running',durationMin:60,avgHrPctMax:0.85,distanceKm:10},{dateMs:h(30),kind:'cycling',durationMin:60,avgHrPctMax:0.8}], NOW);
ok('acúmulo <= 100', multi.lowerBodyFatigue<=100 && multi.lowerBodyFatigue>=run.lowerBodyFatigue*0.5);

// vazio
ok('sem atividades => none', computeFatigueState([], NOW).dominantRegion==='none');

console.log(`\nfatigue-state: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
