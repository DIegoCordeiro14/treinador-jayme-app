const { computeCardioEnergy } = require('./.tmp/ce2/cardio-energy-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const base=(o={})=>({modality:'running',...o});

// wearable tem prioridade
const w=computeCardioEnergy(base({wearableKcal:540,weightKg:80,avgHr:150,age:30,durationMin:40,distanceKm:8}));
ok('wearable prioridade', w.source==='wearable' && w.kcal===540 && w.estimated===false);
// FC model quando não há wearable
const hr=computeCardioEnergy(base({avgHr:155,weightKg:80,age:30,gender:'male',durationMin:40}));
ok('FC model', hr.source==='hr_model' && hr.kcal>0 && hr.estimated===true);
ok('FC label', /FC/.test(hr.sourceLabel));
// MET model quando não há FC
const met=computeCardioEnergy(base({weightKg:80,durationMin:40,intensity:'moderada'}));
ok('MET model', met.source==='met_model' && met.kcal>0);
// distância fallback
const dist=computeCardioEnergy(base({distanceKm:10}));
ok('distância fallback', dist.source==='distance_fallback' && dist.kcal>0);
// caminhada usa kcal/km menor
ok('caminhada < corrida por km', computeCardioEnergy(base({modality:'walking',distanceKm:10})).kcal < computeCardioEnergy(base({modality:'running',distanceKm:10})).kcal);
// FC feminina difere de masculina
const f=computeCardioEnergy(base({avgHr:155,weightKg:65,age:30,gender:'female',durationMin:40}));
ok('modelo por sexo difere', f.kcal!==hr.kcal);
// intensidade alta > leve no MET
ok('intensidade alta gasta mais', computeCardioEnergy(base({weightKg:80,durationMin:40,intensity:'alta'})).kcal > met.kcal);
ok('sempre informa origem', !!w.sourceLabel && !!dist.sourceLabel);

console.log(`\ncardio-energy: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
