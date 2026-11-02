const { JSDOM } = require('jsdom');
const { TextEncoder, TextDecoder } = require('node:util');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root=path.resolve(__dirname,'..'), files=path.join(root,'runtime/files');
const KEY='core-nursing-ccu-prototype-v1', tokenKey='core-nursing-qa-github-token-v1';
function boot(saved) {
  const dom=new JSDOM(fs.readFileSync(path.join(files,'index.html'),'utf8'),
    {url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.HTMLElement.prototype.scrollIntoView=()=>{}; w.alert=()=>{};w.confirm=()=>true;
  w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  if(saved)w.localStorage.setItem(KEY,JSON.stringify(saved));
  for(const f of ['study-ui','reading','question-marks','app','notes'])
    vm.runInContext(fs.readFileSync(path.join(files,'js',f+'.js'),'utf8'),dom.getInternalVMContext());
  return w;
}
function state(w) { return JSON.parse(w.localStorage.getItem(KEY)); }
(async()=>{
  const w=boot({bookmarks:['heparin'],attempts:[],reading:{'med:heparin':'read'}}),d=w.document;
  w.showTab('library');w.openMed('heparin');
  const inline=d.querySelector('#detail .inline-question');
  assert(inline,'Medication reader offers a question field');
  inline.querySelector('textarea').value='Why do I monitor for heparin-associated bleeding?';
  inline.querySelector('[data-save-inline]').click();
  let notes=state(w).notes;
  assert.equal(notes.length,1);
  assert.equal(notes[0].answer,'');
  assert.equal(notes[0].sourceType,'med');
  assert.equal(notes[0].sourceId,'heparin');
  assert.equal(state(w).reading['med:heparin'],'read','Reading progress retained');
  w.CoreNursingNotes.open();
  assert.equal(d.querySelectorAll('#noteItems .note-card').length,1);
  assert.equal(d.querySelector('#noteItems .note-card .muted').textContent,'Awaiting an answer');
  w.CoreNursingNotes.edit();
  d.querySelector('#noteDept').value='ed';
  d.querySelector('#noteQuestion').value='What is new numbness after a fracture?';
  w.CoreNursingNotes.saveEditor();
  notes=state(w).notes;
  assert.equal(notes.length,2);
  assert.equal(notes[0].department,'ed');
  assert.equal(notes[0].syncState,'pending');
  const token='github_pat_TEST_NOT_A_REAL_CREDENTIAL';
  d.querySelector('#noteGithubToken').value=token;
  const uploaded=[];
  let answerAvailable=false;
  const response=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
  w.fetch=async(url,opts)=>{
    if(!opts.headers.Authorization.includes(token))throw Error('Auth missing');
    if(opts.method==='PUT'){uploaded.push({url,body:JSON.parse(opts.body)});return response(201,{content:{sha:'qsha'}});}
    if(url.includes('/answers/q-')){
      const id=notes[0].id;
      return response(200,{content:Buffer.from(JSON.stringify({schemaVersion:1,id,answer:'Check the limb and escalate new neurovascular deficits.'})).toString('base64')});
    }
    if(url.includes('/answers?ref=main')){
      if(!answerAvailable)return response(404,{});
      return response(200,[{type:'file',name:notes[0].id+'.json',sha:'asha'}]);
    }
    throw Error('Unexpected URL '+url);
  };
  w.CoreNursingNotes.connect();await new Promise(r=>setTimeout(r,20));
  assert.equal(uploaded.length,2,'Both pending questions uploaded');
  assert(state(w).notes.every(n=>n.syncState==='synced'));
  answerAvailable=true;
  await w.CoreNursingNotes.sync(true);
  assert.equal(state(w).notes[0].answer,'Check the limb and escalate new neurovascular deficits.');
  assert.equal(state(w).notes[0].cloudAnswerSHA,'asha');
  assert.equal(w.localStorage.getItem(tokenKey),token);
  let backup;w.CoreNursingAndroid={saveBackup:s=>backup=s};
  w.exportProgress();assert(backup.includes('neurovascular deficits'));
  assert(!backup.includes(token),'Restricted private cloud credentials never appear in backups');
  assert.equal(state(w).bookmarks[0],'heparin');
  w.CoreNursingNotes.disconnect();
  assert.equal(w.localStorage.getItem(tokenKey),null);
  assert.equal(state(w).notes.length,2,'Disconnect does not delete notes');
  w.close();
  console.log('PASS: in-lesson question capture, offline persistence, metadata, private upload/download, backup credential exclusion, progress preservation');
})().catch(e=>{console.error(e);process.exit(1)});
