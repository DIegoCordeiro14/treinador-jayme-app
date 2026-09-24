import { METRIC_CATALOG, ALL_METRIC_KEYS, metricsByDomain, sourceConfidenceFor, sourceRankFor, getMetric } from '../src/lib/athlete-data/metric-catalog';
let pass=0, fail=0;
const ok=(n:string,c:boolean,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('FAIL  '+n+(x?'  » '+x:''));}};

ok('catálogo cobre 5 domínios', new Set(ALL_METRIC_KEYS.map(k=>METRIC_CATALOG[k].domain)).size===5);
ok('toda métrica tem unidade e preferência', ALL_METRIC_KEYS.every(k=>{const m=METRIC_CATALOG[k];return typeof m.unit==='string' && m.sourcePreference.length>0;}));
ok('toda métrica tem key coerente', ALL_METRIC_KEYS.every(k=>METRIC_CATALOG[k].key===k));

// preferência POR métrica (§9)
ok('BF: bioimpedância é a fonte preferida', METRIC_CATALOG.bodyFat.sourcePreference[0]==='bioimpedance');
ok('Peso: wearable/manual antes de bioimpedância', sourceRankFor('weight','wearable') < sourceRankFor('weight','bioimpedance'));
ok('FC repouso: wearable preferido', METRIC_CATALOG.restingHeartRate.sourcePreference[0]==='wearable');
ok('Pace: health_connect/wearable preferidos, manual pior', sourceRankFor('pace','health_connect') < sourceRankFor('pace','manual'));
ok('Calorias nutrição: fonte nutrition preferida', METRIC_CATALOG.calories.sourcePreference[0]==='nutrition');

// confiança derivada da posição na preferência
ok('confiança HIGH p/ fonte no topo', sourceConfidenceFor('bodyFat','bioimpedance')==='high');
ok('confiança LOW p/ fonte fora da lista', sourceConfidenceFor('bodyFat','coach_action')==='low');
ok('confiança MEDIUM p/ 2ª/3ª fonte', ['medium'].includes(sourceConfidenceFor('weight','bioimpedance')));

// domínios
ok('metricsByDomain body inclui weight/bodyFat', metricsByDomain('body').some(m=>m.key==='weight') && metricsByDomain('body').some(m=>m.key==='bodyFat'));
ok('metricsByDomain recovery inclui sleep/hrv', metricsByDomain('recovery').some(m=>m.key==='sleepHours') && metricsByDomain('recovery').some(m=>m.key==='hrv'));
ok('getMetric retorna definição', getMetric('weight').label==='Peso');

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail===0?0:1);
