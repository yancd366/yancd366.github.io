import {ACTIVE_ACCOUNT_KEY,ACCOUNT_SESSION_KEY,ACCOUNT_ENDPOINT_KEY,accountOrigin,validateAccountScope,readActiveAccount,readScopeState,scopeStoreKey,scopeMediaKey,sameAccount,activateAccount,mergePreview,saveScopeMerge} from './account-scope.js';
import {ACCOUNT_SERVICE_ORIGIN} from './account-config.js';
import {createAccountClient,validateAccountSession} from './account-client.js';
import {cloudTextState,cloudTextSummary,cloudRestorePreview} from './cloud-backup.js';
import {accountPortalHTML} from './account-view.js';
import {referencedMediaIds} from './activity-media.js';
import {readScopedImage,saveScopedImage,saveVerifiedScopedImage} from './media-store.js';
import {sourcePictures,cacheSourcePictures} from './source-media-cache.js';
import {MAX_CLOUD_IMAGES,MAX_CLOUD_IMAGE_BYTES} from './cloud-media.js';
import {createBrowserSync} from './sync-browser.js';
import {browserSyncMetadata} from './sync-metadata.js';
import {syncPanelHTML} from './sync-view.js';

const root=document.querySelector('#account-root');
let scope=null,session=null,endpoint='',localError=false,busy=false,generation=0,controller=null;
let error='',notice='',preview=null,loginCandidate=null,logoutPreview=false,deleteId=null,backups=null,nextCursor=null;
let syncController=null,syncMeta=null,syncStatus={mode:'off'},syncPreview=null,syncTimer=null,syncDebounce=null,syncGeneration=0,syncStatusGeneration=0;
function stopSync(){syncGeneration++;syncController?.stop();syncController=null;clearInterval(syncTimer);clearTimeout(syncDebounce);syncMeta=null;syncStatus={mode:'off'};syncPreview=null;}
function updateSyncPanel(force=false){
  if(!scope)return;const old=root.querySelector('[data-sync-panel]');
  if(!force&&syncPreview&&old){const el=old.querySelector('[data-sync-status]');if(el)el.textContent=syncStatus.error||'核对后再开启同步';return;}
  const markup=syncPanelHTML(syncMeta,syncStatus,{session:Boolean(session),preview:syncPreview});if(old)old.outerHTML=markup;else root.querySelector('.account-overview')?.insertAdjacentHTML('afterend',markup);
  if(busy)for(const el of root.querySelectorAll('[data-sync-panel] button,[data-sync-panel] input'))el.disabled=true;
}
async function startSync(){
  stopSync();if(!scope)return;const current=scope,ticket=syncGeneration,owner=scopeStoreKey(current);syncMeta=await browserSyncMetadata.load(current);if(ticket!==syncGeneration||scopeStoreKey(scope)!==owner)return;syncStatus={mode:syncMeta.enabled?'pending':'off'};
  syncController=createBrowserSync({canApply:()=>!busy&&!preview&&!loginCandidate&&!logoutPreview&&!deleteId&&!syncPreview&&!root.querySelector('#account-login-form [name=loginCode]')?.value,
    onApplied:()=>{if(ticket===syncGeneration)paint();},
    onStatus:s=>{if(ticket!==syncGeneration)return;syncStatus=s;const seq=++syncStatusGeneration;browserSyncMetadata.load(current).then(m=>{if(ticket!==syncGeneration||seq!==syncStatusGeneration)return;syncMeta=m;updateSyncPanel();}).catch(()=>{});}
  });updateSyncPanel();syncController.tick();syncTimer=setInterval(()=>{if(!document.hidden)syncController?.tick();},15000);
}
function wakeSync(){clearTimeout(syncDebounce);syncDebounce=setTimeout(()=>{if(!document.hidden)syncController?.tick();},1200);}
function refreshIdentity(){
  localError=false;scope=null;
  try{scope=readActiveAccount(localStorage);readScopeState(localStorage,scope);}catch{localError=true;}
  try{endpoint=accountOrigin(ACCOUNT_SERVICE_ORIGIN)||accountOrigin(localStorage.getItem(ACCOUNT_ENDPOINT_KEY))||scope?.serviceOrigin||'';}catch{endpoint=scope?.serviceOrigin||'';}
  session=null;
  try{const s=validateAccountSession(JSON.parse(sessionStorage.getItem(ACCOUNT_SESSION_KEY)));if(sameAccount(s,scope))session=s;else sessionStorage.removeItem(ACCOUNT_SESSION_KEY);}catch{try{sessionStorage.removeItem(ACCOUNT_SESSION_KEY);}catch{}}
}
function paint(){
  let summary={};try{summary=cloudTextSummary(readScopeState(localStorage,scope).state);}catch{localError=true;}
  root.innerHTML=accountPortalHTML({scope,session,endpoint,localError,summary,error,notice,preview,loginCandidate,logoutPreview,deleteId,backups,nextCursor});
  updateSyncPanel(true);
  root.classList.toggle('account-workflow',Boolean(preview||loginCandidate||logoutPreview||deleteId));
  if(localError&&!scope)root.insertAdjacentHTML('afterbegin','<section class="card"><p>本机账号信息异常，原始资料没有被覆盖。</p><button class="secondary" data-account="logout-preview">回到游客资料</button></section>');
  root.setAttribute('aria-busy',String(busy));for(const e of root.querySelectorAll('button,input'))e.disabled=busy;
  if(localError)for(const e of root.querySelectorAll('[data-account=upload-preview],[data-account=guest-preview],#account-preview-confirm button'))e.disabled=true;
  if(busy)root.insertAdjacentHTML('beforeend','<div class="account-busy" role="status">正在处理，请稍候…</div>');
  const attention=error?root.querySelector('[role=alert]'):notice?root.querySelector('.account-success'):syncPreview?root.querySelector('.sync-enable-preview'):root.querySelector('.account-preview');attention?.scrollIntoView({block:'start'});
  window.dispatchEvent(new Event('xundong:ui-ready'));
}
function clearPanels(){preview=null;loginCandidate=null;logoutPreview=false;deleteId=null;}
function currentRaw(){if(localError)throw Error('本机资料读取异常，请先保留原数据并导出备份。');return readScopeState(localStorage,scope);}
function requireSession(){if(!session)throw Error('请先登录当前账号。');session=validateAccountSession(session);if(!sameAccount(session,scope))throw Error('账号已改变，请重新登录。');return session;}
async function run(task){
  if(busy)return;busy=true;error='';notice='';const ticket=++generation,startingScope=scope;controller=new AbortController();
  const check=({allowInvalid=false}={})=>{if(ticket!==generation||!allowInvalid&&!sameAccount(readActiveAccount(localStorage),startingScope))throw Error('账号或资料已在其他页面更新，请重新预览。');};
  paint();try{await task({signal:controller.signal,check});}catch(e){if(ticket===generation){error=e.message||'操作未完成，本机资料仍保留。';if(e.code==='login_required'){session=null;try{sessionStorage.removeItem(ACCOUNT_SESSION_KEY);}catch{}}}}finally{if(ticket===generation){busy=false;controller=null;paint();}}
}
async function fetchBackups(signal,check,more=false){const s=requireSession(),r=await createAccountClient(s.serviceOrigin).list(s,more?nextCursor||'':'',signal);check();backups=more?[...backups,...r.items.filter(x=>!backups.some(b=>b.id===x.id))]:r.items;nextCursor=r.nextCursor;}
function prepareLocal(kind){
  requireSession();const current=currentRaw(),source=kind==='guest'?readScopeState(localStorage,null):current;
  const clean=cloudTextState(source.state),merged=kind==='guest'?mergePreview(current.state,clean):null;
  const imageCount=referencedMediaIds(clean).length+sourcePictures(clean).filter(p=>!clean.captures.find(c=>c.id===p.captureId)?.sourceMedia?.some(x=>x.kind===p.kind&&(x.kind==='image_post'?x.imageIndex===p.imageIndex:x.segmentId===p.segmentId)&&x.sourceJobId===p.sourceJobId&&x.sourceIndex===p.sourceIndex)).length;
  clearPanels();preview={kind,targetName:scope.displayName,state:clean,summary:cloudTextSummary(clean),imageCount,raw:current.raw,guestRaw:kind==='guest'?source.raw:undefined,added:merged?.added,conflicts:merged?.conflicts};
}
async function savePreview(form,{signal,check}){
  if(!preview||!form.get('confirmed'))throw Error('请先核对并勾选确认。');const p=preview,s=requireSession();check();
  if(p.kind==='upload'){
    if(currentRaw().raw!==p.raw)throw Error('本机记录已改变，请重新核对上传范围。');
    const client=createAccountClient(s.serviceOrigin),destination=scopeMediaKey(s);let media,cache=null,state=p.state;
    if(form.get('cloudImages')){
      if(p.imageCount>MAX_CLOUD_IMAGES)throw Error('一次最多备份 200 张配图，请先整理范围。');
      cache=await cacheSourcePictures(currentRaw().state,{read:id=>readScopedImage(destination,id),save:(id,blob)=>saveScopedImage(destination,id,blob),check});
      if(cache.missing)throw Error(`有 ${cache.missing} 张来源预览已过期或无法读取；可先取消配图只备份文字，或重新解析后重试。`);
      state=cloudTextState(cache.state);const ids=referencedMediaIds(state);let bytes=0;
      for(const id of ids){check();const blob=await readScopedImage(destination,id);if(!blob)throw Error('本机有配图缺失，可先取消配图只备份文字。');bytes+=blob.size;}
      if(bytes>MAX_CLOUD_IMAGE_BYTES)throw Error('配图总量超过 50 MB，请先整理范围。');media=[];
      for(const id of ids){check();const blob=await readScopedImage(destination,id);media.push(await client.uploadImage(s,id,blob,signal));}
    }
    await client.upload(s,state,signal,media);check();if(cache)saveScopeMerge(localStorage,scope,p.raw,cache.state);
    clearPanels();notice=media?`云备份已保存，含 ${media.length} 张长期配图；没有上传当前训练草稿。`:'文字云备份已保存；未包含图片和当前训练草稿。';backups=null;return;
  }
  const current=currentRaw();if(current.raw!==p.raw||p.kind==='guest'&&readScopeState(localStorage,null).raw!==p.guestRaw)throw Error('本机资料已改变，请重新预览。');
  let incoming=p.state;const destination=scopeMediaKey(s);let copied=0,missing=0;
  if(p.kind==='guest'&&form.get('images')){
    const guest=readScopeState(localStorage,null),cache=await cacheSourcePictures(guest.state,{read:async id=>await readScopedImage('guest',id)||await readScopedImage(destination,id),save:(id,blob)=>saveScopedImage(destination,id,blob),check});incoming=cloudTextState(cache.state);missing+=cache.missing;
  }
  const result=mergePreview(current.state,incoming,Boolean(form.get('profile')));
  if(p.kind==='guest'&&form.get('images')){
    try{for(const id of referencedMediaIds(incoming)){check();if(await readScopedImage(destination,id))continue;const blob=await readScopedImage('guest',id);if(!blob){missing++;continue;}check();await saveVerifiedScopedImage(destination,id,blob);copied++;}}catch{throw Error('配图复制尚未完成，文字还没有写入。可取消复制配图后重试；游客原图仍保留。');}
  }
  if(p.kind==='restore'&&form.get('restoreImages')){try{const client=createAccountClient(s.serviceOrigin);for(const item of p.media||[]){check();if(await readScopedImage(destination,item.id))continue;const blob=await client.readImage(s,item,signal);check();await saveVerifiedScopedImage(destination,item.id,blob);copied++;}}catch{throw Error('配图尚未恢复完整，文字没有合并。可取消恢复配图后只恢复文字，再另行重试图片。');}}
  check();saveScopeMerge(localStorage,scope,p.raw,result.state,{...(p.kind==='guest'?{guestRaw:p.guestRaw}:{})});clearPanels();
  window.dispatchEvent(new Event('xundong:local-write'));
  notice=`已合并 ${result.added} 条到当前账号本机${result.conflicts?`；${result.conflicts} 条同编号内容不同，保留本机版本`:''}${p.kind==='guest'&&form.get('images')?`；复制 ${copied} 张配图${missing?`，${missing} 张本机已缺失`:''}`:p.kind==='restore'&&form.get('restoreImages')?`；恢复 ${copied} 张配图，同编号本机图保留`:''}。尚未上传云端。`;
}
root.addEventListener('submit',e=>{
  e.preventDefault();if(busy)return;const form=e.target,f=new FormData(form);
  if(form.id==='account-login-form'){
    const base=String(f.get('serviceOrigin')||'').trim(),code=String(f.get('loginCode')||'').trim();form.querySelector('[name=loginCode]').value='';
    endpoint=accountOrigin(base)||'';clearPanels();
    run(async({signal,check})=>{const client=createAccountClient(base),result=await client.login(code,signal);check();clearPanels();loginCandidate=result;});
  }
  if(form.id==='account-preview-confirm')run(ctx=>savePreview(f,ctx));
  if(form.id==='sync-enable-form')run(async({check})=>{if(!syncPreview||!f.get('confirmed'))throw Error('请先核对同步范围并勾选确认。');check();await syncController.enable({mode:String(f.get('mode')||'merge'),expectedRaw:syncPreview.local.raw});check();syncPreview=null;syncMeta=await browserSyncMetadata.load(scope);notice='自动同步已开启；当前训练草稿与设备密钥仍留在本机。';wakeSync();});
  if(form.id==='sync-recover-form')run(async({check})=>{if(!syncPreview?.recovery||!f.get('confirmed'))throw Error('请先核对恢复范围。');check();await syncController.recoverLocal({expectedRaw:syncPreview.local.raw});check();syncPreview=null;syncMeta=await browserSyncMetadata.load(scope);notice='已恢复本机资料；待传修改仍会核对后同步。';wakeSync();});
});
root.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button||busy)return;
  const action=button.dataset.account;
  if(button.dataset.syncAction||button.dataset.syncChoice){
    run(async({check})=>{if(!syncController)throw Error('同步界面正在准备，请稍后重试。');check();
      if(button.dataset.syncChoice){await syncController.choose(button.dataset.syncChoice,button.dataset.syncSide);syncMeta=await browserSyncMetadata.load(scope);}
      else{switch(button.dataset.syncAction){
        case 'prepare':clearPanels();syncPreview=await syncController.preview();check();break;
        case 'prepare-recovery':clearPanels();syncPreview={...await syncController.preview(),recovery:true};check();break;
        case 'cancel':syncPreview=null;break;
        case 'pause':await syncController.disable();syncMeta=await browserSyncMetadata.load(scope);notice='自动同步已暂停；本机资料和待传队列仍保留。';break;
        case 'refresh':await syncController.refreshConflicts();syncMeta=await browserSyncMetadata.load(scope);break;
        case 'now':case 'submit-choices':await syncController.tick({manual:true});syncMeta=await browserSyncMetadata.load(scope);break;
      }}
    });return;
  }
  if(action==='cancel-preview'||action==='cancel-login'){clearPanels();error='';paint();return;}
  if(action==='enter'){
    run(async({check})=>{const candidate=validateAccountSession(loginCandidate);check();stopSync();const old=sessionStorage.getItem(ACCOUNT_SESSION_KEY);sessionStorage.setItem(ACCOUNT_SESSION_KEY,JSON.stringify(candidate));try{activateAccount(localStorage,candidate);}catch(error){if(old)sessionStorage.setItem(ACCOUNT_SESSION_KEY,old);else sessionStorage.removeItem(ACCOUNT_SESSION_KEY);throw error;}scope=validateAccountScope(candidate);session=candidate;try{localStorage.setItem(ACCOUNT_ENDPOINT_KEY,candidate.serviceOrigin);}catch{}endpoint=candidate.serviceOrigin;localError=false;clearPanels();backups=null;nextCursor=null;notice='已切换到该账号；没有自动导入游客资料或上传内容。';paint();await startSync();});return;
  }
  if(action==='logout-preview'){clearPanels();logoutPreview=true;paint();return;}
  if(action==='logout'){
    run(async({signal,check})=>{stopSync();let revoked=false;if(session)try{await createAccountClient(session.serviceOrigin).logout(session,signal);revoked=true;}catch{}check({allowInvalid:localError});sessionStorage.removeItem(ACCOUNT_SESSION_KEY);activateAccount(localStorage,null);scope=null;session=null;clearPanels();backups=null;nextCursor=null;localError=false;notice=revoked?'已退出账号并撤销本次云端会话；原账号资料仍保留。':'已退出本机账号；云端会话撤销未确认，最多十二小时后到期。';});return;
  }
  if(action==='refresh'||action==='more'){run(async({signal,check})=>{clearPanels();await fetchBackups(signal,check,action==='more');});return;}
  if(action==='upload-preview'||action==='guest-preview'){run(async({check})=>{check();prepareLocal(action==='guest-preview'?'guest':'upload');});return;}
  if(button.dataset.accountRead){run(async({signal,check})=>{const s=requireSession(),r=await createAccountClient(s.serviceOrigin).read(s,button.dataset.accountRead,signal);check();const incoming=cloudRestorePreview(r),current=currentRaw(),merged=mergePreview(current.state,incoming.state);clearPanels();preview={kind:'restore',targetName:scope.displayName,state:incoming.state,summary:incoming.summary,createdAt:incoming.createdAt,includesImages:incoming.includesImages,media:incoming.media,raw:current.raw,added:merged.added,conflicts:merged.conflicts};});return;}
  if(button.dataset.accountDelete){clearPanels();deleteId=button.dataset.accountDelete;paint();return;}
  if(action==='delete-confirm'){run(async({signal,check})=>{const s=requireSession();if(!deleteId)throw Error('请重新选择备份。');await createAccountClient(s.serviceOrigin).remove(s,deleteId,signal);check();clearPanels();backups=null;notice='已删除这一份云备份，本机记录没有改变。';});}
});
window.addEventListener('storage',e=>{
  if(![ACTIVE_ACCOUNT_KEY,scopeStoreKey(scope),scopeStoreKey(null)].includes(e.key)&&e.key!==null)return;
  generation++;controller?.abort();controller=null;busy=false;stopSync();clearPanels();backups=null;nextCursor=null;refreshIdentity();error='另一页面更新了账号或资料，旧预览已取消；请重新核对。';notice='';paint();startSync().catch(()=>{});
});
window.addEventListener('pagehide',()=>{generation++;controller?.abort();stopSync();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
refreshIdentity();paint();
startSync().catch(e=>{syncStatus={mode:'error',error:e.message};updateSyncPanel();});
window.addEventListener('xundong:local-write',wakeSync);window.addEventListener('online',wakeSync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)wakeSync();});
// A direct visit to the account page should also prepare its offline shell.
if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
