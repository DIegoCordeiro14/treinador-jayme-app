const { detectRecomposition, detectPlateau } = require('./.tmp/rpe/recomposition-plateau-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// Recomposição clássica: peso +0.2, BF -1.4, magra +1.1, força +8
const r = detectRecomposition({ weightDeltaKg:0.2, bodyFatDeltaPct:-1.4, leanDeltaKg:1.1, strengthDeltaPct:8, waistDeltaCm:-1.0, periodDays:30 });
ok('recomposição detectada', r.verdict==='recomposition');
ok('recomposição confiança alta', r.confidence==='high');
ok('recomposição cita sinais', r.signals.length>=3);

// perda de gordura pura
const fl = detectRecomposition({ weightDeltaKg:-2, bodyFatDeltaPct:-1.5, leanDeltaKg:0, strengthDeltaPct:1, waistDeltaCm:-1.5, periodDays:30 });
ok('fat_loss', fl.verdict==='fat_loss');

// ganho de massa
const mg = detectRecomposition({ weightDeltaKg:1.5, bodyFatDeltaPct:0.2, leanDeltaKg:1.2, strengthDeltaPct:6, waistDeltaCm:0, periodDays:30 });
ok('muscle_gain', mg.verdict==='muscle_gain');

// perda muscular (alerta)
const ml = detectRecomposition({ weightDeltaKg:-2, bodyFatDeltaPct:0, leanDeltaKg:-1.2, strengthDeltaPct:-5, waistDeltaCm:0, periodDays:30 });
ok('muscle_loss', ml.verdict==='muscle_loss');

// inconclusivo
const inc = detectRecomposition({ weightDeltaKg:0.1, bodyFatDeltaPct:null, leanDeltaKg:null, strengthDeltaPct:null, waistDeltaCm:null, periodDays:30 });
ok('inconclusive', inc.verdict==='inconclusive');

// PLATÔ: peso parado mas cintura -2 e força +5 => NÃO é platô
const noPlateau = detectPlateau({ periodDays:21, weightDeltaKg:0.1, bodyFatDeltaPct:null, waistDeltaCm:-2, strengthDeltaPct:5, volumeDeltaPct:0 });
ok('peso parado + progresso => não é platô', noPlateau.isPlateau===false && noPlateau.improvingSignals.length>=1);

// PLATÔ real: tudo estagnado
const realPlateau = detectPlateau({ periodDays:28, weightDeltaKg:0.1, bodyFatDeltaPct:-0.1, waistDeltaCm:-0.2, strengthDeltaPct:1, volumeDeltaPct:1 });
ok('tudo estagnado => platô real', realPlateau.isPlateau===true);

// período curto => nunca platô
ok('período curto => sem platô', detectPlateau({ periodDays:10, weightDeltaKg:0, bodyFatDeltaPct:0, waistDeltaCm:0, strengthDeltaPct:0, volumeDeltaPct:0 }).isPlateau===false);

// peso ainda em movimento => sem platô
ok('peso caindo => sem platô', detectPlateau({ periodDays:30, weightDeltaKg:-1.2, bodyFatDeltaPct:0, waistDeltaCm:0, strengthDeltaPct:0, volumeDeltaPct:0 }).isPlateau===false);

console.log(`\nrecomp+plateau: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
