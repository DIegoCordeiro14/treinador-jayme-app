const { analyzeAdherence } = require('./.tmp/ap/adherence-engine.js');
const { classifyPlanResponse } = require('./.tmp/ap/plan-response-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// ADHERENCE
const high = analyzeAdherence({sessionsPlanned:12,sessionsCompleted:11,avgPlannedDurationMin:60,avgRealDurationMin:58});
ok('alta aderência', high.level==='high' && high.completionRate>=0.8);
// abandona o final => duration/order
const drop = analyzeAdherence({sessionsPlanned:12,sessionsCompleted:8,avgPlannedDurationMin:75,avgRealDurationMin:50,lateDropRate:0.4});
ok('abandono do fim => duration/order', drop.likelyCauses.includes('duration') && drop.likelyCauses.includes('order'));
ok('recomenda encurtar/mover início', /[Ee]ncurtar|início/.test(drop.recommendation));
// exercícios pulados
const skip = analyzeAdherence({sessionsPlanned:12,sessionsCompleted:9,avgPlannedDurationMin:60,avgRealDurationMin:58,skippedByExercise:[{exerciseId:'x',name:'Agachamento hack',skipRate:0.6}]});
ok('exercício muito pulado => praticidade', skip.likelyCauses.includes('exercise_practicality') && skip.frequentlySkipped.includes('Agachamento hack'));

// PLAN RESPONSE
const great = classifyPlanResponse({strengthDeltaPct:8,volumeToleratedRate:0.95,avgRirTrend:0.2,recoveryTrend:'improving',adherenceRate:0.95,bodyProgress:'positive'});
ok('plano muito efetivo', great.classification==='HIGHLY_EFFECTIVE' && great.score>=45);
const fatigue = classifyPlanResponse({strengthDeltaPct:-2,volumeToleratedRate:0.5,avgRirTrend:-1.5,recoveryTrend:'declining',adherenceRate:0.8,bodyProgress:'neutral'});
ok('fadiga excessiva detectada', fatigue.classification==='EXCESSIVE_FATIGUE');
ok('hint de deload', /deload|recupera/i.test(fatigue.nextGenerationHint));
const neutral = classifyPlanResponse({strengthDeltaPct:1,volumeToleratedRate:0.7,avgRirTrend:0,recoveryTrend:'stable',adherenceRate:0.7,bodyProgress:'neutral'});
ok('resposta morna => NEUTRAL', neutral.classification==='NEUTRAL');
const ineff = classifyPlanResponse({strengthDeltaPct:-3,volumeToleratedRate:0.6,avgRirTrend:0,recoveryTrend:'stable',adherenceRate:0.4,bodyProgress:'negative'});
ok('baixa resposta/aderência => INEFFECTIVE', ineff.classification==='INEFFECTIVE');

console.log(`\nadherence + plan-response: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
