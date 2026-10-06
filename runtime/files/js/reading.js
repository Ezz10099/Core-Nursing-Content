'use strict';
// Independent reading history: never modifies quiz attempts or mastery evidence.
const readingFilters={med:'all',lesson:'all',faq:'all'};
function normalizeReading(value){
  const result={};
  if(!value||typeof value!=='object'||Array.isArray(value))return result;
  for(const [key,entry] of Object.entries(value)){
    if(!/^(med|lesson|faq):.+$/.test(key)||!entry||!['in-progress','read'].includes(entry))continue;
    result[key]=entry;
  }
  return result;
}
function readingState(type,id){return memory.reading[type+':'+id]||'unread'}
function readingLabel(state){return {'unread':'⚪ Not read','in-progress':'🟡 In progress',read:'✅ Read'}[state]}
function readingBadge(type,id){return '<span class="reading-badge" data-reading-key="'+safe(type+':'+id)+'">'+readingLabel(readingState(type,id))+'</span>'}
function readingControl(type,id){return '<div class="reading-control" data-reading-type="'+safe(type)+'" data-reading-id="'+safe(id)+'">'+readingBadge(type,id)+'<button type="button" onclick="toggleReading(this.parentElement)">'+(readingState(type,id)==='read'?'Mark as unread':'Mark as read')+'</button></div>'}
function recordOpened(type,id){
  if(readingState(type,id)!=='unread')return;
  memory.reading[type+':'+id]='in-progress';save();refreshReading();
}
function toggleReading(node){
  const {readingType:type,readingId:id}=node.dataset,key=type+':'+id;
  if(readingState(type,id)==='read')delete memory.reading[key];
  else memory.reading[key]='read';
  save();refreshReading();
}
function faqReadingOpened(node){if(node.open)recordOpened('faq',node.dataset.readingFaq)}
function readingMatches(type,id){const filter=readingFilters[type],state=readingState(type,id);return filter==='all'||(filter==='unread'?state!=='read':state===filter)}
function setReadingFilter(type,value){
  if(!Object.prototype.hasOwnProperty.call(readingFilters,type)||!['all','unread','in-progress','read'].includes(value))return;
  readingFilters[type]=value;
  if(type==='med'){closeMed();renderList()}else if(type==='lesson'){closeLesson()}else renderFaq();
}
function readingCount(items,type){return items.filter(x=>readingState(type,x.id)==='read').length+' / '+items.length+' read'}
function readingFilterHtml(type,items,label){return '<p class="reading-count">'+safe(label)+': '+readingCount(items,type)+'</p><div class="reading-filters" role="group" aria-label="'+safe(label)+' reading filter">'+[['all','All'],['unread','Unread'],['in-progress','In progress'],['read','Read']].map(([key,text])=>'<button aria-pressed="'+(readingFilters[type]===key)+'" onclick="setReadingFilter(\''+type+'\',\''+key+'\')">'+text+'</button>').join('')+'</div>'}
function readingCatalog(){return [...meds.map(x=>({type:'med',id:x.id,title:x.name})),...lessons.map(x=>({type:'lesson',id:x.id,title:x.title})),...Array.from(new Map(allRemoteFaqs().map(x=>[x.id,x])).values()).map(x=>({type:'faq',id:x.id,title:x.question}))]}
function openReadingItem(button){
  const {readingType:type,readingId:id}=button.dataset;
  if(type==='med'){showTab('library');openMed(id)}
  else if(type==='lesson'){showTab('clinical');openLesson(id)}
  else{
    const q=allRemoteFaqs().find(x=>x.id===id);if(!q)return;
    readingFilters.faq='all';
    if(q.placement==='medication'){
      const medId=(q.relatedMeds||[]).find(id=>meds.some(m=>m.id===id));if(!medId)return;
      showTab('library');openMed(medId);
    }else{showTab('clinical');setClinicalDepartment(faqDepartment(q))}
    const container=byId(q.placement==='medication'?'detail':'clinicalFaqItems');
    const node=Array.from(container.querySelectorAll('[data-reading-faq]')).find(n=>n.dataset.readingFaq===id);
    if(node){node.open=true;recordOpened('faq',id);node.scrollIntoView({block:'start'})}
  }
}
function refreshReading(){
  const med=byId('reading-med'),lesson=byId('reading-lesson'),faq=byId('reading-faq');
  if(med)med.innerHTML=readingFilterHtml('med',meds.filter(x=>catalogFilter==='all'||medHasCategory(x,catalogFilter)),'Medications');
  if(lesson)lesson.innerHTML=readingFilterHtml('lesson',lessons.filter(x=>lessonDepartment(x)===clinicalDepartment),clinicalDepartmentName()+' Lessons');
  const medfaq=byId('reading-medfaq');if(medfaq&&current)medfaq.innerHTML=readingFilterHtml('faq',medicationFaqItems(current),'Medication FAQ');
  if(faq)faq.innerHTML=readingFilterHtml('faq',clinicalFaqItems(),clinicalDepartmentName()+' FAQ');
  document.querySelectorAll('[data-reading-key]').forEach(node=>{node.textContent=readingLabel(memory.reading[node.dataset.readingKey]||'unread')});
  document.querySelectorAll('.reading-control').forEach(node=>{node.querySelector('button').textContent=readingState(node.dataset.readingType,node.dataset.readingId)==='read'?'Mark as unread':'Mark as read'});
  const catalog=readingCatalog(),unfinished=catalog.filter(x=>readingState(x.type,x.id)==='in-progress');
  const home=byId('continue-reading');
  if(home)home.innerHTML='<h2>Continue Reading</h2><p class="note">Opened items you have not marked as read. Reading does not establish mastery.</p>'+(unfinished.length?unfinished.map(x=>'<button class="continue-item" data-reading-type="'+x.type+'" data-reading-id="'+safe(x.id)+'" onclick="openReadingItem(this)"><span>'+safe(x.type==='med'?'Medication':x.type==='faq'?'FAQ':'Lesson')+'</span>'+safe(x.title)+'</button>').join(''):'<p class="muted">No unfinished items yet.</p>');
  const overall=byId('reading-overall');
  if(overall)overall.innerHTML='<h2>Reading progress</h2><p>'+catalog.filter(x=>readingState(x.type,x.id)==='read').length+' / '+catalog.length+' read overall</p>'+[['med','Medications'],['lesson','Lessons'],['faq','FAQ']].map(([type,label])=>'<p>'+label+': '+readingCount(catalog.filter(x=>x.type===type),type)+'</p>').join('')+'<p class="note">Read ≠ Mastered. Completion records reading only; testing and mastery remain separate.</p>';
}
