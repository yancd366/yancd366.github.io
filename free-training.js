// Free training shares the normal draft/record format. Browsing is never completion.
import {activities,activityById,bodyRegions,places,phases} from './catalog.js';
import {uid,manualEligible,checkPlanStart} from './domain.js';
import {safetyBlock,safetyContext,regionsInText} from './safety.js';
import {abilityBlock} from './abilities.js';
import {validateSets,setSummary} from './training.js';
import {sortFreeCandidates} from './activity-history.js';
export const isFreeWorkout=plan=>plan?.source==='free';
export const freeRegionLabels={all:'全身',...Object.fromEntries(Object.entries(bodyRegions).map(([k,v])=>[k,k==='hips_legs'?'腿（含臀、髋、足踝）':v.label]))};
export function createFreeWorkout(config,profile,assessments=[],now=new Date()){
  if(config.studio)config={...config,region:'all'};
  if(!places[config.place]||!freeRegionLabels[config.region])throw new Error('请选择有效的场地和训练部位。');
  const request={minutes:180,place:config.place,focus:'balanced',readiness:config.readiness||'normal',targetRegions:[],userText:String(config.userText||'').slice(0,1000)};
  if(!['normal','tired','discomfort'].includes(request.readiness))throw new Error('请选择有效的身体状态。');
  const reason=safetyBlock(profile,request)||abilityBlock(assessments);if(reason&&!config.studio)throw new Error(reason);
  return {id:uid(),source:'free',createdAt:now.toISOString(),startedAt:null,request,safetyContext:safetyContext(profile,request),items:[],plannedMinutes:0,transitionMinutes:0,unallocatedMinutes:0,cautions:[],explanation:'你自己选择的自由训练；只记录实际确认完成的组次。',freeConfig:{region:config.region,phase:'main',search:''}};
}
export function freeRecordingBlock(plan,profile,assessments=[]){
  if(!isFreeWorkout(plan))return '没有进行中的自由训练。';
  if(plan.pausedForDiscomfort)return '本次出现了不舒服，请结束并保留已练记录，不继续增加训练。';
  if(plan.studioVersion===1)return null;
  return checkPlanStart(plan,profile)||abilityBlock(assessments);
}
export function freeActivityPhase(a,state,region){
  const use=(state.activityUses||[]).find(u=>u.activityId===a.id&&(!u.region||region==='all'||u.region===region||region==='hips_legs'&&u.region==='calves_ankles')&&phases[u.use]);
  return use?.use||a.phase||'main';
}
export function freeMatchesRegion(a,state,region){
  if(region==='all')return true;
  const regions=new Set([...(a.primaryRegions||[]),...(a.secondaryRegions||[]),...regionsInText((a.body||[]).join(' '))]);
  if(regions.has(region)||region==='hips_legs'&&regions.has('calves_ankles'))return true;
  return (state.activityUses||[]).some(u=>u.activityId===a.id&&u.region===region)||a.category==='mobility'&&(a.body||[]).includes('全身');
}
export function freeCandidates(state,config=state.draft?.freeConfig){
  if(!isFreeWorkout(state.draft)||!config)return [];
  const query=String(config.search||'').trim().toLowerCase(),block=freeRecordingBlock(state.draft,state.profile,state.assessments);
  const studio=state.draft.studioVersion===1;
  const rows=activities.filter(a=>!a.archived&&(studio||freeMatchesRegion(a,state,config.region))&&(!query||[a.name,...a.aliases,...a.body].join(' ').toLowerCase().includes(query)))
    .map(a=>{const phase=freeActivityPhase(a,state,config.region),allowed=!block&&manualEligible(a,state.draft.request,state.profile);return {activity:a,phase,allowed,reason:allowed?'':block||'不符合本次器械、场地、状态或难度条件，可查看做法。'};})
    .map(x=>studio?{...x,allowed:!block}:x).filter(x=>studio||config.phase==='all'||x.phase===config.phase);
  return sortFreeCandidates(rows,state,config.sort||'balanced');
}
export function selectFreeActivity(plan,id,profile,assessments=[],now=new Date()){
  const reason=freeRecordingBlock(plan,profile,assessments);if(reason)throw new Error(reason);
  const a=activityById(id);if(!a||a.archived||plan.studioVersion!==1&&!manualEligible(a,plan.request,profile))throw new Error('这个动作不符合本次器械、场地、状态或难度条件。');
  let item=plan.items.find(i=>i.activityId===id);
  if(!item){item={id:uid(),activityId:id,activitySnapshot:structuredClone(a),role:a.phase||'main',manual:true,plannedMinutes:a.minutes,status:'pending',actualMinutes:null,actualSets:null,actualReps:null,actualLoadKg:null,actualSetDetails:null,prescription:null,feedback:''};plan.items.push(item);plan.plannedMinutes+=a.minutes;}
  plan.cursor=plan.items.indexOf(item);plan.startedAt ||= now.toISOString();return item;
}
export function removeFreeSet(plan,itemId,index){
  if(!isFreeWorkout(plan))throw new Error('不是自由训练。');
  const item=plan.items.find(i=>i.id===itemId);
  if(!item||!Number.isInteger(index)||index<0||index>=(item.actualSetDetails||[]).length)throw new Error('找不到这一组。');
  const sets=item.actualSetDetails.filter((_,n)=>n!==index);validateSets(sets);Object.assign(item,setSummary(sets));item.status=sets.length?'completed':'pending';
}
export function removeFreePending(plan,itemId){
  if(!isFreeWorkout(plan))throw new Error('不是自由训练。');
  const i=plan.items.find(x=>x.id===itemId);if(!i||i.status==='completed'||i.actualSetDetails?.length)throw new Error('已有记录的动作请先核对组次，不直接移除。');
  plan.items=plan.items.filter(x=>x.id!==itemId);plan.plannedMinutes=Math.max(0,plan.plannedMinutes-i.plannedMinutes);plan.cursor=0;
}
