const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'runtime/files'),KEY='core-nursing-ccu-prototype-v1';
const content=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
function boot(saved){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.HTMLElement.prototype.scrollIntoView=()=>{};w.alert=()=>{};w.confirm=()=>true;
  if(saved)w.localStorage.setItem(KEY,saved);
  for(const name of ['study-ui','reading','question-marks','exam-core','exam-data','exam-data-01','exam-data-02','exam-data-03','exam-data-04','exam-data-05','exam-data-06','app','notes','exams']){
    vm.runInContext(fs.readFileSync(path.join(base,'js',name+'.js'),'utf8'),dom.getInternalVMContext());
  }
  w.CoreNursingSync.receive(JSON.stringify(content));
  return w;
}
function stored(w){return JSON.parse(w.localStorage.getItem(KEY))}
function capture(w,question){
  w.CoreNursingNotes.quickOpen();
  const d=w.document;
  assert.equal(d.querySelector('#quickQuestionOverlay').hidden,false);
  d.querySelector('#quickQuestionText').value=question;
  w.CoreNursingNotes.quickSave();
  assert(d.querySelector('#quickQuestionOverlay').hidden,'After saving, return to the same study screen');
  const state=stored(w);assert(state.notes[0] && !state.notes[0].answer);
  return state.notes[0];
}
(async()=>{
  let w=boot(),d=w.document;
  assert(d.querySelector('#quickQuestionFab'),'One-tap Ask control is present on every screen');
  assert(d.querySelector('#quickQuestionOverlay').hidden);
  const lesson=content.lessons.find(l=>l.department==='ibd2')||content.lessons[0];
  w.showTab('clinical');w.openLesson(lesson.id);
  w.CoreNursingNotes.quickOpen();
  assert(d.querySelector('#quickQuestionContext').textContent.includes(lesson.title));
  assert.equal(d.querySelector('#quickQuestionDept').value,lesson.department);
  d.querySelector('#quickQuestionText').value='Why is this finding important?';
  w.CoreNursingNotes.quickClose();w.CoreNursingNotes.quickOpen();
  assert.equal(d.querySelector('#quickQuestionText').value,'Why is this finding important?','Unsubmitted draft survives reopening');
  w.CoreNursingNotes.quickSave();
  const one=stored(w).notes[0];
  assert.equal(one.sourceId,lesson.id);assert.equal(one.sourceType,'lesson');
  assert.equal(one.question,'Why is this finding important?');assert.equal(one.syncState,'pending');
  assert.equal(d.querySelector('#clinical').classList.contains('hidden'),false);
  assert.equal(d.querySelector('#lessonDetail').classList.contains('hidden'),false);
  const med=content.medications[0];
  w.showTab('library');w.openMed(med.id);
  const two=capture(w,'What should I monitor with this drug?');
  assert.equal(two.sourceType,'med');assert.equal(two.sourceId,med.id);
  assert.equal(d.querySelector('#detail').classList.contains('hidden'),false);
  const bank=w.CoreNursingExamData.banks.find(b=>b.exams.some(e=>e.stage==='comprehensive'));
  assert(bank);w.CoreNursingExams.open(bank.itemId);w.CoreNursingExams.start('comprehensive');
  assert(stored(w).exams.active,'Comprehensive exam must be active for this regression test');
  const before=JSON.stringify(stored(w).exams.active);
  const three=capture(w,'Why is option B not correct?');
  assert.equal(three.sourceType,'exam');assert.equal(three.sourceId,bank.itemId);
  assert.equal(JSON.stringify(stored(w).exams.active),before,'Quick question must not change exam state or saved answers');
  assert.equal(d.querySelector('#practice').classList.contains('hidden'),false);
  assert.equal(d.querySelector('#examSession').hidden,false);
  assert.equal(stored(w).notes.length,3);
  const saved=w.localStorage.getItem(KEY);w.close();
  w=boot(saved);
  assert.equal(stored(w).notes.length,3,'Offline questions survive app restart');
  assert.equal(stored(w).notes[0].status,'unanswered');
  w.close();
  console.log('PASS: one-tap offline questions in lesson, medication, exam; context, draft, navigation and exam progress preserved');
})().catch(e=>{console.error(e);process.exit(1)});
