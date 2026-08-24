const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/cardio/gps-track-audit.ts src/lib/cardio/gps-filter.ts --outDir scripts/.tmp/ga --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/ga/gps-track-audit.js');
let fail = 0; const ok = (c, msg) => { if (!c) { console.error('FAIL:', msg); fail++; } else console.log('ok:', msg); };

const P = (lat, lng, sec, acc) => ({ latitude: lat, longitude: lng, timestamp: new Date(1700000000000 + sec*1000).toISOString(), accuracy: acc });
// trajeto normal + 1 teleporte + 1 drift + 1 perda de sinal
const track = [
  P(-23.5000, -46.6000, 0, 5),
  P(-23.5003, -46.6000, 3, 5),   // ~33m em 3s ~ 40km/h? dist 0.033km /(3/3600)=40 -> ok (<45)
  P(-23.4000, -46.6000, 6, 5),   // salto ~11km em 3s -> teleport
  P(-23.5006, -46.6000, 9, 80),  // accuracy alta -> drift
  P(-23.5009, -46.6000, 40, 5),  // gap 31s -> signal_loss (mantido)
];
const a = m.auditTrack(track);
ok(a.summary.total === 5, 'total 5');
ok(a.points[2].anomaly === 'teleport', 'ponto 2 = teleport (' + a.points[2].anomaly + ')');
ok(a.points[2].kept === false && a.points[2].filtered === null, 'teleport nao entra no limpo mas raw preservado');
ok(a.points[2].raw.latitude === -23.4, 'raw do teleport preservado');
ok(a.points[3].anomaly === 'drift', 'ponto 3 = drift por accuracy');
ok(a.points[4].anomaly === 'signal_loss' && a.points[4].kept === true, 'perda de sinal mantida no traçado');
ok(a.summary.signalLossGaps === 1 && a.summary.maxGapSeconds >= 30, 'resumo perda de sinal');
ok(a.summary.teleport === 1 && a.summary.drift === 1, 'contagem anomalias');

// velocidade impossível
const speed = [ P(-23.5,-46.6,0,5), P(-23.5,-46.4,1,5) ]; // ~20km em 1s
const s = m.auditTrack(speed, { teleportKm: 999 }); // desliga teleport p/ isolar velocidade
ok(s.points[1].anomaly === 'impossible_speed', 'velocidade impossível detectada (' + s.points[1].anomaly + ')');

// ponto inválido -> spike
const bad = m.auditTrack([ P(-23.5,-46.6,0,5), { latitude: 999, longitude: 0, timestamp: null } ]);
ok(bad.points[1].anomaly === 'spike' && bad.points[1].kept === false, 'coordenada inválida -> spike');

// trajeto 100% limpo
const clean = m.auditTrack([ P(-23.5000,-46.6000,0,5), P(-23.5002,-46.6000,3,5), P(-23.5004,-46.6000,6,5) ]);
ok(clean.summary.kept === 3 && clean.summary.teleport === 0, 'trajeto limpo preservado inteiro');

if (fail) { console.error(fail + ' testes falharam'); process.exit(1); } else console.log('TODOS OS TESTES PASSARAM');
