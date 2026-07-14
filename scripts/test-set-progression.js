const E=require('./.tmp/sp/set-progression-engine.js');
let pass=0,fail=0; const check=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(x?' → '+x:'')));};
const s=(d,type,pos,w,r,rir,comp=true)=>({performedAt:new Date(Date.now()-d*86400000).toISOString(),setType:type,setPosition:pos,weightKg:w,reps:r,rir,completed:comp});
console.log('\n== buildSetProfiles (por posição) ==');
// 3 sessões: working1 estável 80, working2 cai p/ 77.5, working3 cai p/ 72.5
const recs=[];
for (const d of [20,13,6]) { recs.push(s(d,'working',1,80,9,1)); recs.push(s(d,'working',2,77.5,9,1)); recs.push(s(d,'working',3,72.5,10,1)); recs.push(s(d,'top',1,85,8,2)); }
const prof=E.buildSetProfiles(recs);
check('perfil por posição existe (working:1/2/3)', E.profileFor(prof,'working',1)&&E.profileFor(prof,'working',2)&&E.profileFor(prof,'working',3));
check('working1 latest = 80', E.profileFor(prof,'working',1).latestWeightKg===80);
check('working3 latest = 72.5 (posição cai)', E.profileFor(prof,'working',3).latestWeightKg===72.5);
check('cada posição tem confiança', E.profileFor(prof,'working',2).confidence>0);
check('totalOccurrences=3', E.profileFor(prof,'working',1).totalOccurrences===3);
console.log('\n== tendência ==');
const up=[]; for (const [i,w] of [[24,70],[18,72.5],[12,75],[6,77.5]]) up.push(s(i,'working',1,w,9,1));
check('carga subindo → trend up', E.buildSetProfiles(up).get('working:1').recentTrend==='up', E.buildSetProfiles(up).get('working:1').recentTrend);
console.log('\n== fallback ==');
check('sem posição 4 → cai p/ posição 3', E.profileFor(prof,'working',4).setPosition===3);
check('sem histórico → null', E.profileFor(new Map(),'working',1)===null);
console.log(`\n== RESULTADO: ${pass} passaram, ${fail} falharam ==\n`); process.exit(fail?1:0);
