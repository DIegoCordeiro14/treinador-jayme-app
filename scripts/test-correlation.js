const { pearson, analyzeCorrelation, CORRELATION_SPECS } = require('./.tmp/co/evolution-correlation-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// correlação positiva perfeita
ok('pearson +1', Math.abs(pearson([{x:1,y:2},{x:2,y:4},{x:3,y:6},{x:4,y:8}]) - 1) < 1e-9);
// negativa
ok('pearson -1', Math.abs(pearson([{x:1,y:8},{x:2,y:6},{x:3,y:4},{x:4,y:2}]) + 1) < 1e-9);
// poucos pontos
ok('pearson null <3 pts', pearson([{x:1,y:2},{x:2,y:3}])===null);

// sono -> performance forte positiva
const strong = analyzeCorrelation(CORRELATION_SPECS.sleep_performance,
  [{x:5,y:60},{x:6,y:65},{x:7,y:75},{x:8,y:82},{x:7.5,y:80},{x:6.5,y:70},{x:8,y:85}]);
ok('sono->perf forte', strong.strength==='strong' && strong.direction==='positive' && strong.reliable);
ok('mensagem cita correlação observada', /[Cc]orrelação observada/.test(strong.message));
ok('mensagem inclui disclaimer não-causa', /não prova de causa/i.test(strong.message));

// cardio -> recuperação negativa
const neg = analyzeCorrelation(CORRELATION_SPECS.cardio_recovery,
  [{x:10,y:80},{x:20,y:70},{x:30,y:62},{x:40,y:55},{x:25,y:66},{x:35,y:58}]);
ok('cardio->recovery negativa', neg.direction==='negative' && neg.reliable);

// sem evidência (ruído)
const noise = analyzeCorrelation(CORRELATION_SPECS.deficit_performance,
  [{x:1,y:50},{x:2,y:70},{x:3,y:40},{x:4,y:80},{x:5,y:45},{x:6,y:75}]);
ok('ruído => não confiável ou fraca', !noise.reliable || noise.strength==='weak' || noise.strength==='none');

// dados insuficientes
const few = analyzeCorrelation(CORRELATION_SPECS.volume_hypertrophy, [{x:10,y:1},{x:12,y:1.2}]);
ok('poucos dados => não confiável', few.reliable===false && few.r===null);

console.log(`\ncorrelation: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
