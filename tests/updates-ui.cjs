const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'runtime/files');
const content=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),publicKey=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
function boot(){
 const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://test.local',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.alert=()=>{};w.confirm=()=>true;w.TextEncoder=TextEncoder;
 Object.defineProperty(w.crypto,'subtle',{value:crypto.webcrypto.subtle});
 let installs=0;w.CoreNursingAndroid={getActiveRuntimeVersion:()=>27,checkForContentUpdates:()=>{installs++;w.CoreNursingUpdate.checking()},hasCapability:()=>false};
 for(const name of ['study-ui','reading','question-marks','exam-core','exam-data','exam-data-01','exam-data-02','exam-data-03','exam-data-04','exam-data-05','app','exams'])vm.runInContext(fs.readFileSync(path.join(base,'js',name+'.js'),'utf8'),dom.getInternalVMContext());
 w.CoreNursingSync.receive(JSON.stringify(content));
 const code=fs.readFileSync(path.join(base,'js/updates.js'),'utf8').replace(/const PUBLIC_KEY='[^']+';/,"const PUBLIC_KEY='"+publicKey+"';");
 vm.runInContext(code,dom.getInternalVMContext());
 return {w,dom,installs:()=>installs};
}
function network(w,runtime,cv,corrupt=false){
 const payloads={'runtime/runtime-manifest.json':JSON.stringify({runtimeVersion:runtime,minEngineVersion:2}), 'content.json':JSON.stringify({...content,contentVersion:cv})};
 w.fetch=async url=>{
  const p=url.split('/main/')[1].split('?')[0],json=p.replace(/\.sig$/,'.json');
  let text=p.endsWith('.sig')?crypto.sign('sha256',Buffer.from(payloads[json]),pair.privateKey).toString('base64'):payloads[p];
  if(corrupt&&p==='runtime/runtime-manifest.json')text=JSON.stringify({runtimeVersion:999});
  return {ok:true,text:async()=>text};
 };
}
(async()=>{
 let b=boot(),w=b.w,d=w.document;
 assert.equal(d.querySelector('#home').firstElementChild.id,'updatePanel');
 assert.equal(d.querySelector('#updateButton').textContent,'Check for app & content updates');
 w.CoreNursingSync.receive(JSON.stringify(content));
 assert(!d.querySelector('#syncStatus').textContent.includes('Already up to date'));
 assert(d.querySelector('#updateVersions').textContent.includes('App features v27'));
 network(w,28,content.contentVersion);await w.CoreNursingUpdates.discover();
 assert(!d.querySelector('#updatePopup').hidden);assert.equal(b.installs(),0,'Detection must not install or reload without tapping');
 assert.equal(d.activeElement.id,'popupUpdateNow');assert.equal(d.querySelector('#updateButton').textContent,'Update now');
 d.querySelector('#popupUpdateLater').click();assert(d.querySelector('#updatePopup').hidden);
 await w.CoreNursingUpdates.discover();assert(d.querySelector('#updatePopup').hidden,'Do not repeat a dismissed popup for the same release');
 w.checkForUpdates(true);assert.equal(b.installs(),1);assert(d.querySelector('#updateButton').disabled);
 w.CoreNursingUpdate.runtimeUpdated(28);w.CoreNursingSync.receive(JSON.stringify(content));
 assert(!d.querySelector('#updateButton').disabled);w.close();
 b=boot();w=b.w;d=w.document;network(w,27,content.contentVersion);await w.CoreNursingUpdates.discover();
 assert(d.querySelector('#updatePopup').hidden);assert(d.querySelector('#syncStatus').textContent.includes('No newer app or study-content'));
 network(w,28,content.contentVersion,true);await w.CoreNursingUpdates.discover();assert(d.querySelector('#updatePopup').hidden);assert(d.querySelector('#syncStatus').textContent.includes('Could not check'));
 network(w,27,content.contentVersion+1);await w.CoreNursingUpdates.discover();assert(!d.querySelector('#updatePopup').hidden);d.querySelector('#popupUpdateNow').click();assert.equal(b.installs(),1);
 w.CoreNursingUpdate.failed('Network error');w.CoreNursingSync.receive(JSON.stringify(content));assert(d.querySelector('#syncStatus').textContent.includes('failed'));assert(!d.querySelector('#updateButton').disabled);w.close();
 b=boot();w=b.w;d=w.document;w.CoreNursingExams.open('heparin');w.CoreNursingExams.start('standard');const before=JSON.stringify(w.localStorage);
 network(w,28,content.contentVersion);await w.CoreNursingUpdates.discover();assert(d.querySelector('#updatePopup').hidden,'Never interrupt an active exam with an update popup');assert(!d.querySelector('#updateNotice').hidden);assert.equal(JSON.stringify(w.localStorage),before);w.close();
 console.log('PASS: prominent update control, separate app/content versions, signed discovery, popup/focus/dismissal, explicit installation, failed/offline checks, and no exam interruption');
})().catch(error=>{console.error(error);process.exit(1)});
