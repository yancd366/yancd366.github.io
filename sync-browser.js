import {readActiveAccount,readScopeState,scopeStoreKey,scopeMediaKey,sameAccount,saveScopeMerge,ACCOUNT_SESSION_KEY} from './account-scope.js';
import {createAccountClient,validateAccountSession} from './account-client.js';
import {browserSyncMetadata} from './sync-metadata.js';
import {createSyncController} from './sync-controller.js';
import {referencedMediaIds} from './activity-media.js';
import {describeImage,MAX_CLOUD_IMAGES,MAX_CLOUD_IMAGE_BYTES} from './cloud-media.js';
import {readScopedImageRecord,readScopedImage,saveScopedImage,saveVerifiedScopedImage} from './media-store.js';
import {sourcePictures,sourcePictureKey,savedSourceMedia,cacheSourcePictures} from './source-media-cache.js';
export function browserSyncContext(){
  const scope=readActiveAccount(localStorage);if(!scope)return null;
  let session;try{session=validateAccountSession(JSON.parse(sessionStorage.getItem(ACCOUNT_SESSION_KEY)));if(!sameAccount(scope,session))return null;}catch{return null;}
  return {scope,session,...readScopeState(localStorage,scope)};
}
const stamp=row=>row?`${row.version||row.createdAt}:${row.blob.size}:${row.blob.type}`:'';
export function createBrowserSync({canApply=()=>true,onStatus=()=>{},onApplied=()=>{}}={}){
  const original=readActiveAccount(localStorage),cache=new Map(),peers=new Map(),tabId=crypto.randomUUID();let closed=false;
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('xundong-sync-presence:'+scopeStoreKey(original)):null;
  const peerBusy=()=>[...peers.values()].some(p=>p.busy&&p.until>Date.now());
  const announce=()=>{if(closed)return;let busy=false;try{const scope=readActiveAccount(localStorage),c=scope?{scope,...readScopeState(localStorage,scope)}:null;busy=Boolean(c&&(c.state.draft?.startedAt||!canApply(c)));}catch{}channel?.postMessage({tabId,busy,until:Date.now()+22000});};
  if(channel)channel.onmessage=e=>{const p=e.data;if(typeof p?.tabId==='string'&&p.tabId!==tabId&&typeof p.busy==='boolean'&&typeof p.until==='number'&&p.until<=Date.now()+25000){peers.set(p.tabId,p);if(p.hello)announce();}};
  const presenceEvents=['input','change','focus','xundong:local-write','xundong:ui-ready'];
  const presenceTimer=setInterval(announce,10000);for(const event of presenceEvents)window.addEventListener(event,announce);
  channel?.postMessage({tabId,busy:false,until:Date.now()+22000,hello:true});announce();
  const sameScope=()=>{try{return sameAccount(original,readActiveAccount(localStorage));}catch{return false;}};
  const controller=createSyncController({
    getContext:browserSyncContext,metadata:browserSyncMetadata,clientFactory:base=>createAccountClient(base),canApply:(c,{manual=false}={})=>!peerBusy()&&!c.state.draft?.startedAt&&(manual||canApply(c)),
    applyLocal:async(raw,next,{manual=false}={})=>{if(!sameScope())throw Error('账号已改变。');const ctx=browserSyncContext();if(peerBusy()||ctx?.state.draft?.startedAt||!manual&&!canApply(ctx))throw Object.assign(Error('有页面正在编辑或训练，稍后再合并云端更新。'),{code:'sync_ui_busy'});saveScopeMerge(localStorage,original,raw,next);},
    onStatus:s=>{if(sameScope())onStatus(s);},onApplied:()=>{if(sameScope())onApplied();},
    async collectMedia(c,meta,{client,signal,check,canCache,upload=true}){
      const scope=scopeMediaKey(c.scope),missing=new Set(),start=Date.now(),media=[];let state=c.state,uploads=0,failedUpload=false;
      if(canCache&&upload){
        meta.sourceFailures||={};const collected=await cacheSourcePictures(state,{read:id=>readScopedImage(scope,id),save:(id,blob)=>saveScopedImage(scope,id,blob),check,maxDownloads:3,skipSource:p=>(meta.sourceFailures[sourcePictureKey(p)]||0)>Date.now()-24*3600000});state=collected.state;
        for(const key of collected.failures)meta.sourceFailures[key]=Date.now();const keys=new Set(sourcePictures(state).map(sourcePictureKey));for(const key of Object.keys(meta.sourceFailures))if(!keys.has(key))delete meta.sourceFailures[key];
      }
      for(const p of sourcePictures(state)){const c=state.captures.find(x=>x.id===p.captureId),saved=savedSourceMedia(c,p);if(!saved||!await readScopedImage(scope,saved.thumbnailId))missing.add(saved?.thumbnailId||'source:'+sourcePictureKey(p));}
      meta.mediaStamps||={};meta.uploadedHashes||={};
      const ids=referencedMediaIds(state),reserved=new Map((meta.remoteMedia||[]).filter(x=>ids.includes(x.id)).map(x=>[x.id,x]));
      for(const id of ids){
        check();const row=await readScopedImageRecord(scope,id),remote=(meta.remoteMedia||[]).find(x=>x.id===id),old=(meta.media||[]).find(x=>x.id===id);
        if(!row){missing.add(id);if(remote)media.push(remote);else if(old&&meta.uploadedHashes[old.sha256])media.push(old);continue;}
        const version=stamp(row),known=meta.mediaStamps[id];let descriptor;
        if(known?.stamp===version)descriptor=known.descriptor;else descriptor=(await describeImage(id,row.blob)).descriptor;
        meta.mediaStamps[id]={stamp:version,descriptor};cache.set(scope+'|'+id,{stamp:version,descriptor});
        const projectedBytes=[...reserved.values()].reduce((n,x)=>n+x.bytes,0)-(reserved.get(id)?.bytes||0)+descriptor.bytes;
        if(reserved.size+(reserved.has(id)?0:1)>MAX_CLOUD_IMAGES||projectedBytes>MAX_CLOUD_IMAGE_BYTES){missing.add(id);if(remote)media.push(remote);continue;}
        reserved.set(id,descriptor);
        const onCloud=meta.uploadedHashes[descriptor.sha256]||remote?.sha256===descriptor.sha256;
        if(onCloud||!upload){media.push(descriptor);continue;}
        if(failedUpload||uploads>=20||Date.now()-start>12000){missing.add(id);if(remote)media.push(remote);continue;}
        try{await client.uploadImage(c.session,id,row.blob,signal);check();uploads++;meta.uploadedHashes[descriptor.sha256]=true;media.push(descriptor);}catch(e){if(e.code==='login_required')throw e;check();failedUpload=true;missing.add(id);if(remote)media.push(remote);}
      }
      return {state,media,missing:missing.size};
    },
    async restoreMedia(media,c,{client,signal,check,preserveLocal=false,forceIds=[]}){
      const scope=scopeMediaKey(c.scope),start=Date.now();let missing=0,downloads=0,failed=false;
      for(const item of media){
        check();const row=await readScopedImageRecord(scope,item.id),version=stamp(row),remembered=cache.get(scope+'|'+item.id);
        if(row){let descriptor=remembered?.stamp===version?remembered.descriptor:(await describeImage(item.id,row.blob)).descriptor;cache.set(scope+'|'+item.id,{stamp:version,descriptor});if(descriptor.sha256===item.sha256||preserveLocal&&!forceIds.includes(item.id))continue;}
        if(failed||downloads>=20||Date.now()-start>12000){missing++;continue;}
        try{const blob=await client.readImage(c.session,item,signal);check();if(stamp(await readScopedImageRecord(scope,item.id))!==version){missing++;continue;}await saveVerifiedScopedImage(scope,item.id,blob);downloads++;cache.delete(scope+'|'+item.id);}catch(e){if(e.code==='login_required')throw e;check();failed=true;missing++;}
      }
      return missing;
    }
  });
  const stop=controller.stop;controller.stop=()=>{if(closed)return;closed=true;channel?.postMessage({tabId,busy:false,until:Date.now()});channel?.close();clearInterval(presenceTimer);for(const event of presenceEvents)window.removeEventListener(event,announce);stop();};return controller;
}
