const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/wearables/strength-physiology.ts --outDir scripts/.tmp/sp --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/sp/strength-physiology.js');
let fail = 0; const ok = (c, msg) => { if (!c) { console.error('FAIL:', msg); fail++; } else console.log('ok:', msg); };

// FCmáx
ok(m.resolveMaxHr(190, 30) === 190, 'usa maxHr fornecido');
ok(m.resolveMaxHr(null, 30) === 190, 'fallback 220-idade');
ok(m.resolveMaxHr(null, null) === null, 'sem dados -> null');

// zonas
ok(m.hrZoneFromPct(55) === 1 && m.hrZoneFromPct(65) === 2 && m.hrZoneFromPct(75) === 3 && m.hrZoneFromPct(85) === 4 && m.hrZoneFromPct(95) === 5, 'zonas por %FCmax');

// mapeamento por janela
const hr = [];
for (let t = 0; t <= 200000; t += 10000) hr.push({ t, bpm: 120 + (t/10000) }); // 120..140
const sets = [
  { setNumber: 1, startMs: 0, endMs: 50000 },       // amostras 120..125
  { setNumber: 2, startMs: 100000, endMs: 150000 }, // 130..135
  { setNumber: 3, startMs: 500000, endMs: 600000 }, // sem amostras
];
const cal = [{ t: 20000, kcal: 5 }, { t: 40000, kcal: 6 }, { t: 120000, kcal: 7 }];
const res = m.mapSetPhysiology({ sets, hrSamples: hr, calorieSamples: cal, maxHr: 190 });
ok(res[0].samples === 6, 'set1 6 amostras (0..50s)');
ok(res[0].avgHr === 123 || res[0].avgHr === 122 || res[0].avgHr === 123, 'set1 avgHr ~122-123 (' + res[0].avgHr + ')');
ok(res[0].maxHr === 125, 'set1 maxHr 125');
ok(res[0].zone === 1 || res[0].zone === 2, 'set1 zona baixa');
ok(res[0].calories === 11, 'set1 calorias 5+6=11 (' + res[0].calories + ')');
ok(res[2].avgHr === null && res[2].samples === 0 && res[2].calories === null, 'set3 sem amostras -> nulls');

const sum = m.summarizeStrengthPhysiology(res);
ok(sum.setsWithHr === 2, 'resumo: 2 séries com FC');
ok(sum.peakHr === 135, 'resumo: peak 135');
ok(sum.totalCalories === 18, 'resumo: calorias 11+7=18 (' + sum.totalCalories + ')');
ok(sum.avgHr != null && sum.avgPctHrMax != null, 'resumo: avg/pct presentes');

// sem FCmax -> pct null mas avg presente
const res2 = m.mapSetPhysiology({ sets: [sets[0]], hrSamples: hr });
ok(res2[0].avgHr != null && res2[0].pctHrMax === null && res2[0].zone === null, 'sem FCmax: avg ok, pct/zona null');

if (fail) { console.error(fail + ' testes falharam'); process.exit(1); } else console.log('TODOS OS TESTES PASSARAM');
