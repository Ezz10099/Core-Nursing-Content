const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'runtime/files'),KEY='core-nursing-ccu-prototype-v1';
const content=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
function boot(saved){
 const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){w.lastJump=this};w.alert=()=>{};w.confirm=()=>true;
 if(saved)w.localStorage.setItem(KEY,saved);
 for(const file of ['study-ui','reading','question-marks','app'])vm.runInContext(fs.readFileSync(path.join(base,'js',file+'.js'),'utf8'),dom.getInternalVMContext());
 assert(w.validContent(content),'The published content must be accepted, including fractional quick-reference ordering.');
 w.CoreNursingSync.receive(JSON.stringify(content));return w;
}
function select(w,node,start=0,end=node.textContent.length){
 const range=w.document.createRange();range.setStart(node.firstChild,start);range.setEnd(node.firstChild,end);
 w.getSelection().removeAllRanges();w.getSelection().addRange(range);w.captureQuestionSelection();
}
(async()=>{
 let w=boot(JSON.stringify({bookmarks:['heparin'],attempts:[{id:'heparin',correct:true}],reading:{'med:heparin':'read'}})),d=w.document;
 const state=()=>JSON.parse(w.localStorage.getItem(KEY));
 w.showTab('library');w.openMed('heparin');
 let p=d.querySelector('#detail [data-study-section="0"] p');
 const text=p.textContent.slice(0,14);select(w,p,0,14);
 assert.equal(d.querySelector('#questionSelectionBar').hidden,false);
 const event=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true});d.querySelector('#questionSelectionBar button').dispatchEvent(event);assert(event.defaultPrevented);
 w.saveQuestionMark();
 let mark=state().questionMarks[0];
 assert.equal(mark.text,text);assert.equal(mark.itemId,'heparin');assert.equal(mark.itemType,'med');assert.equal(mark.sectionTitle,'Drug class');assert(mark.sectionText.includes(text));assert.equal(mark.contentVersion,content.contentVersion);
 assert.equal(state().reading['med:heparin'],'read');assert.deepEqual(state().bookmarks,['heparin']);assert.equal(state().attempts.length,1);
 assert.equal(d.querySelector('#questionSelectionBar').hidden,true);
 select(w,p,0,14);w.saveQuestionMark();assert.equal(state().questionMarks.length,1,'Identical marks must not accumulate.');
 // Selecting across sections must not save text against just one section.
 const range=d.createRange(),p1=d.querySelector('#detail [data-study-section="1"] p');
 range.setStart(p.firstChild,0);range.setEnd(p1.firstChild,5);w.getSelection().removeAllRanges();w.getSelection().addRange(range);w.captureQuestionSelection();
 assert(d.querySelector('#questionSelectionBar').hidden);w.saveQuestionMark();assert.equal(state().questionMarks.length,1);
 // Pending text cannot be saved under another medication or after leaving the reader.
 select(w,p,0,6);w.openMed('norepinephrine');w.saveQuestionMark();assert.equal(state().questionMarks.length,1);
 w.toggleQuestionPicking();p=d.querySelector('#detail [data-study-section="2"] p');p.click();
 assert(!d.querySelector('#questionSelectionBar').hidden);w.saveQuestionMark();assert.equal(state().questionMarks[1].itemId,'norepinephrine');assert.equal(state().questionMarks[1].text,p.textContent);
 p.click();w.showTab('home');w.saveQuestionMark();assert.equal(state().questionMarks.length,2);assert(d.querySelector('#questionSelectionBar').hidden);
 w.showTab('library');assert(!d.querySelector('#detail').classList.contains('question-picking'));
 // Memory cues and medication FAQs also keep their source section.
 const cue=d.querySelector('#detail .memory-cue p');select(w,cue);w.saveQuestionMark();assert.equal(state().questionMarks[2].sectionKey,'memory-use');
 const faq=d.querySelector('#detail [data-reading-faq] .faq-part p');
 if(faq){select(w,faq);w.saveQuestionMark();assert(state().questionMarks.at(-1).sectionKey.startsWith('faq:'))}
 w.showTab('clinical');const lesson=content.lessons.find(l=>l.sections.some(s=>s.display==='reveal'))||content.lessons[0];w.openLesson(lesson.id);
 p=d.querySelector('#lessonDetail .section-body p,#lessonDetail .reveal-answer p');select(w,p);w.saveQuestionMark();
 mark=state().questionMarks.at(-1);assert.equal(mark.itemType,'lesson');assert.equal(mark.itemId,lesson.id);assert.equal(mark.itemTitle,lesson.title);
 // An update to the catalog does not relabel the version of an already rendered passage.
 const newer={...content,contentVersion:content.contentVersion+1};w.CoreNursingSync.receive(JSON.stringify(newer));select(w,p,0,12);w.saveQuestionMark();assert.equal(state().questionMarks.at(-1).contentVersion,content.contentVersion);
 let exported;w.CoreNursingAndroid={saveBackup:data=>exported=data};w.exportQuestionMarks();
 const marksExport=JSON.parse(exported);assert.equal(marksExport.app,'core-nursing-question-marks');assert.deepEqual(marksExport.marks,state().questionMarks);assert(!('attempts' in marksExport),'Mark export contains no quiz history.');
 w.exportProgress();const backup=exported;assert.deepEqual(JSON.parse(backup).questionMarks,state().questionMarks);
 w.close();w=boot(backup);d=w.document;assert.deepEqual(state().questionMarks,JSON.parse(backup).questionMarks);
 w.showTab('progress');assert.equal(d.querySelectorAll('.question-mark').length,state().questionMarks.length);
 w.openQuestionMark(0);await new Promise(r=>w.requestAnimationFrame(r));assert.equal(w.lastJump.dataset.questionSection,'section:0');assert(w.lastJump.open);
 w.showTab('progress');const count=state().questionMarks.length;w.confirm=()=>false;w.removeQuestionMark(0);assert.equal(state().questionMarks.length,count);
 w.confirm=()=>true;w.removeQuestionMark(0);assert.equal(state().questionMarks.length,count-1);
 // Restore retains unknown item IDs and escapes marked text instead of executing it.
 w.FileReader=class{readAsText(file){this.result=file.text;this.onload()}};
 const malicious={...mark,itemId:'future-lesson',itemTitle:'<img src=x onerror=alert(1)>',text:'<script>throw Error("bad")</script>'};
 const restore=marks=>w.importProgress({target:{files:[{text:JSON.stringify({app:KEY,bookmarks:[],attempts:[],questionMarks:marks})}]}});
 restore([malicious,null,{...mark,itemType:'bad'},{...mark,text:''},{...mark,text:'x'.repeat(16001)},malicious]);
 assert.equal(state().questionMarks.length,1);assert.equal(d.querySelector('#question-marks img,#question-marks script'),null);assert(d.querySelector('#question-marks').textContent.includes(malicious.text));
 w.openQuestionMark(0);assert.equal(state().questionMarks.length,1,'Missing source items must remain exportable.');
 restore(undefined);assert.deepEqual(state().questionMarks,[],'Old backups restore without marks.');
 restore([mark]);w.resetProgress();assert.deepEqual(state().questionMarks,[]);
 assert.equal(state().attempts.length,0);
 w.close();console.log('PASS: selection, paragraph marking, source/version context, duplicates, navigation, local persistence, safe rendering, export, backup migration, removal, reset, and reading/score separation');
})().catch(error=>{console.error(error);process.exit(1)});
