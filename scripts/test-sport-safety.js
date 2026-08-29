const { getSportProfile, listSportProfiles } = require('./.tmp/ss/sport-intelligence-profiles.js');
const { planCardioSafety } = require('./.tmp/ss/cardio-safety-planner.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// SPORT PROFILES
ok('corrida => usa GPS, foco inferior', (()=>{const p=getSportProfile('corrida_recreativa'); return p.usesGps && p.fatigueFocus==='lower' && p.loadDriver==='distance';})());
ok('natação => SWOLF, foco superior, sem GPS', (()=>{const p=getSportProfile('natacao'); return p.primaryMetrics.includes('swolf') && p.fatigueFocus==='upper' && !p.usesGps;})());
ok('ciclismo => power', getSportProfile('ciclismo').primaryMetrics.includes('power'));
ok('HIIT => intervals, central', (()=>{const p=getSportProfile('hiit'); return p.loadDriver==='intervals' && p.fatigueFocus==='central';})());
ok('desconhecido => other', getSportProfile('xadrez').sport==='other');
ok('lista completa', listSportProfiles().length>=7);

// SAFETY PLANNER
// LCA/joelho em recuperação: corrida restricted, bike/natação compatible
const knee=planCardioSafety([{bodyRegion:'joelho',status:'rehab',active:true}]);
const run=knee.modalities.find(m=>m.modality==='running');
const swim=knee.modalities.find(m=>m.modality==='swimming');
ok('joelho => corrida restricted/caution', run.level!=='compatible');
ok('joelho => natação compatible', swim.level==='compatible');
ok('tem alternativas seguras', knee.safestAlternatives.length>0);

// fratura no pé (aguda): corrida restricted, natação compatible
const foot=planCardioSafety([{bodyRegion:'pé',status:'fratura',active:true}]);
ok('fratura no pé => corrida restricted', foot.modalities.find(m=>m.modality==='running').level==='restricted');
ok('fratura => natação segura', foot.modalities.find(m=>m.modality==='swimming').level==='compatible');

// lombar => remo/bike cautela, natação ok
const lumbar=planCardioSafety([{bodyRegion:'lombar',status:'injury',active:true}]);
ok('lombar => remo com cautela/restrito', lumbar.modalities.find(m=>m.modality==='rowing').level!=='compatible');

// sem condições => tudo compatível
const none=planCardioSafety([]);
ok('sem condições => sem restrição', !none.hasRestriction && none.safestAlternatives.length===6);
// condição inativa ignorada
ok('inativa ignorada', !planCardioSafety([{bodyRegion:'joelho',status:'rehab',active:false}]).hasRestriction);
ok('disclaimer clínico', /profissional de saúde/i.test(knee.disclaimer));

console.log(`\nsport + safety: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
