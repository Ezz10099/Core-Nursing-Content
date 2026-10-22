'use strict';
// Optional authoring input. These marks never change reading or exam results.
let pendingQuestionMark=null,questionPicking=false,questionReader=null;
function normalizeQuestionMarks(value){
  if(!Array.isArray(value))return [];
  const seen=new Set(),result=[];
  for(const mark of value.slice(0,5000)){
    if(!mark||!['med','lesson'].includes(mark.itemType)||typeof mark.itemId!=='string'||!mark.itemId||mark.itemId.length>160)continue;
    if(typeof mark.text!=='string'||!mark.text.trim()||mark.text.length>16000||typeof mark.sectionKey!=='string'||!mark.sectionKey||mark.sectionKey.length>240)continue;
    const text=mark.text.trim(),key=JSON.stringify([mark.itemType,mark.itemId,mark.sectionKey,text]);
    if(seen.has(key))continue;seen.add(key);
    const field=(name,max)=>typeof mark[name]==='string'?mark[name].slice(0,max):'';
    result.push({itemType:mark.itemType,itemId:mark.itemId,itemTitle:field('itemTitle',512),sectionKey:mark.sectionKey,sectionTitle:field('sectionTitle',512),text,sectionText:field('sectionText',40000),contentVersion:Number.isSafeInteger(mark.contentVersion)&&mark.contentVersion>=0?mark.contentVersion:0,createdAt:typeof mark.createdAt==='string'&&Number.isFinite(Date.parse(mark.createdAt))?new Date(mark.createdAt).toISOString():''});
  }
  return result;
}
function questionMarkTools(){return '<details class="question-mark-tools"><summary>Mark information for questions <span data-question-mark-count></span></summary><p class="note">Select a passage, then choose Use in questions. You can also choose a paragraph by tapping it.</p><div class="tools"><button type="button" data-question-pick aria-pressed="false" onclick="toggleQuestionPicking()">Choose a paragraph</button><button type="button" onclick="showQuestionMarks()">Review marks</button></div><p class="note question-mark-feedback" role="status" aria-live="polite"></p></details>'}
function activeQuestionRoot(){
  const root=tab==='library'?byId('detail'):tab==='clinical'?byId('lessonDetail'):null;
  return root&&!root.classList.contains('hidden')&&root.dataset.questionItemId?root:null;
}
function prepareQuestionMarking(type,id){
  clearQuestionSelection();questionPicking=false;
  const root=byId(type==='med'?'detail':'lessonDetail');
  root.dataset.questionItemType=type;root.dataset.questionItemId=id;
  const item=(type==='med'?meds:lessons).find(x=>x.id===id);
  root.dataset.questionItemTitle=item?(item.name||item.title):id;
  root.dataset.questionContentVersion=syncedContent?syncedContent.contentVersion:0;
  root.querySelectorAll('[data-study-section]').forEach(node=>{
    node.dataset.questionSection='section:'+node.dataset.studySection;
    const title=node.querySelector('.summary-label');node.dataset.questionSectionTitle=title?title.textContent:'';
  });
  root.querySelectorAll('.memory-cue').forEach((node,i)=>{node.dataset.questionSection=i===0&&node.classList.contains('use')?'memory-use':'memory-danger';node.dataset.questionSectionTitle=node.querySelector('strong').textContent});
  root.querySelectorAll('[data-reading-faq]').forEach(faq=>{
    const heading=faq.querySelector('.summary-label').cloneNode(true);heading.querySelectorAll('.reading-badge').forEach(node=>node.remove());
    faq.querySelectorAll('.faq-part').forEach((node,i)=>{node.dataset.questionSection='faq:'+faq.dataset.readingFaq+':'+i;node.dataset.questionSectionTitle=heading.textContent.trim()+' — '+node.querySelector('h3').textContent});
  });
  syncQuestionMarking();
}
function questionScope(node){return (node&&node.nodeType===1?node:node&&node.parentElement)?.closest('[data-question-section]')||null}
function questionMarkSnapshot(root,section,text){
  const type=root.dataset.questionItemType,id=root.dataset.questionItemId;
  return {itemType:type,itemId:id,itemTitle:root.dataset.questionItemTitle,sectionKey:section.dataset.questionSection,sectionTitle:section.dataset.questionSectionTitle||'',text,sectionText:section.textContent.trim().slice(0,40000),contentVersion:Number(root.dataset.questionContentVersion),createdAt:new Date().toISOString()};
}
function offerQuestionMark(root,section,text){
  if(!text.trim()||text.length>16000){clearQuestionSelection();questionMarkFeedback('Select a passage of up to 16,000 characters.');return}
  pendingQuestionMark={root,section,mark:questionMarkSnapshot(root,section,text.trim())};
  byId('questionSelectionPreview').textContent=text.trim().slice(0,160)+(text.trim().length>160?'…':'');
  byId('questionSelectionBar').hidden=false;
}
function captureQuestionSelection(){
  const root=activeQuestionRoot(),selection=window.getSelection();
  if(!root||!selection||selection.isCollapsed||!selection.rangeCount){if(pendingQuestionMark&&!questionPicking&&!document.activeElement.closest('#questionSelectionBar'))clearQuestionSelection();return}
  const range=selection.getRangeAt(0),start=questionScope(range.startContainer),end=questionScope(range.endContainer);
  if(!start||start!==end||!root.contains(start)){clearQuestionSelection();return}
  if(range.cloneContents().querySelector('button,input,select,textarea')){clearQuestionSelection();return}
  offerQuestionMark(root,start,selection.toString());
}
function clearQuestionSelection(){pendingQuestionMark=null;const bar=byId('questionSelectionBar');if(bar)bar.hidden=true}
function dismissQuestionSelection(){clearQuestionSelection();window.getSelection()?.removeAllRanges()}
function questionMarkFeedback(message){const root=activeQuestionRoot(),node=root&&root.querySelector('.question-mark-feedback');if(node)node.textContent=message}
function syncQuestionMarking(){
  const root=activeQuestionRoot();
  if(root!==questionReader){questionPicking=false;clearQuestionSelection();questionReader=root}
  if(!root||pendingQuestionMark&&(pendingQuestionMark.root!==root||!pendingQuestionMark.section.isConnected))clearQuestionSelection();
  if(!root)questionPicking=false;
  document.querySelectorAll('#detail,#lessonDetail').forEach(node=>node.classList.toggle('question-picking',node===root&&questionPicking));
  document.querySelectorAll('[data-question-pick]').forEach(button=>button.setAttribute('aria-pressed',String(!!root&&questionPicking&&root.contains(button))));
  document.querySelectorAll('[data-question-mark-count]').forEach(node=>{
    const reader=node.closest('[data-question-item-id]');
    const n=reader?memory.questionMarks.filter(m=>m.itemType===reader.dataset.questionItemType&&m.itemId===reader.dataset.questionItemId).length:0;
    node.textContent=n?'· '+n+' saved':'';
  });
}
function toggleQuestionPicking(){
  questionPicking=!questionPicking;dismissQuestionSelection();syncQuestionMarking();
  questionMarkFeedback(questionPicking?'Tap a paragraph or bullet point, then choose Use in questions.':'');
}
function saveQuestionMark(){
  const pending=pendingQuestionMark;
  if(!pending||pending.root!==activeQuestionRoot()||!pending.section.isConnected){clearQuestionSelection();return}
  const before=memory.questionMarks.length;
  if(before>=5000){questionMarkFeedback('Export your marks, then remove marks before adding more.');return}
  memory.questionMarks=normalizeQuestionMarks([...memory.questionMarks,pending.mark]);
  save();dismissQuestionSelection();syncQuestionMarking();
  questionMarkFeedback(!persistence?'Local saving is unavailable. Export your marks from Progress.':memory.questionMarks.length===before?'This passage is already marked.':'Saved. Review or export marks in Progress.');
}
function showQuestionMarks(){showTab('progress');byId('question-marks').scrollIntoView({block:'start',behavior:'smooth'})}
function renderQuestionMarks(){
  const host=byId('question-marks');if(!host)return;
  host.innerHTML='<h2>Marked information · '+memory.questionMarks.length+'</h2><p class="note">Optional input for question writing. The complete material still needs review. Marks stay on this device. Share the export when requesting questions based on your marks.</p><div class="tools"><button type="button" onclick="exportQuestionMarks()" '+(!memory.questionMarks.length?'disabled':'')+'>Export marked information</button></div><div class="question-mark-list">'+memory.questionMarks.map((mark,index)=>'<details class="question-mark"><summary><span>'+safe(mark.itemTitle||mark.itemId)+'<small>'+safe(mark.sectionTitle||mark.sectionKey)+'</small></span></summary><blockquote>'+safe(mark.text)+'</blockquote><p class="note">'+safe(mark.itemType==='med'?'Medication':'Lesson')+' · Content version '+mark.contentVersion+(mark.createdAt?' · '+safe(new Date(mark.createdAt).toLocaleDateString()):'')+'</p><div class="tools"><button type="button" onclick="openQuestionMark('+index+')">View source</button><button type="button" onclick="removeQuestionMark('+index+')">Remove mark</button></div></details>').join('')+'</div>'+(!memory.questionMarks.length?'<p class="note">Open a lesson or medication and select a passage to mark it.</p>':'');
}
function openQuestionMark(index){
  const mark=memory.questionMarks[index];if(!mark)return;
  const item=(mark.itemType==='med'?meds:lessons).find(x=>x.id===mark.itemId);
  if(!item){alert('This item is no longer in the material. Your saved passage is still available to export.');return}
  showTab(mark.itemType==='med'?'library':'clinical');
  if(mark.itemType==='med')openMed(mark.itemId);else openLesson(mark.itemId);
  const root=activeQuestionRoot(),sections=[...root.querySelectorAll('[data-question-section]')];
  const section=sections.find(node=>node.dataset.questionSection===mark.sectionKey&&node.dataset.questionSectionTitle===mark.sectionTitle)||sections.find(node=>node.dataset.questionSectionTitle===mark.sectionTitle);
  if(section){for(let node=section;node&&node!==root;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;requestAnimationFrame(()=>section.scrollIntoView({block:'start',behavior:'smooth'}))}
  questionMarkFeedback('Saved passage: '+mark.text);
}
function removeQuestionMark(index){if(!memory.questionMarks[index]||!confirm('Remove this marked passage?'))return;memory.questionMarks.splice(index,1);save();syncQuestionMarking()}
function questionMarksExport(){return JSON.stringify({app:'core-nursing-question-marks',schemaVersion:1,exportedAt:new Date().toISOString(),marks:normalizeQuestionMarks(memory.questionMarks)},null,2)}
function exportQuestionMarks(){
  if(!memory.questionMarks.length)return;
  const data=questionMarksExport();
  if(window.CoreNursingAndroid&&typeof window.CoreNursingAndroid.saveBackup==='function'){window.CoreNursingAndroid.saveBackup(data);return}
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='core-nursing-marked-information.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function questionMarksInit(){
  document.addEventListener('selectionchange',captureQuestionSelection);
  byId('questionSelectionBar').addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault()});
  document.addEventListener('click',event=>{
    if(!questionPicking)return;
    const root=activeQuestionRoot(),target=event.target.closest('p,li,.hero-line,.memory-strip>strong');
    const section=questionScope(target);
    if(!root||!target||!section||!root.contains(section)||event.target.closest('button,a,input,summary'))return;
    offerQuestionMark(root,section,target.textContent);
  });
  syncQuestionMarking();
}
