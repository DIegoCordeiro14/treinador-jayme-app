const { computeActivityImpact } = require('./.tmp/ic/activity-impact-engine.js');
const { analyzeConcurrent } = require('./.tmp/ic/concurrent-training-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// IMPACT
const run=computeActivityImpact({kind:'running',durationMin:50,distanceKm:9,avgHrPctMax:0.8,elevationGainM:120});
ok('corrida => fadiga inferior alta', run.lowerBodyFatigue>run.upperBodyFatigue);
ok('trainingLoad 0..100', run.trainingLoad>0 && run.trainingLoad<=100);
const swim=computeActivityImpact({kind:'swimming',durationMin:40,avgHrPctMax:0.75});
ok('natação => fadiga superior > inferior', swim.upperBodyFatigue>swim.lowerBodyFatigue);
const cyc=computeActivityImpact({kind:'cycling',durationMin:60,avgHrPctMax:0.8});
ok('ciclismo carrega pernas (central+inferior)', cyc.lowerBodyFatigue>0 && cyc.centralFatigue>0);
const legDay=computeActivityImpact({kind:'strength',durationMin:60,strengthMuscles:['legs','glutes']});
ok('força de perna => fadiga inferior alta', legDay.lowerBodyFatigue>=60);
ok('intensidade alta aumenta carga', computeActivityImpact({kind:'hiit',durationMin:30,avgHrPctMax:0.95}).trainingLoad > computeActivityImpact({kind:'hiit',durationMin:30,avgHrPctMax:0.5}).trainingLoad);

// CONCURRENT — perna segunda (1), intervalado terça (2) => conflito
const conflict=analyzeConcurrent({sessions:[
  {weekday:1,kind:'strength_legs',intensity:'high'},
  {weekday:2,kind:'run_interval',intensity:'high'},
  {weekday:4,kind:'strength_upper'},
  {weekday:6,kind:'run_long'},
], priority:'race_first'});
ok('detecta conflito perna×intervalado <24h', conflict.conflicts.length>=1);
ok('risco moderado/alto', conflict.interferenceRisk!=='low');
ok('recomenda afastar 24h', conflict.recommendations.some(r=>/24h/.test(r)));
ok('loads calculados', conflict.strengthLoad>0 && conflict.enduranceLoad>0);
ok('concurrentLoad 0..100', conflict.concurrentLoad>=0 && conflict.concurrentLoad<=100);

// sem conflito (bem distribuído)
const good=analyzeConcurrent({sessions:[
  {weekday:1,kind:'strength_legs'},
  {weekday:3,kind:'run_easy'},
  {weekday:5,kind:'run_interval'},
], priority:'balanced'});
ok('distribuição boa => risco baixo', good.interferenceRisk==='low' && good.conflicts.length===0);

// DOMS + conflito => alto
const doms=analyzeConcurrent({sessions:[{weekday:1,kind:'strength_legs'},{weekday:1,kind:'run_interval'}], priority:'hypertrophy_first', doms:true});
ok('DOMS + conflito => alto risco', doms.interferenceRisk==='high');
ok('hipertrofia => Z2 no dia seguinte', doms.recommendations.some(r=>/Z2|leve/i.test(r)));

console.log(`\nimpact + concurrent: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
