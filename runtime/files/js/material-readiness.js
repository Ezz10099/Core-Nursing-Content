/* Authoring status is never inferred from reading, answers or exam passes. */
(function(){
  'use strict';
  const data=window.CoreNursingReadinessData||{items:{}},examData=window.CoreNursingExamData||{banks:[],aliases:{}};
  const banks=new Map(examData.banks.map(b=>[b.itemId,b]));
  const labels={complete:'مكتمل',in_review:'قيد المراجعة',not_reviewed:'بانتظار المراجعة'};
  let filter='complete',kind='all',term='',limit=6;
  const canonical=id=>examData.aliases?.[id]||id;
  function status(id){
    const requestedId=id;id=canonical(id);const record=data.items[id],bank=banks.get(id);
    if(!record||!bank)return 'not_reviewed';
    if(record.status!=='complete')return record.status==='in_review'?'in_review':'not_reviewed';
    const form=bank.exams[0];
    if(record.bankVersion!==bank.bankVersion||record.correctionRevision!==(form.correctionRevision||'')||JSON.stringify(record.readingSectionIds)!==JSON.stringify(bank.readingSections.map(s=>s.id)))return 'in_review';
    // An independently downloaded teaching-content update may be newer than
    // the reviewed offline bank. It must not retain a stale completion label.
    const live=bank.itemType==='lesson'?(typeof lessons!=='undefined'?lessons.find(x=>x.id===id):null):(typeof meds!=='undefined'?(meds.find(x=>x.id===requestedId)||meds.find(x=>x.id===id)||meds.find(x=>canonical(x.id)===id)):null);
    const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
    if(live&&Object.entries(bank.sourceFields).some(([key,value])=>stable(live[key]??'')!==stable(value)))return 'in_review';
    return 'complete';
  }
  function study(id){const b=banks.get(canonical(id));if(!b)return;if(b.itemType==='medication'&&typeof meds!=='undefined'){const item=meds.find(x=>x.id===b.itemId);if(item){showTab('library');openMed(item.id);return;}}CoreNursingExams.material(id);}
  function rows(){return [...banks.values()].filter(b=>!b.capabilityRequirement||nativeHasCapability(b.capabilityRequirement));}
  function badge(id){const el=document.createElement('span');el.className='material-readiness-badge';el.lang='ar';el.dir='rtl';el.dataset.readiness=status(id);el.textContent='إعداد المادة: '+labels[status(id)];return el;}
  function decorate(){
    for(const target of ['list','lessonList'])for(const card of document.getElementById(target)?.querySelectorAll('.item')||[]){
      const click=card.querySelector('button[onclick]')?.getAttribute('onclick')||'';
      const match=click.match(/^open(?:Med|Lesson)\('([^']+)'\)/);if(!match)continue;
      const old=card.querySelector('.material-readiness-badge'),next=status(match[1]);
      if(!old)card.querySelector('h2')?.after(badge(match[1]));else if(old.textContent!=='إعداد المادة: '+labels[next]){old.textContent='إعداد المادة: '+labels[next];old.dataset.readiness=next;}
    }
    for(const [target,id] of [['detail',typeof current!=='undefined'?current:null],['lessonDetail',null]]){
      // The reader supplies its material ID; learner progress is not used.
      const root=document.getElementById(target);if(!root||root.classList.contains('hidden'))continue;
      let item=id;
      if(target==='lessonDetail')item=root.dataset.readinessItemId;
      if(!item)continue;const old=root.querySelector('.material-readiness-badge'),next=status(item);
      if(!old)root.querySelector('.reader-intro h1,.reader-intro h2,h1,h2')?.after(badge(item));else if(old.textContent!=='إعداد المادة: '+labels[next]){old.textContent='إعداد المادة: '+labels[next];old.dataset.readiness=next;}
    }
  }
  function render(){
    const host=document.getElementById('materialReadiness');if(!host)return;
    const all=rows(),typed=all.filter(b=>kind==='all'||b.itemType===kind),counts={complete:0,in_review:0,not_reviewed:0};
    for(const b of typed)counts[status(b.itemId)]++;
    const matches=typed.filter(b=>status(b.itemId)===filter&&b.title.toLocaleLowerCase().includes(term));
    const heading=host.querySelector('[data-readiness-filters]');heading.replaceChildren();
    for(const key of Object.keys(labels)){const button=document.createElement('button');button.type='button';button.dataset.status=key;button.setAttribute('aria-pressed',String(key===filter));button.textContent=labels[key]+' ('+counts[key]+')';button.addEventListener('click',()=>select(key));heading.append(button);}
    host.querySelector('.readiness-search').hidden=!term&&!all.some(b=>status(b.itemId)===filter);
    const list=host.querySelector('[data-readiness-list]');list.replaceChildren();
    if(!matches.length){const note=document.createElement('p');note.className='note material-readiness-empty';note.textContent=term?'لا توجد مواد مطابقة للبحث.':filter==='complete'?'لم تُعتمد أي مادة مكتملة المراجعة بعد.':'لا توجد مواد في هذه الخانة.';list.append(note);}
    if(filter==='in_review'&&matches.length){const note=document.createElement('p');note.className='note';note.textContent='يمكنك دراسة النسخة الحالية؛ مراجعة هذه المواد لم تكتمل.';list.append(note);}
    for(const b of matches.slice(0,limit)){
      const card=document.createElement('article');card.className='material-readiness-card';card.dataset.itemId=b.itemId;
      const type=document.createElement('span');type.className='note';type.textContent=b.itemType==='medication'?'دواء':'درس';
      const title=document.createElement('h3');title.dir='auto';title.textContent=b.title;
      const actions=document.createElement('div');actions.className='tools';
      for(const [label,fn] of [['دراسة',()=>study(b.itemId)],['الامتحان',()=>CoreNursingExams.launch(b.itemId)]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',fn);actions.append(button);}
      card.append(type,title,actions);list.append(card);
    }
    const more=host.querySelector('[data-readiness-more]');more.hidden=matches.length<=limit;more.textContent='عرض المزيد ('+Math.max(0,matches.length-limit)+')';
    for(const [id,type] of [['completedMedsLink','medication'],['completedLessonsLink','lesson']]){const button=document.getElementById(id);if(button)button.textContent='مكتمل ('+all.filter(b=>b.itemType===type&&status(b.itemId)==='complete').length+')';}
  }
  function select(value){if(!Object.hasOwn(labels,value))return;filter=value;limit=6;render();}
  function open(value='complete',type='all'){kind=['all','medication','lesson'].includes(type)?type:'all';filter=Object.hasOwn(labels,value)?value:'complete';term='';limit=6;const host=document.getElementById('materialReadiness');host.querySelector('input').value='';host.querySelector('select').value=kind;showTab('home');render();requestAnimationFrame(()=>{const pane=studyPane();scrollStudyTo(0,pane.scrollTop+host.getBoundingClientRect().top-pane.getBoundingClientRect().top-12);host.focus({preventScroll:true});});}
  const host=document.getElementById('materialReadiness');if(!host)return;
  host.querySelector('input').addEventListener('input',event=>{term=event.target.value.trim().toLocaleLowerCase();limit=6;render();});
  host.querySelector('select').addEventListener('change',event=>{kind=event.target.value;limit=6;render();});
  host.querySelector('[data-readiness-more]').addEventListener('click',()=>{limit+=12;render();});
  window.CoreNursingReadiness={status,open,select,refresh:()=>{render();decorate();},decorate};
  const observer=new MutationObserver(decorate);for(const id of ['list','lessonList','detail','lessonDetail']){const node=document.getElementById(id);if(node)observer.observe(node,{childList:true,subtree:true});}
  render();decorate();
})();
