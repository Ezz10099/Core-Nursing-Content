(function(){
  'use strict';
  const Core=window.CoreNursingExamCore, data=window.CoreNursingExamData;
  if(!Core||!data)return;
  const banks=new Map(data.banks.map(b=>[b.itemId,b]));
  let reviewing=false,reviewFilter='all',examListFilter=null,examSearch='';
  let selected=null,resultView=null,safetyMode=false,safetyAnswers={},timer=null,viewingExam=false;
  const state=()=>memory.exams, record=id=>state().items[id]||{attempts:[],reads:[],readingAfter:null,pendingSafety:[],due:null}, now=()=>Date.now();
  const canonical=id=>data.aliases[id]||id;
  const bankFor=id=>banks.get(canonical(id));
  const date=x=>new Date(x).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const label=stage=>({'comprehensive':'Comprehensive','standard':'Standard (previous system)','advanced':'Advanced (previous system)','7-day':'7-day','21-day':'21-day'}[stage]||stage)+' exam';
  const allowed=bank=>!bank.capabilityRequirement||nativeHasCapability(bank.capabilityRequirement);
  function changed(bank){
    const source=bank.itemType==='lesson'?lessons.find(x=>x.id===bank.itemId):meds.find(x=>x.id===bank.itemId);
    if(!source)return false; // The exact taught source is also packaged for offline reading.
    const stable=x=>JSON.stringify(x,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
    return Object.entries(bank.sourceFields).some(([key,value])=>stable(source[key]??'')!==stable(value));
  }
  function persist(){save();const warning=byId('examSaveWarning');if(warning)warning.hidden=persistence}
  function saveState(){persist();refreshDashboards()}
  function stageResult(bank,stage){
    const attempts=record(bank.itemId).attempts.filter(a=>a.stage===stage);
    if(attempts.some(a=>a.completedAt))return 'Passed';
    if(attempts.some(a=>a.passed))return 'Score passed; safety follow-up required';
    return '';
  }
  function status(bank){
    const r=record(bank.itemId),latest=r.attempts.slice(-1)[0],parts=[];
    const highest=['21-day','7-day','comprehensive','advanced','standard'].find(stage=>r.attempts.some(a=>a.stage===stage&&a.completedAt));
    if(highest)parts.push(label(highest)+' passed.');
    if(latest)parts.push(label(latest.stage)+': '+latest.correct+'/'+latest.total+' ('+(100*latest.correct/latest.total).toFixed(1)+'%).');
    if(r.pendingSafety.length)parts.push('Safety follow-up required.');
    const left=Core.readingRemaining(r,bank.readingSections).length;

    if(r.due)parts.push(label(r.due.stage)+(r.due.at<=now()?' due: ':' scheduled: ')+date(r.due.at)+'.');
    return parts.join(' ')||'No exam attempts.';
  }

  function action(bank){
    const r=record(bank.itemId),a=state().active;
    if(a?.itemId===bank.itemId)return {text:'Continue exam',kind:'resume',group:'available'};
    const group=r.due&&r.due.at<=now()?'due':'available';
    if(changed(bank))return {text:'Review updated material',kind:'read',group};
    if(r.pendingSafety.length)return {text:'Complete safety check',kind:'safety',group};

    if(r.due){
      if(r.due.at>now()||!bank.exams.some(e=>e.stage===r.due.stage))return {text:'View schedule',kind:'view',group:'upcoming',note:label(r.due.stage)+' · '+date(r.due.at)+(!bank.exams.some(e=>e.stage===r.due.stage)?' · Questions pending':'')};
      return {text:'Take '+label(r.due.stage),kind:'start',stage:r.due.stage,group:'due'};
    }
    if(r.attempts.some(a=>a.stage==='21-day'&&a.completedAt))return {text:'View results',kind:'view',group:'passed'};
    const stage='comprehensive';
    const access=Core.eligible({...state(),items:{...state().items}},bank.itemId,stage,bank.readingSections,now(),Core.MODEL);
    return {text:access.ok?'Start '+label(stage):'View requirements',kind:access.ok?'start':'view',stage,group:access.unlockAt?'upcoming':'available',note:access.ok?'':access.reason};
  }
  function launch(id){const bank=bankFor(id);if(!bank)return;const a=action(bank);if(a.kind==='resume'){resume();return}open(id);if(a.kind==='start')start(a.stage);else if(a.kind==='safety')safety();else if(a.kind==='read')byId('examSession').querySelector('.exam-source')?.scrollIntoView({block:'start'});}
  function reviewRows(){
    const rows=[];
    for(const bank of banks.values())if(allowed(bank))for(const attempt of record(bank.itemId).attempts)for(const response of attempt.responses||[])if(!response.correct||response.unsure){
      let q=attempt.reviewQuestions?.find(q=>q.id===response.questionId);
      if(!q&&attempt.bankVersion===bank.bankVersion)q=[...bank.exams,...(bank.legacyExams||[])].flatMap(e=>e.questions).find(q=>q.id===response.questionId);
      if(!q&&attempt.bankVersion===bank.legacyBankVersion)q=(bank.legacyExams||[]).flatMap(e=>e.questions).find(q=>q.id===response.questionId);
      if(!q&&record(bank.itemId).comprehensiveBankVersion===attempt.bankVersion)q=record(bank.itemId).comprehensiveForm?.questions.find(q=>q.id===response.questionId);
      if(!q&&record(bank.itemId).standardBankVersion===attempt.bankVersion)q=record(bank.itemId).standardForm?.questions.find(q=>q.id===response.questionId);
      rows.push({bank,attempt,response,q});
    }
    return rows.sort((a,b)=>b.attempt.finishedAt-a.attempt.finishedAt);
  }
  function material(id){
    const bank=bankFor(id);if(!bank)return;
    const item=bank.itemType==='lesson'?lessons.find(x=>x.id===bank.itemId):meds.find(x=>canonical(x.id)===bank.itemId);
    if(!item){open(id);return}
    if(bank.itemType==='lesson'){showTab('clinical');openLesson(item.id)}else{showTab('library');openMed(item.id)}
  }
  function review(){showTab('practice');reviewing=true;selected=null;resultView=null;viewingExam=false;render();scrollStudyTo(0,0);}
  function renderReview(node){
    const all=reviewRows(),rows=all.filter(x=>reviewFilter==='all'||(reviewFilter==='unsure'?x.response.unsure:!x.response.correct));
    node.innerHTML='<button class="back" onclick="CoreNursingExams.catalog()">← All exams</button><div class="panel"><h2>Review answers · '+all.length+'</h2><p class="note">Saved incorrect and unsure answers. Reviewing keeps scores and due dates unchanged.</p><div class="exam-filters" role="group" aria-label="Review filter">'+[['all','All'],['incorrect','Incorrect'],['unsure','Unsure']].map(([key,text])=>'<button aria-pressed="'+(key===reviewFilter)+'" onclick="CoreNursingExams.reviewFilter(\''+key+'\')">'+text+'</button>').join('')+'</div></div>'+(rows.length?rows.map(({bank,attempt,response,q})=>'<article class="panel review-answer"><h3>'+safe(bank.title)+'</h3><p class="note">'+safe(label(attempt.stage))+' · '+safe(date(attempt.finishedAt))+' · '+(response.correct?'Correct':'Incorrect')+(response.unsure?' · Unsure / guessed':'')+'</p>'+(q?feedback(q,response):'<p>The original question text is unavailable for this older attempt. Its saved answer and flag are preserved.</p>')+'<button onclick="CoreNursingExams.material(\''+bank.itemId+'\')">Open related material</button></article>').join(''):'<div class="panel"><p>No '+(reviewFilter==='all'?'incorrect or unsure':reviewFilter)+' answers saved in this view.</p></div>');
  }
  function examCard(bank){
    const a=action(bank);
    return '<article class="exam-card" data-exam-title="'+safe(bank.title.toLowerCase())+'"><h3>'+safe(bank.title)+'</h3>'+(a.note?'<p class="note">'+safe(a.note)+'</p>':'')+'<button class="primary" onclick="CoreNursingExams.launch(\''+bank.itemId+'\')">'+safe(a.text)+'</button><details><summary>Stages &amp; results</summary><button class="exam-link" onclick="CoreNursingExams.open(\''+bank.itemId+'\')">'+bank.exams.map(e=>safe(label(e.stage))+': '+(stageResult(bank,e.stage)||e.questionCount+' questions')).join(' · ')+'</button></details></article>';
  }
  function renderCatalog(){
    const node=byId('examCatalog');if(!node)return;
    const all=Array.from(banks.values()).filter(allowed),groups={due:[],available:[],upcoming:[],passed:[]};
    for(const b of all)groups[action(b).group].push(b);
    const ready=all.filter(b=>window.CoreNursingReadiness?.status(b.itemId)==='complete'&&['start','resume'].includes(action(b).kind));
    groups.ready=ready;
    if(!examListFilter)examListFilter=groups.due.length?'due':'available';
    const passed=all.filter(b=>record(b.itemId).attempts.some(a=>a.completedAt));
    byId('examFilters').innerHTML=['due','available','ready','upcoming','passed'].map(key=>'<button aria-pressed="'+(key===examListFilter)+'" onclick="CoreNursingExams.listFilter(\''+key+'\')">'+(key==='ready'?'Available ready':key[0].toUpperCase()+key.slice(1))+' · '+(key==='passed'?passed.length:groups[key].length)+'</button>').join('');
    const rows=(examListFilter==='passed'?passed:groups[examListFilter]).filter(b=>b.title.toLowerCase().includes(examSearch));
    node.innerHTML=(examListFilter==='ready'?'<p class="note">Revision complete · exam available now.</p>':'')+(rows.length?rows.map(examCard).join(''):'<p class="muted">'+(examSearch?'No exams match this search.':examListFilter==='ready'?'No revision-complete materials have an exam available now.':'No exams in this section.')+'</p>');
  }
  function homeActions(due){
    const home=byId('nextActionsHome'),a=state().active;if(!home)return;
    const unfinished=readingCatalog().find(x=>['med','lesson'].includes(x.type)&&readingState(x.type,x.id)==='in-progress'&&window.CoreNursingReadiness?.status(x.id)==='complete');
    const flagged=reviewRows().length;
    const study=unfinished?'<p>'+safe(unfinished.title)+'</p><button class="primary" data-reading-type="'+unfinished.type+'" data-reading-id="'+safe(unfinished.id)+'" onclick="openReadingItem(this)">Continue studying →</button>':'<p>Choose a medication or clinical lesson.</p><button class="primary" onclick="showTab(\'library\');setCatalogFilter(\'complete\')">Browse completed medications →</button>';
    home.innerHTML='<h1>Your next step</h1>'+(a?'<p>'+safe(banks.get(a.itemId)?.title||a.itemId)+' · '+safe(label(a.form.stage))+'</p><button class="primary" onclick="CoreNursingExams.resume()">Continue exam</button>':due.length?'<button class="primary" onclick="CoreNursingExams.launch(\''+due[0].itemId+'\')">'+safe(action(due[0]).text)+' · '+safe(due[0].title)+'</button>':study)+(flagged?'<div class="next-links"><button onclick="CoreNursingExams.review()">Review saved answers · '+flagged+'</button></div>':'');
  }
  function practiceOverview(){
    const node=byId('practiceExamOverview');if(!node)return;const a=state().active;
    const continuation=a?'<div class="panel"><h2>Continue exam</h2><p>'+safe(banks.get(a.itemId)?.title||a.itemId)+' · '+safe(label(a.form.stage))+'</p><button class="primary" id="continueExam" onclick="CoreNursingExams.resume()">Continue exam</button></div>':'';
    const passed=[];for(const bank of banks.values())if(allowed(bank)){const stages=['standard','advanced','comprehensive','7-day','21-day'].map(stage=>record(bank.itemId).attempts.filter(a=>a.stage===stage&&a.completedAt).sort((a,b)=>b.completedAt-a.completedAt)[0]).filter(Boolean);if(stages.length)passed.push({bank,stages});}
    node.innerHTML=continuation+'<details class="panel" id="practicePassedExams"><summary>Passed exams · '+passed.reduce((n,x)=>n+x.stages.length,0)+'</summary>'+(passed.length?passed.map(({bank,stages})=>'<button class="exam-link" onclick="CoreNursingExams.open(\''+bank.itemId+'\')"><strong>'+safe(bank.title)+'</strong><small>'+stages.map(a=>safe(label(a.stage))+' · Passed · '+a.correct+'/'+a.total+' · '+safe(date(a.completedAt))).join('<br>')+'</small></button>').join(''):'<p class="muted">No passed exams yet.</p>')+'</details>';
  }

  function resume(){
    if(!state().active)return;
    if(expired())return;
    showTab('practice');selected=state().active.itemId;resultView=null;safetyMode=false;viewingExam=true;render();scrollStudyTo(0,0);
  }
  function navigation(t){
    viewingExam=false;
    reviewing=false;if(t==='practice'){selected=null;resultView=null;safetyMode=false}
    render();
  }
  function refreshDashboards(){
    practiceOverview();
    const due=Array.from(banks.values()).filter(b=>allowed(b)&&record(b.itemId).due&&record(b.itemId).due.at<=now());
    for(const id of ['dueExamsHome','dueExamsProgress']){
      const node=byId(id);if(!node)continue;
      if(id==='dueExamsHome'){node.hidden=!due.length;node.innerHTML=due.length?'<button type="button" onclick="CoreNursingExams.showDue()">All due exams · '+due.length+' →</button>':'';continue;}
      node.hidden=!due.length;
      node.innerHTML=due.length?'<h2>Due exams · '+due.length+'</h2>'+due.slice(0,id==='dueExamsHome'?3:due.length).map(b=>'<div class="due-row"><strong>'+safe(b.title)+'</strong><small>'+safe(label(record(b.itemId).due.stage))+' · '+safe(date(record(b.itemId).due.at))+'</small><button onclick="CoreNursingExams.launch(\''+b.itemId+'\')">'+safe(action(b).text)+'</button></div>').join('')+(id==='dueExamsHome'&&due.length>3?'<button onclick="CoreNursingExams.showDue()">View all due exams</button>':''):'';

    }
    refreshReaderEntries();homeActions(due);if(tab==='practice'&&!selected&&!reviewing)renderCatalog();
    const summary=byId('examProgress');
    if(summary){const attempts=Object.values(state().items).flatMap(r=>r.attempts);summary.innerHTML='<h2>Exam history</h2><p>'+attempts.length+' exam attempts. Reading and old practice answers are separate.</p>'+attempts.slice().sort((a,b)=>b.finishedAt-a.finishedAt).map(a=>'<p><strong>'+safe(banks.get(a.formId.split('--')[0])?.title||a.formId.split('--')[0])+'</strong><br>'+safe(label(a.stage))+' · '+a.correct+'/'+a.total+' · '+safe(date(a.finishedAt))+(a.completedAt?' · Passed':a.passed?' · Score passed; safety follow-up required':' · Below passing score')+'</p>').join('')}
    for(const node of document.querySelectorAll('[data-exam-status]')){const bank=bankFor(node.dataset.examStatus);if(bank)node.textContent=status(bank)}
  }
  function refreshReaderEntries(){
    for(const panel of document.querySelectorAll('.exam-entry[data-reader-item]')){
      const bank=bankFor(panel.dataset.readerItem);if(!bank)continue;
      panel.hidden=readingState(panel.dataset.readerType,panel.dataset.readerItem)!=='read';
      const a=action(bank);
      const text=a.kind==='resume'?'Continue exam →':a.kind==='safety'?'Open safety check':a.kind==='view'?'View exam schedule':a.kind==='start'?'Take exam →':'Review updated material';
      panel.innerHTML='<button type="button" class="primary" onclick="CoreNursingExams.launch(\''+bank.itemId+'\')">'+text+'</button>'+(a.note?'<p class="note">'+safe(a.note)+'</p>':'');
    }
  }
  function decorate(type,id,container){
    const bank=bankFor(id);if(!bank||!allowed(bank))return;
    container.querySelector('.exam-entry')?.remove();
    const panel=document.createElement('div');panel.className='panel exam-entry';
    panel.dataset.readerType=type==='lesson'?'lesson':'med';panel.dataset.readerItem=id;
    container.append(panel);refreshReaderEntries();
  }
  function open(id){
    const bank=bankFor(id);if(!bank||!allowed(bank))return;
    showTab('practice');selected=bank.itemId;resultView=null;safetyMode=false;viewingExam=false;render();scrollStudyTo(0,0);
  }
  function inputHtml(q,value,followup=false){
    const fn=followup?'followupAnswer':'answer',key=safe(q.id);
    if(q.format==='single-best-answer')return '<div class="exam-options">'+q.choices.map(c=>'<label><input type="radio" name="'+key+'" value="'+c.id+'" '+(value===c.id?'checked':'')+' onchange="CoreNursingExams.'+fn+'(\''+key+'\',this.value)"><span>'+safe(c.text)+'</span></label>').join('')+'</div>';
    return '<label class="exam-written">'+(q.format==='numeric-entry'?'Answer in '+safe(q.unit):'Answer')+'<input autocomplete="off" '+(q.format==='numeric-entry'?'inputmode="decimal"':'')+' value="'+safe(value??'')+'" oninput="CoreNursingExams.'+fn+'(\''+key+'\',this.value)" aria-label="'+(q.format==='numeric-entry'?safe(q.unit):'Written answer')+'"></label>';
  }

  function exactPercent(a){return (100*a.correct/a.total).toLocaleString(undefined,{maximumFractionDigits:1});}
  function examDuration(form){const seconds=form.questionCount*90;return seconds%60===0?(seconds/60)+' min':Math.floor(seconds/60)+' min '+(seconds%60)+' sec';}
  function stageMeta(form){return form.questionCount+' questions · Untimed · Up to '+Core.allowedErrors(form.questionCount)+' incorrect answers allowed';}
  function formControls(bank,form,retake=false){
    const access=Core.eligible({...state(),items:{...state().items}},bank.itemId,form.stage,bank.readingSections,now(),Core.MODEL),stale=changed(bank);
    return '<div class="exam-start" data-stage="'+form.stage+'"><h3>'+safe(label(form.stage))+'</h3><p class="note">'+safe(stageMeta(form))+'</p><button '+(!access.ok||stale?'disabled':'')+' onclick="CoreNursingExams.start(\''+form.stage+'\')">'+(retake?'Retake ':'Start ')+safe(label(form.stage).toLowerCase())+'</button>'+(!access.ok?'<p class="note">'+safe(access.reason)+(access.unlockAt?' <span class="exam-cooldown" data-unlock-at="'+access.unlockAt+'">Available '+safe(date(access.unlockAt))+'.</span>':'')+'</p>':'')+'</div>';
  }
  function nextStep(bank,r,remaining){
    const active=state().active;
    if(active)return {title:'Continue your exam',text:safe(banks.get(active.itemId)?.title||active.itemId)+' · '+safe(label(active.form.stage)),button:'<button class="primary" onclick="CoreNursingExams.resume()">Continue exam</button>'};
    if(changed(bank))return {title:'Study material updated',text:'The question bank needs an update before a new attempt.',button:'<button onclick="CoreNursingExams.material(\''+bank.itemId+'\')">Open material</button>'};
    if(r.pendingSafety.length)return {title:'Complete your safety check',text:r.pendingSafety.length+' safety '+(r.pendingSafety.length===1?'point needs':'points need')+' follow-up.',button:'<button class="primary" onclick="CoreNursingExams.safety()">Open safety follow-up check</button>'};
    if(r.due){
      const form=bank.exams.find(e=>e.stage===r.due.stage),future=r.due.at>now();
      if(!form||future)return {title:label(r.due.stage),text:'<time>'+safe(date(r.due.at))+'</time><span class="exam-availability">'+(!form?'Questions pending':'Scheduled')+'</span>',button:'',scheduled:true};
      return {title:'Take your due exam',text:'Due '+safe(date(r.due.at)),button:formControls(bank,form),stage:form.stage};
    }
    if(r.attempts.some(a=>a.stage==='21-day'&&a.completedAt))return {title:'No exam scheduled',text:'Your 21-day exam is recorded as passed.',button:''};
    const stage='comprehensive',form=bank.exams.find(e=>e.stage===stage);
    return {title:'Next exam',text:'',button:form?formControls(bank,form):'',stage};
  }
  function requiredReading(){
    const panel=byId('examSession')?.querySelector('.exam-reading');
    if(!panel)return;panel.open=true;
    const first=Array.from(panel.querySelectorAll('.exam-source')).find(node=>!node.querySelector('button').disabled);
    if(first){first.open=true;first.scrollIntoView({block:'start'});first.querySelector('summary')?.focus({preventScroll:true});}
    else panel.scrollIntoView({block:'start'});
  }
  function renderMaterial(container,bank){
    const r=record(bank.itemId),remaining=[],latest=r.attempts.at(-1),next=nextStep(bank,r,remaining);
    const passed=['standard','advanced','comprehensive','7-day','21-day'].map(stage=>r.attempts.filter(a=>a.stage===stage&&a.completedAt).sort((a,b)=>b.completedAt-a.completedAt)[0]).filter(Boolean);
    const headline=latest?'<div class="exam-latest"><span>Latest result</span><strong>'+safe(label(latest.stage))+' · '+(latest.completedAt?'Passed':latest.passed?'Score passed':'Below passing score')+'</strong><p>'+latest.correct+'/'+latest.total+' · '+exactPercent(latest)+'%<small>'+safe(date(latest.finishedAt))+'</small></p></div>':'<p class="note">No exam attempts yet.</p>';
    const completed=passed.length?'<details class="panel exam-completed"><summary>Passed exams · '+passed.length+'</summary>'+passed.map(a=>'<div class="exam-passed-row" data-stage="'+a.stage+'"><h3>'+safe(label(a.stage))+' · Passed</h3><p>'+a.correct+'/'+a.total+' · '+exactPercent(a)+'%<small>'+safe(date(a.completedAt))+'</small></p></div>').join('')+'</details>':'';
    const source='<details class="panel exam-reading" '+(remaining.length?'open':'')+'><summary>'+(remaining.length?'Required reading · '+remaining.length+' sections':'Read the material')+'</summary><p class="note">Mark each section after reading. Reading and exam results are saved separately.</p>'+bank.readingSections.map(section=>{
      const read=r.reads.some(x=>x.sectionId===section.id&&(r.readingAfter===null||x.at>r.readingAfter));
      return '<details class="exam-source"><summary>'+safe(section.label)+'</summary><div class="exam-source-text">'+safe(section.text.replace(/\\n/g,'\n'))+'</div><button '+(read?'disabled':'')+' onclick="CoreNursingExams.read(\''+section.id+'\')">'+(read?'Section marked as read':'Mark section as read')+'</button></details>';
    }).join('')+'</details>';
    const rules='<details class="panel exam-details"><summary>Exam details</summary><p>One comprehensive exam, repeated at each stage. Up to '+Core.allowedErrors(bank.exams[0].questionCount)+' incorrect answers allowed. A failed stage repeats after 3 days. Passing schedules the next review after 7 days, then 21 days.</p><p class="note">Unsure flags do not reduce the score. Safety checks are separate. '+(window.CoreNursingReadiness?.status(bank.itemId)==='complete'?'Author review completed for this material.':'Bank coverage is still under review.')+'</p></details>';
    const points=new Map();for(const form of bank.exams)for(const q of form.questions)for(const p of q.learningPointIds)points.set(p,q.point);
    const shown=new Set(r.attempts.flatMap(a=>a.shownQuestionIds||[])),tested=new Set();for(const form of bank.exams)for(const q of form.questions)if(shown.has(q.id))q.learningPointIds.forEach(p=>tested.add(p));
    container.innerHTML='<button class="back" onclick="CoreNursingExams.catalog()">← All exams</button><div class="panel exam-material-header"><h2>'+safe(bank.title)+'</h2>'+headline+'</div><div class="panel exam-next-step" id="examNextStep"><span class="exam-section-label">'+(next.scheduled?'Next scheduled exam':'Your next step')+'</span><h2>'+safe(next.title)+'</h2>'+(next.text?'<p class="next-step-description">'+next.text+'</p>':'')+next.button+'<div class="exam-secondary"><button onclick="CoreNursingExams.material(\''+bank.itemId+'\')">Open material</button><button onclick="CoreNursingExams.review()">Review saved answers</button></div></div>'+completed+source+rules+'<details class="panel"><summary>Tested points · '+tested.size+'/'+points.size+' bank points asked</summary><p class="note">Mapped bank points only. Unvisited questions remain not yet tested.</p>'+Array.from(points).map(([id,text])=>'<p>'+safe(text)+'<br><small>'+(tested.has(id)?'Asked in an exam':'Not yet tested')+'</small></p>').join('')+'</details>';
  }

  function render(){
    const hub=byId('examsHub'),session=byId('examSession');if(!hub||!session)return;
    const active=viewingExam&&state().active;
    document.body.classList.toggle('exam-in-progress',!!active);
    document.body.classList.toggle('exam-material-view',!!selected&&!active&&!reviewing);
    byId('legacyPractice').hidden=!!active||!!selected;
    hub.hidden=!!active||!!selected;session.hidden=!active&&!selected;
    if(active){renderActive(session);return}
    if(reviewing){hub.hidden=false;session.hidden=true;byId('legacyPractice').hidden=true;renderReview(hub);return}
    if(!selected){
      hub.innerHTML='<div id="practiceExamOverview"></div><div class="panel"><h2>Find your next exam</h2><div id="examFilters" class="exam-filters" role="group" aria-label="Exam status"></div><label for="examSearch">Medication or lesson</label><input id="examSearch" type="search" class="search" placeholder="Search exams…" value="'+safe(examSearch)+'" oninput="CoreNursingExams.filter(this.value)"><div id="examCatalog"></div><button onclick="CoreNursingExams.review()">Review incorrect &amp; unsure answers</button><details class="exam-about"><summary>About these exams · draft bank</summary><p class="note">Source coverage review is incomplete; scores refer to these exams only.</p></details></div>';
      session.innerHTML='';practiceOverview();renderCatalog();return;
    }
    const bank=banks.get(selected);if(!bank)return;
    if(resultView){renderResult(session,bank);return}
    if(safetyMode){renderSafety(session,bank);return}
    renderMaterial(session,bank);
  }

  function renderActive(container){
    const a=state().active;
    if(a.deadline&&now()>=a.deadline){submit(true);return}
    const q=a.form.questions[a.index];
    if(!a.shown.includes(q.id)){a.shown.push(q.id);save()}
    container.innerHTML='<button class="back" onclick="CoreNursingExams.catalog()">← All exams</button><div class="panel exam-active"><p>'+safe(label(a.form.stage))+' · '+(a.index+1)+'/'+a.form.questions.length+'</p><p id="examTimer" role="timer"></p><h2 id="examQuestion" tabindex="-1">'+safe(q.stem)+'</h2>'+inputHtml(q,a.answers[q.id])+ '<label class="exam-unsure"><input type="checkbox" '+(a.unsure[q.id]?'checked':'')+' onchange="CoreNursingExams.unsure(this.checked)"> Unsure / guessed — flag for review</label><div class="tools"><button '+(a.index===0?'disabled':'')+' onclick="CoreNursingExams.move(-1)">Previous</button><button '+(a.index===a.form.questions.length-1?'disabled':'')+' onclick="CoreNursingExams.move(1)">Next</button><button onclick="CoreNursingExams.submit()">Submit exam</button></div><p class="note">Answers save automatically. Unanswered questions count as incorrect.</p></div>';
    tick();
  }
  function expired(){const a=state().active;if(a?.deadline&&now()>=a.deadline){submit(true);return true}return false}
  function tick(){
    const a=state().active;if(!a){
      const lock=document.querySelector('.exam-cooldown');
      if(lock&&Number(lock.dataset.unlockAt)<=now()&&!resultView&&!safetyMode)render();
      return;
    }
    if(expired())return;
    const node=byId('examTimer');if(node){const left=a.deadline?Math.max(0,Math.ceil((a.deadline-now())/1000)):null;node.textContent=left===null?'Untimed':Math.floor(left/60)+':'+String(left%60).padStart(2,'0')+' remaining'}
  }
  function answer(qid,value){if(expired())return;const a=state().active;if(!a||!a.form.questions.some(q=>q.id===qid))return;a.answers[qid]=String(value).slice(0,500);save()}
  function unsure(value){if(expired())return;const a=state().active;if(a){a.unsure[a.form.questions[a.index].id]=!!value;save()}}
  function move(step){if(expired())return;const a=state().active;if(!a)return;a.index=Math.max(0,Math.min(a.form.questions.length-1,a.index+step));persist();render();scrollStudyTo(0,0);byId('examQuestion')?.focus({preventScroll:true})}
  function submit(automatic=false){
    const a=state().active;if(!a)return;
    if(!automatic&&!confirm('Submit this exam? Unanswered questions score zero.'))return;
    const showResult=!automatic||(viewingExam&&tab==='practice');
    selected=a.itemId;resultView=Core.submit(state(),now());safetyMode=false;viewingExam=false;
    if(!showResult){selected=null;resultView=null}
    saveState();render();
    if(tab==='practice')scrollStudyTo(0,0);
  }
  function feedback(q,response){
    const answer=response?.answer,empty=answer===null||answer===undefined||answer==='';
    const describe=value=>q.format==='single-best-answer' ? (q.choices.find(c=>c.id===value)?.text||value) : value;
    const correct=q.format==='single-best-answer'?q.choices.find(c=>c.id===q.answerKey)?.text:q.format==='numeric-entry'?q.answer+' '+q.unit:q.acceptedAnswers[0];
    const reason=q.format==='single-best-answer'?q.choices.find(c=>c.id===q.answerKey)?.explanation:q.explanation;
    const wrongReason=!response?.correct&&q.format==='single-best-answer'?q.choices.find(c=>c.id===answer)?.explanation:'';
    const options=q.format==='single-best-answer'?'<details class="exam-option-explanations"><summary>All choices explained</summary>'+q.choices.map(c=>'<p><strong>'+safe(c.id)+(c.id===q.answerKey?' · Correct':'')+'</strong> '+safe(c.text)+'<br>'+safe(c.explanation)+'</p>').join('')+'</details>':'';
    return '<details class="exam-feedback" open><summary>'+(response?.correct?'Correct · unsure / guessed · ':empty?'Unanswered · ':'Incorrect · ')+safe(q.stem)+'</summary><p class="review-your-answer"><strong>Your answer:</strong> '+safe(empty?'Unanswered':describe(answer))+(response?.unsure?' · Unsure / guessed':'')+'</p><p class="review-correct-answer"><strong>Correct answer:</strong> '+safe(correct)+'</p><p>'+safe(reason)+'</p>'+(wrongReason&&wrongReason!==reason?'<p><strong>Why your choice does not fit:</strong> '+safe(wrongReason)+'</p>':'')+options+'</details>';
  }
  function nextCompletedMaterial(bank){
    const list=bank.itemType==='lesson'?lessons:meds;
    const index=list.findIndex(item=>canonical(item.id)===bank.itemId);
    if(index<0)return null;
    return list.slice(index+1).find(item=>{
      const candidate=bankFor(item.id);
      return candidate&&candidate.itemType===bank.itemType&&candidate.itemId!==bank.itemId&&allowed(candidate)&&record(candidate.itemId).attempts.length===0&&['start','resume'].includes(action(candidate).kind)&&window.CoreNursingReadiness?.status(item.id)==='complete';
    })||null;
  }
  function nextCompleted(id){
    const bank=bankFor(id);if(!bank)return;
    const next=nextCompletedMaterial(bank);if(next)material(next.id);
  }
  function nextCompletedHtml(bank){
    const next=nextCompletedMaterial(bank),kind=bank.itemType==='lesson'?'lesson':'medication';
    return next?'<div class="exam-next-material"><button type="button" class="primary" onclick="CoreNursingExams.nextCompleted(\''+bank.itemId+'\')">Next completed '+kind+' →</button><p class="note">'+safe(next.title||next.name)+'</p></div>':'<p class="note">No more preparation-complete '+(kind==='lesson'?'lessons':'medications')+' needing a first exam after this material.</p>';
  }
  function renderResult(container,bank){
    const {attempt,form,result}=resultView,modern=attempt.model===Core.MODEL;
    const flagged=form.questions.map((q,i)=>({q,response:result.responses[i]})).filter(x=>!x.response.correct||x.response.unsure);
    const due=record(bank.itemId).due;
    container.innerHTML='<div class="panel"><h2>'+safe(label(attempt.stage))+' result</h2><p class="exam-score">'+result.correct+'/'+result.total+' · '+result.percent.toFixed(1)+'%</p><p>'+(result.passed?(attempt.completedAt?'Passed':'Score passed · safety check required'):'Retry required')+'</p>'+(modern?'<p>'+(result.total-result.correct)+' incorrect · '+Core.allowedErrors(result.total)+' allowed</p>':'<p class="note">Previous exam rules retained for this saved attempt.</p>')+(due?'<p>Next: '+safe(label(due.stage))+' · '+safe(date(due.at))+'</p>':'')+(attempt.expired?'<p>The saved exam timer expired.</p>':'')+'<button onclick="CoreNursingExams.reviewItem()">Exam schedule</button>'+nextCompletedHtml(bank)+'</div><div class="panel"><h3>Corrections &amp; unsure answers · '+flagged.length+'</h3>'+(flagged.map(({q,response})=>feedback(q,response)).join('')||'<p>No incorrect or unsure answers.</p>')+'</div>';
  }
  function renderSafety(container,bank){
    const pending=record(bank.itemId).pendingSafety;
    container.innerHTML='<div class="panel"><h2>Safety follow-up check</h2><p>Answer the missed safety points. This separate check does not change your original exam score.</p>'+pending.map(p=>'<div class="exam-followup"><h3>'+safe(p.question.stem)+'</h3>'+inputHtml(p.question,safetyAnswers[p.question.id],true)+'</div>').join('')+'<button onclick="CoreNursingExams.submitSafety()">Submit safety check</button><button onclick="CoreNursingExams.reviewItem()">Back to material</button></div>';
  }
  function start(stage){
    const bank=banks.get(selected);if(!bank||changed(bank))return;
    const access=Core.eligible(state(),selected,stage,bank.readingSections,now(),Core.MODEL);if(!access.ok){alert(access.reason);return}
    try{Core.start(state(),bank,stage,now());viewingExam=true;resultView=null;saveState();render();scrollStudyTo(0,0)}catch(e){alert(e.message)}
  }
  function read(sectionId){const bank=banks.get(selected);if(!bank?.readingSections.some(s=>s.id===sectionId))return;Core.item(state(),selected).reads.push({sectionId,at:now()});saveState();render()}
  function safety(){if(state().active){alert('Complete the current exam first.');return}safetyMode=true;resultView=null;safetyAnswers={};render();scrollStudyTo(0,0)}
  function submitSafety(){
    const checks=Core.safetyCheck(state(),selected,safetyAnswers,now());saveState();safetyMode=false;render();alert(checks.every(x=>x.correct)?'Safety follow-up check completed. Original exam score unchanged.':'Some safety points still require a follow-up check. Original exam score unchanged.');
  }
  function restore(){memory.exams=Core.normalize(memory.exams);selected=null;resultView=null;safetyMode=false;viewingExam=false;refreshDashboards();render();tick()}
  window.CoreNursingExams={nextCompleted,refreshReaderEntries,requiredReading,launch,review,material,reviewRows,nextAction:action,showDue:()=>{examListFilter='due';showTab('practice')},reviewFilter:value=>{if(['all','unsure','incorrect'].includes(value)){reviewFilter=value;render()}},listFilter:value=>{if(['due','available','ready','upcoming','passed'].includes(value)){examListFilter=value;renderCatalog()}},open,resume,navigation,decorate,refresh:refreshDashboards,restore,start,answer,unsure,move,submit,read,safety,submitSafety,
    followupAnswer:(qid,value)=>{safetyAnswers[qid]=String(value).slice(0,500)},
    filter:text=>{examSearch=text.toLowerCase();renderCatalog()},
    catalog:()=>{reviewing=false;viewingExam=false;selected=null;resultView=null;safetyMode=false;render();scrollStudyTo(0,0)},reviewItem:()=>{resultView=null;safetyMode=false;render();scrollStudyTo(0,0)}};
  restore();timer=setInterval(tick,1000);setInterval(refreshDashboards,60000);
  document.addEventListener('visibilitychange',tick);
  window.addEventListener('pagehide',()=>{if(state().active)save()});
})();

