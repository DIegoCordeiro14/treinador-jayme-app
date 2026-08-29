const { analyzeComplexity } = require('./.tmp/cv/workout-complexity-engine.js');
const { validatePlan } = require('./.tmp/cv/plan-quality-validator.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// COMPLEXITY
const simple = analyzeComplexity({exercisesPerSession:5,advancedTechniquesCount:0,sessionDurationMin:55,distinctExercisesInPlan:12,totalExerciseSlots:20,experience:'intermediate'});
ok('plano simples => baixa complexidade', ['simple','balanced'].includes(simple.level));
const over = analyzeComplexity({exercisesPerSession:11,advancedTechniquesCount:5,sessionDurationMin:120,distinctExercisesInPlan:28,totalExerciseSlots:30,experience:'beginner'});
ok('plano exagerado => overcomplex', over.level==='overcomplex' && over.penalties.length>=3);
ok('iniciante penaliza técnicas avançadas', over.penalties.some(p=>/avançadas/.test(p)));
ok('repetibilidade calculada 0..1', simple.repeatability>=0 && simple.repeatability<=1);

// VALIDATOR
const okPlan = validatePlan({
  days:[{exercises:[{exerciseId:'a',muscle_group:'chest',sets:10},{exerciseId:'b',muscle_group:'back',sets:12}]}],
  safeExerciseIds:['a','b'], forbiddenIds:[], restrictedIds:[],
  volumeTargets:{chest:10,back:12}, priorityMuscles:['back'],
  balanced:true, recoveryRespected:true, sessionDurationOk:true, patternCoverageOk:true,
});
ok('plano válido passa', okPlan.valid && !okPlan.needsRegeneration && !okPlan.needsRepair);
ok('todos estágios passam', okPlan.stagesPassed.length>=7);

// exercício inseguro => regeneração
const unsafe = validatePlan({
  days:[{exercises:[{exerciseId:'x',muscle_group:'chest',sets:10}]}],
  safeExerciseIds:['a'], forbiddenIds:[], restrictedIds:['x'],
  volumeTargets:{chest:10}, priorityMuscles:[], balanced:true, recoveryRespected:true, sessionDurationOk:true, patternCoverageOk:true,
});
ok('exercício restrito => regeneração', unsafe.needsRegeneration && unsafe.issues.some(i=>i.stage==='safety'&&i.severity==='block'));

// volume fora => reparo (não regeneração)
const repair = validatePlan({
  days:[{exercises:[{exerciseId:'a',muscle_group:'chest',sets:2}]}],
  safeExerciseIds:['a'], forbiddenIds:[], restrictedIds:[],
  volumeTargets:{chest:12,legs:14}, priorityMuscles:[], balanced:true, recoveryRespected:true, sessionDurationOk:true, patternCoverageOk:true,
});
ok('volume baixo/faltante => needsRepair', repair.needsRepair && !repair.needsRegeneration);
ok('legs faltante gera issue', repair.issues.some(i=>i.stage==='volume'&&/legs/.test(i.message)));

console.log(`\ncomplexity + validator: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
