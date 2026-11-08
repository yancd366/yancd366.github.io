// Action candidates and scene review contracts. No network or business writes before confirmation.
import {activityById} from './catalog.js';
import {sceneById,sceneDefaults,SCENE_TEMPLATES,saveScene,validateScene} from './movement-scenes.js';
import {buildScenePoolInput} from './scene-pool.js';
const clip=(v,n)=>String(v??'').trim().slice(0,n);
export const actionMaterial=a=>[a.name,a.description,...(a.setup||[]),...(a.steps||[]),...(a.cues||[])].filter(Boolean).join('\n').slice(0,1400);
export const activeActionMessage=thread=>thread.activeActionMessageId===null?null:thread.messages.find(m=>m.id===thread.activeActionMessageId&&m.actions?.length)||thread.messages.findLast(m=>m.actions?.length&&!m.supersededBy)||null;
export function actionEditRequest(text,task){
 if(!task||!/换|替换/.test(text))return null;
 const number=text.match(/第\s*([一二两三四五六七八九十\d]+)\s*(?:个|项)/),lookup={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
 if(number){const index=(lookup[number[1]]||Number(number[1]))-1;return {mode:'replace',indices:[index]};}
 if(/换一批|全部|都换|换成|改换/.test(text))return {mode:'all',indices:[]};
 return null;
}
export function actionTask(thread){const m=activeActionMessage(thread);return m?{messageId:m.id,actions:m.actions,selectedIds:m.selectedActivityIds||[],purposeText:m.purposeText||m.query||'',sceneHint:m.sceneHint||null,savedScene:m.savedScene||null}:null;}
export function validateActionEdit(raw,input,actions){
 const request=input.actionTask?.editRequest;
 if(!request&&!raw)return {edit:null};
 if(!raw||!input.actionTask||raw.messageId!==input.actionTask.messageId||!['replace','all'].includes(raw.mode))return {errors:['请用actionEdit引用当前候选messageId，保留未要求修改的动作']};
 if(request&&raw.mode!==request.mode)return {errors:['actionEdit的mode须符合本轮指定的修改范围']};
 if(raw.mode==='all'){if(!actions.length)return {errors:['替换一批须给出新的可核对候选']};return {edit:{messageId:raw.messageId,mode:'all',indices:[]}};}
 const indices=raw.indices;if(!Array.isArray(indices)||!indices.length||indices.length!==actions.length||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=input.actionTask.actions.length)||request&&JSON.stringify(indices)!==JSON.stringify(request.indices))return {errors:['逐项替换的indices从0起，必须对应用户指定项，且每项给一个新动作']};
 if(actions.some((a,i)=>a.activityId===input.actionTask.actions[indices[i]].activityId))return {errors:['替换项应使用不同动作；没有合适替代时请返回clarify']};
 const remaining=new Set(input.actionTask.actions.filter((_,i)=>!indices.includes(i)).map(a=>a.activityId));if(actions.some(a=>remaining.has(a.activityId)))return {errors:['替换动作不能与其余保留项重复']};
 return {edit:{messageId:raw.messageId,mode:'replace',indices}};
}
export function decorateActionResult(thread,result,hint){
 const old=result.actionEdit&&thread.messages.find(m=>m.id===result.actionEdit.messageId);let actions=result.actions,selected=[];
 if(old){actions=result.actionEdit.mode==='all'?result.actions:old.actions.map((a,i)=>{const n=result.actionEdit.indices.indexOf(i);return n<0?a:result.actions[n]});selected=(old.selectedActivityIds||[]).flatMap(id=>{const index=old.actions.findIndex(a=>a.activityId===id),n=result.actionEdit.indices.indexOf(index);return result.actionEdit.mode==='all'?[]:n<0?[id]:[result.actions[n].activityId]});}
 return {...result,actions,selectedActivityIds:selected,sceneHint:hint||old?.sceneHint||null,previousActionMessageId:old?.id||null};
}
export function sceneTarget(state,text,context={}){
 if(context.sceneId&&sceneById(state,context.sceneId))return {sceneId:context.sceneId};
 const exact=(state.movementScenes||[]).filter(s=>text.includes(s.name)).sort((a,b)=>b.name.length-a.name.length);if(exact.length&&(!exact[1]||exact[0].name.length>exact[1].name.length))return {sceneId:exact[0].id};
 const key=/办公|办公室/.test(text)?'office':/晨起|早上|起床/.test(text)?'morning':/睡前|睡觉前/.test(text)?'bedtime':null;if(!key)return null;
 const matches=(state.movementScenes||[]).filter(s=>s.templateKey===key||s.name===SCENE_TEMPLATES[key].name);return matches.length===1?{sceneId:matches[0].id}:matches.length>1?null:{templateKey:key};
}
export function sceneCandidateMaterials(state,hint,purpose){
 const cfg=hint?.sceneId?sceneById(state,hint.sceneId):hint?.templateKey?{...sceneDefaults(),...SCENE_TEMPLATES[hint.templateKey],id:'assistant-preview',createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()}:null;
 if(!cfg)return null;
 const preview={...state,movementScenes:[...(state.movementScenes||[]).filter(s=>s.id!==cfg.id),cfg]},built=buildScenePoolInput(preview,cfg.id,purpose);
 const noWeights=/徒手|不用器械|不需要器械/.test(purpose),noMat=/不用垫|不要垫|没有垫/.test(purpose);
 return built.input.candidates.filter(c=>{const a=activityById(c.id);return (!noWeights||a.equipment.every(e=>e==='mat'))&&(!noMat||!a.equipment.includes('mat'));}).map(c=>({id:c.id,name:c.name,aliases:activityById(c.id).aliases,material:c.evidence,personal:Boolean(activityById(c.id).personal),needsGuidance:c.needsReview}));
}
export const actionSelectionSignature=m=>JSON.stringify([m?.actions?.map(a=>a.activityId)||[],m?.selectedActivityIds||[],m?.savedActivityIds||[]]);
export function sceneDraftFromTask(thread,text,state){
 const task=actionTask(thread);if(!task)throw Error('先找出一组动作，再选择要加入场景的项目。');
 let ids=task.selectedIds.length?[...task.selectedIds]:task.actions.map(a=>a.activityId);const fixed=[],pick=text.match(/第\s*([一二两三四五\d]+)\s*个/),numbers={一:1,二:2,两:2,三:3,四:4,五:5};
 if(pick&&!/固定|必做/.test(text)&&/加入|放进|放到|保存/.test(text)){const a=task.actions[(numbers[pick[1]]||Number(pick[1]))-1];if(!a)throw Error('没有这个序号的候选，请重新选择。');ids=/不要|排除|不选|去掉/.test(text)?ids.filter(id=>id!==a.activityId):[a.activityId];}
 if(/每天|固定|必做/.test(text)){const m=text.match(/第\s*([一二两三四五\d]+)\s*个/),lookup={一:1,二:2,两:2,三:3,四:4,五:5};if(m){const a=task.actions[(lookup[m[1]]||Number(m[1]))-1];if(!a||!ids.includes(a.activityId))throw Error('要固定的项目不在当前选择里，请先勾选或说明要加入哪些动作。');fixed.push(a.activityId);}else if(/都.*固定|全部.*固定|每天都做|每天必做/.test(text)||ids.length===1)fixed.push(...ids);}
 const minutes=text.match(/(\d{1,3})\s*分钟/);if(minutes&&(Number(minutes[1])<2||Number(minutes[1])>120))throw Error('场景时长请设为2～120分钟。');
 const purpose=[task.purposeText,text].filter(Boolean).join('\n');if(purpose.length>1500)throw Error('场景需求较长，请精简后再核对，原对话仍保留。');
 return {sourceMessageId:task.messageId,sourceSignature:actionSelectionSignature(activeActionMessage(thread)),activityIds:ids,fixedIds:fixed,minutes:minutes?Number(minutes[1]):null,target:sceneTarget(state,text)||task.sceneHint||null,evidence:task.actions.map(a=>({activityId:a.activityId,quote:a.evidenceQuote})),purpose};
}
export function prepareAssistantScene(state,bundle,target){
 const old=target?.sceneId?sceneById(state,target.sceneId):null;if(target?.sceneId&&!old)throw Error('目标场景已移除，请重新选择。');
 if(!old&&target?.templateKey){const t=SCENE_TEMPLATES[target.templateKey],matches=(state.movementScenes||[]).filter(s=>s.templateKey===target.templateKey||s.name===t?.name);if(matches.length===1)return prepareAssistantScene(state,bundle,{sceneId:matches[0].id});if(matches.length>1)throw Error('有多个相似场景，请重新选择目标。');}
 const base=old||{...sceneDefaults(),...(SCENE_TEMPLATES[target?.templateKey]||{}),name:clip(target?.name||SCENE_TEMPLATES[target?.templateKey]?.name,40),...(target?.place?{place:target.place}:{})};if(!base.name)throw Error('请填写场景名称。');
 if(!Array.isArray(bundle.activityIds)||!bundle.activityIds.length||new Set(bundle.activityIds).size!==bundle.activityIds.length)throw Error('请至少选择一个动作。');

 // For a custom scene use the chosen scene place, rather than a template's default place.
 const preview={...state,movementScenes:[...(state.movementScenes||[]).filter(s=>s.id!=='assistant-review-target'),{...base,id:'assistant-review-target'}]},checked=buildScenePoolInput(preview,'assistant-review-target',bundle.purpose||'核对场景动作'),map=new Map(checked.allEligible.map(a=>[a.id,a]));
 for(const id of bundle.activityIds){if(!map.has(id)||!activityById(id)||activityById(id).archived)throw Error(`「${activityById(id)?.name||'动作'}」不符合当前场景或身体/器械条件，请调整选择。`);const quote=bundle.evidence?.find(e=>e.activityId===id)?.quote;if(quote&&![map.get(id).evidence,actionMaterial(activityById(id))].some(t=>t.replace(/\s+/g,'').includes(quote.replace(/\s+/g,''))))throw Error('动作资料已变化，请重新查找并核对，未保存到场景。');}
 const activityIds=[...new Set([...base.activityIds,...bundle.activityIds])],fixedIds=[...new Set([...base.fixedIds,...bundle.fixedIds])];if(fixedIds.some(id=>!activityIds.includes(id)||activityById(id).selectable===false))throw Error('仅手动使用的动作可以入池，不能设为每日固定；请先核对动作安排权限。');
 const input={...structuredClone(base),activityIds,fixedIds,minutes:bundle.minutes||base.minutes,dailyCount:Math.max(base.dailyCount,fixedIds.length),poolPurpose:bundle.purpose||base.poolPurpose||'',...(target.templateKey?{templateKey:target.templateKey}:{})};
 validateScene(input);
 return {sourceMessageId:bundle.sourceMessageId,sourceIds:[...bundle.activityIds],targetId:old?.id||null,expected:old?JSON.stringify(old):null,input,added:bundle.activityIds.filter(id=>!base.activityIds.includes(id)),existing:bundle.activityIds.filter(id=>base.activityIds.includes(id))};
}
export function confirmAssistantScene(state,review,input){
 const current=review.targetId?sceneById(state,review.targetId):null;if(review.targetId&&JSON.stringify(current)!==review.expected)throw Error('场景已被另一处修改，请重新核对；你的填写仍保留。');
 const preview={...state,movementScenes:[...(state.movementScenes||[]).filter(s=>s.id!=='assistant-confirm-target'),{...input,id:'assistant-confirm-target'}]},eligible=buildScenePoolInput(preview,'assistant-confirm-target',review.input.poolPurpose||'核对场景动作').allEligible;
 const kept=new Set(eligible.map(a=>a.id));for(const id of input.activityIds)if(!current?.activityIds.includes(id)&&!kept.has(id))throw Error('场地、器械或身体条件已变化，请重新核对新增动作。');
 // saveScene mutates only after full validation; today's agenda is deliberately untouched.
 if(input.fixedIds.some(id=>activityById(id)?.selectable===false))throw Error('仅手动的动作不能设为每日固定。');if(input.fixedIds.reduce((n,id)=>n+(input.itemMinutes[id]||activityById(id)?.minutes||0),0)>input.minutes)throw Error('固定动作合计超过本次时长，请增加时间或减少固定项。');
 const scene=saveScene(state,{...input,templateKey:review.input.templateKey||null,poolPurpose:review.input.poolPurpose||''},review.targetId);return {id:scene.id,name:scene.name,activityIds:review.sourceIds.filter(id=>scene.activityIds.includes(id))};
}
