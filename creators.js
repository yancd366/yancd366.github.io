// 创作者方法卡：把用户已确认的、同一位创作者的多张知识卡，归纳成一张可回顾的「方法卡」。
// 与 knowledge.js 同一条纪律：AI 只能复述已确认卡片里的内容，每条原则都要逐字指回来源卡；
// 用户逐条确认后才写入 state.creatorProfiles。本文件是纯函数，不发网络请求。
import { activities, activityById } from './catalog.js';

const uid=()=>globalThis.crypto?.randomUUID?.()||`creator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clip=(value,max)=>String(value||'').trim().slice(0,max);
const squash=value=>String(value||'').toLowerCase().replace(/[\s，,。.;；:：、!！?？()（）\[\]【】"'“”‘’\-—_~～]/g,'');
const date=now=>now.toISOString();
const known={has:id=>Boolean(activityById(id)),get:activityById};
// 与 knowledge.js 保持一致：方法卡不写医学承诺、不写因果结论。
const forbidden=/诊断|治疗|治愈|根治|矫正|(?:无力|失衡|紧张|薄弱).{0,8}(?:导致|造成)|(?:导致|造成).{0,12}(?:圆肩|骨盆|疼痛|痛)/;
// 平台占位名（抖音 / 小红书…）不是创作者，不能作为归组依据。
const PLATFORM_LABELS=new Set(['抖音','小红书','B 站','网页','其他来源','AI 搜索']);
const isPlatformLabel=name=>{const s=clip(name,80);return !s||PLATFORM_LABELS.has(s)||/分享$/.test(s);};

// 一张已确认知识卡属于哪位创作者：优先用捕获里解析出的创作者名，其次用知识卡的作者标题；
// 平台占位名视为「没有创作者」（返回空串，不参与归组）。
export function creatorNameOf(knowledge,capture){
  const resolved=clip(capture?.resolvedSource?.creatorName,180);
  if(resolved&&!isPlatformLabel(resolved))return resolved;
  const title=clip(knowledge?.sourceTitle,180);
  return isPlatformLabel(title)?'':title;
}
export const creatorKeyOf=name=>squash(name);

const savedCards=state=>(state.knowledge||[]).filter(k=>k.status==='saved');
const captureById=state=>{const m=new Map();for(const c of state.captures||[])m.set(c.id,c);return m;};

// 把已确认知识卡按创作者归组。只有能识别出创作者的卡才进组；平台占位名的卡被跳过。
// 每组标注是否已有方法卡、卡片数是否够归纳（≥2 张才建议整理）。
export function creatorGroups(state){
  const caps=captureById(state),groups=new Map();
  for(const k of savedCards(state)){
    const name=creatorNameOf(k,caps.get(k.captureId));
    if(!name)continue;
    const key=creatorKeyOf(name);
    const group=groups.get(key)||{creatorKey:key,creatorName:name,cards:[]};
    group.cards.push(k);
    groups.set(key,group);
  }
  const profiles=new Map((state.creatorProfiles||[]).map(p=>[p.creatorKey,p]));
  return [...groups.values()].map(g=>{
    const profile=profiles.get(g.creatorKey)||null;
    return {...g,cardCount:g.cards.length,canSynthesize:g.cards.length>=2,methodCardId:profile?.id||null,methodUpdatedAt:profile?.updatedAt||null};
  }).sort((a,b)=>b.cardCount-a.cardCount||a.creatorName.localeCompare(b.creatorName));
}

// 取某位创作者的已确认知识卡（用于归纳）。找不到任何卡时抛错。
export function creatorCards(state,creatorKey){
  const caps=captureById(state);
  const cards=savedCards(state).filter(k=>creatorKeyOf(creatorNameOf(k,caps.get(k.captureId)))===creatorKey);
  if(!cards.length)throw new Error('这位创作者还没有已确认的知识卡。');
  return cards;
}

export const findMethodCard=(state,creatorKey)=>(state.creatorProfiles||[]).find(p=>p.creatorKey===creatorKey)||null;

// AI 输入：只送这位创作者已确认卡片里的观点（text + 逐字引证），供模型归纳。
export function buildCreatorMethodInput(state,creatorKey){
  const cards=creatorCards(state,creatorKey);
  const caps=captureById(state);
  const creatorName=creatorNameOf(cards[0],caps.get(cards[0].captureId));
  const existing=findMethodCard(state,creatorKey);
  return {
    creator:creatorName,
    today:date(new Date()).slice(0,10),
    cards:cards.map(k=>({
      id:k.id,title:clip(k.title,120),summary:clip(k.text,700),
      claims:(k.claims||[]).map(c=>({text:clip(c.text,500),quote:clip(c.evidenceQuote,500)})),
      activityIds:(k.activityIds||[]).filter(id=>known.has(id))
    })),
    existing:existing?{title:clip(existing.title,120),principles:(existing.principles||[]).map(p=>clip(p.text,300))}:null,
    catalog:activities.map(a=>({id:a.id,name:a.name,aliases:a.aliases.slice(0,5)})),
    limits:{maxPrinciples:6,maxSourcesPerPrinciple:4,maxActivityLinks:6}
  };
}

// 一条引证要逐字来自某张卡的观点文字或引证（squash 后子串匹配）。
const cardHaystack=card=>squash((card.claims||[]).flatMap(c=>[c.text,c.quote]).concat([card.title,card.summary]).join(' '));
const validQuote=(quote,haystack)=>{const q=squash(quote);return Boolean(q)&&haystack.includes(q);};

export function validateCreatorMethod(output,{cards}){
  if(!Array.isArray(cards)||!cards.length)return {ok:false,errors:['没有可供归纳的知识卡。']};
  if(!output||!['ok','clarify'].includes(output.status))return {ok:false,errors:['status 应为 ok / clarify']};
  if(output.status==='clarify')return output.question?.trim?.()?{ok:true,status:'clarify',question:clip(output.question,220)}:{ok:false,errors:['clarify 需要 question']};
  const card=output.card;
  if(!card||typeof card!=='object')return {ok:false,errors:['ok 需要 card']};
  const errors=[];
  if(!clip(card.title,120))errors.push('card 需要 title');
  const haystacks=new Map(cards.map(c=>[c.id,cardHaystack(c)]));
  const cardIds=new Set(cards.map(c=>c.id));
  const cardActivityIds=new Set(cards.flatMap(c=>c.activityIds||[]));
  const principles=Array.isArray(card.principles)?card.principles:[];
  if(!principles.length||principles.length>6)errors.push('principles 应有 1～6 条');
  const drafts=[];
  principles.slice(0,6).forEach((p,n)=>{
    const at=`第 ${n+1} 条方法`,text=clip(p?.text,400);
    if(!text)errors.push(`${at}需要 text`);
    if(forbidden.test(text))errors.push(`${at}不能写诊断、治疗或因果结论`);
    const rawSources=Array.isArray(p?.sources)?p.sources.slice(0,4):[];
    const sources=[];
    rawSources.forEach(s=>{
      const cardId=s?.cardId,quote=clip(s?.evidenceQuote||s?.quote,500);
      if(cardId&&cardIds.has(cardId)&&validQuote(quote,haystacks.get(cardId)))sources.push({knowledgeId:cardId,quote});
    });
    if(!sources.length)errors.push(`${at}的来源必须逐字摘自对应知识卡`);
    if(text&&sources.length&&!forbidden.test(text))drafts.push({text,sources});
  });
  // 关联动作是可选附加信息：不合规的只略去并提示，不让整张方法卡失败；方法的逐字来源仍然严格。
  const links=[],seen=new Set(),warnings=[];
  const rawLinks=Array.isArray(card.activityLinks)?card.activityLinks:[];
  if(rawLinks.length>6)warnings.push(`AI 给了 ${rawLinks.length} 个关联动作，只保留前 6 个。`);
  rawLinks.slice(0,6).forEach((link,n)=>{
    const activityId=link?.activityId,name=known.get(activityId)?.name;
    const skip=reason=>warnings.push(`已略去第 ${n+1} 个关联动作${name?`「${name}」`:''}：${reason}。`);
    if(!name)skip('不在动作库中');
    else if(!cardActivityIds.has(activityId))skip('没有出现在这位创作者的知识卡里');
    else if(seen.has(activityId))skip('重复');
    else {seen.add(activityId);links.push(activityId);}
  });
  if(errors.length)return {ok:false,errors};
  const unknowns=(Array.isArray(card.unknowns)?card.unknowns:[]).map(u=>clip(u,120)).filter(u=>u&&!forbidden.test(u)).slice(0,4);
  return {ok:true,status:'ok',card:{title:clip(card.title,120),summary:clip(card.summary,700),principles:drafts,activityIds:links,unknowns},warnings};
}

// 用户确认后写入 / 更新这位创作者的方法卡。同一创作者只保留一张，重整时保留原有的「用于安排」开关。
export function applyCreatorMethod(state,creatorKey,creatorName,card,now=new Date()){
  if(!creatorKey)throw new Error('缺少创作者标识。');
  if(!clip(card?.title,1))throw new Error('方法卡需要标题。');
  if(!Array.isArray(card.principles)||!card.principles.length)throw new Error('方法卡至少需要一条方法。');
  const sourceKnowledgeIds=[...new Set(card.principles.flatMap(p=>(p.sources||[]).map(s=>s.knowledgeId)))];
  state.creatorProfiles ||= [];
  const existing=findMethodCard(state,creatorKey);
  const base={creatorKey,creatorName:clip(creatorName,180),title:clip(card.title,120),summary:clip(card.summary,700),
    principles:card.principles.map(p=>({text:clip(p.text,400),sources:(p.sources||[]).map(s=>({knowledgeId:s.knowledgeId,quote:clip(s.quote,500)}))})),
    activityIds:(card.activityIds||[]).filter(id=>known.has(id)),unknowns:(card.unknowns||[]).map(u=>clip(u,120)).filter(Boolean).slice(0,4),sourceKnowledgeIds,updatedAt:date(now)};
  if(existing){Object.assign(existing,base);return existing;}
  const created={id:uid(),status:'saved',allowedInPlanning:false,createdAt:date(now),...base};
  state.creatorProfiles.push(created);
  return created;
}

export function deleteMethodCard(state,id){
  const before=(state.creatorProfiles||[]).length;
  state.creatorProfiles=(state.creatorProfiles||[]).filter(p=>p.id!==id);
  if(state.creatorProfiles.length===before)throw new Error('找不到这张方法卡。');
  return true;
}

// 用户显式打开「用于安排」的开关后，方法卡才会进入计划上下文（计划接入是后续一棒）。
export function setMethodPlanning(state,id,allowed){
  const card=(state.creatorProfiles||[]).find(p=>p.id===id);
  if(!card)throw new Error('找不到这张方法卡。');
  card.allowedInPlanning=Boolean(allowed);
  return card;
}
// 供计划上下文取用：已保存且用户允许用于安排的方法卡。
export const methodCardsForPlanning=state=>(state.creatorProfiles||[]).filter(p=>p.status==='saved'&&p.allowedInPlanning===true);
