const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'runtime/files'),KEY='core-nursing-ccu-prototype-v1';
const content=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
function boot(saved){
 const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.alert=()=>{};w.confirm=()=>true;
 if(saved)w.localStorage.setItem(KEY,saved);
 for(const file of ['study-ui','reading','question-marks','exam-core','exam-data','exam-data-01','exam-data-02','exam-data-03','exam-data-04','exam-data-05','exam-data-06','app','exams','readiness-data','material-readiness'])vm.runInContext(fs.readFileSync(path.join(base,'js',file+'.js'),'utf8'),dom.getInternalVMContext());
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
// Available ready intersects current preparation completion with exam eligibility.
{
 const w=boot(),d=w.document,data=w.CoreNursingExamData;
 for(const row of Object.values(w.CoreNursingReadinessData.items))row.status='complete';
 const fixtures=data.banks.filter(b=>w.CoreNursingReadiness.status(b.itemId)==='complete');
 const med=fixtures.find(b=>b.itemType==='medication'),lesson=fixtures.find(b=>b.itemType==='lesson');
 assert(med&&lesson);
 for(const row of Object.values(w.CoreNursingReadinessData.items))row.status='not_reviewed';
 for(const b of [med,lesson])w.CoreNursingReadinessData.items[b.itemId].status='complete';
 w.showTab('practice');const before=w.localStorage.getItem(KEY);
 w.CoreNursingExams.listFilter('ready');
 assert.equal(d.querySelectorAll('#examCatalog .exam-card').length,2);
 assert(d.querySelector('#examFilters').textContent.includes('Available ready · 2'));
 w.CoreNursingExams.filter(med.title.toLowerCase());assert.equal(d.querySelectorAll('#examCatalog .exam-card').length,1);
 w.CoreNursingExams.filter('');
 assert.equal(w.localStorage.getItem(KEY),before,'Filtering never changes learner progress');
 const due=Date.now()+86400000;
 w.eval('memory.exams.items['+JSON.stringify(lesson.itemId)+']={attempts:[],reads:[],pendingSafety:[],readingAfter:null,due:{stage:"7-day",at:'+due+'}}');
 w.CoreNursingExams.listFilter('ready');assert.equal(d.querySelectorAll('#examCatalog .exam-card').length,1,'Future reviews remain Upcoming');
 w.CoreNursingReadinessData.items[med.itemId].status='in_review';
 w.CoreNursingExams.listFilter('ready');assert.equal(d.querySelectorAll('#examCatalog .exam-card').length,0,'Partial revision is excluded');
 assert(d.querySelector('#examCatalog').textContent.includes('No revision-complete'));
 w.CoreNursingExams.listFilter('available');assert(d.querySelectorAll('#examCatalog .exam-card').length>0,'All other available exams remain accessible');
 // Due reviews join Available ready once their material revision is complete.
 w.CoreNursingReadinessData.items[lesson.itemId].status='complete';
 w.eval('memory.exams.items['+JSON.stringify(lesson.itemId)+'].due.at=Date.now()-1000');
 w.CoreNursingExams.listFilter('ready');assert.equal(d.querySelectorAll('#examCatalog .exam-card').length,1);
 w.close();
}
// Result navigation uses authoring completion, never reading or exam passing.
for(const type of ['medication','lesson']){
 const w=boot(),d=w.document,data=w.CoreNursingExamData;
 for(const row of Object.values(w.CoreNursingReadinessData.items))row.status='complete';
 const list=w.eval(type==='lesson'?'lessons':'meds');
 const canonical=id=>data.aliases[id]||id;
 const candidates=list.filter(x=>w.CoreNursingReadiness.status(x.id)==='complete');
 assert(candidates.length>=3,'Need real matching source fixtures');
 const [first,skip,next]=candidates;
 for(const row of Object.values(w.CoreNursingReadinessData.items))row.status='not_reviewed';
 w.CoreNursingReadinessData.items[canonical(next.id)].status='complete';
 w.CoreNursingExams.launch(first.id);assert(state(w).exams.active);
 answerAll(w,type==='medication');w.CoreNursingExams.submit();
 const button=d.querySelector('.exam-next-material button');
 assert(button,'Passed and failed results both offer a next material');
 assert(button.textContent.includes('Next completed '+type));
 const before=JSON.stringify(state(w).exams);
 w.eval(button.getAttribute('onclick'));
 if(type==='medication')assert.equal(w.eval('current'),next.id);
 else assert.equal(d.querySelector('#lessonDetail').dataset.readinessItemId,next.id);
 assert.equal(JSON.stringify(state(w).exams),before,'Moving on preserves score, safety checks and schedule');
 // Completion changed since results were rendered: navigation must recheck.
 w.CoreNursingReadinessData.items[canonical(next.id)].status='in_review';
 const current=w.eval('tab');w.CoreNursingExams.nextCompleted(first.id);
 assert.equal(w.eval('tab'),current,'No stale completed link opens an in-review material');
 w.close();
}
// No completed successor means no fabricated navigation target.
{
 const w=boot(),d=w.document;
 for(const row of Object.values(w.CoreNursingReadinessData.items))row.status='not_reviewed';
 w.CoreNursingExams.launch('heparin');answerAll(w);w.CoreNursingExams.submit();
 assert(!d.querySelector('.exam-next-material button'));
 assert(d.querySelector('#examSession').textContent.includes('No more preparation-complete medications'));
 w.close();
}
// Whole-material completion reveals the existing eligible exam action, without starting it.
{
 const w=boot(),d=w.document;
 const lesson=w.CoreNursingExamData.banks.find(b=>b.itemType==='lesson'&&w.eval('lessons').some(l=>l.id===b.itemId));
 for(const [type,id,tab,detail] of [['med','heparin','library','detail'],['lesson',lesson.itemId,'clinical','lessonDetail']]){
  w.showTab(tab);if(type==='med')w.openMed(id);else w.openLesson(id);
  const host=d.getElementById(detail),entry=host.querySelector('.exam-entry');
  assert(entry.hidden,'Exam prompt stays hidden before whole-material completion');
  const control=host.querySelector('.reader-finish .reading-control');
  w.toggleReading(control);
  assert(!entry.hidden,'Mark as read immediately reveals exam prompt');
  assert.equal(entry.querySelector('button').textContent,'Take exam →');
  assert.equal(state(w).exams.active,null,'Reading never starts an exam automatically');
  w.toggleReading(control);assert(entry.hidden,'Marking unread hides reader prompt again');
  w.toggleReading(control);
 }
 const saved=state(w);w.close();
 const restored=boot(JSON.stringify(saved));restored.showTab('library');restored.openMed('heparin');
 assert(!restored.document.querySelector('#detail .exam-entry').hidden,'Read state survives restart');
 restored.CoreNursingExams.launch('heparin');
 const active=JSON.stringify(state(restored).exams.active);
 restored.showTab('library');restored.openMed('heparin');
 assert.equal(restored.document.querySelector('#detail .exam-entry button').textContent,'Continue exam →');
 assert.equal(JSON.stringify(state(restored).exams.active),active,'Reader preserves active answers and position');
 restored.close();
 const due=Date.now()+86400000;
 saved.exams.items['ccu-heparin-ufh']={attempts:[],reads:[],readingAfter:null,pendingSafety:[],due:{stage:'7-day',at:due}};
 const scheduled=boot(JSON.stringify(saved));scheduled.showTab('library');scheduled.openMed('heparin');
 const entry=scheduled.document.querySelector('#detail .exam-entry');
 assert(!entry.hidden);assert.equal(entry.querySelector('button').textContent,'View exam schedule');
 scheduled.CoreNursingExams.launch('heparin');assert.equal(state(scheduled).exams.active,null);
 assert.equal(state(scheduled).exams.items['ccu-heparin-ufh'].due.at,due,'Reading does not change review timing');
 scheduled.close();
}
let w=boot(JSON.stringify({bookmarks:['heparin'],attempts:[{id:'heparin',correct:true}],reading:{'med:heparin':'read'}})),d=w.document;
w.showTab('library');w.openMed('heparin');
assert.equal(d.querySelector('#detail').lastElementChild.className,'panel exam-entry','Exam entry is at the bottom');
assert.equal(d.querySelector('#detail .exam-entry button').textContent,'Take exam →');
assert(d.querySelector('#detail .exam-entry button').getAttribute('onclick').includes('launch'));w.CoreNursingExams.launch('heparin');
assert(state(w).exams.active,'One click opens the actual exam');
assert.equal(state(w).exams.active.form.stage,'comprehensive');assert.equal(state(w).exams.active.deadline,null);
assert(!d.querySelector('.exam-feedback'),'No explanations or keys before submission');
const first=state(w).exams.active.form.questions[0];w.CoreNursingExams.unsure(true);
w.CoreNursingExams.answer(first.id,first.answerKey??first.answer??first.acceptedAnswers?.[0]);w.CoreNursingExams.move(1);
const active=JSON.stringify(state(w).exams.active);w.showTab('home');w.showTab('practice');
assert(d.querySelector('#examSession').hidden);assert(d.querySelector('#continueExam'));
w.CoreNursingExams.resume();assert.equal(JSON.stringify(state(w).exams.active),active);
w.CoreNursingExams.move(-1);answerAll(w);w.CoreNursingExams.submit();
let saved=state(w),r=saved.exams.items['ccu-heparin-ufh'];assert(r.attempts[0].passed);assert.equal(r.due.stage,'7-day');
assert.equal(r.due.at-r.attempts[0].completedAt,7*86400000);assert.equal(r.attempts[0].reviewQuestions.length,1);
assert.equal(d.querySelectorAll('.exam-feedback').length,1,'Only flagged answers in result');
assert(d.querySelector('.review-correct-answer'));assert(d.querySelector('.exam-feedback').open);
assert.equal(saved.attempts.length,1);assert.deepEqual(saved.reading,{'med:heparin':'read'});
const original=JSON.stringify(r.comprehensiveForm.questions);
w.CoreNursingExams.reviewItem();assert(d.querySelector('.exam-completed').textContent.includes('Comprehensive exam'));
assert(!d.querySelector('#examSession').textContent.includes('Start advanced'));
w.CoreNursingExams.review();assert.equal(d.querySelectorAll('.review-answer').length,1);
w.CoreNursingExams.reviewFilter('incorrect');assert.equal(d.querySelectorAll('.review-answer').length,0);
w.close();
// Actual delayed stages use the identical exam snapshot and do not reset its data on reload.
for(const stage of ['7-day','21-day']){
 saved.exams.items['ccu-heparin-ufh'].due.at=Date.now()-1000;
 w=boot(JSON.stringify(saved));d=w.document;w.CoreNursingExams.launch('heparin');
 assert.equal(state(w).exams.active.form.stage,stage);
 assert.equal(JSON.stringify(state(w).exams.active.form.questions),original);
 const backup=JSON.stringify(state(w));w.close();w=boot(backup);d=w.document;w.CoreNursingExams.resume();
 assert.equal(JSON.stringify(state(w).exams.active.form.questions),original);
 answerAll(w);w.CoreNursingExams.submit();saved=state(w);r=saved.exams.items['ccu-heparin-ufh'];
 assert(r.attempts.at(-1).completedAt);assert.equal(d.querySelectorAll('.exam-feedback').length,0);
 if(stage==='7-day'){assert.equal(r.due.stage,'21-day');assert.equal(r.due.at-r.attempts.at(-1).completedAt,21*86400000)}else assert.equal(r.due,null);
 w.close();
}
// Failed attempt is a three-day retry and never forces re-reading; safety checks remain separate.
w=boot();d=w.document;w.CoreNursingExams.launch('heparin');answerAll(w,false);w.CoreNursingExams.submit();saved=state(w);r=saved.exams.items['ccu-heparin-ufh'];
assert(!r.attempts[0].passed);assert.equal(r.due.stage,'comprehensive');assert.equal(r.due.at-r.attempts[0].finishedAt,3*86400000);assert.equal(r.readingAfter,null);
assert.equal(d.querySelectorAll('.exam-feedback').length,r.attempts[0].total);
w.CoreNursingExams.safety();for(const p of r.pendingSafety){const q=p.question;w.CoreNursingExams.followupAnswer(q.id,q.answerKey??q.answer??q.acceptedAnswers?.[0])}w.CoreNursingExams.submitSafety();
w.CoreNursingExams.start('comprehensive');assert.equal(state(w).exams.active,null,'Retry locked until due');
// Backups and old results are preserved without conversion into comprehensive passes.
let exported;w.CoreNursingAndroid={saveBackup:s=>exported=s};w.exportProgress();
w.FileReader=class{readAsText(f){this.result=f.text;this.onload()}};w.importProgress({target:{files:[{text:exported}]}});
assert.equal(state(w).exams.items['ccu-heparin-ufh'].due.at,r.due.at);
w.resetProgress();assert.equal(state(w).exams.active,null);w.close();
const old={id:'old-1',stage:'standard',formId:'ccu-heparin-ufh--standard',bankVersion:4,correct:8,total:9,passed:false,finishedAt:100,completedAt:null,responses:[],safetyMisses:[]};
w=boot(JSON.stringify({bookmarks:[],attempts:[],exams:{version:1,items:{'ccu-heparin-ufh':{attempts:[old],reads:[],pendingSafety:[],readingAfter:null,due:null}},active:null}}));
w.CoreNursingExams.open('heparin');assert.equal(state(w).exams.items['ccu-heparin-ufh'].attempts[0].passed,false);
w.CoreNursingExams.launch('heparin');assert.equal(state(w).exams.active.form.stage,'comprehensive');w.close();
console.log('PASS: bottom direct exam entry, identical three-stage forms, three-day retries, filtered visible correction, saved flags, history and backups');
