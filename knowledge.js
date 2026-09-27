// Personal social captures and knowledge cards. Captures preserve exactly what the user shared;
// AI can only propose a card from capture.shareText and every claim must point back to it.
import { activities } from './catalog.js';

const uid=()=>globalThis.crypto?.randomUUID?.()||`knowledge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clip=(value,max)=>String(value||'').trim().slice(0,max);
const squash=value=>String(value||'').toLowerCase().replace(/[\s，,。.;；:：、!！?？()（）\[\]【】"'“”‘’\-—_~～]/g,'');
const date=now=>now.toISOString();

export const capturePlatforms={
  douyin:'抖音', xiaohongshu:'小红书', bilibili:'B 站', web:'网页', other:'其他来源'
};

export function canonicalCaptureURL(value){
  try{
    const url=new URL(String(value||'').trim());
    if(!['http:','https:'].includes(url.protocol))return '';
    url.hash='';
    for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key))url.searchParams.delete(key);
    return url.href;
  }catch{return '';}
}

export function capturePlatform(url){
  try{
    const host=new URL(url).hostname.toLowerCase();
    if(host.includes('douyin.com'))return 'douyin';
    if(host.includes('xiaohongshu.com')||host.includes('xhslink.com'))return 'xiaohongshu';
    if(host.includes('bilibili.com')||host==='b23.tv')return 'bilibili';
    return 'web';
  }catch{return 'other';}
}

export function captureTitle(capture){
  const author=clip(capture.sourceTitle,80);
  if(author)return author;
  if(capture.platform&&capturePlatforms[capture.platform])return capturePlatforms[capture.platform]+' 分享';
  try{return new URL(capture.rawUrl).hostname;}catch{return '一条分享';}
}

export function captureEntry(input,state,now=new Date()){
  const rawUrl=clip(input.rawUrl,2000);
  const canonicalUrl=canonicalCaptureURL(rawUrl);
  const shareText=clip(input.shareText,8000);
  const userNote=clip(input.userNote,1000);
  const sourceTitle=clip(input.sourceTitle,180);
  if(rawUrl&&!canonicalUrl)throw new Error('请填写 http 或 https 分享链接。');
  if(!rawUrl&&!shareText)throw new Error('请粘贴分享链接或来源文字。');
  const duplicate=(state.captures||[]).find(c=>(canonicalUrl&&(c.canonicalUrl||canonicalCaptureURL(c.rawUrl))===canonicalUrl)||(!rawUrl&&shareText&&squash(c.shareText)===squash(shareText)));
  if(duplicate)throw new Error('这条分享已经在收件箱里了。');
  const id=uid(),knowledgeId=uid(),platform=capturePlatform(rawUrl);
  const capture={id,knowledgeId,capturedAt:date(now),channel:'paste',rawUrl,canonicalUrl,shareText,userNote,sourceTitle,platform,status:shareText?'captured':'needs_content',updatedAt:date(now)};
  const knowledge={id:knowledgeId,status:'inbox',title:captureTitle(capture),text:shareText?'等待 AI 根据你提供的文字整理。':'已保存链接，待补充文案、字幕或截图中的文字。',url:rawUrl,sourceTitle:sourceTitle||capturePlatforms[platform],activityIds:[],useInPlanning:false,captureId:id,claims:[],createdAt:date(now),updatedAt:date(now)};
  return {capture,knowledge};
}

export const captureHasEvidence=capture=>Boolean(clip(capture?.shareText,1));
export const captureForKnowledge=(state,id)=> (state.captures||[]).find(c=>c.knowledgeId===id)||null;

export function buildKnowledgeImportInput(state,capture){
  return {
    source:{platform:capturePlatforms[capture.platform]||capture.platform, url:capture.rawUrl||null, creator:clip(capture.sourceTitle,180)||null, shareText:clip(capture.shareText,8000), userIntent:clip(capture.userNote,1000)||null},
    catalog:activities.map(a=>({id:a.id,name:a.name,aliases:a.aliases.slice(0,5)})),
    existingTitles:(state.knowledge||[]).filter(k=>k.captureId!==capture.id).slice(-40).map(k=>clip(k.title,120)),
    limits:{maxClaims:5,maxActivityLinks:4}
  };
}

const validEvidence=(quote,source)=>{const q=squash(quote),s=squash(source);return Boolean(q)&&s.includes(q);};
const forbidden=/诊断|治疗|治愈|根治|矫正|(?:无力|失衡|紧张|薄弱).{0,8}(?:导致|造成)|(?:导致|造成).{0,12}(?:圆肩|骨盆|疼痛|痛)/;
const activityMatchesEvidence=(activity,quote)=>{
  const evidence=squash(quote);
  return [activity.name,...(activity.aliases||[])].some(name=>{const n=squash(name);return n.length>=2&&evidence.includes(n);});
};

export function validateKnowledgeImport(output,capture){
  const source=clip(capture?.shareText,8000),errors=[];
  if(!source)return {ok:false,errors:['没有可供核对的来源文字；请先补充文案、字幕或截图中的文字。']};
  if(!output||!['ok','clarify'].includes(output.status))return {ok:false,errors:['status 应为 ok / clarify']};
  if(output.status==='clarify')return output.question?.trim?.()?{ok:true,status:'clarify',question:clip(output.question,220)}:{ok:false,errors:['clarify 需要 question']};
  const card=output.card;
  if(!card||typeof card!=='object')return {ok:false,errors:['ok 需要 card']};
  if(!clip(card.title,120))errors.push('card 需要 title');
  const claims=Array.isArray(card.claims)?card.claims:[];
  if(!claims.length||claims.length>5)errors.push('claims 应有 1～5 条');
  const drafts=[];
  claims.slice(0,5).forEach((claim,n)=>{
    const at=`第 ${n+1} 条观点`,text=clip(claim?.text,500),evidenceQuote=clip(claim?.evidenceQuote,500);
    if(!text)errors.push(`${at}需要 text`);
    if(!validEvidence(evidenceQuote,source))errors.push(`${at} evidenceQuote 必须逐字摘自来源文字`);
    if(forbidden.test(text))errors.push(`${at}不能写诊断、治疗或矫正承诺`);
    if(text&&validEvidence(evidenceQuote,source)&&!forbidden.test(text))drafts.push({text,evidenceQuote});
  });
  const links=[];
  const byId=new Map(activities.map(a=>[a.id,a]));
  const rawLinks=Array.isArray(card.activityLinks)?card.activityLinks:[];
  if(rawLinks.length>4)errors.push('activityLinks 最多 4 条');
  const seen=new Set();
  rawLinks.slice(0,4).forEach((link,n)=>{
    const activity=byId.get(link?.activityId),evidenceQuote=clip(link?.evidenceQuote,500);
    if(!activity)errors.push(`第 ${n+1} 个关联动作不在动作库中`);
    else if(seen.has(activity.id))errors.push(`第 ${n+1} 个关联动作重复`);
    else if(!validEvidence(evidenceQuote,source))errors.push(`第 ${n+1} 个关联动作缺少来源引证`);
    else if(!activityMatchesEvidence(activity,evidenceQuote))errors.push(`第 ${n+1} 个关联动作无法由引证中的名称或别名核对`);
    else {seen.add(activity.id);links.push({activityId:activity.id,evidenceQuote});}
  });
  if(errors.length)return {ok:false,errors};
  return {ok:true,status:'ok',card:{title:clip(card.title,120),summary:clip(card.summary,700),claims:drafts,activityLinks:links}};
}

export function applyKnowledgeCard(state,captureId,card,now=new Date()){
  const capture=(state.captures||[]).find(c=>c.id===captureId);
  if(!capture)throw new Error('找不到这条来源，请刷新后重试。');
  const knowledge=(state.knowledge||[]).find(k=>k.id===capture.knowledgeId);
  if(!knowledge)throw new Error('找不到对应的知识卡，请刷新后重试。');
  Object.assign(knowledge,{status:'saved',title:clip(card.title,120),text:clip(card.summary,700)||card.claims.map(c=>c.text).join('；'),url:capture.rawUrl,sourceTitle:clip(capture.sourceTitle,180)||capturePlatforms[capture.platform],activityIds:card.activityLinks.map(x=>x.activityId),claims:card.claims,activityLinks:card.activityLinks,updatedAt:date(now)});
  Object.assign(capture,{status:'card_created',updatedAt:date(now)});
  return knowledge;
}
