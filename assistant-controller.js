import {newAssistantThread,assistantText,buildAssistantInput,validateAssistantTurn} from './assistant-core.js';
import {buildTeachingSelection,validateTeachingSelection,teachingIntake,assistantOnlinePermission,validateResearchIntake,assistantProvidedLink} from './assistant-research.js';
import {buildActivityIntakeInput,validateActivityIntake} from './personal-activities.js';
import {decorateActionResult,sceneDraftFromTask,actionMaterial} from './assistant-tasks.js';
import {activityById} from './catalog.js';
export function createAssistantController({scope,store,getState,ask,knowledge,search,readSource,onUpdate=()=>{},check=()=>true}){
 let thread=null,busy=false,progress='',error='',generation=0,stopped=false,saves=Promise.resolve(),abort=null;
 const valid=()=>!stopped&&check();
 const paint=()=>{if(valid())onUpdate({thread,busy,progress,error});};
 async function persist(){const operation=saves.catch(()=>{}).then(async()=>{if(!valid())throw Error('账号已切换。');const copy=structuredClone(thread),saved=await store.save(scope,copy);if(!valid())throw Error('账号已切换。');if(thread.id===copy.id)thread.revision=saved.revision;});saves=operation;return operation;}
 const live=ticket=>ticket===generation&&valid();
 async function searchFor(query,ticket){if(!search)throw Error('联网查找暂未接入。');progress='正在查找教学来源…';paint();const r=await search(query);if(!live(ticket))return null;return r.status==='empty'?{text:r.reason,query,intent:'research_action'}:{text:'找到以下教学线索。请选择最像的版本或来源，读取正文后再核对做法。',query,intent:'research_action',searchPoints:r.points.slice(0,3)};}
 async function work(task){if(busy||!thread||!valid())return;const ticket=++generation;busy=true;error='';abort=new AbortController();paint();try{const result=await task(ticket,abort.signal);if(!live(ticket)||!result)return;thread.messages.push({id:crypto.randomUUID(),role:'assistant',...result});thread.updatedAt=new Date().toISOString();await persist();}catch(e){if(live(ticket)){error=e.message||'这次未完成，来源仍保留。';}}finally{if(live(ticket)){busy=false;progress='';abort=null;paint();}}}
 const api={
  snapshot:()=>({thread,busy,progress,error}),
  async load(context={}){const loaded=await store.load(scope);if(loaded&&(!Array.isArray(loaded.messages)||typeof loaded.id!=='string'||typeof loaded.draftText!=='string'))throw Error('本机对话格式异常，请保留当前数据后再试。');thread=loaded||newAssistantThread(context);if(!valid())return;if(context.label&&!thread.messages.length)thread.context=context;paint();},
  async draft(text,allowWeb){if(!thread||busy||!valid())return;thread.draftText=String(text||'').slice(0,8000);thread.allowWeb=Boolean(allowWeb);try{await persist();}catch(e){error=e.message;}},
  async start(context={}){if(busy)return;await saves.catch(()=>{});thread=newAssistantThread(context);error='';await persist();paint();},
  async clearContext(){if(!busy){thread.context={};await persist();paint();}},
  async history(){return store.history?store.history(scope):[thread];},
  async select(id){if(busy)return;await saves.catch(()=>{});const rows=await api.history(),selected=rows.find(x=>x.id===id);if(!selected)return;thread=structuredClone(selected);error='';await persist();paint();},
  async selectAction(messageId,id,checked){const m=thread?.messages.find(m=>m.id===messageId);if(!m?.actions?.some(a=>a.activityId===id)||m.supersededBy||busy)return;const ids=new Set(m.selectedActivityIds||[]);if(checked)ids.add(id);else ids.delete(id);m.selectedActivityIds=[...ids];thread.activeActionMessageId=m.id;await persist();},
  async focusActions(messageId){const m=thread?.messages.find(m=>m.id===messageId);if(!m?.actions?.length||m.supersededBy||busy)return;thread.activeActionMessageId=m.id;await persist();},
  async markSceneSaved(messageId,scene){const m=thread?.messages.find(m=>m.id===messageId);if(!m)return;m.savedScene=scene;const source=m.sceneDraft?.sourceMessageId&&thread.messages.find(x=>x.id===m.sceneDraft.sourceMessageId);if(source){source.savedScene=scene;source.sceneHandledBy=m.id;}await persist();paint();},
  async saveSceneReview(id,review){const m=thread?.messages.find(m=>m.id===id);if(!m||busy)return;m.sceneReview=review;await persist();},
  async saveReview(id,values){const m=thread?.messages.find(m=>m.id===id);if(!m||busy)return;m.reviewValues=values;await persist();},
  async markSaved(id,ids){const m=thread?.messages.find(m=>m.id===id);if(!m)return;m.savedActivityIds=ids;m.actions=ids.map(id=>{const a=activityById(id);return {activityId:id,name:a.name,why:a.description,evidenceQuote:actionMaterial(a).slice(0,240),needsGuidance:a.selectable===false}});m.selectedActivityIds=[...ids];thread.activeActionMessageId=m.id;await persist();paint();},
  async markNote(id,knowledgeId){const m=thread?.messages.find(m=>m.id===id);if(!m)return;m.savedNoteId=knowledgeId;await persist();paint();},
  async bindCapture(id,captureId){const m=thread?.messages.find(m=>m.id===id);if(!m)return;m.captureId=captureId;await persist();paint();},
  async offerDraft(intake,context={}){if(!thread||!valid())return;const message={id:crypto.randomUUID(),role:'assistant',intent:'draft',text:'动作草稿已准备好，请核对后保存。',intake,...context};thread.messages.push(message);await persist();paint();return message.id;},
  async note(text,context={}){if(!thread||!valid())return;thread.messages.push({id:crypto.randomUUID(),role:'assistant',intent:'clarify',text,...context});await persist();paint();},
  cancel(){generation++;abort?.abort();busy=false;progress='';error='已取消，原文和已有结果仍保留。';paint();},
  async research(query){if(!thread||busy||!valid())return;thread.allowWeb=true;await persist();return work(ticket=>searchFor(query,ticket));},
  async read(messageId,pointIndex,sourceIndex){return work(async(ticket,signal)=>{const m=thread.messages.find(m=>m.id===messageId),source=m?.searchPoints?.[pointIndex]?.sources?.[sourceIndex];if(!source||!readSource)throw Error('来源已失效，请重新查找。');progress='正在读取真实教学正文…';paint();const reading=await readSource(source.url,{signal});if(!live(ticket))return null;
   progress='正在选择相关的原文教学段落…';paint();const input=buildTeachingSelection(reading,m.query),selected=await ask('assistant-teaching',input,x=>validateTeachingSelection(x,input));if(!live(ticket))return null;if(selected.status==='empty')return {intent:'research_action',query:m.query,text:selected.reason,readSource:{url:reading.url,title:reading.title}};
   const prepared=teachingIntake(getState(),reading,selected,m.query);progress='正在对照动作库整理草稿…';paint();const intake=await ask('activity-intake',prepared.input,x=>validateResearchIntake(x,prepared.input));if(!live(ticket))return null;
   return intake.status==='ok'?{intent:'draft',query:m.query,text:'已读取教学并整理出：'+intake.candidates.map(c=>c.name).join('、')+'。请核对做法、类型和来源后再保存。',intake:{...intake,candidates:intake.candidates.map(c=>({...c,lowTrust:true}))},webSource:prepared.web}:{intent:'research_action',query:m.query,text:intake.reason||intake.question||'教学暂时无法整理为明确动作。',readSource:{url:reading.url,title:reading.title}};
  });},
  async send(value){if(busy||!valid()||!thread)return;const text=assistantText(value);thread.allowWeb=assistantOnlinePermission(text,thread.allowWeb);const input=buildAssistantInput(getState(),thread,text),ticket=++generation;thread.messages.push({id:crypto.randomUUID(),role:'user',text});thread.draftText='';thread.updatedAt=new Date().toISOString();busy=true;progress='正在理解需求并查找动作库…';error='';paint();
   try{await persist();if(ticket!==generation||!valid())return;let result=input.actionTask?.savedScene&&input.actionTask.editRequest?{intent:'clarify',text:'这组动作已保存到场景，请打开场景编辑页调整，确认后更新。',savedScene:input.actionTask.savedScene,query:input.taskQuery}:assistantProvidedLink(text)||await ask('assistant-turn',input,x=>validateAssistantTurn(x,input));if(ticket!==generation||!valid())return;
    if(result.handoff==='scene'){result={intent:'scene_review',text:'先核对要加入的动作与场景设置，确认后才保存。',query:result.query,sceneDraft:sceneDraftFromTask(thread,text,getState())};}
    if(result.intent==='knowledge'&&knowledge){progress='正在查阅你允许参考的知识…';paint();result={...result,...await knowledge(result.query)};if(ticket!==generation||!valid())return;}
    if(result.intent==='find_actions'&&result.actions?.length)result={...decorateActionResult(thread,result,input.sceneHint),purposeText:[input.taskQuery,input.question].filter(Boolean).join('\n')};
    if(['find_actions','research_action'].includes(result.intent)&&!result.providedLink&&thread.allowWeb&&search){const found=await searchFor(result.query,ticket);if(!live(ticket))return;result={...result,...found,actions:result.actions};}
    if(result.intent==='describe_action'){progress='正在整理你提供的动作描述…';paint();const description=thread.messages.filter(m=>m.role==='user').slice(-4).map(m=>m.text).join('\n').slice(-4000),built=buildActivityIntakeInput(getState(),{text:description}),intake=await ask('activity-intake',built,x=>validateActivityIntake(x,built));if(!live(ticket))return;result=intake.status==='ok'?{intent:'draft',text:'已根据你提供的描述整理草稿，请核对。',query:result.query,intake}:{intent:'clarify',text:intake.question||intake.reason||'请补充能确认的具体做法。',query:result.query};}
    const message={id:crypto.randomUUID(),role:'assistant',...result};if(message.actions?.length){thread.activeActionMessageId=message.id;if(message.previousActionMessageId){const old=thread.messages.find(m=>m.id===message.previousActionMessageId);if(old)old.supersededBy=message.id;}}else if(['knowledge','research_action','draft','handoff','find_actions'].includes(message.intent))thread.activeActionMessageId=null;thread.messages.push(message);thread.updatedAt=new Date().toISOString();await persist();
   }catch(e){if(ticket===generation&&valid()){error=e.message||'这次未完成，可继续描述或重试。';thread.draftText=text;await persist().catch(()=>{});}}
   finally{if(ticket===generation&&valid()){busy=false;progress='';paint();}}
  },
  stop(){stopped=true;generation++;abort?.abort();busy=false;}
 };return api;
}
