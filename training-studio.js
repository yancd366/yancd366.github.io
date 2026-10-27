// Manual recording workflow is separate from AI recommendation eligibility. No network.
import {activityById} from './catalog.js';
import {uid,manualEligible} from './domain.js';
import {safetyBlock,safetyContext,activityAllowedByPain} from './safety.js';
import {abilityBlock} from './abilities.js';
import {createFreeWorkout,selectFreeActivity} from './free-training.js';
export function createStudio(config,profile,assessments=[],now=new Date()){
 const p=createFreeWorkout({...config,studio:true},profile,assessments,now);return upgradeStudio(p);
}
export function upgradeStudio(p){p.studioVersion=1;p.freeConfig={...p.freeConfig,region:'all',phase:'all',layout:p.freeConfig.layout||'stack'};p.studioGroups||=[];p.studioSelected||=[];return p;}
export function studioCaution(plan,item,profile,assessments=[]){
 const a=activityById(item.activityId)||item.activitySnapshot,global=safetyBlock(profile,plan.request)||abilityBlock(assessments),pain=a&&!activityAllowedByPain(a,profile,plan.request);
 if(global||pain)return {safety:true,text:global||'这个动作涉及你已说明的疼痛部位；不提供开练指导，仅可补记已经做过的事实。',key:safetyContext(profile,plan.request)};
 if(!a||!item.activityId)return {safety:false,text:'未关联动作库，仅记录你的动作名称与实际组次，不提供动作教学。'};
 if(!manualEligible(a,plan.request,profile)||a.selectable===false)return {safety:false,text:'该动作未通过自动安排条件；你仍可自行记录，不代表App推荐或确认适合你。'};
 return null;
}
export function studioRecordBlock(plan,item,profile,assessments=[]){
 if(plan.pausedForDiscomfort)return '本次已记录不舒服，请结束并保留记录，不继续练习。';
 const c=studioCaution(plan,item,profile,assessments);return c?.safety&&item.studioSafetyAck!==c.key?'请先确认：这里只补记已经完成的事实，不是继续开练。':null;
}
export function acknowledgeStudioItem(plan,itemId,profile,assessments=[]){const i=plan.items.find(i=>i.id===itemId);if(!i)throw Error('找不到动作。');const c=studioCaution(plan,i,profile,assessments);if(c?.safety)i.studioSafetyAck=c.key;}
export function openStudioItem(plan,itemId){const i=plan.items.find(i=>i.id===itemId);if(!i)throw Error('找不到动作。');plan.cursor=plan.items.indexOf(i);plan.studioOpenId=i.id;return i;}
export function pickStudioActivity(plan,id,profile,assessments=[],now=new Date()){
 const i=selectFreeActivity(plan,id,profile,assessments,now);plan.studioOpenId=i.id;return i;
}
export function addStudioCustom(plan,name,now=new Date()){
 name=String(name||'').trim();if(!name||name.length>80)throw Error('请填写80字以内的动作名称。');
 const id=uid(),item={id,activityId:null,customName:name,activitySnapshot:{id,name,equipment:[],body:[],category:'unknown'},role:'main',manual:true,plannedMinutes:0,status:'pending',actualSetDetails:null,actualSets:null,actualReps:null,actualLoadKg:null,actualMinutes:null,feedback:''};plan.items.push(item);plan.startedAt||=now.toISOString();return openStudioItem(plan,id);
}
export function markStudioDone(plan,itemId,now=new Date()){
 const i=plan.items.find(i=>i.id===itemId);if(!i?.actualSetDetails?.length)throw Error('先保存实际组次或感受，再确认这个动作练完。');i.studioDoneAt=now.toISOString();if(plan.studioOpenId===i.id)plan.studioOpenId=null;
}
export function studioSetMetadata(plan,item){
 const group=plan.studioGroups?.find(g=>g.itemIds.includes(item.id));
 return {...(item.studioPhaseConfirmed?{phase:item.role}:{}),...(group?{studioGroupId:group.id,studioRound:(item.actualSetDetails?.length||0)+1}:{})};
}
export function toggleStudioSelection(plan,id,on){if(!activityById(id))throw Error('找不到动作。');const ids=new Set(plan.studioSelected||[]);on?ids.add(id):ids.delete(id);if(ids.size>10)throw Error('一次最多多选10个动作。');plan.studioSelected=[...ids];}
export function addStudioSelection(plan,profile,assessments=[],grouped=false,now=new Date()){
 const ids=plan.studioSelected||[];if(!ids.length||grouped&&ids.length<2)throw Error(grouped?'至少选择两个动作组成一组。':'请先选择动作。');
 const items=ids.map(id=>pickStudioActivity(plan,id,profile,assessments,now));
 if(grouped){if(items.some(i=>plan.studioGroups.some(g=>g.itemIds.includes(i.id))))throw Error('部分动作已在另一组合中，请先拆开再重新分组。');plan.studioGroups.push({id:uid(),name:`组合 ${plan.studioGroups.length+1}`,itemIds:items.map(i=>i.id)});}
 plan.studioSelected=[];openStudioItem(plan,items[0].id);return items;
}
export function nextStudioGroupItem(plan,itemId){const g=plan.studioGroups?.find(g=>g.itemIds.includes(itemId));if(!g)return;openStudioItem(plan,g.itemIds[(g.itemIds.indexOf(itemId)+1)%g.itemIds.length]);}
export function finishStudioGroup(plan,id,now=new Date()){const g=plan.studioGroups?.find(g=>g.id===id);if(!g)throw Error('找不到组合。');if(g.itemIds.some(id=>!plan.items.find(i=>i.id===id)?.actualSetDetails?.length))throw Error('组合里还有动作没记录，不能把它们一起当作练完。');for(const id of g.itemIds)markStudioDone(plan,id,now);}
export function ungroupStudio(plan,id){plan.studioGroups=(plan.studioGroups||[]).filter(g=>g.id!==id);}
export function repeatSession(state,id,now=new Date()){
 if(state.draft)throw Error('已有训练草稿，请先保存或退出，不会覆盖。');const s=state.sessions.find(s=>s.id===id);if(!s)throw Error('找不到这次记录。');
 const old=s.items.filter(i=>i.status==='completed');if(!old.length)throw Error('这次没有可复用的动作。');
 const place=s.planSnapshot?.request?.place||'home',p=createStudio({place,readiness:'normal',userText:''},state.profile,state.assessments,now),map=new Map();
 p.repeatedFromSessionId=id;p.repeatedFromDate=s.endedAt;
 p.items=old.map(i=>{const a=activityById(i.activityId),nextId=uid();map.set(i.id,nextId);return {id:nextId,activityId:a?.id||null,customName:!a?(i.activitySnapshot?.name||i.customName||'未命名动作'):null,activitySnapshot:a?structuredClone(a):{id:nextId,name:i.activitySnapshot?.name||i.customName||'未命名动作',equipment:[],category:'unknown',body:[]},role:i.role||'main',manual:true,plannedMinutes:a?.minutes||i.plannedMinutes||3,status:'pending',actualMinutes:null,actualSets:null,actualReps:null,actualLoadKg:null,actualSetDetails:null,prescription:null,feedback:'',previousSetDetails:structuredClone(i.actualSetDetails||[])};});
 p.studioGroups=(s.planSnapshot?.studioGroups||[]).flatMap(g=>{const itemIds=g.itemIds.map(id=>map.get(id)).filter(Boolean);return itemIds.length>1?[{id:uid(),name:g.name,itemIds}]:[];});
 p.plannedMinutes=p.items.reduce((n,i)=>n+i.plannedMinutes,0);p.cursor=0;p.studioOpenId=null;return p;
}
export function validateStudioShape(plan){
 if(plan?.studioVersion==null)return;if(plan.studioVersion!==1||plan.source!=='free'||!['stack','flat'].includes(plan.freeConfig?.layout))throw Error('训练卡片设置格式无效。');
 const ids=new Set(plan.items.map(i=>i.id)),members=new Set(),groups=new Set();
 if(!Array.isArray(plan.studioGroups)||plan.studioGroups.length>100||!Array.isArray(plan.studioSelected)||plan.studioSelected.length>10||plan.studioSelected.some(id=>typeof id!=='string')||new Set(plan.studioSelected).size!==plan.studioSelected.length)throw Error('训练多选或组合格式无效。');
 for(const g of plan.studioGroups){if(typeof g.id!=='string'||groups.has(g.id)||typeof g.name!=='string'||g.name.length>80||!Array.isArray(g.itemIds)||g.itemIds.length<2||g.itemIds.length>10||new Set(g.itemIds).size!==g.itemIds.length||g.itemIds.some(id=>!ids.has(id)||members.has(id)))throw Error('训练组合引用无效。');groups.add(g.id);g.itemIds.forEach(id=>members.add(id));}
 for(const i of plan.items)if(i.studioDoneAt!=null&&!Number.isFinite(Date.parse(i.studioDoneAt)))throw Error('动作完成日期无效。');
}
// Keep new recorder drafts out of the legacy draft slot: old versions assume every free item has a catalogue ID.
export function studioDataForStorage(state){return state.draft?.studioVersion===1?{...state,studioDraft:state.draft,draft:null}:state;}
