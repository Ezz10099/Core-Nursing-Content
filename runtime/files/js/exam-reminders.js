/* Optional Android reminders for exams whose due dates are stored in progress. */
(function(root){
  'use strict';
  const ENABLED='core-nursing-exam-reminders-enabled-v1';
  const SCHEDULED='core-nursing-exam-reminders-scheduled-v1';
  const bridge=()=>root.CoreNursingAndroid;
  const available=()=>typeof bridge()?.scheduleLocalNotification==='function'&&typeof bridge()?.cancelLocalNotification==='function';
  const notificationId=id=>'core-exam-due:'+id;
  const readScheduled=()=>{try{return JSON.parse(localStorage.getItem(SCHEDULED)||'{}')||{}}catch(_){return {}}};
  const enabled=()=>{try{return localStorage.getItem(ENABLED)==='true'}catch(_){return false}};
  const allowed=()=>{try{return typeof bridge()?.canPostNotifications!=='function'||bridge().canPostNotifications()}catch(_){return false}};
  let current=[];
  function sync(items){
    current=items.filter(x=>x&&typeof x.id==='string'&&Number.isFinite(x.at)&&typeof x.title==='string');
    if(!available())return;
    const old=readScheduled(),next={},time=Date.now();
    if(enabled()&&allowed())for(const item of current){
      if(item.at<=time)continue;
      const id=notificationId(item.id);
      try{
        bridge().scheduleLocalNotification(id,item.at,'Core Nursing · Exam due',item.title+' · '+(item.stage==='7-day'?'First review':item.stage==='21-day'?'21-day review':'Exam')+' is ready.');
        next[item.id]=item.at;
      }catch(_){}
    }
    for(const id of Object.keys(old))if(!Object.prototype.hasOwnProperty.call(next,id)){
      try{bridge().cancelLocalNotification(notificationId(id))}catch(_){}
    }
    try{localStorage.setItem(SCHEDULED,JSON.stringify(next))}catch(_){}
  }
  function toggle(){
    if(!available())return;
    const next=!enabled();
    try{localStorage.setItem(ENABLED,String(next))}catch(_){return}
    if(next&&!allowed())try{bridge().requestNotificationPermission?.()}catch(_){}
    sync(current);
    root.CoreNursingExams?.refresh();
  }
  function controls(){
    if(!available())return '<div class="panel"><h2>Exam reminders</h2><p>Due exams stay listed here. Device alerts are available in the Android app.</p></div>';
    return '<div class="panel"><h2>Exam reminders</h2><p>'+(enabled()?(allowed()?'On · future due exams will trigger a device reminder.':'Allow Core Nursing notifications in Android settings, then reopen Exams.'):'Off · due exams still appear here.')+'</p><button type="button" onclick="CoreNursingExamReminders.toggle()">'+(enabled()?'Turn off reminders':'Turn on reminders')+'</button></div>';
  }
  root.CoreNursingExamReminders={sync,toggle,controls,enabled};
})(window);
