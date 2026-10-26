// AI chooses only within the user's scene pool. No requests or writes here.
import {activityById} from './catalog.js';
import {buildPlanInput,validatePlan} from './ai.js';
import {preservePainContext} from './safety.js';
import {sceneById,proposeSceneDay,sceneRequest,sceneActivityReason,sceneHistory,chooseSceneProposal} from './movement-scenes.js';
export function buildSceneAIInput(state,sceneId,text,context={},now=new Date()){
 const scene=sceneById(state,sceneId),request=preservePainContext(context,sceneRequest(scene||{}, {...context,userText:String(text||'').trim().slice(0,500)}));
 const base=proposeSceneDay(state,sceneId,request,now),history=sceneHistory(state,scene,now);
 const available=scene.activityIds.filter(id=>!sceneActivityReason(state,scene,id,request));
 const ordered=[...scene.fixedIds,...available.filter(id=>!scene.fixedIds.includes(id)).sort((a,b)=>(history.get(a)?.count||0)-(history.get(b)?.count||0))].slice(0,60),allowed=new Set(ordered);
 const input=buildPlanInput(state,request,{now});input.candidates=input.candidates.filter(line=>allowed.has(line.split('|')[0])).map(line=>{const xs=line.split('|');xs[10]=String(scene.itemMinutes[xs[0]]||activityById(xs[0]).minutes);return xs.join('|');});
 input.personalNotes=input.personalNotes.filter(n=>allowed.has(n.activityId));input.activityUses=input.activityUses.filter(n=>allowed.has(n.activityId));input.methodPreference=null;input.knowledgeSummaries=[];
 input.request.skipWarmup=true;input.scene={name:scene.name,fixedActivityIds:scene.fixedIds,maxItems:scene.dailyCount,cycle:base.cycle,history:ordered.map(id=>({activityId:id,count:history.get(id)?.count||0})),rule:'只从场景候选挑选；保留全部固定项。minutes严格使用候选给定分钟。sets/reps/seconds/restSeconds均为null，不另开处方。不必凑热身主项收尾，无法满足需求时clarify。'};
 input.instruction=input.scene.rule;
 const refs=input.personalKnowledge.map(r=>({id:r.id,title:r.title,...(state.knowledge.find(k=>k.id===r.id)?.url?{sourceUrl:state.knowledge.find(k=>k.id===r.id).url}:{})}));
 return {input,request,sceneId,base,refs,allowedIds:ordered};
}
export function validateSceneAI(output,built,state,context={},now=new Date()){
 const scene=sceneById(state,built.sceneId);if(!scene)return {ok:false,errors:['场景已移除']};
 if(output?.status==='ok'){
  if(!Array.isArray(output.items)||!output.items.length||output.items.length>10||output.items.some(i=>!i||typeof i!=='object'||Array.isArray(i)))return {ok:false,errors:['items应为1～10个动作对象']};
  const items=output.items,ids=items.map(i=>i.activityId),errors=[];
  if(items.length>scene.dailyCount||ids.some(id=>!built.allowedIds.includes(id)))errors.push('只能从已发送的场景候选里挑，且不能超出单日数量');
  if(scene.fixedIds.some(id=>!ids.includes(id)))errors.push('必须保留全部固定项');
  for(const i of items){if(i.minutes!==(scene.itemMinutes[i.activityId]||activityById(i.activityId)?.minutes))errors.push('请保持用户场景设置中的每项分钟');if(['sets','reps','seconds','restSeconds'].some(k=>i[k]!=null))errors.push('本次只挑动作，组次数量请留null');}
  if(errors.length)return {ok:false,errors};
 }
 const checked=validatePlan(output,{request:built.request,profile:state.profile,now,uses:state.activityUses,refs:built.refs});
 if(!checked.ok||checked.status!=='ok')return checked;
 try{const proposal=chooseSceneProposal(state,built.base,checked.plan.items.map(i=>i.activityId),built.request,now);proposal.aiExplanation=checked.plan.explanation;proposal.knowledgeUsed=checked.plan.knowledgeUsed;return {ok:true,status:'ok',proposal,warnings:checked.warnings};}
 catch(error){return {ok:false,errors:[error.message]};}
}
