import {STORE_KEY,initialState} from './domain.js';
import {normalizeStore,mergeBackup} from './storage.js';
import {studioDataForStorage} from './training-studio.js';
import {cloudTextState} from './cloud-backup.js';
export const ACTIVE_ACCOUNT_KEY='xundong.account.active.v1';
export const ACCOUNT_SESSION_KEY='xundong.account.session.v1';
export const ACCOUNT_ENDPOINT_KEY='xundong.account.endpoint.v1';
export const accountUserIdOK=id=>typeof id==='string'&&/^u-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
export function accountOrigin(value){
  try{const u=new URL(value);if(u.username||u.password||u.search||u.hash||u.pathname!=='/')return null;
    if(u.protocol==='https:'&&!u.port&&/^xundong-?accounts-[a-z0-9]+\.cn-hangzhou\.fcapp\.run$/.test(u.hostname))return u.origin;
  }catch{}return null;
}
export function validateAccountScope(value){
  if(!value||!accountUserIdOK(value.userId)||!accountOrigin(value.serviceOrigin)||typeof value.displayName!=='string'||!value.displayName.trim()||value.displayName.length>40)throw Error('本机账号信息无效，请到账号页重新选择。');
  return {userId:value.userId,displayName:value.displayName,serviceOrigin:accountOrigin(value.serviceOrigin)};
}
export const scopeStoreKey=scope=>scope?`${STORE_KEY}.account.${encodeURIComponent(scope.serviceOrigin)}.${scope.userId}`:STORE_KEY;
export const scopeMediaKey=scope=>scope?scopeStoreKey(scope):'guest';
export function readActiveAccount(storage){const text=storage.getItem(ACTIVE_ACCOUNT_KEY);return text?validateAccountScope(JSON.parse(text)):null;}
export function sameAccount(a,b){return scopeStoreKey(a)===scopeStoreKey(b);}
export function readScopeState(storage,scope){const raw=storage.getItem(scopeStoreKey(scope));return {raw,state:raw?normalizeStore(JSON.parse(raw)):initialState()};}
export function activateAccount(storage,scope){
  const valid=scope?validateAccountScope(scope):null;
  // Refuse entering a corrupt destination; leave the current account untouched.
  if(valid)readScopeState(storage,valid);
  if(valid)storage.setItem(ACTIVE_ACCOUNT_KEY,JSON.stringify(valid));else storage.removeItem(ACTIVE_ACCOUNT_KEY);
  return valid;
}
export function mergePreview(current,incoming,restoreProfile=false){
  const result=mergeBackup(current,cloudTextState(incoming),restoreProfile);let conflicts=0;
  for(const key of ['sessions','notes','knowledge','captures','personalActivities','movementScenes','sceneDays','activityMedia','sourceFeedback','savedPlans']){
    const local=new Map((current[key]||[]).map(x=>[x.id,JSON.stringify(x)]));
    for(const row of incoming[key]||[])if(local.has(row.id)&&local.get(row.id)!==JSON.stringify(row))conflicts++;
  }
  return {...result,conflicts};
}
export function saveScopeMerge(storage,scope,expectedRaw,next,{guestRaw}={}){
  if(!sameAccount(readActiveAccount(storage),scope)||storage.getItem(scopeStoreKey(scope))!==expectedRaw||guestRaw!==undefined&&storage.getItem(STORE_KEY)!==guestRaw)throw Error('另一页面更新了账号或记录，请重新预览后再确认。');
  const serialized=JSON.stringify(studioDataForStorage(normalizeStore(next)));
  storage.setItem(scopeStoreKey(scope),serialized);
}
