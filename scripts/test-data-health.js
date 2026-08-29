const { computeDataHealth } = require('./.tmp/dh/data-health-engine.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

const full=computeDataHealth({profileCompletionPct:100,weightAgeDays:2,bioAgeDays:10,lastWorkoutAgeDays:1,nutritionLoggedDays14:12,wearableConnected:true});
ok('tudo ok => score alto', full.score>=90 && full.level==='high');
ok('sem lacuna', full.topGap===null);

const partial=computeDataHealth({profileCompletionPct:60,weightAgeDays:20,bioAgeDays:45,lastWorkoutAgeDays:1,nutritionLoggedDays14:3,wearableConnected:false});
ok('parcial => moderate/low', partial.level!=='high');
ok('componentes 6', partial.components.length===6);
ok('perfil warn (60%)', partial.components.find(c=>c.key==='profile').status==='warn');
ok('bio warn (45 dias)', partial.components.find(c=>c.key==='bio').status==='warn');
ok('wearable missing', partial.components.find(c=>c.key==='wearable').status==='missing');
ok('topGap identifica maior peso não-good', partial.topGap!==null);

const empty=computeDataHealth({profileCompletionPct:0,weightAgeDays:null,bioAgeDays:null,lastWorkoutAgeDays:null,nutritionLoggedDays14:0,wearableConnected:false});
ok('nada => score baixo', empty.score<30 && empty.level==='low');
ok('score 0..100', full.score<=100 && empty.score>=0);

console.log(`\ndata-health: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
