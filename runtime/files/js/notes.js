/* Core Nursing private Q&A inbox.
 * Questions save offline in app progress. Optional personal GitHub fine-grained
 * access token is stored separately from backups and used only with api.github.com.
 */
(function () {
  'use strict';
  const REPO = 'Ezz10099/Core-Nursing-Diagnostic-State';
  const API = 'https://api.github.com/repos/' + REPO + '/contents/inbox/';
  const TOKEN_KEY = 'core-nursing-qa-github-token-v1';
  const MAX_ITEMS = 500;
  let busy = false;
  let verifiedConnection = false;
  const $ = id => document.getElementById(id);
  const escape = x => safe(String(x == null ? '' : x));
  function collection() {
    if (!Array.isArray(memory.notes)) memory.notes = [];
    memory.notes = memory.notes.filter(n => n && /^[a-zA-Z0-9_-]{2,90}$/.test(n.id) &&
      typeof n.question === 'string' && typeof n.answer === 'string').slice(0, MAX_ITEMS);
    memory.notes.forEach(n => {
      if (!['question','request'].includes(n.kind)) n.kind = 'question';
      if (!['content','app'].includes(n.relatedTo)) n.relatedTo = '';
      if (!Array.isArray(n.tags)) n.tags = [];
      n.tags = n.tags.filter(t => typeof t === 'string').slice(0, 8);
      if (!['ibd2', 'ccu', 'ed', 'general'].includes(n.department)) n.department = 'general';
      if (!['pending', 'synced'].includes(n.syncState)) n.syncState = n.sourceId ? 'local' : 'pending';
    });
    return memory.notes;
  }
  function item(id) { return collection().find(n => n.id === id); }
  function value(id) { const e = $(id); return e ? e.value : ''; }
  function put(id, val) { const e = $(id); if (e) e.value = val == null ? '' : val; }
  function feedback(msg) { const e = $('noteFeedback'); if (e) e.textContent = msg; }
  function syncMessage(msg) { const e = $('noteSyncStatus'); if (e) e.textContent = msg; }
  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } }
  function cloudConfigured() { return Boolean(token()); }
  function typeFields(prefix) {
    return '<label>Type<select data-entry-kind id="'+prefix+'Kind"><option value="question">Question</option><option value="request">Request</option></select></label>'+
      '<label data-entry-related hidden>Related to (optional)<select id="'+prefix+'Related"><option value="">Choose if useful</option><option value="content">Content</option><option value="app">App</option></select></label>';
  }
  function updateType(form) {
    const kind=form?.querySelector('[data-entry-kind]');
    const related=form?.querySelector('[data-entry-related]');
    if(related) related.hidden=kind?.value!=='request';
  }
  function suggestType(text) {
    if (/^(how|why|when|what|should|can|هل|كيف|متى|لماذا)\b/i.test(text.trim())) return 'question';
    return /\b(delete|remove|unnecessary|useless|waste[ds]?|wasting|bug|broken|crash|redesign|please (add|edit|change|fix)|i (want|need|would like) (you )?to (add|edit|change|fix))\b|احذف|حذف|شيل|غير مفيد|غير ضروري|عد[ّ]?ل|تعديل|أضف|اضف|إضافة|اضافة|مشكلة|خلل|لا يعمل/.test(text.toLowerCase()) ? 'request' : 'question';
  }
  function entryMeta(form) {
    const kind=form?.querySelector('[data-entry-kind]')?.value==='request'?'request':'question';
    const related=form?.querySelector('[data-entry-related] select')?.value;
    return {kind,relatedTo:kind==='request' && ['content','app'].includes(related)?related:''};
  }
  function inlinePanel(department, type, id, title) { return '<div class="panel inline-question"><h3>Question or request about this topic</h3><textarea maxlength="1000" rows="2" placeholder="Ask a question or describe a change"></textarea>'+typeFields('inline-'+escape(id))+'<button type="button" class="primary" data-save-inline="1" data-dept="'+escape(department)+'" data-source-type="'+escape(type)+'" data-source-id="'+escape(id)+'" data-source-title="'+escape(title)+'">Save</button><p class="note inline-feedback" role="status"></p></div>'; }
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-entry-kind]')) {e.target.dataset.manual='true';updateType(e.target.closest('form, .inline-question'));}
  });
  document.addEventListener('input',e=>{
    if(!e.target.matches('#noteQuestion, #quickQuestionText, .inline-question textarea')) return;
    const form=e.target.closest('form, .inline-question'), kind=form?.querySelector('[data-entry-kind]');
    if(kind && !kind.dataset.manual) {kind.value=suggestType(e.target.value);updateType(form);}
  });
  function saveInline(button) {
    const panel=button.closest('.inline-question'), field=panel && panel.querySelector('textarea');
    const question=field && field.value.trim().slice(0,1000), msg=panel && panel.querySelector('.inline-feedback');
    if(!question){if(msg)msg.textContent='Write your question or request first.';return;}
    if(collection().length>=MAX_ITEMS){if(msg)msg.textContent='Inbox full.';return;}
    const now=new Date().toISOString(), dept=button.getAttribute('data-dept');
    memory.notes.unshift({
      id:'q-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),
      question,answer:'',tags:[],...entryMeta(panel),department:['ibd2','ccu','ed','general'].includes(dept)?dept:'general',
      sourceType:button.getAttribute('data-source-type')||'',
      sourceId:button.getAttribute('data-source-id')||'',
      sourceTitle:button.getAttribute('data-source-title')||'',
      status:'unanswered',syncState:'pending',createdAt:now,updatedAt:now
    });
    save();field.value='';const kind=panel.querySelector('[data-entry-kind]');kind.value='question';delete kind.dataset.manual;panel.querySelector('[data-entry-related] select').value='';updateType(panel);if(msg)msg.textContent='Saved offline. Continue studying.';
    if(cloudConfigured())sync(false);
  }

  // One-tap question capture from any screen. Never navigates away from an active exam.
  let quickContext = null, quickPriorFocus = null, quickToastTimer = null;
  function quickStudyContext() {
    const context = {department:'general', sourceType:'', sourceId:'', sourceTitle:''};
    if (tab === 'clinical' || tab === 'library') {
      const panel = tab === 'clinical' ? $('lessonDetail') : $('detail');
      const inline = panel && !panel.classList.contains('hidden') && panel.querySelector('[data-save-inline]');
      if (inline) {
        return {
          department:inline.getAttribute('data-dept') || 'general',
          sourceType:inline.getAttribute('data-source-type') || '',
          sourceId:inline.getAttribute('data-source-id') || '',
          sourceTitle:inline.getAttribute('data-source-title') || ''
        };
      }
      if (tab === 'clinical') {
        const opened = $('clinicalFaqItems')?.querySelector('details.faq-section[open][data-reading-faq]');
        if (opened) {
          const id = opened.getAttribute('data-reading-faq');
          const title = opened.querySelector('summary')?.textContent?.trim() || 'Clinical FAQ';
          return {department:clinicalDepartment,sourceType:'faq',sourceId:id,sourceTitle:title.slice(0,160)};
        }
        context.department = clinicalDepartment;
      }
      if (tab === 'library' && ['ed','ibd2','ccu'].includes(catalogFilter)) context.department = catalogFilter;
    } else if (tab === 'practice' && memory.exams?.active && !$('examSession')?.hidden) {
      const exam = memory.exams.active;
      const bank = window.CoreNursingExamData?.banks?.find(b=>b.itemId === exam.itemId);
      if (bank) {
        return {
          department:bank.itemId.startsWith('ibd2-')?'ibd2':bank.itemId.startsWith('ed-')?'ed':'ccu',
          sourceType:'exam',sourceId:bank.itemId,sourceTitle:bank.title+' · '+exam.stage+' exam'
        };
      }
    }
    context.sourceType='screen';context.sourceId=tab;context.sourceTitle=({home:'Home',practice:'Exams',progress:'Progress',notes:'Questions & requests',clinical:'Clinical',library:'Medications'})[tab] || tab;
    return context;
  }
  function quickOpen() {
    const overlay = $('quickQuestionOverlay'), input = $('quickQuestionText');
    if (!overlay || !input || !overlay.hidden) return;
    quickPriorFocus = document.activeElement;
    // Preserve unfinished draft and its original source when reopening.
    if (!input.value.trim() || !quickContext) quickContext = quickStudyContext();
    const ctx = quickContext;
    updateType(input.closest('form'));
    put('quickQuestionDept',['ibd2','ccu','ed','general'].includes(ctx.department)?ctx.department:'general');
    const label = $('quickQuestionContext');
    if (label) label.textContent = ctx.sourceTitle ? 'Linked to: '+ctx.sourceTitle : (
      ctx.department === 'ibd2' ? 'Orthopaedics · general question' :
      ctx.department === 'ccu' ? 'CCU · general question' :
      ctx.department === 'ed' ? 'Emergency · general question' : 'General question');
    const timing = $('quickQuestionTiming');
    if (timing) timing.hidden = !(memory.exams?.active?.stage === 'advanced');
    const msg = $('quickQuestionMessage');if(msg) msg.textContent = '';
    overlay.hidden = false;
    $('quickQuestionFab')?.setAttribute('aria-expanded','true');
    input.focus({preventScroll:true});
  }
  function quickClose() {
    const overlay = $('quickQuestionOverlay');
    if (overlay) overlay.hidden = true;
    $('quickQuestionFab')?.setAttribute('aria-expanded','false');
    if (quickPriorFocus && typeof quickPriorFocus.focus === 'function') quickPriorFocus.focus({preventScroll:true});
  }
  function quickSave() {
    const input = $('quickQuestionText'), msg = $('quickQuestionMessage');
    const question = (input?.value || '').trim().slice(0,1000);
    if (!question) {if(msg)msg.textContent='Write your question or request first.';input?.focus();return;}
    if (collection().length >= MAX_ITEMS) {if(msg)msg.textContent='Question inbox is full (500).';return;}
    const ctx = quickContext || quickStudyContext(), now = new Date().toISOString();
    const n = {
      id:'q-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),
      question,answer:'',tags:[],...entryMeta(input.closest('form')),
      department:['ibd2','ccu','ed','general'].includes(value('quickQuestionDept'))?value('quickQuestionDept'):'general',
      sourceType:ctx.sourceType,sourceId:ctx.sourceId,sourceTitle:ctx.sourceTitle,
      status:'unanswered',syncState:'pending',createdAt:now,updatedAt:now
    };
    memory.notes.unshift(n);save();
    if (!persistence) {
      memory.notes=memory.notes.filter(x=>x.id!==n.id);
      if(msg)msg.textContent='Could not save on this device. Keep your text and check available storage.';
      return;
    }
    input.value = '';quickContext = null;put('quickQuestionKind','question');put('quickQuestionRelated','');delete $('quickQuestionKind').dataset.manual;updateType(input.closest('form'));quickClose();
    const toast = $('quickQuestionToast');
    if (toast) {
      toast.textContent=(n.kind==='request'?'Request':'Question')+' saved offline · '+collection().filter(x=>!x.answer).length+' unanswered';
      toast.hidden=false;
      if (quickToastTimer) clearTimeout(quickToastTimer);
      quickToastTimer=setTimeout(()=>{toast.hidden=true},3000);
    }
    if (cloudConfigured()) sync(false);
  }
  function quickView() {quickClose();open();}
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && !$('quickQuestionOverlay')?.hidden){e.preventDefault();quickClose();}
  });

  function open() {
    showTab('notes');
    render();
    if (cloudConfigured()) sync(false);
  }
  function edit(id) {
    const n = id ? item(id) : null;
    put('noteKind',n ? n.kind : 'question');
    put('noteRelated',n ? n.relatedTo : '');
    const kind=$('noteKind');if(kind){if(n)kind.dataset.manual='true';else delete kind.dataset.manual;}
    updateType($('noteEditor'));
    put('noteId', n ? n.id : '');
    put('noteDept', n ? n.department : 'ibd2');
    put('noteQuestion', n ? n.question : '');
    put('noteAnswer', n ? n.answer : '');
    put('noteTags', n ? n.tags.join(', ') : '');
    const editor = $('noteEditor');
    if (editor) { editor.hidden = false; editor.scrollIntoView({block: 'start'}); }
    feedback(n ? 'Edit the text, type or response.' :
      'Save a question or request offline. A response is not required.');
  }
  function cancel() { const e = $('noteEditor'); if (e) e.hidden = true; }
  function saveEditor() {
    const question = value('noteQuestion').trim().slice(0, 1000);
    const answer = value('noteAnswer').trim().slice(0, 10000);
    if (!question) { feedback('Please write your question or request.'); return; }
    const old = item(value('noteId'));
    if (!old && collection().length >= MAX_ITEMS) { feedback('Notebook full. Back up and remove old questions.'); return; }
    const now = new Date().toISOString();
    const tags = value('noteTags').split(',').map(t => t.trim().slice(0, 32)).filter(Boolean).slice(0, 8);
    const n = {
      id: old ? old.id : 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
      department: ['ibd2','ccu','ed','general'].includes(value('noteDept')) ? value('noteDept') : 'general',
      question, answer, tags,...entryMeta($('noteEditor')),
      status: answer ? 'answered' : 'unanswered',
      createdAt: old ? old.createdAt : now, updatedAt: now,
      sourceId: old ? old.sourceId || '' : '',
      syncState: old && old.syncState==='local' ? 'local' : 'pending',
      cloudQuestionSHA: old ? old.cloudQuestionSHA || '' : '',
      cloudAnswerSHA: old ? old.cloudAnswerSHA || '' : '',
      sourceType:old ? old.sourceType || '' : '', sourceTitle:old ? old.sourceTitle || '' : ''
    };
    if (old) Object.assign(old, n); else memory.notes.unshift(n);
    save(); cancel(); render();
    feedback('Saved on your phone. ' + (cloudConfigured() ? 'It will sync when online.' : 'Connect private sync once when ready.'));
    if (cloudConfigured()) sync(false);
  }
  function remove(id) {
    const n = item(id);
    if (!n || !confirm('Delete this local question or request? If synchronized, its private cloud copy will remain.')) return;
    memory.notes = collection().filter(x => x.id !== id);
    save(); render(); feedback('Removed from this phone. A cloud copy, if any, was not deleted.');
  }
  function fromFaq(id) {
    const q = typeof allRemoteFaqs === 'function' ? allRemoteFaqs().find(x => x.id === id) : null;
    if (!q) return;
    const old = collection().find(x => x.sourceId === id);
    if (old) { open(); edit(old.id); return; }
    if (collection().length >= MAX_ITEMS) { feedback('Notebook full.'); return; }
    const now = new Date().toISOString();
    memory.notes.unshift({
      id: 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
      question: q.question.slice(0, 1000),
      answer: q.sections.map(s => s.label + '\n' + s.text).join('\n\n').slice(0, 10000),
      department: q.department === 'ibd2' || /^qa-ibd2-|^ibd2-/.test(q.id) ? 'ibd2' : 'ccu',
      tags: ['Saved FAQ'], status: 'answered', syncState: 'local',
      sourceId: id, createdAt: now, updatedAt: now
    });
    save(); open(); feedback('FAQ saved privately to My Questions.');
  }
  function render() {
    const root = $('noteItems'); if (!root) return;
    const search = value('noteSearch').toLowerCase().trim(), filter = value('noteFilter');
    const kindFilter=value('noteKindFilter');
    const list = collection().filter(n =>
      (!kindFilter || kindFilter==='all' || n.kind===kindFilter) &&
      (!filter || filter === 'all' || n.department === filter) &&
      [n.question, n.answer, n.tags.join(' ')].join(' ').toLowerCase().includes(search))
      .slice().sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const count = $('notesCount');
    if (count) count.textContent = collection().length + ' saved · ' +
      collection().filter(n => !n.answer).length + ' unanswered · ' + list.length + ' showing';
    const cfg = $('noteCloudSetting');
    if (cfg) cfg.textContent = !cloudConfigured() ? 'Not connected · questions remain on this phone' : verifiedConnection ? 'Private sync verified with GitHub' : 'GitHub token saved on this device · connection not yet verified';
    root.innerHTML = list.map(n => '<article class="note-card">' +
      '<div class="note-card-top"><span class="source-tag">' + escape(n.kind==='request'?'Request':'Question') + (n.relatedTo ? ' · '+escape(n.relatedTo==='app'?'App':'Content') : '') + ' · ' + escape(n.department.toUpperCase()) +
      '</span><small>' + escape((n.updatedAt||'').slice(0,10)) + '</small></div>' +
      (n.sourceTitle ? '<p class="note">Linked to: '+escape(n.sourceTitle)+'</p>' : '') +
      '<h3>' + escape(n.question) + '</h3>' +
      (n.answer ? '<details><summary>'+(n.kind==='request'?'Read response':'Read answer')+'</summary><div class="note-answer">' + escape(n.answer) + '</div></details>' :
      '<p class="muted">'+(n.kind==='request'?'Awaiting review':'Awaiting an answer')+'</p>') +
      '<div class="note-tags">' + n.tags.map(t=>'<span>'+escape(t)+'</span>').join('') + '</div>' +
      '<div class="tools"><span class="note-state">' + (n.answer ? (n.kind==='request'?'Response received':'Answered') : n.syncState === 'synced' ? (n.kind==='request'?'Waiting for review':'Waiting for ChatGPT answer') : 'Saved offline') +
      '</span><button type="button" data-edit-note="'+escape(n.id)+'">Edit</button>' +
      '<button type="button" data-delete-note="'+escape(n.id)+'">Delete</button></div></article>'
    ).join('') || '<p class="muted">No matching questions or requests. Add one here or from any screen.</p>';
  }
  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = ''; for (let i=0;i<bytes.length;i+=4096)
      binary += String.fromCharCode.apply(null, bytes.subarray(i,i+4096));
    return btoa(binary);
  }
  function fromB64(raw) {
    const decoded = atob(raw.replace(/\s+/g,''));
    const bytes = Uint8Array.from(decoded, x=>x.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  const nativeRequests = new Map();
  let nativeRequestSequence = 0;
  const nativeInboxAvailable = () => typeof window.CoreNursingAndroid?.privateInboxRequest === 'function';
  function receiveNativeInbox(raw) {
    let reply;
    try {reply = JSON.parse(raw);} catch (_) {return;}
    const waiting = reply && nativeRequests.get(reply.id);
    if (!waiting) return;
    nativeRequests.delete(reply.id);
    clearTimeout(waiting.timer);
    if (reply.error || !Number.isInteger(reply.status) || reply.status < 100) {
      waiting.reject(Error(reply.error || 'Native GitHub request failed'));
      return;
    }
    waiting.resolve({
      status:reply.status,
      ok:reply.status >= 200 && reply.status < 300,
      json:async()=>JSON.parse(reply.body || '{}')
    });
  }
  function nativeInboxRequest(method, path, body, key) {
    return new Promise((resolve,reject)=>{
      const id='inbox-'+Date.now().toString(36)+'-'+(++nativeRequestSequence).toString(36);
      const timer=setTimeout(()=>{
        nativeRequests.delete(id);
        reject(Error('Native GitHub request timed out. Check your connection.'));
      },26000);
      nativeRequests.set(id,{resolve,reject,timer});
      try {
        window.CoreNursingAndroid.privateInboxRequest(
          id,method,path,body ? JSON.stringify(body) : '',key
        );
      } catch (_) {
        clearTimeout(timer);
        nativeRequests.delete(id);
        reject(Error('Native private GitHub connection is unavailable.'));
      }
    });
  }
  async function api(method, path, body, allowNotFound) {
    const key = token();
    if (!key) throw Error('Connect private sync first.');
    // Android intentionally disables WebView network access. Its native bridge
    // is limited to the owner's private questions and answers only.
    const r = nativeInboxAvailable()
      ? await nativeInboxRequest(method,path,body,key)
      : await fetch(API + path + (method === 'GET' ? (path.includes('?') ? '' : '?ref=main') : ''), {
          method,
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': 'Bearer ' + key,
            ...(body ? {'Content-Type':'application/json'} : {})
          },
          ...(body ? {body:JSON.stringify(body)} : {}),
          cache:'no-store'
        });
    if (r.status === 404 && allowNotFound) return null;
    if (!r.ok) {
      if (r.status === 401 || r.status === 403)
        throw Error('Private GitHub connection rejected (HTTP '+r.status+'). Check token/repository access.');
      throw Error('Sync request failed (HTTP '+r.status+').');
    }
    return r.json();
  }
    function publicQuestion(n) {
    return {schemaVersion:1, id:n.id, department:n.department,kind:n.kind,relatedTo:n.relatedTo,
      question:n.question, tags:n.tags, sourceType:n.sourceType || '', sourceTitle:n.sourceTitle || '', sourceId:n.sourceId || '', createdAt:n.createdAt, updatedAt:n.updatedAt,
      status:'unanswered'};
  }
  async function upload(n) {
    if (n.syncState === 'local') return;
    const path='questions/' + n.id + '.json';
    const body={message:'Save Core Nursing private question ' + n.id,
      content:b64(JSON.stringify(publicQuestion(n),null,2) + '\n'), branch:'main'};
    if (n.cloudQuestionSHA) body.sha=n.cloudQuestionSHA;
    try {
      const response=await api('PUT',path,body);
      n.cloudQuestionSHA=response.content && response.content.sha || '';
      n.syncState='synced'; save();
    } catch(e) {
      // A question already present in the cloud is updated safely using its exact SHA.
      if (!n.cloudQuestionSHA && /HTTP 422/.test(String(e))) {
        const existing=await api('GET',path,null,true);
        if (existing && existing.sha) {
          body.sha=existing.sha;
          const response=await api('PUT',path,body);
          n.cloudQuestionSHA=response.content && response.content.sha || '';
          n.syncState='synced'; save();
          return;
        }
      }
      throw e;
    }
  }
  async function downloadAnswers() {
    const files=await api('GET','answers',null,true);
    if (!Array.isArray(files)) return 0;
    let changed=0;
    for (const f of files) {
      if (!f || f.type !== 'file' || !/^q-[A-Za-z0-9_-]+\.json$/.test(f.name)) continue;
      const n = item(f.name.slice(0,-5));
      if (!n || n.cloudAnswerSHA === f.sha) continue;
      const file = await api('GET', 'answers/' + f.name, null, true);
      if (!file || typeof file.content !== 'string') continue;
      const entry=JSON.parse(fromB64(file.content));
      if (entry.id !== n.id || typeof entry.answer !== 'string' || !entry.answer.trim()) continue;
      // Do not overwrite a learner-authored answer; flag for manual review.
      if (n.answer && !n.cloudAnswerSHA) { n.pendingCloudAnswer = true; continue; }
      n.answer=entry.answer.slice(0,10000);
      n.status='answered';
      n.cloudAnswerSHA=f.sha;
      n.pendingCloudAnswer=false;
      n.updatedAt=new Date().toISOString();
      changed++;
    }
    if (changed) save();
    return changed;
  }
  async function sync(manual) {
    if (busy) return;
    if (!cloudConfigured()) { if (manual) syncMessage('First connect your private GitHub token. Offline questions are safe.'); return; }
    if (navigator.onLine === false) { syncMessage('Offline · your questions are safely queued on this device.'); return; }
    busy=true; syncMessage('Synchronizing private questions…');
    try {
      let uploaded=0;
      for (const n of collection().filter(n=>n.syncState === 'pending' && !n.answer)) {
        await upload(n); uploaded++;
      }
      const received=await downloadAnswers();
      verifiedConnection = true;
      syncMessage('Up to date · ' + uploaded + ' question(s) uploaded, ' + received + ' answer(s) received.');
      render();
    } catch(e) { syncMessage('Sync not completed: ' + (e instanceof TypeError && /fetch/i.test(e.message) ? 'Network request blocked or unreachable. Try checking api.github.com in Chrome, then retry.' : e.message) + ' Your local questions are preserved.'); render(); }
    finally { busy=false; }
  }
  function connect() {
    const inp=$('noteGithubToken'); const val=inp && inp.value.trim();
    if (!val || !/^(github_pat_|ghp_|ghu_)/.test(val)) {
      syncMessage('Enter a valid GitHub fine-grained personal access token.'); return;
    }
    try { localStorage.setItem(TOKEN_KEY,val); inp.value=''; verifiedConnection=false; }
    catch(e) { syncMessage('Device storage unavailable; could not save connection.'); return; }
    render(); sync(true);
  }
  function disconnect() {
    if (!confirm('Disconnect private cloud sync on this phone? Your local questions and backups remain.')) return;
    try { localStorage.removeItem(TOKEN_KEY); verifiedConnection=false; } catch (_) {}
    render(); syncMessage('Private sync disconnected; questions remain saved offline.');
  }
  document.addEventListener('click', function(e) {
    const inline=e.target.closest('[data-save-inline]');if(inline){saveInline(inline);return;}
    const faq=e.target.closest('[data-note-faq]');
    const editBtn=e.target.closest('[data-edit-note]');
    const del=e.target.closest('[data-delete-note]');
    if (faq) fromFaq(faq.getAttribute('data-note-faq'));
    else if (editBtn) edit(editBtn.getAttribute('data-edit-note'));
    else if (del) remove(del.getAttribute('data-delete-note'));
  });
  window.addEventListener('online',()=>sync(false));
  collection();
  window.CoreNursingNotes={open,edit,cancel,saveEditor,render,fromFaq,sync,connect,disconnect,inlinePanel,quickOpen,quickClose,quickSave,quickView,receiveNativeInbox};
  setTimeout(()=>sync(false),3000);
})();