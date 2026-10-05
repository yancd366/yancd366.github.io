// Browser-side client for the optional cloud video ingestion service.
// Its personal access token stays on this device and is removed from JSON backups.
import { validateKnowledgeImport } from './knowledge.js';
export const allowedIngestBase=value=>{
  try{
    const u=new URL(String(value||'').trim());
    const host=u.hostname.toLowerCase();
    return u.protocol==='https:'&&(host.endsWith('.workers.dev')||host.endsWith('.fcapp.run'))&&!u.username&&!u.password&&!u.port&&u.pathname==='/'?u.origin:'';
  }catch{return '';}
};
// 两条线路可以同时配置，选一条作为当前使用。数据只加不改：顶层 base / token 始终等于当前线路，
// 旧版本 App 读到的仍是可用的配置；routes / active 是新增字段。
export const INGEST_ROUTES={
  aliyun:{label:'阿里云函数计算',hint:'国内直连，不需要 VPN',suffix:'.fcapp.run',defaultBase:'https://xundong-ingest-cviyggemng.cn-hangzhou.fcapp.run'},
  cloudflare:{label:'Cloudflare',hint:'国内通常需要 VPN',suffix:'.workers.dev',defaultBase:'https://xundong-api.707094024.workers.dev'}
};
export const routeOfBase=base=>{const b=allowedIngestBase(base);return !b?null:Object.keys(INGEST_ROUTES).find(id=>new URL(b).hostname.endsWith(INGEST_ROUTES[id].suffix))||null;};
const usable=(x,id)=>x&&allowedIngestBase(x.base)&&routeOfBase(x.base)===id&&typeof x.token==='string'&&x.token.length>=24?{base:allowedIngestBase(x.base),token:x.token,id}:null;
// 每条线路当前保存的配置（没配置的为 null）。旧格式只有顶层 base / token，按地址归到对应线路。
export function ingestRoutes(state){
  const x=state.settings?.ingest||{},out={};
  for(const id of Object.keys(INGEST_ROUTES))out[id]=usable(x.routes?.[id],id)||(routeOfBase(x.base)===id?usable(x,id):null);
  const active=out[x.active]?x.active:out[routeOfBase(x.base)]?routeOfBase(x.base):Object.keys(out).find(id=>out[id])||null;
  return {...out,active};
}
// 当前使用的线路；提交新任务用它。
export const ingestConfig=state=>{const r=ingestRoutes(state);return r.active?r[r.active]:null;};
// 指定线路（查询某个任务时用提交它的那条线路，切换线路不影响进行中的任务）。
export const ingestConfigFor=(state,id)=>ingestRoutes(state)[id]||null;
export const anyIngestConfigured=state=>Object.keys(INGEST_ROUTES).some(id=>ingestRoutes(state)[id]);
// 保存设置：input={aliyun:{base,token},cloudflare:{base,token},active}；token 留空 = 保留原值，
// 原来没有时沿用另一条线路的访问码（两条线路通常用同一个）。
export function nextIngestSettings(state,input,now=new Date()){
  const prev=ingestRoutes(state),routes={};
  for(const id of Object.keys(INGEST_ROUTES)){
    const raw=input[id]||{},baseText=String(raw.base||'').trim();
    if(!baseText)continue;
    const base=allowedIngestBase(baseText);
    if(!base||routeOfBase(base)!==id)throw new Error(`${INGEST_ROUTES[id].label}的地址应为 https://…${INGEST_ROUTES[id].suffix}`);
    const other=Object.keys(INGEST_ROUTES).find(x=>x!==id);
    const token=String(raw.token||'').trim()||prev[id]?.token||String(input[other]?.token||'').trim()||prev[other]?.token||'';
    if(token.length<24)throw new Error(`${INGEST_ROUTES[id].label}的个人访问码至少需要 24 位。`);
    routes[id]={base,token,confirmedAt:now.toISOString()};
  }
  const active=routes[input.active]?input.active:Object.keys(routes)[0];
  if(!active)throw new Error('至少配置一条线路。');
  return {base:routes[active].base,token:routes[active].token,confirmedAt:now.toISOString(),active,routes};
}
const autoPlatforms=new Set(['douyin','xiaohongshu','bilibili']);
export const supportedAutoCapture=capture=>autoPlatforms.has(capture?.platform)&&Boolean(capture.rawUrl);
export const preferVideoIngest=capture=>supportedAutoCapture(capture)&&!capture?.transcript&&!(Array.isArray(capture?.videoEvidence)&&capture.videoEvidence.length);

async function api(path,config,{method='GET',body,fetchImpl=fetch,timeoutMs=18000}={}){
  const base=allowedIngestBase(config?.base);
  if(!base||!config?.token)throw new Error('请先在「我的身体 → 自动视频整理」配置云端地址和个人访问码。');
  let response;
  try{response=await fetchImpl(base+path,{method,headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeoutMs)});}
  catch{throw new Error('暂时连不上自动整理服务；分享链接已经保存在本机。');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||`自动整理服务返回 ${response.status}。`);
  return data;
}

export async function submitIngest(capture,config,{force=false,...options}={}){
  if(!supportedAutoCapture(capture))throw new Error('目前自动整理支持公开的抖音、小红书和 B 站视频。');
  const data=await api('/v1/ingest',config,{...options,method:'POST',body:{url:capture.rawUrl,force:Boolean(force)}});
  if(data.status!=='accepted'||!/^[a-f0-9-]{36}$/i.test(data.jobId||''))throw new Error('云端没有返回有效的任务编号。');
  return data.jobId;
}

export async function readIngestJob(jobId,config,options){
  if(!/^[a-f0-9-]{36}$/i.test(jobId||''))throw new Error('任务编号无效。');
  const data=await api(`/v1/jobs/${jobId}`,config,options);
  if(!['queued','complete','failed'].includes(data.status))throw new Error('云端返回的任务状态无效。');
  return data;
}

export function applyIngestResult(state,captureId,result,now=new Date()){
  const capture=state.captures.find(c=>c.id===captureId);
  if(!capture)throw new Error('找不到原始分享。');
  if(typeof result.noteText==='string'&&result.noteText.trim()&&!String(capture.shareText||'').trim())capture.shareText=result.noteText.trim().slice(0,8000);
  if(result.status==='failed'){
    capture.ingestStatus='failed';capture.ingestError=String(result.message||'暂时无法自动整理。').slice(0,1000);capture.ingestWarning='';capture.cardDraft=null;capture.videoEvidence=[];capture.actionSegments=[];
    capture.lastIngestAttempt={id:String(result.diagnostics?.attemptId||capture.ingestJobId||'').slice(0,80),pipelineVersion:String(result.diagnostics?.pipelineVersion||'').slice(0,80),stage:String(result.stage||'failed').slice(0,40),reason:String(result.reason||'').slice(0,80),updatedAt:result.updatedAt||now.toISOString()};
    const knowledge=state.knowledge.find(k=>k.id===capture.knowledgeId);
    if(knowledge&&knowledge.status==='inbox')knowledge.text='暂时无法自动整理这条视频；原始链接已保留。';
  }else if(result.status==='complete'){
    const hasTranscript=Boolean(result.transcript&&typeof result.transcript.text==='string'&&result.transcript.text.trim());
    const videoEvidence=Array.isArray(result.videoEvidence)?result.videoEvidence.slice(0,80).map((item,n)=>({id:`vision:${n}`,kind:['asr_transcript','keyframe_description','frame_ocr'].includes(String(item?.kind||''))?String(item.kind):'',text:String(item?.text||'').trim().slice(0,1000),startMs:Number(item?.startMs),endMs:Number(item?.endMs),evidenceSource:item?.evidenceSource==='workflow_model'?'workflow_model':'parser'})).filter(item=>item.kind&&item.text&&Number.isFinite(item.startMs)&&item.startMs>=0&&Number.isFinite(item.endMs)&&item.endMs>=item.startMs):[];
    if(!hasTranscript&&!videoEvidence.length&&!String(capture.shareText||'').trim())throw new Error('云端没有返回可核对的语音、画面或笔记正文。');
    capture.ingestStatus='transcribed';capture.ingestError='';
    capture.lastIngestAttempt={id:String(result.diagnostics?.attemptId||capture.ingestJobId||'').slice(0,80),pipelineVersion:String(result.diagnostics?.pipelineVersion||'').slice(0,80),stage:'complete',reason:'',updatedAt:result.updatedAt||now.toISOString()};
    capture.resolvedSource={provider:String(result.source?.provider||'').slice(0,40),platform:String(result.source?.platform||'').slice(0,40),contentId:String(result.source?.contentId||'').slice(0,100),title:String(result.source?.title||'').slice(0,180),creatorName:String(result.source?.creatorName||'').slice(0,120),description:String(result.source?.description||'').slice(0,2000),durationMs:Number(result.source?.durationMs)||null,retrievedAt:result.source?.retrievedAt||now.toISOString()};
    if(hasTranscript)capture.transcript={source:'asr',model:String(result.transcript.model||'').slice(0,100),text:result.transcript.text.trim().slice(0,30000),segments:Array.isArray(result.transcript.segments)?result.transcript.segments.slice(0,150).map(s=>({startMs:Number(s.startMs)||0,endMs:s.endMs==null?null:Number(s.endMs),text:String(s.text||'').slice(0,1000)})):[],createdAt:result.transcript.createdAt||now.toISOString()};
    if(videoEvidence.length)capture.videoEvidence=videoEvidence;
    const actionSegments=Array.isArray(result.actionSegments)?result.actionSegments.slice(0,10).flatMap((item,n)=>{
      const startMs=Number(item?.startMs),endMs=Number(item?.endMs),frameStartMs=Number(item?.frame?.startMs),ref=item?.thumbnail;
      if(!Number.isFinite(startMs)||startMs<0||!Number.isFinite(endMs)||endMs<startMs)return [];
      const thumbnail=ref&&/^[a-f0-9-]{36}$/i.test(ref.jobId||'')&&Number.isInteger(ref.index)&&ref.index>=0&&ref.index<10?{jobId:ref.jobId,index:ref.index}:null;
      const evidence=Array.isArray(item.evidence)?item.evidence.slice(0,6).map(e=>({kind:['asr_transcript','keyframe_description','frame_ocr'].includes(e.kind)?e.kind:'',quote:String(e.quote||'').trim().slice(0,300),startMs:Number(e.startMs),endMs:Number(e.endMs),evidenceSource:e.evidenceSource==='workflow_model'?'workflow_model':'parser'})).filter(e=>e.kind&&e.quote&&Number.isFinite(e.startMs)&&Number.isFinite(e.endMs)&&e.startMs>=0&&e.endMs>=e.startMs):[];
      if(!evidence.length)return [];
      return [{id:`seg-${n+1}`,startMs,endMs,name:String(item.name||'').slice(0,80),description:String(item.description||'').slice(0,500),instruction:String(item.instruction||'').slice(0,500),needsReview:item.needsReview!==false,uncertainty:String(item.uncertainty||'').slice(0,240),evidence,frame:Number.isFinite(frameStartMs)?{startMs:frameStartMs,endMs:Number(item.frame.endMs)||frameStartMs,text:String(item.frame.text||'').slice(0,500)}:null,thumbnail}];
    }):[];
    capture.actionSegments=actionSegments;
    const visualProvider=['bailian_video_workflow','bailian_video_url'].includes(result.analysis?.provider);
    capture.videoAnalysis=visualProvider?{provider:result.analysis.provider,evidenceTrust:result.analysis?.evidenceTrust||'parser',model:String(result.analysis?.model||'').slice(0,80),modelTokenUsage:result.analysis?.modelTokenUsage&&typeof result.analysis.modelTokenUsage==='object'?{input:Number(result.analysis.modelTokenUsage.prompt_tokens)||0,output:Number(result.analysis.modelTokenUsage.completion_tokens)||0}:null,createdAt:now.toISOString()}:null;
    const checked=result.cardDraft?validateKnowledgeImport({status:'ok',card:result.cardDraft},capture):null;
    capture.cardDraft=checked?.ok?checked.card:null;
    capture.ingestWarning=String(result.workflowWarning||(!capture.cardDraft?result.cardError||'逐字稿已保存，知识卡可在 App 内重新整理。':'')).slice(0,500);
    const knowledge=state.knowledge.find(k=>k.id===capture.knowledgeId);
    if(knowledge&&knowledge.status==='inbox'){
      knowledge.title=capture.resolvedSource.title||knowledge.title;
      knowledge.sourceTitle=capture.resolvedSource.creatorName||knowledge.sourceTitle;
      const noteOnly=result.analysis?.provider==='note_text';
      knowledge.text=capture.cardDraft?(noteOnly?'笔记正文已整理成知识卡草稿，等待你核对。':'视频已解析，知识卡草稿等待你核对。'):hasTranscript?'视频已转成文字，可再次尝试整理知识卡。':noteOnly?'笔记正文已保存，可整理成知识卡。':'视频画面已解析，可再次尝试整理知识卡。';
      knowledge.updatedAt=now.toISOString();
    }
  }
  capture.updatedAt=now.toISOString();
  return capture;
}

export async function readActionFrame(capture,segment,state,{fetchImpl=fetch}={}){
  const ref=segment?.thumbnail,config=capture?.ingestRoute&&ingestConfigFor(state,capture.ingestRoute);
  if(!ref||!config)throw new Error('动作截图已过期或自动整理线路未配置。');
  let response;
  try{response=await fetchImpl(`${config.base}/v1/jobs/${ref.jobId}/frames/${ref.index}`,{headers:{Authorization:`Bearer ${config.token}`},signal:AbortSignal.timeout(15000)});}
  catch{throw new Error('暂时无法读取动作截图。');}
  if(!response.ok)throw new Error(response.status===404?'动作截图已过期，请重新解析这条视频。':'读取动作截图失败。');
  const blob=await response.blob();
  if(!['image/jpeg','image/png','image/webp'].includes(blob.type)||blob.size>2_000_000)throw new Error('动作截图格式或大小无效。');
  return blob;
}
