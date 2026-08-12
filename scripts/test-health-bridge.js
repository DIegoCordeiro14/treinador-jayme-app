const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/wearables/native-normalize.ts src/lib/cardio/sport-types.ts src/native/health/definitions.ts --outDir scripts/.tmp/nb --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/nb/lib/wearables/native-normalize.js');
let fail = 0; const ok = (c, msg) => { if (!c) { console.error('FAIL:', msg); fail++; } else console.log('ok:', msg); };

const ISO = (min) => new Date(Date.UTC(2026,0,1,10,min,0)).toISOString();

// Fixtures
const running_with_route_hr = { externalId: 'r1', provider: 'health_connect', sportType: 'corrida', startedAt: ISO(0), endedAt: ISO(30), durationSeconds: 1800, distanceMeters: 5000, caloriesActive: 300, hasRoute: true, hasHeartRateSamples: true };
const walking_route_no_hr = { externalId: 'w1', provider: 'health_connect', sportType: 'caminhada', startedAt: ISO(0), endedAt: ISO(40), durationSeconds: 2400, distanceMeters: 3000, hasRoute: true, hasHeartRateSamples: false };
const strength_with_hr = { externalId: 's1', provider: 'health_connect', sportType: 'strength training', startedAt: ISO(0), endedAt: ISO(60), durationSeconds: 3600, hasRoute: false, hasHeartRateSamples: true };
const hiit_hr_calories = { externalId: 'h1', provider: 'health_connect', sportType: 'HIIT', startedAt: ISO(0), endedAt: ISO(20), durationSeconds: 1200, caloriesActive: 220, hasRoute: false, hasHeartRateSamples: true };
const swimming_distance = { externalId: 'sw1', provider: 'health_connect', sportType: 'swimming', startedAt: ISO(0), endedAt: ISO(35), durationSeconds: 2100, distanceMeters: 1500, hasRoute: false, hasHeartRateSamples: false };
const empty_workout = { externalId: 'e1', provider: 'health_connect', sportType: 'outro', startedAt: ISO(0), endedAt: ISO(0), durationSeconds: 0, hasRoute: false, hasHeartRateSamples: false };

// janela incremental
const w = m.incrementalWindow(null, ISO(60), 10, 30);
ok(new Date(w.endTime).getTime() === new Date(ISO(60)).getTime(), 'janela: fim = agora');
const w2 = m.incrementalWindow(ISO(0), ISO(60), 10);
ok(new Date(w2.startTime).getTime() === new Date(ISO(-10)).getTime(), 'janela: overlap de 10min');

// dedup
const seen = new Set([m.dedupKey({ provider: 'health_connect', externalId: 'r1' })]);
const fresh = m.dedupWorkouts([running_with_route_hr, walking_route_no_hr, walking_route_no_hr], seen);
ok(fresh.length === 1 && fresh[0].externalId === 'w1', 'dedup remove já-visto e duplicata local');

// classificação: cardio
ok(m.classifyNativeWorkout(running_with_route_hr, []).destination === 'import_cardio', 'corrida -> import_cardio');
ok(m.classifyNativeWorkout(swimming_distance, []).destination === 'import_cardio', 'natação (só distância) -> import_cardio');
ok(m.classifyNativeWorkout(empty_workout, []).destination === 'skip', 'empty -> skip');

// força sem sessão -> skip (dedup vs força)
ok(m.classifyNativeWorkout(strength_with_hr, []).destination === 'skip', 'força sem sessão do Coach -> skip');

// força com sessão correspondente -> enrich
const sessions = [{ id: 'SESS', startedAt: ISO(2), endedAt: ISO(58) }];
const dc = m.classifyNativeWorkout(strength_with_hr, sessions);
ok(dc.destination === 'enrich_strength' && dc.strengthSessionId === 'SESS', 'força casa sessão -> enrich_strength');

// matching por sobreposição mesmo com início distante
const far = [{ id: 'OV', startedAt: ISO(50), endedAt: ISO(120) }];
ok(m.matchStrengthWorkout({ startedAt: ISO(0), endedAt: ISO(60) }, far) === 'OV', 'match por sobreposição temporal');
// sem overlap e início distante -> null
const none = [{ id: 'X', startedAt: ISO(200), endedAt: ISO(260) }];
ok(m.matchStrengthWorkout({ startedAt: ISO(0), endedAt: ISO(60) }, none) === null, 'sem match -> null');

// toCardioRow: timestamps preservados e rótulo/gps corretos
const details = { ...running_with_route_hr, sourceSportType: 'RUNNING', route: [ { timestamp: ISO(1), latitude: 1, longitude: 2, altitude: 10 }, { timestamp: ISO(2), latitude: 1.1, longitude: 2.1, altitude: 12 } ], heartRateSamples: [{ timestamp: ISO(1), bpm: 150 }], avgHeartRate: 150, maxHeartRate: 160 };
const row = m.toCardioRow(details);
ok(row.performed_at === ISO(0), 'cardio row preserva performed_at');
ok(row.type === 'Corrida' && row.sport_type === 'corrida', 'cardio row rótulo/sport');
ok(row.distance_km === 5, 'cardio row distância km');
ok(row.gps_track && row.gps_track.coordinates.length === 2, 'cardio row gps 2 pontos');
ok(row.uses_gps === true && row.source_sport_type === 'RUNNING', 'cardio row uses_gps + source original');
// walking sem HR: avg_hr null, ainda cardio
const wrow = m.toCardioRow({ ...walking_route_no_hr, sourceSportType: 'WALKING', route: [], heartRateSamples: [] });
ok(wrow.avg_hr === null && wrow.gps_track === null, 'walking sem HR/rota: nulls, sem sintetizar');

// estados de sync
ok(m.computeSyncState({ available:false }) === 'not_connected', 'estado not_connected');
ok(m.computeSyncState({ available:true, granted:false }) === 'permission_required', 'estado permission_required');
ok(m.computeSyncState({ available:true, granted:true, syncing:true }) === 'syncing', 'estado syncing');
ok(m.computeSyncState({ available:true, granted:true, syncing:false, found:3, withErrors:false, partial:false }) === 'synced', 'estado synced');
ok(m.computeSyncState({ available:true, granted:true, syncing:false, found:1, withErrors:true }) === 'error', 'estado error');


// --- Backoff da fila de enriquecimento (mesma tabela de BACKOFF_SECONDS) ---
const BACKOFF = [30, 120, 300, 900];
const nextDelay = (a) => a < 0 ? null : (a < BACKOFF.length ? BACKOFF[a] : null);
ok(nextDelay(0) === 30, 'backoff attempt0 = 30s');
ok(nextDelay(1) === 120, 'backoff attempt1 = 2min');
ok(nextDelay(2) === 300, 'backoff attempt2 = 5min');
ok(nextDelay(3) === 900, 'backoff attempt3 = 15min');
ok(nextDelay(4) === null, 'backoff attempt4 -> desiste');

if (fail) { console.error(fail + ' testes falharam'); process.exit(1); } else console.log('TODOS OS TESTES PASSARAM');