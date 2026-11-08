// A focused local search session. Photos and questions never enter the browser URL.
let findContext=null,findQuestion='',findDraft='',findEditing=false,findMenuId='',findBusy='',findNotice='',findRemoval=null,findLocation=null,findPopping=false;
function findHistory(view){if(!findContext||!window.history?.pushState)return;window.history.pushState({...window.history.state,whereitisFind:{id:findContext.id,view}},'');}
function openFind(question){
 const value=String(question||'').trim();
 if(!value||!D.findQuery(value)){toast('说出物品名称，比如：我的钥匙在哪儿');return false;}
 if(value.length>200){toast('查找内容请控制在200字以内');return false;}
 if(!findContext){findRemoval=null;findContext={id:webNewId('find'),filter,scroll:app.scrollTop||0};findHistory('find');}
 homeFindText=value;findQuestion=value;findDraft=value;query=value;filter='all';findEditing=false;findMenuId='';findNotice='';findLocation=null;go('find');return true;
}
function findBeforeGo(old,target){
 if(!findContext)return;
 if(old==='find'&&target==='item'&&!findPopping)findHistory('item');
 if(!['find','item','record'].includes(target)){findContext=null;query='';}
}
function findReturnHome(){const previous=findContext;findContext=null;query='';findMenuId='';findLocation=null;findRemoval=null;filter=previous?.filter||'all';go('home');app.scrollTop=previous?.scroll||0;}
function findBack(){
 if(page==='record'){go('item');return;}
 if(window.history?.state?.whereitisFind?.id===findContext?.id){window.history.back();return;}
 if(page==='item')go('find');else findReturnHome();
}
window.addEventListener('popstate',event=>{
 if(!findContext)return;
 findPopping=true;
 try{if(event.state?.whereitisFind?.id===findContext.id)go(event.state.whereitisFind.view==='item'?'item':'find');else findReturnHome();}finally{findPopping=false;}
});
function memoryCardHtml(x,focused=false){
 const menu=focused?'find-menu':'home-remove-menu',opened=focused?findMenuId===x.id:homeRemoveId===x.id;
 const location=x.location||x.storageLocationHint||(x.status==='待收货'?'尚未收货':x.locationState==='missing'?'这次还没找到':'存放位置待补');
 const stamp=x.lastConfirmedAt?date(x.lastConfirmedAt):'';
 const outcome=findContext?.outcomes?.[x.id];
 return `<section class="card memory-card" aria-label="${esc(x.name)}"><div class="memory-card-head"><button type="button" class="memory-open" data-action="detail" data-id="${esc(x.id)}">${x.cover?`<img class="memory-thumb" src="${esc(x.cover)}" alt="${esc(x.name)}照片">`:`<span class="memory-thumb memory-symbol" aria-hidden="true">${x.icon}</span>`}<span class="memory-copy"><b>${esc(x.name)}</b><span class="memory-status">${badge(x)}</span></span></button>${btn('⋯',menu,`data-id="${esc(x.id)}" aria-label="${esc(x.name)}的更多操作" aria-expanded="${opened}"`,'memory-more')}</div>${opened?`<div class="memory-menu-panel" aria-label="移除记录选项">${btn('记错了，移除记录',focused?'find-remove':'home-remove',`data-id="${esc(x.id)}" data-reason="mistake"`,'small')}${btn('已扔掉 / 不再持有',focused?'find-remove':'home-remove',`data-id="${esc(x.id)}" data-reason="disposed"`,'small')}</div>`:''}<div class="memory-position"><span class="memory-position-label">${x.known?'最后确认的位置':x.locationState==='contained'?'已记录的收纳关系':x.locationState==='missing'?'当前位置待确认':x.status==='待收货'?'收货状态':'存放位置'}</span><div class="location">${esc(location)}</div>${stamp?`<p class="muted">${x.known?'确认于':'上次确认于'} ${esc(stamp)}${!x.known&&x.lastLocation?' · '+esc(x.lastLocation):''}</p>`:''}</div>${focused&&x.status!=='待收货'?`<div class="memory-actions">${x.known?btn('这里没找到','find-missing',`data-id="${esc(x.id)}" ${findBusy?'disabled':''}`,'small') :btn(x.locationState==='missing'?'看看其他线索':'查看详细记录','detail',`data-id="${esc(x.id)}"`,'small')}${btn(outcome==='found'?'✓ 已找到':x.known?'找到了':'找到并记位置','find-found',`data-id="${esc(x.id)}" ${findBusy||outcome==='found'?'disabled':''}`,'primary small')}</div>${findLocation?.id===x.id?findLocationForm(x):''}`:''}</section>`;
}
function findLocationForm(x){return `<form id="find-location-form" class="find-location-form" data-id="${esc(x.id)}"><b>在哪里找到的？</b><label class="label" for="find-location-room">空间</label><select id="find-location-room" name="roomId" required><option value="">选择空间</option>${roomOptions(findLocation.roomId)}</select><label class="label" for="find-location-place">具体位置</label><input id="find-location-place" name="placeName" maxlength="200" placeholder="比如：书桌右侧抽屉" value="${esc(findLocation.placeName)}" required><div class="memory-actions">${btn('取消','find-location-cancel','','small')}<button type="submit" class="btn primary small" ${findBusy?'disabled':''}>确认位置</button></div>${findLocation.error?`<p class="action-error" role="alert">${esc(findLocation.error)}</p>`:''}</form>`;}
function findPage(){
 const q=D.findQuery(findQuestion),items=store.items(q),supplies=store.supplyLots(null,q).filter(x=>x.status==='available'),clues=store.sceneClues(q),spaceClues=store.spaceClues(q),total=items.length+supplies.length+clues.length+spaceClues.length;
 const voice=WebVoice.state('find_question');
 app.innerHTML=`<section class="web-find"><div class="find-heading"><span class="eyebrow">查找结果</span>${btn(findEditing?'收起':'改问一下','find-edit',`aria-expanded="${findEditing}"`,'small find-edit')}</div><h1 class="find-question">${esc(findQuestion)}</h1>${findEditing||voice.recording||voice.busy||voice.error?`<form id="find-question-form" class="find-question-form"><label class="label" for="find-question-input">你想找什么？</label><input id="find-question-input" name="question" type="search" maxlength="200" enterkeyhint="search" value="${esc(findDraft)}" required ${voice.busy||voice.recording?'disabled':''}><div class="memory-actions"><button type="submit" class="btn primary" ${voice.busy||voice.recording?'disabled':''}>查找</button>${btn(voice.recording?'■ 说完了':'● 语音','find-voice',voice.busy?'disabled':'')}</div>${WebVoice.html('find_question')}</form>`:''}${findNotice?`<p class="find-notice" role="status">${esc(findNotice)}</p>`:''}${findRemoval?`<div class="find-notice">已移除：${esc(findRemoval.name)}${btn('撤销','find-remove-undo',findBusy?'disabled':'','small')}</div>`:''}<div class="find-results-count">${total?'找到 '+total+' 条相关记录':'暂时没有匹配记录'}</div><div class="stack find-results">${items.map(x=>memoryCardHtml(x,true)).join('')}${supplies.map(x=>`<button type="button" class="card find-clue" data-action="web-supply-detail" data-id="${esc(x.id)}" data-kind="${x.kind}"><span class="badge">${x.kind==='food'?'食物':'药品'} · ${esc(x.remainingLabel)}</span><b>${esc(x.name)}</b><span class="location">${esc(x.location||'位置待补')}</span><span class="muted">${esc(x.dateLabel)} · 查看记录 ›</span></button>`).join('')}${clues.map(x=>`<button type="button" class="card find-clue" data-action="scene-start" data-id="${esc(x.sceneId)}"><span class="badge warn">线索 · 需核实</span><b>${esc(x.name)}</b><span class="location">${esc(x.location)}</span><span class="muted">${esc(x.description)} · 查看分层记录 ›</span></button>`).join('')}${spaceClues.map(x=>`<button type="button" class="card find-clue" data-action="room-overview" data-id="${esc(x.roomId)}"><span class="badge warn">照片线索 · 需核实</span><b>${esc(x.name)}</b><span class="location">${esc(x.roomName)} › ${esc(x.location)}</span><span class="muted">拍摄当时的情况，物品可能已移动 · 查看空间 ›</span></button>`).join('')}${!total?`<div class="find-empty"><span aria-hidden="true">⌕</span><p>还没查到「${esc(q)}」的记录。</p><p class="muted">试试物品的别名、颜色或更短的名称。</p>${btn('换个说法再找','find-edit','','small')}</div>`:''}</div></section>`;
}
async function findAction(action,id){
 if(findBusy||action==='found'&&findContext?.outcomes?.[id]==='found')return;const item=store.item(id);if(!item)throw new Error('这件物品已变化，请重新查找');
 findBusy=id;
 try{
  if(action==='missing'){if(!item.known)return;store.event(id,'missing',null,null,'查找结果：用户确认这里没找到');findNotice='已记下这里没找到，旧位置仍保留为历史。';if(findContext?.outcomes)delete findContext.outcomes[id];}
  else if(action==='found'){if(!item.known){findLocation={id,roomId:'',placeName:''};return;}store.event(id,'found',item.roomId,item.location.split(' › ').slice(1).join(' › '),'查找结果：用户确认在记录位置找到');if(findContext)(findContext.outcomes||={})[id]='found';findNotice='已记录这次找到的位置，查完可点左上角返回。';}
  await webFlush();
 }finally{findBusy='';if(page==='find')findPage();}
}
document.addEventListener('submit',async event=>{
 const form=event.target;
 if(!['home-find-form','find-question-form','find-location-form'].includes(form.id))return;event.preventDefault();
 try{if(form.id==='find-location-form'){
  if(findBusy)return;const values=Object.fromEntries(new FormData(form));findLocation={...findLocation,roomId:values.roomId,placeName:values.placeName,error:''};
  if(!values.roomId||!values.placeName?.trim())throw new Error('请选择空间并填写具体位置');
  findBusy=form.dataset.id;store.event(form.dataset.id,'found',values.roomId,values.placeName,'查找结果：用户记录实际找到的位置');await webFlush();
  if(findContext)(findContext.outcomes||={})[form.dataset.id]='found';findLocation=null;findNotice='已记住找到的位置。';findBusy='';findPage();
 }else{if(homeRecording||homeBusy||WebVoice.state('find_question').recording||WebVoice.state('find_question').busy)return;openFind(new FormData(form).get('question'));}}
 catch(error){findBusy='';if(findLocation){findLocation.error=error.message;findPage();}else toast(error.message);}
});
document.addEventListener('input',event=>{if(event.target.id==='find-question-input'){findDraft=event.target.value;WebVoice.clear('find_question');}if(findLocation&&event.target.id==='find-location-place')findLocation.placeName=event.target.value;});
document.addEventListener('change',event=>{if(findLocation&&event.target.id==='find-location-room')findLocation.roomId=event.target.value;});
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
 try{
  if(action==='find-edit'){findEditing=!findEditing;findDraft=findQuestion;findPage();if(findEditing)document.querySelector('#find-question-input')?.focus();}
  else if(action==='find-voice')await WebVoice.start('find_question',async text=>{if(page==='find')openFind(text);},()=>{if(page==='find')findPage();});
  else if(action==='find-menu'){findMenuId=findMenuId===el.dataset.id?'':el.dataset.id;findPage();}
  else if(action==='find-found'||action==='find-missing')await findAction(action==='find-found'?'found':'missing',el.dataset.id);
  else if(action==='find-location-cancel'){findLocation=null;findPage();}
  else if(action==='find-remove'){
   if(findBusy)return;const item=store.item(el.dataset.id);if(!item)throw new Error('物品已移除');findBusy=item.id;
   try{store.removeItem(item.id,el.dataset.reason);await webFlush();findRemoval={id:item.id,name:item.name};findMenuId='';}finally{findBusy='';if(page==='find')findPage();}
  }else if(action==='find-remove-undo'&&findRemoval){if(findBusy)return;findBusy=findRemoval.id;try{store.restoreItem(findRemoval.id);await webFlush();findRemoval=null;}finally{findBusy='';if(page==='find')findPage();}}
 }catch(error){toast(error.message);}
});
