// Pure record projection/reconciliation. No network or storage side effects.
import {initialState} from './domain.js';
import {cloudTextState} from './cloud-backup.js';
import {normalizeStore} from './storage.js';
import {validateMediaDescriptor} from './cloud-media.js';
export const SYNC_COLLECTIONS=['sessions','notes','knowledge','captures','creatorProfiles','savedPlans','activityUses','topicCards','personalActivities','activityMedia','observations','assessments','abilityEvidence','sourceFeedback','activityExtractions','movementScenes','sceneDays'];
export const SYNC_SINGLETONS=['profile','settings','dailyPractice','digestedAt'];
export const SYNC_SETTINGS=['aiOrganizeModel','useCorpus','planningReferences','plannerSectionOrder','freeSort'];
export const syncIdOK=id=>typeof id==='string'&&/^[-_a-zA-Z0-9:.]{1,180}$/.test(id);
// Notes are one per activity even if two offline devices assigned different UUIDs.
// The stored note UUID is preserved for backups and older app versions.
const recordId=(kind,data)=>kind==='notes'?data.activityId:data.id;
export function syncKey(kind,id){if(![...SYNC_COLLECTIONS,...SYNC_SINGLETONS,'media'].includes(kind)||!syncIdOK(id)||SYNC_SINGLETONS.includes(kind)&&id!=='main')throw Error('同步条目编号无效。');return `${kind}/${id}`;}
export const stableJSON=value=>JSON.stringify(canonical(value));
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x;}
export async function syncHash(value){const bytes=new TextEncoder().encode(stableJSON(value));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export function syncProjection(state,media=[]){
  const clean=cloudTextState(state),docs={};
  for(const kind of SYNC_COLLECTIONS)for(const data of clean[kind]||[]){const id=recordId(kind,data),key=syncKey(kind,id);if(docs[key])throw Error('同一动作存在多份心得，请先在本机整理后同步。');docs[key]={kind,id,data};}
  for(const kind of SYNC_SINGLETONS){if(!Object.hasOwn(clean,kind))continue;let data=clean[kind];if(kind==='settings')data=Object.fromEntries(SYNC_SETTINGS.filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]]));docs[syncKey(kind,'main')]={kind,id:'main',data};}
  for(const item of media){const d=validateMediaDescriptor(item);docs[syncKey('media',d.id)]={kind:'media',id:d.id,data:d};}
  if(Object.keys(docs).length>10000)throw Error('同步条目超过一万条，请先导出备份并整理范围。');return docs;
}
export function syncState(documents){
  const state=initialState();for(const k of SYNC_COLLECTIONS)state[k]=[];
  for(const [key,row]of Object.entries(documents)){
    if(key!==syncKey(row.kind,row.id))throw Error('同步数据编号不一致。');if(row.deleted||row.kind==='media')continue;
    if(SYNC_COLLECTIONS.includes(row.kind)){if(!row.data||recordId(row.kind,row.data)!==row.id)throw Error('同步数据编号不一致。');state[row.kind].push(row.data);}else state[row.kind]=row.data;
  }
  return cloudTextState(state);
}
export function validateSyncDocuments(documents){
  const clean=syncProjection(syncState(documents),Object.values(documents).filter(x=>x.kind==='media'&&!x.deleted).map(x=>x.data));
  for(const [key,d]of Object.entries(documents))if(!d.deleted&&stableJSON(clean[key]?.data)!==stableJSON(d.data))throw Error('同步条目含设备字段或不兼容内容。');
  return true;
}
export function applySyncedState(local,remote){
  const clean=cloudTextState(remote),next=structuredClone(local);
  for(const key of [...SYNC_COLLECTIONS,...SYNC_SINGLETONS]){
    if(key==='settings'){for(const k of SYNC_SETTINGS){if(Object.hasOwn(clean.settings,k))next.settings[k]=structuredClone(clean.settings[k]);else delete next.settings[k];}}
    else if(Object.hasOwn(clean,key))next[key]=structuredClone(clean[key]);else if(key==='dailyPractice')delete next[key];
  }
  return normalizeStore(next);
}
export async function makeSyncChanges(state,baseline,media=[]){
  const projection=syncProjection(state,media),changes=[],hashes={};
  for(const [key,row]of Object.entries(projection)){const hash=await syncHash(row.data);hashes[key]=hash;if(hash!==baseline[key]?.hash)changes.push({...row,baseRevision:baseline[key]?.revision||0,deleted:false});}
  for(const [key,old]of Object.entries(baseline))if(!projection[key]&&!old.deleted&&!key.startsWith('media/')){const [kind,id]=key.split('/');changes.push({kind,id,baseRevision:old.revision,deleted:true,data:null});}
  // An unchanged parent is an existence assertion, not permission to overwrite
  // its newer fields. If another device deleted it, surface that as a conflict.
  const keys=new Set(changes.map(x=>x.kind+'/'+x.id));
  const ensure=(kind,id)=>{const key=kind+'/'+id,row=projection[key];if(!row||keys.has(key))return;keys.add(key);changes.push({...row,baseRevision:baseline[key]?.revision||0,deleted:false,ensure:true});};
  for(let i=0;i<changes.length;i++)if(!changes[i].deleted)for(const key of syncDependencies(changes[i])){const [kind,id]=key.split('/');ensure(kind,id);}
  return {changes,hashes,projection};
}
export function syncDependencies(c){
  if(c.deleted)return [];const d=c.data,keys=[];const add=(kind,id)=>{if(typeof id==='string'&&syncIdOK(id))keys.push(kind+'/'+id);};
  if(['sourceFeedback','captures','activityExtractions'].includes(c.kind))add('knowledge',d?.knowledgeId);
  if(c.kind==='knowledge')add('captures',d?.captureId);
  if(c.kind==='activityExtractions')add('captures',d?.captureId);
  if(c.kind==='sceneDays')add('movementScenes',d?.sceneId);
  const ids=[d?.activityId,...(d?.activityIds||[]),...(d?.items||[]).map(x=>x.activityId)];for(const id of ids)if(typeof id==='string'&&id.startsWith('my-'))add('personalActivities',id);
  if(c.kind!=='media')for(const id of referencedImageIds(c))add('media',id);
  return [...new Set(keys)];
}
function referencedImageIds(c){const d=c.data;return [d?.thumbnailId,d?.source?.thumbnailId,...(d?.sourceMedia||[]).map(x=>x.thumbnailId),...(d?.items||[]).map(i=>i.activitySnapshot?.source?.thumbnailId)].filter(x=>typeof x==='string');}
export function syncRecordTitle(row){return row?.data?.title||row?.data?.name||row?.data?.profile?.name||row?.data?.endedAt||({profile:'个人档案',settings:'偏好设置',digestedAt:'整理日期',dailyPractice:'日常偏好',media:'动作配图'}[row?.kind])||row?.id||'记录';}
