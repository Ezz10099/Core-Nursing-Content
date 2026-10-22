const assert=require('node:assert/strict');
const C=require('../runtime/files/js/exam-core.js');
const form=(stage,count=10,critical=false)=>({id:'test--'+stage,stage,questions:Array.from({length:count},(_,i)=>({id:'q'+i,format:'single-best-answer',answerKey:'B',choices:[],learningPointIds:['p'+i],criticalForSafety:critical&&i===0}))});
const bank={itemId:'test',bankVersion:1,readingSections:[{id:'s1'},{id:'s2'}],exams:['standard','advanced','7-day','21-day'].map(s=>form(s))};
const answers=(f,count)=>Object.fromEntries(f.questions.map((q,i)=>[q.id,i<count?'B':'A']));
function attempt(state,stage,count,time,custom=bank){C.start(state,custom,stage,time);state.active.answers=answers(state.active.form,count);state.active.shown=state.active.form.questions.map(q=>q.id);return C.submit(state,time+1)}
// Actual integer boundaries, including coarse short forms and unrounded percentages.
assert(C.grade(form('standard'),answers(form('standard'),9)).passed);
assert(!C.grade(form('advanced'),answers(form('advanced'),9)).passed);
assert(C.grade(form('advanced',110),answers(form('advanced',110),100)).passed);
assert(!C.grade(form('advanced',110),answers(form('advanced',110),99)).passed);
assert(!C.grade(form('standard',20),answers(form('standard',20),13)).below65);
assert(C.grade(form('standard',20),answers(form('standard',20),12)).below65);
assert(!C.grade(form('standard',1),{}).passed);
assert.equal(C.grade(form('standard'),answers(form('standard'),10),{q0:true}).review.length,1);
assert.equal(C.grade(form('standard'),answers(form('standard'),10),{q0:true}).safetyMisses.length,0);
// Safety misses leave the numeric score alone and require a separate check.
let state=C.empty(),criticalBank=JSON.parse(JSON.stringify(bank));criticalBank.exams[0]=form('standard',10,true);
C.start(state,criticalBank,'standard',100);state.active.answers=Object.fromEntries(state.active.form.questions.map((q,i)=>[q.id,i===0?'A':'B']));
let result=C.submit(state,101);assert.equal(result.attempt.correct,9);assert(result.attempt.passed);assert.equal(result.attempt.completedAt,null);
assert(!C.eligible(state,'test','advanced',bank.readingSections,102).ok);
C.safetyCheck(state,'test',{q0:'A'},103);assert.equal(C.item(state,'test').pendingSafety.length,1);
C.safetyCheck(state,'test',{q0:'B'},104);assert(C.eligible(state,'test','advanced',bank.readingSections,105).ok);assert.equal(result.attempt.correct,9);
// Below 65 requires a new confirmation of every section, without deleting old history.
state=C.empty();C.item(state,'test').reads=[{sectionId:'s1',at:20},{sectionId:'s2',at:20}];
attempt(state,'standard',6,200);let r=C.item(state,'test');assert.equal(r.reads.length,2);
assert.equal(C.readingRemaining(r,bank.readingSections).length,2);r.reads.push({sectionId:'s1',at:202});assert.equal(C.readingRemaining(r,bank.readingSections).length,1);
r.reads.push({sectionId:'s2',at:203});assert(C.eligible(state,'test','standard',bank.readingSections,204).ok);
attempt(state,'standard',9,205);C.start(state,bank,'advanced',210);assert.equal(state.active.deadline,210+10*90000);
const saved=C.normalize(JSON.parse(JSON.stringify(state)));assert.equal(saved.active.deadline,state.active.deadline);assert.equal(saved.active.startedAt,210);
state.active.answers=answers(state.active.form,10);C.submit(state,220);r=C.item(state,'test');assert.equal(r.due.at,220+7*C.DAY);assert.equal(r.due.stage,'7-day');
assert(!C.eligible(state,'test','7-day',bank.readingSections,r.due.at-1).ok);
const failedAt=r.due.at;attempt(state,'7-day',8,failedAt);assert.equal(r.due.at,failedAt+1+7*C.DAY);
const passAt=r.due.at;attempt(state,'7-day',10,passAt);assert.equal(r.due.stage,'21-day');assert.equal(r.due.at,passAt+1+21*C.DAY);
const twentyOneAt=r.due.at;attempt(state,'21-day',8,twentyOneAt);assert.equal(r.due.stage,'21-day');assert.equal(r.due.at,twentyOneAt+1+7*C.DAY);
attempt(state,'21-day',10,r.due.at);assert.equal(r.due,null);
assert.equal(C.normalize(JSON.parse(JSON.stringify(state))).items.test.attempts.length,r.attempts.length);
assert(C.isCorrect({format:'numeric-entry',answer:5},'5.0'));assert(!C.isCorrect({format:'numeric-entry',answer:0},''));assert(!C.isCorrect({format:'numeric-entry',answer:5},'5 mg'));
assert(C.isCorrect({format:'short-answer',acceptedAnswers:['intramuscular injection']},'  Intramuscular   Injection '));
const hostile=JSON.parse('{"version":1,"items":{"__proto__":{"attempts":[]},"constructor":{"attempts":[]},"future-item":{"attempts":[],"reads":[]}}}');
assert.deepEqual(Object.keys(C.normalize(hostile).items),['future-item']);
// A question-bank addition must preserve the same standard form after reading,
// including its original bank provenance. A changed source gets a new form.
state=C.empty();attempt(state,'standard',6,1000);
r=C.item(state,'test');r.reads.push({sectionId:'s1',at:1002},{sectionId:'s2',at:1002});
const expanded=JSON.parse(JSON.stringify(bank));expanded.bankVersion=2;expanded.exams[0]=form('standard',12);
state=C.normalize(JSON.parse(JSON.stringify(state)));
C.start(state,expanded,'standard',1003);assert.equal(state.active.form.questions.length,10);assert.equal(state.active.bankVersion,1);
state.active.answers=answers(state.active.form,10);C.submit(state,1004);
const changedSource=JSON.parse(JSON.stringify(expanded));changedSource.readingSections[0].id='s1-revised';
C.item(state,'test').reads.push({sectionId:'s1-revised',at:1005});
C.start(state,changedSource,'standard',1005);assert.equal(state.active.form.questions.length,12);assert.equal(state.active.bankVersion,2);
// Prose-only updates can refresh the saved retake without changing its grading.
state=C.empty();const original=JSON.parse(JSON.stringify(bank));
original.exams[0].questions.forEach(q=>{q.stem='Old wording';q.choices=[{id:'A',text:'First',explanation:'Old first'},{id:'B',text:'Second',explanation:'Old second'}]});
attempt(state,'standard',9,2000,original);
const prose=JSON.parse(JSON.stringify(original));prose.bankVersion=3;
prose.exams[0].questions[0].stem='Direct clinical wording';prose.exams[0].questions[0].choices[0].explanation='Clearer explanation';
prose.exams[0].questions[1].stem='Different scoring';prose.exams[0].questions[1].answerKey='A';
const before=JSON.stringify(C.item(state,'test').attempts);
C.start(state,prose,'standard',2002);
assert.equal(state.active.form.questions[0].stem,'Direct clinical wording');
assert.equal(state.active.form.questions[0].choices[0].explanation,'Clearer explanation');
assert.equal(state.active.form.questions[1].stem,'Old wording');assert.equal(state.active.form.questions[1].answerKey,'B');
assert.equal(state.active.bankVersion,1);assert.equal(state.active.form.questions.length,10);
assert.equal(JSON.stringify(C.item(state,'test').attempts),before);
console.log('PASS: exact score boundaries, unsure flags, safety checks, rereading, timer persistence, 7/21-day retries, history, safe prose refresh and answer formats');
