const { deriveResponseProfiles, rowsToIndividualLandmarks } = require('./.tmp/rd2/training-response-derivation.js');
let pass=0, fail=0; const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL:',n));};

const base={ chest:{mev:10,mav:16,mrv:22}, biceps:{mev:8,mav:14,mrv:20} };
const rows = deriveResponseProfiles({ baseLandmarks:base, blocks:[
  {muscle_group:'chest',weekly_sets:18,outcome:'progressed',recovery_ok:true},
  {muscle_group:'chest',weekly_sets:20,outcome:'progressed',recovery_ok:true},
  {muscle_group:'biceps',weekly_sets:14,outcome:'regressed',recovery_ok:true},
  {muscle_group:'biceps',weekly_sets:13,outcome:'regressed',recovery_ok:true},
]});
const byM=Object.fromEntries(rows.map(r=>[r.muscle_group,r]));
ok('gera linha para chest', !!byM.chest);
ok('chest high responder', byM.chest.volume_response==='high_responder');
ok('chest MRV subiu vs base', byM.chest.estimated_mrv>base.chest.mrv);
ok('biceps low responder', byM.biceps.volume_response==='low_responder');
ok('observations contadas', byM.chest.observations===2);
ok('confidence 0..100', rows.every(r=>r.confidence_score>=0&&r.confidence_score<=100));

// grupos sem observação não entram
ok('só grupos com evidência', rows.length===2);

// round-trip para landmarks (confiança baixa é descartada)
const ll = rowsToIndividualLandmarks([
  {muscle_group:'chest',estimated_mev:12,estimated_mav:18,estimated_mrv:26,confidence_score:80},
  {muscle_group:'legs',estimated_mev:10,estimated_mav:18,estimated_mrv:25,confidence_score:20},
]);
ok('confiança alta vira landmark', ll.chest && ll.chest.mrv===26);
ok('confiança baixa descartada', !ll.legs);

console.log(`\nresponse-derivation: ${pass} passaram, ${fail} falharam`);
if(fail>0) process.exit(1);
