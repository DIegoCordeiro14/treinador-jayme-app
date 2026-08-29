const { learnCardioResponse, toCardioProfileRow } = require('./.tmp/crp/cardio-response-profile.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// poucos dados => regra populacional
ok('poucos dados => 5-10 default', (()=>{const r=learnCardioResponse({observations:[{volumeIncreasePct:8,outcome:'improved'}]}); return r.idealProgression.low===5 && r.idealProgression.high===10 && r.volumeTolerance==='unknown';})());

// atleta que tolera bastante volume: +8 improved, +12 stable, +18 dropped
const highTol=learnCardioResponse({observations:[
  {volumeIncreasePct:8,outcome:'improved',kind:'volume'},
  {volumeIncreasePct:12,outcome:'improved',kind:'volume'},
  {volumeIncreasePct:14,outcome:'improved',kind:'volume'},
  {volumeIncreasePct:18,outcome:'recovery_dropped',kind:'volume'},
]});
ok('tolerância alta', highTol.volumeTolerance==='high');
ok('zona ideal sobe (>10)', highTol.idealProgression.high>10);
ok('cautela >= onde caiu (18)', highTol.cautionHigh>=16);
ok('confidence >0', highTol.confidence>0);

// atleta sensível: cai já em +8
const lowTol=learnCardioResponse({observations:[
  {volumeIncreasePct:5,outcome:'improved',kind:'volume'},
  {volumeIncreasePct:6,outcome:'stable',kind:'volume'},
  {volumeIncreasePct:8,outcome:'recovery_dropped',kind:'volume'},
  {volumeIncreasePct:10,outcome:'recovery_dropped',kind:'volume'},
]});
ok('tolerância baixa', lowTol.volumeTolerance==='low');
ok('zona ideal conservadora', lowTol.idealProgression.high<=8);

// resposta a longão
const lr=learnCardioResponse({observations:[
  {volumeIncreasePct:8,outcome:'improved',kind:'long_run'},
  {volumeIncreasePct:8,outcome:'improved',kind:'long_run'},
  {volumeIncreasePct:8,outcome:'stable',kind:'volume'},
]});
ok('longão responds_well', lr.longRunResponse==='responds_well');

// row persistível
const row=toCardioProfileRow('u1', highTol);
ok('row tem campos', row.user_id==='u1' && row.ideal_progression_high===highTol.idealProgression.high && row.confidence_score===highTol.confidence);

console.log(`\ncardio-response-profile: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
