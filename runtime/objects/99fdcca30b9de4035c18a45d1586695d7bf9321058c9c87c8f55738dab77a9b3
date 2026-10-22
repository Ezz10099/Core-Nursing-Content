/* Objective scoring and progression. No DOM, learner marks, or network inputs. */
(function(root){
  'use strict';
  const DAY=86400000, stages=['standard','advanced','7-day','21-day'];
  const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9][\w:.-]{0,249}$/.test(x)&&!['constructor','prototype'].includes(x);
  const cleanText=x=>String(x??'').trim().toLocaleLowerCase('en').replace(/\s+/g,' ');
  const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
  const clone=x=>JSON.parse(JSON.stringify(x));
  function empty(){return {version:1,items:{},active:null}}
  function item(state,id){
    if(!validId(id))throw Error('Invalid material ID');
    if(!Object.prototype.hasOwnProperty.call(state.items,id))state.items[id]={attempts:[],reads:[],readingAfter:null,pendingSafety:[],due:null};
    return state.items[id];
  }
  function normalize(input){
    const state=empty();
    if(!input||input.version!==1||!input.items||typeof input.items!=='object')return state;
    for(const [id,old] of Object.entries(input.items)){
      if(!validId(id)||!old||typeof old!=='object')continue;
      const out=item(state,id);
      out.attempts=(Array.isArray(old.attempts)?old.attempts:[]).filter(a=>a&&validId(a.id)&&stages.includes(a.stage)&&finite(a.finishedAt)&&Number.isInteger(a.correct)&&Number.isInteger(a.total)&&a.total>0&&a.correct>=0&&a.correct<=a.total&&Array.isArray(a.responses)).map(a=>({...clone(a),passed:a.stage==='standard'?a.correct*100>=90*a.total:a.correct*100>90*a.total,completedAt:finite(a.completedAt)?a.completedAt:null,safetyMisses:Array.isArray(a.safetyMisses)?a.safetyMisses.filter(validId):[],shownQuestionIds:Array.isArray(a.shownQuestionIds)?a.shownQuestionIds.filter(validId):[]}));
      out.reads=(Array.isArray(old.reads)?old.reads:[]).filter(r=>r&&validId(r.sectionId)&&finite(r.at)).map(r=>({sectionId:r.sectionId,at:r.at}));
      out.readingAfter=finite(old.readingAfter)?old.readingAfter:null;
      if(old.standardForm?.stage==='standard'&&Array.isArray(old.standardForm.questions)&&old.standardForm.questions.length){out.standardForm=clone(old.standardForm);out.standardSourceKey=String(old.standardSourceKey||'');out.standardBankVersion=old.standardBankVersion}
      out.pendingSafety=(Array.isArray(old.pendingSafety)?old.pendingSafety:[]).filter(p=>p&&validId(p.attemptId)&&p.question&&validId(p.question.id)&&out.attempts.some(a=>a.id===p.attemptId)).map(clone);
      if(old.due&&['7-day','21-day'].includes(old.due.stage)&&finite(old.due.at))out.due={stage:old.due.stage,at:old.due.at};
    }
    const a=input.active;
    if(a&&validId(a.itemId)&&a.form&&Array.isArray(a.form.questions)&&a.form.questions.length&&stages.includes(a.form.stage)&&finite(a.startedAt)&&(!a.deadline||finite(a.deadline))){
      state.active=clone(a);state.active.answers=a.answers&&typeof a.answers==='object'?clone(a.answers):{};
      state.active.unsure=a.unsure&&typeof a.unsure==='object'?clone(a.unsure):{};
      state.active.shown=Array.isArray(a.shown)?a.shown.filter(validId):[];
      state.active.index=Math.max(0,Math.min(a.form.questions.length-1,Number.isInteger(a.index)?a.index:0));
      item(state,a.itemId);
    }
    return state;
  }
  function isCorrect(q,answer){
    if(q.format==='single-best-answer')return typeof answer==='string'&&answer===q.answerKey;
    if(q.format==='numeric-entry'){
      const text=String(answer??'').trim();
      if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))return false;
      return Number(text)===q.answer;
    }
    if(q.format==='short-answer')return q.acceptedAnswers.some(x=>cleanText(x)===cleanText(answer));
    throw Error('Unsupported question format');
  }
  function grade(form,answers={},unsure={}){
    const responses=form.questions.map(q=>({questionId:q.id,learningPointIds:[...q.learningPointIds],answer:answers[q.id]??null,
      correct:isCorrect(q,answers[q.id]),unsure:!!unsure[q.id],criticalForSafety:!!q.criticalForSafety}));
    const correct=responses.filter(r=>r.correct).length,total=responses.length;
    if(!total)throw Error('Empty exam');
    return {correct,total,percent:100*correct/total,passed:form.stage==='standard'?correct*100>=90*total:correct*100>90*total,
      below65:correct*100<65*total,responses,safetyMisses:responses.filter(r=>r.criticalForSafety&&!r.correct).map(r=>r.questionId),review:responses.filter(r=>!r.correct||r.unsure).map(r=>r.questionId)};
  }
  function readingRemaining(record,sections){
    if(record.readingAfter===null)return [];
    return sections.filter(s=>!record.reads.some(r=>r.sectionId===s.id&&r.at>record.readingAfter));
  }
  function eligible(state,id,stage,sections,now){
    const record=item(state,id);
    if(!stages.includes(stage))return {ok:false,reason:'Unknown exam stage.'};
    if(state.active)return {ok:false,reason:'An exam is already in progress.'};
    if(readingRemaining(record,sections).length)return {ok:false,reason:'Mark every section as read again before another attempt.'};
    if(record.pendingSafety.length)return {ok:false,reason:'Complete the separate safety follow-up check first.'};
    if(stage==='advanced'&&!record.attempts.some(a=>a.stage==='standard'&&a.passed&&a.completedAt))return {ok:false,reason:'Pass the standard exam with at least 90% first.'};
    if(['7-day','21-day'].includes(stage)&&(!record.due||record.due.stage!==stage||record.due.at>now))return {ok:false,reason:'This exam is not due.'};
    return {ok:true};
  }
  function start(state,bank,stage,now){
    const access=eligible(state,bank.itemId,stage,bank.readingSections,now);
    if(!access.ok)throw Error(access.reason);
    const record=item(state,bank.itemId),sourceKey=bank.readingSections.map(s=>s.id).join('|');
    let form=bank.exams.find(e=>e.stage===stage),formBankVersion=bank.bankVersion;
    if(!form)throw Error('Questions for this exam have not been added yet.');
    if(stage==='standard'){
      // Adding bank questions must not replace the agreed same-form retest.
      // A changed teaching source still requires a newly bound form.
      if(record.standardForm&&record.standardSourceKey===sourceKey){
        const latest=new Map(form.questions.map(q=>[q.id,q]));
        form=record.standardForm;formBankVersion=record.standardBankVersion;
        for(const q of form.questions){
          const current=latest.get(q.id);
          // Apply prose fixes only when the source and entire scoring contract
          // match. Keep the saved questions, choice order, keys and provenance.
          const contract=x=>JSON.stringify([x.format,x.answerKey,x.answer,x.acceptedAnswers,x.unit,x.tolerance,x.points,x.criticalForSafety,x.learningPointIds,x.choices?.map(c=>[c.id,c.text])]);
          if(!current||contract(q)!==contract(current))continue;
          q.stem=current.stem;
          if(q.choices)q.choices.forEach((c,i)=>{c.explanation=current.choices[i].explanation});
          if(current.explanation!==undefined)q.explanation=current.explanation;
        }
      }
      else{record.standardForm=clone(form);record.standardSourceKey=sourceKey;record.standardBankVersion=bank.bankVersion}
    }
    const followups={};
    for(const q of form.questions.filter(q=>q.criticalForSafety)){
      const alternate=bank.exams.flatMap(e=>e.questions).find(other=>other.id!==q.id&&other.learningPointIds.some(p=>q.learningPointIds.includes(p)));
      if(alternate)followups[q.id]=clone(alternate);
    }
    state.active={itemId:bank.itemId,bankVersion:formBankVersion,form:clone(form),followups,startedAt:now,
      deadline:stage==='advanced'?now+form.questions.length*90000:null,answers:{},unsure:{},shown:[],index:0};
    return state.active;
  }
  function complete(record,attempt,now){
    if(!attempt.passed||attempt.completedAt)return;
    attempt.completedAt=now;
    if(attempt.stage==='advanced'){
      if(!record.attempts.some(a=>a!==attempt&&a.stage==='advanced'&&a.completedAt))record.due={stage:'7-day',at:now+7*DAY};
    }else if(attempt.stage==='7-day')record.due={stage:'21-day',at:now+21*DAY};
    else if(attempt.stage==='21-day')record.due=null;
  }
  function submit(state,now){
    const active=state.active;if(!active)throw Error('No exam is in progress.');
    const record=item(state,active.itemId),result=grade(active.form,active.answers,active.unsure);
    const attempt={id:active.itemId+'--attempt-'+now+'-'+record.attempts.length,stage:active.form.stage,formId:active.form.id,bankVersion:active.bankVersion,
      startedAt:active.startedAt,finishedAt:now,expired:!!active.deadline&&now>=active.deadline,correct:result.correct,total:result.total,passed:result.passed,
      responses:result.responses,shownQuestionIds:active.shown.slice(),safetyMisses:result.safetyMisses,completedAt:null};
    record.attempts.push(attempt);
    if(result.below65)record.readingAfter=now;
    if(['7-day','21-day'].includes(attempt.stage)&&!attempt.passed)record.due={stage:attempt.stage,at:now+7*DAY};
    for(const qid of result.safetyMisses)record.pendingSafety.push({attemptId:attempt.id,question:clone(active.followups?.[qid]||active.form.questions.find(q=>q.id===qid))});
    if(!result.safetyMisses.length)complete(record,attempt,now);
    state.active=null;
    return {attempt,form:active.form,result};
  }
  function safetyCheck(state,id,answers,now){
    const record=item(state,id),checks=record.pendingSafety.map(p=>({questionId:p.question.id,correct:isCorrect(p.question,answers[p.question.id])}));
    const passed=new Set(checks.filter(r=>r.correct).map(r=>r.questionId));
    record.pendingSafety=record.pendingSafety.filter(p=>!passed.has(p.question.id));
    for(const attempt of record.attempts){
      if(!record.pendingSafety.some(p=>p.attemptId===attempt.id)&&attempt.safetyMisses.length&&!attempt.safetyCheckedAt){attempt.safetyCheckedAt=now;complete(record,attempt,now)}
    }
    return checks;
  }
  const api={DAY,empty,item,normalize,isCorrect,grade,readingRemaining,eligible,start,submit,safetyCheck};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CoreNursingExamCore=api;
})(typeof window==='object'?window:globalThis);
