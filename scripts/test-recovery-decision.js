const { analyzeRecoveryEvolution } = require('./.tmp/rd/recovery-evolution-engine.js');
const { evaluateDecision, summarizeDecisions } = require('./.tmp/rd/decision-outcome-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const day=(d)=>{const b=new Date('2026-08-28').getTime(); return new Date(b-d*86400000).toISOString().slice(0,10);};

// recuperação em queda + performance caindo => recovery_limiting
const decline=[]; for(let i=0;i<6;i++) decline.push({dateISO:day(30-i*5),recoveryScore:80-i*6,sleepH:7-i*0.2,restingHr:55+i,hrv:70-i*3});
const rDecline = analyzeRecoveryEvolution(decline, -4);
ok('recuperação declinando', rDecline.direction==='declining');
ok('performance limitada pela recuperação', rDecline.performanceLink==='recovery_limiting');
ok('mensagem cita limitação', /limit/i.test(rDecline.message));

// recuperação melhorando + performance subindo => supporting
const improve=[]; for(let i=0;i<6;i++) improve.push({dateISO:day(30-i*5),recoveryScore:50+i*7,sleepH:6+i*0.2,restingHr:60-i,hrv:55+i*3});
const rImp = analyzeRecoveryEvolution(improve, 5);
ok('recuperação melhorando', rImp.direction==='improving');
ok('suporte à performance', rImp.performanceLink==='recovery_supporting');

// sem dados
ok('sem pontos => unknown', analyzeRecoveryEvolution([], null).direction==='unknown');

// DECISÕES
// reduzir volume por recovery baixo -> recovery +18, força +3 => positiva
const good = evaluateDecision({ id:'1', decision:'Reduzir volume em 25%', domain:'training', appliedAtISO:day(14),
  strengthDeltaPct:3, recoveryDeltaPct:18, bodyFatDeltaPct:null, leanDeltaKg:null, targetMetric:'recovery' }, 10, 14);
ok('decisão avaliada como positiva', good.verdict==='positive');
ok('scoreDelta positivo', good.scoreDelta>0);

// decisão ruim: performance caiu muito
const bad = evaluateDecision({ id:'2', decision:'Aumentar volume 40%', domain:'training', appliedAtISO:day(20),
  strengthDeltaPct:-6, recoveryDeltaPct:-10, bodyFatDeltaPct:0, leanDeltaKg:0, targetMetric:'strength' }, 10, 20);
ok('decisão negativa', bad.verdict==='negative');

// ainda cedo => pending
const pend = evaluateDecision({ id:'3', decision:'Deload', domain:'recovery', appliedAtISO:day(3),
  strengthDeltaPct:null, recoveryDeltaPct:null, bodyFatDeltaPct:null, leanDeltaKg:null }, 10, 3);
ok('decisão recente => pending', pend.verdict==='pending');

// agregação
const stats = summarizeDecisions([good, bad, pend]);
ok('stats: 1 positiva 1 negativa 1 pendente', stats.positive===1 && stats.negative===1 && stats.pending===1);
ok('successRate 50%', stats.successRate===50);

console.log(`\nrecovery + decision: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
