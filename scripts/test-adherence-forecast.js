const { computeCardioAdherence } = require('./.tmp/af/cardio-adherence-engine.js');
const { forecastPerformance } = require('./.tmp/af/performance-forecast-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// ADHERENCE
const full=computeCardioAdherence({plannedSessions:4,doneSessions:4,plannedKm:24,doneKm:23,plannedTypes:{long_run:1,interval:1,easy:2},doneTypes:{long_run:1,interval:1,easy:2},intensityCompliance:0.8});
ok('plano seguido => followed_plan', full.interpretation==='followed_plan' && full.overall>=80);
const none=computeCardioAdherence({plannedSessions:4,doneSessions:0,plannedKm:24,doneKm:0});
ok('não treinou => did_not_train', none.interpretation==='did_not_train' && none.overall<40);
ok('não treinou nota clara', /falta de execu/.test(none.note));
const partial=computeCardioAdherence({plannedSessions:4,doneSessions:2,plannedKm:24,doneKm:10,plannedTypes:{interval:1},doneTypes:{}});
ok('parcial', partial.interpretation==='partial');
ok('tipos não cumpridos reduz', partial.types<100);
ok('dimensões 0..100', full.sessions<=100 && full.volume<=100 && full.intensity<=100);
ok('followed_plan sugere revisar estratégia', /revisar a estrat/.test(full.note));

// FORECAST
const f=forecastPerformance({bestDistanceKm:5, bestTimeMin:25, targetKm:10, paceTrendPct:-3, efficiencyTrendPct:-2, adherence:85, recoveryScore:75, weeksToRace:4});
ok('10k > 5k (Riegel)', f.expectedMin>25);
ok('cenários ordenados (otimista<provável<conservador)', f.optimisticMin<f.expectedMin && f.expectedMin<f.conservativeMin);
ok('confiança alta com bons dados', f.confidence==='high');
const fLow=forecastPerformance({bestDistanceKm:5,bestTimeMin:25,targetKm:42,paceTrendPct:null,efficiencyTrendPct:null,adherence:40,recoveryScore:40,weeksToRace:null});
ok('faixa mais larga com baixa confiança', (fLow.conservativeMin-fLow.optimisticMin) > (f.conservativeMin-f.optimisticMin));
ok('disclaimer presente', /não garantia|Faixa/.test(f.disclaimer));
ok('sem base => null', forecastPerformance({bestDistanceKm:0,bestTimeMin:0,targetKm:10,paceTrendPct:null,efficiencyTrendPct:null,adherence:null,recoveryScore:null,weeksToRace:null})===null);

console.log(`\nadherence + forecast: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
