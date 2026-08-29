const { processGpsTrack, scoreFromStats } = require('./.tmp/gc/gps-core.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// gera um traçado reto ~1km, ~5 m/s (12 min/km? no, 5 m/s=3:20/km), pontos a cada 1s
function straight(n, accuracy, jitter=0){
  const pts=[]; let lat=-23.55, lng=-46.63; const t0=1700000000000;
  for(let i=0;i<n;i++){
    // ~0.0000451 deg lat ~ 5m
    lat += 0.0000451 + (jitter? (Math.random()-0.5)*jitter : 0);
    pts.push({ latitude:lat, longitude:lng, accuracy, speed:5, timestamp:t0+i*1000 });
  }
  return pts;
}
const clean = processGpsTrack(straight(120, 6));
ok('distância > 0', clean.distanceKm>0);
ok('captura 120', clean.captured===120);
ok('quality alta (traçado limpo, boa precisão)', clean.quality.score>=75);
ok('label coerente', ['excelente','boa'].includes(clean.quality.label));
ok('componentes somam ~score', Math.abs(Object.values(clean.quality.components).reduce((a,b)=>a+b,0)-clean.quality.score)<=2);
ok('pace calculado', clean.avgPaceSecPerKm>0);

// traçado com precisão ruim => quality menor
const poor = processGpsTrack(straight(120, 40));
ok('precisão ruim reduz quality', poor.quality.score < clean.quality.score);
ok('componente precision menor', poor.quality.components.precision < clean.quality.components.precision);

// traçado com gap grande (buraco de 40s) => continuidade cai
const gapPts = straight(60,6); gapPts[30].timestamp += 40000; for(let i=31;i<60;i++) gapPts[i].timestamp+=40000;
const gap = processGpsTrack(gapPts);
ok('gap reduz continuidade', gap.quality.components.continuity < clean.quality.components.continuity);

// scoreFromStats coerente com processGpsTrack
const statsClean = { captured:120, valid:118, discarded:2, spikes:0, rawKm:1.0, sumAccuracy:120*6, accuracyCount:120 };
const sf = scoreFromStats(statsClean, 1.0, 2);
ok('scoreFromStats alto p/ stats limpos', sf.score>=80 && ['excelente','boa'].includes(sf.label));
const sfBad = scoreFromStats({ captured:100, valid:60, discarded:40, spikes:15, rawKm:1.2, sumAccuracy:100*40, accuracyCount:100 }, 1.0, 50);
ok('scoreFromStats baixo p/ stats ruins', sfBad.score < sf.score);

// vazio
const empty = processGpsTrack([]);
ok('vazio => distância 0', empty.distanceKm===0 && empty.captured===0);

console.log(`\ngps-core: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
