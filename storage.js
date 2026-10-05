import { initialState } from './domain.js';
import { publicActivities,goals,equipmentLabels } from './catalog.js';
import { validateSets } from './training.js';
import { normalizeAssessment } from './abilities.js';
const publicIds=publicActivities.map(a=>a.id);
const id=x=>typeof x==='string'&&/^[-_a-zA-Z0-9:.]{1,150}$/.test(x);
const array=(x,name)=>{if(!Array.isArray(x)||x.length>10000)throw new Error(`${name} 格式无效`);return x;};
export function normalizeStore(data){
  if(!data||data.schemaVersion!==1||typeof data.profile!=='object')throw new Error('备份版本或档案格式无效。');
  const base=initialState(),s=structuredClone(data);
  // 备份里的个人动作 ID 也算已知动作（训练记录、心得、收藏可能引用它们）。
  const known=new Set([...publicIds,...(Array.isArray(s.personalActivities)?s.personalActivities.map(p=>p?.id).filter(Boolean):[])]);
  for(const k of ['sessions','notes','knowledge','observations'])array(s[k],k);
  if(s.captures!=null)array(s.captures,'captures');
  if(s.creatorProfiles!=null)array(s.creatorProfiles,'creatorProfiles');
  if(s.savedPlans!=null)array(s.savedPlans,'savedPlans');
  if(s.activityUses!=null)array(s.activityUses,'activityUses');
  if(s.topicCards!=null)array(s.topicCards,'topicCards');
  if(s.personalActivities!=null)array(s.personalActivities,'personalActivities');
  for(const k of ['name','goalText','bodyNotes'])if(typeof s.profile[k]!=='string')throw new Error('档案文字格式无效。');
  if(!goals[s.profile.focus]||!['beginner','regular'].includes(s.profile.experience)||!Array.isArray(s.profile.equipment)||s.profile.equipment.some(e=>!equipmentLabels[e]))throw new Error('档案选项无效。');
  for(const group of [s.notes,s.knowledge,s.observations,s.sessions,s.captures||[]]){
    const seen=new Set();for(const x of group){if(!id(x.id)||seen.has(x.id))throw new Error('记录 ID 无效或重复。');seen.add(x.id);}
  }
  const checkItem=i=>{if(!id(i.id)||!['pending','completed','skipped'].includes(i.status))throw new Error('训练项目格式无效。');if(i.activityId&&!known.has(i.activityId))throw new Error('备份引用了当前动作库没有的动作。');if(i.actualSetDetails)validateSets(i.actualSetDetails);};
  for(const session of s.sessions){
    if(!Number.isFinite(Date.parse(session.endedAt)))throw new Error('训练日期无效。');
    if(session.actualMinutes!=null&&(!Number.isFinite(session.actualMinutes)||session.actualMinutes<=0||session.actualMinutes>1440))throw new Error('训练时长无效。');
    array(session.items,'训练项目').forEach(checkItem);
  }
  for(const n of s.notes){if(!known.has(n.activityId)||typeof n.text!=='string')throw new Error('心得格式无效。');n.history=n.history||[];array(n.history,'心得历史');}
  for(const k of s.knowledge){if(typeof k.title!=='string'||typeof k.text!=='string'||!Array.isArray(k.activityIds)||k.activityIds.some(x=>!known.has(x)))throw new Error('知识条目格式无效。');if(k.contentType!=null&&typeof k.contentType!=='string')throw new Error('知识内容分类无效。');if(k.planPoints!=null){array(k.planPoints,'训练方案要点');for(const p of k.planPoints)if(typeof p?.kind!=='string'||typeof p?.text!=='string'||typeof p?.evidenceQuote!=='string')throw new Error('训练方案要点格式无效。');}k.contentType ||= null;k.planPoints ||= [];}
  for(const c of s.captures||[])if(typeof c.knowledgeId!=='string'||typeof c.shareText!=='string'||typeof c.rawUrl!=='string'||typeof c.status!=='string')throw new Error('分享收件箱格式无效。');
  {const seen=new Set();for(const p of s.creatorProfiles||[]){if(!id(p?.id)||seen.has(p.id))throw new Error('方法卡 ID 无效或重复。');seen.add(p.id);if(typeof p.creatorKey!=='string'||typeof p.title!=='string'||!Array.isArray(p.principles)||(p.activityIds||[]).some(x=>!known.has(x)))throw new Error('方法卡格式无效。');}}
  {const seen=new Set();for(const t of s.savedPlans||[]){if(!id(t?.id)||seen.has(t.id))throw new Error('收藏训练 ID 无效或重复。');seen.add(t.id);if(typeof t.name!=='string'||!Array.isArray(t.items)||!t.request||!goals[t.request.focus])throw new Error('收藏训练格式无效。');}}
  {const seen=new Set();for(const u of s.activityUses||[]){if(!id(u?.id)||seen.has(u.id))throw new Error('用途备注 ID 无效或重复。');seen.add(u.id);if(typeof u.activityId!=='string'||typeof u.use!=='string')throw new Error('用途备注格式无效。');}}
  {const seen=new Set();for(const t of s.topicCards||[]){if(!id(t?.id)||seen.has(t.id))throw new Error('主题总结 ID 无效或重复。');seen.add(t.id);if(typeof t.topic!=='string'||typeof t.title!=='string'||!Array.isArray(t.principles))throw new Error('主题总结格式无效。');}}
  {const seen=new Set(publicIds);for(const p of s.personalActivities||[]){if(!id(p?.id)||!p.id.startsWith('my-')||seen.has(p.id))throw new Error('个人动作 ID 无效或重复。');seen.add(p.id);if(typeof p.name!=='string'||!p.name.trim()||!goals[p.category]||!['confirmed','archived'].includes(p.status)||!['manual_only','allowed'].includes(p.planningUse)||!Array.isArray(p.places)||!Array.isArray(p.equipment)||!Number.isInteger(p.minutes))throw new Error('个人动作格式无效。');}}
  if(s.digestedAt!=null&&!Number.isFinite(Date.parse(s.digestedAt)))throw new Error('整理时间无效。');
  for(const o of s.observations)if(typeof o.text!=='string')throw new Error('身体随记格式无效。');
  for(const k of ['assessments','abilityEvidence'])if(s[k]!=null){array(s[k],k);const seen=new Set();for(const x of s[k]){if(!id(x?.id)||seen.has(x.id))throw new Error('能力记录 ID 无效或重复。');seen.add(x.id);}}
  for(const e of s.abilityEvidence||[])if(typeof e.rawText!=='string')throw new Error('能力原话格式无效。');
  if(s.draft){if(!id(s.draft.id)||!s.draft.request||!goals[s.draft.request.focus])throw new Error('训练草稿无效。');array(s.draft.items,'草稿项目').forEach(checkItem);}
  const refs=s.settings?.planningReferences;
  const planningReferences={mode:['auto','selected','none'].includes(refs?.mode)?refs.mode:(s.settings?.useCorpus===false?'none':'auto'),selectedIds:Array.isArray(refs?.selectedIds)?[...new Set(refs.selectedIds.filter(id).slice(0,500))]:[]};
  return {...base,...s,profile:{...base.profile,...s.profile},captures:s.captures||[],creatorProfiles:s.creatorProfiles||[],savedPlans:s.savedPlans||[],activityUses:s.activityUses||[],topicCards:s.topicCards||[],personalActivities:s.personalActivities||[],digestedAt:s.digestedAt||null,assessments:(s.assessments||[]).map(normalizeAssessment),abilityEvidence:s.abilityEvidence||[],settings:{...base.settings,...s.settings,planningReferences}};
}
// Never let an API key or AI authorisation ride into the app on export or import.
export const sanitizeForExport=state=>({...state,settings:{...state.settings,aiConsent:null,aiDirect:null,ingest:null},captures:(state.captures||[]).map(c=>c.ingestStatus==='queued'?{...c,ingestStatus:'failed',ingestJobId:null,ingestError:'后台任务不会随备份迁移；可在这台设备重新尝试。'}:c)});
// 本地数据读不进来时的救援导出：同样脱敏；连 JSON 都解析不了就抛错，不输出可能带 key 的原文。
export function rawBackupText(raw){const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('本地数据无法解析。');return JSON.stringify(sanitizeForExport(data),null,2);}
export function parseBackup(text){if(text.length>5_000_000)throw new Error('备份过大，请使用 5 MB 以内的 JSON 文件。');const s=normalizeStore(JSON.parse(text));s.settings={...s.settings,aiConsent:null,aiDirect:null,ingest:null};s.captures=s.captures.map(c=>c.ingestStatus==='queued'?{...c,ingestStatus:'failed',ingestJobId:null,ingestError:'后台任务不会随备份迁移；可在这台设备重新尝试。'}:c);return s;}
export function mergeBackup(current,incoming,restoreProfile=false){
  const next=structuredClone(current);let added=0;
  for(const key of ['sessions','notes','knowledge','captures','creatorProfiles','savedPlans','activityUses','topicCards','personalActivities','observations','assessments','abilityEvidence']){
    next[key] ||= [];const ids=new Set(next[key].map(x=>x.id));
    for(const x of incoming[key]||[])if(!ids.has(x.id)){next[key].push(structuredClone(x));ids.add(x.id);added++;}
  }
  if(restoreProfile)next.profile=structuredClone(incoming.profile);
  // Do not restore running workouts or permissions from an imported file.
  next.sessions.sort((a,b)=>new Date(a.endedAt)-new Date(b.endedAt));
  return {state:normalizeStore(next),added};
}
