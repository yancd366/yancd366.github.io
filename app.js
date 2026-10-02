import { activities, goals, places, equipmentLabels, sources, relations, bodyRegions, regionLabel, systems } from './catalog.js';
import { initialState, STORE_KEY, SCHEMA_VERSION, createPlan, replaceItem, finishSession, updateNote, checkPlanStart, safeURL, uid } from './domain.js';
import { esc, icon, badge, dateText, elapsedText } from './ui.js';
import { buildIntakeInput, validateIntake, buildPlanInput, validatePlan, buildLogInput, validateLog, logToRecords, setsText, parseSetsText, setSummary } from './ai.js';
import { normalizeStore,parseBackup,mergeBackup,sanitizeForExport,rawBackupText } from './storage.js';
import { directConfig, directConsentId, providerHost, directMessages, callDirect, allowedBase, AINetworkError, proxyPossible, organizeModel, ORGANIZE_MODELS } from './ai-direct.js';
import { validateSets, restDefault, isTimed, timeTarget } from './training.js';
import { safetyBlock, textMentionsLimits } from './safety.js';
import { abilityEntry, abilityBlock, allowedUses, buildAbilityIntakeInput, validateAbilityIntake, abilityRecords, redFlagCheck } from './abilities.js';
import { captureEntry, captureHasEvidence, splitSharedText, buildKnowledgeImportInput, validateKnowledgeImport, applyKnowledgeCard, deleteKnowledge, capturePlatforms } from './knowledge.js';
import { allowedIngestBase,ingestConfig,ingestConfigFor,ingestRoutes,anyIngestConfigured,nextIngestSettings,INGEST_ROUTES,supportedAutoCapture,preferVideoIngest,submitIngest,readIngestJob,applyIngestResult } from './ingest.js';
import { exerciseLogForm,sessionEditForm,assessmentForm,abilityIntakeForm,abilityConfirmForm,methodConfirmForm,digestConfirmForm,activityFields,activityIntakeForm,selfCheckTaskForm,selfCheckSummaryForm,activityName } from './experience.js';
import { SELF_CHECK_TASKS, selfCheckRecords } from './self-check.js';
import { syncPersonalActivities,createPersonalActivity,updatePersonalActivity,setActivityPlanning,archivePersonalActivity,deletePersonalActivity,addToDraft,buildActivityIntakeInput,validateActivityIntake,PLANNING_USES } from './personal-activities.js';
import { buildDigestInput,validateDigest,applyDigest,setTopicPlanning,deleteTopicCard } from './digest.js';
import { activeMethodPreference, METHOD_MODES } from './method-plan.js';
import { bookEntry,saveBookDirect,buildSearchInput,validateSearch,checkEditedPoints,saveSearchEntry } from './sources.js';
import { buildCreatorMethodInput,validateCreatorMethod,applyCreatorMethod,creatorCards,setMethodPlanning,deleteMethodCard } from './creators.js';
import { applyReplacement } from './domain.js';
import { normalizeTopics, corpusTopics, buildKnowledgeAskInput, validateKnowledgeAnswer } from './corpus.js';
import { USES, useLabel, usesFor, addManualUse, deleteUse } from './activity-uses.js';
import { defaultPlanName,templateFromPlan,templateFromSession,saveTemplate,renameTemplate,deleteTemplate,markTemplateUsed,loadTemplate } from './saved-plans.js';
import { pauseActiveTimer, resumeActiveTimer } from './timing.js';
import { routes, shell, todayHTML, recordsHTML, libraryHTML, knowledgeHTML, bodyHTML } from './views.js';
const $=s=>document.querySelector(s);
const activityById=id=>activities.find(a=>a.id===id);
let storageError=false,state,lastStored=null;let importDraft=null;
let offlineStatus=window.isSecureContext?'正在准备离线文件…':'当前 HTTP 地址不支持离线启动。';
function showOfflineStatus(message){offlineStatus=message;document.querySelectorAll('[data-offline-status]').forEach(el=>{el.textContent=message;});}
try {
  const raw=localStorage.getItem(STORE_KEY);lastStored=raw;state=raw?normalizeStore(JSON.parse(raw)):initialState();
  if(state.schemaVersion!==SCHEMA_VERSION||!Array.isArray(state.sessions)||!state.profile||!Array.isArray(state.notes)||!Array.isArray(state.knowledge)||!Array.isArray(state.captures)||!Array.isArray(state.observations))throw new Error('记录格式不兼容');
}catch{state=initialState();storageError=true;}
syncPersonalActivities(state);
let page=routes[location.hash.slice(1)]?location.hash.slice(1):'today';
let request=structuredClone(state.draft?.request||{minutes:20,place:'home',focus:state.profile.focus,readiness:'normal',targetRegions:[]});
let filters={search:'',category:'all',system:'all',place:'all',personal:'all'},knowledgeFilter='all',knowledgeTopic='',knowledgeKind='',toastTimer;
const aiState={ready:false,busy:false,mode:null,text:'',model:null,provider:'',consentId:null,paired:false,pairingRequired:false,optionsOpen:false,adjustText:''};let pendingSelfCheck=null,pendingLog=null,pendingAbility=null,pendingKnowledge=null,pendingMethod=null,pendingDigest=null,pendingSearch=null,pendingActivities=null;
const ingestPolling=new Set(),ingestStarting=new Set();
aiState.text=state.aiPending?.text||'';
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
function commit(change){
  if(storageError){toast('本地数据暂时无法读取。已暂停保存，不覆盖原有记录。');return false;}
  const next=structuredClone(state);change(next);
  try{if(localStorage.getItem(STORE_KEY)!==lastStored){toast('另一页面更新了记录，请刷新后重试，避免覆盖。');return false;}const serialized=JSON.stringify(next);localStorage.setItem(STORE_KEY,serialized);lastStored=serialized;state=next;syncPersonalActivities(state);return true;}
  catch{toast('保存失败：浏览器空间不足或存储不可用。请导出备份。');return false;}
}
function render(){
  const content={today:()=>todayHTML(state,request,aiState),records:()=>recordsHTML(state,aiState),library:()=>libraryHTML(state,filters),knowledge:()=>knowledgeHTML(state,knowledgeFilter,knowledgeTopic,knowledgeKind),body:()=>bodyHTML(state)}[page]();
  $('#app').innerHTML=shell(page,state,content,storageError);
  showOfflineStatus(offlineStatus);
}
function navigate(next){if($('#sheet').open)$('#sheet').close();page=next;location.hash=next;render();window.scrollTo({top:0});}
window.addEventListener('hashchange',()=>{if(routes[location.hash.slice(1)]&&page!==location.hash.slice(1)){page=location.hash.slice(1);render();}});
function showModal(title,html){const d=$('#sheet');d.innerHTML=`<div class="dialog-header"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" data-action="close" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body">${html}</div>`;if(!d.open)d.showModal();}
// ---------- 我的动作 ----------
// 个人动作的详情区：来源、是否允许自动安排、编辑 / 归档 / 删除。任何动作都可以手动加进还没开始的安排。
function personalSectionHTML(a){
  const add=state.draft&&!state.draft.startedAt&&!state.draft.items.some(i=>i.activityId===a.id)?`<button class="secondary full" data-add-to-draft="${esc(a.id)}">${icon('plus')} 加入今天的安排</button>`:'';
  if(!a.personal)return add?`<div class="personal-activity">${add}</div>`:'';
  const src=a.source?`<p class="small muted">来源${a.source.lowTrust?'（AI 画面描述，待核对）':''}：「${esc(a.source.quote)}」${a.source.knowledgeId&&state.knowledge.some(k=>k.id===a.source.knowledgeId)?` · 知识卡「${esc(state.knowledge.find(k=>k.id===a.source.knowledgeId).title)}」`:''}</p>`:'<p class="small muted">你自己添加的动作。</p>';
  return `<section class="personal-activity"><div class="section-heading"><h3>我的动作</h3><span class="badge ${a.archived?'':'warm'}">${a.archived?'已归档':a.selectable?'可自动安排':'仅手动使用'}</span></div>${src}${a.parentActivityId?`<p class="small">是「<button class="text-button orange" data-detail="${esc(a.parentActivityId)}">${esc(activityById(a.parentActivityId)?.name||'')}</button>」的变式</p>`:''}${a.archived?'':`<label>安排方式<select data-activity-planning="${esc(a.id)}">${Object.entries(PLANNING_USES).map(([v,l])=>`<option value="${v}" ${a.planningUse===v?'selected':''}>${l}</option>`).join('')}</select></label><p class="helper left">「允许自动安排」后，本地规则和 AI 才会把它放进候选；场地、器械、难度和安全限制照常检查。</p>`}${add}<div class="dialog-actions"><button class="secondary" data-edit-activity="${esc(a.id)}">${icon('edit')} 编辑</button><button class="text-button" data-archive-activity="${esc(a.id)}">${a.archived?'恢复':'归档'}</button><button class="text-button" data-delete-activity="${esc(a.id)}">删除</button></div></section>`;
}
function addActivityDialog(text=''){
  showModal('添加我的动作',`<form id="activity-describe-form"><label>用自己的话描述这个动作<textarea name="text" required maxlength="4000" rows="6" placeholder="例如：跪姿，一只手放在脑后，手肘向上打开胸口再合回来，每边 8 次，用来热胸椎。">${esc(text)}</textarea></label><p class="helper left">AI 会先对照动作库：已有的不会重复新建；没有的整理成动作草稿，你核对后才保存，默认仅手动使用。</p><button class="primary full" type="submit">让 AI 整理 ${icon('arrow')}</button></form><button class="secondary full" data-action="activity-manual">不用 AI，直接填写</button>`);
}
function activityFormDialog(id=''){
  const p=id?(state.personalActivities||[]).find(x=>x.id===id):null;
  showModal(p?'编辑我的动作':'添加我的动作',`<form id="activity-form" data-id="${esc(id)}">${activityFields('a_',p||{})}${p?'':'<label class="checkbox-line"><input type="checkbox" name="allow">允许以后自动安排（不勾就只能手动加入）</label>'}<p class="helper left">只写你确定的内容；具体重量、组数不必填。保存后出现在动作库「我的动作」里。</p><button class="primary full" type="submit">保存 ${icon('check')}</button></form>`);
}
const readActivityFields=(f,p)=>({name:f.get(p+'name'),aliases:f.get(p+'aliases'),description:f.get(p+'description'),category:f.get(p+'category'),phase:f.get(p+'phase'),primaryRegions:f.getAll(p+'primaryRegions'),places:f.getAll(p+'places'),equipment:f.getAll(p+'equipment'),tier:f.get(p+'tier'),impact:f.get(p+'impact'),minutes:f.get(p+'minutes'),system:f.get(p+'system'),setup:f.get(p+'setup'),steps:f.get(p+'steps'),cues:f.get(p+'cues'),mistakes:f.get(p+'mistakes'),dose:f.get(p+'dose')});
// 从收藏的视频 / 文字，或用户的描述里提取动作。
function extractActivities({capture=null,text='',knowledgeId=null}={}){
  if(!ensureAI())return;
  let input;try{input=buildActivityIntakeInput(state,{capture,text});}catch(e){toast(e.message);return;}
  toast('AI 正在对照动作库整理…');
  withBusy(async()=>{
    const r=await askAI('activity-intake',input,x=>validateActivityIntake(x,input));
    if(r.status==='empty'){showModal('没有找到具体动作',`<p>${esc(r.reason)}</p><button class="secondary full" data-action="close">知道了</button>`);return;}
    if(r.status==='clarify'){showModal('再确认一下',`<p>${esc(r.question)}</p>${capture?'':`<button class="secondary full" data-action="add-activity" data-text="${esc(text)}">补充描述</button>`}`);return;}
    pendingActivities={...r,knowledgeId};
    showModal('核对提取的动作',activityIntakeForm(r,id=>activityById(id)?.name||id));
  });
}
// 把动作挂到来源知识卡上（与 AI 整理知识卡时的关联动作同一格式）。
function linkToKnowledge(s,knowledgeId,activityId,quote){
  const k=knowledgeId&&s.knowledge.find(x=>x.id===knowledgeId);if(!k)return;
  if(!k.activityIds.includes(activityId))k.activityIds.push(activityId);
  k.activityLinks=[...(k.activityLinks||[]).filter(l=>l.activityId!==activityId),{activityId,evidenceQuote:quote,evidenceId:'user-text'}];
}
// 动作详情里的「我的用途备注」：来自知识卡的带原文出处；也可以自己加。
function usesSectionHTML(id){
  const rows=usesFor(state,id),title=kid=>state.knowledge.find(k=>k.id===kid)?.title;
  const opt=(dict,empty)=>`<option value="">${empty}</option>${Object.entries(dict).map(([v,x])=>`<option value="${v}">${esc(typeof x==='string'?x:x.label)}</option>`).join('')}`;
  return `<section class="uses-editor"><div class="section-heading"><h3>${icon('bookmark')} 我的用途备注</h3><span class="small muted">安排训练时会参考</span></div>${rows.map(u=>`<div class="use-row"><div><strong>${esc(useLabel(u))}</strong>${u.note?`<span> · ${esc(u.note)}</span>`:''}<p class="small muted">${u.source?`来自知识卡「${esc(title(u.source.knowledgeId)||'已删除')}」：「${esc(u.source.quote)}」`:'你自己加的'}</p></div><button class="text-button" data-delete-use="${esc(u.id)}" data-activity="${esc(id)}">删除</button></div>`).join('')||'<p class="small muted">还没有。整理知识卡时，如果原文说了这个动作的用途，会出现在这里。</p>'}<form id="use-form" data-activity="${esc(id)}" class="field-row use-form"><label>用途<select name="use" required>${opt(USES,'选择用途')}</select></label><label>针对部位<select name="region">${opt(bodyRegions,'不指定')}</select></label><label class="use-note">一句说明（可选）<input name="note" maxlength="60" placeholder="例如：练腿前热一下髋"></label><button class="secondary" type="submit">加上</button></form></section>`;
}
function detail(id){
  const a=activityById(id);if(!a)return;
  const note=state.notes.find(n=>n.activityId===id);
  const linked=(type,side)=>relations.filter(r=>r.type===type&&(side?r[side]===id:r.from===id||r.to===id)).map(r=>({r,other:activityById(r.from===id?r.to:r.from)}));
  const relationGroup=(title,rows)=>rows.length?`<h3>${title}</h3>${rows.map(({r,other})=>`<div class="alternative"><button class="text-button orange" data-detail="${other.id}">${other.name} ${icon('arrow')}</button><p>保留：${esc(r.preserves)}</p><p class="small muted">差异：${esc(r.differs)}</p></div>`).join('')}`:'';
  const list=(title,items,tag='ul')=>items?.length?`<h3>${title}</h3><${tag} class="cues">${items.map(c=>`<li>${esc(c)}</li>`).join('')}</${tag}>`:'';
  const sourceIds=[a.sourceId,...(a.refs||[])].filter((s,i,all)=>sources[s]&&all.indexOf(s)===i);
  showModal(a.name,`<div class="detail-intro"><span class="activity-icon ${a.category}">${icon(a.category)}</span><div><div class="tags">${badge(systems[a.system])}${badge(goals[a.category])}${a.level&&!a.difficulty.includes('第')?badge(`第 ${a.level} 式`):''}${badge(a.difficulty)}</div><p>${esc(a.description)}</p>${a.aliases.length?`<p class="small muted">也叫：${esc(a.aliases.join(' / '))}</p>`:''}</div></div><div class="detail-facts"><div><span>可以在哪里练</span><strong>${a.places.map(p=>places[p]).join('、')}</strong></div><div><span>所需器械</span><strong>${a.equipment.length?a.equipment.map(e=>equipmentLabels[e]).join('、'):'无需器械'}</strong></div><div><span>关注部位</span><strong>${a.body.join('、')}</strong></div></div>${a.category==='strength'?`<div class="target-facts"><p><strong>主要训练：</strong>${regionLabel(a.primaryRegions||[])||'尚未标注'}</p>${a.secondaryRegions?.length?`<p class="muted small">辅助参与：${regionLabel(a.secondaryRegions)}（不等同于独立训练）</p>`:''}</div>`:''}
  ${list('起始姿势',a.setup)}${list(a.kind==='routine'?'套路组成':'动作步骤',a.steps,'ol')}${list(a.steps?.length?'关键要点':'练习提示',a.cues)}${list('常见错误',a.mistakes)}${a.dose?`<h3>参考练习量</h3><p class="guidance-text">${esc(a.dose)}</p>`:''}${a.breathing?`<h3>呼吸</h3><p class="guidance-text">${esc(a.breathing)}</p>`:''}${a.standards?.length?`<h3>进阶标准</h3><div class="detail-facts standards">${a.standards.map(x=>`<div><span>${esc(x.label)}</span><strong>${esc(x.value)}</strong></div>`).join('')}</div>`:''}
  <p class="small muted">产品候选，尚未专业审核。${a.selectable===false?'暂不参与自动安排，建议在有指导或足够基础时尝试。':a.tier===3?'高级动作，只为有规律训练经历的用户安排。':'参考练习量为一般范围，建议时长是原型时间分配，都不是个人运动处方。'}</p>
  ${personalSectionHTML(a)}${usesSectionHTML(id)}<form id="note-form" data-activity="${id}" class="note-editor"><div class="section-heading"><h3>${icon('bookmark')} 我的心得</h3><span class="small muted">下次练习时会显示</span></div><textarea name="text" aria-label="我的动作心得" maxlength="4000" placeholder="用自己的话，记下有帮助的提示……">${esc(note?.text||'')}</textarea>${note?.origin==='workbook'?'<p class="small muted">来自原表格的个人经验，不作为通用动作标准。</p>':''}<button class="secondary" type="submit">保存心得</button>${note?.history.length?`<details><summary>查看 ${note.history.length} 次历史版本</summary>${[...note.history].reverse().map(h=>`<p>${esc(h.text||'（空白）')}</p>`).join('')}</details>`:''}</form>
  ${relationGroup('退阶选择',linked('progression','to'))}${relationGroup('下一步进阶',linked('progression','from'))}${relationGroup('可以怎么替换',linked('alternative'))}${relationGroup('相关动作',linked('component'))}<div class="source-note"><span>内容来源</span>${sourceIds.map((sid,i)=>{const source=sources[sid];return `<strong>${esc(source.title)}</strong>${i===0&&a.sourceLocator?`<span>${esc(a.sourceLocator)}</span>`:''}${source.url?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">查看参考资料 ${icon('arrow')}</a>`:''}`;}).join('')}<small>来源链接用于追溯；不代表该来源逐条审核了本候选。</small></div>`);
}
// ---------- AI ----------
// The server only adds the prompt and key; context and validation stay here, next to the local data.
async function askAI(skill,input,validate){
  if(!ensureAI())throw new Error('请先启用 AI 并确认数据发送范围。');
  if(navigator.onLine===false)throw new AINetworkError('当前没有网络。');
  const cfg=directConfig(state),model=organizeModel(state,skill);
  // 本机存了 key 就浏览器直连模型（出门也能用），否则走 Mac 代理。整理类任务可换用设置里选的模型（较慢，放宽超时）。
  const call=cfg
    ?async repair=>(await callDirect(skill,directMessages(skill,input,repair),model?{...cfg,model}:cfg,{timeoutMs:model?180000:90000})).reply
    :async repair=>{let res;try{res=await fetch(`/api/ai/${skill}`,{method:'POST',headers:{'Content-Type':'application/json','X-Xundong-Consent':aiState.consentId},body:JSON.stringify({input,repair,model})});}catch{throw new AINetworkError();}const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`AI 服务出错（${res.status}）`);return data.reply;};
  let reply=await call(),result=validate(reply);
  if(!result.ok){reply=await call({reply,errors:result.errors});result=validate(reply);}
  if(!result.ok)throw new Error(`AI 的结果没有通过校验：${result.errors.slice(0,2).join('；')}。可以换个说法重试，或用规则安排。`);
  return result;
}
async function withBusy(task,kind){if(aiState.busy)return;aiState.busy=true;render();try{await task();}catch(e){if(e instanceof AINetworkError&&kind)aiOfflineDialog(kind);else toast(e instanceof AINetworkError?'现在连不上 AI，原文还在，联网后再试。':e.message||'AI 暂时不可用，可以先用规则安排。');}finally{aiState.busy=false;render();}}
// 断网时：保留用户的文字要求；只有文字里没有不适/避开项时，才提供本地规则顶替。
function aiOfflineDialog(kind){
  const text=(kind==='adjust'?aiState.adjustText:aiState.text).trim();
  if(kind==='plan'&&text)commit(s=>s.aiPending={text,savedAt:new Date().toISOString()});
  const local=kind!=='plan'?'':textMentionsLimits(text)
    ?'<div class="notice error"><p>你的要求里提到了不适或要避开的动作。本地规则读不懂文字，没法替你避开，所以这次不用本地规则顶替。可以联网后再让 AI 安排，或在「当前状态」里选「身体有不舒服」。</p></div>'
    :`<p class="helper left">本地规则只按你选的时间、地点和重点安排${text?'，不会读取上面这段文字':''}。</p><button class="primary full" data-action="generate-offline">用本地规则安排</button>`;
  showModal('现在连不上 AI',`<p>${text?`你的要求已保留：「${esc(text)}」。联网后${kind==='adjust'?'再点「调整」':'点「给我安排」'}即可继续。`:'联网后可以再试一次 AI。'}</p>${local}<button class="secondary full" data-action="close">保留要求，联网后再试</button>`);
}
function clarifyDialog(question,next){showModal('再确认一下',`<p>${esc(question)}</p><form id="ai-clarify-form" data-next="${next}"><label>你的回答<textarea name="answer" required maxlength="500"></textarea></label><button class="primary full" type="submit">继续 ${icon('arrow')}</button></form>`);}
function referDialog(reason){showModal('先照顾好身体',`<p>${esc(reason)}</p><p class="helper left">这次不自动安排训练。可以先记下现在的状态。</p><button class="primary" data-action="observation">记录当前状态</button>`);}
// 「参考我的知识库」：关掉时知识条目、总结卡、用途备注都不参与（本地规则与 AI 一致）。
const corpusOn=()=>state.settings?.useCorpus!==false;
const planUses=()=>corpusOn()?state.activityUses||[]:[];
async function planWithAI(req,extra={}){
  const input=buildPlanInput(state,req,{...extra,useCorpus:corpusOn()});
  const r=await askAI('plan',input,x=>validatePlan(x,{request:req,profile:state.profile,uses:planUses(),refs:[...input.personalKnowledge,...input.knowledgeSummaries],method:input.methodPreference}));
  if(r.plan)r.plan.usedCorpus=corpusOn();
  return r;
}
async function aiPlan(){
  const blocked=safetyBlock(state.profile,request)||abilityBlock(state.assessments);if(blocked)return referDialog(blocked);
  const text=aiState.text.trim(),defaults={...request,targetRegions:request.targetRegions||[],userText:text};
  let req={...defaults,equipment:null,preferredSystems:[],avoid:[],bodyToday:'',preferences:''};
  if(text){const r=await askAI('intake',buildIntakeInput(state,text,defaults),x=>validateIntake(x,defaults));if(r.status==='clarify')return clarifyDialog(r.question,'plan');if(r.status==='refer')return referDialog(r.reason);req=r.request;}
  const r=await planWithAI(req);
  if(r.status==='clarify')return clarifyDialog(r.question,'plan');if(r.status==='refer')return referDialog(r.reason);
  if(commit(s=>{s.draft=r.plan;s.aiPending=null;})){request=structuredClone(r.plan.request);aiState.text='';toast(r.warnings[0]||'已生成今天的安排，可以调整或直接开始。');}
}
async function aiAdjust(instruction){
  const p=state.draft;
  const intake=await askAI('intake',buildIntakeInput(state,instruction,p.request),x=>validateIntake(x,{...p.request,userText:instruction}));
  if(intake.status==='clarify')return clarifyDialog(intake.question,'adjust');if(intake.status==='refer')return referDialog(intake.reason);
  const req={...p.request,...intake.request},blocked=safetyBlock(state.profile,req)||abilityBlock(state.assessments);if(blocked)return referDialog(blocked);
  const r=await planWithAI(req,{previousPlan:p,instruction});
  if(r.status==='clarify')return clarifyDialog(r.question,'adjust');if(r.status==='refer')return referDialog(r.reason);
  if(commit(s=>s.draft=r.plan)){request=structuredClone(r.plan.request);aiState.adjustText='';toast(r.warnings[0]||'已调整，重量请按新动作重新选择。');}
}
// 能力整理：AI 只出草稿；用户逐条确认后才写入 abilityEvidence / assessments。
function abilityIntake(meta){
  // 先在本机检查红旗：明确的直接转介（不发给 AI）；只出现在否定 / 已缓解语境里的，先请用户确认。
  const flags=redFlagCheck(meta.rawText,meta.flagsCleared||[]);
  if(flags.status==='refer'){pendingAbility={...meta};return referDialog('你提到的情况（'+flags.flags.join('、')+'）可能需要及时处理，不适合由 App 自行判断。请先咨询医生或康复专业人员；这段内容不会写进能力档案。');}
  if(flags.status==='confirm'){pendingAbility={...meta,pendingFlags:flags.flags};return showModal('先确认一下',`<p>你的描述里提到了「${flags.flags.map(esc).join('」「')}」，看起来是说现在没有这种情况。</p><p class="helper left">为了安全，请确认：<strong>现在没有</strong>这些情况。如果其实还有，或者拿不准，请先咨询医生或康复专业人员。</p><button class="primary full" data-action="ability-flags-absent">确认现在没有，继续整理</button><button class="secondary full" data-action="ability-flags-present">其实还有 / 拿不准</button>`);}
  pendingAbility={...meta};toast('AI 正在整理，请稍等…');
  withBusy(async()=>{
    const r=await askAI('ability-intake',buildAbilityIntakeInput(state,meta),x=>validateAbilityIntake(x,meta));
    if(r.status==='clarify')return clarifyDialog(r.question,'ability');
    if(r.status==='refer')return referDialog(r.reason);
    pendingAbility={...meta,...r};showModal('核对整理结果',abilityConfirmForm(pendingAbility));
  });
}
function readAbilityConfirm(f){
  return pendingAbility.drafts.flatMap((d,n)=>{if(!f.get(`keep_${n}`))return [];
    const use=f.get(`use_${n}`);
    return [{dimension:f.get(`dimension_${n}`),signal:f.get(`signal_${n}`),bodyAreas:f.getAll(`area_${n}`),side:f.get(`side_${n}`),context:f.get(`context_${n}`)||'',note:f.get(`note_${n}`)||'',observedAt:f.get(`observedAt_${n}`),evidenceQuote:d.evidenceQuote,recommendationUse:allowedUses(d).includes(use)?use:'off'}];});
}
function logInputDialog(text=''){showModal('粘贴训练记录',`<form id="ai-log-form"><label>备忘录、聊天记录或一段话<textarea name="text" required maxlength="20000" rows="9" placeholder="例如：\n9.23 练胸\n卧推 60kg 3×8，最后一组只做了 6 个\n肩有点酸\n昨天跑步 5 公里 32 分钟">${esc(text)}</textarea></label><p class="helper left">AI 会整理成训练记录草稿，逐条核对后才会保存。原文没写的重量、次数会留空。</p><button class="primary full" type="submit">开始整理 ${icon('arrow')}</button></form>`);}
const actOptions=selected=>`<option value="">不关联动作库（自定义动作）</option>${Object.entries(systems).map(([sys,label])=>`<optgroup label="${label}">${activities.filter(a=>a.system===sys).map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('')}</optgroup>`).join('')}`;
function logConfirmDialog(){
  const {text,drafts,unparsed,warnings=[]}=pendingLog,dup=state.sessions.some(x=>x.rawText===text);
  showModal('核对整理结果',`${dup?'<div class="notice error">这段文字之前已经导入过，保存会产生重复记录。</div>':''}${warnings.length?`<div class="notice error">${warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</div>`:''}<form id="ai-log-confirm">${drafts.map((d,n)=>`<fieldset class="log-session"><legend>第 ${n+1} 次训练</legend><div class="field-row"><label>日期<input type="date" name="date_${n}" required value="${d.date||''}"></label><label>总时长（分钟）<input type="number" name="min_${n}" min="1" max="1440" value="${d.durationMinutes??''}" placeholder="未写"></label><label>费力程度<input type="number" name="effort_${n}" min="1" max="10" value="${d.effort??''}" placeholder="未写"></label></div>${d.items.map((i,k)=>`<div class="log-item"><label class="checkbox-line"><input type="checkbox" name="use_${n}_${k}" checked> <strong>${esc(i.name)}</strong>${i.matchConfidence==='low'&&i.activityId?' <span class="badge warm">匹配不确定</span>':''}${i.verified?'':' <span class="badge warm">原文中找不到，请核对</span>'}</label><p class="small muted">原文：${esc(i.sourceText||'（无）')}</p><div class="field-row"><label>对应动作<select name="act_${n}_${k}">${actOptions(i.activityId)}</select></label><label>名称<input name="name_${n}_${k}" value="${esc(i.name)}" maxlength="80"></label></div><label>组次<input name="sets_${n}_${k}" value="${esc(setsText(i.sets))}" placeholder="如 60kg×8、60kg×8 或 60秒；没有就留空"></label>${i.warnings?.length?`<div class="notice error">${i.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}<label class="checkbox-line"><input type="checkbox" name="confirm_${n}_${k}">我已逐项核对或修正这些疑点</label></div>`:''}${i.sets.length&&i.durationMinutes==null&&i.distanceKm==null?`<input type="hidden" name="imin_${n}_${k}" value=""><input type="hidden" name="km_${n}_${k}" value="">`:`<div class="field-row"><label>时长（分钟）<input type="number" step="any" name="imin_${n}_${k}" value="${i.durationMinutes??''}"></label><label>距离（km）<input type="number" step="any" name="km_${n}_${k}" value="${i.distanceKm??''}"></label></div>`}${i.note?`<p class="small muted">备注：${esc(i.note)}</p>`:''}<input type="hidden" name="note_${n}_${k}" value="${esc(i.note)}"></div>`).join('')}<label>感受<textarea name="fb_${n}" maxlength="2000">${esc(d.feedback)}</textarea></label><label>身体情况（会同时存为身体随记）<textarea name="body_${n}" maxlength="2000">${esc(d.bodyNotes)}</textarea></label></fieldset>`).join('')}${unparsed.length?`<details><summary>${unparsed.length} 段文字未解析为训练</summary>${unparsed.map(u=>`<p>${esc(u)}</p>`).join('')}</details>`:''}<button class="primary full" type="submit">确认保存 ${icon('check')}</button><button class="secondary full" type="button" data-action="ai-log-retry">回到原文修改</button></form>`);
}
function readLogConfirm(f){
  const num=v=>v===''||v==null?null:Number(v);
  return pendingLog.drafts.map((d,n)=>({date:f.get(`date_${n}`)||null,durationMinutes:num(f.get(`min_${n}`)),effort:num(f.get(`effort_${n}`)),feedback:f.get(`fb_${n}`).trim(),bodyNotes:f.get(`body_${n}`).trim(),
    items:d.items.flatMap((i,k)=>f.get(`use_${n}_${k}`)?[{activityId:f.get(`act_${n}_${k}`)||null,name:f.get(`name_${n}_${k}`).trim()||i.name,sets:parseSetsText(f.get(`sets_${n}_${k}`)),durationMinutes:num(f.get(`imin_${n}_${k}`)),distanceKm:num(f.get(`km_${n}_${k}`)),note:f.get(`note_${n}_${k}`),sourceText:i.sourceText,warnings:i.warnings||[],confirmed:Boolean(f.get(`confirm_${n}_${k}`))}]:[])})).filter(d=>d.items.length);
}
function finishDialog(){
  const p=state.draft;if(!p)return;const completed=p.items.filter(i=>i.status==='completed');
  if(!completed.length){toast('先确认至少一个实际完成的动作。');return;}
  showModal('练完了，留一点感受',`<p class="muted">已确认 ${completed.length} 个动作，其余将记为跳过。实际时长可留空，不使用计划时长代填。</p><form id="finish-form"><div class="field-row"><label>实际活动时长（分钟）<input name="actualMinutes" type="number" min="1" max="1440" step="1" placeholder="可选"></label><label>费力程度（1～10）<input name="effort" type="number" min="1" max="10" step="1" placeholder="可选"></label></div><label>这次整体感觉如何？<textarea name="feedback" maxlength="4000" placeholder="哪些做起来舒服？有什么新发现？"></textarea></label><details class="feedback-details"><summary>逐项记录组次和心得（可选）</summary>${completed.map(i=>`<div class="item-feedback"><label>${activityById(i.activityId).name} · 实际组次<input name="sets_${i.id}" value="${esc(setsText(i.actualSetDetails||[]))}" placeholder="${esc(i.prescription?.sets?`计划 ${i.prescription.sets} 组 × ${i.prescription.reps?`${i.prescription.reps} 次`:`${i.prescription.seconds||'?'} 秒`}，填实际完成，如 60kg×8、60kg×8`:'如 60kg×8、60kg×8 或 60秒')}"></label><label>心得<textarea name="item_${i.id}" maxlength="2000" placeholder="可选：这条会保存到本次记录"></textarea></label><label class="checkbox-line"><input type="checkbox" name="pin_${i.id}"> 同时保存为这个动作的长期心得</label></div>`).join('')}</details><p class="helper left">组次只记实际完成的，没填就留空，不用计划值代填。</p><button class="primary full" type="submit">保存这次训练 ${icon('check')}</button></form>`);
}
function knowledgeDialog(id){
  const k=state.knowledge.find(k=>k.id===id);
  showModal(k?'编辑收藏':'收藏一个好想法',`<form id="knowledge-form" data-id="${esc(id||'')}"><label>标题<input name="title" required maxlength="120" value="${esc(k?.title||'')}" placeholder="它在讲什么？"></label><label>来源链接<input name="url" type="url" value="${esc(k?.url||'')}" placeholder="https://…（可选）"></label><label>作者或来源<input name="sourceTitle" maxlength="180" value="${esc(k?.sourceTitle||'')}" placeholder="创作者名称、书籍或自己的思考"></label><label>摘录 / 我的想法<textarea name="text" maxlength="8000" placeholder="把值得保留的内容贴在这里，也可以写下自己的问题。">${esc(k?.text||'')}</textarea></label><label>主题（可选，用顿号或逗号分隔）<input name="topics" maxlength="80" value="${esc(normalizeTopics(k?.topics).join('、'))}" placeholder="例如：髋关节热身"></label><label class="checkbox-line"><input type="checkbox" name="useInPlanning" ${k?.useInPlanning?'checked':''}>允许推荐时参考这条个人收藏（整理入库后生效）</label><label>关联动作（可选）<select name="activityId"><option value="">暂不关联</option>${activities.map(a=>`<option value="${a.id}" ${k?.activityIds?.[0]===a.id?'selected':''}>${a.name}</option>`).join('')}</select></label><p class="helper left">保存到私人收件箱。链接不会自动抓取；你可以先保留自己的摘录。</p><button type="submit" class="primary full">保存收藏 ${icon('bookmark')}</button></form>`);
}
function captureDialog(id){
  const capture=id?(state.captures||[]).find(c=>c.id===id):null;
  showModal(capture?'补充分享内容':'收藏一条分享',`<form id="capture-form" data-id="${esc(capture?.id||'')}"><label>分享链接<input name="rawUrl" type="url" inputmode="url" value="${esc(capture?.rawUrl||'')}" placeholder="抖音、小红书、B 站或网页链接" ${capture?'readonly':''}></label><label>作者或来源（可选）<input name="sourceTitle" maxlength="180" value="${esc(capture?.sourceTitle||'')}" placeholder="例如：谭成义"></label><label>分享文字 / 文案 / 字幕（可选）<textarea name="shareText" maxlength="8000" rows="5" placeholder="直接粘贴链接也可以。已启用云端服务的公开抖音视频会尝试自动转成文字。">${esc(capture?.shareText||'')}</textarea></label><label>我为什么想收藏（可选）<textarea name="userNote" maxlength="1000" placeholder="例如：想试试他的髋部训练思路。">${esc(capture?.userNote||'')}</textarea></label><p class="helper left">原始分享会先保存在本机。自动整理只在你配置服务后，对公开抖音视频发送链接并转写；失败也不会丢失收藏。</p><button type="submit" class="primary full">${capture?'保存补充内容':'存入收件箱'} ${icon('bookmark')}</button></form>${capture?'':'<button class="secondary full" data-action="paste-capture">从剪贴板粘贴</button>'}`);
}
function ingestSettingsDialog(){
  // 两条线路都可以配置，选一条作为当前使用；进行中的任务仍在提交它的线路上查询。
  const r=ingestRoutes(state);
  const route=id=>{const x=INGEST_ROUTES[id],cfg=r[id];return `<fieldset class="ingest-route ${r.active===id?'active':''}"><legend><label class="checkbox-line"><input type="radio" name="active" value="${id}" ${r.active===id||(!r.active&&id==='aliyun')?'checked':''}> <strong>${x.label}</strong> <span class="small muted">· ${x.hint}</span>${r.active===id?' <span class="badge">当前使用</span>':''}</label></legend><label>服务地址<input name="${id}_base" type="url" inputmode="url" value="${esc(cfg?.base||x.defaultBase)}" placeholder="https://…${x.suffix}"></label><label>个人访问码<input name="${id}_token" type="password" autocomplete="off" placeholder="${cfg?'已保存；留空表示不修改':'留空 = 沿用另一条线路的访问码'}"></label><button class="text-button" type="button" data-ingest-test="${id}">测试连接</button><span class="small muted" data-ingest-result="${id}">${cfg?'已配置':'尚未配置'}</span></fieldset>`;};
  showModal('自动视频整理',`<p>配置后，收藏公开的抖音、小红书或 B 站视频时可自动生成待确认知识卡。链接会发送到你自己的云端服务；服务用 TikHub 取得播放信息，再交百炼读取口播、画面与字幕。原视频不会保存在本机或循动云端。</p><form id="ingest-settings-form">${route('aliyun')}${route('cloudflare')}<p class="helper left">两条线路可以都配置好，用上面的单选按钮选当前使用哪一条；切换后新收藏走新线路，已经在处理的视频仍在原线路上完成。只想用一条线路时，把另一条的地址清空即可。</p><label class="checkbox-line"><input name="consent" type="checkbox" required>我同意主动收藏或重试时，向所选服务发送分享链接，并用百炼处理公开媒体内容</label><button class="primary full" type="submit">保存自动整理设置</button></form>${r.active?'<button class="secondary full" data-action="clear-ingest">清除本机自动整理设置</button>':''}<p class="helper left">访问码只保存在这台设备，导出备份会移除。</p>`);
}
async function startIngest(captureId,force=false){
  const capture=state.captures.find(c=>c.id===captureId),cfg=ingestConfig(state);
  if(!capture)return;
  if(!cfg){ingestSettingsDialog();return;}
  if(!supportedAutoCapture(capture)){toast('自动整理目前支持公开的抖音、小红书和 B 站视频。');return;}
  if(ingestStarting.has(captureId)||capture.ingestStatus==='queued')return;
  ingestStarting.add(captureId);
  try{
    const jobId=await submitIngest(capture,cfg,{force});
    if(commit(s=>{const c=s.captures.find(c=>c.id===captureId);c.ingestJobId=jobId;c.ingestRoute=cfg.id;c.ingestStatus='queued';c.ingestError='';c.ingestWarning='';c.updatedAt=new Date().toISOString();const k=s.knowledge.find(k=>k.id===c.knowledgeId);if(k&&k.status==='inbox')k.text='正在读取视频中的口播、画面与字幕。';})){
      render();toast('已保存链接，正在后台解析视频内容。');
    }
  }catch(e){toast(e.message||'自动整理暂时不可用，链接已保存在收件箱。');}
  finally{ingestStarting.delete(captureId);}
}
async function pollIngest(captureId){
  // 用提交这个任务的那条线路查询；旧任务没有记录线路时用当前线路。
  const c=state.captures.find(x=>x.id===captureId),cfg=(c?.ingestRoute&&ingestConfigFor(state,c.ingestRoute))||ingestConfig(state);
  if(!c||!cfg||!c.ingestJobId||c.ingestStatus!=='queued'||ingestPolling.has(captureId)||navigator.onLine===false)return;
  ingestPolling.add(captureId);
  let terminal=false;
  try{
    const result=await readIngestJob(c.ingestJobId,cfg);
    if(result.status==='queued')return;
    terminal=true;
    if(commit(s=>applyIngestResult(s,captureId,result))){
      render();
      if(result.status==='complete'){
        const saved=state.captures.find(c=>c.id===captureId);
        toast(saved?.cardDraft?'知识卡草稿已准备好，请核对。':'视频已解析，可稍后整理知识卡。');
        if(saved?.cardDraft&&page==='knowledge'&&!$('#sheet').open)reviewIngestDraft(captureId);
      }else toast(result.message||'暂时无法自动整理，链接仍在收件箱。');
    }
  }catch(e){if((terminal||Date.now()-new Date(c.updatedAt||c.capturedAt).getTime()>48*3600000)&&commit(s=>{const item=s.captures.find(x=>x.id===captureId);item.ingestStatus='failed';item.ingestError=terminal?'云端结果无法核对，请重试。':'任务已过期，请重试。';}))render();}
  finally{ingestPolling.delete(captureId);}
}
function knowledgeConfirmDialog(){
  const {captureId,card,warnings=[]}=pendingKnowledge;
  const capture=(state.captures||[]).find(c=>c.id===captureId);
  if(!capture)return toast('找不到这条分享，请刷新后重试。');
  const evidenceLabel=claim=>claim.evidenceSource==='workflow_model'?'AI 画面描述（待核对）':claim.evidenceKind==='asr_transcript'?'视频语音':claim.evidenceKind==='frame_ocr'?'画面字幕':claim.evidenceKind==='keyframe_description'?'画面解析':'你提供的文字';
  showModal('核对知识卡',`${warnings.length?`<div class="notice">${warnings.map(w=>`<p class="small">${esc(w)}</p>`).join('')}</div>`:''}<p class="muted">每条观点都附有视频语音、画面或字幕依据。AI 识别可能有误，请回看原视频后保存。</p><form id="knowledge-confirm-form"><label>标题<input name="title" required maxlength="120" value="${esc(card.title)}"></label><label>摘要（可选）<textarea name="summary" maxlength="700">${esc(card.summary||'')}</textarea></label>${card.claims.map((claim,n)=>`<fieldset class="log-item"><label class="checkbox-line"><input type="checkbox" name="keep_${n}" checked> 保留第 ${n+1} 条</label><label>整理后的观点<textarea name="claim_${n}" required maxlength="500">${esc(claim.text)}</textarea></label><p class="small muted">${evidenceLabel(claim)}${claim.startMs!=null?` · ${Math.floor(claim.startMs/60000)}:${String(Math.floor(claim.startMs/1000)%60).padStart(2,'0')}`:''}：「${esc(claim.evidenceQuote)}」</p></fieldset>`).join('')}<fieldset><legend>关联现有动作（可选）</legend>${card.activityLinks.map((link,n)=>`<div class="link-row"><label class="checkbox-line"><input type="checkbox" name="linkKeep_${n}" checked> <select name="link_${n}">${activities.map(a=>`<option value="${a.id}" ${a.id===link.activityId?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label><span class="small muted">原文：「${esc(link.evidenceQuote)}」</span><div class="field-row"><label>用途${link.use?'<span class="small muted">（AI 按原文建议）</span>':''}<select name="linkUse_${n}"><option value="">不记用途</option>${Object.entries(USES).map(([v,l])=>`<option value="${v}" ${link.use===v?'selected':''}>${l}</option>`).join('')}</select></label><label>部位<select name="linkRegion_${n}"><option value="">不指定</option>${Object.entries(bodyRegions).map(([v,r])=>`<option value="${v}" ${link.region===v?'selected':''}>${esc(r.label)}</option>`).join('')}</select></label></div><input type="hidden" name="linkNote_${n}" value="${esc(link.note||'')}"></div>`).join('')||'<p class="small muted">AI 没有找到可由原文核对的现有动作。</p>'}</fieldset><label>主题（可选，用顿号或逗号分隔）<input name="topics" maxlength="80" value="${esc((card.topics||[]).join('、'))}" placeholder="例如：髋关节热身、核心训练" list="topic-options"></label><datalist id="topic-options">${corpusTopics(state).map(t=>`<option value="${esc(t.topic)}">`).join('')}</datalist><label class="checkbox-line"><input type="checkbox" name="useInPlanning" ${card.claims.some(c=>c.evidenceSource==='workflow_model')?'':'checked'}>作为长期知识，安排训练时可以参考${card.claims.some(c=>c.evidenceSource==='workflow_model')?'（含 AI 画面描述，建议核对后再打开）':''}</label><p class="helper left">这张卡来自你收藏的内容，观点未经专业审核。即使允许参考，也不能绕过当天的安全、器械和时间限制。</p><button class="primary full" type="submit">保存到个人知识库 ${icon('check')}</button></form>`);
}
function reviewIngestDraft(captureId){
  const capture=state.captures.find(c=>c.id===captureId);
  if(!capture?.cardDraft)return preferVideoIngest(capture)?startIngest(captureId,true):analyzeCapture(captureId);
  const checked=validateKnowledgeImport({status:'ok',card:capture.cardDraft},capture);
  if(!checked.ok){toast('知识卡草稿的来源依据已失效，请重新整理。');return;}
  pendingKnowledge={captureId,card:checked.card,warnings:checked.warnings};knowledgeConfirmDialog();
}
function analyzeCapture(captureId){
  const capture=(state.captures||[]).find(c=>c.id===captureId);
  if(!capture)return toast('找不到这条分享，请刷新后重试。');
  if(preferVideoIngest(capture))return startIngest(captureId,true);
  if(!captureHasEvidence(capture)){captureDialog(captureId);toast('先补充文案、字幕或截图中的文字，才能整理。');return;}
  if(!ensureAI())return;
  withBusy(async()=>{
    const r=await askAI('knowledge-import',buildKnowledgeImportInput(state,capture),x=>validateKnowledgeImport(x,capture));
    if(r.status==='clarify'){pendingKnowledge={captureId,card:null};showModal('还差一点内容',`<p>${esc(r.question)}</p><button class="primary full" data-edit-capture="${esc(captureId)}">补充来源文字</button>`);return;}
    pendingKnowledge={captureId,card:r.card,warnings:r.warnings};knowledgeConfirmDialog();
  });
}
// 创作者方法卡：AI 只把这位创作者已确认卡片里的观点归纳成草稿；用户逐条确认后才写入 creatorProfiles。
function synthesizeMethod(creatorKey){
  if(!ensureAI())return;
  let input;
  try{creatorCards(state,creatorKey);input=buildCreatorMethodInput(state,creatorKey);}catch(e){toast(e.message);return;}
  toast('AI 正在归纳这位创作者的方法卡…');
  withBusy(async()=>{
    const r=await askAI('creator-method',input,x=>validateCreatorMethod(x,{cards:input.cards}));
    if(r.status==='clarify'){showModal('再确认一下',`<p>${esc(r.question)}</p><p class="helper left">可以先补充或修改这位创作者的知识卡，再重新整理。</p><button class="secondary full" data-action="close">知道了</button>`);return;}
    pendingMethod={creatorKey,creatorName:input.creator,card:r.card,cards:input.cards,warnings:r.warnings};
    showModal('核对方法卡',methodConfirmForm(pendingMethod));
  });
}
// 问我的知识库：只根据你确认过的知识回答，每条都附出处。没找到相关条目就不调用 AI。
function askDialog(question=''){showModal('问我的知识库',`<form id="knowledge-ask-form"><label>想问什么<textarea name="question" required maxlength="500" rows="3" placeholder="例如：练腿前怎么热身髋关节？核心训练要不要每天练？">${esc(question)}</textarea></label><p class="helper left">只根据你收藏并确认过的知识回答，不用 AI 自己的常识补充；每条回答都附出处。</p><button class="primary full" type="submit">问一问 ${icon('arrow')}</button></form>`);}
function answerDialog(question,r){
  const src=s=>`<p class="small muted">${esc(s.kind||'')} · ${esc(s.title||'')}${s.trust?` · <span class="badge warm">${esc(s.trust)}</span>`:''}：「${esc(s.quote)}」</p>`;
  showModal('知识库里是这么说的',`<p class="muted">问：${esc(question)}</p>${r.status==='empty'?`<p>${esc(r.reason)}</p>`:`<ol class="method-principles">${r.answer.map(p=>`<li>${esc(p.text)}${p.sources.map(src).join('')}</li>`).join('')}</ol>${r.gaps?`<p class="small muted">还缺：${esc(r.gaps)}</p>`:''}`}<button class="secondary full" data-action="knowledge-ask" data-question="${esc(question)}">换个问法再问</button>`);
}
function askKnowledge(question){
  const input=buildKnowledgeAskInput(state,question);
  if(!input.entries.length&&!input.summaries.length){answerDialog(question,{status:'empty',reason:input.totalEntries?'你的知识库里没有和这个问题相关的条目。可以换个说法，或者先收藏相关内容。':'知识库还是空的，先收藏一些内容吧。'});return;}
  if(!ensureAI())return;
  withBusy(async()=>{const r=await askAI('knowledge-ask',input,x=>validateKnowledgeAnswer(x,input));answerDialog(question,r);});
}
// 整理知识库：AI 按主题归纳成草稿，逐个主题确认后保存。
function digestCorpus(){
  if(!ensureAI())return;
  const input=buildDigestInput(state);
  if(input.entries.length<3){toast('至少需要 3 条已确认的知识才能整理。');return;}
  toast('AI 正在整理你的知识库…');
  withBusy(async()=>{
    const r=await askAI('corpus-digest',input,x=>validateDigest(x,input));
    if(r.status==='empty'){showModal('暂时归纳不出主题',`<p>${esc(r.reason)}</p><button class="secondary full" data-action="close">知道了</button>`);return;}
    pendingDigest={topics:r.topics,input,existing:(state.topicCards||[]).map(t=>t.topic)};
    showModal('核对主题总结',digestConfirmForm(pendingDigest,id=>state.knowledge.find(k=>k.id===id)?.title));
  });
}
// 书摘 / 读书笔记：只存摘录和笔记，不存全文。可以直接入库，也可以交给 AI 整理成要点。
function bookDialog(){
  const ai=aiState.ready&&state.settings?.aiConsent;
  showModal('书摘 / 读书笔记',`<form id="book-form"><label>书名<input name="title" required maxlength="120" placeholder="例如：囚徒健身"></label><div class="field-row"><label>作者（可选）<input name="author" maxlength="80"></label><label>章节 / 页码（可选）<input name="chapter" maxlength="80" placeholder="例如：第 3 章 · 深蹲"></label></div><label>摘录或读书笔记<textarea name="excerpt" required maxlength="8000" rows="7" placeholder="把书里值得记住的段落抄下来，或者写下这一章的要点。"></textarea></label><label>我的理解（可选）<textarea name="note" maxlength="1000" rows="2"></textarea></label><label>主题（可选，用顿号或逗号分隔）<input name="topics" maxlength="80" list="topic-options"></label><datalist id="topic-options">${corpusTopics(state).map(t=>`<option value="${esc(t.topic)}">`).join('')}</datalist><label class="checkbox-line"><input type="checkbox" name="useAI" ${ai?'checked':''}>保存后让 AI 整理成要点（每条附原文，逐条核对后入库）</label><label class="checkbox-line"><input type="checkbox" name="useInPlanning" checked>作为长期知识，安排训练时可以参考</label><p class="helper left">只保存你摘录和写下的文字，不保存整本书。不勾选 AI 整理时，摘录会原样作为一条知识入库。</p><button class="primary full" type="submit">保存 ${icon('bookmark')}</button></form>`);
}
// AI 联网搜索：来源由程序从搜索接口取回；逐条确认后入库，标「待核对」，默认不参与安排。
function searchDialog(question=''){
  showModal('AI 联网搜索',`<form id="search-form"><label>想了解什么<textarea name="question" required maxlength="300" rows="3" placeholder="例如：力量训练前的动态热身应该怎么做？">${esc(question)}</textarea></label><p class="helper left">问题会发给阿里云百炼联网搜索（只发这个问题，不发你的身体档案和记录）。搜到的多为网页文章，来源质量参差不齐：每条要点都附真实来源链接，逐条确认后才入库，并标为「待核对」。</p><button class="primary full" type="submit">搜索 ${icon('search')}</button></form>`);
}
function searchConfirmDialog(){
  const p=pendingSearch;
  showModal('核对搜索结果',`${p.warnings?.length?`<div class="notice">${p.warnings.map(w=>`<p class="small">${esc(w)}</p>`).join('')}</div>`:''}<p class="muted">问：${esc(p.question)}</p><p class="helper left">这些要点是 AI 根据搜索结果整理的，不能逐字核对原文。请点开来源看一看，只保留你认可的。</p><form id="search-confirm-form"><label>标题<input name="title" required maxlength="120" value="${esc(p.title)}"></label><label>主题（可选）<input name="topics" maxlength="80" value="${esc((p.topics||[]).join('、'))}"></label>${p.points.map((pt,n)=>`<fieldset class="log-item"><label class="checkbox-line"><input type="checkbox" name="keep_${n}" checked> 保留第 ${n+1} 条</label><textarea name="text_${n}" required maxlength="400">${esc(pt.text)}</textarea><p class="small muted">来源：${pt.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}${s.site?` · ${esc(s.site)}`:''}</a>`).join('；')}</p></fieldset>`).join('')}<label class="checkbox-line"><input type="checkbox" name="useInPlanning">安排训练时也参考（默认关闭：搜索内容可信度较低）</label><button class="primary full" type="submit">保存到知识库 ${icon('check')}</button><button class="secondary full" type="button" data-action="knowledge-search" data-question="${esc(p.question)}">换个问法重新搜索</button></form>`);
}
// 简短自评：一项一屏，最后汇总确认再保存。
function selfCheckStep(i){
  pendingSelfCheck.index=i;
  if(i>=SELF_CHECK_TASKS.length){showModal('自评结果',selfCheckSummaryForm(pendingSelfCheck.answers));return;}
  const t=SELF_CHECK_TASKS[i];showModal(t.title,selfCheckTaskForm(t,pendingSelfCheck.answers[t.id],i,SELF_CHECK_TASKS.length));
}
function observationDialog(){showModal('记一下身体状态',`<form id="observation-form"><label>现在的感受<textarea name="text" required maxlength="4000" placeholder="例如：昨天久坐比较多，今天颈部有些僵。写下时间、部位和哪些情况会加重。"></textarea></label><p class="helper left">保留你的原话，作为之后讨论的依据。持续或加重的不适需要专业评估。</p><button class="primary full" type="submit">保存随记 ${icon('check')}</button></form>`);}
function sessionDialog(id){const s=state.sessions.find(x=>x.id===id);if(s)showModal(dateText(s.endedAt)+'的训练',`${s.planSnapshot&&s.items.some(i=>i.status==='completed')?`<button class="secondary full" data-save-session-template="${esc(s.id)}">${icon('bookmark')} 收藏这次训练，以后直接拿出来练</button>`:''}${sessionEditForm(s)}`);}
// 收藏训练：可以从还没开始的安排收藏，也可以从练完的记录收藏；名字可改。
function templateDialog(from,id=''){
  const src=from==='session'?state.sessions.find(x=>x.id===id):state.draft;if(!src)return;
  const request=from==='session'?src.planSnapshot.request:src.request;
  const count=from==='session'?src.items.filter(i=>i.status==='completed').length:src.items.length;
  showModal('收藏这套训练',`<form id="template-form" data-from="${from}" data-id="${esc(id)}"><label>名字<input name="name" required maxlength="60" value="${esc(defaultPlanName(request))}"></label><p class="helper left">保存 ${count} 个动作的顺序、组次安排和推荐理由${from==='session'?'（只收这次实际完成的动作）':''}。实际用过的重量不保存，下次按最近的记录参考。载入时会按当天的状态、器械重新检查。</p><button class="primary full" type="submit">收藏 ${icon('bookmark')}</button></form>`);
}
function loadSavedPlan(id){
  if(state.draft){toast('请先完成或撤下当前安排，再载入收藏的训练。');return;}
  const block=abilityBlock(state.assessments);if(block){showModal('暂时无法安排',`<p>${esc(block)}</p><button class="secondary" data-nav="body">去看这条记录</button>`);return;}
  let r;try{r=loadTemplate(state,id,{readiness:request.readiness});}catch(e){toast(e.message);return;}
  if(r.blocked){showModal('今天暂时不能用这套训练',`<p>${esc(r.reason)}</p><button class="secondary" data-action="close">知道了</button>`);return;}
  if(commit(s=>s.draft=r.plan)){request=structuredClone(r.plan.request);render();window.scrollTo({top:0,behavior:'smooth'});toast(r.skipped.length?`已载入；今天略去了 ${r.skipped.length} 个不适合的动作。`:'已载入，可以调整或直接开始。');}
}
function setDialog(id){const i=state.draft?.items.find(x=>x.id===id);if(i)showModal(activityName(i)+' · 本次记录',exerciseLogForm(i,state));}
// The active item advances to the next one that hasn't been recorded or skipped; past the end shows the wrap-up card.
function nextCursor(draft,from){for(let k=from+1;k<draft.items.length;k++)if(draft.items[k].status!=='skipped'&&draft.items[k].status!=='completed')return k;return draft.items.length;}
// Rest countdown lives outside #app so it survives full re-renders; it only ever suggests, never blocks.
let rest=null;
const fmtSec=sec=>`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
const restRemain=()=>Math.max(0,Math.ceil((rest.endsAt-Date.now())/1000));
function paintRest(){const box=$('#rest');if(!box)return;if(!rest){box.hidden=true;box.innerHTML='';return;}box.hidden=false;box.innerHTML=`<div class="rest-inner"><div class="rest-copy"><span class="rest-label">休息</span><strong class="rest-time">${fmtSec(restRemain())}</strong>${rest.nextName?`<span class="rest-next">继续：${esc(rest.nextName)}</span>`:''}</div><div class="rest-actions"><button class="secondary" data-rest="add">+30 秒</button><button class="secondary" data-rest="skip">跳过休息</button></div></div>`;}
function startRest(item){if(!item)return;const a=activityById(item.activityId);rest={endsAt:Date.now()+restDefault(a)*1000,nextName:a?.name};paintRest();}
// 计时/保持型动作:准备倒数 → 计时 → 到点提示。和休息层同样活在 #app 外,存活于整屏重绘。
let timer=state.draft?.activeTimer?{...state.draft.activeTimer,phase:'paused',elapsedSec:state.draft.activeTimer.elapsedSec||0}:null;
const TIMER_READY=3;
function persistTimer(){return commit(s=>{if(s.draft)s.draft.activeTimer=timer?structuredClone(timer):null;});}
function pauseTimer(){
  if(!timer||timer.phase==='paused')return;
  timer=pauseActiveTimer(timer);persistTimer();paintTimer();
}
function buzz(pattern,muted=timer?.muted){if(muted)return;try{navigator.vibrate?.(pattern);}catch{}}
function paintTimer(){
  const box=$('#timer');if(!box)return;
  if(!timer){box.hidden=true;box.innerHTML='';return;}
  box.hidden=false;
  const mute=`<button class="icon-button timer-mute" data-timer-ctrl="mute" aria-label="${timer.muted?'取消静音':'静音到点提示'}">${icon(timer.muted?'bellOff':'bell')}</button>`;
  const cancel=`<button class="secondary" data-timer-ctrl="cancel">取消</button>`;
  if(timer.phase==='paused'){
    box.innerHTML=`<div class="timer-inner"><span class="timer-label">计时已暂停</span><strong class="timer-big work">${fmtSec(timer.elapsedSec||0)}</strong><span class="timer-next">${esc(timer.name)} · 离开页面的时间没有计入</span><div class="timer-actions">${mute}<button class="primary" data-timer-ctrl="resume">继续计时</button>${timer.elapsedSec>0?'<button class="secondary" data-timer-ctrl="stop">按当前时长记录</button>':''}${cancel}</div></div>`;
  }else if(timer.phase==='ready'){
    const n=Math.max(0,Math.ceil((timer.readyEndsAt-Date.now())/1000));
    box.innerHTML=`<div class="timer-inner"><span class="timer-label">准备</span><strong class="timer-big ready">${n||'开始'}</strong><span class="timer-next">${esc(timer.name)}</span><div class="timer-actions">${mute}${cancel}</div></div>`;
  }else{
    const shown=timer.workEndsAt&&timer.target?.countdown?Math.max(0,Math.ceil((timer.workEndsAt-Date.now())/1000)):Math.floor((Date.now()-timer.workStart)/1000);
    const goal=timer.target?(timer.target.countdown?`目标 ${timer.target.min} 秒`:`达标 ${timer.target.min} 秒 · 目标 ${timer.target.max} 秒`):'停止时记录用时';
    box.innerHTML=`<div class="timer-inner"><span class="timer-label">${esc(timer.name)}</span><strong class="timer-big work">${fmtSec(shown)}</strong><span class="timer-next">${esc(goal)}</span><div class="timer-actions">${mute}<button class="primary" data-timer-ctrl="stop">停止并记录</button>${cancel}</div></div>`;
  }
}
function startTimer(item){
  if(!item||state.draft?.pausedForDiscomfort)return;
  if(timer){toast('请先处理当前的计时，再切换动作。');return;}
  const a=activityById(item.activityId);
  rest=null;paintRest(); // 起计时前清掉休息倒计时,避免两个计时叠加
  timer={itemId:item.id,name:a?.name||'',phase:'ready',target:timeTarget(item),readyEndsAt:Date.now()+TIMER_READY*1000,muted:false,elapsedSec:0};
  if(!persistTimer()){timer=null;return;}
  paintTimer();
}
function timerToWork(){
  timer.phase='work';timer.workStart=Date.now();
  if(timer.target)timer.workEndsAt=timer.workStart+(timer.target.countdown?timer.target.min:timer.target.max)*1000;
  persistTimer();
  buzz(60);paintTimer();
}
function resumeTimer(){
  if(!timer||timer.phase!=='paused')return;
  timer=resumeActiveTimer(timer,Date.now(),TIMER_READY);
  persistTimer();paintTimer();
}
function stopTimer(record){
  const id=timer.itemId,phase=timer.phase,target=timer.target,workStart=timer.workStart,muted=timer.muted,elapsed=timer.elapsedSec||0;
  timer=null;persistTimer();paintTimer();
  if(!record||!['work','paused'].includes(phase)||phase==='paused'&&!elapsed)return;
  buzz([180,80,180],muted);
  const activeSec=phase==='paused'?elapsed:Math.ceil((Date.now()-workStart)/1000);
  const seconds=target?.countdown?Math.max(1,Math.min(target.min,activeSec)):Math.max(1,activeSec);
  recordSet(id,{reps:null,seconds:Math.round(seconds),loadKg:null,feeling:''});
}
// 与手动 set-form 相同的记录路径:追加一组、标记完成、非「不舒服」则起回合间休息。
function recordSet(id,set){
  validateSets([set]);
  const item0=state.draft?.items.find(i=>i.id===id);const a=item0&&activityById(item0.activityId);
  const ok=commit(s=>{const i=s.draft.items.find(i=>i.id===id);Object.assign(i,setSummary([...(i.actualSetDetails||[]),set]));i.status='completed';if(set.feeling==='discomfort'){s.draft.pausedForDiscomfort=true;s.observations.push({id:uid(),text:activityName(i)+'：本组出现不舒服',source:'self_report',createdAt:new Date().toISOString()});}});
  if(ok){if(set.feeling==='discomfort'){rest=null;paintRest();}else{const secs=item0?.prescription?.restSeconds??restDefault(a);if(secs>0){rest={endsAt:Date.now()+secs*1000,nextName:a?.name};paintRest();}}render();toast('已记录。');}
  return ok;
}
function ensureAI(){if(!aiState.ready||!aiState.paired||state.settings?.aiConsent?.providerId!==aiState.consentId){aiSettings();return false;}return true;}
function directSection(){
  const cfg=directConfig(state);
  return `<details class="ai-direct"${cfg?'':' open'}><summary>本机直连（出门也能用，key 存在这台设备）</summary>`
    +`<p class="small muted">把接口地址、API key、模型名存在<strong>本机浏览器</strong>，主动使用 AI 时由本机直接连服务方、不经过 Mac。部署到 HTTPS 后可随时随地使用。</p>`
    +`<p class="small muted">⚠️ key 明文存在本设备：请只在自己的私人设备上开启；能打开这台设备的人就能拿到它。导出的备份不会包含 key。</p>`
    +`<form id="ai-direct-form">`
    +`<label>接口地址（目前只支持阿里云百炼）<input name="base" type="url" inputmode="url" value="${esc(cfg?.base||'https://dashscope.aliyuncs.com/compatible-mode/v1')}" required></label>`
    +`<label>API key<input name="key" type="password" autocomplete="off" placeholder="${cfg?'已保存，留空表示不修改':'sk-...'}"${cfg?'':' required'}></label>`
    +`<label>模型名<input name="model" placeholder="qwen3.8-flash" value="${esc(cfg?.model||'')}" required></label>`
    +`<label class="checkbox-line"><input name="consent" type="checkbox" required>我明白 key 会存在本设备，并同意使用 AI 时向该服务发送数据</label>`
    +`<button type="submit" class="primary">${cfg?'更新本机直连':'启用本机直连'}</button>`
    +`${cfg?'<button type="button" class="secondary" data-action="clear-ai-direct">清除本机 key</button>':''}</form></details>`;
}
// 整理类任务（知识卡、方法卡、能力整理、训练记录）可换用更强的模型；「给我安排」不受影响。
function organizeModelSection(){
  const m=state.settings?.aiOrganizeModel||'';
  const label={'qwen3.8-flash':'快速','qwen3.8-max':'深度 · 更细致，较慢、费用更高'};
  return `<label>整理用模型<select data-ai-organize-model><option value="" ${m?'':'selected'}>和安排用同一个${aiState.model?`（${esc(aiState.model)}）`:''}</option>${ORGANIZE_MODELS.map(x=>`<option value="${x}" ${m===x?'selected':''}>${x} · ${label[x]}</option>`).join('')}</select></label><p class="small muted">用于知识卡、创作者方法卡、整理知识库、问我的知识库、能力整理和粘贴训练记录；「给我安排」始终用上面的模型。同为阿里云百炼，切换不需要重新授权。</p>`;
}
function aiSettings(){
  const sent='主动请求时才发送本次原话、必要的身体档案、近28天训练、能力观察、动作心得及允许参考的知识收藏；照片没有接入，也不会发送。';
  if(aiState.mode==='direct'){showModal('AI 数据发送设置',`<p>正在用<strong>本机直连</strong>：${esc(aiState.provider)} · ${esc(aiState.model)}</p><p>${sent}</p>${organizeModelSection()}${directSection()}`);return;}
  const proxy=aiState.ready?`<p>服务：<strong>${esc(aiState.provider)}</strong> · ${esc(aiState.model)}（经 Mac 代理）</p><p>${sent}</p>${/dashscope/.test(aiState.provider)?organizeModelSection():''}<p class="small muted">授权只对应当前服务。关闭后继续使用本地安排；服务方的数据处理方式以其政策为准。</p><form id="ai-consent-form">${aiState.pairingRequired&&!aiState.paired?'<label>Mac 启动终端显示的配对码<input name="code" inputmode="numeric" pattern="[0-9]{6}" required autocomplete="off"></label>':''}<label class="checkbox-line"><input name="consent" type="checkbox" required>我同意主动使用 AI 时发送上述信息</label><button type="submit" class="primary">启用此服务</button><button type="button" class="secondary" data-action="disable-ai">关闭 AI 数据发送</button></form>`:'<p>当前没有可连接的 Mac 代理。可用下面的「本机直连」把 key 存在本设备随时随地用；也可以继续用本地安排、记录和备份。</p>';
  showModal('AI 数据发送设置',proxy+directSection());
}
// 本机存了 key 就优先直连（出门也能用）；否则探测 Mac 代理。
function applyDirect(){const cfg=directConfig(state);if(!cfg)return false;Object.assign(aiState,{ready:true,mode:'direct',model:cfg.model,provider:providerHost(cfg.base),consentId:cfg.consentId,paired:true,pairingRequired:false});return true;}
function probeAI(){
  if(applyDirect()){render();return;}
  if(!proxyPossible(location.hostname))return;
  fetch('/api/ai/status').then(r=>r.ok?r.json():null).then(x=>{if(x?.configured){Object.assign(aiState,{ready:true,mode:'proxy',model:x.model,provider:x.provider,consentId:x.consentId,paired:x.paired,pairingRequired:x.pairingRequired});if(state.settings.aiConsent?.providerId!==x.consentId)state.settings.aiConsent=null;render();}}).catch(()=>{});
}
function generateLocal(){
  const block=abilityBlock(state.assessments);if(block){showModal('暂时无法安排',`<p>${esc(block)}</p><button class="secondary" data-nav="body">去看这条记录</button>`);return;}
  try{const p=createPlan(request,state.profile,state.sessions,new Date(),state.assessments,{activityUses:planUses()});if(!p.blocked){p.usedCorpus=corpusOn();const m=activeMethodPreference(state);if(m)p.methodHint={title:m.card.title,modeLabel:METHOD_MODES[m.mode].label};}if(p.blocked){showModal('暂时无法安排',`<p>${esc(p.reason)}</p><button class="secondary" data-action="close">调整选择</button>`);return;}if(commit(s=>s.draft=p))render();}catch(e){toast(e.message);}
}
function importDialog(){
  showModal('恢复 JSON 备份','<p>合并训练、心得、收藏和能力观察；已有同 ID 记录保留本机版本。不会恢复 AI 授权或覆盖当前训练草稿。</p><input id="backup-file" type="file" accept=".json,application/json" aria-label="选择备份文件"><div id="import-preview"></div>');
}
function manualLogDialog(){showModal('补记一次训练',`<form id="manual-log-form"><label>日期<input name="date" type="date" required value="${new Date().toLocaleDateString('en-CA')}"></label><label>活动名称<input name="name" required maxlength="80" placeholder="例如：羽毛球"></label><label>实际时长（分钟，可选）<input name="minutes" type="number" min="1" max="1440"></label><label>感受<textarea name="note" maxlength="2000"></textarea></label><button class="primary" type="submit">保存记录</button></form>`);}
document.addEventListener('click',e=>{
  const el=e.target.closest('button');if(!el)return;
  if(el.dataset.logSet){setDialog(el.dataset.logSet);return;}
  if(el.dataset.rest){if(el.dataset.rest==='add'&&rest)rest.endsAt+=30000;else rest=null;paintRest();return;}
  if(el.dataset.timer){const item=state.draft?.items.find(i=>i.id===el.dataset.timer);if(item)startTimer(item);return;}
  if(el.dataset.timerCtrl){if(!timer)return;const c=el.dataset.timerCtrl;if(c==='mute'){timer.muted=!timer.muted;persistTimer();paintTimer();}else if(c==='cancel')stopTimer(false);else if(c==='stop')stopTimer(true);else if(c==='resume')resumeTimer();return;}
  if(el.hasAttribute('data-goto')){if(timer){toast('请先结束或取消当前计时。');return;}const idx=Number(el.dataset.goto);if(commit(s=>s.draft.cursor=idx))render();return;}
  if(el.hasAttribute('data-next')){if(timer){toast('请先结束或取消当前计时。');return;}if(commit(s=>s.draft.cursor=nextCursor(s.draft,s.draft.cursor??0)))render();return;}
  if(el.dataset.abilityArchive){const id=el.dataset.abilityArchive;if(commit(s=>{const a=s.assessments.find(a=>a.id===id);a.status=a.status==='archived'?'active':'archived';}))render();return;}
  if(el.dataset.abilityDelete){showModal('删除这条观察？','<p>观察和只属于它的原话都会删除，不影响训练记录。</p><button class="primary" data-action="confirm-ability-delete" data-id="'+esc(el.dataset.abilityDelete)+'">删除</button>');return;}
  if(el.dataset.analyzeCapture){analyzeCapture(el.dataset.analyzeCapture);return;}
  if(el.dataset.reviewIngest){reviewIngestDraft(el.dataset.reviewIngest);return;}
  if(el.dataset.editCapture){captureDialog(el.dataset.editCapture);return;}
  if(el.dataset.autoIngest){startIngest(el.dataset.autoIngest,el.dataset.forceIngest==='true');return;}
  if(el.dataset.personal){filters.personal=el.dataset.personal;render();return;}
  if(el.dataset.nav){navigate(el.dataset.nav);return;}
  if(el.dataset.detail){detail(el.dataset.detail);return;}
  if(el.dataset.session){sessionDialog(el.dataset.session);return;}
  if(el.dataset.minutes){request.minutes=Number(el.dataset.minutes);render();return;}
  if(el.dataset.place){request.place=el.dataset.place;render();return;}
  if(el.hasAttribute('data-region')){const expanded=$('#region-more')?.open;const id=el.dataset.region;const selected=new Set(request.targetRegions||[]);if(id==='all')selected.clear();else if(selected.has(id))selected.delete(id);else selected.add(id);request.targetRegions=[...selected];render();if(expanded&&$('#region-more'))$('#region-more').open=true;return;}
  if(el.dataset.category){filters.category=el.dataset.category;render();return;}
  if(el.dataset.system){filters.system=el.dataset.system;render();return;}
  if(el.dataset.knowledgeFilter){knowledgeFilter=el.dataset.knowledgeFilter;render();return;}
  if(el.hasAttribute('data-knowledge-kind')){knowledgeKind=el.dataset.knowledgeKind;render();return;}
  if(el.hasAttribute('data-knowledge-topic')){knowledgeTopic=el.dataset.knowledgeTopic;render();return;}
  if(el.dataset.saveSessionTemplate){templateDialog('session',el.dataset.saveSessionTemplate);return;}
  if(el.dataset.loadTemplate){loadSavedPlan(el.dataset.loadTemplate);return;}
  if(el.dataset.renameTemplate){const t=(state.savedPlans||[]).find(x=>x.id===el.dataset.renameTemplate);if(t)showModal('重命名',`<form id="template-rename-form" data-id="${esc(t.id)}"><label>名字<input name="name" required maxlength="60" value="${esc(t.name)}"></label><button class="primary full" type="submit">保存</button></form>`);return;}
  if(el.dataset.deleteTemplate){showModal('删除这套收藏？','<p>只删除收藏，已有的训练记录不受影响。</p><button class="primary" data-action="confirm-template-delete" data-id="'+esc(el.dataset.deleteTemplate)+'">删除</button>');return;}
  if(el.dataset.deleteUse){const id=el.dataset.deleteUse,act=el.dataset.activity;if(commit(s=>deleteUse(s,id))){detail(act);toast('已删除这条用途备注。');}return;}
  if(el.dataset.deleteTopic){showModal('删除这张主题总结？','<p>只删除总结，原始知识条目不受影响；下次整理时可能重新生成。</p><button class="primary" data-action="confirm-topic-delete" data-id="'+esc(el.dataset.deleteTopic)+'">删除</button>');return;}
  if(el.dataset.addToDraft){const id=el.dataset.addToDraft;if(commit(s=>addToDraft(s.draft,id,s.profile))){$('#sheet').close();render();toast('已加入今天的安排。');}return;}
  if(el.dataset.editActivity){activityFormDialog(el.dataset.editActivity);return;}
  if(el.dataset.archiveActivity){const id=el.dataset.archiveActivity,p=(state.personalActivities||[]).find(x=>x.id===id);if(p&&commit(s=>archivePersonalActivity(s,id,p.status!=='archived'))){render();detail(id);toast(p.status==='archived'?'已恢复。':'已归档，不再出现在动作库和安排里。');}return;}
  if(el.dataset.deleteActivity){showModal('删除这个动作？','<p>只能删除还没有被训练记录、心得、收藏或用途备注用过的动作；用过的请改为归档。</p><button class="primary" data-action="confirm-activity-delete" data-id="'+esc(el.dataset.deleteActivity)+'">删除</button>');return;}
  if(el.dataset.extractActivities){const id=el.dataset.extractActivities,capture=(state.captures||[]).find(c=>c.knowledgeId===id);if(capture)extractActivities({capture,knowledgeId:id});else toast('这条知识没有原始内容可以提取。');return;}
  if(el.dataset.ingestTest){const id=el.dataset.ingestTest,form=$('#ingest-settings-form'),out=document.querySelector(`[data-ingest-result="${id}"]`),base=allowedIngestBase(form?.[`${id}_base`]?.value);
    if(!base){out.textContent='地址格式不对';return;}out.textContent='正在测试…';
    fetch(base+'/health',{signal:AbortSignal.timeout(10000)}).then(r=>r.json()).then(x=>{out.textContent=x?.configured?'✓ 可以连接':x?.error==='origin_not_allowed'?'能连上，但服务只接受正式网址（yancd366.github.io）的请求':'能连上，但服务未配置完整';}).catch(()=>{out.textContent=id==='cloudflare'?'✗ 连不上（国内通常需要开 VPN）':'✗ 连不上，请检查网络或地址';});return;}
  if(el.dataset.synthesizeMethod){synthesizeMethod(el.dataset.synthesizeMethod);return;}
  if(el.dataset.deleteMethod){showModal('删除这张方法卡？','<p>只删除归纳出的方法卡，原始知识卡不受影响。</p><button class="primary" data-action="confirm-method-delete" data-id="'+esc(el.dataset.deleteMethod)+'">删除</button>');return;}
  if(el.dataset.deleteKnowledge){showModal('删除这条知识？','<p>收藏、原文和整理结果都会从这台设备移除，不能撤销。</p><button class="primary" data-action="confirm-knowledge-delete" data-id="'+esc(el.dataset.deleteKnowledge)+'">删除</button>');return;}
  if(el.dataset.editKnowledge){knowledgeDialog(el.dataset.editKnowledge);return;}
  if(el.dataset.saveKnowledge){if(commit(s=>s.knowledge.find(k=>k.id===el.dataset.saveKnowledge).status='saved')){render();toast('已收进个人库；原始来源已保留。');}return;}
  if(el.dataset.preset){if(state.draft){toast('请先完成或撤下当前安排，再开始新的活动。');return;}request={minutes:el.dataset.preset==='mobility'?10:5,place:el.dataset.preset==='office'?'office':'home',focus:el.dataset.preset==='office'?'balanced':el.dataset.preset,readiness:'normal'};generateLocal();window.scrollTo({top:0,behavior:'smooth'});return;}
  if(el.dataset.complete||el.dataset.skip){if(state.draft?.pausedForDiscomfort){toast('已出现不舒服，请先结束并保存本次记录。');return;}const id=el.dataset.complete||el.dataset.skip;if(commit(s=>{const idx=s.draft.items.findIndex(i=>i.id===id);const i=s.draft.items[idx];const nowSkipping=el.dataset.skip&&i.status!=='skipped';i.status=el.dataset.complete?(i.status==='completed'?'pending':'completed'):(i.status==='skipped'?'pending':'skipped');if(nowSkipping&&idx===(s.draft.cursor??0))s.draft.cursor=nextCursor(s.draft,idx);}))render();return;}
  if(el.dataset.replace){const a=replaceItem(state.draft,el.dataset.replace,state.profile);if(!a){toast('没有满足同一目标和器械条件的替代。');return;}if(commit(s=>applyReplacement(s.draft,el.dataset.replace,a))){render();toast('已替换；旧重量、组次和理由已清除。');}return;}
  switch(el.dataset.action){
    case 'close':$('#sheet').close();break;
    case 'generate':generateLocal();break;
    case 'generate-smart':aiState.text=$('#ai-text')?.value||'';if(!aiState.text.trim()&&state.aiPending)commit(s=>s.aiPending=null);if(aiState.text.trim()&&(!state.settings?.aiConsent||!aiState.paired)){aiSettings();break;}if(aiState.ready&&state.settings?.aiConsent){if(ensureAI())withBusy(aiPlan,'plan');}else generateLocal();break;
    case 'ai-settings':aiSettings();break;
    case 'ingest-settings':ingestSettingsDialog();break;
    case 'clear-ingest':if(commit(s=>s.settings.ingest=null)){$('#sheet').close();render();toast('已清除这台设备的自动整理访问码。');}break;
    case 'disable-ai':if(commit(s=>s.settings.aiConsent=null)){$('#sheet').close();render();toast('已关闭 AI 数据发送。');}break;
    case 'clear-ai-direct':if(commit(s=>{s.settings.aiDirect=null;if(s.settings.aiConsent?.providerId===aiState.consentId)s.settings.aiConsent=null;})){Object.assign(aiState,{ready:false,mode:null,model:null,provider:'',consentId:null,paired:false,pairingRequired:false});$('#sheet').close();probeAI();render();toast('已清除本设备上的 key。');}break;
    case 'assessment':showModal('新增能力观察',assessmentForm());break;
    case 'ability-intake':if(ensureAI())showModal('整理身体与能力情况',abilityIntakeForm(pendingAbility||{}));break;
    case 'ability-flags-absent':{const m=pendingAbility;if(!m?.pendingFlags)break;$('#sheet').close();abilityIntake({rawText:m.rawText,source:m.source,observedOn:m.observedOn,flagsCleared:[...new Set([...(m.flagsCleared||[]),...m.pendingFlags])]});break;}
    case 'ability-flags-present':referDialog('谢谢你如实说明。这种情况不适合由 App 自行判断，请先咨询医生或康复专业人员；这段内容不会写进能力档案。');break;
    case 'self-check':pendingSelfCheck={index:0,answers:{}};selfCheckStep(0);break;
    case 'self-check-prev':if(pendingSelfCheck)selfCheckStep(Math.max(0,pendingSelfCheck.index-1));break;
    case 'ability-retry':showModal('整理身体与能力情况',abilityIntakeForm(pendingAbility||{}));break;
    case 'confirm-ability-delete':{const id=el.dataset.id;if(commit(s=>{s.assessments=s.assessments.filter(a=>a.id!==id);const used=new Set(s.assessments.flatMap(a=>a.evidenceIds||[]));s.abilityEvidence=(s.abilityEvidence||[]).filter(e=>used.has(e.id));})){$('#sheet').close();render();toast('已删除这条观察。');}break;}
    case 'confirm-knowledge-delete':{const id=el.dataset.id;if(commit(s=>deleteKnowledge(s,id))){$('#sheet').close();render();toast('已删除这条知识。');}break;}
    case 'save-template':if(state.draft)templateDialog('draft');break;
    case 'confirm-template-delete':{const id=el.dataset.id;if(commit(s=>deleteTemplate(s,id))){$('#sheet').close();render();toast('已删除这套收藏。');}break;}
    case 'confirm-method-delete':{const id=el.dataset.id;if(commit(s=>deleteMethodCard(s,id))){$('#sheet').close();render();toast('已删除这张方法卡。');}break;}
    case 'import':importDialog();break;
    case 'manual-log':manualLogDialog();break;
    case 'start':{const reason=checkPlanStart(state.draft,state.profile)||abilityBlock(state.assessments);if(reason){toast(reason);break;}if(commit(s=>{s.draft.startedAt=new Date().toISOString();s.draft.cursor=0;}))render();break;}
    case 'discard':showModal('撤下当前安排？','<p>这份未保存的安排将被移除，不会计入训练记录。已保存的训练和心得不受影响。</p><button class="primary" data-action="confirm-discard">撤下安排</button>');break;
    case 'confirm-discard':if(commit(s=>s.draft=null)){timer=null;paintTimer();rest=null;paintRest();$('#sheet').close();render();}break;
    case 'finish':finishDialog();break;
    case 'ai-plan':aiState.text=$('#ai-text')?.value||'';if(ensureAI())withBusy(aiPlan,'plan');break;
    case 'generate-offline':$('#sheet').close();generateLocal();break;
    case 'ai-adjust':{const text=$('#ai-adjust-text')?.value.trim();if(!text){toast('先写下想怎么调整。');break;}aiState.adjustText=text;if(ensureAI())withBusy(()=>aiAdjust(text),'adjust');break;}
    case 'ai-log':if(ensureAI())logInputDialog();break;
    case 'ai-log-retry':logInputDialog(pendingLog?.text);break;
    case 'add-knowledge':knowledgeDialog();break;
    case 'capture':captureDialog();break;
    case 'digest':digestCorpus();break;
    case 'add-activity':addActivityDialog(el.dataset.text||'');break;
    case 'activity-manual':activityFormDialog();break;
    case 'confirm-activity-delete':{const id=el.dataset.id;if(commit(s=>deletePersonalActivity(s,id))){$('#sheet').close();render();toast('已删除这个动作。');}break;}
    case 'confirm-topic-delete':{const id=el.dataset.id;if(commit(s=>deleteTopicCard(s,id))){$('#sheet').close();render();toast('已删除这张主题总结。');}break;}
    case 'book':bookDialog();break;
    case 'knowledge-search':if(ensureAI())searchDialog(el.dataset.question||'');break;
    case 'knowledge-ask':askDialog(el.dataset.question||'');break;
    case 'paste-capture':{
      navigator.clipboard?.readText?.().then(text=>{
        const value=String(text||'').trim(),{rawUrl,shareText}=splitSharedText(value);
        const dialog=$('#sheet'),form=dialog.querySelector('#capture-form');if(!form)return;
        if(rawUrl)form.rawUrl.value=rawUrl;
        if(shareText)form.shareText.value=shareText;
        toast(rawUrl?'已提取分享链接。':'已粘贴文字。');
      }).catch(()=>toast('无法读取剪贴板，请手动粘贴。'));
      break;
    }
    case 'observation':observationDialog();break;
    case 'export':{let data;try{data=storageError?rawBackupText(localStorage.getItem(STORE_KEY)):JSON.stringify(sanitizeForExport(state),null,2);}catch{toast('本地数据无法解析，不能生成安全的备份。请保留此页面，先不要清除浏览器数据。');break;}try{const url=URL.createObjectURL(new Blob([data||''],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`循动备份-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('已导出当前浏览器的记录。');}catch{toast('当前浏览器无法读取存储，请保留此页面。');}break;}
  }
});
document.addEventListener('change',e=>{if(e.target.id==='method-card'||e.target.id==='method-mode'){const id=$('#method-card')?.value||null,mode=$('#method-mode')?.value||'inspiration';if(commit(s=>s.settings.methodPreference=id?{creatorProfileId:id,mode}:null)){render();toast(id?`下次 AI 安排会按「${state.creatorProfiles.find(p=>p.id===id)?.title}」· ${METHOD_MODES[mode].label}。`:'不按创作者方法安排。');}return;}if(e.target.dataset.activityPlanning){const id=e.target.dataset.activityPlanning,use=e.target.value;if(commit(s=>setActivityPlanning(s,id,use))){render();detail(id);toast(use==='allowed'?'之后的安排可以自动选到它了。':'改为仅手动使用。');}return;}if(e.target.dataset.topicPlanning){const id=e.target.dataset.topicPlanning,on=e.target.checked;if(commit(s=>setTopicPlanning(s,id,on))){render();toast(on?'这张主题总结会参与安排。':'这张主题总结不再参与安排。');}else render();return;}if(e.target.id==='use-corpus'){const on=e.target.checked;if(commit(s=>s.settings.useCorpus=on))toast(on?'安排时会参考你的知识库。':'这之后的安排不参考知识库。');return;}if(e.target.matches('[data-ai-organize-model]')){const m=ORGANIZE_MODELS.includes(e.target.value)?e.target.value:null;if(commit(s=>s.settings.aiOrganizeModel=m))toast(m?`整理类任务将使用 ${m}。`:'整理类任务改回和安排用同一个模型。');return;}if(e.target.dataset.methodPlanning){const id=e.target.dataset.methodPlanning,allowed=e.target.checked;if(commit(s=>setMethodPlanning(s,id,allowed))){render();toast(allowed?'已允许这张方法卡参与安排。':'已取消用于安排。');}else render();return;}if(e.target.dataset.abilityUse){const id=e.target.dataset.abilityUse,use=e.target.value,a=state.assessments.find(a=>a.id===id);if(a&&allowedUses(a).includes(use)&&commit(s=>s.assessments.find(a=>a.id===id).recommendationUse=use)){render();toast(use==='gentle_preference'?'已设为温和参考，会参与之后的安排。':'已更新用途。');}else render();return;}if(e.target.id==='focus'){request.focus=e.target.value;if(request.focus!=='strength')request.targetRegions=[];render();$('#focus')?.focus();}if(e.target.id==='readiness')request.readiness=e.target.value;if(e.target.id==='library-place'){filters.place=e.target.value;render();}});
document.addEventListener('input',e=>{if(e.target.id==='ai-text')aiState.text=e.target.value;if(e.target.id==='activity-search'){const pos=e.target.selectionStart;filters.search=e.target.value;render();const input=$('#activity-search');input.focus();input.setSelectionRange(pos,pos);}});
document.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target,f=new FormData(form);
  try{
    let ok=false;
    if(form.id==='ai-consent-form'){
      if(!f.get('consent'))throw new Error('需要你确认发送范围。');
      const res=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:f.get('code')||''})});const data=await res.json();if(!res.ok)throw new Error(data.error||'配对失败');
      aiState.paired=true;ok=commit(s=>s.settings.aiConsent={providerId:aiState.consentId,provider:aiState.provider,model:aiState.model,confirmedAt:new Date().toISOString()});
    }
    if(form.id==='ai-direct-form'){
      if(!f.get('consent'))throw new Error('需要你确认 key 存本设备并同意发送。');
      const base=String(f.get('base')||'').trim().replace(/\/$/,''),model=String(f.get('model')||'').trim(),keyInput=String(f.get('key')||'').trim();
      if(!allowedBase(base))throw new Error('本机直连目前只支持阿里云百炼：https://dashscope.aliyuncs.com/compatible-mode/v1');
      if(!model)throw new Error('请填写模型名。');
      const key=keyInput||directConfig(state)?.key;
      if(!key)throw new Error('请填写 API key。');
      const consentId=directConsentId(base,model);
      ok=commit(s=>{s.settings.aiDirect={base,key,model,consentId};s.settings.aiConsent={providerId:consentId,provider:providerHost(base),model,confirmedAt:new Date().toISOString()};});
      if(ok){applyDirect();$('#sheet').close();render();toast('本机直连已启用，出门也能用 AI。');return;}
    }
    if(form.id==='ingest-settings-form'){
      if(!f.get('consent'))throw new Error('请确认分享链接会发送给所选云端服务。');
      const next=nextIngestSettings(state,{aliyun:{base:f.get('aliyun_base'),token:f.get('aliyun_token')},cloudflare:{base:f.get('cloudflare_base'),token:f.get('cloudflare_token')},active:f.get('active')});
      ok=commit(s=>s.settings.ingest=next);
      if(ok){$('#sheet').close();render();toast(`已保存。当前使用：${INGEST_ROUTES[next.active].label}${Object.keys(next.routes).length>1?'（另一条线路也已配置，可随时切换）':''}。`);}return;
    }
    if(form.id==='assessment-form')ok=commit(s=>s.assessments.push(abilityEntry(Object.fromEntries(f))));
    if(form.id==='ability-intake-form'){const rawText=String(f.get('rawText')||'').trim();if(!rawText)throw new Error('先写一点最近的情况。');$('#sheet').close();abilityIntake({rawText,source:f.get('source'),observedOn:f.get('observedOn')});return;}
    if(form.id==='ability-confirm-form'){const drafts=readAbilityConfirm(f);if(!drafts.length){pendingAbility=null;$('#sheet').close();toast('没有勾选任何条目，什么也没保存。');return;}
      const {evidence,assessments}=abilityRecords(drafts,pendingAbility);ok=commit(s=>{s.abilityEvidence=[...(s.abilityEvidence||[]),evidence];s.assessments.push(...assessments);});
      if(ok){pendingAbility=null;$('#sheet').close();render();toast(`已保存 ${assessments.length} 条观察。`);}return;}
    if(form.id==='capture-form'){
      const input={rawUrl:f.get('rawUrl'),sourceTitle:f.get('sourceTitle'),shareText:f.get('shareText'),userNote:f.get('userNote')};
      const oldId=form.dataset.id;
      if(oldId){
        const old=(state.captures||[]).find(c=>c.id===oldId);if(!old)throw new Error('找不到这条分享，请刷新后重试。');
        if(String(input.rawUrl||'').trim()!==old.rawUrl)throw new Error('原始分享链接会保留用于追溯；如需另一条链接，请新建收藏。');
        const draft=captureEntry(input,{...state,captures:state.captures.filter(c=>c.id!==oldId)}).capture;
        ok=commit(s=>{const c=s.captures.find(c=>c.id===oldId);if(c.shareText!==draft.shareText)c.shareTextHistory=[...(c.shareTextHistory||[]),{text:c.shareText,changedAt:new Date().toISOString()}];Object.assign(c,{shareText:draft.shareText,userNote:draft.userNote,sourceTitle:draft.sourceTitle,updatedAt:new Date().toISOString()});const k=s.knowledge.find(k=>k.id===c.knowledgeId);if(k&&k.status==='inbox')Object.assign(k,{title:c.resolvedSource?.title||c.sourceTitle||capturePlatforms[c.platform]+' 分享',sourceTitle:c.resolvedSource?.creatorName||c.sourceTitle||capturePlatforms[c.platform],text:c.transcript?.text?'视频已转成文字，等待 AI 整理成知识卡。':c.shareText?'等待 AI 根据你提供的文字整理。':'已保存链接，待补充文案、字幕或截图中的文字。',updatedAt:new Date().toISOString()});});
      }else{
        const created=captureEntry(input,state);ok=commit(s=>{s.captures.push(created.capture);s.knowledge.push(created.knowledge);});
        if(ok)form.dataset.createdCapture=created.capture.id;
      }
      if(ok){const captureId=oldId||form.dataset.createdCapture;$('#sheet').close();render();const capture=state.captures.find(c=>c.id===captureId);if(!oldId&&preferVideoIngest(capture)){startIngest(captureId);}else if(captureHasEvidence(capture)&&aiState.ready&&state.settings?.aiConsent)analyzeCapture(captureId);else toast(captureHasEvidence(capture)?'已保存到收件箱。启用 AI 后可整理成知识卡。':'已保存链接。配置自动视频整理后可一键转写。');}return;
    }
    if(form.id==='knowledge-confirm-form'){
      if(!pendingKnowledge?.card)throw new Error('整理草稿已失效，请重新整理。');
      const capture=(state.captures||[]).find(c=>c.id===pendingKnowledge.captureId);if(!capture)throw new Error('找不到这条来源，请刷新后重试。');
      const claims=pendingKnowledge.card.claims.flatMap((claim,n)=>f.get(`keep_${n}`)?[{text:String(f.get(`claim_${n}`)||'').trim(),evidenceId:claim.evidenceId,evidenceQuote:claim.evidenceQuote}]:[]);
      if(!claims.length)throw new Error('至少保留一条有来源依据的观点。');
      const activityLinks=pendingKnowledge.card.activityLinks.flatMap((link,n)=>f.get(`linkKeep_${n}`)?[{activityId:String(f.get(`link_${n}`)||''),use:f.get(`linkUse_${n}`)||null,region:f.get(`linkRegion_${n}`)||'',note:f.get(`linkNote_${n}`)||'',evidenceId:link.evidenceId,evidenceQuote:link.evidenceQuote}]:[]);
      const checked=validateKnowledgeImport({status:'ok',card:{title:f.get('title'),summary:f.get('summary'),topics:normalizeTopics(f.get('topics')),claims,activityLinks}},capture);
      if(!checked.ok)throw new Error(checked.errors.slice(0,2).join('；'));
      if(checked.warnings.length)throw new Error(`${checked.warnings[0]}可以换一个动作，或取消勾选它再保存。`);
      ok=commit(s=>{const k=applyKnowledgeCard(s,pendingKnowledge.captureId,checked.card);k.useInPlanning=Boolean(f.get('useInPlanning'));});
      if(ok){pendingKnowledge=null;$('#sheet').close();render();toast('已保存知识卡；来源文字和依据都保留在本机。');}return;
    }
    if(form.id==='digest-confirm-form'){
      if(!pendingDigest)throw new Error('整理草稿已失效，请重新整理。');
      const topics=pendingDigest.topics.flatMap((t,n)=>f.get(`topic_${n}`)?[{...t,title:String(f.get(`title_${n}`)||'').trim()||t.topic,principles:t.principles.flatMap((p,k)=>f.get(`keep_${n}_${k}`)?[{...p,text:String(f.get(`text_${n}_${k}`)||'').trim()}]:[]).filter(p=>p.text)}]:[]).filter(t=>t.principles.length);
      if(!topics.length){pendingDigest=null;$('#sheet').close();toast('没有勾选任何主题，什么也没保存。');return;}
      // 用户改过文字，按原输入重新校验一遍（来源仍须逐字、不得写医学因果）。
      const checked=validateDigest({status:'ok',topics:topics.map(t=>({...t,principles:t.principles.map(p=>({text:p.text,sources:p.sources.map(x=>({id:x.knowledgeId,quote:x.quote}))}))}))},pendingDigest.input);
      if(!checked.ok)throw new Error(checked.errors.slice(0,2).join('；'));
      ok=commit(s=>applyDigest(s,checked.topics));
      if(ok){pendingDigest=null;$('#sheet').close();render();toast(`已保存 ${topics.length} 张主题总结。`);}return;
    }
    if(form.id==='activity-describe-form'){const text=String(f.get('text')||'').trim();if(!text)throw new Error('先描述一下这个动作。');$('#sheet').close();extractActivities({text});return;}
    if(form.id==='activity-form'){
      const id=form.dataset.id,fields=readActivityFields(f,'a_');let saved;
      ok=commit(s=>{saved=id?updatePersonalActivity(s,id,fields):createPersonalActivity(s,fields,{planningUse:f.get('allow')?'allowed':'manual_only'});});
      if(ok){render();detail(saved.id);toast(id?'已保存修改。':`已加入「我的动作」${saved.planningUse==='allowed'?'，之后可以被自动安排':'，默认仅手动使用'}。`);}return;
    }
    if(form.id==='activity-intake-form'){
      if(!pendingActivities)throw new Error('整理结果已失效，请重新提取。');
      const {candidates,knowledgeId}=pendingActivities;let created=0,uses=0;
      ok=commit(s=>{candidates.forEach((c,n)=>{
        if(!f.get(`keep_${n}`))return;
        if(c.type==='existing'){
          const use=f.get(`use_${n}`);
          if(use){try{addManualUse(s,c.matchedActivityId,{use,region:f.get(`region_${n}`),note:f.get(`note_${n}`)},new Date(),knowledgeId?{knowledgeId,quote:c.evidenceQuote}:null);uses++;}catch{/* 已经记过同样的用途 */}}
          linkToKnowledge(s,knowledgeId,c.matchedActivityId,c.evidenceQuote);return;
        }
        const p=createPersonalActivity(s,readActivityFields(f,`a${n}_`),{source:{knowledgeId,quote:c.evidenceQuote,lowTrust:c.lowTrust},parentActivityId:c.type==='variant'?c.matchedActivityId:null,planningUse:f.get(`allow_${n}`)?'allowed':'manual_only'});
        created++;linkToKnowledge(s,knowledgeId,p.id,c.evidenceQuote);
      });});
      if(ok){pendingActivities=null;$('#sheet').close();render();toast(created||uses?`已保存${created?` ${created} 个新动作（在动作库「我的动作」里）`:''}${created&&uses?'，':''}${uses?`${uses} 条用途备注`:''}。`:'已关联到动作库里的动作。');}return;
    }
    if(form.id==='self-check-form'){if(!pendingSelfCheck)throw new Error('自评已失效，请重新开始。');const t=SELF_CHECK_TASKS.find(x=>x.id===form.dataset.task);pendingSelfCheck.answers[t.id]=t.sided?{left:f.get('left'),right:f.get('right'),discomfort:Boolean(f.get('discomfort')),note:f.get('note')}:{both:f.get('both'),discomfort:Boolean(f.get('discomfort')),note:f.get('note')};selfCheckStep(pendingSelfCheck.index+1);return;}
    if(form.id==='self-check-save'){if(!pendingSelfCheck)throw new Error('自评已失效，请重新开始。');const records=selfCheckRecords(pendingSelfCheck.answers,{observedAt:new Date().toLocaleDateString('en-CA'),gentle:Boolean(f.get('gentle'))});if(!records.length){pendingSelfCheck=null;$('#sheet').close();toast('每一项都跳过了，什么也没保存。');return;}ok=commit(s=>s.assessments.push(...records));if(ok){pendingSelfCheck=null;$('#sheet').close();render();toast(`已保存 ${records.length} 项自评。`);}return;}
    if(form.id==='book-form'){
      const created=bookEntry({title:f.get('title'),author:f.get('author'),chapter:f.get('chapter'),excerpt:f.get('excerpt'),note:f.get('note'),topics:f.get('topics')},state);
      const useAI=Boolean(f.get('useAI'))&&aiState.ready&&state.settings?.aiConsent,allow=Boolean(f.get('useInPlanning'));
      ok=commit(s=>{s.captures.push(created.capture);s.knowledge.push(created.knowledge);if(!useAI)saveBookDirect(s,created.capture.id,{topics:created.knowledge.topics,useInPlanning:allow});});
      if(ok){$('#sheet').close();render();if(useAI)analyzeCapture(created.capture.id);else toast('书摘已存入知识库。');}return;
    }
    if(form.id==='search-form'){
      const question=String(f.get('question')||'').trim(),input=buildSearchInput(state,question);$('#sheet').close();toast('正在联网搜索，可能需要十几秒…');
      withBusy(async()=>{const r=await askAI('knowledge-search',input,validateSearch);if(r.status==='empty'){showModal('没有搜到',`<p>${esc(r.reason)}</p><button class="secondary full" data-action="knowledge-search" data-question="${esc(question)}">换个问法</button>`);return;}pendingSearch={question,...r};searchConfirmDialog();});return;
    }
    if(form.id==='search-confirm-form'){
      if(!pendingSearch)throw new Error('搜索结果已失效，请重新搜索。');
      const points=checkEditedPoints(pendingSearch.points.flatMap((p,n)=>f.get(`keep_${n}`)?[{...p,text:String(f.get(`text_${n}`)||'').trim()}]:[]).filter(p=>p.text));
      if(!points.length)throw new Error('至少保留一条要点。');
      const allow=Boolean(f.get('useInPlanning'));
      ok=commit(s=>{const k=saveSearchEntry(s,{question:pendingSearch.question,title:f.get('title'),topics:normalizeTopics(f.get('topics')),points});k.useInPlanning=allow;});
      if(ok){pendingSearch=null;$('#sheet').close();render();toast('已存入知识库，标为「AI 搜索摘要（待核对）」。');}return;
    }
    if(form.id==='knowledge-ask-form'){const q=String(f.get('question')||'').trim();if(!q)throw new Error('先写下你想问的问题。');$('#sheet').close();askKnowledge(q);return;}
    if(form.id==='template-form'){
      const from=form.dataset.from,name=f.get('name');
      const t=from==='session'?templateFromSession(state.sessions.find(x=>x.id===form.dataset.id),name):templateFromPlan(state.draft,name);
      ok=commit(s=>saveTemplate(s,t));if(ok){$('#sheet').close();render();toast(`已收藏「${t.name}」，以后在今天页一键载入。`);}return;
    }
    if(form.id==='template-rename-form'){const id=form.dataset.id,name=f.get('name');ok=commit(s=>renameTemplate(s,id,name));if(ok){$('#sheet').close();render();toast('已重命名。');}return;}
    if(form.id==='method-confirm-form'){
      if(!pendingMethod?.card)throw new Error('归纳草稿已失效，请重新整理。');
      const principles=pendingMethod.card.principles.flatMap((pr,n)=>f.get(`keep_${n}`)?[{text:String(f.get(`text_${n}`)||'').trim(),sources:pr.sources.map(s=>({cardId:s.knowledgeId,quote:s.quote}))}]:[]);
      if(!principles.length)throw new Error('至少保留一条方法。');
      const activityLinks=pendingMethod.card.activityIds.map((id,n)=>f.get(`link_${n}`)?{activityId:id}:null).filter(Boolean);
      const checked=validateCreatorMethod({status:'ok',card:{title:f.get('title'),summary:f.get('summary'),principles,activityLinks,unknowns:String(f.get('unknowns')||'').split(/\n+/)}},{cards:pendingMethod.cards});
      if(!checked.ok)throw new Error(checked.errors.slice(0,2).join('；'));
      if(checked.warnings.length)throw new Error(checked.warnings[0]);
      ok=commit(s=>applyCreatorMethod(s,pendingMethod.creatorKey,pendingMethod.creatorName,checked.card));
      if(ok){pendingMethod=null;$('#sheet').close();render();toast('已保存创作者方法卡。');}return;
    }
    if(form.id==='import-confirm-form'){const result=mergeBackup(state,importDraft,Boolean(f.get('profile')));ok=commit(s=>Object.assign(s,result.state));if(ok){importDraft=null;toast('已合并 '+result.added+' 条记录。');}}
    if(form.id==='manual-log-form'){const {sessions}=logToRecords([{date:f.get('date'),durationMinutes:f.get('minutes')===''?null:Number(f.get('minutes')),effort:null,feedback:f.get('note'),items:[{name:f.get('name').trim(),activityId:null,sets:[],note:f.get('note'),durationMinutes:null,distanceKm:null,confirmed:true}]}],'');ok=commit(s=>{s.sessions.push(...sessions);s.sessions.sort((a,b)=>new Date(a.endedAt)-new Date(b.endedAt));});}
    if(form.id==='set-form'){
      if(state.draft?.pausedForDiscomfort)throw new Error('请先结束这次活动，不继续增加负荷。');
      const number=k=>{const v=f.get(k);return v==null||v===''?null:Number(v);};const set={reps:number('reps'),seconds:number('seconds'),loadKg:number('loadKg'),loadBasis:f.get('loadBasis')||undefined,feeling:f.get('feeling')};validateSets([set]);
      const inSheet=$('#sheet').open;
      const id=form.dataset.item;ok=commit(s=>{const i=s.draft.items.find(i=>i.id===id);Object.assign(i,setSummary([...(i.actualSetDetails||[]),set]));i.status='completed';if(set.feeling==='discomfort'){s.draft.pausedForDiscomfort=true;s.observations.push({id:uid(),text:activityName(i)+'：本组出现不舒服',source:'self_report',createdAt:new Date().toISOString()});}});
      if(ok){if(set.feeling==='discomfort'){rest=null;paintRest();}else startRest(state.draft.items.find(i=>i.id===id));if(inSheet)setDialog(id);render();toast('本组已保存。');}return;
    }
    if(form.id==='ai-clarify-form'){const answer=f.get('answer').trim();if(!answer)throw new Error('写一点回答再继续。');$('#sheet').close();
      if(form.dataset.next==='ability'){abilityIntake({...pendingAbility,rawText:`${pendingAbility.rawText}\n补充：${answer}`});}
      else if(form.dataset.next==='adjust'){const text=aiState.adjustText||'';withBusy(()=>aiAdjust(`${text}\n补充：${answer}`),'adjust');}
      else{aiState.text=[aiState.text.trim(),answer].filter(Boolean).join('\n补充：');withBusy(aiPlan,'plan');}return;}
    if(form.id==='ai-log-form'){const text=f.get('text').trim();if(!text)throw new Error('先粘贴要整理的记录。');const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent='AI 正在整理…';
      withBusy(async()=>{try{const r=await askAI('log',buildLogInput(state,text),x=>validateLog(x,text));if(r.status==='clarify'){showModal('再确认一下',`<p>${esc(r.question)}</p><button class="secondary" data-action="ai-log-retry">回到原文修改</button>`);pendingLog={text,drafts:[],unparsed:[]};return;}pendingLog={text,...r};logConfirmDialog();}finally{button.disabled=false;button.textContent='开始整理';}});return;}
    if(form.id==='ai-log-confirm'){if(state.sessions.some(s=>pendingLog?.text&&s.rawText===pendingLog.text))throw new Error('这段原文已经导入过，请到训练记录中修改，避免重复入账。');const drafts=readLogConfirm(f);if(!drafts.length)throw new Error('至少保留一个动作。');const {sessions,observations}=logToRecords(drafts,pendingLog.text);
      ok=commit(s=>{s.sessions.push(...sessions);s.sessions.sort((a,b)=>new Date(a.endedAt)-new Date(b.endedAt));s.observations.push(...observations);s.observations.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));});
      if(ok){pendingLog=null;$('#sheet').close();navigate('records');toast(`已保存 ${sessions.length} 次训练${observations.length?`和 ${observations.length} 条身体随记`:''}。`);}return;}
    if(form.id==='profile-form'){ok=commit(s=>Object.assign(s.profile,{name:f.get('name').trim(),focus:f.get('focus'),experience:f.get('experience'),ageRange:f.get('ageRange'),preferredSports:f.get('preferredSports').trim(),sleepHours:f.get('sleepHours')===''?null:Number(f.get('sleepHours')),sittingHours:f.get('sittingHours')===''?null:Number(f.get('sittingHours')),goalText:f.get('goalText').trim(),bodyNotes:f.get('bodyNotes').trim(),equipment:f.getAll('equipment'),skipWarmup:Boolean(f.get('skipWarmup')),updatedAt:new Date().toISOString()}));if(ok){request.focus=state.profile.focus;render();toast('身体档案与器械设置已保存。');}return;}
    if(form.id==='use-form'){const act=form.dataset.activity;ok=commit(s=>addManualUse(s,act,{use:f.get('use'),region:f.get('region'),note:f.get('note')}));if(ok){detail(act);toast('已记下这个用途，安排训练时会参考。');}return;}
    if(form.id==='note-form'){ok=commit(s=>updateNote(s,form.dataset.activity,f.get('text').trim()));if(ok){detail(form.dataset.activity);render();toast('心得已保存，下次练习时会显示。');}return;}
    if(form.id==='finish-form'){
      const p=state.draft;if(!p)throw new Error('这次训练已经保存。');const itemFeedback=Object.fromEntries(p.items.map(i=>[i.id,f.get(`item_${i.id}`)||'']));const session=finishSession(p,{actualMinutes:f.get('actualMinutes'),effort:f.get('effort'),feedback:f.get('feedback'),itemFeedback});
      for(const i of session.items){const text=f.get(`sets_${i.id}`);if(i.status==='completed'&&text?.trim()){const parsed=parseSetsText(text);const old=i.actualSetDetails||[];Object.assign(i,setSummary(parsed.map((x,n)=>({...x,loadBasis:old[n]?.loadBasis||'unknown',feeling:old[n]?.feeling||''}))));}}
      ok=commit(s=>{if(s.sessions.some(x=>x.id===session.id))throw new Error('这次训练已经保存。');s.sessions.push(session);if(p.templateId)markTemplateUsed(s,p.templateId);s.draft=null;for(const i of p.items){if(f.get(`pin_${i.id}`)&&itemFeedback[i.id].trim()){const old=s.notes.find(n=>n.activityId===i.activityId)?.text;updateNote(s,i.activityId,[old,itemFeedback[i.id].trim()].filter(Boolean).join('\n'));}}});if(ok){timer=null;paintTimer();rest=null;paintRest();$('#sheet').close();navigate('records');toast('本次训练已记录。');}return;
    }
    if(form.id==='knowledge-form'){
      const url=f.get('url').trim();if(url&&!safeURL(url))throw new Error('请填写 http 或 https 链接。');if(!f.get('title').trim())throw new Error('请填写收藏标题。');
      ok=commit(s=>{const existing=s.knowledge.find(k=>k.id===form.dataset.id);const k={useInPlanning:Boolean(f.get('useInPlanning')),title:f.get('title').trim(),url,text:f.get('text').trim(),sourceTitle:f.get('sourceTitle').trim(),activityIds:f.get('activityId')?[f.get('activityId')]:[],topics:normalizeTopics(f.get('topics')),updatedAt:new Date().toISOString()};if(existing)Object.assign(existing,k);else s.knowledge.push({...k,id:uid(),status:'inbox',sourceKind:'self',createdAt:new Date().toISOString()});});
    }
    if(form.id==='observation-form'){if(!f.get('text').trim())throw new Error('写一点当前感受再保存。');ok=commit(s=>s.observations.push({id:uid(),text:f.get('text').trim(),source:'self_report',createdAt:new Date().toISOString()}));}
    if(form.id==='session-form'){const existing=state.sessions.find(s=>s.id===form.dataset.id);const validated=finishSession({...existing.planSnapshot,items:existing.items},{actualMinutes:f.get('actualMinutes'),effort:f.get('effort'),feedback:f.get('feedback')});const edits=existing.items.map(i=>{const parsed=parseSetsText(f.get('sets_'+i.id));return {id:i.id,feedback:String(f.get('note_'+i.id)||'').trim(),...setSummary(parsed.map((x,n)=>({...x,loadBasis:i.actualSetDetails?.[n]?.loadBasis||'unknown',feeling:i.actualSetDetails?.[n]?.feeling||''})))};});ok=commit(s=>{const x=s.sessions.find(s=>s.id===form.dataset.id);x.editHistory=[...(x.editHistory||[]),{editedAt:new Date().toISOString(),actualMinutes:x.actualMinutes,effort:x.effort,feedback:x.feedback,items:structuredClone(x.items)}];Object.assign(x,{actualMinutes:validated.actualMinutes,effort:validated.effort,feedback:validated.feedback,updatedAt:new Date().toISOString()});for(const edit of edits)Object.assign(x.items.find(i=>i.id===edit.id),edit);});}
    if(ok){$('#sheet').close();render();toast('已保存。');}
  }catch(error){toast(error.message||'暂时无法保存，请检查填写内容。');}
});
setInterval(()=>{if($('#elapsed')&&state.draft?.startedAt)$('#elapsed').textContent=elapsedText(state.draft.startedAt);if(rest){if(Date.now()>=rest.endsAt){rest=null;paintRest();}else{const t=$('#rest .rest-time');if(t)t.textContent=fmtSec(restRemain());}}
  if(timer){if(document.hidden){pauseTimer();return;}if(timer.phase==='ready'){if(Date.now()>=timer.readyEndsAt)timerToWork();else paintTimer();}else if(timer.phase==='paused')paintTimer();else if(timer.workEndsAt&&Date.now()>=timer.workEndsAt)stopTimer(true);else paintTimer();}},1000);
setInterval(()=>{if(anyIngestConfigured(state))for(const c of state.captures||[])if(c.ingestStatus==='queued')pollIngest(c.id);},5000);
render();
paintTimer();
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseTimer();});
window.addEventListener('pagehide',pauseTimer);
probeAI();
if('serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('/sw.js').then(()=>Promise.race([navigator.serviceWorker.ready,new Promise(resolve=>setTimeout(()=>resolve(null),12000))])).then(reg=>new Promise(resolve=>{
    const channel=new MessageChannel(),timeout=setTimeout(()=>resolve(false),5000);
    channel.port1.onmessage=e=>{clearTimeout(timeout);resolve(Boolean(e.data?.ready));};
    if(reg.active)reg.active.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);else{clearTimeout(timeout);resolve(false);}
  })).then(ready=>showOfflineStatus(ready?'离线文件已准备好：本地安排与记录可离线使用，AI 需要联网。':'离线文件尚未准备完整。请联网重新打开页面后再试。'))
    .catch(()=>showOfflineStatus('离线缓存未启用，请保持联网。'));
}
document.addEventListener('toggle',e=>{if(e.target.id==='planning-options')aiState.optionsOpen=e.target.open;},true);
document.addEventListener('change',async e=>{if(e.target.id!=='backup-file')return;try{const file=e.target.files[0];if(!file)return;if(file.size>5_000_000)throw new Error('请使用 5 MB 以内的备份。');importDraft=parseBackup(await file.text());$('#import-preview').innerHTML=`<p>备份含 ${importDraft.sessions.length} 次训练、${importDraft.notes.length} 条心得、${importDraft.assessments.length} 条能力观察。</p><form id="import-confirm-form"><label class="checkbox-line"><input type="checkbox" name="profile">同时用备份中的个人档案更新本机档案</label><button class="primary" type="submit">确认合并</button></form>`;}catch(err){toast(err.message);}});
