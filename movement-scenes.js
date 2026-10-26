// Personal scene pools and explicitly confirmed daily agendas. Pure functions, no network.
import {activities,activityById,places} from './catalog.js';
import {uid,aiEligible,checkPlanStart} from './domain.js';
import {safetyBlock,safetyContext,preservePainContext} from './safety.js';
import {abilityBlock} from './abilities.js';

const idOK=x=>typeof x==='string'&&/^[-_a-zA-Z0-9:.]{1,150}$/.test(x);
const clip=(x,n)=>String(x??'').trim().slice(0,n);
const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
const dayOK=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(`${x}T12:00:00Z`).toISOString().slice(0,10)===x;
export const sceneDate=(now=new Date())=>`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
const dayNumber=x=>Math.floor(Date.parse(`${x}T12:00:00Z`)/86400000);
const dateNumber=n=>new Date(n*86400000).toISOString().slice(0,10);
export const SCENE_TEMPLATES={office:{name:'办公间隙',place:'office',minutes:5},morning:{name:'晨起活动',place:'home',minutes:10},bedtime:{name:'睡前活动',place:'home',minutes:10}};
export const sceneDefaults=()=>({version:1,name:'',place:'home',minutes:10,activityIds:[],fixedIds:[],itemMinutes:{},dailyCount:3,cycleDays:7,weekdays:[0,1,2,3,4,5,6],enabled:true});
export const sceneById=(state,id)=>(state.movementScenes||[]).find(x=>x.id===id);
export function validateScene(x){
 if(!x||x.version!==1||typeof x.name!=='string'||!x.name.trim()||x.name.length>40||!Object.hasOwn(places,x.place)||!integer(x.minutes,2,120)||!integer(x.dailyCount,1,10)||!integer(x.cycleDays,1,90)||typeof x.enabled!=='boolean')throw Error('场景名称、时长或安排设置无效。');
 for(const key of ['activityIds','fixedIds'])if(!Array.isArray(x[key])||x[key].length>1000||x[key].some(v=>!idOK(v))||new Set(x[key]).size!==x[key].length)throw Error('场景动作清单格式无效。');
 if(x.fixedIds.some(id=>!x.activityIds.includes(id))||x.fixedIds.length>x.dailyCount)throw Error('每日固定项必须在动作池内，且不能超过单日动作数量。');
 if(!Array.isArray(x.weekdays)||!x.weekdays.length||x.weekdays.some(v=>!integer(v,0,6))||new Set(x.weekdays).size!==x.weekdays.length)throw Error('请选择有效的执行日。');
 if(!x.itemMinutes||typeof x.itemMinutes!=='object'||Array.isArray(x.itemMinutes)||Object.entries(x.itemMinutes).some(([id,n])=>!x.activityIds.includes(id)||!integer(n,1,30)))throw Error('每项预计分钟应为1～30。');
 return x;
}
export function saveScene(state,input,id=null,now=new Date()){
 const old=id?sceneById(state,id):null;if(id&&!old)throw Error('找不到这个场景。');
 const activityIds=[...new Set(input.activityIds||[])],fixedIds=[...new Set(input.fixedIds||[])];
 if(activityIds.some(id=>!activityById(id)||activityById(id).archived))throw Error('动作池中有不存在或已归档的动作，请重新选择。');
 const x={...sceneDefaults(),...input,name:clip(input.name,40),activityIds,fixedIds,itemMinutes:Object.fromEntries(Object.entries(input.itemMinutes||{}).filter(([id])=>activityIds.includes(id)))};validateScene(x);
 if((state.movementScenes||[]).some(s=>s.id!==id&&s.name===x.name))throw Error('已经有同名场景，请换一个名称。');
 const scene={...x,id:old?.id||`scene-${uid()}`,createdAt:old?.createdAt||now.toISOString(),updatedAt:now.toISOString()};
 state.movementScenes||=[];if(old)Object.assign(old,scene);else state.movementScenes.push(scene);return old||scene;
}
export function addSceneActivities(state,sceneId,ids,now=new Date()){
 const scene=sceneById(state,sceneId);if(!scene)throw Error('场景已不存在；动作仍可保存在动作库。');
 const added=[...new Set(ids)];if(added.some(id=>{const personal=state.personalActivities?.find(p=>p.id===id);return personal?personal.status!=='confirmed':!activityById(id)||activityById(id).archived;}))throw Error('要加入场景的动作已归档或不存在，请先恢复或重新选择；本次未保存。');
 scene.activityIds=[...new Set([...scene.activityIds,...added])];validateScene(scene);scene.updatedAt=now.toISOString();return added;
}
export function removeScene(state,id){if(!sceneById(state,id))throw Error('找不到这个场景。');state.movementScenes=state.movementScenes.filter(s=>s.id!==id);}
export function sceneDay(state,id,now=new Date()){return (state.sceneDays||[]).find(d=>d.sceneId===id&&d.date===sceneDate(now));}
export function sceneCycle(scene,now=new Date()){
 const today=dayNumber(sceneDate(now)),anchor=dayNumber(sceneDate(new Date(scene.createdAt))),start=anchor+Math.floor((today-anchor)/scene.cycleDays)*scene.cycleDays;
 return {start:dateNumber(start),end:dateNumber(start+scene.cycleDays-1)};
}
export function sceneHistory(state,scene,now=new Date()){
 const {start,end}=sceneCycle(scene,now),counts=new Map(),seen=new Set(),completed=new Set();
 for(const session of state.sessions||[]){
  if(seen.has(session.id)||session.planSnapshot?.sceneId!==scene.id||Date.parse(session.endedAt)>Number(now))continue;seen.add(session.id);
  const day=sceneDate(new Date(session.endedAt));if(day<start||day>end)continue;
  for(const id of new Set(session.items.filter(x=>x.status==='completed').map(x=>x.activityId))){const key=`${session.planSnapshot.sceneDayId||day}:${id}`;if(completed.has(key))continue;completed.add(key);const old=counts.get(id)||{count:0,lastAt:''};counts.set(id,{count:old.count+1,lastAt:session.endedAt>old.lastAt?session.endedAt:old.lastAt});}
 }return counts;
}
export function sceneRequest(scene,context={}){return {...context,minutes:scene.minutes,timeMode:'scene',place:scene.place,focus:'balanced',targetRegions:[],readiness:context.readiness||'normal'};}
export function sceneActivityReason(state,scene,id,context={}){
 const a=activityById(id),request=sceneRequest(scene,context);
 if(!a||a.archived)return '动作不存在或已归档';
 if(a.selectable===false)return '仅手动使用，不参与每日安排；可在动作详情核对权限';
 if(!aiEligible(a,request,state.profile))return '当前场地、器械、身体状态或训练经历不符合';
 return '';
}
const signature=scene=>JSON.stringify([scene.name,scene.place,scene.minutes,scene.activityIds,scene.fixedIds,scene.itemMinutes,scene.dailyCount,scene.cycleDays,scene.weekdays,scene.enabled]);
export function proposeSceneDay(state,sceneId,context={},now=new Date()){
 const scene=sceneById(state,sceneId);if(!scene)throw Error('找不到这个场景。');validateScene(scene);
 if(!scene.enabled)throw Error('这个场景已暂停。');if(!scene.weekdays.includes(now.getDay()))throw Error('今天不是这个场景的执行日，可先调整执行日。');
 const block=state.draft?.pausedForDiscomfort?'本次已出现不舒服，请先结束并保存记录。':safetyBlock(state.profile,sceneRequest(scene,context))||abilityBlock(state.assessments||[],now);if(block)throw Error(block);
 if(!scene.activityIds.length)throw Error('先往场景里添加动作，再生成安排。');
 const unavailable=scene.activityIds.flatMap(id=>{const reason=sceneActivityReason(state,scene,id,context);return reason?[{activityId:id,name:activityById(id)?.name||id,reason}]:[];});
 const blockedFixed=unavailable.filter(x=>scene.fixedIds.includes(x.activityId));if(blockedFixed.length)throw Error(`固定项「${blockedFixed.map(x=>x.name).join('、')}」当前不可安排，请修改固定项或条件；不会自动忽略。`);
 const history=sceneHistory(state,scene,now),optional=scene.activityIds.filter(id=>!scene.fixedIds.includes(id)&&!unavailable.some(x=>x.activityId===id));
 optional.sort((a,b)=>(history.get(a)?.count||0)-(history.get(b)?.count||0)||(history.get(a)?.lastAt||'').localeCompare(history.get(b)?.lastAt||'')||scene.activityIds.indexOf(a)-scene.activityIds.indexOf(b));
 const minutes=id=>scene.itemMinutes[id]||activityById(id).minutes;
 const picked=[...scene.fixedIds];let used=picked.reduce((n,id)=>n+minutes(id),0);
 if(used>scene.minutes)throw Error(`固定项合计${used}分钟，超过本次${scene.minutes}分钟；请增加时间或减少固定项。`);
 for(const id of optional){if(picked.length>=scene.dailyCount)break;if(used+minutes(id)>scene.minutes)continue;picked.push(id);used+=minutes(id);}
 if(!picked.length)throw Error('没有符合当前条件且能放进时长的动作，请调整动作池或时间。');
 return {id:`${scene.id}:${sceneDate(now)}`,sceneId:scene.id,date:sceneDate(now),sceneName:scene.name,sceneSignature:signature(scene),request:sceneRequest(scene,context),createdAt:now.toISOString(),cycle:sceneCycle(scene,now),unavailable,
  items:picked.map(id=>({id:uid(),activityId:id,name:activityById(id).name,plannedMinutes:minutes(id),fixed:scene.fixedIds.includes(id),status:'pending',sessionId:null}))};
}
export function confirmSceneDay(state,proposal,keepIds,context={},now=new Date()){
 const scene=sceneById(state,proposal?.sceneId);if(!scene||signature(scene)!==proposal.sceneSignature)throw Error('场景设置已变，请重新生成；没有覆盖今日清单。');
 if(proposal.date!==sceneDate(now))throw Error('日期已变化，请重新生成今天的安排。');
 if(sceneDay(state,scene.id,now))throw Error('今天的清单已确认，不会自动重排。');
 context=preservePainContext(proposal.request,context);
 const current=proposal.selection==='ai'?chooseSceneProposal(state,proposal,proposal.items.map(i=>i.activityId),context,now):proposeSceneDay(state,scene.id,context,now),allowed=new Set(current.items.map(i=>i.activityId));
 if(!Array.isArray(keepIds)||!keepIds.length||new Set(keepIds).size!==keepIds.length||keepIds.some(id=>!proposal.items.some(i=>i.activityId===id)||!allowed.has(id))||scene.fixedIds.some(id=>!keepIds.includes(id)))throw Error('请保留固定项，并至少选择一个当前可用的动作。');
 const day={...structuredClone(current),items:current.items.filter(i=>keepIds.includes(i.activityId)).map(i=>({...i,status:'pending',sessionId:null})),confirmedAt:now.toISOString()};
 state.sceneDays||=[];state.sceneDays.push(day);return day;
}
export function chooseSceneProposal(state,base,ids,context={},now=new Date()){
 const scene=sceneById(state,base.sceneId);if(!scene||signature(scene)!==base.sceneSignature)throw Error('场景设置已变化，请重新安排。');
 const current=proposeSceneDay(state,scene.id,context,now);
 if(!Array.isArray(ids)||!ids.length||ids.length>scene.dailyCount||new Set(ids).size!==ids.length||scene.fixedIds.some(id=>!ids.includes(id))||ids.some(id=>!scene.activityIds.includes(id)||sceneActivityReason(state,scene,id,context)))throw Error('AI选择不符合当前场景候选、固定项或安全条件。');
 const items=ids.map(id=>({id:uid(),activityId:id,name:activityById(id).name,plannedMinutes:scene.itemMinutes[id]||activityById(id).minutes,fixed:scene.fixedIds.includes(id),status:'pending',sessionId:null}));
 if(items.reduce((n,x)=>n+x.plannedMinutes,0)>scene.minutes)throw Error('所选动作超过场景时长。');
 const mode=state.settings?.planningReferences?.mode||'auto';
 return {...current,selection:'ai',items,aiExplanation:clip(base.aiExplanation,400),knowledgeUsed:mode!=='none'&&Array.isArray(base.knowledgeUsed)?base.knowledgeUsed.filter(r=>(mode!=='selected'||state.settings.planningReferences.selectedIds.includes(r.id))&&state.knowledge.some(k=>k.id===r.id&&k.status==='saved'&&k.useInPlanning)).map(r=>({id:r.id,title:clip(r.title,120)})):[]};
}
export function sceneDayPlan(state,dayId,context={},now=new Date()){
 const day=(state.sceneDays||[]).find(x=>x.id===dayId),scene=day&&sceneById(state,day.sceneId);if(!day||!scene)throw Error('找不到这个场景清单。');
 if(!scene.enabled)throw Error('这个场景已暂停，请先启用。');
 if(day.date!==sceneDate(now))throw Error('请生成今天的清单，旧日期只保留记录。');
 const request=preservePainContext(day.request,{...day.request,...context,minutes:day.request.minutes,place:day.request.place,focus:'balanced',timeMode:'scene',targetRegions:[]});
 const block=safetyBlock(state.profile,request)||abilityBlock(state.assessments||[],now);if(block)throw Error(block);
 if(state.draft)throw Error('已有一份训练草稿，请先保存或退出，不会覆盖。');
 const pending=day.items.filter(i=>i.status==='pending');if(!pending.length)throw Error('今天的清单没有待做项。');
 for(const item of pending)if(sceneActivityReason(state,{...scene,place:request.place,minutes:request.minutes},item.activityId,request))throw Error(`「${item.name}」当前不符合条件，不能直接开始；可跳过这项后再开始其余项目。`);
 const plan={id:uid(),createdAt:now.toISOString(),startedAt:null,source:'saved',sceneId:scene.id,sceneDayId:day.id,safetyContext:safetyContext(state.profile,request),request,
  items:pending.map(x=>({id:uid(),sceneItemId:x.id,activityId:x.activityId,activitySnapshot:structuredClone(activityById(x.activityId)),plannedMinutes:x.plannedMinutes,status:'pending',actualMinutes:null,feedback:'',actualSets:null,actualReps:null,actualLoadKg:null})),
  plannedMinutes:pending.reduce((n,x)=>n+x.plannedMinutes,0),transitionMinutes:0,unallocatedMinutes:Math.max(0,request.minutes-pending.reduce((n,x)=>n+x.plannedMinutes,0)),knowledgeUsed:day.knowledgeUsed||[],explanation:day.aiExplanation||`你的「${day.sceneName}」今日清单。固定项优先；轮换依据本场景周期内实际完成记录。未完成项目可稍后继续，不会自动补作完成。`};
 const reason=checkPlanStart(plan,state.profile);if(reason)throw Error(reason);return plan;
}
export function applySceneSession(state,session){
 const day=(state.sceneDays||[]).find(d=>d.id===session.planSnapshot?.sceneDayId);if(!day)return;
 for(const item of session.items.filter(i=>i.status==='completed')){const target=day.items.find(x=>x.id===item.sceneItemId&&x.activityId===item.activityId);if(target?.status==='completed')throw Error('这个场景项目已保存过完成记录，请勿重复保存。');if(target){target.status='completed';target.sessionId=session.id;}}
}
export function scenePlanStartReason(state,plan,now=new Date()){
 if(!plan?.sceneId)return null;
 const scene=sceneById(state,plan.sceneId),day=(state.sceneDays||[]).find(d=>d.id===plan.sceneDayId);
 if(!scene?.enabled||!day||day.sceneId!==scene.id)return '场景已暂停或移除，请回日常场景调整。';
 if(day.date!==sceneDate(now))return '这份场景清单不是今天的，请重新安排今天，不会把旧清单自动挪过来。';
 if(plan.items.some(i=>!day.items.some(x=>x.id===i.sceneItemId&&x.activityId===i.activityId&&x.status==='pending')))return '场景项目状态已变化，请退出本次安排后重新载入待做项目。';
 return null;
}
export function skipSceneItem(state,dayId,itemId){const day=(state.sceneDays||[]).find(x=>x.id===dayId),item=day?.items.find(x=>x.id===itemId);if(!item||item.status==='completed')throw Error('已完成项目不能改为跳过。');if(state.draft?.sceneDayId===dayId)throw Error('当前正在练这张清单，请在训练页操作，避免状态冲突。');item.status=item.status==='skipped'?'pending':'skipped';}
export function confirmSceneItem(state,dayId,itemId,input,context={},now=new Date()){
 const day=(state.sceneDays||[]).find(x=>x.id===dayId),item=day?.items.find(i=>i.id===itemId),scene=day&&sceneById(state,day.sceneId);
 if(!day||!scene||!item||item.status!=='pending'||day.date!==sceneDate(now))throw Error('项目已完成、已跳过或不是今天的清单。');
 if(state.draft?.sceneDayId===dayId)throw Error('正在练这张清单，请在训练页记录，不要重复确认。');
 const request=preservePainContext(day.request,sceneRequest({...scene,place:day.request.place,minutes:day.request.minutes},context)),block=safetyBlock(state.profile,request)||abilityBlock(state.assessments||[],now);
 if(block||state.draft?.pausedForDiscomfort)throw Error(block||'本次出现不舒服，请先结束已有训练。');
 const reason=sceneActivityReason(state,{...scene,place:request.place},item.activityId,context);if(reason)throw Error(reason);
 if(!input.confirmed)throw Error('请确认确实完成了这次活动。');
 const raw=String(input.minutes??'').trim(),minutes=raw?Number(raw):null;if(minutes!=null&&(!Number.isFinite(minutes)||minutes<=0||minutes>1440))throw Error('实际时长无效，不知道可留空。');
 const sessionId=`scene-done:${day.id}:${item.activityId}`;if(state.sessions.some(s=>s.id===sessionId))throw Error('这次场景项目已经记过，不能重复保存。');
 const actual={id:uid(),sceneItemId:item.id,activityId:item.activityId,activitySnapshot:structuredClone(activityById(item.activityId)),plannedMinutes:item.plannedMinutes,status:'completed',actualMinutes:minutes,actualSetDetails:null,actualSets:null,actualReps:null,actualLoadKg:null,feedback:clip(input.note,1000)};
 const session={id:sessionId,source:'user_confirmed',startedAt:null,endedAt:now.toISOString(),actualMinutes:minutes,effort:null,feedback:clip(input.note,1000),
  planSnapshot:{id:sessionId,createdAt:now.toISOString(),startedAt:null,sceneId:scene.id,sceneDayId:day.id,request,items:[{...structuredClone(actual),status:'pending',actualMinutes:null,feedback:''}],plannedMinutes:item.plannedMinutes,transitionMinutes:0,unallocatedMinutes:Math.max(0,request.minutes-item.plannedMinutes),explanation:`手动确认「${day.sceneName}」实际完成项目`},items:[actual]};
 applySceneSession(state,session);state.sessions.push(session);return session;
}
// Additive collections: validate shapes, tolerate stale historic references after older-version deletion.
export function validateScenesStore(state){
 for(const key of ['movementScenes','sceneDays'])if(state[key]!=null&&(!Array.isArray(state[key])||state[key].length>10000))throw Error('场景集合格式无效。');
 const seen=new Set();for(const s of state.movementScenes||[]){validateScene(s);if(!idOK(s.id)||seen.has(s.id)||!Number.isFinite(Date.parse(s.createdAt))||!Number.isFinite(Date.parse(s.updatedAt)))throw Error('场景记录格式无效或重复。');seen.add(s.id);}
 const days=new Set();for(const d of state.sceneDays||[]){if(!idOK(d.id)||!idOK(d.sceneId)||!dayOK(d.date)||d.id!==`${d.sceneId}:${d.date}`||typeof d.sceneName!=='string'||!Array.isArray(d.items)||d.items.length>10||days.has(`${d.sceneId}:${d.date}`)||!d.request||!integer(d.request.minutes,2,120)||!Object.hasOwn(places,d.request.place))throw Error('场景每日清单格式无效或重复。');days.add(`${d.sceneId}:${d.date}`);const items=new Set(),actions=new Set();for(const i of d.items){if(!idOK(i.id)||!idOK(i.activityId)||items.has(i.id)||actions.has(i.activityId)||!integer(i.plannedMinutes,1,30)||typeof i.name!=='string'||typeof i.fixed!=='boolean'||!['pending','completed','skipped'].includes(i.status)||i.sessionId!=null&&!idOK(i.sessionId))throw Error('场景项目格式无效。');items.add(i.id);actions.add(i.activityId);}}
 return state;
}
export function reconcileSceneDays(state){
 for(const day of state.sceneDays||[])for(const item of day.items){const session=(state.sessions||[]).find(s=>s.planSnapshot?.sceneDayId===day.id&&s.items.some(i=>i.activityId===item.activityId&&i.status==='completed'));if(session){item.status='completed';item.sessionId=session.id;}}
}
