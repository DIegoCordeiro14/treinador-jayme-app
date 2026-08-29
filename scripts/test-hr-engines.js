const { cleanHeartRate } = require('./.tmp/hr/hr-outlier-engine.js');
const { computeHrZones, resolveMaxHr, timeInZones } = require('./.tmp/hr/heart-rate-zone-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// OUTLIER — série normal ~150, com um pico isolado de 210 por 1 amostra
const s=[]; for(let i=0;i<30;i++) s.push({tSec:i*2, bpm:148+ (i%5)});
s.splice(15,0,{tSec:29,bpm:210}); // isolado espúrio (salto e volta)
const r=cleanHeartRate(s, {historicalMax:175});
ok('remove o pico espúrio', r.removed>=1);
ok('FCmáx confiável não é 210', r.reliableMax<200);
ok('flags mencionam remoção', r.flags.length>0);
ok('avg confiável ~150', Math.abs(r.reliableAvg-150)<8);

// FCmáx sustentada (aparece 3x) é aceita
const s2=[]; for(let i=0;i<20;i++) s2.push({tSec:i*2,bpm:150});
s2.push({tSec:40,bpm:185},{tSec:42,bpm:186},{tSec:44,bpm:184});
ok('FCmáx sustentada aceita (~185)', cleanHeartRate(s2).reliableMax>=184);

// histórico limita FCmáx da sessão
ok('não infla FCmáx acima do histórico +15', cleanHeartRate([{tSec:0,bpm:150},{tSec:2,bpm:205},{tSec:4,bpm:204},{tSec:6,bpm:150}],{historicalMax:180}).reliableMax<=180);

// vazio
ok('vazio => null', cleanHeartRate([]).reliableMax===null);

// ZONES — hierarquia da FCmáx
ok('medida > configurada', resolveMaxHr({measuredMaxHr:190,configuredMaxHr:185,age:30}).source==='measured');
ok('configurada > idade', resolveMaxHr({measuredMaxHr:null,configuredMaxHr:185,age:30}).source==='configured');
ok('idade fallback', resolveMaxHr({age:30}).source==='age_estimate');
const z=computeHrZones({measuredMaxHr:190, restingHr:50});
ok('karvonen quando há repouso', z.method==='karvonen');
ok('5 zonas ordenadas', z.zones.length===5 && z.zones[0].high<=z.zones[4].low);
ok('Z5 topo ~ FCmáx', z.zones[4].high===190);
const zNoRest=computeHrZones({measuredMaxHr:190});
ok('sem repouso => pct_max', zNoRest.method==='pct_max' && zNoRest.zones[0].low===Math.round(0.5*190));

// timeInZones
const samples=[{tSec:0,bpm:120},{tSec:10,bpm:120},{tSec:20,bpm:175}];
const secs=timeInZones(samples, z.zones);
ok('distribui segundos nas zonas', secs.reduce((a,b)=>a+b,0)===20);

console.log(`\nhr-outlier + zones: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
