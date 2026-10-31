const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'runtime/files'),KEY='core-nursing-ccu-prototype-v1';
const content=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
function boot(saved){
 const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.alert=()=>{};w.confirm=()=>true;
 if(saved)w.localStorage.setItem(KEY,saved);
 for(const file of ['study-ui','reading','question-marks','exam-core','exam-data','exam-data-01','exam-data-02','exam-data-03','exam-data-04','exam-data-05','app','exams'])vm.runInContext(fs.readFileSync(path.join(base,'js',file+'.js'),'utf8'),dom.getInternalVMContext());
 w.CoreNursingSync.receive(JSON.stringify(content));return w;
}
const state=w=>JSON.parse(w.localStorage.getItem(KEY));
function answerAll(w,correct=true){
 const active=state(w).exams.active;
 for(let i=0;i<active.form.questions.length;i++){
  const q=active.form.questions[i];
  w.CoreNursingExams.answer(q.id,correct?(q.answerKey??q.answer??q.acceptedAnswers?.[0]):'wrong');
  if(i<active.form.questions.length-1)w.CoreNursingExams.move(1);
 }
}
let w=boot(JSON.stringify({bookmarks:['heparin'],attempts:[{id:'heparin',correct:true}],reading:{'med:heparin':'read'}}));
let d=w.document;
w.showTab('library');w.openMed('heparin');assert(d.querySelector('#detail .exam-entry'));
w.CoreNursingExams.open('heparin');assert(d.querySelector('#examSession').textContent.includes('HEPARIN'));
assert(d.querySelector('#examSession').textContent.includes('Pass the standard exam'));
w.CoreNursingExams.start('standard');assert(!d.querySelector('#examSession .exam-feedback'),'Keys and explanations must not appear during an exam.');
assert(d.querySelector('#examTimer').textContent.includes('Untimed'));
const first=state(w).exams.active.form.questions[0];w.CoreNursingExams.unsure(true);
w.CoreNursingExams.answer(first.id,first.answerKey??first.answer??first.acceptedAnswers?.[0]);w.CoreNursingExams.move(1);
const unfinished=JSON.stringify(state(w).exams.active);
w.showTab('home');w.showTab('practice');assert(!d.querySelector('#examsHub').hidden);assert(d.querySelector('#examSession').hidden);
assert(d.querySelector('#continueExam'));assert(d.querySelector('#practicePassedExams'));assert.equal(JSON.stringify(state(w).exams.active),unfinished);
w.CoreNursingExams.resume();assert.equal(state(w).exams.active.index,1);assert(state(w).exams.active.unsure[first.id]);
assert.equal(state(w).exams.active.answers[first.id],first.answerKey??first.answer??first.acceptedAnswers?.[0]);
w.CoreNursingExams.catalog();assert(!d.querySelector('#examsHub').hidden);assert.equal(JSON.stringify(state(w).exams.active),unfinished);
w.CoreNursingExams.resume();w.CoreNursingExams.move(-1);answerAll(w);w.CoreNursingExams.submit();
let saved=state(w);assert(saved.exams.items['ccu-heparin-ufh'].attempts[0].passed);assert.equal(saved.attempts.length,1);assert.deepEqual(saved.reading,{'med:heparin':'read'});
assert(d.querySelector('.exam-feedback'));assert(d.querySelector('#examSession').textContent.includes('Standard exam passed.'));
w.CoreNursingExams.reviewItem();assert(d.querySelector('.exam-start h3').textContent.includes('Standard exam · Passed'));
w.CoreNursingExams.catalog();assert([...d.querySelectorAll('.exam-link')].some(n=>n.textContent.includes('HEPARIN')&&n.textContent.includes('Standard exam:')&&n.textContent.includes('Passed')));
w.CoreNursingExams.open('heparin');w.CoreNursingExams.start('advanced');assert(state(w).exams.active.deadline);
const deadline=state(w).exams.active.deadline,backup=JSON.stringify(state(w));w.close();w=boot(backup);d=w.document;
assert.equal(state(w).exams.active.deadline,deadline);w.showTab('practice');assert(d.querySelector('#examSession').hidden);assert(d.querySelector('#continueExam'));
assert(d.querySelector('#practicePassedExams').textContent.includes('Standard exam · Passed'));
w.CoreNursingExams.resume();assert(d.querySelector('#examTimer').textContent.includes('remaining'));assert.equal(state(w).exams.active.deadline,deadline);
answerAll(w);w.CoreNursingExams.submit();saved=state(w);let r=saved.exams.items['ccu-heparin-ufh'];assert(r.attempts.at(-1).passed);assert.equal(r.due.stage,'7-day');
assert(d.querySelector('#examSession').textContent.includes('Advanced exam passed.'));
// Real 7-day banks unlock on the saved due date, resume untimed, and schedule 21 days from the actual pass.
let sevenSaved=JSON.parse(JSON.stringify(saved));sevenSaved.exams.items['ccu-heparin-ufh'].due.at=Date.now()-1;
let seven=boot(JSON.stringify(sevenSaved));seven.CoreNursingExams.open('heparin');
assert(!seven.document.querySelector('#examSession').textContent.includes('Questions for this scheduled exam have not been added yet.'));
assert([...seven.document.querySelectorAll('.exam-start')].find(n=>n.textContent.includes('7-day exam')).textContent.includes('above 90%'));
seven.CoreNursingExams.start('7-day');assert.equal(state(seven).exams.active.deadline,null);
assert(!seven.document.querySelector('.exam-feedback'));
const sevenSnapshot=JSON.stringify(state(seven).exams.active.form),sevenBackup=JSON.stringify(state(seven));seven.close();seven=boot(sevenBackup);
seven.CoreNursingExams.resume();assert.equal(JSON.stringify(state(seven).exams.active.form),sevenSnapshot);
answerAll(seven);seven.CoreNursingExams.submit();let sevenRecord=state(seven).exams.items['ccu-heparin-ufh'];
assert(sevenRecord.attempts.at(-1).completedAt);assert.equal(sevenRecord.due.stage,'21-day');
assert.equal(sevenRecord.due.at-sevenRecord.attempts.at(-1).completedAt,21*86400000);seven.close();
// A failed real 7-day form stays at the same stage with another seven-day interval.
seven=boot(JSON.stringify(sevenSaved));seven.CoreNursingExams.open('heparin');seven.CoreNursingExams.start('7-day');answerAll(seven,false);seven.CoreNursingExams.submit();
sevenRecord=state(seven).exams.items['ccu-heparin-ufh'];assert.equal(sevenRecord.due.stage,'7-day');
assert.equal(sevenRecord.due.at-sevenRecord.attempts.at(-1).finishedAt,7*86400000);seven.close();

// Advanced timers expire after reload and do not silently restart.
w.CoreNursingExams.reviewItem();w.CoreNursingExams.start('advanced');saved=state(w);saved.exams.active.deadline=Date.now()-1;const expireBackup=JSON.stringify(saved);w.close();w=boot(expireBackup);d=w.document;
assert.equal(state(w).exams.active,null);r=state(w).exams.items['ccu-heparin-ufh'];assert(r.attempts.at(-1).expired);assert.equal(r.attempts.at(-1).correct,0);
w.CoreNursingExams.open('heparin');assert(d.querySelector('#examSession').textContent.includes('7 sections must be marked as read again'));
const bank=w.CoreNursingExamData.banks.find(b=>b.itemId==='ccu-heparin-ufh');for(const section of bank.readingSections)w.CoreNursingExams.read(section.id);
assert.equal(w.CoreNursingExamCore.readingRemaining(state(w).exams.items[bank.itemId],bank.readingSections).length,0);
// A failed/expired advanced exam stays locked after rereading, safety checks and reload.
w.CoreNursingExams.safety();
for(const pending of state(w).exams.items[bank.itemId].pendingSafety){const q=pending.question;w.CoreNursingExams.followupAnswer(q.id,q.answerKey??q.answer??q.acceptedAnswers?.[0])}
w.CoreNursingExams.submitSafety();
assert(d.querySelector('.exam-cooldown'));assert(d.querySelector('#examSession').textContent.includes('24 hours'));
assert([...d.querySelectorAll('.exam-start')].find(n=>n.textContent.includes('Advanced exam')).querySelector('button').disabled);
const cooldownBackup=JSON.stringify(state(w));w.close();w=boot(cooldownBackup);d=w.document;w.CoreNursingExams.open('heparin');
assert(d.querySelector('.exam-cooldown'));w.CoreNursingExams.start('advanced');assert.equal(state(w).exams.active,null);
assert([...d.querySelectorAll('.exam-start h3')].some(n=>n.textContent==='Advanced exam · Passed'),'Historical passes remain clearly labeled after a later failure');

// Old backups, new backups, unknown material records, and reset all remain explicit.
let exported;w.CoreNursingAndroid={saveBackup:data=>exported=data};w.exportProgress();assert(JSON.parse(exported).exams.items[bank.itemId].attempts.length===3);
w.FileReader=class{readAsText(file){this.result=file.text;this.onload()}};
w.importProgress({target:{files:[{text:exported}]}});assert.equal(state(w).exams.items[bank.itemId].attempts.length,3);
w.resetProgress();w.showTab('practice');assert(!d.querySelector('#continueExam'));assert(d.querySelector('#practicePassedExams').textContent.includes('No passed exams yet.'));assert.deepEqual(state(w).exams.items,{});assert.equal(state(w).attempts.length,0);
w.close();
console.log('PASS: medication aliases, hidden answer keys, grading, separate reading/history, timer resume/expiry, required section rereading, backups and reset');
