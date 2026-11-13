/* Только публичная демонстрация: вымышленные данные, без запросов к рабочей базе. */
(() => {
  const storageKey='vesh-resumes-demo-v1';
  let records;
  try{records=JSON.parse(localStorage.getItem(storageKey));}catch{}
  if(!Array.isArray(records)||records.length!==window.RESUME_DEMO_SEED.length)records=structuredClone(window.RESUME_DEMO_SEED);
  const copy=value=>structuredClone(value);
  const editable=d=>JSON.stringify(['name','intro','compiled','mini','mini_clients','sections'].map(k=>d[k]));
  const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(records));}catch{throw new Error('Браузер запретил сохранение демо. Разрешите локальное хранилище или откройте обычную вкладку.');}};
  window.ResumeDemo={api:async(path,body)=>{
    if(path==='profiles')return{profiles:records.map(p=>({id:p.id,name:p.name,revision:p.revision,status:p.status,checked_at:p.checked_at,updated_at:p.updated_at,intro:p.data.intro||p.data.mini,has_full:!!p.data.template,has_mini:!!p.data.mini,has_photo:false,sources:0})),unmatched:[]};
    if(path==='render'){
      const profiles=body.profiles.map(v=>{const p=records.find(x=>x.id===v.id);if(!p||p.revision!==v.revision)throw new Error('Карточка изменилась. Обновите страницу.');return p;});
      for(const p of profiles){const seed=window.RESUME_DEMO_SEED.find(x=>x.id===p.id);if(editable(p.data)!==editable(seed.data))throw new Error('Правки сохранены в этом браузере. Сборка Word/PDF из изменённого текста требует серверной версии. В демо доступны готовые образцы; кнопка «Сбросить демо» вернёт исходные примеры.');}
      if(body.kind==='collection'&&profiles.length!==records.length)throw new Error('В демонстрации подготовлен образец сборника всех шести карточек. Выберите все карточки. Сборник произвольного состава работает в серверном прототипе.');
      const key=body.kind==='collection'?'collection':profiles[0].id+'-'+body.kind;
      const result=copy(window.RESUME_DEMO_EXPORTS[key]);if(!result)throw new Error('Для этой карточки такой образец не подготовлен.');
      result.profiles=profiles.map(p=>({id:p.id,name:p.name,revision:p.revision,status:p.status}));return result;
    }
    const parts=path.split('/');const p=records.find(x=>x.id===parts[1]);if(parts[0]!=='profiles'||!p)throw new Error('Карточка не найдена.');
    if(parts[2]==='history'){const old=p.history.find(h=>h.number===Number(parts[3]));if(!old)throw new Error('Редакция не найдена.');return copy(old);}
    if(body){
      if(body.revision!==p.revision)throw new Error('Карточка уже изменилась. Обновите страницу.');
      if(!body.data?.name?.trim())throw new Error('Укажите имя преподавателя.');
      const stamp=new Date().toISOString();p.data=copy(body.data);p.name=p.data.name;p.revision++;p.updated_at=stamp;p.status=body.approve?'approved':'draft';p.checked_at=body.approve?stamp:null;
      p.history.unshift({number:p.revision,status:p.status,checked_at:p.checked_at,at:stamp,actor:'Пользователь демонстрации',action:body.approve?'Сведения подтверждены в демо':'Черновик сохранён в браузере',data:copy(p.data)});persist();
    }
    return copy(p);
  }};
  document.addEventListener('DOMContentLoaded',()=>{
    const banner=document.createElement('aside');banner.className='demo-banner';
    const info=document.createElement('span');info.textContent='Демонстрация на вымышленных данных. Правки сохраняются только в этом браузере. Word и PDF — готовые образцы.';
    const reset=document.createElement('button');reset.textContent='Сбросить демо';reset.onclick=()=>{if(confirm('Удалить ваши изменения демонстрационных карточек в этом браузере?')){localStorage.removeItem(storageKey);location.reload();}};
    banner.append(info,reset);document.body.prepend(banner);
  });
})();
