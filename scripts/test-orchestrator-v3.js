const { orchestrateGenerationV3 } = require('./.tmp/o3/workout-generation-orchestrator-v3.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

const prio=(mg,o={})=>({muscle_group:mg,userDeclared:false,isWeakPoint:false,aestheticGoalMatch:false,historicalResponse:null,stagnant:false,recoveryCapacity:0.7,timeAvailability:0.7,fatigue:0.3,cardioLoad:0.2,...o});
const budget={recoveryScore:80,hrvTrendPerWeek:1,sleepHours:8,acwr:1.0,recentWeeklySets:14,avgRir:2,sessionDurationMin:60,weeklyFrequency:4,cardioSessionsPerWeek:1,experience:'intermediate',priorVolumeResponsePositive:true};

const o = orchestrateGenerationV3({
  objective:'hypertrophy', experience:'intermediate',
  priorities:[prio('chest',{userDeclared:true,isWeakPoint:true,recoveryCapacity:0.9,fatigue:0.2}), prio('legs')],
  budget,
  volumeTargets:{chest:16,back:14,legs:14,biceps:8,triceps:8,shoulders:10},
  minFloor:{chest:8,back:8,legs:8,glutes:6,biceps:6,triceps:6,shoulders:8},
  plannedForVolume:[
    {muscle_group:'chest',pattern:'horizontal_push',sets:8},
    {muscle_group:'back',pattern:'vertical_pull',sets:7},
    {muscle_group:'back',pattern:'horizontal_pull',sets:7},
    {muscle_group:'legs',pattern:'squat',sets:8},
  ],
  plannedPatterns:['horizontal_push','vertical_pull','horizontal_pull','squat'],
  safeExerciseIds:['a','b','c','d'], forbiddenIds:[], restrictedIds:[],
});

ok('prioridades alocadas', o.priorityAllocations.length===2);
ok('peito é PRIMARY/HIGH', ['PRIMARY','HIGH'].includes(o.priorityAllocations[0].level));
ok('orçamento add_stimulus (boa recuperação)', o.recoveryBudget.verdict==='add_stimulus');
ok('volume efetivo tem indireto p/ bíceps/tríceps', o.effectiveVolume.indirect.biceps>0 && o.effectiveVolume.indirect.triceps>0);
ok('promptBlock v3 presente', o.promptBlock.includes('INTELIGÊNCIA DE GERAÇÃO v3'));
ok('promptBlock cita orçamento', /Orçamento de recupera/.test(o.promptBlock));

// validação pós-IA: plano bom
const good = o.validate([{exercises:[
  {exerciseId:'a',muscle_group:'chest',sets:16},
  {exerciseId:'b',muscle_group:'back',sets:14},
  {exerciseId:'c',muscle_group:'legs',sets:14},
]}]);
ok('validação: sem regeneração', !good.validation.needsRegeneration);
ok('equilibrium score calculado', good.equilibrium.score>=0 && good.equilibrium.score<=100);

// plano com exercício inseguro => regeneração + segurança falha
const bad = o.validate([{exercises:[{exerciseId:'ZZZ',muscle_group:'chest',sets:16}]}]);
ok('exercício fora do catálogo => regeneração', bad.validation.needsRegeneration);
ok('equilibrium marca rebalance (segurança)', bad.equilibrium.needsRebalance);

// robustez: prioridades vazias não quebram
const empty = orchestrateGenerationV3({ objective:'hypertrophy', experience:'beginner', priorities:[], budget, volumeTargets:{}, minFloor:{}, plannedForVolume:[], plannedPatterns:[], safeExerciseIds:[], forbiddenIds:[], restrictedIds:[] });
ok('sem dados não quebra', empty.priorityAllocations.length===0 && typeof empty.promptBlock==='string');

console.log(`\norchestrator-v3: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
