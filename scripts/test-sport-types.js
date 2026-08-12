const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/cardio/sport-types.ts --outDir scripts/.tmp/st --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/st/sport-types.js');
let fail = 0; const ok = (c, msg) => { if (!c) { console.error('FAIL:', msg); fail++; } else console.log('ok:', msg); };

// normalização de tipos comuns do Health Connect / relógios
const cases = [
  ['RUNNING', 'corrida'], ['Trail Running', 'trilha'], ['WALKING', 'caminhada'], ['Hiking', 'caminhada'],
  ['BIKING', 'ciclismo'], ['Mountain Biking', 'mtb'], ['SWIMMING', 'natacao'], ['Rowing', 'remo'],
  ['Elliptical', 'eliptico'], ['Treadmill', 'esteira'], ['HIIT', 'hiit'], ['Interval Training', 'hiit'],
  ['Strength Training', 'musculacao'], ['Weightlifting', 'musculacao'], ['CrossFit', 'crosstraining'],
  ['Functional Training', 'funcional'], ['Yoga', 'yoga'], ['Stretching', 'mobilidade'],
  ['Soccer', 'futebol'], ['Futsal', 'futsal'], ['Basketball', 'basquete'], ['Volleyball', 'volei'],
  ['Tennis', 'tenis'], ['Boxing', 'boxe'], ['Muay Thai', 'muaythai'], ['Jiu-Jitsu', 'jiujitsu'],
  ['MMA', 'mma'], ['Martial Arts', 'luta'], ['Something Weird', 'outro'], ['', 'outro'], [null, 'outro'],
];
for (const [raw, exp] of cases) ok(m.normalizeSportType(raw) === exp, `normalize("${raw}") -> ${exp} (got ${m.normalizeSportType(raw)})`);

// GPS
ok(m.sportUsesGps('corrida') && m.sportUsesGps('ciclismo') && m.sportUsesGps('trilha'), 'esportes com GPS');
ok(!m.sportUsesGps('yoga') && !m.sportUsesGps('musculacao') && !m.sportUsesGps('boxe'), 'esportes sem GPS');

// rótulos existem para todo tipo
const types = ['corrida','caminhada','trilha','ciclismo','mtb','natacao','remo','eliptico','esteira','hiit','musculacao','crosstraining','funcional','yoga','mobilidade','futebol','futsal','basquete','volei','tenis','luta','boxe','muaythai','jiujitsu','mma','outro'];
ok(types.every(t => typeof m.SPORT_LABEL[t] === 'string' && m.SPORT_LABEL[t].length), 'todos os 26 tipos têm rótulo');

// dedup vs força: musculação é reconhecida (será filtrada no import)
ok(m.normalizeSportType('Strength') === 'musculacao', 'força reconhecida para dedup');

if (fail) { console.error(fail + ' testes falharam'); process.exit(1); } else console.log('TODOS OS TESTES PASSARAM');
