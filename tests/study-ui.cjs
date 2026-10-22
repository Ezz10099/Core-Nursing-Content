// Functional regression coverage for the shared Android/web study presentation.
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'runtime/files'),KEY='core-nursing-ccu-prototype-v1';
const content=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
function boot(saved){
 const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){w.lastJump=this};w.alert=()=>{};w.confirm=()=>true;
 if(saved)w.localStorage.setItem(KEY,saved);
 for(const file of ['js/study-ui.js','js/reading.js','js/question-marks.js','js/app.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext());
 w.CoreNursingSync.receive(JSON.stringify(content));return w;
}
(async()=>{
 let w=boot(),d=w.document,state=()=>JSON.parse(w.localStorage.getItem(KEY));
 assert.equal(d.querySelector('#continue-reading').closest('#home').id,'home');
 assert(!d.querySelector('#legacyUpgradeBanner #continue-reading'));
 assert.equal(d.documentElement.dataset.theme,'dark');
 w.toggleStudyTheme();w.changeStudyText(0.1);
 assert.equal(state().theme,'light');assert.equal(state().readerScale,1.1);
 w.showTab('clinical');
 // Every lesson retains every supplied content section; existing recall answers stay closed.
 for(const lesson of content.lessons){
  w.openLesson(lesson.id);
  assert(d.body.classList.contains('reading-view'));
  assert.equal(d.querySelectorAll('#lessonDetail [data-study-section]').length,lesson.sections.length);
  assert.equal(d.querySelectorAll('#lessonDetail .toc-links button').length,lesson.sections.length);
  lesson.sections.forEach((s,i)=>{
   const node=d.querySelector('#lessonDetail [data-study-section="'+i+'"]');
   assert(node.textContent.includes(s.label));
   if(s.display==='split'){assert(node.textContent.includes(s.leftText));assert(node.textContent.includes(s.rightText))}
   else if(s.display==='hero')assert.equal(node.querySelector('.hero-line').textContent,s.text.replace(/\\+n|\n/g,''));
   else if(s.text.includes('•'))assert.equal(node.querySelectorAll('li').length,s.text.split('•').length-1);
   else assert(node.textContent.includes(s.text));
   if(s.display==='reveal')assert.equal(node.open,false);
  });
 }
 const finalId=content.lessons.at(-1).id;
 const jumpIndex=Math.min(8,content.lessons.at(-1).sections.length-1);
 w.jumpStudySection(jumpIndex);await new Promise(r=>w.requestAnimationFrame(r));assert.equal(w.lastJump.dataset.studySection,String(jumpIndex));
 w.toggleReading(d.querySelector('#lessonDetail .reader-finish .reading-control'));
 assert.equal(state().reading['lesson:'+finalId],'read');
 assert.equal(d.querySelector('#lessonDetail .reading-control button').textContent,'Mark as unread');
 w.closeLesson();assert(!d.body.classList.contains('reading-view'));
 w.showTab('library');w.openMed('heparin');
 assert(d.body.classList.contains('reading-view'));assert.equal(d.querySelectorAll('#detail [data-study-section]').length,7);
 w.jumpStudySection(4);await new Promise(r=>w.requestAnimationFrame(r));assert.equal(w.lastJump.open,true);
 w.showTab('progress');assert(!d.body.classList.contains('reading-view'));
 w.showTab('library');assert(d.body.classList.contains('reading-view'));w.closeMed();assert(!d.body.classList.contains('reading-view'));
 assert.equal(state().attempts.length,0);assert.deepEqual(state().bookmarks,[]);
 const saved=w.localStorage.getItem(KEY);w.close();w=boot(saved);d=w.document;
 assert.equal(d.documentElement.dataset.theme,'light');assert.equal(d.documentElement.style.getPropertyValue('--reader-scale'),'1.1');
 assert.equal(state().reading['lesson:'+finalId],'read');
 for(let i=0;i<10;i++)w.changeStudyText(0.1);assert.equal(state().readerScale,1.3);
 for(let i=0;i<10;i++)w.changeStudyText(-0.1);assert.equal(state().readerScale,1);
 w.close();console.log('PASS: all lesson content, numbered sections, hidden recall answers, contents navigation, reader state, completion controls, themes, text-size persistence, and mastery separation');
})().catch(e=>{console.error(e);process.exit(1)});
