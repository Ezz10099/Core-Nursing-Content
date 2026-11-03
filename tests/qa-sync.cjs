const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'runtime/files');
const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{
  url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true
});
const w=dom.window;w.HTMLElement.prototype.scrollIntoView=()=>{};
w.alert=()=>{};w.confirm=()=>true;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
for(const n of ['study-ui','reading','question-marks','exam-core','exam-data',
  'exam-data-01','exam-data-02','exam-data-03','exam-data-04','exam-data-05',
  'exam-data-06','app','notes','exams']){
  vm.runInContext(fs.readFileSync(path.join(base,'js',n+'.js'),'utf8'),dom.getInternalVMContext());
}
const d=w.document,notes=()=>JSON.parse(w.localStorage.getItem('core-nursing-ccu-prototype-v1')).notes;
w.CoreNursingNotes.quickOpen();
d.querySelector('#quickQuestionText').value='What should I assess first?';
w.CoreNursingNotes.quickSave();
assert.equal(notes().length,1);
assert.equal(notes()[0].syncState,'pending');
w.localStorage.setItem('core-nursing-qa-github-token-v1','test_key_not_valid_for_real_github');
w.CoreNursingNotes.render();
assert.match(d.querySelector('#noteCloudSetting').textContent,/not yet verified/);
const calls=[];
w.fetch=async(url,opts)=>{
  calls.push({url,opts});
  if(opts.method==='PUT')return {status:201,ok:true,json:async()=>({content:{sha:'mock_sha'}})};
  if(opts.method==='GET')return {status:404,ok:false,json:async()=>({})};
  throw Error('Unexpected request');
};
(async()=>{
  await w.CoreNursingNotes.sync(true);
  assert.equal(calls.length,2,'Upload then scan answers');
  assert.equal(calls[0].opts.method,'PUT');
  assert(calls[0].url.includes('/contents/inbox/questions/'));
  assert(!Object.keys(calls[0].opts.headers).some(k=>k.toLowerCase()==='x-github-api-version'),
    'Never send unsupported GitHub CORS preflight header');
  assert.equal(calls[0].opts.headers.Authorization,'Bearer test_key_not_valid_for_real_github');
  assert.equal(notes()[0].syncState,'synced');
  assert.match(d.querySelector('#noteCloudSetting').textContent,/verified with GitHub/);
  assert.match(d.querySelector('#noteSyncStatus').textContent,/1 question\(s\) uploaded/);
  w.close();
  console.log('PASS: private GitHub question sync CORS-safe headers, verified connection and offline persistence');
})().catch(e=>{console.error(e);process.exitCode=1;w.close()});
