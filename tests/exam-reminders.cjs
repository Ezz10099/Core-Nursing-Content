const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const data=new Map(),events=[];
const localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
let permitted=true;
const window={CoreNursingAndroid:{
  scheduleLocalNotification:(...args)=>events.push(['schedule',...args]),
  cancelLocalNotification:id=>events.push(['cancel',id]),
  canPostNotifications:()=>permitted,
  requestNotificationPermission:()=>events.push(['permission']),
},CoreNursingExams:{refresh:()=>{}}};
const context={window,localStorage,Date};vm.runInNewContext(fs.readFileSync('runtime/files/js/exam-reminders.js','utf8'),context);
const reminders=window.CoreNursingExamReminders,at=Date.now()+3*86400000;
const due=[{id:'ccu-furosemide',title:'LASIX',stage:'7-day',at}];
reminders.sync(due);assert.equal(events.length,0,'Reminders are opt-in');
reminders.toggle();assert.equal(events[0][0],'schedule');assert.equal(events[0][1],'core-exam-due:ccu-furosemide');assert.equal(events[0][2],at);
assert(events[0][4].includes('First review'));
events.length=0;reminders.sync([]);assert.deepEqual(events,[['cancel','core-exam-due:ccu-furosemide']]);
reminders.sync(due);events.length=0;reminders.toggle();assert.deepEqual(events,[['cancel','core-exam-due:ccu-furosemide']]);
permitted=false;events.length=0;reminders.toggle();assert(events.some(e=>e[0]==='permission'));assert(!events.some(e=>e[0]==='schedule'));
console.log('PASS: opt-in due reminders, native scheduling, cancellation, and notification permission');
