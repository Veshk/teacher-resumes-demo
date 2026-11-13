const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusText={approved:'Подтверждено',review:'Нужно сверить',draft:'Черновик'};
const state={people:[],selected:new Set(),busy:false};
const date = value => value ? new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Yekaterinburg'}).format(new Date(value)) : 'Дата неизвестна';
async function api(path,data){
  if(window.ResumeDemo)return window.ResumeDemo.api(path,data);
  const response=await fetch('/resumes/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':$('meta[name="csrf-token"]').content},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Не удалось выполнить запрос.');return result;
}
function message(text){$('#notice').textContent=text;$('#notice').hidden=false;}
const safe=fn=>async event=>{try{await fn(event);}catch(error){message(error.message);}};
function filtered(){
  const q=$('#search').value.toLocaleLowerCase('ru').replaceAll('ё','е').trim(), status=$('#status-filter').value,version=$('#version-filter').value;
  const list=state.people.filter(p=>(!q||`${p.name} ${p.intro}`.toLocaleLowerCase('ru').replaceAll('ё','е').includes(q))&&(status==='all'||p.status===status)&&(version==='all'||version==='full'&&p.has_full||version==='mini'&&p.has_mini||version==='mini-only'&&p.has_mini&&!p.has_full));
  return list.sort($('#sort').value==='updated'?(a,b)=>(b.updated_at||'').localeCompare(a.updated_at||'')||a.name.localeCompare(b.name,'ru'):(a,b)=>a.name.localeCompare(b.name,'ru'));
}
function files(p,kind,label,available){return `<div class="format-line"><span>${label}</span>${available?['pdf','docx'].map(format=>`<button class="format-button" data-file="${p.id}:${kind}:${format}" ${state.busy?'disabled':''} aria-label="${label}: ${format==='pdf'?'PDF':'Word'}, ${esc(p.name)}">${format==='pdf'?'PDF':'Word'}</button>`).join(''):'<small>Не добавлено</small>'}</div>`;}
function draw(){
  const list=filtered();$('#total').textContent=state.people.length;$('#found').textContent=list.length;
  $('#full-count').textContent=list.filter(p=>p.has_full).length;$('#mini-count').textContent=list.filter(p=>p.has_mini).length;
  $('#selection-count').textContent=state.selected.size;$('#collection').disabled=!state.selected.size||state.busy;
  const selectable=list.filter(p=>p.has_mini);$('#select-all').checked=!!selectable.length&&selectable.every(p=>state.selected.has(p.id));$('#select-all').indeterminate=selectable.some(p=>state.selected.has(p.id))&&!$('#select-all').checked;
  $('#people').innerHTML=list.map(p=>`<article class="library-row"><input type="checkbox" data-select="${p.id}" aria-label="Включить ${esc(p.name)} в сборник" ${state.selected.has(p.id)?'checked':''} ${!p.has_mini?'disabled':''}><div class="library-person">${p.has_photo?`<img class="avatar" src="/resumes/files/photo/${p.id}" alt="" loading="lazy">`:`<span class="avatar initials">${esc(p.name.split(' ').slice(0,2).map(x=>x[0]).join(''))}</span>`}<div><button class="person-title" data-read="${p.id}">${esc(p.name)}</button><p class="expertise">${esc(p.intro)}</p></div></div><div class="freshness"><span class="status ${p.status}">${statusText[p.status]}</span><strong>${p.updated_at?'Изменено '+date(p.updated_at):'Дата изменения неизвестна'}</strong><small>${p.checked_at?'Проверено '+date(p.checked_at):'Сведения ещё не подтверждены'}</small></div><div class="file-options">${files(p,'full','Полное',p.has_full)}${files(p,'mini','Мини',p.has_mini)}</div><a class="edit-link" href="${window.ResumeDemo?'./editor.html':'/resumes/editor'}?id=${encodeURIComponent(p.id)}">Редактировать</a></article>`).join('')||'<div class="empty">По вашему запросу ничего не найдено.</div>';
}
async function read(id){
  const p=await api('profiles/'+id),d=p.data;$('#reader-title').textContent=p.name;
  $('#reader-body').innerHTML=`<span class="status ${p.status}">${statusText[p.status]}</span><p class="read-intro">${esc(d.intro||d.mini)}</p>${d.sections.map(s=>`<section><h3>${esc(s.title)}</h3><p>${esc(s.content)}</p>${s.rows.map(r=>`<div class="read-period"><strong>${esc(r.period)}</strong><p>${esc(r.text)}</p></div>`).join('')}</section>`).join('')}${d.mini&&d.intro?`<section><h3>Мини-резюме</h3><p>${esc(d.mini)}</p><p>${esc(d.mini_clients)}</p></section>`:''}<a class="edit-link" href="${window.ResumeDemo?'./editor.html':'/resumes/editor'}?id=${encodeURIComponent(id)}">Перейти к редактированию</a>`;
  $('#reader').showModal();
}
async function download(ids,kind,format){
  if(state.busy)return;state.busy=true;draw();
  $('#download-title').textContent=kind==='collection'?'Сборник мини-резюме':state.people.find(p=>p.id===ids[0]).name;
  $('#download-links').replaceChildren();$('#download-pages').replaceChildren();$('#download-status').textContent='Подготавливаем документ…';$('#download-dialog').showModal();
  try{
    const profiles=ids.map(id=>{const p=state.people.find(p=>p.id===id);return{id,revision:p.revision};});
    const result=await api('render',{kind,profiles});const base=result.base_url||`/resumes/files/export/${result.id}/`;
    $('#download-status').textContent=result.profiles.some(p=>p.status!=='approved')?'Черновик: сведения ещё не подтверждены.':'Сведения подтверждены.';
    if(window.ResumeDemo)$('#download-status').textContent+=' Демонстрационный образец с вымышленными данными.';
    const formats=format?[format,format==='pdf'?'docx':'pdf']:['pdf','docx'];
    $('#download-links').innerHTML=formats.map(f=>`<a href="${base}resume.${f}" download>Скачать ${f==='pdf'?'PDF':'Word'}</a>`).join('');
    $('#download-pages').innerHTML=result.pages.map((page,i)=>`<img src="${base}${page}" alt="Страница ${i+1}" loading="lazy">`).join('');
  }catch(error){$('#download-status').textContent=error.message;}
  finally{state.busy=false;draw();}
}
for(const id of ['search','status-filter','version-filter','sort'])$('#'+id).addEventListener(id==='search'?'input':'change',draw);
$('#select-all').addEventListener('change',e=>{filtered().filter(p=>p.has_mini).forEach(p=>e.target.checked?state.selected.add(p.id):state.selected.delete(p.id));draw();});
$('#people').addEventListener('change',e=>{const id=e.target.dataset.select;if(id){e.target.checked?state.selected.add(id):state.selected.delete(id);draw();}});
$('#people').addEventListener('click',safe(async e=>{const b=e.target.closest('button');if(b?.dataset.read)await read(b.dataset.read);if(b?.dataset.file){const[id,kind,format]=b.dataset.file.split(':');await download([id],kind,format);}}));
$('#collection').addEventListener('click',safe(()=>download(state.people.filter(p=>state.selected.has(p.id)).map(p=>p.id),'collection')));
$('#close-reader').addEventListener('click',()=>$('#reader').close());$('#close-download').addEventListener('click',()=>$('#download-dialog').close());
safe(async()=>{state.people=(await api('profiles')).profiles;draw();})();
