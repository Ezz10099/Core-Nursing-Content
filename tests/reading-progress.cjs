// Run with NODE_PATH pointing to an installation of jsdom.
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'runtime/files');
const KEY='core-nursing-ccu-prototype-v1';
function boot(saved){
 const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.alert=()=>{};w.confirm=()=>true;
 if(saved)w.localStorage.setItem(KEY,saved);
 for(const file of ['js/reading.js','js/app.js'])require('node:vm').runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext());
 w.CoreNursingSync.receive(fs.readFileSync(path.join(root,'content.json'),'utf8'));
 return w;
}
(async()=>{
 let w=boot(JSON.stringify({bookmarks:['heparin'],attempts:[{id:'heparin',correct:true}],reading:{'med:heparin':'read','faq:future-item':'in-progress'}}));
 const state=()=>JSON.parse(w.localStorage.getItem(KEY));
 assert.match(w.document.querySelector('#reading-med').textContent,/1 \/ \d+ read/);
 w.openMed('heparin');assert.equal(state().reading['med:heparin'],'read');
 w.openMed('norepinephrine');assert.equal(state().reading['med:norepinephrine'],'in-progress');
 const control=w.document.querySelector('#detail .reading-control');w.toggleReading(control);assert.equal(state().reading['med:norepinephrine'],'read');
 w.openMed('norepinephrine');assert.equal(state().reading['med:norepinephrine'],'read');
 w.setReadingFilter('med','read');assert.equal(w.document.querySelectorAll('#list .item').length,2);
 w.setReadingFilter('med','unread');assert(!w.document.querySelector('#list').textContent.includes('Norepinephrine'));
 w.setReadingFilter('med','all');
 const content=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
 const lesson=content.lessons[0];w.openLesson(lesson.id);assert.equal(state().reading['lesson:'+lesson.id],'in-progress');
 w.toggleReading(w.document.querySelector('#lessonDetail .reading-control'));assert.equal(state().reading['lesson:'+lesson.id],'read');
 w.closeLesson();const faq=w.document.querySelector('[data-reading-faq]');assert(faq);assert.equal(state().reading['faq:'+faq.dataset.readingFaq],undefined);
 faq.open=true;w.faqReadingOpened(faq);assert.equal(state().reading['faq:'+faq.dataset.readingFaq],'in-progress');
 w.toggleReading(faq.querySelector('.reading-control'));assert.equal(state().reading['faq:'+faq.dataset.readingFaq],'read');assert(faq.open);
 assert.equal(state().attempts.length,1);assert.deepEqual(state().bookmarks,['heparin']);
 let backup;w.CoreNursingAndroid={saveBackup:text=>backup=text};w.exportProgress();assert.deepEqual(JSON.parse(backup).reading,state().reading);
 w.close();w=boot(backup);assert.equal(state().reading['med:norepinephrine'],'read');assert.equal(state().reading['faq:future-item'],'in-progress');
 w.FileReader=class{readAsText(file){this.result=file.text;this.onload()}};
 w.importProgress({target:{files:[{text:JSON.stringify({app:KEY,bookmarks:[],attempts:[],reading:{'med:heparin':'in-progress','med:bad':'mastered'}})}]}});
 assert.equal(state().reading['med:heparin'],'in-progress');assert.equal(state().reading['med:bad'],undefined);
 assert.match(w.document.querySelector('#continue-reading').textContent,/heparin/i);
 w.importProgress({target:{files:[{text:JSON.stringify({app:KEY,bookmarks:[],attempts:[]})}]}});assert.deepEqual(state().reading,{});
 w.openMed('heparin');w.resetProgress();assert.deepEqual(state().reading,{});
 w.close();console.log('PASS: state transitions, legacy migration, filters, FAQ, reload/content update, export/import, old backups, reset, and mastery separation');
})().catch(e=>{console.error(e);process.exit(1)});
