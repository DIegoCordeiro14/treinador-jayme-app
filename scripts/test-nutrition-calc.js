const { execSync } = require('child_process');
execSync('node node_modules/typescript/bin/tsc src/lib/edn/nutrition-calculation-engine.ts --outDir scripts/.tmp/nc --module commonjs --target es2019 --skipLibCheck', { stdio: 'inherit' });
const m = require('./.tmp/nc/nutrition-calculation-engine.js');
let fail=0; const ok=(c,x)=>{ if(!c){console.error('FAIL:',x);fail++;} else console.log('ok:',x); };
const arroz={ name:'Arroz', serving_size:100, serving_unit:'g', calories:128, protein:2.5, carbohydrates:28, fat:0.2, fiber:1.6 };
const frango={ name:'Frango grelhado', serving_size:100, serving_unit:'g', calories:165, protein:31, carbohydrates:0, fat:3.6, fiber:0 };
const frangoFrito={ name:'Frango', serving_size:100, serving_unit:'g', calories:165, protein:31, carbohydrates:0, fat:3.6, fiber:0 };

// 100g -> valores base
let a100=m.calculateItem({food:arroz,quantity:100,unit:'g'});
ok(a100.calories_kcal===128 && a100.protein_g===2.5,'100g arroz = base');
// 150g -> x1.5
let a150=m.calculateItem({food:arroz,quantity:150,unit:'g'});
ok(a150.calories_kcal===192 && a150.protein_g===3.8,'150g arroz = base x1.5 ('+a150.calories_kcal+'/'+a150.protein_g+')');
// 200g -> x2
ok(m.calculateItem({food:arroz,quantity:200,unit:'g'}).calories_kcal===256,'200g arroz = x2');
// preparação: frito adiciona ~35%
let gr=m.calculateItem({food:frangoFrito,quantity:100,unit:'g',preparation:'grelhado'});
let fr=m.calculateItem({food:frangoFrito,quantity:100,unit:'g',preparation:'frito'});
ok(fr.calories_kcal > gr.calories_kcal,'frito > grelhado (mesmo alimento)');
ok(fr.calories_kcal===Math.round(165*1.35),'frito aplica fator 1.35');
// unidade caseira
let colher=m.calculateItem({food:arroz,quantity:2,unit:'colher_sopa'});
ok(colher.calories_kcal===Math.round(128*(30/100)),'2 colheres sopa arroz = 30g');
// refeição: soma + confiança agregada
const meal=m.calculateMeal([ {food:arroz,quantity:150,unit:'g',confidence:0.91}, {food:frango,quantity:180,unit:'g',confidence:0.6} ]);
ok(meal.totals.calories_kcal === (192 + Math.round(165*1.8)),'total = soma dos itens');
ok(meal.confidenceLevel==='moderada','confianca media (0.91,0.6) -> moderada');
ok(m.confidenceLabel(0.95)==='alta' && m.confidenceLabel(0.42)==='baixa','labels de confianca');
// recalculo apos correcao 150->200 (determinístico)
ok(m.calculateItem({food:arroz,quantity:200,unit:'g'}).protein_g===5,'correcao 200g recalcula proteina=5');
// comparação com metas (§13/§35)
const cmp = m.compareToTargets({kcal:620,protein:58,carbs:52,fat:18},{kcal:700,protein:50,carbs:80,fat:20});
ok(cmp.status.carbs==='below','carbo consumido abaixo da meta');
ok(cmp.status.protein==='above','proteina acima (58 > 50+15%)');
ok(cmp.status.calories==='ok' || cmp.status.calories==='below','calorias avaliadas');
ok(m.compareToTargets({kcal:900,protein:0,carbs:0,fat:0},{kcal:600,protein:null,carbs:null,fat:null}).status.calories==='above','calorias acima');
ok(m.compareToTargets({kcal:0,protein:0,carbs:0,fat:0},{kcal:null,protein:null,carbs:null,fat:null}).status.protein==='na','sem meta -> na');

if(fail){console.error(fail+' falharam');process.exit(1);} else console.log('TODOS OS TESTES PASSARAM');
