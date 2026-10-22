'use strict';
// Presentation only. Study content and all clinical wording stay in the signed content feed.
function studyPane(){return document.querySelector('main')}
function scrollStudyTo(x,y){const pane=studyPane();if(!pane)return;if(typeof pane.scrollTo==='function')pane.scrollTo({left:x,top:y,behavior:'instant'});else pane.scrollTop=y}
function updateReadingView(){document.body.classList.toggle('reading-view',(tab==='library'&&!byId('detail').classList.contains('hidden'))||(tab==='clinical'&&!byId('lessonDetail').classList.contains('hidden')));syncQuestionMarking()}
function applyStudyPreferences(){
  document.documentElement.dataset.theme=memory.theme==='light'?'light':'dark';
  const scale=Number(memory.readerScale);memory.readerScale=Number.isFinite(scale)?Math.max(1,Math.min(1.3,scale)):1;
  document.documentElement.style.setProperty('--reader-scale',memory.readerScale);
  const light=memory.theme==='light',button=byId('studyTheme');
  if(button){button.textContent=light?'☾':'☀';button.setAttribute('aria-label',light?'Use dark reading theme':'Use light reading theme');button.title=button.getAttribute('aria-label')}
  document.querySelectorAll('[data-reader-size]').forEach(node=>node.textContent=Math.round(memory.readerScale*100)+'%');
  const theme=document.querySelector('meta[name="theme-color"]');if(theme)theme.content=light?'#f5f5ef':'#10191f';
}
function toggleStudyTheme(){memory.theme=memory.theme==='light'?'dark':'light';applyStudyPreferences();save()}
function changeStudyText(step){memory.readerScale=Math.max(1,Math.min(1.3,Math.round((memory.readerScale+step)*100)/100));applyStudyPreferences();save()}
function readingMinutes(sections){const words=sections.map(s=>[s.text,s.prompt,s.leftText,s.rightText].filter(Boolean).join(' ')).join(' ').trim().split(/\s+/).length;return Math.max(1,Math.ceil(words/200))}
function readerTools(){return '<div class="reader-tools"><span>Reading size · <span data-reader-size>'+Math.round((memory.readerScale||1)*100)+'%</span></span><div class="tools" role="group" aria-label="Reading text size"><button type="button" aria-label="Decrease reading text size" onclick="changeStudyText(-0.1)">A−</button><button type="button" aria-label="Increase reading text size" onclick="changeStudyText(0.1)">A+</button></div></div>'}
function readerIntro(title,tag,meta){return '<div class="reader-intro"><div class="source-tag">'+safe(tag)+'</div><h2 class="page-heading">'+safe(title)+'</h2><div class="reader-meta">'+meta.map(x=>'<span>'+safe(x)+'</span>').join('')+'</div></div>'+readerTools()+questionMarkTools()}
function readerContents(labels){return '<details class="reader-toc"><summary>In this '+(tab==='clinical'?'lesson':'medication')+' <span class="note">· '+labels.length+' sections</span></summary><div class="toc-links">'+labels.map((label,i)=>'<button type="button" onclick="jumpStudySection('+i+')"><span>'+String(i+1).padStart(2,'0')+'</span>'+safe(label)+'</button>').join('')+'</div></details>'}
function jumpStudySection(index){const target=document.querySelector((tab==='clinical'?'#lessonDetail':'#detail')+' [data-study-section="'+index+'"]');if(!target)return;const toc=target.parentElement.querySelector('.reader-toc');if(toc)toc.open=false;if(target.tagName==='DETAILS')target.open=true;requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:'smooth'}))}
function readerFinish(type,id){return '<div class="reader-finish"><h3>A little clearer. A little closer.</h3><p>Finished reading? Save your place, then come back for practice.</p>'+readingControl(type,id)+'<p class="note" style="margin:12px 0 0">Reading completion records reading, not clinical mastery.</p></div>'}
function sectionTone(label){if(/danger|red.flag|stop|avoid|mistake|escalat/i.test(label))return 'tone-danger';if(/first|action|recogn|assess|bedside|nurs/i.test(label))return 'tone-action';return ''}
function numberedLabel(label,index){return '<span class="section-number">'+String(index+1).padStart(2,'0')+'</span><span class="summary-label">'+safe(label)+'</span>'}
function studyUiInit(){applyStudyPreferences();updateReadingView()}
