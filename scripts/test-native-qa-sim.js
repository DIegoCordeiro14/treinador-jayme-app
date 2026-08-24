/**
 * SIMULAÇÃO do protocolo de QA físico (§33) sobre os motores reais.
 * NÃO substitui a validação em aparelho — alimenta fixtures que imitam payloads reais
 * de Health Connect/HealthKit através da pipeline determinística e verifica o
 * comportamento ponta-a-ponta (normalização, classificação, dedup, FC por série,
 * auditoria de rota). "PASS" aqui = a lógica está correta assumindo dados reais.
 */
const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/wearables/native-normalize.ts src/lib/cardio/sport-types.ts src/lib/wearables/strength-physiology.ts src/lib/cardio/gps-track-audit.ts src/lib/cardio/gps-filter.ts src/native/health/definitions.ts --outDir scripts/.tmp/qa --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const nn = require('./.tmp/qa/lib/wearables/native-normalize.js');
const sp = require('./.tmp/qa/lib/wearables/strength-physiology.js');
const ga = require('./.tmp/qa/lib/cardio/gps-track-audit.js');

let fail = 0; const ok = (c, msg) => { if (!c) { console.error('   ✗', msg); fail++; } else console.log('   ✓', msg); };
const iso = (base, sec) => new Date(base + sec * 1000).toISOString();
const T0 = Date.UTC(2026, 4, 10, 12, 0, 0);

// ───────────────────────────────────────────────────────────────────────────
console.log('\nTESTE 1 — Força (treino 60min com relógio)');
{
  // sessão de força do Coach já existente
  const coachSession = [{ id: 'SESS-A', startedAt: iso(T0, 0), endedAt: iso(T0, 3600) }];
  // atividade "strength" vinda do relógio, sobrepondo a janela
  const watch = { externalId: 'hc-strength-1', provider: 'health_connect', sportType: 'strength training', startedAt: iso(T0, 30), endedAt: iso(T0, 3550), durationSeconds: 3520, caloriesActive: 410, hasRoute: false, hasHeartRateSamples: true };
  const decision = nn.classifyNativeWorkout(watch, coachSession);
  ok(decision.destination === 'enrich_strength' && decision.strengthSessionId === 'SESS-A', 'treino casado com a sessão do Coach (sem cardio duplicado)');

  // FC por série: 4 séries com janelas; amostras a cada 10s subindo 130->165
  const hr = []; for (let s = 0; s <= 3600; s += 10) hr.push({ t: T0 + s * 1000, bpm: 130 + Math.round((s / 3600) * 35) });
  const sets = [
    { setNumber: 1, startMs: T0 + 300 * 1000, endMs: T0 + 360 * 1000 },
    { setNumber: 2, startMs: T0 + 900 * 1000, endMs: T0 + 960 * 1000 },
    { setNumber: 3, startMs: T0 + 1800 * 1000, endMs: T0 + 1860 * 1000 },
    { setNumber: 4, startMs: T0 + 3000 * 1000, endMs: T0 + 3060 * 1000 },
  ];
  const phys = sp.mapSetPhysiology({ sets, hrSamples: hr, maxHr: 190 });
  ok(phys.every(p => p.avgHr != null && p.avgHr >= 130 && p.avgHr <= 165), 'FC média por série dentro do esperado (130–165)');
  ok(phys.every(p => p.zone >= 1 && p.zone <= 5 && p.pctHrMax != null), '%FCmax e zona calculados por série');
  ok(phys[3].avgHr > phys[0].avgHr, 'FC sobe ao longo da sessão (série 4 > série 1)');
  const sum = sp.summarizeStrengthPhysiology(phys);
  ok(sum.peakHr <= 165 && sum.setsWithHr === 4, 'resumo da sessão coerente (4 séries com FC)');

  // enriquecimento retroativo: força sem sessão ainda -> não vira cardio, aguarda
  const later = nn.classifyNativeWorkout(watch, []);
  ok(later.destination === 'skip', 'força sem sessão do Coach na janela não cria cardio (aguarda enriquecimento)');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('TESTE 2 — Corrida (rota + FC)');
{
  const route = []; let lat = -23.55, lng = -46.63;
  for (let s = 0; s <= 1800; s += 5) { lat += 0.00008; lng += 0.00003; route.push({ timestamp: iso(T0, s), latitude: lat, longitude: lng, altitude: 750 + Math.sin(s / 100) * 3, accuracy: 5 }); }
  // injeta 1 teleporte e 1 ponto de baixa precisão (device real gera esses)
  route.splice(100, 0, { timestamp: iso(T0, 498), latitude: -23.40, longitude: -46.63, altitude: 750, accuracy: 6 });
  route.splice(50, 0, { timestamp: iso(T0, 248), latitude: lat, longitude: lng, altitude: 750, accuracy: 90 });

  const details = { externalId: 'hc-run-1', provider: 'health_connect', sportType: 'running', sourceSportType: 'RUNNING', startedAt: iso(T0, 0), endedAt: iso(T0, 1800), durationSeconds: 1800, distanceMeters: 5200, caloriesActive: 320, avgHeartRate: 158, maxHeartRate: 176, hasRoute: true, hasHeartRateSamples: true, route, heartRateSamples: [{ timestamp: iso(T0, 10), bpm: 150 }] };
  const decision = nn.classifyNativeWorkout(details, []);
  ok(decision.destination === 'import_cardio', 'corrida classificada como cardio');
  const row = nn.toCardioRow(details);
  ok(row.type === 'Corrida' && row.distance_km === 5.2 && row.uses_gps === true, 'distância e modalidade corretas');
  ok(row.avg_hr === 158 && row.max_hr === 176, 'FC média/máx importadas');
  ok(row.gps_track && row.gps_track.coordinates.length > 100, 'rota importada para mapa/replay');

  const audit = ga.auditTrack(route);
  ok(audit.summary.teleport >= 1, 'auditoria detecta o teleporte');
  ok(audit.summary.drift >= 1, 'auditoria detecta ponto de baixa precisão (drift)');
  ok(audit.points.filter(p => p.kept).length >= route.length - 5, 'traçado real preservado (só anomalias removidas do limpo)');
  ok(audit.points.find(p => p.anomaly === 'teleport').raw.latitude === -23.40, 'ponto bruto do teleporte preservado');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('TESTE 3 — Ciclismo');
{
  const d = { externalId: 'hc-bike-1', provider: 'health_connect', sportType: 'biking', sourceSportType: 'BIKING', startedAt: iso(T0, 0), endedAt: iso(T0, 3600), durationSeconds: 3600, distanceMeters: 24000, caloriesActive: 600, avgHeartRate: 142, maxHeartRate: 168, hasRoute: true, hasHeartRateSamples: true, route: [{ timestamp: iso(T0, 0), latitude: -23.5, longitude: -46.6, accuracy: 5 }, { timestamp: iso(T0, 5), latitude: -23.5006, longitude: -46.6, accuracy: 5 }], heartRateSamples: [] };
  ok(nn.classifyNativeWorkout(d, []).destination === 'import_cardio', 'ciclismo -> cardio');
  const row = nn.toCardioRow(d);
  ok(row.type === 'Ciclismo' && row.distance_km === 24 && row.avg_hr === 142, 'classificação/distância/FC corretas');
  ok(row.uses_gps === true && row.gps_track, 'rota de ciclismo disponível');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('TESTE 4 — HIIT');
{
  const d = { externalId: 'hc-hiit-1', provider: 'health_connect', sportType: 'HIIT', sourceSportType: 'HIGH_INTENSITY_INTERVAL_TRAINING', startedAt: iso(T0, 0), endedAt: iso(T0, 1200), durationSeconds: 1200, caloriesActive: 240, avgHeartRate: 165, maxHeartRate: 185, hasRoute: false, hasHeartRateSamples: true, route: [], heartRateSamples: [{ timestamp: iso(T0, 10), bpm: 170 }] };
  ok(nn.classifyNativeWorkout(d, []).destination === 'import_cardio', 'HIIT -> cardio');
  const row = nn.toCardioRow(d);
  ok(row.type === 'HIIT' && row.duration_min === 20 && row.calories_burned === 240 && row.avg_hr === 165, 'classificação/duração/calorias/FC');
  ok(row.uses_gps === false && row.gps_track === null, 'HIIT sem rota (não sintetiza)');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('TESTE 5 — Natação (só dados disponíveis)');
{
  const d = { externalId: 'hc-swim-1', provider: 'health_connect', sportType: 'swimming', sourceSportType: 'SWIMMING_POOL', startedAt: iso(T0, 0), endedAt: iso(T0, 1800), durationSeconds: 1800, distanceMeters: 1500, caloriesActive: 380, avgHeartRate: null, maxHeartRate: null, hasRoute: false, hasHeartRateSamples: false, route: [], heartRateSamples: [] };
  ok(nn.classifyNativeWorkout(d, []).destination === 'import_cardio', 'natação -> cardio');
  const row = nn.toCardioRow(d);
  ok(row.type === 'Natação' && row.distance_km === 1.5, 'modalidade/distância');
  ok(row.avg_hr === null && row.gps_track === null, 'sem FC/rota: campos nulos (nada inventado)');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('Background / robustez');
{
  // dedup: mesma atividade já importada não repete
  const w = { externalId: 'hc-run-1', provider: 'health_connect', sportType: 'running', startedAt: iso(T0, 0), endedAt: iso(T0, 60), hasRoute: false, hasHeartRateSamples: false, distanceMeters: 100 };
  const seen = new Set([nn.dedupKey(w)]);
  ok(nn.dedupWorkouts([w], seen).length === 0, 'dedup: atividade já importada não duplica');
  // janela incremental com overlap (sync após reconexão não perde registros tardios)
  const win = nn.incrementalWindow(iso(T0, 0), iso(T0, 3600), 10);
  ok(new Date(win.startTime).getTime() === T0 - 600 * 1000, 'janela incremental com overlap de 10min (registros tardios)');
}

console.log('');
if (fail) { console.error('SIMULAÇÃO: ' + fail + ' verificações falharam'); process.exit(1); }
console.log('SIMULAÇÃO DE QA: TODAS AS VERIFICAÇÕES PASSARAM (assumindo dados reais do device)');
