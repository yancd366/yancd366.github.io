// Personal social captures and knowledge cards. Captures preserve exactly what the user shared;
// AI can only propose a card from capture.shareText and every claim must point back to it.
import { activities } from './catalog.js';
import { normalizeTopics, entryKind, corpusTopics } from './corpus.js';
import { normalizeUse, replaceKnowledgeUses, dropKnowledgeUses } from './activity-uses.js';

const uid=()=>globalThis.crypto?.randomUUID?.()||`knowledge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clip=(value,max)=>String(value||'').trim().slice(0,max);
const squash=value=>String(value||'').toLowerCase().replace(/[\s，,。.;；:：、!！?？()（）\[\]【】"'“”‘’\-—_~～]/g,'');
const date=now=>now.toISOString();

// 抖音 / 小红书 / B 站「复制链接」得到的是一段文字中间夹一个链接。这里取出链接，去掉平台套话和
// 口令码，并尽量从套话里认出作者（「【某某的作品】」「某某发布了一篇小红书笔记」）。
const SHARE_BOILERPLATE=[
  /复制打开抖音[，,]?\s*看看/g, /复制此链接[，,]?\s*打开(?:抖音|Dou音)搜索[，,]?\s*直接观看视频[！!]?/g, /打开抖音搜索[，,]?\s*直接观看视频[！!]?/g,
  /复制本条信息[，,]?\s*打开【小红书】\s*App\s*查看精彩内容[！!]?/gi, /带上口令[，,]?\s*来【小红书】\s*看笔记全文[~～！!]?/g, /发布了一篇小红书笔记[，,]?\s*快来看吧[！!]?/g,
  /😆\s*[A-Za-z0-9]{6,20}\s*😆/g
];
const junkToken=t=>t.length<=10&&/^[A-Za-z0-9@.:\/_-]+$/.test(t)&&(/[@.:\/]/.test(t)||/^\d{2}\/\d{2}$/.test(t));
function trimJunk(text){
  let t=text.trim().replace(/^\d+\.\d+\s+/,'');
  for(let i=0;i<5;i++){const m=t.match(/(?:^|\s)(\S+)$/);if(!m||!junkToken(m[1]))break;t=t.slice(0,t.length-m[1].length).trim();}
  for(let i=0;i<5;i++){const m=t.match(/^(\S+)(?:\s|$)/);if(!m||!junkToken(m[1]))break;t=t.slice(m[1].length).trim();}
  return t;
}
export function splitSharedText(value){
  const text=String(value||'').trim();
  const rawUrl=text.match(/https?:\/\/[^\s，。；;）)]+/i)?.[0]?.replace(/["'”’!?！？，,。]+$/,'')||'';
  // 没有链接的文字（书摘、自己的想法）原样保留，不做任何清理。
  if(!rawUrl)return {rawUrl:'',shareText:text,creatorHint:'',platform:null};
  let rest=rawUrl?text.replace(rawUrl,' '):text;
  const creatorHint=(rest.match(/【([^【】]{1,40}?)的作品】/)?.[1]||rest.match(/^\s*(?:\d+\.\d+\s+)?([^\s，,。！!]{1,30}?)发布了一篇小红书笔记/)?.[1]||'').trim();
  rest=rest.replace(/【[^【】]{1,40}?的作品】/,' ');
  if(rest.match(/^\s*(?:\d+\.\d+\s+)?[^\s，,。！!]{1,30}?发布了一篇小红书笔记/))rest=rest.replace(/^\s*(?:\d+\.\d+\s+)?[^\s，,。！!]{1,30}?(?=发布了一篇小红书笔记)/,' ');
  for(const re of SHARE_BOILERPLATE)rest=rest.replace(re,' ');
  const shareText=trimJunk(rest.replace(/[ \t]{2,}/g,' ').replace(/\s*\n\s*/g,'\n')).replace(/^[\s，,。；;！!]+|[\s，,；;]+$/g,'');
  return {rawUrl,shareText,creatorHint,platform:rawUrl?capturePlatform(rawUrl):null};
}

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
    const matches=s=>host===s||host.endsWith('.'+s);
    if(matches('douyin.com')||matches('iesdouyin.com'))return 'douyin';
    if(matches('xiaohongshu.com')||matches('xhslink.com')||matches('xhslink.cn'))return 'xiaohongshu';
    if(matches('bilibili.com')||host==='b23.tv')return 'bilibili';
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
  const shared=splitSharedText(input.shareText);
  const rawUrl=clip(input.rawUrl||shared.rawUrl,2000);
  const canonicalUrl=canonicalCaptureURL(rawUrl);
  const shareText=clip(input.rawUrl?input.shareText:shared.shareText,8000);
  const userNote=clip(input.userNote,1000);
  const sourceTitle=clip(input.sourceTitle,180)||clip(shared.creatorHint,180);
  if(rawUrl&&!canonicalUrl)throw new Error('请填写 http 或 https 分享链接。');
  if(!rawUrl&&!shareText)throw new Error('请粘贴分享链接或来源文字。');
  const duplicate=(state.captures||[]).find(c=>(canonicalUrl&&(c.canonicalUrl||canonicalCaptureURL(c.rawUrl))===canonicalUrl)||(!rawUrl&&shareText&&squash(c.shareText)===squash(shareText)));
  if(duplicate)throw new Error('这条分享已经在收件箱里了。');
  const id=uid(),knowledgeId=uid(),platform=capturePlatform(rawUrl);
  const capture={id,knowledgeId,capturedAt:date(now),channel:'paste',rawUrl,canonicalUrl,shareText,userNote,sourceTitle,platform,status:shareText?'captured':'needs_content',updatedAt:date(now)};
  const knowledge={id:knowledgeId,status:'inbox',title:captureTitle(capture),text:shareText?'等待 AI 根据你提供的文字整理。':'已保存链接，待补充文案、字幕或截图中的文字。',url:rawUrl,sourceTitle:sourceTitle||capturePlatforms[platform],activityIds:[],useInPlanning:false,captureId:id,claims:[],createdAt:date(now),updatedAt:date(now)};
  return {capture,knowledge};
}

export const captureHasEvidence=capture=>Boolean(clip(capture?.shareText,1)||clip(capture?.transcript?.text,1)||(Array.isArray(capture?.videoEvidence)&&capture.videoEvidence.some(x=>clip(x?.text,1))));
export const captureForKnowledge=(state,id)=> (state.captures||[]).find(c=>c.knowledgeId===id)||null;

export function captureEvidence(capture){
  const pieces=[];
  if(capture?.shareText?.trim())pieces.push({id:'user-text',kind:'user_text',text:clip(capture.shareText,8000)});
  const transcript=capture?.transcript;
  if(transcript?.text?.trim()){
    const segments=Array.isArray(transcript.segments)?transcript.segments.filter(s=>s?.text?.trim()):[];
    if(segments.length)segments.slice(0,150).forEach((s,n)=>pieces.push({id:`asr:${n}`,kind:'asr_transcript',text:clip(s.text,1000),startMs:Number(s.startMs)||0,endMs:s.endMs==null?null:Number(s.endMs)}));
    else pieces.push({id:'asr:full',kind:'asr_transcript',text:clip(transcript.text,30000),startMs:null,endMs:null});
  }
  const visualKinds=new Set(['asr_transcript','keyframe_description','frame_ocr']);
  if(Array.isArray(capture?.videoEvidence))capture.videoEvidence.slice(0,80).forEach((item,n)=>{
    const kind=String(item?.kind||'');
    const text=clip(item?.text,1000),startMs=Number(item?.startMs),endMs=Number(item?.endMs);
    if(visualKinds.has(kind)&&text&&Number.isFinite(startMs)&&startMs>=0&&Number.isFinite(endMs)&&endMs>=startMs)pieces.push({id:`vision:${n}`,kind,text,startMs:Math.round(startMs),endMs:Math.round(endMs),evidenceSource:item?.evidenceSource==='workflow_model'?'workflow_model':'parser'});
  });
  return pieces;
}

export function buildKnowledgeImportInput(state,capture){
  return {
    ...(capture.book?{book:capture.book}:{}),
    source:{platform:capture.book?'书':capturePlatforms[capture.platform]||capture.platform, url:capture.rawUrl||null, creator:clip(capture.resolvedSource?.creatorName||capture.sourceTitle,180)||null, shareText:clip(capture.shareText,8000), userIntent:clip(capture.userNote,1000)||null, metadata:{title:clip(capture.resolvedSource?.title,180)||null,description:clip(capture.resolvedSource?.description,2000)||null}},
    evidence:captureEvidence(capture),
    catalog:activities.map(a=>({id:a.id,name:a.name,aliases:a.aliases.slice(0,5)})),
    existingTitles:(state.knowledge||[]).filter(k=>k.captureId!==capture.id).slice(-40).map(k=>clip(k.title,120)),
    existingTopics:corpusTopics(state).slice(0,40).map(x=>x.topic),
    limits:{maxClaims:5,maxActivityLinks:4,maxTopics:3}
  };
}

const validEvidence=(quote,source)=>{const q=squash(quote),s=squash(source);return Boolean(q)&&s.includes(q);};
const forbidden=/诊断|治疗|治愈|根治|矫正|(?:无力|失衡|紧张|薄弱).{0,8}(?:导致|造成)|(?:导致|造成).{0,12}(?:圆肩|骨盆|疼痛|痛)/;
const activityMatchesEvidence=(activity,quote)=>{
  const evidence=squash(quote);
  return [activity.name,...(activity.aliases||[])].some(name=>{const n=squash(name);return n.length>=2&&evidence.includes(n);});
};

export function validateKnowledgeImport(output,capture){
  const pieces=captureEvidence(capture),errors=[];
  if(!pieces.length)return {ok:false,errors:['没有可供核对的来源文字、逐字稿或画面依据。']};
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
    const piece=claim?.evidenceId?pieces.find(p=>p.id===claim.evidenceId&&validEvidence(evidenceQuote,p.text)):pieces.find(p=>validEvidence(evidenceQuote,p.text));
    if(!text)errors.push(`${at}需要 text`);
    if(!piece)errors.push(`${at} evidenceQuote 必须逐字摘自对应来源文字`);
    if(forbidden.test(text))errors.push(`${at}不能写诊断、治疗或矫正承诺`);
    if(text&&piece&&!forbidden.test(text))drafts.push({text,evidenceQuote,evidenceId:piece.id,evidenceKind:piece.kind,evidenceSource:piece.evidenceSource||'user',...(piece.startMs!=null?{startMs:piece.startMs,endMs:piece.endMs}:{})});
  });
  // 关联动作是可选附加信息：核对不上的只略去并提示，不让整张卡失败；观点的逐字核对仍然严格。
  const links=[],warnings=[];
  const byId=new Map(activities.map(a=>[a.id,a]));
  const rawLinks=Array.isArray(card.activityLinks)?card.activityLinks:[];
  if(rawLinks.length>4)warnings.push(`AI 给了 ${rawLinks.length} 个关联动作，只保留前 4 个。`);
  const seen=new Set();
  rawLinks.slice(0,4).forEach((link,n)=>{
    const activity=byId.get(link?.activityId),evidenceQuote=clip(link?.evidenceQuote,500);
    const piece=link?.evidenceId?pieces.find(p=>p.id===link.evidenceId&&validEvidence(evidenceQuote,p.text)):pieces.find(p=>validEvidence(evidenceQuote,p.text));
    const skip=reason=>warnings.push(`已略去第 ${n+1} 个关联动作${activity?`「${activity.name}」`:''}：${reason}。`);
    if(!activity)skip('不在动作库中');
    else if(seen.has(activity.id))skip('重复');
    else if(!piece)skip('缺少原文引证');
    else if(!activityMatchesEvidence(activity,evidenceQuote))skip('原文里找不到这个动作的名称或别名');
    else {seen.add(activity.id);links.push({activityId:activity.id,...(normalizeUse(link)||{}),evidenceQuote,evidenceId:piece.id,evidenceKind:piece.kind,evidenceSource:piece.evidenceSource||'user',...(piece.startMs!=null?{startMs:piece.startMs,endMs:piece.endMs}:{})});}
  });
  if(errors.length)return {ok:false,errors};
  return {ok:true,status:'ok',card:{title:clip(card.title,120),summary:clip(card.summary,700),topics:normalizeTopics(card.topics),claims:drafts,activityLinks:links},warnings};
}

export function deleteKnowledge(state,knowledgeId){
  const knowledge=(state.knowledge||[]).find(k=>k.id===knowledgeId);
  if(!knowledge)throw new Error('找不到这条知识。');
  state.knowledge=state.knowledge.filter(k=>k.id!==knowledgeId);
  state.captures=(state.captures||[]).filter(c=>c.knowledgeId!==knowledgeId&&c.id!==knowledge.captureId);
  dropKnowledgeUses(state,knowledgeId);
  return true;
}

export function applyKnowledgeCard(state,captureId,card,now=new Date()){
  const capture=(state.captures||[]).find(c=>c.id===captureId);
  if(!capture)throw new Error('找不到这条来源，请刷新后重试。');
  const knowledge=(state.knowledge||[]).find(k=>k.id===capture.knowledgeId);
  if(!knowledge)throw new Error('找不到对应的知识卡，请刷新后重试。');
  Object.assign(knowledge,{status:'saved',title:clip(card.title,120),text:clip(card.summary,700)||card.claims.map(c=>c.text).join('；'),url:capture.rawUrl,sourceTitle:clip(capture.sourceTitle,180)||capturePlatforms[capture.platform],activityIds:card.activityLinks.map(x=>x.activityId),claims:card.claims,activityLinks:card.activityLinks,topics:normalizeTopics(card.topics),sourceKind:entryKind({},capture),updatedAt:date(now)});
  Object.assign(capture,{status:'card_created',cardDraft:null,updatedAt:date(now)});
  replaceKnowledgeUses(state,knowledge,now);
  return knowledge;
}
