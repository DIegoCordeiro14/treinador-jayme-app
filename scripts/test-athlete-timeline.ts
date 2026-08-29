import { buildTimeline, detectInterference } from '../src/lib/athlete-data/athlete-timeline';
let pass=0, fail=0;
const ok=(n:string,c:boolean,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('FAIL  '+n+(x?'  » '+x:''));}};

const tl = buildTimeline({
  workouts: [{ date: '2026-08-24', label: 'Upper', heavy: true }, { date: '2026-08-26', label: 'Lower pesado', muscleFocus: 'perna', heavy: true }],
  cardios: [{ date: '2026-08-27', label: 'Longão Z2', km: 18, long: true }, { date: '2026-08-25', km: 6 }],
  weights: [{ date: '2026-08-25', kg: 96.4 }],
  prs: [{ date: '2026-08-26', label: 'PR Agachamento' }],
});
ok('timeline ordenada asc', tl[0].date === '2026-08-24' && tl[tl.length-1].date === '2026-08-27', tl.map(e=>e.date).join(','));
ok('todos os domínios presentes', tl.some(e=>e.kind==='WEIGHT') && tl.some(e=>e.kind==='PR') && tl.some(e=>e.kind==='CARDIO'));
ok('ícones atribuídos', tl.every(e=>!!e.icon));

const warns = detectInterference(tl);
ok('detecta interferência lower pesado + longão', warns.length >= 1, JSON.stringify(warns));
ok('severidade watch (1 dia)', warns[0]?.severity === 'watch', warns[0]?.severity);

// sem interferência quando distantes
const tl2 = buildTimeline({ workouts: [{ date: '2026-08-01', muscleFocus: 'perna', heavy: true }], cardios: [{ date: '2026-08-20', long: true }] });
ok('sem interferência quando distantes', detectInterference(tl2).length === 0);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail===0?0:1);
