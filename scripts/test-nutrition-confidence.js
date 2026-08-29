const { dv, computeNutritionConfidence, confidenceBadge } = require('./.tmp/nc/nutrition-confidence-system.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// tudo medido/bioimpedância => high
const full = computeNutritionConfidence({ fields:{
  weight:dv(88,'bioimpedance'), height:dv(178,'profile'), age:dv(30,'profile'),
  bodyFat:dv(18,'bioimpedance'), tmb:dv(1800,'bioimpedance'), activity:dv(1.5,'measured'),
}});
ok('tudo medido => high', full.level==='high' && full.score>=80);
ok('sem estimados', full.estimatedFields.length===0 && full.missingFields.length===0);

// faltando altura/idade/bf e alguns estimados => low/moderate
const partial = computeNutritionConfidence({ fields:{
  weight:dv(88,'profile'), height:dv(175,'estimated'), age:dv(30,'estimated'),
  bodyFat:null, tmb:null, activity:dv(1.3,'estimated'),
}});
ok('parcial não é high', partial.level!=='high');
ok('lista estimados', partial.estimatedFields.length>=1);
ok('lista faltantes (bf, tmb)', partial.missingFields.length>=2);
ok('recomenda adicionar dados', partial.recommendations.some(r=>/Adicione|estimativa/.test(r)));

// vazio => low
const empty = computeNutritionConfidence({ fields:{} });
ok('vazio => low, score baixo', empty.level==='low' && empty.score===0);

ok('badge high', confidenceBadge('high').emoji==='🟢');
ok('badge low', confidenceBadge('low').label==='Dados insuficientes');
ok('dv aplica confiança padrão da fonte', dv(1,'bioimpedance').confidence>0.9 && dv(1,'estimated').confidence<0.5);
ok('score 0..100', full.score<=100 && partial.score>=0);

console.log(`\nnutrition-confidence: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
