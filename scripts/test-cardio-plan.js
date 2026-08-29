const { buildCardioPlan } = require('./.tmp/cp/cardio-plan-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const NOW=Date.now();
const run=(d,km,min,hr)=>({dateMs:NOW-d*86400000,km,durationMin:min,avgHr:hr});
// histórico consistente melhorando
const runs=[]; for(let i=0;i<8;i++) runs.push(run(56-i*7, 6+i*0.2, (6+i*0.2)*5.5, 150-i));
const base=(o={})=>({goal:'performance',modality:'running',bodyFatPct:14,gender:'male',weeksOnPlan:6,recoveryCategory:'good',daysPerWeekAvailable:5,runs,cardioKm7:24,cardioSessions7:3,raceWeeks:null,strengthPriority:false,...o});

const p=buildCardioPlan(base());
ok('meta é faixa (min<ideal<limite)', p.weeklyKm.min < p.weeklyKm.ideal && p.weeklyKm.ideal < p.weeklyKm.safetyLimit);
ok('limite de segurança ~+20%', p.weeklyKm.safetyLimit >= Math.round(p.weeklyKm.ideal*1.2)-1);
ok('sessões respeitam disponibilidade', p.sessionsPerWeek<=5 && p.sessionsPerWeek>=1);
ok('distribuição soma ~100', Math.abs(p.intensityDistribution.z2Pct+p.intensityDistribution.thresholdPct+p.intensityDistribution.intervalPct-100)<=1);
ok('tem progressão 4 semanas', p.progression.length>=1);
ok('explicação não vazia', p.explanation.length>0);

// recuperação baixa contém e amplia faixa mínima p/ baixo
const low=buildCardioPlan(base({recoveryCategory:'low'}));
ok('recuperação baixa ajusta', low.adjustedForRecovery && low.minutesPerSession<=p.minutesPerSession);
ok('recuperação baixa: distribuição mais Z2', low.intensityDistribution.z2Pct>=85);

// prova em 2 semanas => taper + race_first
const race=buildCardioPlan(base({raceWeeks:1}));
ok('prova <=1sem => taper', race.phase==='taper' && race.racePriority==='race_first');
ok('taper sem intervalado', race.intervalSession===null);

// hipertrofia prioridade => cardio mínimo efetivo
const hyp=buildCardioPlan(base({goal:'hypertrophy',strengthPriority:true,raceWeeks:null}));
ok('hipertrofia => hypertrophy_first', hyp.racePriority==='hypertrophy_first');
ok('cardio limitado (<=3 sessões, <=30min)', hyp.sessionsPerWeek<=3 && hyp.minutesPerSession<=30);

// build/peak tem mais intervalado
const build=buildCardioPlan(base({raceWeeks:6}));
ok('build => mais threshold/interval', build.intensityDistribution.intervalPct>=10);
ok('build tem intervalado (recuperação ok)', build.intervalSession!==null);

// longão só corrida e fora do taper
ok('longão em corrida', p.longRunKm!==null && p.longRunKm>0);
ok('sem longão no taper', race.longRunKm===null);

console.log(`\ncardio-plan-engine: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
