/* Personal clinical Q&A notes. Local to this installation and included in progress backups. */
(function () {
  'use strict';
  function collection() {
    if (!Array.isArray(memory.notes)) memory.notes = [];
    memory.notes = memory.notes.filter(x => x && typeof x.id === 'string' && typeof x.question === 'string' && typeof x.answer === 'string').slice(0, 500); memory.notes.forEach(x => { if (!Array.isArray(x.tags)) x.tags = []; x.tags = x.tags.filter(t => typeof t === 'string').slice(0, 8); if (!['ibd2','ccu','ed','general'].includes(x.department)) x.department = 'general'; });
    return memory.notes;
  }
  function text(x) { return safe(String(x == null ? '' : x)); }
  function item(id) { return collection().find(x => x.id === id); }
  function selected(id) { const e = document.getElementById(id); return e ? e.value : ''; }
  function setVal(id, value) { const e = document.getElementById(id); if (e) e.value = value || ''; }
  function notice(message) { const e = document.getElementById('noteFeedback'); if (e) e.textContent = message; }
  function open() {
    showTab('notes');
    render();
  }
  function editor(id) {
    const note = id ? item(id) : null;
    setVal('noteId', note ? note.id : '');
    setVal('noteDept', note ? note.department : 'ibd2');
    setVal('noteQuestion', note ? note.question : '');
    setVal('noteAnswer', note ? note.answer : '');
    setVal('noteTags', note ? (note.tags || []).join(', ') : '');
    setVal('noteStatus', note ? note.status : 'review');
    const box = document.getElementById('noteEditor');
    if (box) { box.hidden = false; box.scrollIntoView({ block: 'start' }); }
    notice(note ? 'Editing saved question.' : 'Add a study question. Do not include identifying patient information.');
  }
  function cancel() {
    const box = document.getElementById('noteEditor');
    if (box) box.hidden = true;
    notice('');
  }
  function saveEditor() {
    const question = selected('noteQuestion').trim().slice(0, 1000);
    const answer = selected('noteAnswer').trim().slice(0, 10000);
    if (!question || !answer) { notice('Enter both the question and the answer.'); return; }
    const id = selected('noteId');
    const old = item(id);
    const notes = collection();
    if (!old && notes.length >= 500) { notice('Notebook is full. Export a backup and delete older entries first.'); return; }
    const now = new Date().toISOString();
    const note = {
      id: old ? old.id : 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      question: question,
      answer: answer,
      department: ['ibd2', 'ccu', 'ed', 'general'].includes(selected('noteDept')) ? selected('noteDept') : 'general',
      tags: selected('noteTags').split(',').map(x => x.trim().slice(0, 32)).filter(Boolean).slice(0, 8),
      status: selected('noteStatus') === 'reviewed' ? 'reviewed' : 'review',
      createdAt: old ? old.createdAt : now,
      updatedAt: now,
      sourceId: old ? old.sourceId || '' : ''
    };
    if (old) Object.assign(old, note);
    else notes.unshift(note);
    save();
    cancel();
    render();
    notice('Saved privately on this device. Included in progress backups.');
  }
  function remove(id) {
    const note = item(id);
    if (!note || !confirm('Delete this saved question?')) return;
    memory.notes = collection().filter(x => x.id !== id);
    save();
    render();
    notice('Question deleted.');
  }
  function fromFaq(id) {
    const q = typeof allRemoteFaqs === 'function' ? allRemoteFaqs().find(x => x.id === id) : null;
    if (!q) return;
    const existing = collection().find(x => x.sourceId === id);
    if (existing) { open(); editor(existing.id); notice('Already saved. You can edit this note.'); return; }
    const answer = q.sections.map(s => s.label + '\n' + s.text).join('\n\n');
    if (collection().length >= 500) { open(); notice('Notebook is full.'); return; }
    const now = new Date().toISOString();
    memory.notes.unshift({
      id: 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      question: q.question.slice(0, 1000), answer: answer.slice(0, 10000),
      department: q.department === 'ibd2' || /^qa-ibd2-|^ibd2-/.test(q.id) ? 'ibd2' : 'ccu',
      tags: ['Saved FAQ'], status: 'review',
      createdAt: now, updatedAt: now, sourceId: id
    });
    save();
    open();
    notice('FAQ saved to My Clinical Q&A. You can add tags or edit it.');
  }
  function render() {
    const root = document.getElementById('noteItems');
    if (!root) return;
    const query = selected('noteSearch').toLowerCase().trim();
    const filter = selected('noteFilter');
    const list = collection().filter(x => {
      const matchesQuery = [x.question, x.answer, (x.tags || []).join(' ')].join(' ').toLowerCase().includes(query);
      return matchesQuery && (!filter || filter === 'all' || x.department === filter);
    }).slice().sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const count = document.getElementById('notesCount');
    if (count) count.textContent = collection().length + ' saved questions · ' + list.length + ' showing';
    root.innerHTML = list.map(n =>
      '<article class="note-card"><div class="note-card-top"><span class="source-tag">' + text((n.department || 'general').toUpperCase()) +
      '</span><small>' + text((n.updatedAt || '').slice(0, 10)) + '</small></div>' +
      '<h3>' + text(n.question) + '</h3>' +
      '<details><summary>Show answer</summary><div class="note-answer">' + text(n.answer) + '</div></details>' +
      '<div class="note-tags">' + (n.tags || []).map(t => '<span>' + text(t) + '</span>').join('') + '</div>' +
      '<div class="tools"><span class="note-state">' + (n.status === 'reviewed' ? 'Reviewed' : 'Review needed') + '</span>' +
      '<button type="button" data-edit-note="' + text(n.id) + '">Edit</button>' +
      '<button type="button" data-delete-note="' + text(n.id) + '">Delete</button></div></article>'
    ).join('') || '<p class="muted">No saved questions match. Save a clinical FAQ or add your own question.</p>';
  }
  document.addEventListener('click', function (e) {
    const faq = e.target.closest('[data-note-faq]');
    const edit = e.target.closest('[data-edit-note]');
    const del = e.target.closest('[data-delete-note]');
    if (faq) fromFaq(faq.getAttribute('data-note-faq'));
    else if (edit) editor(edit.getAttribute('data-edit-note'));
    else if (del) remove(del.getAttribute('data-delete-note'));
  });
  collection();
  window.CoreNursingNotes = { open, editor, cancel, saveEditor, render, fromFaq };
})();