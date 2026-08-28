// Bloco 26 — Suíte agregada da GERAÇÃO v2 (10+ cenários end-to-end determinísticos).
const cp = require('child_process');
const path = require('path');
const tsc = path.join(__dirname, '..', 'node_modules', '.bin', 'tsc');

// compila todos os motores da geração v2 para .tmp/gen
const files = [
  'athlete-training-snapshot','exercise-history-intelligence','exercise-rotation-engine',
  'muscle-volume-intelligence','split-generation-engine','exercise-suitability-score',
  'stagnation-engine','training-response-profile','workout-quality-score','workout-plan-preview',
  'generation-intelligence',
].map((f) => `src/lib/edn/${f}.ts`);
cp.execSync(`${tsc} ${files.join(' ')} --outDir scripts/.tmp/gen --module commonjs --target es2019 --skipLibCheck`, { cwd: path.join(__dirname,'..'), stdio: 'inherit' });

const G = (m) => require(`./.tmp/gen/${m}.js`);
const { buildGenerationIntelligence } = G('generation-intelligence');
const { scoreWorkoutQuality } = G('workout-quality-score');

let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const NOW = new Date('2026-08-28T12:00:00Z').getTime();
const iso = (d)=> new Date(NOW - d*86400000).toISOString();

// catálogo seguro compartilhado
const CAT = [
  {id:'sup_barra',name:'Supino reto com barra',muscle_group:'chest',equipment:'barbell',difficulty:'intermediate',is_compound:true,objective_tags:['hypertrophy']},
  {id:'sup_incl_barra',name:'Supino inclinado com barra',muscle_group:'chest',equipment:'barbell',difficulty:'intermediate',is_compound:true,objective_tags:['hypertrophy']},
  {id:'sup_incl_hal',name:'Supino inclinado com halteres',muscle_group:'chest',equipment:'dumbbell',difficulty:'intermediate',is_compound:true,objective_tags:['hypertrophy']},
  {id:'cruc',name:'Crucifixo',muscle_group:'chest',equipment:'dumbbell',difficulty:'beginner',is_compound:false},
  {id:'remada',name:'Remada curvada',muscle_group:'back',equipment:'barbell',difficulty:'intermediate',is_compound:true,objective_tags:['hypertrophy']},
  {id:'puxada',name:'Puxada alta',muscle_group:'back',equipment:'cable',difficulty:'beginner',is_compound:true},
  {id:'remada_maq',name:'Remada máquina',muscle_group:'back',equipment:'machine',difficulty:'beginner',is_compound:true},
  {id:'agacho',name:'Agachamento livre',muscle_group:'legs',equipment:'barbell',difficulty:'advanced',is_compound:true},
  {id:'legpress',name:'Leg press',muscle_group:'legs',equipment:'machine',difficulty:'beginner',is_compound:true},
  {id:'extensora',name:'Cadeira extensora',muscle_group:'legs',equipment:'machine',difficulty:'beginner',is_compound:false},
  {id:'desenv',name:'Desenvolvimento militar',muscle_group:'shoulders',equipment:'barbell',difficulty:'intermediate',is_compound:true},
  {id:'elev_lat',name:'Elevação lateral',muscle_group:'shoulders',equipment:'dumbbell',difficulty:'beginner',is_compound:false},
  {id:'rosca',name:'Rosca direta',muscle_group:'biceps',equipment:'barbell',difficulty:'beginner',is_compound:false},
  {id:'triceps',name:'Tríceps corda',muscle_group:'triceps',equipment:'cable',difficulty:'beginner',is_compound:false},
];
const prof = (o={}) => ({ sex:'male', experience:'intermediate', objective:'hypertrophy', days_per_week:4, ...o });

// C1 — atleta novo (sem histórico): gera baseado no perfil, sem swaps
let r = buildGenerationIntelligence({ profile: prof(), sets: [], candidates: CAT, nowMs: NOW });
ok('C1 sem histórico: bullet inicial', r.snapshotBullets[0].includes('Sem histórico'));
ok('C1 sem swaps', r.swaps.length===0);
ok('C1 sugere split', !!r.split);
ok('C1 tem candidatos rankeados', r.topSuitable.length>0);

// C2 — exercício progredindo é RETIDO
const prog = [7,14,21,28].map((d,i)=>({exercise_id:'sup_barra',exercise_name:'Supino reto com barra',muscle_group:'chest',performed_at:iso(d),weight_kg:60+ (3-i)*2.5,reps:8,rir:2}));
r = buildGenerationIntelligence({ profile: prof(), sets: prog, candidates: CAT, nowMs: NOW });
ok('C2 supino retido', r.retainedIds.includes('sup_barra'));

// C3 — exercício estagnado 7 sem com boa recuperação é rotacionado/substituído p/ mesmo padrão
const stag = [0,7,14,21,28,35,42,49].map(d=>({exercise_id:'sup_incl_barra',exercise_name:'Supino inclinado com barra',muscle_group:'chest',performed_at:iso(d),weight_kg:60,reps:8,rir:1}));
r = buildGenerationIntelligence({ profile: prof(), sets: stag, candidates: CAT, recovery:'good', nowMs: NOW });
const sw = r.swaps.find(s=>s.from_id==='sup_incl_barra');
ok('C3 supino inclinado marcado p/ trocar', !!sw);
ok('C3 substituto preserva padrão (inclinado halteres)', sw && sw.to_id==='sup_incl_hal');

// C4 — mesma estagnação MAS recuperação baixa => NÃO troca (fadiga)
r = buildGenerationIntelligence({ profile: prof(), sets: stag, candidates: CAT, recovery:'low', nowMs: NOW });
ok('C4 recuperação baixa retém em vez de trocar', r.retainedIds.includes('sup_incl_barra'));
ok('C4 estagnação sistêmica prioriza recuperação', r.stagnation.actions[0].kind==='improve_recovery');

// C5 — ponto fraco recebe mais volume/frequência
r = buildGenerationIntelligence({ profile: prof(), sets: prog, candidates: CAT, weakPoints:['back'], nowMs: NOW });
const backPlan = r.volumePlan.find(v=>v.muscle_group==='chest'); // chest treinado
ok('C5 volumePlan gerado', r.volumePlan.length>0);
ok('C5 split considera ponto fraco', !!r.split);

// C6 — equipamento limitado remove candidatos sem equipamento
r = buildGenerationIntelligence({ profile: prof({available_equipment:['machine','cable']}), sets: [], candidates: CAT, nowMs: NOW });
const barbellTop = r.topSuitable.find(s=>s.id==='sup_barra');
ok('C6 barbell zera score sem equipamento', barbellTop && barbellTop.score===0);
const machineTop = r.topSuitable.find(s=>s.id==='legpress');
ok('C6 máquina pontua', machineTop && machineTop.score>0);

// C7 — iniciante 3 dias => full body
r = buildGenerationIntelligence({ profile: prof({experience:'beginner',days_per_week:3}), sets: [], candidates: CAT, nowMs: NOW });
ok('C7 iniciante 3d => full body', r.split.type==='full_body');

// C8 — avançado 6 dias => PPL
r = buildGenerationIntelligence({ profile: prof({experience:'advanced',days_per_week:6}), sets: [], candidates: CAT, nowMs: NOW });
ok('C8 avançado 6d => PPL', r.split.type==='push_pull_legs');

// C9 — cardio interfere em pernas => reduz volume de pernas
const legs = [0,7,14].map(d=>({exercise_id:'legpress',exercise_name:'Leg press',muscle_group:'legs',performed_at:iso(d),weight_kg:200,reps:10,rir:2}));
r = buildGenerationIntelligence({ profile: prof(), sets: legs, candidates: CAT, cardio:{sessions_last_7d:4,minutes_last_7d:180,interfering_muscles:['legs']}, nowMs: NOW });
const legPlan = r.volumePlan.find(v=>v.muscle_group==='legs');
ok('C9 cardio reduz volume pernas', /cardio/i.test(legPlan.reason));

// C10 — plano final montado passa no quality score
const plan = [
  {exercise_id:'sup_barra',name:'Supino',muscle_group:'chest',sets:6,is_compound:true,pattern:'push'},
  {exercise_id:'cruc',name:'Crucifixo',muscle_group:'chest',sets:4,is_compound:false,pattern:'push'},
  {exercise_id:'remada',name:'Remada',muscle_group:'back',sets:6,is_compound:true,pattern:'pull'},
  {exercise_id:'puxada',name:'Puxada',muscle_group:'back',sets:6,is_compound:true,pattern:'pull'},
];
const q = scoreWorkoutQuality(plan, { target_weekly_sets:{chest:10,back:12}, weak_points:['back'] });
ok('C10 quality score alto p/ plano equilibrado', q.score>=75);
ok('C10 promptBlock não vazio', buildGenerationIntelligence({profile:prof(),sets:prog,candidates:CAT,nowMs:NOW}).promptBlock.includes('INTELIGÊNCIA DE GERAÇÃO v2'));

console.log(`\nworkout-generation (v2, 10 cenários): ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
