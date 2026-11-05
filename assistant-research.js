// Pure source selection/intake contracts. Search metadata is never teaching evidence.
import {validateTeachingSource} from './assistant-source.js';
import {buildActivityIntakeInput,validateActivityIntake} from './personal-activities.js';
import {splitSharedText} from './knowledge.js';
const clip=(s,n)=>String(s??'').trim().slice(0,n);
export function buildTeachingSelection(source,question){return {source:validateTeachingSource(source),question:clip(question,500),limits:{maxPassages:3,maxCharacters:3800}};}
export function validateTeachingSelection(output,input){
 if(output?.status==='empty')return {ok:true,status:'empty',reason:clip(output.reason,300)||'这页没有找到明确的动作做法。'};
 const raw=output?.passages;if(output?.status!=='ok'||!Array.isArray(raw)||!raw.length||raw.length>3)return {ok:false,errors:['输出status=ok并给1～3段passages，或status=empty']};
 const passages=raw.map(s=>String(s||'').trim());if(passages.some(s=>s.length<12||!input.source.text.includes(s))||passages.join('\n\n').length>3800)return {ok:false,errors:['passages必须逐字复制source.text里的连续段落，总计不超过3800字符，不可改写或翻译']};
 return {ok:true,status:'ok',passages};
}
export function teachingIntake(state,source,selection,question){
 const checked=validateTeachingSelection({status:'ok',passages:selection.passages},buildTeachingSelection(source,question));if(!checked.ok)throw Error('教学引文与实际读取内容不一致。');
 const userText=checked.passages.join('\n\n'),web={url:source.url,title:source.title.slice(0,120),site:new URL(source.url).hostname,question:clip(question,300),discoveryText:'',userText,mode:'source_quote',verified:false,retrievedByServer:true,readAt:source.readAt,evidenceId:source.evidenceId};
 const input=buildActivityIntakeInput(state,{text:userText});input.evidence=checked.passages.map((text,i)=>({id:source.evidenceId+':'+i,kind:'web_text',text,evidenceSource:'parser',sourceLabel:'服务器读取的公开教学，待你核对'}));input.userText=clip(question,500);input.source={platform:'网页教学',url:web.url,title:web.title,creator:null};return {input,web};
}
export function assistantOnlinePermission(text,previous=false){if(/(?:不要|别|不用|不想)(?:再)?(?:联网|上网|搜索)/.test(text))return false;return previous||/搜索|网上|联网|找教学|查做法/.test(text);}
export function validateResearchIntake(output,input){const r=validateActivityIntake(output,input);if(!r.ok||r.status!=='ok')return r;const errors=[];for(const c of r.candidates){if(!input.evidence.some(e=>e.text.includes(c.evidenceQuote)))errors.push('动作引证须逐字复制连续原文，不得改写或拼接');if(c.type!=='existing'&&!c.draft?.steps?.length)errors.push('新动作/变式缺少明确做法，请补充教学或返回clarify');}return errors.length?{ok:false,errors}:r;}
export function assistantProvidedLink(text){const split=splitSharedText(text);if(!split.rawUrl)return null;if(['douyin','xiaohongshu','bilibili'].includes(split.platform))return {intent:'media_source',sourceUrl:split.rawUrl,query:clip(text,2000),text:'这条分享可使用现有视频/图文解析。确认收藏后开始解析，再核对提取的动作。'};return {intent:'research_action',providedLink:true,query:clip(text,300),text:'这是你提供的网页链接，可以先读取教学，再整理动作。',searchPoints:[{text:'你提供的网页，尚未读取正文。',sources:[{title:new URL(split.rawUrl).hostname,url:split.rawUrl,site:new URL(split.rawUrl).hostname}]}]};}
