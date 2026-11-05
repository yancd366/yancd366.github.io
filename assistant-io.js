import {proxyPossible} from './ai-direct.js';import {browserSyncContext} from './sync-browser.js';import {createAccountClient} from './account-client.js';import {validateTeachingSource} from './assistant-source.js';
const messages={source_url:'这个链接不能作为公开教学读取。',source_private:'来源指向非公开网络，未读取。',source_unreadable:'这页暂时读不到教学正文，可换一个来源或提供原文。',source_unsupported:'暂不支持这类页面；可打开来源核对或提供教学文字。',source_large:'网页内容过大，可换一个教学来源。',source_quota:'今天自动读取教学的次数已用完，可手动提供原文，或明天再试。',source_busy:'同时读取的请求较多，请稍后重试。',source_unavailable:'教学读取服务暂时不可用，来源和需求已保留。',source_timeout:'教学读取超时，来源和需求已保留。'};
export async function readAssistantTeaching(url,{signal}={}){
 try{if(proxyPossible(location.hostname)){const r=await fetch('/api/assistant/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal}),v=await r.json();if(!r.ok)throw Object.assign(Error(),{code:v.error});return validateTeachingSource(v);}
  const c=browserSyncContext();if(!c)throw Object.assign(Error('自动读取教学需要先登录循动账号；当前搜索结果仍保留。'),{code:'source_login'});return await createAccountClient(c.scope.serviceOrigin).readTeaching(c.session,url,signal);
 }catch(e){if(signal?.aborted)throw Error('已取消读取。');if(messages[e.code])throw Object.assign(Error(messages[e.code]),{code:e.code});if(e.code==='not_found')throw Error('教学读取服务尚未启用，可先提供教学原文。');throw e.message?e:Error('教学来源暂时无法连接。');}
}
