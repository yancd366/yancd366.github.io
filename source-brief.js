import {esc} from './ui.js';
export const BRIEF_TYPES={training_idea:'知识与经验',movement_demo:'动作教学',training_plan:'训练方案',follow_along:'整套跟练',mixed:'混合内容',other:'其他',unclear:'尚不明确'};
export const FUTURE_USES={read:'阅读知识',movement:'查阅动作',plan:'参考训练安排',follow:'打开原内容跟练'};
export const AUTHOR_KINDS={effect:'作者声称的效果',instruction:'做法与提示',dose:'练习量与频率',condition:'适用条件',principle:'观点与经验'};
const txt=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
const refs=(items,pieces)=>Array.isArray(items)?items.slice(0,6).flatMap(r=>{const quote=txt(r?.evidenceQuote,500),piece=pieces.find(p=>p.id===r?.evidenceId&&quote&&p.text.includes(quote));return piece?[{evidenceId:piece.id,evidenceQuote:quote,evidenceKind:piece.kind,evidenceSource:piece.evidenceSource||'user',...(piece.startMs!=null?{startMs:piece.startMs,endMs:piece.endMs}:{}),...(piece.imageIndex!=null?{imageIndex:piece.imageIndex}:{})}]:[]}):[];
export function evidenceSignature(pieces){const text=JSON.stringify(pieces.map(p=>[p.id,p.kind,p.text,p.startMs,p.endMs]));let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return `${text.length}:${hash>>>0}`;}
export function buildSourceBriefInput(input){return {source:input.source,evidence:input.evidence,types:BRIEF_TYPES,futureUses:FUTURE_USES,existingTopics:input.existingTopics||[],limits:{summaryCharacters:160,maxTags:5}};}
const DETAIL_FOCUS={training_idea:'优先提炼观点、作者说法与证据；没有动作不生成动作清单。',movement_demo:'优先整理完整动作做法和来源提示；左右侧、准备和回位不拆成新的独立观点。',training_plan:'优先整理明确的目标、频率、训练日、顺序和剂量；不是个人训练处方。',follow_along:'优先总结训练范围与流程，保留原视频跟练用途；不强制逐个提取动作。',mixed:'分别保留知识观点与来源方案，动作提取留作用户按需操作。'};
export function buildSourceDetailInput(input,brief){return {...input,...(brief?{sourceBrief:brief}:{}),organizationFocus:DETAIL_FOCUS[brief?.primaryType]||'独立读取原材料，判断内容类型后整理，不为凑字段编造。'};}
export function validateSourceBrief(output,pieces){
 if(output?.status==='clarify')return txt(output.question,220)?{ok:true,status:'clarify',question:txt(output.question,220)}:{ok:false,errors:['请说明缺少哪些来源材料。']};
 const b=output?.brief;
 if(output?.status!=='ok'||!b||!txt(b.title,60)||!txt(b.summary,300)||!Object.hasOwn(BRIEF_TYPES,b.primaryType))return {ok:false,errors:['简介需要标题、简短摘要和有效内容类型。']};
 const references=refs(b.references,pieces);
 if(!references.length||references.length!==(b.references||[]).length)return {ok:false,errors:['简介需要逐字对应现有材料的来源依据。']};
 if(/诊断|治愈|根治|治疗|矫正/.test(b.summary))return {ok:false,errors:['简介不能转述为医学承诺；作者原话可单独放作者说法。']};
 const list=(x,max,n)=>Array.isArray(x)?[...new Set(x.filter(v=>typeof v==='string').map(v=>txt(v,n)).filter(Boolean))].slice(0,max):[];
 return {ok:true,status:'ok',brief:{version:1,title:txt(b.title,60),summary:txt(b.summary,300),primaryType:b.primaryType,secondaryTypes:list(b.secondaryTypes,2,30).filter(v=>Object.hasOwn(BRIEF_TYPES,v)&&v!==b.primaryType),tags:list(b.tags,5,16),bodyRegions:list(b.bodyRegions,5,16),futureUses:list(b.futureUses,4,20).filter(v=>Object.hasOwn(FUTURE_USES,v)),uncertainties:list(b.uncertainties,3,160),references,evidenceSignature:evidenceSignature(pieces)}};
}
export function validateAuthorStatements(items,pieces){
 if(items==null)return {statements:[],warnings:[]};
 const statements=[],warnings=[];
 if(!Array.isArray(items))return {statements,warnings:['作者说法应为数组，已略去。']};
 if(items.length>8)warnings.push('作者说法最多保留8条。');
 for(const [n,item] of items.slice(0,8).entries()){
  const evidence=refs([item],pieces)[0],kind=String(item?.kind||'');
  if(!Object.hasOwn(AUTHOR_KINDS,kind)||!txt(item?.statement,300)||!evidence||!['user_text','asr_transcript','frame_ocr'].includes(evidence.evidenceKind)||evidence.evidenceSource==='workflow_model'){
   warnings.push(`已略去第${n+1}条作者说法：缺少可逐字核对的正文、口播或字幕；AI画面观察不能代替作者表述。`);continue;
  }
  const statement={kind,subject:txt(item.subject,80),statement:txt(item.statement,300),conditions:txt(item.conditions,200),...evidence,attribution:'author',verified:false};
  if(!statements.some(s=>s.kind===kind&&s.statement===statement.statement))statements.push(statement);
 }
 return {statements,warnings};
}
export function validateSourceExtrasShape(item){
 const b=item.sourceBrief;
 if(b!=null){
  if(b.version!==1||!Object.hasOwn(BRIEF_TYPES,b.primaryType)||typeof b.title!=='string'||b.title.length>60||typeof b.summary!=='string'||b.summary.length>300)throw Error('内容简介格式无效。');
  for(const [key,max,len] of [['tags',5,16],['bodyRegions',5,16],['uncertainties',3,160],['secondaryTypes',2,30],['futureUses',4,20]])if(!Array.isArray(b[key])||b[key].length>max||b[key].some(s=>typeof s!=='string'||s.length>len))throw Error('简介标签格式无效。');
  if(b.secondaryTypes.some(x=>!Object.hasOwn(BRIEF_TYPES,x))||b.futureUses.some(x=>!Object.hasOwn(FUTURE_USES,x)))throw Error('简介分类格式无效。');
  if(!Array.isArray(b.references)||!b.references.length||b.references.length>6)throw Error('简介缺少来源依据。');
 }
 if(item.authorStatements!=null&&(!Array.isArray(item.authorStatements)||item.authorStatements.length>8))throw Error('作者说法格式无效。');
 for(const x of [...(b?.references||[]),...(item.authorStatements||[])]){
  if(typeof x.evidenceId!=='string'||typeof x.evidenceQuote!=='string'||!x.evidenceQuote||x.evidenceQuote.length>500)throw Error('整理内容缺少来源记录。');
  if(x.attribution&&(!Object.hasOwn(AUTHOR_KINDS,x.kind)||x.attribution!=='author'||x.verified!==false))throw Error('作者说法归属无效。');
 }
 for(const x of item.authorStatements||[]){
  if(!Object.hasOwn(AUTHOR_KINDS,x.kind)||x.attribution!=='author'||x.verified!==false||!x.statement?.trim())throw Error('作者说法归属无效。');
  for(const [key,max] of [['subject',80],['statement',300],['conditions',200]])if(typeof x[key]!=='string'||x[key].length>max)throw Error('作者说法文字格式无效。');
 }
}
const evidenceLabel=r=>r.evidenceSource==='workflow_model'?'AI画面观察 · 待核对':r.evidenceSource==='ocr_model'?'AI识别字幕 · 待核对':r.evidenceKind==='asr_transcript'?'语音转写 · 待核对':'来源文字';
export function sourceBriefHTML(b,{draft=true,durationMs=null}={}){
 if(!b)return '';
 return `<section class="source-brief"><span class="small muted">内容简介 · ${draft?'AI整理，待核对':'已核对保存'}</span><h2>${esc(b.title)}</h2>${Number.isFinite(durationMs)&&durationMs>0?`<p class="small muted">原视频时长：${Math.floor(durationMs/60000)}分${Math.round(durationMs/1000)%60}秒</p>`:''}<p>${esc(b.summary)}</p><div class="tags"><span class="badge">${esc(BRIEF_TYPES[b.primaryType])}</span>${b.tags.map(t=>`<span class="badge">${esc(t)}</span>`).join('')}</div>${b.futureUses.length?`<p class="small muted">以后可用于：${b.futureUses.map(x=>esc(FUTURE_USES[x])).join('、')}（不等于已允许自动推荐）</p>`:''}${b.uncertainties.length?`<p class="small muted">待确认：${b.uncertainties.map(esc).join('；')}</p>`:''}<details><summary>查看简介依据</summary>${b.references.map(r=>`<p class="small muted">${esc(evidenceLabel(r))}</p><blockquote>${esc(r.evidenceQuote)}</blockquote>`).join('')}</details></section>`;
}
export function authorStatementsHTML(items){
 if(!items?.length)return '';
 return `<section class="author-statements"><h2>作者说法</h2><p class="small muted">AI统一整理的来源主张，不代表已证实或适合你；个人实践请另写反馈。</p>${items.map(x=>`<article class="author-statement"><span class="badge">${esc(AUTHOR_KINDS[x.kind])}</span>${x.subject?`<h3>${esc(x.subject)}</h3>`:''}<p>${esc(x.statement)}</p>${x.conditions?`<p class="small">原文条件：${esc(x.conditions)}</p>`:''}<details><summary>查看原文依据 · ${esc(evidenceLabel(x))}</summary><blockquote>${esc(x.evidenceQuote)}</blockquote></details></article>`).join('')}</section>`;
}
