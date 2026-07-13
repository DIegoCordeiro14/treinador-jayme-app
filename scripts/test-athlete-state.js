const E = require('./.tmp/as/athlete-state.js');
let pass=0,fail=0; const check=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?' → '+x:'')));};
const base = {
  profile:{name:'Diego',sex:'male',age:27,heightCm:178,experience:'intermediate',sport:'musculacao'},
  goal:{main:'fat_loss',aesthetic:null,targetWeightKg:78,targetRaceDate:null},
  bodyComposition:{weightKg:90,bodyFatPct:25,leanKg:67,tmbKcal:1800},
  training:{score:80,sessionsLast7:4,weeklyVolumeKg:30000,consistency:85,progression:75},
  nutrition:{score:70,phase:'Cutting',targetKcal:2400,adherencePct:80},
  cardio:{score:60,km7:10,km28:35,loadRisk:'ideal'},
  recovery:{score:45,category:'low',usedWearable:true},
  wearable:{hrvMs:32,hrvBaselineMs:40,sleepHours:5,restingHr:60,bodyBattery:20,trainingReadiness:25},
  edn360:{training:80,nutrition:70,cardio:60,recovery:45,overall:66},
  weakPoints:['Peitoral'], injuryRisk:'none', plateauRisk:false, mesocycle:'Base',
  nextBestAction:{ domain:'recovery', kind:'reduce', action:'Reduzir volume hoje', confidence:73, reason:'HRV baixo', evidence:['HRV -20%'], rank:100 },
};
console.log('\n== mergeAthleteState ==');
let s=E.mergeAthleteState(base);
check('recuperação baixa → fadiga alta', s.fatigue==='alta', s.fatigue);
check('readiness = recovery.score', s.readiness===45);
check('scores refletem edn360', s.scores.overall===66);
check('nextBestAction + confidence + lastDecision', s.nextBestAction.action==='Reduzir volume hoje' && s.confidence===73 && s.lastDecision==='Reduzir volume hoje');
check('bodyComposition.leanKg presente', s.bodyComposition.leanKg===67);
check('version é número', typeof s.version==='number');

console.log('\n== stateVersion (muda quando o estado muda) ==');
let v1=E.stateVersion(base);
let v2=E.stateVersion({ ...base, edn360:{...base.edn360, overall:70} });
check('overall diferente → versão diferente', v1!==v2, `${v1} vs ${v2}`);
let v3=E.stateVersion(base);
check('mesmo estado → mesma versão', v1===v3);
console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`); process.exit(fail?1:0);
