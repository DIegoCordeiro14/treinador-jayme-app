const T = require('./.tmp/os/digital-twin.js');
const S = require('./.tmp/os/specializations.js');
const N = require('./.tmp/os/notifications.js');
const O = require('./.tmp/os/index.js');
const B = require('./.tmp/os/event-bus.js');
let pass=0,fail=0; const check=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?' → '+x:'')));};
const twin={ weightKg:90, bfPct:25, leanKg:67, weeklyKcalBalance:-2100, weeklyCardioKm:5, weeklyVolumeKg:30000, recoveryScore:80, weeklyStrengthSessions:4 };

console.log('\n== simulateStrategy ==');
let r=T.simulateStrategy(twin,{type:'change_calories',dailyDeltaKcal:-200});
check('reduzir kcal → peso 90d cai', r.horizons[2].weightKg<90, String(r.horizons[2].weightKg));
check('déficit -600/dia → risco alto', T.simulateStrategy(twin,{type:'change_calories',dailyDeltaKcal:-600}).risk==='alto');
r=T.simulateStrategy(twin,{type:'add_cardio',sessionsPerWeek:3,kmPerSession:5});
check('+cardio → peso cai e traz impacto', r.horizons[2].weightKg<90 && r.performanceImpact.length>0);
check('confiança 0-100', r.confidence>=0 && r.confidence<=100);
let cmp=T.compareStrategies(twin,[{type:'change_calories',dailyDeltaKcal:-100},{type:'change_calories',dailyDeltaKcal:-300}],true);
check('cutting → maior perda primeiro', cmp[0].horizons[2].weightKg <= cmp[1].horizons[2].weightKg);

console.log('\n== specializations ==');
check('>=30 modalidades', S.listSpecializations().length>=30, String(S.listSpecializations().length));
check('maratona → endurance', S.getSpecialization('maratona').category==='endurance');
check('jiu_jitsu → combat', S.getSpecialization('jiu_jitsu').category==='combat');
check('fallback p/ hipertrofia', S.getSpecialization('inexistente').key==='hipertrofia');

console.log('\n== notifications (Coach proativo) ==');
let aos=O.orchestrate({ recoveryCategory:'low', recoveryScore:40, hrvDropPct:-20, sleepHours:5, injuryRisk:'none', overreaching:false, plateau:false, inDeload:false, cardioLoadRisk:'ideal', strengthTrendPct:1, weightTrendKg:-0.5, goalIsCut:true, nutritionScore:70, adherencePct:80, weakPointMuscle:null, prReady:true });
let notifs=N.buildNotifications(aos);
check('gera notificação de recuperação crítica', notifs.some(x=>x.severity==='critico'), JSON.stringify(notifs.map(x=>x.severity)));
check('toda notificação tem ask (prompt)', notifs.every(x=>x.ask && x.ask.length>0));

console.log('\n== event-bus pipeline ==');
check('WorkoutCompleted aciona aos+coach-briefing', B.EVENT_PIPELINE.WorkoutCompleted.includes('aos') && B.EVENT_PIPELINE.WorkoutCompleted.includes('coach-briefing'));
const bus=new B.EventBus(); let got=0; bus.on('PRAchieved',()=>got++); const p=bus.emit('PRAchieved');
check('emit chama handler + retorna pipeline', got===1 && p.includes('timeline'));
console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`); process.exit(fail?1:0);
