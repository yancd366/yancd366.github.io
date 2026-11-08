// Pure conversation projection and model-result validation. Never calls a service.
import {activities} from './catalog.js';
import {cleanCloudValue} from './cloud-backup.js';
import {movementIntent,activityAllowedByPain} from './safety.js';
import {actionMaterial,actionTask,actionEditRequest,validateActionEdit,sceneTarget,sceneCandidateMaterials} from './assistant-tasks.js';
const clip=(s,n)=>String(s??'').trim().slice(0,n),plain=s=>String(s??'').replace(/\s+/g,'');
const forbidden=/诊断|治疗|治愈|根治|矫正|康复处方|保证|(?:导致|造成).{0,10}(?:疼痛|疾病|骨盆)/;
const effectClaim=/改善|缓解|促进|有助于|有益于|血液循环|导致|造成|预防|避免损伤/;
export function assistantText(value){const text=clip(value,8000);if(!text)throw Error('先写下需求、动作名称或链接。');cleanCloudValue({text});return text;}
export const newAssistantThread=(context={})=>({id:crypto.randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),context,messages:[],draftText:'',allowWeb:false});
export const assistantMaterial=actionMaterial;
export function assistantCatalog(state,text){
 const intent=movementIntent([state.profile?.bodyNotes,text].filter(Boolean).join('\n')),q=plain(text).toLowerCase();
 const tokens=[...new Set((q.match(/[a-z]{3,}|[\u4e00-\u9fff]{2}/g)||[]).filter(x=>!['动作','训练','一下','帮我','想要','怎么','可以','相关'].includes(x)))];
 return activities.filter(a=>!a.archived&&!intent.unknownPain&&activityAllowedByPain(a,state.profile,{userText:text})).map((a,i)=>{const hay=[a.name,...a.aliases,...a.body,a.description].join(' ').toLowerCase();return {a,i,score:(q.includes(a.name.toLowerCase())?100:0)+tokens.reduce((n,t)=>n+(hay.includes(t)?1:0),0)};}).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,50).map(({a})=>({id:a.id,name:a.name,aliases:a.aliases,material:assistantMaterial(a),personal:Boolean(a.personal),needsGuidance:a.selectable===false}));
}
export function buildAssistantInput(state,thread,text){
 const question=assistantText(text),history=thread.messages.slice(-8).map(m=>({role:m.role,text:clip(m.text,1200),...(m.actions?.length?{actions:m.actions.map(a=>({activityId:a.activityId,name:a.name}))}:{})})),task=actionTask(thread),editRequest=actionEditRequest(question,task),taskQuery=thread.messages.filter(m=>m.role==='assistant'&&m.query).at(-1)?.query||'',combined=[taskQuery,...history.filter(m=>m.role==='user').map(m=>m.text),question].join('\n');
 const hint=sceneTarget(state,question,thread.context)||((editRequest||/加入|场景/.test(question))?task?.sceneHint:null),knowledgeOnly=thread.context?.kind==='knowledge'&&!/找动作|添加动作|新动作|安排训练|搜动作/.test(question)||/我的知识库|我的收藏|书摘/.test(question);
 let catalog=knowledgeOnly?[]:assistantCatalog(state,combined),sceneLimitReason='';if(hint&&!knowledgeOnly)try{catalog=sceneCandidateMaterials(state,hint,[taskQuery,question].join('\n').slice(0,1500))||catalog;}catch(e){catalog=[];sceneLimitReason=e.message;}
 const draft=thread.messages.filter(m=>m.intake).at(-1);return {question,taskQuery,history,context:thread.context,allowWeb:Boolean(thread.allowWeb),catalog,sceneHint:hint,sceneLimitReason,actionTask:task?{...task,editRequest}:null,draftContext:draft?.intake?.candidates?.map(c=>({name:c.name,description:c.draft?.description||'',steps:c.draft?.steps||[]}))||[],limits:{maxActions:5},painMentioned:movementIntent([state.profile?.bodyNotes,combined].filter(Boolean).join('\n')).hasPain};
}
export function validateAssistantTurn(output,input){
 const errors=[],intents=['find_actions','research_action','describe_action','knowledge','handoff','clarify'];if(!output||!intents.includes(output.intent))return {ok:false,errors:['intent无效']};
 let text=clip(output.text,1200);const query=clip(output.query||input.question,300);if(!text||forbidden.test(text))errors.push('回答缺失或含医学承诺');
 const actions=[],seen=new Set();for(const [index,row]of (Array.isArray(output.actions)?output.actions:[]).slice(0,5).entries()){const a=input.catalog.find(x=>x.id===row.activityId),quote=clip(row.evidenceQuote,300);let why=clip(row.why,180);if(!a||seen.has(a.id)||!quote||!plain(a.material).includes(plain(quote))||forbidden.test(why)){errors.push(`第${index+1}项须使用catalog中的activityId，evidenceQuote必须逐字复制该项material中的连续原文`);continue;}if(effectClaim.test(why))why='动作资料提到：'+quote;seen.add(a.id);actions.push({activityId:a.id,name:a.name,why,evidenceQuote:quote,needsGuidance:a.needsGuidance});}
 if(actions.length&&effectClaim.test(text))text='根据动作库资料找到以下候选。请打开详情，核对做法与自己的需求是否一致。';
 const patch=output.intent==='find_actions'?validateActionEdit(output.actionEdit,input,actions):{edit:null};if(patch.errors)errors.push(...patch.errors);
 const handoff=['plan','log','body','scene'].includes(output.handoff)?output.handoff:null;if(output.intent==='handoff'&&!handoff)errors.push('任务入口无效');if(handoff==='scene'&&!input.actionTask)errors.push('先用find_actions找场景候选，再加入场景；不能直接跳过找动作');
 return errors.length?{ok:false,errors}:{ok:true,intent:output.intent,text,query,actions,handoff,actionEdit:patch.edit};
}
