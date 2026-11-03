const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../runtime/files'),KEY='core-nursing-ccu-prototype-v1';
const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://appassets.androidplatform.net',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;w.HTMLElement.prototype.scrollIntoView=()=>{};w.alert=()=>{};w.confirm=()=>true;
const calls=[];let webFetches=0;
w.fetch=async()=>{webFetches++;throw Error('WebView must not make cross-origin requests')};
w.CoreNursingAndroid={
  getActiveRuntimeVersion:()=>41,checkForContentUpdates:()=>{},
  privateInboxRequest:(id,method,resource,body,key)=>{
    calls.push({id,method,resource,body,key});
    const reply=method==='PUT'
      ? {id,status:201,body:JSON.stringify({content:{sha:'mockcloudsha'}})}
      : {id,status:404,body:'{"message":"Not Found"}'};
    w.CoreNursingNotes.receiveNativeInbox(JSON.stringify(reply));
  }
};
for(const file of ['study-ui','reading','question-marks','exam-core','exam-data','exam-data-01','exam-data-02','exam-data-03','exam-data-04','exam-data-05','exam-data-06','app','notes','exams']){
 vm.runInContext(fs.readFileSync(path.join(base,'js',file+'.js'),'utf8'),dom.getInternalVMContext());
}
const notes=()=>JSON.parse(w.localStorage.getItem(KEY)).notes;
(async()=>{
  w.CoreNursingNotes.quickOpen();
  w.document.getElementById('quickQuestionText').value='Does this change patient priorities?';
  w.CoreNursingNotes.quickSave();
  assert.equal(notes().length,1);
  assert.equal(notes()[0].syncState,'pending');
  w.localStorage.setItem('core-nursing-qa-github-token-v1','github_pat_TEST_TEST_TEST_TEST');
  w.CoreNursingNotes.render();
  await w.CoreNursingNotes.sync(true);
  assert.equal(calls.length,2);
  assert.equal(calls[0].method,'PUT');
  assert.match(calls[0].resource,/^questions\/q-[A-Za-z0-9_-]+\.json$/);
  assert.equal(calls[1].resource,'answers');
  assert.equal(webFetches,0,'Native WebView may not fetch directly');
  assert.equal(notes()[0].syncState,'synced');
  assert.match(w.document.getElementById('noteSyncStatus').textContent,/1 question\(s\) uploaded/);
  assert.match(w.document.getElementById('noteCloudSetting').textContent,/verified/);
  console.log('PASS: native Q&A API bridge uploads offline note without WebView fetch; preserves local copy');
  w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1});
