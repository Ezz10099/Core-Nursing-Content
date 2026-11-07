const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../runtime/files'),content=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../content.json'),'utf8')),KEY='core-nursing-ccu-prototype-v1';
function boot(saved){
 const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.alert=()=>{};w.confirm=()=>true;
 if(saved)w.localStorage.setItem(KEY,saved);
 for(const f of ['study-ui','reading','question-marks','exam-core','exam-data',...['01','02','03','04','05','06'].map(n=>'exam-data-'+n),'app','exams','readiness-data','material-readiness'])vm.runInContext(fs.readFileSync(path.join(base,'js',f+'.js'),'utf8'),dom.getInternalVMContext());
 w.CoreNursingSync.receive(JSON.stringify(content));return w;
}
let w=boot(JSON.stringify({reading:{'med:heparin':'read'},bookmarks:['heparin'],attempts:[{id:'heparin',correct:true}]})),d=w.document;
const state=()=>JSON.parse(w.localStorage.getItem(KEY)),before=w.localStorage.getItem(KEY);
assert(!d.querySelector('#home #materialReadiness'),'Home no longer contains the long preparation-status panel');
assert(d.querySelector('#library #materialReadiness'),'Detailed preparation status remains on the Medications page');
assert(d.querySelector('#source-complete'),'Medications has its own Completed classification');
assert.equal(d.querySelector('#materialPreparationDetails').open,false,'Detailed preparation status stays collapsed by default');
const available=w.CoreNursingExamData.banks.filter(b=>!b.capabilityRequirement||w.nativeHasCapability(b.capabilityRequirement));
const expected=key=>available.filter(b=>w.CoreNursingReadinessData.items[b.itemId].status===key).length;
assert.equal(d.querySelector('#materialReadiness button[data-status=complete]').textContent,'مكتمل ('+expected('complete')+')');
if(!expected('complete'))assert(d.querySelector('.material-readiness-empty').textContent.includes('لم تُعتمد'));
w.CoreNursingReadiness.select('in_review');assert.equal(d.querySelectorAll('.material-readiness-card').length,Math.min(6,expected('in_review')));
w.CoreNursingReadiness.select('not_reviewed');assert.equal(d.querySelectorAll('.material-readiness-card').length,Math.min(6,expected('not_reviewed')),'Long lists are initially bounded');
assert.equal(w.localStorage.getItem(KEY),before,'Browsing preparation status never edits learner progress');
// Phase/completion fixtures must remain separate from saved learner data.
for(const row of Object.values(w.CoreNursingReadinessData.items))row.status='not_reviewed';
w.CoreNursingReadinessData.items['ccu-heparin-ufh'].status='in_review';
assert.equal(w.CoreNursingReadiness.status('heparin'),'in_review','Aliases share author status before completed-source checks');
// Positive completed-medication and completed-lesson fixtures exercise the
// future category without falsely completing any shipped material.
const med=w.CoreNursingExamData.banks.find(b=>b.itemId==='ccu-omeprazole'),lesson=w.CoreNursingExamData.banks.find(b=>b.itemType==='lesson');
for(const b of [med,lesson])w.CoreNursingReadinessData.items[b.itemId].status='complete';
w.CoreNursingReadiness.open('complete');assert.equal(d.querySelectorAll('.material-readiness-card').length,2);assert.equal(w.localStorage.getItem(KEY),before);
assert(!d.querySelector('#library').classList.contains('hidden'),'The review panel opens in Medications, not Home');
assert.equal(d.querySelector('#materialPreparationDetails').open,true,'Review details expand when explicitly requested');
w.setCatalogFilter('complete');assert(d.querySelector('#source-complete').classList.contains('selected'));
assert.equal(d.querySelector('#source-complete').textContent,'Completed (1)');
w.showTab('clinical');w.toggleCompletedLessons();
assert(d.querySelector('#completedLessonsLink').getAttribute('aria-pressed')==='true','Completed lessons are filtered in Clinical');
assert.equal(d.querySelectorAll('#lessonList .item').length,1,'Completed clinical filter shows only approved lessons');
w.toggleCompletedLessons();assert(d.querySelector('#completedLessonsLink').getAttribute('aria-pressed')==='false');
w.showTab('library');w.setCatalogFilter('complete');
assert.equal(d.querySelectorAll('#list .item').length,1,'Completed category filters medications, not lessons');
assert(d.querySelector('#list .item').textContent.includes(med.title));
w.eval(d.querySelector('#list .item button').getAttribute('onclick'));assert(!d.querySelector('#detail').classList.contains('hidden'));
assert.equal(state().reading['med:heparin'],'read');assert.equal(state().exams.items[med.itemId]?.attempts?.length||0,0,'Editorial completion is not an exam pass');
w.CoreNursingReadiness.open('complete','lesson');assert.equal(d.querySelectorAll('.material-readiness-card').length,1);
d.querySelector('.material-readiness-card button:last-child').click();assert.equal(state().exams.active.itemId,lesson.itemId,'Exam shortcut starts the real eligible exam');
assert.equal(state().exams.active.form.stage,'comprehensive');const active=JSON.stringify(state().exams.active);
// A changed teaching source invalidates a completed label instead of keeping
// it on newer, unreviewed material.
const updated=JSON.parse(JSON.stringify(content));updated.contentVersion++;updated.medications.find(m=>m.id===med.itemId).monitor+=' New unreviewed source text.';
w.CoreNursingSync.receive(JSON.stringify(updated));assert.equal(w.CoreNursingReadiness.status(med.itemId),'in_review');assert.equal(JSON.stringify(state().exams.active),active);
const saved=w.localStorage.getItem(KEY);w.close();w=boot(saved);d=w.document;
assert.equal(w.CoreNursingReadiness.status(med.itemId),w.CoreNursingReadinessData.items[med.itemId].status,'A UI fixture cannot persist completion into learner backups');
assert.equal(JSON.stringify(JSON.parse(w.localStorage.getItem(KEY)).exams.active),active);
assert.equal(JSON.parse(w.localStorage.getItem(KEY)).reading['med:heparin'],'read');
w.close();console.log('PASS: uncrowded Home, dedicated Completed medication filter, preserved editorial details/lesson statuses, study/exam navigation, stale-source downgrade and preserved learner progress/active attempts.');
