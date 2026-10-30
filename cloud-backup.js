// Cloud text backups are explicit snapshots, not a cross-device sync protocol.
// Pure data contract shared by the future UI and the account service.
import {normalizeStore,sanitizeForExport} from './storage.js';
import {CLOUD_MEDIA_FORMAT,validateCloudManifest} from './cloud-media.js';
export const CLOUD_BACKUP_FORMAT='xundong-cloud-text-v1';
export const MAX_CLOUD_TEXT_BYTES=5_000_000;
const ROOTS=['schemaVersion','profile','settings','sessions','notes','knowledge','captures','creatorProfiles','savedPlans','activityUses','topicCards','digestedAt','personalActivities','activityMedia','observations','assessments','abilityEvidence','sourceFeedback','activityExtractions','movementScenes','sceneDays','dailyPractice'];
const SETTINGS=['aiOrganizeModel','useCorpus','planningReferences','plannerSectionOrder','freeSort'];
const PRIVATE=/^(?:apikey|accesstoken|refreshtoken|sessiontoken|authorization|password|logincode|secret|credentials|accesskeyid|accesskeysecret|securitytoken|aidirect|aiconsent|ingest|cloudauth|cloudaccount|requestheaders|headers|proto|prototype|constructor)$/i;
function scrub(value,depth=0){
  if(depth>60)throw Error('备份嵌套过深。');
  if(typeof value==='string'&&(/\bsk-[A-Za-z0-9_-]{20,}\b|\bLTAI[A-Za-z0-9]{12,}\b|\bxd1\.u-[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}\b|xd-session-v1\./.test(value)))throw Error('文字中疑似含有密钥或登录凭证，请先移除再备份。');
  if(Array.isArray(value))return value.map(x=>scrub(x,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!PRIVATE.test(key.replace(/[_-]/g,''))).map(([key,item])=>[key,scrub(item,depth+1)]));
  return value;
}
export const cleanCloudValue=value=>scrub(value);
export function cloudTextState(state){
  // Strip device credentials before normalization and never send current timers/drafts.
  const roots=Object.fromEntries(ROOTS.filter(k=>Object.hasOwn(state||{},k)).map(k=>[k,state[k]]));
  roots.settings=Object.fromEntries(SETTINGS.filter(k=>Object.hasOwn(state?.settings||{},k)).map(k=>[k,state.settings[k]]));
  const clean=sanitizeForExport(normalizeStore(scrub(roots)));
  delete clean.draft;delete clean.studioDraft;delete clean.parkedStudioDraft;
  const result=Object.fromEntries(ROOTS.filter(k=>Object.hasOwn(clean,k)).map(k=>[k,clean[k]]));
  if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_CLOUD_TEXT_BYTES)throw Error('文字备份超过 5 MB，请先导出本机备份并整理范围。');
  return result;
}
export function cloudTextSummary(state){
  return {sessions:state.sessions?.length||0,knowledge:state.knowledge?.length||0,personalActivities:state.personalActivities?.length||0,scenes:state.movementScenes?.length||0,imageReferences:state.activityMedia?.length||0};
}
export function cloudRestorePreview(envelope){
  if(![CLOUD_BACKUP_FORMAT,CLOUD_MEDIA_FORMAT].includes(envelope?.format)||!Number.isFinite(Date.parse(envelope.createdAt)))throw Error('云备份格式无效。');
  const state=cloudTextState(envelope.state);
  const includesImages=envelope.format===CLOUD_MEDIA_FORMAT&&envelope.includesImages===true;
  const media=includesImages?validateCloudManifest(state,envelope.media):[];
  return {state:normalizeStore(state),summary:cloudTextSummary(state),createdAt:envelope.createdAt,includesImages,media,includesDraft:false};
}
