// Foreground/offline queue orchestration; pure projection/merge lives in sync-data.js.
import {scopeStoreKey} from './account-scope.js';
import {defaultSyncMeta} from './sync-metadata.js';
import {syncProjection,syncState,syncHash,makeSyncChanges,applySyncedState,stableJSON} from './sync-data.js';
export function createSyncController({getContext,metadata,clientFactory,collectMedia=async()=>({media:[],missing:0}),restoreMedia=async()=>0,canApply=()=>true,applyLocal,onStatus=()=>{},onApplied=()=>{}}){
  let running=false,stopped=false,paused=false,abort=null;
  const status=(mode,meta,extra={})=>onStatus({mode,conflicts:meta?.conflicts?.length||0,lastCompleteAt:meta?.lastCompleteAt,...extra});
  const context=()=>{const c=getContext();if(!c?.scope||!c.session)throw Object.assign(Error('请登录当前账号以同步。'),{code:'login_required'});return c;};
  const guard=scope=>{if(stopped||paused||scopeStoreKey(context().scope)!==scopeStoreKey(scope))throw Error('账号已改变或同步已暂停。');};
  async function locked(scope,fn,wait=false){const locks=globalThis.navigator?.locks;if(locks?.request)return locks.request('xundong-sync:'+scopeStoreKey(scope),{mode:'exclusive',...(wait?{}:{ifAvailable:true})},lock=>lock?fn():undefined);return fn();}
  async function hashesFor(projection){const result={};for(const [k,r]of Object.entries(projection))result[k]=await syncHash(r.data);return result;}
  async function baselineFor(remote,state,media){const p=syncProjection(state,media),hashes=await hashesFor(p),base={};for(const [key,row]of Object.entries(remote.documents||{})){if(row.deleted&&!p[key])base[key]={revision:row.revision,hash:null,deleted:true};else if(!row.deleted&&p[key]&&stableJSON(p[key].data)===stableJSON(row.data))base[key]={revision:row.revision,hash:hashes[key],deleted:false};}return base;}
  function validateRemote(r){if(!r||r.unchanged||r.protocol!==1||!Number.isSafeInteger(r.cursor)||r.cursor<0||!r.documents||Array.isArray(r.documents)||Object.keys(r.documents).length>10000||!Array.isArray(r.conflicts))throw Error('云端同步格式无效。');syncState(r.documents);return r;}
  function checkRemoteVersion(remote,meta){
    const known=Math.max(meta.maxCursor||0,meta.cursor||0,...Object.values(meta.baseline||{}).map(x=>x.revision||0));
    if(remote.cursor<known||!remote.unchanged&&Object.entries(meta.baseline||{}).some(([key,row])=>row.revision>0&&!Object.hasOwn(remote.documents,key)))throw Object.assign(Error('云端同步版本发生回退或缺少删除标记。已保留本机资料，请先导出备份，再恢复云端版本。'),{code:'sync_reset'});
    meta.maxCursor=Math.max(known,remote.cursor);
  }
  const mediaRows=r=>Object.values(r.documents||{}).filter(d=>d.kind==='media'&&!d.deleted).map(d=>d.data);
  const openConflicts=r=>r.conflicts.filter(c=>!c.resolvedAt).map(c=>({...c,currentRemote:r.documents[c.key]||{deleted:true,data:null,revision:0}}));
  async function save(scope,meta){guard(scope);await metadata.save(scope,meta);}
  async function applyPendingChoices(scope,meta,manual){
    if(!meta.pendingApply)return true;let c=context();if(c.state.draft?.startedAt||!canApply(c,{manual})){status('deferred',meta);return false;}
    const p=syncProjection(c.state,meta.media);for(const row of meta.pendingApply){const current=p[row.key],hash=current?await syncHash(current.data):null;if(hash!==row.originalHash)continue;
      if(row.document.kind==='media'&&!row.document.deleted){await restoreMedia([row.document.data],c,{client:clientFactory(c.session.serviceOrigin),signal:abort?.signal,check:()=>guard(scope),forceIds:[row.document.id]});meta.media=meta.media.filter(x=>x.id!==row.document.id);meta.media.push(row.document.data);}
      if(row.document.deleted)delete p[row.key];else p[row.key]=row.document;
    }
    const next=applySyncedState(c.state,syncState(p));guard(scope);await applyLocal(c.raw,next,{manual});meta.pendingApply=null;await save(scope,meta);onApplied();return true;
  }
  async function runTick(manual=false){
    const start=context(),scope=start.scope;return locked(scope,async()=>{
      let meta=await metadata.load(scope);if(!meta.enabled||!meta.initialized){status('off',meta);return;}
      if(start.raw===null||meta.localMissing)throw Object.assign(Error('本机资料缓存缺失，未向云端发送删除。请先从云端恢复；待传队列仍保留。'),{code:'sync_local_missing'});
      if(typeof window!=='undefined'&&!globalThis.navigator?.locks?.request&&!manual){status('manual',meta);return;}
      if(meta.pausedError){
        if(meta.pausedErrorCode==='sync_reset'){if(!manual){status('error',meta,{error:meta.pausedError});return;}const remote=await clientFactory(start.session.serviceOrigin).syncRead(start.session);checkRemoteVersion(remote,meta);}
        const hash=await syncHash(syncProjection(context().state,meta.media));if(!manual&&hash===meta.rejectedHash){status('error',meta,{error:meta.pausedError});return;}meta.pausedError=null;meta.pausedErrorCode=null;await save(scope,meta);
      }
      if(manual)meta.sourceFailures={};
      if(globalThis.navigator?.onLine===false){status('offline',meta);return;}
      const client=clientFactory(start.session.serviceOrigin);abort=new AbortController();const signal=abort.signal;
      status('syncing',meta);
      if(!await applyPendingChoices(scope,meta,manual))return;
      let c=context(),collection=await collectMedia(c,meta,{client,signal,check:()=>guard(scope),canCache:canApply(c,{manual})});guard(scope);
      meta.media=collection.media;meta.missingImages=collection.missing||0;
      if(collection.state&&stableJSON(collection.state)!==stableJSON(c.state)){
        if(!canApply(context(),{manual})){await save(scope,meta);status('deferred',meta);return;}
        await applyLocal(c.raw,collection.state,{manual});onApplied();c=context();
      }
      if(!meta.pending){
        let staged=c.state,projection=syncProjection(staged,meta.media),originalHashes=await hashesFor(projection),resolutions=[];
        const unresolved=meta.conflicts.filter(x=>!meta.choices[x.id]);
        if(unresolved.length){await save(scope,meta);status('conflict',meta);return;}
        const groups=new Map();for(const conflict of meta.conflicts){if(!groups.has(conflict.key))groups.set(conflict.key,[]);groups.get(conflict.key).push(conflict);}
        const selections=[];for(const group of groups.values()){
          const mine=group.find(x=>meta.choices[x.id]==='local'),selected=mine||group[0],remote=selected.currentRemote||selected.remote,document=mine?{kind:mine.kind,id:mine.recordId,data:mine.local.data,deleted:mine.local.deleted}:{kind:selected.kind,id:selected.recordId,...remote};
          for(const conflict of group)resolutions.push({conflictId:conflict.id,choice:meta.choices[conflict.id],expectedRevision:(conflict.currentRemote||conflict.remote).revision||0});
          selections.push({key:selected.key,document,remote:!mine});if(document.deleted)delete projection[selected.key];else projection[selected.key]=document;
        }
        if(resolutions.length){try{staged=applySyncedState(staged,syncState(projection));}catch{throw Error('冲突涉及关联条目，请先调整相关内容再提交选择；双方版本仍保留。');}}
        const adjusted=structuredClone(meta.baseline);
        for(const selected of selections)if(selected.remote){const remote=selected.document;adjusted[selected.key]={revision:remote.revision||0,hash:remote.deleted?null:await syncHash(remote.data),deleted:Boolean(remote.deleted)};}
        const delta=await makeSyncChanges(staged,adjusted,meta.media);
        if(delta.changes.length||resolutions.length){meta.pending={op:{protocol:1,confirmed:true,operationId:crypto.randomUUID(),deviceId:meta.deviceId,changes:delta.changes,resolutions},originalHashes,remoteChoices:selections.filter(x=>x.remote),overrides:selections.map(x=>({...x,originalHash:originalHashes[x.key]??null}))};await save(scope,meta);}
      }
      if(meta.pending){
        const pending=meta.pending,response=await client.syncPush(context().session,pending.op,signal);guard(scope);
        if(response.status==='conflict'){
          const remote=validateRemote(await client.syncRead(context().session,undefined,signal));guard(scope);checkRemoteVersion(remote,meta);meta.conflicts=openConflicts(remote);meta.choices={};meta.pending=null;await save(scope,meta);status('conflict',meta);return;
        }
        meta.maxCursor=Math.max(meta.maxCursor||0,response.cursor);for(const ack of response.accepted){const row=pending.op.changes.find(x=>x.kind+'/'+x.id===ack.key);if(!row)throw Error('同步回执与待传队列不一致。');if(!row.ensure)meta.baseline[ack.key]={revision:ack.revision,hash:row.deleted?null:await syncHash(row.data),deleted:row.deleted};}
        for(const row of pending.remoteChoices){const d=row.document;meta.baseline[row.key]={revision:d.revision||0,hash:d.deleted?null:await syncHash(d.data),deleted:Boolean(d.deleted)};}
        meta.pendingApply=pending.overrides?.length?pending.overrides:null;meta.pending=null;meta.conflicts=[];meta.choices={};await save(scope,meta);
        if(!await applyPendingChoices(scope,meta,manual))return;
      }
      const remote=await client.syncRead(context().session,meta.cursor||undefined,signal);guard(scope);
      checkRemoteVersion(remote,meta);
      if(!remote.unchanged){
        validateRemote(remote);meta.conflicts=openConflicts(remote);if(meta.conflicts.length){meta.choices={};await save(scope,meta);status('conflict',meta);return;}
        c=context();const fresh=await collectMedia(c,meta,{client,signal,check:()=>guard(scope),canCache:false});meta.media=fresh.media;meta.missingImages=fresh.missing||0;
        const dirty=await makeSyncChanges(c.state,meta.baseline,meta.media);if(dirty.changes.length){await save(scope,meta);status('pending',meta,{pending:dirty.changes.length});return;}
        if(c.state.draft?.startedAt||!canApply(c,{manual})){await save(scope,meta);status('deferred',meta);return;}
        const media=mediaRows(remote),miss=await restoreMedia(media,c,{client,signal,check:()=>guard(scope)});guard(scope);c=context();
        const after=await makeSyncChanges(c.state,meta.baseline,meta.media);if(after.changes.length){status('pending',meta);return;}
        const next=applySyncedState(c.state,syncState(remote.documents));await applyLocal(c.raw,next,{manual});onApplied();
        meta.media=media;meta.remoteMedia=media;const checked=await collectMedia(context(),meta,{client,signal,check:()=>guard(scope),canCache:false,upload:false});meta.missingImages=Math.max(miss,checked.missing||0);meta.baseline=await baselineFor(remote,next,media);meta.cursor=remote.cursor;await save(scope,meta);
      }else if(meta.remoteMedia?.length){meta.missingImages=Math.max(meta.missingImages||0,await restoreMedia(meta.remoteMedia,context(),{client,signal,check:()=>guard(scope)}));}
      if(meta.missingImages){await save(scope,meta);status('images',meta,{missingImages:meta.missingImages});return;}
      meta.lastCompleteAt=new Date().toISOString();meta.lastError=null;await save(scope,meta);status('complete',meta);
    });
  }
  return {
    async tick({manual=false}={}){if(running||stopped||paused)return;running=true;try{await runTick(manual);}catch(e){if(!stopped&&!paused){
      try{const c=context(),meta=await metadata.load(c.scope);
        if(e.code==='sync_conflict_changed'){const remote=validateRemote(await clientFactory(c.session.serviceOrigin).syncRead(c.session));guard(c.scope);meta.pending=null;meta.choices={};meta.conflicts=openConflicts(remote);await save(c.scope,meta);status('conflict',meta);return;}
        if(['invalid_sync','sync_dependencies','sync_conflict_large','sync_size','sync_conflict_limit','media_missing','sync_reset','sync_local_missing'].includes(e.code)){if(!['sync_reset','sync_local_missing'].includes(e.code))meta.pending=null;meta.localMissing=e.code==='sync_local_missing'||meta.localMissing;meta.pausedError=e.message;meta.pausedErrorCode=e.code;meta.rejectedHash=await syncHash(syncProjection(c.state,meta.media));await save(c.scope,meta);}
      }catch{}status(e.code==='login_required'?'login':e.code==='sync_ui_busy'?'deferred':'error',null,{error:e.message});
    }}finally{running=false;abort=null;}},
    async preview(){const c=context(),r=validateRemote(await clientFactory(c.session.serviceOrigin).syncRead(c.session));if(stopped||scopeStoreKey(context().scope)!==scopeStoreKey(c.scope))throw Error('账号已改变。');return {remote:r,local:c,hasCloud:Object.keys(r.documents).length>0};},
    async recoverLocal({expectedRaw}={}){
      paused=false;const c=context(),scope=c.scope;if(c.raw!==expectedRaw)throw Error('本机资料已改变，请重新预览。');if(c.state.draft?.startedAt||!canApply(c,{manual:true}))throw Error('请先保存编辑并结束训练，再恢复本机资料。');
      await locked(scope,async()=>{const meta=await metadata.load(scope);if(!meta.initialized)throw Error('请先开启同步。');const client=clientFactory(c.session.serviceOrigin),remote=validateRemote(await client.syncRead(c.session));guard(scope);checkRemoteVersion(remote,meta);
        const projection=structuredClone(remote.documents),receipt=meta.pending&&remote.recentOps?.find(x=>x.operationId===meta.pending.op.operationId),received=receipt?.response?.status==='ok';
        if(meta.pending&&!received)for(const row of meta.pending.op.changes){const key=row.kind+'/'+row.id;if(row.ensure&&projection[key]&&!projection[key].deleted)continue;projection[key]={...row,deleted:row.deleted};}
        if(c.raw!==null){const neutral=syncProjection((await import('./domain.js')).initialState());for(const [key,row]of Object.entries(syncProjection(c.state,meta.media)))if(stableJSON(row.data)!==stableJSON(neutral[key]?.data))projection[key]={...row,deleted:false};}
        const next=applySyncedState(c.state,syncState(projection)),media=Object.values(projection).filter(x=>x.kind==='media'&&!x.deleted).map(x=>x.data);await restoreMedia(media,c,{client,check:()=>guard(scope),preserveLocal:true});guard(scope);await applyLocal(expectedRaw,next,{manual:true});onApplied();
        if(received)meta.pending=null;meta.baseline=await baselineFor(remote,next,media);meta.media=media;meta.remoteMedia=mediaRows(remote);meta.cursor=remote.cursor;meta.localMissing=false;meta.pausedError=null;meta.pausedErrorCode=null;meta.enabled=true;meta.conflicts=openConflicts(remote);await save(scope,meta);status('pending',meta);
      },true);
    },
    async refreshConflicts(){const c=context(),remote=validateRemote(await clientFactory(c.session.serviceOrigin).syncRead(c.session));guard(c.scope);const meta=await metadata.load(c.scope),old=new Map(meta.conflicts.map(x=>[x.id,x]));checkRemoteVersion(remote,meta);meta.conflicts=openConflicts(remote);for(const id of Object.keys(meta.choices)){const before=old.get(id),after=meta.conflicts.find(x=>x.id===id);if(!before||!after||(before.currentRemote||before.remote).revision!==(after.currentRemote||after.remote).revision)delete meta.choices[id];}await save(c.scope,meta);status('conflict',meta);},
    async enable({mode='merge',expectedRaw}={}){
      paused=false;
      const c=context(),scope=c.scope;if(c.raw!==expectedRaw)throw Error('本机资料已改变，请重新预览同步范围。');if(c.state.draft?.startedAt||!canApply(c,{manual:true}))throw Error('请先保存当前编辑、结束训练后再开启同步。');
      await locked(scope,async()=>{const existing=await metadata.load(scope);if(existing.initialized){existing.enabled=true;await save(scope,existing);status('pending',existing);return;}
        const client=clientFactory(c.session.serviceOrigin),remote=validateRemote(await client.syncRead(c.session));guard(scope);let next=c.state;const remoteMedia=mediaRows(remote);
        if(mode==='pull'){
          if(stableJSON(syncProjection(c.state))!==stableJSON(syncProjection((await import('./domain.js')).initialState())))throw Error('本机已有资料，请选择合并，避免覆盖。');
          next=applySyncedState(c.state,syncState(remote.documents));
        }else{
          const combined={...remote.documents,...Object.fromEntries(Object.entries(syncProjection(c.state)).map(([k,v])=>[k,{...v,deleted:false}]))};next=applySyncedState(c.state,syncState(combined));
        }
        const missing=await restoreMedia(remoteMedia,c,{client,check:()=>guard(scope),preserveLocal:mode!=='pull'});guard(scope);await applyLocal(expectedRaw,next,{manual:true});onApplied();
        const old=await metadata.load(scope),meta={...defaultSyncMeta(),deviceId:old.deviceId,enabled:true,initialized:true,cursor:remote.cursor,remoteMedia,media:remoteMedia,missingImages:missing};
        const localImages=await collectMedia({...context(),state:next},meta,{client,canCache:false,upload:false,check:()=>guard(scope)});meta.media=localImages.media;meta.baseline=await baselineFor(remote,next,meta.media);meta.conflicts=openConflicts(remote);await save(scope,meta);status('pending',meta);
      },true);
    },
    async disable(){paused=true;abort?.abort();const c=context();await locked(c.scope,async()=>{const meta=await metadata.load(c.scope);meta.enabled=false;await metadata.save(c.scope,meta);status('off',meta);},true);},
    async choose(id,choice){if(!['local','remote'].includes(choice))throw Error('冲突选择无效。');const c=context();await locked(c.scope,async()=>{const meta=await metadata.load(c.scope),conflict=meta.conflicts.find(x=>x.id===id);if(!conflict)throw Error('冲突已改变，请刷新。');for(const x of meta.conflicts)if(x.key===conflict.key)meta.choices[x.id]=choice==='local'&&x.id===id?'local':'remote';await save(c.scope,meta);status('conflict',meta);},true);},
    stop(){stopped=true;abort?.abort();}
  };
}
