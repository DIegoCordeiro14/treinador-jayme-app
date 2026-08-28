const { buildEvolutionMemory } = require('./.tmp/em/athlete-evolution-memory.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};
const dec=(action,verdict)=>({action,outcome:{id:'x',decision:action,verdict,scoreDelta:verdict==='positive'?4:-4,summary:''}});

const mem = buildEvolutionMemory({
  decisions:[
    dec('apply_deload','positive'), dec('apply_deload','positive'), dec('apply_deload','positive'),
    dec('increase_volume','negative'), dec('increase_volume','negative'),
    dec('reduce_volume','positive'), dec('reduce_volume','neutral'),
  ],
  responses:[
    {context:'high_volume',positive:false},{context:'high_volume',positive:false},{context:'high_volume',positive:true},
    {context:'deficit',positive:false},{context:'deficit',positive:false},
    {context:'high_cardio',positive:false},{context:'high_cardio',positive:false},
  ],
});
const byAction=Object.fromEntries(mem.strategies.map(s=>[s.action,s]));
ok('deload favor (100%)', byAction['apply_deload'].recommendation==='favor' && byAction['apply_deload'].successRate===100);
ok('increase_volume avoid (0%)', byAction['increase_volume'].recommendation==='avoid');
ok('reduce_volume: 1 julgada positiva => insufficient/favor', ['insufficient','favor'].includes(byAction['reduce_volume'].recommendation));
ok('estratégias ordenadas por sucesso', mem.strategies[0].successRate >= mem.strategies[mem.strategies.length-1].successRate);

ok('volumeTolerance low', mem.traits.volumeTolerance==='low');
ok('deficitResponse loses_performance', mem.traits.deficitResponse==='loses_performance');
ok('cardioSensitivity sensitive', mem.traits.cardioSensitivity==='sensitive');

ok('learnedNotes menciona deload', mem.learnedNotes.some(n=>/apply_deload/.test(n)));
ok('learnedNotes menciona volume baixo', mem.learnedNotes.some(n=>/[Ss]atura|volumes mais baixos/.test(n)));
ok('learnedNotes menciona déficit', mem.learnedNotes.some(n=>/déficit/.test(n)));

// dados insuficientes => unknown
const empty = buildEvolutionMemory({ decisions:[], responses:[] });
ok('sem dados => traços unknown', empty.traits.volumeTolerance==='unknown' && empty.strategies.length===0);

console.log(`\nevolution-memory: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
