// Search is discovery, not source text. Only user-supplied passages feed the strict intake validator.
import {buildSearchInput} from './sources.js';
import {buildActivityIntakeInput} from './personal-activities.js';
import {uid,safeURL} from './domain.js';
const clip=(x,n)=>String(x??'').trim().slice(0,n);
export function buildActionDiscoveryInput(state,question){
 const q=clip(question,300);if(!q)throw Error('请描述想找什么动作。');
 const input=buildSearchInput({knowledge:[]},`查找符合以下需求的动作教学来源，逐条给出动作名称与简短介绍；这只是发现候选，不给个人处方：${q}`);input.question=`查找符合以下需求的动作教学来源，逐条给出动作名称与简短介绍；这只是发现候选，不给个人处方：${q}`;return input;
}
export function webActionSource(point,index,{text,mode='source_quote',question=''}={}){
 const source=point?.sources?.[index],url=safeURL(source?.url),passage=clip(text,4000);
 if(!source||!url)throw Error('请从本次真实搜索结果中选择来源。');
 if(!passage)throw Error('请粘贴来源中的教学段落，或用自己的话描述；搜索摘要不能冒充原文。');
 if(!['source_quote','my_description'].includes(mode))throw Error('请选择这段文字的来源。');
 return {url,title:clip(source.title,120),site:clip(source.site,80),question:clip(question,300),discoveryText:clip(point.text,400),userText:passage,mode,verified:false};
}
export function webActionIntakeInput(state,web){
 if(!safeURL(web?.url)||!web?.userText)throw Error('缺少来源链接和你提供的教学文字。');
 const input=buildActivityIntakeInput(state,{text:web.userText});input.source={platform:'网页搜索',url:web.url,title:web.title,creator:null};input.evidence[0].sourceLabel=web.mode==='source_quote'?'用户粘贴的来源段落（网页未自动核验）':'用户自己的动作描述';return input;
}
export function saveWebActionSource(state,web,candidates,now=new Date()){
 if(!web?.userText||!safeURL(web.url))throw Error('网页来源材料已失效，请重新核对。');
 for(const c of candidates)if(!c.manual&&(!c.evidenceQuote||!web.userText.includes(c.evidenceQuote)))throw Error('动作引证不在你提供的原文中。');
 const k={id:uid(),status:'saved',sourceKind:'web_search',title:clip(candidates.map(c=>c.draft?.name||c.name).filter(Boolean).join('、'),120)||web.title,text:web.userText.slice(0,700),url:web.url,sourceTitle:web.title,topics:[],
  claims:candidates.map(c=>({text:c.draft?.description||c.name,evidenceQuote:c.evidenceQuote||web.userText.slice(0,300),evidenceKind:'user_text',evidenceSource:'user',sources:[{title:web.title,url:web.url,site:web.site}]})),
  activityIds:[],activityLinks:[],useInPlanning:false,webActionSource:{...web},createdAt:now.toISOString(),updatedAt:now.toISOString()};state.knowledge.push(k);return k;
}
