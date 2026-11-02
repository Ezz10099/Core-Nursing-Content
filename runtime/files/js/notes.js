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
  const $ = id => document.getElementById(id);
  const escape = x => safe(String(x == null ? '' : x));
  function collection() {
    if (!Array.isArray(memory.notes)) memory.notes = [];
    memory.notes = memory.notes.filter(n => n && /^[a-zA-Z0-9_-]{2,90}$/.test(n.id) &&
      typeof n.question === 'string' && typeof n.answer === 'string').slice(0, MAX_ITEMS);
    memory.notes.forEach(n => {
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
  function open() {
    showTab('notes');
    render();
    if (cloudConfigured()) sync(false);
  }
  function edit(id) {
    const n = id ? item(id) : null;
    put('noteId', n ? n.id : '');
    put('noteDept', n ? n.department : 'ibd2');
    put('noteQuestion', n ? n.question : '');
    put('noteAnswer', n ? n.answer : '');
    put('noteTags', n ? n.tags.join(', ') : '');
    const editor = $('noteEditor');
    if (editor) { editor.hidden = false; editor.scrollIntoView({block: 'start'}); }
    feedback(n ? 'Edit this question or add your own explanation.' :
      'Write your question and save it, even offline. An answer is not required.');
  }
  function cancel() { const e = $('noteEditor'); if (e) e.hidden = true; }
  function saveEditor() {
    const question = value('noteQuestion').trim().slice(0, 1000);
    const answer = value('noteAnswer').trim().slice(0, 10000);
    if (!question) { feedback('Please write your question.'); return; }
    const old = item(value('noteId'));
    if (!old && collection().length >= MAX_ITEMS) { feedback('Notebook full. Back up and remove old questions.'); return; }
    const now = new Date().toISOString();
    const tags = value('noteTags').split(',').map(t => t.trim().slice(0, 32)).filter(Boolean).slice(0, 8);
    const n = {
      id: old ? old.id : 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
      department: ['ibd2','ccu','ed','general'].includes(value('noteDept')) ? value('noteDept') : 'general',
      question, answer, tags,
      status: answer ? 'answered' : 'unanswered',
      createdAt: old ? old.createdAt : now, updatedAt: now,
      sourceId: old ? old.sourceId || '' : '',
      syncState: old && old.sourceId ? 'local' : 'pending',
      cloudQuestionSHA: old ? old.cloudQuestionSHA || '' : '',
      cloudAnswerSHA: old ? old.cloudAnswerSHA || '' : ''
    };
    if (old) Object.assign(old, n); else memory.notes.unshift(n);
    save(); cancel(); render();
    feedback('Saved on your phone. ' + (cloudConfigured() ? 'It will sync when online.' : 'Connect private sync once when ready.'));
    if (cloudConfigured()) sync(false);
  }
  function remove(id) {
    const n = item(id);
    if (!n || !confirm('Delete this local question? If synchronized, its private cloud copy will remain.')) return;
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
    const list = collection().filter(n =>
      (!filter || filter === 'all' || n.department === filter) &&
      [n.question, n.answer, n.tags.join(' ')].join(' ').toLowerCase().includes(search))
      .slice().sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const count = $('notesCount');
    if (count) count.textContent = collection().length + ' saved · ' +
      collection().filter(n => !n.answer).length + ' unanswered · ' + list.length + ' showing';
    const cfg = $('noteCloudSetting');
    if (cfg) cfg.textContent = cloudConfigured() ? 'Connected (private GitHub token stored on this device)' : 'Not connected · questions remain on this phone';
    root.innerHTML = list.map(n => '<article class="note-card">' +
      '<div class="note-card-top"><span class="source-tag">' + escape(n.department.toUpperCase()) +
      '</span><small>' + escape((n.updatedAt||'').slice(0,10)) + '</small></div>' +
      '<h3>' + escape(n.question) + '</h3>' +
      (n.answer ? '<details><summary>Read answer</summary><div class="note-answer">' + escape(n.answer) + '</div></details>' :
      '<p class="muted">Awaiting an answer</p>') +
      '<div class="note-tags">' + n.tags.map(t=>'<span>'+escape(t)+'</span>').join('') + '</div>' +
      '<div class="tools"><span class="note-state">' + (n.answer ? 'Answered' : n.syncState === 'synced' ? 'Waiting for ChatGPT answer' : 'Saved offline') +
      '</span><button type="button" data-edit-note="'+escape(n.id)+'">Edit</button>' +
      '<button type="button" data-delete-note="'+escape(n.id)+'">Delete</button></div></article>'
    ).join('') || '<p class="muted">No questions yet. Write one from here or while reading a lesson.</p>';
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
  async function api(method, path, body, allowNotFound) {
    const key = token();
    if (!key) throw Error('Connect private sync first.');
    const r = await fetch(API + path + (method === 'GET' ? (path.includes('?') ? '' : '?ref=main') : ''), {
      method,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Authorization': 'Bearer ' + key,
        ...(body ? {'Content-Type':'application/json'} : {})
      },
      ...(body ? {body:JSON.stringify(body)} : {}),
      cache:'no-store'
    });
    if (r.status === 404 && allowNotFound) return null;
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw Error('Private GitHub connection rejected (HTTP ' + r.status + '). Check token/repository access.');
      throw Error('Sync request failed (HTTP ' + r.status + ').');
    }
    return r.json();
  }
  function publicQuestion(n) {
    return {schemaVersion:1, id:n.id, department:n.department,
      question:n.question, tags:n.tags, createdAt:n.createdAt, updatedAt:n.updatedAt,
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
      syncMessage('Up to date · ' + uploaded + ' question(s) uploaded, ' + received + ' answer(s) received.');
      render();
    } catch(e) { syncMessage('Sync not completed: ' + e.message + ' Your local questions are preserved.'); }
    finally { busy=false; }
  }
  function connect() {
    const inp=$('noteGithubToken'); const val=inp && inp.value.trim();
    if (!val || !/^(github_pat_|ghp_|ghu_)/.test(val)) {
      syncMessage('Enter a valid GitHub fine-grained personal access token.'); return;
    }
    try { localStorage.setItem(TOKEN_KEY,val); inp.value=''; }
    catch(e) { syncMessage('Device storage unavailable; could not save connection.'); return; }
    render(); sync(true);
  }
  function disconnect() {
    if (!confirm('Disconnect private cloud sync on this phone? Your local questions and backups remain.')) return;
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    render(); syncMessage('Private sync disconnected; questions remain saved offline.');
  }
  document.addEventListener('click', function(e) {
    const faq=e.target.closest('[data-note-faq]');
    const editBtn=e.target.closest('[data-edit-note]');
    const del=e.target.closest('[data-delete-note]');
    if (faq) fromFaq(faq.getAttribute('data-note-faq'));
    else if (editBtn) edit(editBtn.getAttribute('data-edit-note'));
    else if (del) remove(del.getAttribute('data-delete-note'));
  });
  window.addEventListener('online',()=>sync(false));
  collection();
  window.CoreNursingNotes={open,edit,cancel,saveEditor,render,fromFaq,sync,connect,disconnect};
  setTimeout(()=>sync(false),3000);
})();