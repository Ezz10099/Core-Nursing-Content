const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../runtime/files/js/exam-core.js');
const root=path.resolve(__dirname,'..'),banks=[];
for(const name of fs.readdirSync(path.join(root,'exams/generated')).filter(n=>/^banks-.*\.json$/.test(n))){
  banks.push(...JSON.parse(fs.readFileSync(path.join(root,'exams/generated',name),'utf8')).banks);
}
const clone=x=>JSON.parse(JSON.stringify(x));
function answer(state){state.active.answers=Object.fromEntries(state.active.form.questions.map(q=>[q.id,q.answerKey??q.answer??q.acceptedAnswers?.[0]]));}
for(const source of banks){
  const bank={...clone(source),bankVersion:3,readingSections:[]},state=C.empty();
  C.start(state,bank,'standard',1000);answer(state);C.submit(state,1001);
  C.start(state,bank,'advanced',1002);answer(state);C.submit(state,1003);
  const due=C.item(state,bank.itemId).due.at;
  assert.throws(()=>C.start(state,bank,'7-day',due-1),/not due/);
  C.start(state,bank,'7-day',due);assert.equal(state.active.deadline,null);
  assert.equal(state.active.form.stage,'7-day');
  const snapshot=JSON.stringify(state.active.form),restored=C.normalize(clone(state));
  // A later bank revision cannot change the active question snapshot or key.
  bank.exams.find(e=>e.stage==='7-day').questions[0].stem='Future revision';
  assert.equal(JSON.stringify(restored.active.form),snapshot);
  answer(restored);const finished=due+100;
  const result=C.submit(restored,finished);
  assert(result.attempt.passed);assert.equal(result.attempt.completedAt,finished);
  assert.equal(C.item(restored,bank.itemId).due.stage,'21-day');
  assert.equal(C.item(restored,bank.itemId).due.at,finished+21*C.DAY);
  const failed=C.empty(),record=C.item(failed,bank.itemId);
  record.due={stage:'7-day',at:2000};C.start(failed,bank,'7-day',2000);
  failed.active.answers={};const failure=C.submit(failed,2001);
  assert(!failure.attempt.passed);assert.equal(record.due.stage,'7-day');
  assert.equal(record.due.at,2001+7*C.DAY);
}
const ten={stage:'7-day',questions:Array.from({length:10},(_,i)=>({id:'q'+i,format:'single-best-answer',answerKey:'A',learningPointIds:['p'+i]}))};
assert(!C.grade(ten,Object.fromEntries(ten.questions.slice(0,9).map(q=>[q.id,'A']))).passed);
assert(C.grade(ten,Object.fromEntries(ten.questions.map(q=>[q.id,'A']))).passed);
console.log('PASS: all '+banks.length+' real 7-day forms: due gating, untimed resume, revision isolation, pass/weekly retry and actual 21-day schedule; exact 90% fails');
