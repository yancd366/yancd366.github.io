import { initialState } from './domain.js';
import { activities,goals,equipmentLabels } from './catalog.js';
import { validateSets } from './training.js';
const known=new Set(activities.map(a=>a.id));
const id=x=>typeof x==='string'&&/^[-_a-zA-Z0-9:.]{1,150}$/.test(x);
const array=(x,name)=>{if(!Array.isArray(x)||x.length>10000)throw new Error(`${name} 格式无效`);return x;};
export function normalizeStore(data){
  if(!data||data.schemaVersion!==1||typeof data.profile!=='object')throw new Error('备份版本或档案格式无效。');
  const base=initialState(),s=structuredClone(data);
  for(const k of ['sessions','notes','knowledge','observations'])array(s[k],k);
  for(const k of ['name','goalText','bodyNotes'])if(typeof s.profile[k]!=='string')throw new Error('档案文字格式无效。');
  if(!goals[s.profile.focus]||!['beginner','regular'].includes(s.profile.experience)||!Array.isArray(s.profile.equipment)||s.profile.equipment.some(e=>!equipmentLabels[e]))throw new Error('档案选项无效。');
  for(const group of [s.notes,s.knowledge,s.observations,s.sessions]){
    const seen=new Set();for(const x of group){if(!id(x.id)||seen.has(x.id))throw new Error('记录 ID 无效或重复。');seen.add(x.id);}
  }
  const checkItem=i=>{if(!id(i.id)||!['pending','completed','skipped'].includes(i.status))throw new Error('训练项目格式无效。');if(i.activityId&&!known.has(i.activityId))throw new Error('备份引用了当前动作库没有的动作。');if(i.actualSetDetails)validateSets(i.actualSetDetails);};
  for(const session of s.sessions){
    if(!Number.isFinite(Date.parse(session.endedAt)))throw new Error('训练日期无效。');
    if(session.actualMinutes!=null&&(!Number.isFinite(session.actualMinutes)||session.actualMinutes<=0||session.actualMinutes>1440))throw new Error('训练时长无效。');
    array(session.items,'训练项目').forEach(checkItem);
  }
  for(const n of s.notes){if(!known.has(n.activityId)||typeof n.text!=='string')throw new Error('心得格式无效。');n.history=n.history||[];array(n.history,'心得历史');}
  for(const k of s.knowledge){if(typeof k.title!=='string'||typeof k.text!=='string'||!Array.isArray(k.activityIds)||k.activityIds.some(x=>!known.has(x)))throw new Error('知识条目格式无效。');}
  for(const o of s.observations)if(typeof o.text!=='string')throw new Error('身体随记格式无效。');
  if(s.draft){if(!id(s.draft.id)||!s.draft.request||!goals[s.draft.request.focus])throw new Error('训练草稿无效。');array(s.draft.items,'草稿项目').forEach(checkItem);}
  return {...base,...s,profile:{...base.profile,...s.profile},assessments:Array.isArray(s.assessments)?s.assessments:[],settings:{...base.settings,...s.settings}};
}
// Never let an API key or AI authorisation ride into the app on export or import.
export const sanitizeForExport=state=>({...state,settings:{...state.settings,aiConsent:null,aiDirect:null}});
export function parseBackup(text){if(text.length>5_000_000)throw new Error('备份过大，请使用 5 MB 以内的 JSON 文件。');const s=normalizeStore(JSON.parse(text));s.settings={aiConsent:null,aiDirect:null};return s;}
export function mergeBackup(current,incoming,restoreProfile=false){
  const next=structuredClone(current);let added=0;
  for(const key of ['sessions','notes','knowledge','observations','assessments']){
    next[key] ||= [];const ids=new Set(next[key].map(x=>x.id));
    for(const x of incoming[key]||[])if(!ids.has(x.id)){next[key].push(structuredClone(x));ids.add(x.id);added++;}
  }
  if(restoreProfile)next.profile=structuredClone(incoming.profile);
  // Do not restore running workouts or permissions from an imported file.
  next.sessions.sort((a,b)=>new Date(a.endedAt)-new Date(b.endedAt));
  return {state:normalizeStore(next),added};
}
