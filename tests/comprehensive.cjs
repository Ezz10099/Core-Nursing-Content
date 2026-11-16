const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../runtime/files/js/exam-core.js'),sandbox={window:{}};
for(const f of fs.readdirSync('runtime/files/js').filter(f=>/^exam-data(?:-\d\d)?\.js$/.test(f)).sort((a,b)=>a==='exam-data.js'?-1:b==='exam-data.js'?1:a.localeCompare(b)))vm.runInNewContext(fs.readFileSync('runtime/files/js/'+f,'utf8'),sandbox);
const banks=sandbox.window.CoreNursingExamData.banks,clone=x=>JSON.parse(JSON.stringify(x));
const right=q=>q.answerKey??q.answer??q.acceptedAnswers?.[0];
function finish(state,bank,stage,errors,time){C.start(state,bank,stage,time);state.active.answers=Object.fromEntries(state.active.form.questions.map((q,i)=>[q.id,i<errors?'WRONG':right(q)]));state.active.shown=state.active.form.questions.map(q=>q.id);return C.submit(state,time+1);}
for(const n of [7,9,10,11,20]){
 const f={stage:'comprehensive',model:C.MODEL,questions:Array.from({length:n},(_,i)=>({id:'q'+i,format:'single-best-answer',answerKey:'A',learningPointIds:['p'+i]}))};
 for(let errors=0;errors<=3;errors++)assert.equal(C.grade(f,Object.fromEntries(f.questions.map((q,i)=>[q.id,i<errors?'B':'A']))).passed,errors<=(n<10?1:2),n+' questions / '+errors+' errors');
 assert(C.grade(f,Object.fromEntries(f.questions.map(q=>[q.id,'A'])),{q0:true}).passed);
}
for(const b of banks){
 assert.deepEqual(Array.from(b.exams,e=>e.stage),['comprehensive','7-day','21-day']);
 const expected=new Set(b.legacyExams.flatMap(e=>e.questions).flatMap(q=>q.learningPointIds));
 const actual=new Set(b.exams[0].questions.flatMap(q=>q.learningPointIds));
 const excluded=new Set((b.scoringExclusions||[]).map(e=>e.learningPointId));
 assert([...excluded].every(id=>!actual.has(id)),'Excluded generic prompts receive no coverage credit');
 if(b.itemType==='medication-group'){
  assert.equal(expected.size,0);
  assert(b.members.length>=2&&b.members.every(m=>banks.some(x=>x.itemType==='medication'&&x.itemId===m.id)));
  assert(b.exams[0].questions.every(q=>q.evidenceIds.length&&q.evidenceIds.every(id=>b.sources.some(s=>s.id===id))));
 }else{
  assert.deepEqual([...actual,...excluded].sort(),[...expected].sort(),'Every legacy mapping is retained or explicitly excluded');
 }
 assert.equal(new Set(b.exams[0].questions.map(q=>q.stem)).size,b.exams[0].questions.length,'No duplicate question stems');
 const keys={A:0,B:0,C:0,D:0};for(const q of b.exams[0].questions)if(q.format==='single-best-answer'){assert.equal(new Set(q.choices.map(c=>c.text)).size,4);assert(q.choices.every(c=>c.explanation));keys[q.answerKey]++;}
 assert(Math.max(...Object.values(keys))-Math.min(...Object.values(keys))<=1,'Balanced key positions');
 const questions=JSON.stringify(b.exams[0].questions);assert.equal(JSON.stringify(b.exams[1].questions),questions);assert.equal(JSON.stringify(b.exams[2].questions),questions);
 const bank=clone(b),state=C.empty();
 let result=finish(state,bank,'comprehensive',0,1000),r=C.item(state,bank.itemId);
 assert(result.attempt.completedAt);assert.equal(r.due.at,1001+3*C.DAY);
 assert.throws(()=>C.start(state,bank,'7-day',r.due.at-1),/not due/);
 const saved=JSON.stringify(r.comprehensiveForm.questions);
 bank.exams.forEach(e=>e.questions[0].stem='Later bank revision');
 for(const stage of ['7-day','21-day']){
  let due=r.due.at;result=finish(state,bank,stage,bank.exams[0].questions.length,due);
  assert(!result.attempt.passed);assert.equal(r.due.stage,stage);assert.equal(r.due.at,due+1+3*C.DAY);assert.equal(r.readingAfter,null);
  const restored=C.normalize(clone(state));assert.equal(restored.items[bank.itemId].due.at,r.due.at);assert.equal(JSON.stringify(restored.items[bank.itemId].comprehensiveForm.questions),saved);
  assert(!C.eligible(state,bank.itemId,stage,bank.readingSections,r.due.at-1,C.MODEL).ok);
  due=r.due.at;C.start(state,bank,stage,due);assert.equal(JSON.stringify(state.active.form.questions),saved);
  state.active.answers=Object.fromEntries(state.active.form.questions.map(q=>[q.id,right(q)]));result=C.submit(state,due+1);
  assert(result.attempt.completedAt);if(stage==='7-day')assert.equal(r.due.at,due+1+21*C.DAY);else assert.equal(r.due,null);
 }
}
// Clinically important misses use ordinary correction and score rules.
const b=clone(banks.find(b=>b.exams[0].questions.some(q=>q.criticalForSafety))),s=C.empty();
C.start(s,b,'comprehensive',100);const a=s.active; a.answers=Object.fromEntries(a.form.questions.map(q=>[q.id,right(q)]));
const q=a.form.questions.find(q=>q.criticalForSafety);a.answers[q.id]='WRONG';const result=C.submit(s,101),r=C.item(s,b.itemId);
assert(result.attempt.passed);assert.equal(result.attempt.completedAt,101);
assert.equal(r.due.at,101+3*C.DAY);assert(result.result.review.includes(q.id));
const oldState=clone(s),oldRecord=oldState.items[b.itemId];
oldRecord.attempts[0].completedAt=null;oldRecord.due=null;
oldRecord.pendingSafety=[{attemptId:result.attempt.id,question:q}];
const migrated=C.normalize(oldState).items[b.itemId];
assert.equal(migrated.attempts[0].completedAt,101);
assert.equal(migrated.attempts[0].correct,result.attempt.correct);
assert.deepEqual(migrated.due,r.due);
assert.equal(migrated.pendingSafety,undefined);
console.log('PASS: comprehensive scoring, pinned forms, retries and old safety-check migration');
// A previously scheduled first review moves to day three without altering history.
{
 const state=C.empty(),bank=clone(banks[0]);finish(state,bank,'comprehensive',0,1000);
 const record=C.item(state,bank.itemId),attempts=JSON.stringify(record.attempts);
 record.due.at=1001+7*C.DAY;
 const migrated=C.normalize(clone(state));
 assert.equal(migrated.items[bank.itemId].due.at,1001+3*C.DAY);
 assert.equal(JSON.stringify(migrated.items[bank.itemId].attempts),attempts);
 const retry=C.empty(),old=C.item(retry,bank.itemId);
 old.attempts=clone(record.attempts);old.attempts.push({...old.attempts[0],id:'failed-first-review',stage:'7-day',passed:false,completedAt:null,finishedAt:1001+4*C.DAY});
 old.due={stage:'7-day',at:1001+7*C.DAY,model:C.MODEL};
 assert.equal(C.normalize(clone(retry)).items[bank.itemId].due.at,old.due.at,'An already attempted review keeps its retry date');
}
// Explicit clinical-authoring corrections refresh the next start, preserving
// active forms, old answers/scores and scheduled dates.
{
 const bank=clone(banks.find(b=>b.itemId==='ccu-verapamil')),state=C.empty();
 const old=clone(bank);old.exams.forEach(e=>{delete e.correctionRevision;e.questions.forEach(q=>delete q.revision)});
 C.start(state,old,'comprehensive',100);const active=JSON.stringify(state.active);
 const restored=C.normalize(clone(state));assert.equal(JSON.stringify(restored.active),active);
 restored.active.answers=Object.fromEntries(restored.active.form.questions.map(q=>[q.id,right(q)]));
 C.submit(restored,101);const rec=C.item(restored,bank.itemId),due=clone(rec.due),history=JSON.stringify(rec.attempts);
 C.start(restored,bank,'7-day',due.at);
 assert.equal(restored.active.form.correctionRevision,bank.exams[0].correctionRevision);
 assert.equal(JSON.stringify(rec.attempts),history);assert.deepEqual(rec.due,due);
 const rate=restored.active.form.questions.find(q=>q.learningPointIds[0].endsWith('::slow_iv'));
 assert.equal(rate.format,'numeric-entry');assert.equal(rate.answer,2);
 assert.equal(restored.active.followups,undefined);
}
const medicationBanks=banks.filter(b=>b.itemType==='medication');
assert.equal(medicationBanks.length,82);
assert.equal(medicationBanks.reduce((n,b)=>n+b.scoringExclusions.length,0),30);
assert.equal(medicationBanks.flatMap(b=>b.exams[0].questions).filter(q=>q.revision).length,Object.values(JSON.parse(fs.readFileSync('exams/authoring/medication-question-revisions.json','utf8')).items).filter(x=>x.action==='replace').length);
for(const b of medicationBanks){
 assert.equal(b.exams[0].questionCount,b.exams[0].questions.length);
 assert(!b.exams[0].questions.some(q=>q.stem.includes('becomes light-headed on standing')||q.stem.includes('minimum administration time is unclear')));
}
console.log('PASS: generic prompts excluded, reviewed medication recall items, preserved history and correction migration');
