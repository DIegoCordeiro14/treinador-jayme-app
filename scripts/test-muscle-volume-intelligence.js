const { planMuscleVolume, landmarksFor } = require('./.tmp/mvi/muscle-volume-intelligence.js');
let pass=0, fail=0;
const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

const m=(mg,sets,freq)=>({muscle_group:mg,weekly_sets:sets,sessions_per_week:freq});

const plans = planMuscleVolume({
  experience:'intermediate',
  muscles:[
    m('chest', 6, 1),   // abaixo do MEV(10)
    m('back', 15, 2),   // ótimo/perto MAV(18)
    m('legs', 24, 3),   // perto do MRV(25)
    m('biceps', 22, 3), // acima do MRV(20)
    m('shoulders', 12, 2),
  ],
  weakPoints:['shoulders'],
  recovery:'good',
});
const by=Object.fromEntries(plans.map(p=>[p.muscle_group,p]));
ok('chest below_mev', by.chest.status==='below_mev');
ok('chest target sobe p/ >= mev', by.chest.target_weekly_sets>=by.chest.landmarks.mev);
ok('back optimal ou near', ['optimal','near_mrv'].includes(by.back.status));
ok('legs near_mrv recua p/ mav', by.legs.status==='near_mrv' && by.legs.target_weekly_sets===by.legs.landmarks.mav);
ok('biceps over_mrv => deload volume p/ mev', by.biceps.status==='over_mrv' && by.biceps.target_weekly_sets===by.biceps.landmarks.mev);
ok('ombro (ponto fraco) target >= mav', by.shoulders.is_weak_point && by.shoulders.target_weekly_sets>=by.shoulders.landmarks.mav);

// frequência: volume alto => 2x/3x
ok('legs alta freq (>=2)', by.legs.recommended_frequency>=2);
ok('chest ~12 sets => 2x', by.chest.recommended_frequency===2);

// recuperação baixa contém volume
const poor = planMuscleVolume({experience:'intermediate',muscles:[m('chest',16,2)],recovery:'low'});
ok('recup baixa reduz alvo', poor[0].target_weekly_sets < 16);
ok('recup baixa cita recuperação', /recupera/i.test(poor[0].reason));

// cardio interfere em pernas
const runner = planMuscleVolume({experience:'intermediate',muscles:[m('legs',16,2)],cardioInterferenceMuscles:['legs']});
ok('cardio reduz volume pernas', runner[0].target_weekly_sets < 18 && /cardio/i.test(runner[0].reason));

// landmarks escalam por experiência
const beg = landmarksFor('chest','beginner');
const adv = landmarksFor('chest','advanced');
ok('iniciante MRV < avançado MRV', beg.mrv < adv.mrv);

// landmark individual sobrepõe
const ind = planMuscleVolume({experience:'intermediate',muscles:[m('chest',10,2)],individualLandmarks:{chest:{mev:12,mav:20,mrv:28}}});
ok('landmark individual aplicado', ind[0].landmarks.mrv===28);

console.log(`\nmuscle-volume-intelligence: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
