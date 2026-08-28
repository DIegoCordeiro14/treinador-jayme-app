const { classifySignal, dataConfidence, adherenceConfidence, NOISE_PROFILES } =
  require('./.tmp/esg/evolution-signal-engine.js');
const { linearTrend } = require('./.tmp/esg/body-metrics-unifier.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

const day = (d)=>{ const base=new Date('2026-08-28').getTime(); return new Date(base - d*86400000).toISOString().slice(0,10); };

// RUÍDO: peso sobe 1.2kg em 3 dias (poucos pontos, dentro do ruído/curto)
const noise = classifySignal('weightKg', [
  {dateISO:day(3),value:99.0},{dateISO:day(2),value:99.6},{dateISO:day(0),value:100.2},
]);
ok('ganho de 3 dias => não confirmado', noise.classification!=='confirmed');

// CONFIRMADO: perda consistente 100->96 em 40 dias, 8 pontos, quase linear
const pts=[];
for(let i=0;i<8;i++) pts.push({dateISO:day(40-i*5), value:100 - i*0.55});
const confirmed = classifySignal('weightKg', pts);
ok('perda linear longa => confirmed', confirmed.classification==='confirmed');
ok('confirmed tem confiança alta', confirmed.confidence>=55);
ok('changePerWeek negativo', confirmed.changePerWeek<0);

// POSSÍVEL: mudança acima do ruído mas poucos pontos
const possible = classifySignal('weightKg', [
  {dateISO:day(12),value:100},{dateISO:day(0),value:97.5},
]);
ok('2 pontos com mudança grande => possible', possible.classification==='possible');

// pequena variação dentro do ruído => noise mesmo com muitos pontos
const flat=[]; for(let i=0;i<8;i++) flat.push({dateISO:day(40-i*5), value:100 + (i%2?0.2:-0.2)});
ok('oscilação pequena => noise', classifySignal('weightKg',flat).classification==='noise');

// data confidence sobe com pontos e span
const few = dataConfidence(linearTrend([{dateISO:day(4),value:100},{dateISO:day(0),value:99}]), NOISE_PROFILES.weightKg);
const many = dataConfidence(linearTrend(pts), NOISE_PROFILES.weightKg);
ok('mais pontos/span => mais confiança', many > few);

// adherence confidence
ok('3/14 dias => baixa confiança', adherenceConfidence(3,14).confidence < 40 && /Baixa/.test(adherenceConfidence(3,14).note));
ok('12/14 dias => alta', adherenceConfidence(12,14).confidence >= 80);

console.log(`\nevolution-signal: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
