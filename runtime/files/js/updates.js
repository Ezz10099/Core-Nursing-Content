/* Shared Android/web update discovery and visible status; installation stays in the verified platform updater. */
(function(){
  'use strict';
  const RUNTIME=27, ROOT='https://raw.githubusercontent.com/Ezz10099/Core-Nursing-Content/main/';
  const KEY='core-nursing-update-request', DISMISSED='core-nursing-update-dismissed';
  const PUBLIC_KEY='MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAfKs7X3Y39m6tuUCjV+3x9Bij8MuB+lNPviMihw5qGKQC7UDgZKxojo3upDXZ39yswoz7y0wcfDJhul7udNAdQ==';
  let available=null,busy=false,checking=false,failure='',previousFocus=null,runtimeApplied=0;
  const node=id=>document.getElementById(id);
  const installed=()=>{try{return Math.max(RUNTIME,runtimeApplied,Number(window.CoreNursingAndroid?.getActiveRuntimeVersion?.())||0)}catch(_){return RUNTIME}};
  const contentVersion=()=>syncedContent?.contentVersion||0;
  const versions=()=> 'App features v'+installed()+' · Study content v'+contentVersion();
  function stored(storage,key){try{return storage.getItem(key)}catch(_){return null}}
  function put(storage,key,value){try{storage.setItem(key,value)}catch(_){}}
  const target=()=>available?available.runtime+':'+available.content:'';
  function controls(){
    const button=node('updateButton');if(!button)return;
    button.disabled=busy;button.textContent=busy?'Updating…':available?'Update now':'Check for app & content updates';
    node('updatePanel').setAttribute('aria-busy',String(busy));
    node('updateVersions').textContent=versions();
    node('updateNotice').hidden=!available;
  }
  function status(text){node('syncStatus').textContent=text;controls()}
  function closePopup(){
    node('updatePopup').hidden=true;
    if(available)put(sessionStorage,DISMISSED,target());
    previousFocus?.focus();
  }
  function notify(){
    if(!available||busy||memory.exams?.active||!node('updatePopup').hidden||document.hidden)return;
    if(stored(sessionStorage,DISMISSED)===target())return;
    previousFocus=document.activeElement;
    node('updatePopupText').textContent='A new '+(available.runtime>installed()?'app feature':'study content')+' update is ready. Tap Update now to download and apply it.';
    node('updatePopup').hidden=false;node('popupUpdateNow').focus();
  }
  const bytes=b64=>Uint8Array.from(atob(b64.trim()),c=>c.charCodeAt(0));
  function rawSignature(signature){
    const b=bytes(signature);let i=0;
    const length=()=>{let n=b[i++];if(n&128){const count=n&127;if(count>2)throw Error('Invalid signature');n=0;for(let j=0;j<count;j++)n=(n<<8)|b[i++]}return n};
    if(b[i++]!==48)throw Error('Invalid signature');length();const out=new Uint8Array(64);
    for(let j=0;j<2;j++){if(b[i++]!==2)throw Error('Invalid signature');const n=length();let v=b.slice(i,i+n);i+=n;while(v.length>32&&v[0]===0)v=v.slice(1);if(v.length>32)throw Error('Invalid signature');out.set(v,(j+1)*32-v.length)}
    return out;
  }
  async function signed(path,signal){
    const stamp='?check='+Date.now();
    const responses=await Promise.all([fetch(ROOT+path+stamp,{cache:'no-store',signal}),fetch(ROOT+path.replace(/\.json$/,'.sig')+stamp,{cache:'no-store',signal})]);
    if(responses.some(r=>!r.ok))throw Error('Update check unavailable');
    const [text,signature]=await Promise.all(responses.map(r=>r.text()));
    const key=await crypto.subtle.importKey('spki',bytes(PUBLIC_KEY),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,rawSignature(signature),new TextEncoder().encode(text)))throw Error('Unverified update');
    return JSON.parse(text);
  }
  async function discover(){
    if(checking||busy||navigator.onLine===false||!window.fetch||!window.crypto?.subtle)return;
    checking=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const [manifest,content]=await Promise.all([signed('runtime/runtime-manifest.json',controller.signal),signed('content.json',controller.signal)]);
      if(busy)return;
      if(!Number.isInteger(manifest.runtimeVersion)||manifest.runtimeVersion<1||!Number.isInteger(content.contentVersion)||content.contentVersion<1)throw Error('Invalid update version');
      if(manifest.runtimeVersion>installed()||content.contentVersion>contentVersion()){
        available={runtime:manifest.runtimeVersion,content:content.contentVersion};
        status('Update available. Download the latest app features and study content.');notify();
      }else{available=null;status('No newer app or study-content update found.');}
    }catch(_){if(!available&&!busy)status('Could not check for updates. Your saved app and content are available offline. Try again when connected.');}
    finally{clearTimeout(timeout);checking=false;controls()}
  }
  const originalCheck=checkForUpdates;
  checkForUpdates=function(manual){
    if(busy)return;
    failure='';busy=true;
    put(localStorage,KEY,JSON.stringify({runtime:installed(),content:contentVersion()}));
    status('Checking for app features and study-content updates…');
    try{originalCheck(manual);if(!window.CoreNursingAndroid?.checkForContentUpdates){busy=false;status('Online updates are unavailable in this build.')}}
    catch(_){busy=false;status('Could not start the update. Try again.');}
  };
  const update=window.CoreNursingUpdate,sync=window.CoreNursingSync;
  for(const name of ['checking','runtimeInstalling','runtimeUpdated','engineRequired','failed']){
    const original=update[name];update[name]=function(value){
      original?.(value);
      if(name==='checking'){busy=true;status('Checking for app features and study-content updates…')}
      if(name==='runtimeInstalling'){busy=true;status('App update found. Downloading and installing features v'+value+'…')}
      if(name==='runtimeUpdated'){runtimeApplied=Number(value)||0;status('App features updated to v'+value+'. Checking study content…')}
      if(name==='failed'||name==='engineRequired'){busy=false;failure=node('syncStatus').textContent;controls()}
    };
  }
  const receive=sync.receive;
  sync.receive=function(raw){
    const old=contentVersion(),wasBusy=busy;receive(raw);busy=false;
    // Native startup also delivers already-cached content. It is not an overall update check.
    const rejected=node('syncStatus').textContent.includes('rejected');
    let prior=null;try{prior=JSON.parse(stored(localStorage,KEY)||'null')}catch(_){}
    const updated=runtimeApplied>0||contentVersion()>old||(prior&&installed()>prior.runtime);
    if(failure)status(failure);
    else if(rejected)controls();
    else if(updated){available=null;status('Update installed. '+versions()+'. Ready to use offline.');}
    else if(available)status('Update available. Tap Update now.');
    else status(wasBusy?'Update check finished. '+versions()+'.':'Installed on this device. Check for the latest app and content updates.');
    if(prior&&(wasBusy||updated))put(localStorage,KEY,'null');
    runtimeApplied=0;
  };
  const failed=sync.failed;sync.failed=function(reason){failed(reason);busy=false;controls()};
  node('popupUpdateLater').addEventListener('click',closePopup);
  node('popupUpdateNow').addEventListener('click',()=>{closePopup();checkForUpdates(true)});
  node('updatePopup').addEventListener('keydown',e=>{
    if(e.key==='Escape')closePopup();
    if(e.key==='Tab'){const first=node('popupUpdateNow'),last=node('popupUpdateLater');if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
  });
  window.CoreNursingUpdates={discover,closePopup};
  status('Installed on this device. Check for the latest app and content updates.');
  setTimeout(discover,1500);
  window.addEventListener('online',discover);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)discover()});
  setInterval(()=>{if(!document.hidden){notify();discover()}},5*60*1000);
})();
