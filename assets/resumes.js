async function waitForResumeJob(id){
  for(let attempt=0;attempt<180;attempt++){
    await new Promise(resolve=>setTimeout(resolve,1500));
    const response=await fetch('/resumes/api/jobs/'+encodeURIComponent(id));
    if(!response.ok)throw new Error('Не удалось проверить сборку. Обновите страницу.');
    const job=await response.json();
    if(job.status==='done')return job.manifest;
    if(job.status==='failed')throw new Error(job.error);
  }
  throw new Error('Документ ещё собирается. Повторите загрузку через несколько минут.');
}
const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusText = {review:'Нужно сверить', draft:'Черновик', approved:'Подтверждено'};
const state = {catalog:[], sections:[], current:null, form:null, tab:'full', dirty:false, selected:new Set(), source:null, busy:false, rendered:null, requestId:null, creationRequest:null, openVersion:0};
const formatDate = value => value ? new Intl.DateTimeFormat('ru-RU', {dateStyle:'short', timeStyle:'short', timeZone:'Asia/Yekaterinburg'}).format(new Date(value)) : 'Ещё не проверено';
const sectionKey = value => value.replace(/\s+/g,' ').trim().replace(/:+$/,'').trim().toLocaleLowerCase('ru').replaceAll('ё','е');
const fullContent = data => !!(data.intro?.trim() || data.sections?.some(s=>s.content?.trim() || s.rows?.some(r=>r.period?.trim() || r.text?.trim())));
const editableData = data => Object.fromEntries(['name','intro','mini','mini_clients','sections'].map(key=>[key,structuredClone(data[key])]));

function notify(text, error = false) {
  $('#notice').textContent = text;
  $('#notice').classList.toggle('error', error);
  $('#notice').hidden = false;
}
async function api(path, data) {
  if (window.ResumeDemo) return window.ResumeDemo.api(path, data);
  const response = await fetch('/resumes/api/' + path, data === undefined ? {} : {
    method:'POST', headers:{'X-CSRF-Token':$('meta[name="csrf-token"]').content}, body:new URLSearchParams({csrf:$('meta[name="csrf-token"]').content,payload:JSON.stringify(data)})
  });
  const payload = await response.json();
  if(response.status===202) return await waitForResumeJob(payload.job_id);
  if (!response.ok) {const error=new Error(payload.error || 'Не удалось выполнить запрос.');error.status=response.status;throw error;}
  return payload;
}
const guarded = fn => async event => { try { await fn(event); } catch (error) { notify(error.message, true); } };

function visiblePeople() {
  const query = $('#search').value.toLocaleLowerCase('ru').replaceAll('ё','е').trim();
  const filter = $('#status-filter').value;
  return state.catalog.filter(p => (!query || `${p.name} ${p.intro}`.toLocaleLowerCase('ru').replaceAll('ё','е').includes(query)) &&
    (filter === 'all' || (filter === 'mini-only' ? !p.has_full : p.status === filter)));
}
function avatar(person, large = false) {
  return (person.has_photo ?? !!person.data?.photo)
    ? `<img class="avatar" src="/resumes/files/photo/${esc(person.id)}" alt="" loading="lazy">`
    : `<span class="avatar initials">${esc(person.name.split(' ').slice(0,2).map(x=>x[0]).join(''))}</span>`;
}
function catalog() {
  const people = visiblePeople();
  $('#total').textContent = state.catalog.length;
  $('#found').textContent = people.length;
  $('#people').innerHTML = people.map(p => `<div class="person ${state.current?.id===p.id?'active':''}">
    <input type="checkbox" data-select="${p.id}" aria-label="Включить ${esc(p.name)} в сборник" ${state.selected.has(p.id)?'checked':''} ${!p.has_mini?'disabled':''}>
    <button data-open="${p.id}" aria-label="Открыть ${esc(p.name)}">${avatar(p)}<span class="person-copy"><span class="person-name">${esc(p.name)}</span><span class="person-status ${p.status}">${statusText[p.status]}</span><span class="person-hint">${p.has_full?(p.has_mini?'Полное + мини':'Полное резюме'): 'Мини-резюме'}${!p.has_mini?' (мини не заполнено)':''}</span></span></button></div>`).join('') || '<p class="empty">Ничего не найдено</p>';
  $('#selection-count').textContent = state.selected.size;
  $('#collection').disabled = !state.selected.size || state.busy;
  const selectable = people.filter(p=>p.has_mini);
  $('#select-all').checked = selectable.length > 0 && selectable.every(p=>state.selected.has(p.id));
  $('#select-all').indeterminate = selectable.some(p=>state.selected.has(p.id)) && !$('#select-all').checked;
}
async function refreshCatalog() {
  const [result, options] = await Promise.all([api('profiles'),api('options')]); state.catalog = result.profiles; state.sections = options.sections;
  $('#unmatched-title').textContent = `Несопоставленные исходники (${result.unmatched.length})`;
  $('#unmatched').innerHTML = result.unmatched.map(s=>`<a href="/resumes/files/source/${s.id}">${esc(s.label)}</a>`).join('') || 'Все исходники сопоставлены.';
  catalog();
}
function canLeave() { return !state.dirty || window.confirm('Есть несохранённые изменения. Перейти без сохранения?'); }
async function openProfile(id) {
  if (state.busy || state.current?.id===id || !canLeave()) return;
  const version=++state.openVersion;
  const profile = await api('profiles/' + id);
  if(version!==state.openVersion)return;
  state.current = profile; state.form = structuredClone(profile.data); state.dirty = false;
  state.tab = profile.data.template ? 'full' : 'mini';
  state.requestId = null; state.creationRequest = null;
  if (!window.ResumeDemo) history.replaceState(null,'','/resumes/editor?id='+encodeURIComponent(id));
  clearPreview(); editor(); catalog();
}
function newProfile() {
  if (state.busy || !canLeave()) return;
  state.openVersion++;
  const data={name:'',intro:'',compiled:'',mini:'',mini_clients:'',sections:[],photo:'',template:'',mini_source:'',source_id:''};
  state.current={id:null,name:'',revision:0,status:'draft',checked_at:null,data,sources:[],history:[]};
  state.form=structuredClone(data); state.requestId=crypto.randomUUID(); state.creationRequest=null;
  state.dirty=false; state.tab='full';
  history.replaceState(null,'','/resumes/editor?new=1');
  clearPreview(); editor(); catalog(); $('[data-field="name"]').focus();
}
function sectionChoices() {
  const choices=new Map();
  for (const title of [...state.sections,...(state.form?.sections||[]).map(s=>s.title)]) if(sectionKey(title)) choices.set(sectionKey(title),title);
  return [...choices.values()];
}
function drawSectionChoices() {
  const query=sectionKey($('#section-search').value);
  const choices=sectionChoices();
  $('#section-options').innerHTML=choices.map((title,index)=>({title,index})).filter(({title})=>sectionKey(title).includes(query)).map(({title,index})=>`<button type="button" class="section-choice" data-section-choice="${index}">${esc(title)}</button>`).join('') || '<p class="muted">Совпадений нет. Можно указать своё название ниже.</p>';
  $('#section-choice-count').textContent=`Вариантов из базы: ${choices.length}`;
}
function chooseSection(title) {
  title=title.trim(); if(!title){$('#section-error').textContent='Введите название раздела.';return;}
  if(title.length>150){$('#section-error').textContent='Название раздела должно быть не длиннее 150 символов.';return;}
  let index=state.form.sections.findIndex(s=>sectionKey(s.title)===sectionKey(title));
  if(index<0){
    if(state.form.sections.length>=30)throw new Error('В одном резюме допускается до 30 разделов.');
    state.form.sections.push({title,content:'',rows:[]}); index=state.form.sections.length-1; dirty();
  }
  state.tab='full'; $('#section-dialog').close(); editor(); $(`[data-section-title="${index}"]`).focus();
}
function additionOptions() {
  const existing=state.form.sections;
  const other=state.sections.map((title,index)=>({title,index})).filter(({title})=>!existing.some(s=>sectionKey(s.title)===sectionKey(title)));
  return `<optgroup label="Поля карточки"><option value="field:intro">Представление</option><option value="field:mini">Мини-резюме: краткое представление</option><option value="field:mini_clients">Мини-резюме: в числе клиентов</option></optgroup>${existing.length?`<optgroup label="Разделы этого резюме">${existing.map((s,i)=>`<option value="section:${i}">${esc(s.title)}</option>`).join('')}</optgroup>`:''}${other.length?`<optgroup label="Другие разделы из базы — создать при добавлении">${other.map(({title,index})=>`<option value="new:${index}">${esc(title)}</option>`).join('')}</optgroup>`:''}`;
}
function field(key, title, value, {textarea=true, hint='', rows=4} = {}) {
  return `<label class="field"><span>${esc(title)}</span>${textarea?`<textarea data-field="${key}" rows="${rows}">${esc(value)}</textarea>`:`<input data-field="${key}" value="${esc(value)}">`}${hint?`<small>${esc(hint)}</small>`:''}</label>`;
}
function sectionEditor(section, index) {
  return `<section class="section-editor" data-section="${index}"><div class="section-top"><input aria-label="Название раздела ${index+1}" data-section-title="${index}" list="section-titles" maxlength="150" value="${esc(section.title)}"><button class="quiet" data-up="${index}" aria-label="Переместить раздел выше" ${index===0?'disabled':''}>↑</button><button class="quiet danger" data-remove-section="${index}" aria-label="Удалить раздел">×</button></div>
  <label class="field"><span class="sr-only">Текст раздела ${esc(section.title)}</span><textarea data-section-content="${index}" rows="${Math.min(12, Math.max(3, section.content.length/95))}">${esc(section.content)}</textarea><small>Абзацы разделяются пустой строкой. Переносы страниц рассчитываются автоматически.</small></label>
  <button class="secondary small-button" data-add-row="${index}">+ Строка с периодом сверху</button>
  ${section.rows.map((r,i)=>`<div class="timeline-row"><input data-period="${index}:${i}" value="${esc(r.period)}" aria-label="Период строки ${i+1}" placeholder="Период"><textarea data-row-text="${index}:${i}" aria-label="Описание строки ${i+1}" rows="2">${esc(r.text)}</textarea><button class="quiet danger" data-remove-row="${index}:${i}" aria-label="Удалить строку">×</button></div>`).join('')}</section>`;
}
function formBody() {
  const d = state.form;
  if (state.tab === 'mini') return `<p class="callout">Краткая версия хранится отдельно от полного текста. Из неё собираются индивидуальное мини-резюме и общий сборник.</p>${field('mini','Краткое представление',d.mini,{rows:9})}${field('mini_clients','В числе клиентов',d.mini_clients,{rows:5,hint:'Необязательный блок. В готовом документе пустые блоки не показываются.'})}`;
  if (state.tab === 'sources') return `<p class="callout warning">Ни один вариант обновления не считается согласованным автоматически. Сравните текст перед выбором. Цветовые выделения сохраняются в оригиналах.</p>${state.current.sources.map(s=>`<article class="source-row"><h3>${esc(s.label)}</h3>${s.id===d.source_id?'<span class="status">Основа текущего черновика</span>':''}<p>${s.warnings.map(esc).join(' ')}</p><a href="/resumes/files/source/${s.id}">Скачать оригинал</a>${s.usable?`<button class="secondary" data-compare="${s.id}">Сравнить текст</button>`:''}</article>`).join('') || '<p class="muted">Индивидуальных исходников нет. Для нового преподавателя используется чистый бланк ВЭШ.</p>'}`;
  if (state.tab === 'history') return `<p class="callout">Сохранённые редакции остаются в истории. «Взять текст» переносит прежнее содержание в редактор; текущая версия изменится только после сохранения.</p>${state.current.history.map(h=>`<article class="history-row"><strong>Редакция ${h.number}</strong> <span class="status ${h.status}">${statusText[h.status]}</span><p>${esc(h.action)}</p><p>${formatDate(h.at)} ЕКБ<br>${esc(h.actor)}</p>${h.number!==state.current.revision?`<button class="secondary small-button" data-restore="${h.number}">Взять текст</button>`:''}</article>`).join('')}`;
  return `${!state.current.id?'<p class="callout">Новое резюме. Укажите ФИО и заполните нужные поля. Карточка появится в базе после сохранения черновика; остальные сведения можно добавить позже.</p>':!d.template?'<p class="callout">Полное резюме пока не заполнено. Добавьте представление или нужные разделы и сохраните черновик — документ можно будет собрать в текущем оформлении ВЭШ. Мини-резюме хранится отдельно.</p>':''}
  ${field('name','ФИО преподавателя',d.name,{textarea:false})}${field('intro','Представление рядом с фотографией',d.intro,{rows:6,hint:'Первый абзац выделяется полужирным, как в нынешнем шаблоне.'})}<div class="field"><span id="compiled-label">Дата составления в документе</span><output id="compiled-date" aria-labelledby="compiled-label">${esc(d.compiled||'Будет указана при сохранении правок')}</output><small>Месяц и год обновляются автоматически при сохранении изменений в резюме.</small></div>
  <details class="quick-add"><summary>Добавить новые сведения</summary><textarea id="addition" placeholder="Вставьте новый проект, опыт или другие сведения…" aria-label="Новые сведения"></textarea><select id="addition-target" aria-label="Раздел или поле для новых сведений">${additionOptions()}</select><button class="secondary small-button" id="append-addition">Добавить в черновик</button></details>
  <datalist id="section-titles">${sectionChoices().map(title=>`<option value="${esc(title)}"></option>`).join('')}</datalist>${d.sections.map(sectionEditor).join('')}<div class="section-actions"><button class="secondary small-button" id="add-section">+ Добавить раздел</button></div>`;
}
function editor() {
  const p = state.current;
  if (!p) return;
  $('#editor').innerHTML = `<div class="profile-heading">${p.id?avatar(p):'<span class="avatar initials" aria-hidden="true">+</span>'}<div><h2>${esc(state.form.name||'Новый преподаватель')}</h2><span class="status ${p.status}">${statusText[p.status]}</span><span class="revision-label">${p.id?'Редакция '+p.revision:'Ещё не сохранено'}</span></div></div>
  <div class="tabs" role="tablist">${[['full','Полное резюме'],['mini','Мини-резюме'],['sources',`Исходники (${p.sources.length})`],['history','История']].map(([id,title])=>`<button class="tab ${state.tab===id?'active':''}" role="tab" aria-selected="${state.tab===id}" data-tab="${id}">${title}</button>`).join('')}</div>
  <div id="form-body">${formBody()}</div><div class="editor-actions"><div id="save-state" class="save-state"></div><div class="action-row"><button id="save">Сохранить черновик</button><button class="secondary" id="approve">Подтвердить сведения</button></div><div class="render-actions"><button class="secondary" id="render-full">Собрать полное</button><button class="secondary" id="render-mini">Собрать мини</button></div></div>`;
  updateActions();
}
function updateActions() {
  if (!state.current) return;
  const isNew=!state.current.id;
  $('#save-state').textContent = isNew ? 'Новая карточка: для первого сохранения требуется ФИО.' : state.dirty ? 'Есть несохранённые изменения' : `Сохранено. Последняя проверка: ${formatDate(state.current.checked_at)}`;
  $('#save').disabled = state.busy || (!isNew && !state.dirty);
  $('#approve').disabled = isNew || state.dirty || state.busy || state.current.status === 'approved' || !(fullContent(state.current.data)||state.current.data.mini?.trim());
  $('#render-full').disabled = isNew || state.dirty || state.busy || !state.current.data.template || !fullContent(state.current.data);
  $('#render-mini').disabled = isNew || state.dirty || state.busy || !state.current.data.mini?.trim();
  $('#new-profile').disabled=state.busy;
}
function dirty() {
  state.dirty = true; updateActions();
  if (state.rendered) {
    $('#preview-state').textContent = 'Предпросмотр устарел: сохраните изменения и соберите документ заново.';
    $('#downloads').hidden = true;
  }
}
function clearPreview() {
  state.rendered = null;
  $('#pages').replaceChildren(); $('#downloads').hidden = true;
  $('#preview-version').textContent = '';
  $('#preview-state').className = 'preview-state';
  $('#preview-state').textContent = 'Сохраните изменения и соберите документ. Здесь появятся страницы того же PDF, который можно скачать.';
}
async function save(approve = false) {
  if (state.busy) return;
  if (!state.form.name.trim()) {state.tab='full';editor();$('[data-field="name"]').focus();throw new Error('Укажите ФИО преподавателя перед сохранением.');}
  if (approve && !window.confirm('Вы проверили сведения в полном и мини-резюме? Подтверждение относится к содержанию текущей редакции.')) return;
  state.busy = true; updateActions();
  try {
    const isNew=!state.current.id;
    const submitted=isNew?(state.creationRequest ||= {request_id:state.requestId,data:editableData(state.form)}):{data:editableData(state.form),revision:state.current.revision,approve};
    const result=await api(isNew?'profiles':'profiles/'+state.current.id,submitted);
    const changedDuringSave=JSON.stringify(editableData(state.form))!==JSON.stringify(submitted.data);
    const pending=editableData(state.form);
    state.current=result; state.form=structuredClone(result.data);
    if(changedDuringSave)Object.assign(state.form,pending);
    state.dirty=changedDuringSave; state.creationRequest=null; state.requestId=null;
    if(!window.ResumeDemo)history.replaceState(null,'','/resumes/editor?id='+encodeURIComponent(result.id));
    clearPreview(); editor(); await refreshCatalog(); notify(approve ? 'Сведения подтверждены. Дата проверки сохранена.' : window.ResumeDemo ? 'Редакция сохранена в этом браузере. Сборка файлов после правок доступна в серверной версии.' : 'Новая редакция сохранена. Можно собрать документ.');
    if(isNew)notify(changedDuringSave?'Карточка создана. Последние изменения ещё не сохранены: проверьте их и сохраните черновик.':'Преподаватель добавлен в базу. Заполняйте полное и мини-резюме в нужном объёме.');
  } catch(error) {
    // Явная ошибка проверки не создала карточку: исправленная форма может
    // отправиться с тем же ключом. При потерянном ответе повторяем снимок.
    if(!state.current.id && [400,413,422].includes(error.status))state.creationRequest=null;
    throw error;
  } finally { state.busy = false; updateActions(); catalog(); }
}
async function render(kind, collection = false) {
  if (state.busy) return;
  if (state.dirty && !collection) throw new Error('Сначала сохраните изменения.');
  if (collection && state.dirty && state.selected.has(state.current.id)) throw new Error('Сохраните открытую карточку перед сборкой сборника.');
  const profiles = collection ? state.catalog.filter(p=>state.selected.has(p.id)).map(p=>({id:p.id,revision:p.revision})) : [{id:state.current.id,revision:state.current.revision}];
  state.busy = true; updateActions(); catalog();
  clearPreview(); $('#preview-state').textContent = 'Собираем Word и PDF. Обычно это занимает несколько секунд…'; $('#preview-state').classList.add('busy');
  const requestedId = state.current?.id;
  try {
    const result = await api('render', {kind,profiles});
    // Пока идёт сборка, можно открыть другого преподавателя. Чужой PDF туда не подставляем.
    if (!collection && (requestedId !== state.current?.id || profiles[0].revision !== state.current.revision)) return;
    state.rendered = result;
    const base = result.base_url || `/resumes/files/export/${result.id}/`;
    $('#pages').innerHTML = result.pages.map((page,i)=>`<figure><img src="${base}${page}" alt="Страница ${i+1} готового резюме" loading="lazy"><figcaption>Страница ${i+1} из ${result.pages.length}</figcaption></figure>`).join('');
    $('#downloads').innerHTML = `<a href="${base}resume.docx">Скачать Word</a><a href="${base}resume.pdf">Скачать PDF</a>`;
    $('#downloads').hidden = false;
    $('#preview-version').textContent = collection ? `${profiles.length} преподавателей` : `Редакция ${profiles[0].revision}`;
    $('#preview-state').className = 'preview-state ready';
    $('#preview-state').textContent = result.profiles.some(p=>p.status!=='approved') ? 'Черновик. Включённые сведения ещё не подтверждены.' : 'Собрано из подтверждённых сведений.';
    if (state.dirty && profiles.some(p=>p.id===state.current?.id)) {
      $('#preview-state').textContent = 'Предпросмотр сохранённой версии. Есть новые несохранённые изменения: сохраните их и повторите сборку.';
      $('#downloads').hidden = true;
    }
    notify(collection ? 'Сборник мини-резюме готов.' : 'Word и PDF готовы. Проверьте страницы справа.');
  } catch (error) { $('#preview-state').textContent = error.message; throw error; }
  finally { state.busy = false; $('#preview-state').classList.remove('busy'); updateActions(); catalog(); }
}
function fullText(data) {
  if (!data) return 'Нет распознанного текста.';
  return [data.name, data.intro, data.compiled, ...data.sections.map(s=>`${s.title}\n${s.content}\n${s.rows.map(r=>`${r.period}  ${r.text}`).join('\n')}`)].join('\n\n');
}
$('#search').addEventListener('input', catalog);
$('#status-filter').addEventListener('change', catalog);
$('#select-all').addEventListener('change', event=>{ visiblePeople().filter(p=>p.has_mini).forEach(p=>event.target.checked?state.selected.add(p.id):state.selected.delete(p.id)); catalog(); });
$('#people').addEventListener('click', guarded(async event=>{ const b=event.target.closest('[data-open]'); if(b) await openProfile(b.dataset.open); }));
$('#people').addEventListener('change', event=>{ const id=event.target.dataset.select; if(id){event.target.checked?state.selected.add(id):state.selected.delete(id); catalog();} });
$('#collection').addEventListener('click', guarded(()=>render('collection',true)));
$('#editor').addEventListener('input', event=>{
  const e=event.target, d=e.dataset;
  if(d.field) state.form[d.field]=e.value;
  else if(d.sectionTitle!==undefined) state.form.sections[+d.sectionTitle].title=e.value;
  else if(d.sectionContent!==undefined) state.form.sections[+d.sectionContent].content=e.value;
  else if(d.period || d.rowText) { const [s,r]=(d.period||d.rowText).split(':').map(Number); state.form.sections[s].rows[r][d.period?'period':'text']=e.value; }
  else return;
  dirty();
});
$('#editor').addEventListener('click', guarded(async event=>{
  const b=event.target.closest('button'); if(!b) return;
  const d=b.dataset;
  if(d.tab){state.tab=d.tab; editor();}
  else if(b.id==='save') await save();
  else if(b.id==='approve') await save(true);
  else if(b.id==='render-full') await render('full');
  else if(b.id==='render-mini') await render('mini');
  else if(b.id==='add-section'){$('#section-search').value='';$('#custom-section-title').value='';$('#section-error').textContent='';drawSectionChoices();$('#section-dialog').showModal();$('#section-search').focus();}
  else if(d.addRow!==undefined){
    state.form.sections[+d.addRow].rows.unshift({period:'',text:''});
    dirty();editor();
    $(`[data-period="${d.addRow}:0"]`).focus();
  }
  else if(d.removeRow){const [s,r]=d.removeRow.split(':').map(Number);state.form.sections[s].rows.splice(r,1);dirty();editor();}
  else if(d.removeSection!==undefined){if(window.confirm('Удалить раздел из черновика? Сохранённая версия останется в истории.')){state.form.sections.splice(+d.removeSection,1);dirty();editor();}}
  else if(d.up!==undefined){const i=+d.up;[state.form.sections[i-1],state.form.sections[i]]=[state.form.sections[i],state.form.sections[i-1]];dirty();editor();}
  else if(b.id==='append-addition'){
    const text=$('#addition').value.trim(), [kind,target]=$('#addition-target').value.split(':');if(!text)return;
    if(kind==='field')state.form[target]+=(state.form[target]?'\n\n':'')+text;
    else if(kind==='new'){
      if(state.form.sections.length>=30)throw new Error('В одном резюме допускается до 30 разделов.');
      state.form.sections.push({title:state.sections[+target],content:text,rows:[]});
    }
    else {const s=state.form.sections[+target];s.content+=(s.content?'\n\n':'')+text;}
    dirty();editor();notify('Сведения добавлены в черновик. Проверьте текст и сохраните редакцию.');
  }
  else if(d.compare){
    const candidate=await api('sources/'+d.compare+'/data');state.source=d.compare;
    $('#source-label').textContent=candidate.label;$('#before-source').textContent=fullText(state.form);$('#after-source').textContent=fullText(candidate.data);$('#source-dialog').showModal();
  }
  else if(d.restore){
    if(!canLeave())return;const old=await api(`profiles/${state.current.id}/history/${d.restore}`);
    for(const k of ['name','intro','mini','mini_clients','sections'])state.form[k]=structuredClone(old.data[k]);
    state.tab='full';dirty();editor();notify('Прежний текст загружен в редактор. Сохраните его как новую редакцию.');
  }
}));
$('#close-source').addEventListener('click',()=>$('#source-dialog').close());
$('#new-profile').addEventListener('click',newProfile);
$('#close-sections').addEventListener('click',()=>$('#section-dialog').close());
$('#section-search').addEventListener('input',drawSectionChoices);
$('#section-options').addEventListener('click',guarded(event=>{const b=event.target.closest('[data-section-choice]');if(b)chooseSection(sectionChoices()[+b.dataset.sectionChoice]);}));
$('#add-custom-section').addEventListener('click',guarded(()=>chooseSection($('#custom-section-title').value)));
$('#apply-source').addEventListener('click',guarded(async()=>{
  if(!canLeave())return;
  state.current=await api(`profiles/${state.current.id}/source`,{source_id:state.source,revision:state.current.revision});
  state.form=structuredClone(state.current.data);state.dirty=false;state.tab='full';$('#source-dialog').close();clearPreview();editor();await refreshCatalog();notify('Исходник выбран. Создана новая редакция для проверки.');
}));
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
guarded(async()=>{if(window.ResumeDemo)$('#new-profile').hidden=true;await refreshCatalog();if(state.current)return;const params=new URLSearchParams(location.search),requested=params.get('id');if(params.get('new')==='1'&&!window.ResumeDemo)newProfile();else if(state.catalog.length)await openProfile(state.catalog.find(p=>p.id===requested)?.id||state.catalog[0].id);else newProfile();})();
