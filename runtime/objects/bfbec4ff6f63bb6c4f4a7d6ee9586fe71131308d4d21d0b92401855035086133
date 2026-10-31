(function(){
  'use strict';
  const Core=window.CoreNursingExamCore, data=window.CoreNursingExamData;
  if(!Core||!data)return;
  const banks=new Map(data.banks.map(b=>[b.itemId,b]));
  let selected=null,resultView=null,safetyMode=false,safetyAnswers={},timer=null,viewingExam=false;
  const state=()=>memory.exams, record=id=>state().items[id]||{attempts:[],reads:[],readingAfter:null,pendingSafety:[],due:null}, now=()=>Date.now();
  const canonical=id=>data.aliases[id]||id;
  const bankFor=id=>banks.get(canonical(id));
  const date=x=>new Date(x).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const label=stage=>({'standard':'Standard','advanced':'Advanced','7-day':'7-day','21-day':'21-day'}[stage]||stage)+' exam';
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
    if(r.attempts.some(a=>a.stage==='advanced'&&a.completedAt))parts.push('Advanced exam passed.');
    else if(r.attempts.some(a=>a.stage==='standard'&&a.completedAt))parts.push('Standard exam passed.');
    if(latest)parts.push(label(latest.stage)+': '+latest.correct+'/'+latest.total+' ('+(100*latest.correct/latest.total).toFixed(1)+'%).');
    if(r.pendingSafety.length)parts.push('Safety follow-up required.');
    const left=Core.readingRemaining(r,bank.readingSections).length;
    if(left)parts.push(left+' sections must be marked as read again.');
    if(r.due)parts.push(label(r.due.stage)+(r.due.at<=now()?' due: ':' scheduled: ')+date(r.due.at)+'.');
    return parts.join(' ')||'No exam attempts.';
  }
  function practiceOverview(){
    const node=byId('practiceExamOverview');if(!node)return;
    const a=state().active;
    const resume=a?'<div class="panel"><h2>Continue exam</h2><p>'+safe(banks.get(a.itemId)?.title||a.itemId)+' · '+safe(label(a.form.stage))+'</p><p class="note">Question '+(a.index+1)+' of '+a.form.questions.length+'. '+(a.deadline?'The advanced timer continues while you are away.':'Your answers are saved.')+'</p><button class="primary" id="continueExam" onclick="CoreNursingExams.resume()">Continue exam</button></div>':'';
    const passed=[];
    for(const bank of banks.values()){
      if(!allowed(bank))continue;
      for(const stage of ['standard','advanced','7-day','21-day']){
        const attempt=record(bank.itemId).attempts.filter(a=>a.stage===stage&&a.completedAt).sort((a,b)=>b.completedAt-a.completedAt)[0];
        if(attempt)passed.push({bank,attempt});
      }
    }
    passed.sort((a,b)=>b.attempt.completedAt-a.attempt.completedAt);
    node.innerHTML=resume+'<div class="panel" id="practicePassedExams"><h2>Passed exams · '+passed.length+'</h2>'+(passed.length?passed.map(({bank,attempt})=>'<button class="exam-link" onclick="CoreNursingExams.open(\''+bank.itemId+'\')"><strong>'+safe(bank.title)+'</strong><small>'+safe(label(attempt.stage))+' · Passed · '+attempt.correct+'/'+attempt.total+'<br>'+safe(date(attempt.completedAt))+'</small></button>').join(''):'<p class="muted">No passed exams yet.</p>')+'</div>';
  }
  function resume(){
    if(!state().active)return;
    if(expired())return;
    showTab('practice');selected=state().active.itemId;resultView=null;safetyMode=false;viewingExam=true;render();scrollStudyTo(0,0);
  }
  function navigation(t){
    viewingExam=false;
    if(t==='practice'){selected=null;resultView=null;safetyMode=false}
    render();
  }
  function refreshDashboards(){
    practiceOverview();
    const due=Array.from(banks.values()).filter(b=>allowed(b)&&record(b.itemId).due&&record(b.itemId).due.at<=now());
    for(const id of ['dueExamsHome','dueExamsProgress']){
      const node=byId(id);if(!node)continue;
      node.hidden=!due.length;
      node.innerHTML=due.length?'<h2>Due exams · '+due.length+'</h2>'+due.map(b=>'<button class="exam-link" onclick="CoreNursingExams.open(\''+b.itemId+'\')">'+safe(b.title)+'<small>'+safe(label(record(b.itemId).due.stage))+' due '+safe(date(record(b.itemId).due.at))+'</small></button>').join('')+'<p class="note">Reminders appear here when you open the app. 7-day exams are available. 21-day question sets are not yet available.</p>':'';
    }
    const summary=byId('examProgress');
    if(summary){const attempts=Object.values(state().items).flatMap(r=>r.attempts);summary.innerHTML='<h2>Exam history</h2><p>'+attempts.length+' exam attempts. Reading and old practice answers are separate.</p>'+attempts.slice().sort((a,b)=>b.finishedAt-a.finishedAt).map(a=>'<p><strong>'+safe(banks.get(a.formId.split('--')[0])?.title||a.formId.split('--')[0])+'</strong><br>'+safe(label(a.stage))+' · '+a.correct+'/'+a.total+' · '+safe(date(a.finishedAt))+(a.completedAt?' · Passed':a.passed?' · Score passed; safety follow-up required':' · Below passing score')+'</p>').join('')}
    for(const node of document.querySelectorAll('[data-exam-status]')){const bank=bankFor(node.dataset.examStatus);if(bank)node.textContent=status(bank)}
  }
  function decorate(type,id,container){
    const bank=bankFor(id);if(!bank||!allowed(bank))return;
    const panel=document.createElement('div');panel.className='panel exam-entry';
    panel.innerHTML='<h3>Exams</h3><p data-exam-status="'+safe(id)+'">'+safe(status(bank))+'</p><button type="button" onclick="CoreNursingExams.open(\''+bank.itemId+'\')">Open exams</button>';
    const before=container.querySelector('.reader-toc');if(before)before.before(panel);else container.append(panel);
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
  function render(){
    const hub=byId('examsHub'),session=byId('examSession');if(!hub||!session)return;
    const active=viewingExam&&state().active;
    document.body.classList.toggle('exam-in-progress',!!active);
    byId('legacyPractice').hidden=!!active||!!selected;
    hub.hidden=!!active||!!selected;session.hidden=!active&&!selected;
    if(active){renderActive(session);return}
    if(!selected){
      hub.innerHTML='<div id="practiceExamOverview"></div><div class="panel"><h2>Study exams</h2><p class="note">Draft question bank. Source coverage review is incomplete; scores refer to these exams only.</p><label for="examSearch">Find a medication or lesson</label><input id="examSearch" type="search" class="search" oninput="CoreNursingExams.filter(this.value)" placeholder="Search exams…"><div id="examCatalog">'+Array.from(banks.values()).filter(allowed).map(b=>'<button class="exam-link" data-exam-title="'+safe(b.title.toLowerCase())+'" onclick="CoreNursingExams.open(\''+b.itemId+'\')">'+safe(b.title)+'<small>'+b.exams.map(e=>safe(label(e.stage))+': '+e.questionCount+' questions'+(stageResult(b,e.stage)?' · '+safe(stageResult(b,e.stage)):'')).join(' · ')+'</small></button>').join('')+'</div></div>';
      session.innerHTML='';practiceOverview();return;
    }
    const bank=banks.get(selected);if(!bank)return;
    if(resultView){renderResult(session,bank);return}
    if(safetyMode){renderSafety(session,bank);return}
    const r=record(bank.itemId),remaining=Core.readingRemaining(r,bank.readingSections);
    const startButtons=bank.exams.map(form=>{
      const access=Core.eligible(state(),bank.itemId,form.stage,bank.readingSections,now()),stale=changed(bank);
      return '<div class="exam-start"><h3>'+safe(label(form.stage))+(stageResult(bank,form.stage)?' · '+safe(stageResult(bank,form.stage)):'')+'</h3><p>'+form.questionCount+' questions · '+(form.stage==='advanced'?'Total time: '+(form.questionCount*90)+' seconds (90 seconds per question). Score must be above 90%.':(form.stage==='standard'?'Untimed. At least 90% passes. The same form is used on retake.':'Untimed. Score must be above 90%. If below passing, repeat this stage after seven days.'))+'</p><button '+(!access.ok||stale?'disabled':'')+' onclick="CoreNursingExams.start(\''+form.stage+'\')">Start '+safe(label(form.stage).toLowerCase())+'</button>'+(!access.ok?'<p class="note">'+safe(access.reason)+(access.unlockAt?' <span class="exam-cooldown" data-unlock-at="'+access.unlockAt+'">Available '+safe(date(access.unlockAt))+'.</span>':'')+'</p>':'')+'</div>';
    }).join('');
    const points=new Map();for(const form of bank.exams)for(const q of form.questions)for(const p of q.learningPointIds)points.set(p,q.point);
    const shown=new Set(r.attempts.flatMap(a=>a.shownQuestionIds||[]));const tested=new Set();for(const e of bank.exams)for(const q of e.questions)if(shown.has(q.id))q.learningPointIds.forEach(p=>tested.add(p));
    session.innerHTML='<button class="back" onclick="CoreNursingExams.catalog()">← All exams</button><div class="panel"><h2>'+safe(bank.title)+'</h2><p>'+safe(status(bank))+'</p><p class="note">Draft question bank · full source coverage review is incomplete. Correct unsure/guessed answers keep their score. Missed predefined safety questions require a separate follow-up check.</p>'+(changed(bank)?'<p role="status">The study material has changed. These exams need an update before a new attempt.</p>':'')+startButtons+(r.pendingSafety.length?'<button onclick="CoreNursingExams.safety()">Open safety follow-up check</button>':'')+(r.due?'<p>'+safe(label(r.due.stage))+' '+safe(date(r.due.at))+(bank.exams.some(e=>e.stage===r.due.stage)?'.</p>':'. Questions for this scheduled exam have not been added yet.</p>'):'')+'</div><div class="panel"><h3>'+(remaining.length?'Required reading before another attempt':'Read the material')+'</h3><p class="note">Confirm each section yourself. Exam scores do not mark material as read.</p>'+bank.readingSections.map(section=>{
      const read=r.reads.some(x=>x.sectionId===section.id&&(r.readingAfter===null||x.at>r.readingAfter));
      return '<details class="exam-source"><summary>'+safe(section.label)+'</summary><div class="exam-source-text">'+safe(section.text.replace(/\\n/g,'\n'))+'</div><button '+(read?'disabled':'')+' onclick="CoreNursingExams.read(\''+section.id+'\')">'+(read?'Section marked as read':'Mark section as read')+'</button></details>';
    }).join('')+'</div><details class="panel"><summary>Tested points · '+tested.size+'/'+points.size+' bank points asked</summary><p class="note">This covers mapped bank points, not every fact in the source. Questions not visited before submission remain not yet tested.</p>'+Array.from(points).map(([id,text])=>'<p>'+safe(text)+'<br><small>'+(tested.has(id)?'Asked in an exam':'Not yet tested')+'</small></p>').join('')+'</details>';
  }
  function renderActive(container){
    const a=state().active;
    if(a.deadline&&now()>=a.deadline){submit(true);return}
    const q=a.form.questions[a.index];
    if(!a.shown.includes(q.id)){a.shown.push(q.id);save()}
    container.innerHTML='<button class="back" onclick="CoreNursingExams.catalog()">← Back to Practice</button><div class="panel exam-active"><p>'+safe(label(a.form.stage))+' · '+(a.index+1)+'/'+a.form.questions.length+'</p><p id="examTimer" role="timer"></p><h2 id="examQuestion" tabindex="-1">'+safe(q.stem)+'</h2>'+inputHtml(q,a.answers[q.id])+ '<label class="exam-unsure"><input type="checkbox" '+(a.unsure[q.id]?'checked':'')+' onchange="CoreNursingExams.unsure(this.checked)"> Unsure / guessed — flag for review</label><div class="tools"><button '+(a.index===0?'disabled':'')+' onclick="CoreNursingExams.move(-1)">Previous</button><button '+(a.index===a.form.questions.length-1?'disabled':'')+' onclick="CoreNursingExams.move(1)">Next</button><button onclick="CoreNursingExams.submit()">Submit exam</button></div><p class="note">Answers save on this device as you go. Returning later does not restart the advanced timer. Unanswered questions score zero.</p></div>';
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
    const answer=response?.answer;
    const options=q.format==='single-best-answer'?q.choices.map(c=>'<p><strong>'+c.id+(c.id===q.answerKey?' · Correct answer':'')+'</strong> '+safe(c.text)+'<br>'+safe(c.explanation)+'</p>').join(''):'<p>Correct answer: '+safe(q.format==='numeric-entry'?q.answer+' '+q.unit:q.acceptedAnswers[0])+'</p><p>'+safe(q.explanation)+'</p>';
    return '<details class="exam-feedback"><summary>'+(response?.correct?'Correct · ':'Incorrect · ')+safe(q.stem)+'</summary><p>Your answer: '+safe(answer===null||answer===undefined||answer===''?'Unanswered':answer)+(response?.unsure?' · Unsure / guessed':'')+'</p>'+options+'</details>';
  }
  function renderResult(container,bank){
    const {attempt,form,result}=resultView;
    container.innerHTML='<div class="panel"><h2>'+safe(label(attempt.stage))+' result</h2><p class="exam-score">'+result.correct+'/'+result.total+' · '+result.percent.toFixed(1)+'%</p><p>'+(result.passed?(attempt.completedAt?safe(label(attempt.stage))+' passed.':'Score passed. Safety follow-up required.'):safe(label(attempt.stage))+' below passing score.')+'</p>'+(result.below65?'<p>Before another attempt, mark every section as read again.</p>':'')+(!result.passed&&attempt.stage==='advanced'?'<p>Advanced exam locked for 24 hours. Available '+safe(date(attempt.finishedAt+Core.DAY))+'.</p>':'')+(attempt.expired?'<p>The advanced exam time expired.</p>':'')+'<button onclick="CoreNursingExams.reviewItem()">Return to material and exams</button><p class="note">The pass decision uses the exact score, before rounding. '+result.review.length+' questions flagged for review.</p></div><div class="panel"><h3>Answers and explanations</h3>'+form.questions.map((q,i)=>feedback(q,result.responses[i])).join('')+'</div>';
  }
  function renderSafety(container,bank){
    const pending=record(bank.itemId).pendingSafety;
    container.innerHTML='<div class="panel"><h2>Safety follow-up check</h2><p>Answer the missed safety points. This separate check does not change your original exam score.</p>'+pending.map(p=>'<div class="exam-followup"><h3>'+safe(p.question.stem)+'</h3>'+inputHtml(p.question,safetyAnswers[p.question.id],true)+'</div>').join('')+'<button onclick="CoreNursingExams.submitSafety()">Submit safety check</button><button onclick="CoreNursingExams.reviewItem()">Back to material</button></div>';
  }
  function start(stage){
    const bank=banks.get(selected);if(!bank||changed(bank))return;
    const access=Core.eligible(state(),selected,stage,bank.readingSections,now());if(!access.ok){alert(access.reason);return}
    if(!confirm('Start '+label(stage).toLowerCase()+'? '+(stage==='advanced'?'Total allowance is 90 seconds multiplied by the question count. The timer continues if you leave.':'This exam is untimed.')))return;
    try{Core.start(state(),bank,stage,now());viewingExam=true;resultView=null;saveState();render();scrollStudyTo(0,0)}catch(e){alert(e.message)}
  }
  function read(sectionId){const bank=banks.get(selected);if(!bank?.readingSections.some(s=>s.id===sectionId))return;Core.item(state(),selected).reads.push({sectionId,at:now()});saveState();render()}
  function safety(){if(state().active){alert('Complete the current exam first.');return}safetyMode=true;resultView=null;safetyAnswers={};render();scrollStudyTo(0,0)}
  function submitSafety(){
    const checks=Core.safetyCheck(state(),selected,safetyAnswers,now());saveState();safetyMode=false;render();alert(checks.every(x=>x.correct)?'Safety follow-up check completed. Original exam score unchanged.':'Some safety points still require a follow-up check. Original exam score unchanged.');
  }
  function restore(){memory.exams=Core.normalize(memory.exams);selected=null;resultView=null;safetyMode=false;viewingExam=false;refreshDashboards();render();tick()}
  window.CoreNursingExams={open,resume,navigation,decorate,refresh:refreshDashboards,restore,start,answer,unsure,move,submit,read,safety,submitSafety,
    followupAnswer:(qid,value)=>{safetyAnswers[qid]=String(value).slice(0,500)},
    filter:text=>document.querySelectorAll('[data-exam-title]').forEach(node=>node.hidden=!node.dataset.examTitle.includes(text.toLowerCase())),
    catalog:()=>{viewingExam=false;selected=null;resultView=null;safetyMode=false;render();scrollStudyTo(0,0)},reviewItem:()=>{resultView=null;safetyMode=false;render();scrollStudyTo(0,0)}};
  restore();timer=setInterval(tick,1000);setInterval(refreshDashboards,60000);
  document.addEventListener('visibilitychange',tick);
  window.addEventListener('pagehide',()=>{if(state().active)save()});
})();

