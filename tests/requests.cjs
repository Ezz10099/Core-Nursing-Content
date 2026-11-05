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
  let w=boot({bookmarks:[],attempts:[],notes:[{id:'q-legacy',question:'Old question',answer:'',department:'general',syncState:'pending',createdAt:'2026-01-01',updatedAt:'2026-01-01'}]}),d=w.document;
  w.CoreNursingNotes.open();w.CoreNursingNotes.edit('q-legacy');
  assert.equal(d.querySelector('#noteKind').value,'question');
  d.querySelector('#noteKind').value='request';d.querySelector('#noteKind').dispatchEvent(new w.Event('change',{bubbles:true}));
  d.querySelector('#noteRelated').value='content';w.CoreNursingNotes.saveEditor();
  assert.equal(state(w).notes[0].id,'q-legacy');assert.equal(state(w).notes[0].kind,'request');
  w.showTab('home');w.CoreNursingNotes.quickOpen();
  const field=d.querySelector('#quickQuestionText'),kind=d.querySelector('#quickQuestionKind');
  assert.equal(kind.value,'question');field.value='Please remove this useless paragraph';field.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(kind.value,'request');assert.equal(d.querySelector('#quickQuestionRelated').closest('label').hidden,false);
  kind.value='question';kind.dispatchEvent(new w.Event('change',{bubbles:true}));field.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(kind.value,'question','Manual type is respected');
  kind.value='request';kind.dispatchEvent(new w.Event('change',{bubbles:true}));d.querySelector('#quickQuestionRelated').value='app';
  w.CoreNursingNotes.quickClose();w.CoreNursingNotes.quickOpen();assert.equal(kind.value,'request','Draft type preserved');
  w.CoreNursingNotes.quickSave();
  let n=state(w).notes[0];assert.equal(n.kind,'request');assert.equal(n.relatedTo,'app');assert.equal(n.sourceTitle,'Home');
  w.CoreNursingNotes.open();d.querySelector('#noteKindFilter').value='request';w.CoreNursingNotes.render();assert.equal(d.querySelectorAll('.note-card').length,2);
  d.querySelector('#noteKindFilter').value='question';w.CoreNursingNotes.render();assert.equal(d.querySelectorAll('.note-card').length,0);
  w.CoreNursingNotes.quickOpen();field.value='When should I remove a catheter?';field.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(kind.value,'question','Clinical question not treated as deletion request');w.CoreNursingNotes.quickSave();
  const uploaded=[];w.localStorage.setItem(tokenKey,'github_pat_TEST');
  w.fetch=async(url,opts)=>{if(opts.method==='PUT'){uploaded.push(JSON.parse(Buffer.from(JSON.parse(opts.body).content,'base64').toString()));return {ok:true,status:201,json:async()=>({content:{sha:'test'}})}}return {ok:false,status:404,json:async()=>({})}};
  await w.CoreNursingNotes.sync(true);assert(uploaded.some(x=>x.kind==='request'&&x.relatedTo==='app'));
  const saved=state(w);w.close();w=boot(saved);w.CoreNursingNotes.open();assert.equal(state(w).notes.filter(x=>x.kind==='request').length,2);w.close();
  console.log('PASS: request classification, manual override, draft, filters, legacy edit, offline restart and private sync metadata');
})().catch(e=>{console.error(e);process.exit(1)});
