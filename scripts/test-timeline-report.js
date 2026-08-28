const { buildTimeline, groupTimelineByMonth, narrateDecision } = require('./.tmp/tr/evolution-timeline-engine.js');
const { buildEvolutionReport } = require('./.tmp/tr/athlete-evolution-report.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

// TIMELINE
const events = buildTimeline([
  { dateISO:'2026-06-10', kind:'pr', title:'+5 kg no supino' },
  { dateISO:'2026-06-20', kind:'body_change', title:'BF -1.2%' },
  { dateISO:'2026-07-02', kind:'recovery_drop', title:'Recovery Score caiu' },
  { dateISO:'2026-07-05', kind:'deload', title:'Deload aplicado' },
  { dateISO:'2026-07-20', kind:'pr', title:'Performance recuperada' },
]);
ok('timeline ordenada desc', events[0].dateISO > events[events.length-1].dateISO);
ok('pr é positivo 🟢', events.find(e=>e.kind==='pr').tone==='positive');
ok('recovery_drop é warning 🟡', events.find(e=>e.kind==='recovery_drop').tone==='warning');
ok('deload é info', events.find(e=>e.kind==='deload').tone==='info');
const months = groupTimelineByMonth(events);
ok('agrupa por mês (junho e julho)', months.length===2);
ok('label em PT-BR', /JUNHO 2026|JULHO 2026/.test(months.map(m=>m.label).join(' ')));
ok('mês mais recente primeiro', months[0].monthKey > months[1].monthKey);
ok('narrativa liga causa->decisão->resultado', narrateDecision({decisionDateISO:'2026-07-05',decision:'Deload',cause:'Recovery baixo',resultDateISO:'2026-07-20',result:'Força +3%',verdict:'positive'}).includes('→'));

// REPORT
const state = {
  headline:'Recomposição positiva, recuperação limitando.', status:'positive', periodDays:30,
  goal:'recomposition', topAdvance:'Composição corporal', topLimiter:'Recuperação',
  recomposition:{ message:'Recomposição provável.' },
  plateau:{ isPlateau:false }, goalProgress:{ score:78 },
  dataConfidence:{ body:80, nutrition:65, nutritionNote:'Registro parcial.' },
};
const report = buildEvolutionReport({
  periodLabel:'Últimos 30 dias', state,
  beforeAfter:{ windowDays:30, metrics:[], summary:'ok' },
  muscleScores:[{muscle_group:'legs',score:50},{muscle_group:'back',score:90},{muscle_group:'chest',score:70}],
  matrix:{ quadrant:'recovery', emoji:'🟡', title:'Recuperação', likelyCauses:['fadiga'], message:'perf caiu' },
  recovery:{ direction:'declining', message:'recuperação em queda' },
  decisions:[{id:'1',decision:'Deload',verdict:'positive',scoreDelta:4,summary:'Decisão positiva.'}],
  decisionStats:{ total:1, positive:1, negative:0, neutral:0, pending:0, successRate:100 },
});
ok('report identifica músculo mais fraco', report.sections.muscles.weakest[0]==='legs');
ok('report identifica mais forte', report.sections.muscles.strongest[0]==='back');
ok('estratégia foca recuperação (limitador)', /[Rr]ecupera/.test(report.nextMonthStrategy));
ok('goalProgressScore propagado', report.goalProgressScore===78);
ok('decisões com successRate', report.sections.decisions.successRate===100 && report.sections.decisions.highlights.length===1);
ok('nutrição com confiança', report.sections.nutrition.confidence===65);

console.log(`\ntimeline + report: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
