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
export const ingestConfig=state=>{
  const x=state.settings?.ingest;
  return x&&allowedIngestBase(x.base)&&typeof x.token==='string'&&x.token.length>=24?x:null;
};
export const supportedAutoCapture=capture=>capture?.platform==='douyin'&&Boolean(capture.rawUrl);

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
  if(!supportedAutoCapture(capture))throw new Error('目前自动整理先支持公开的抖音视频链接。');
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
  if(result.status==='failed'){
    capture.ingestStatus='failed';capture.ingestError=String(result.message||'暂时无法自动整理。').slice(0,300);
    const knowledge=state.knowledge.find(k=>k.id===capture.knowledgeId);
    if(knowledge&&knowledge.status==='inbox')knowledge.text='暂时无法自动整理这条视频；原始链接已保留。';
  }else if(result.status==='complete'){
    const hasTranscript=Boolean(result.transcript&&typeof result.transcript.text==='string'&&result.transcript.text.trim());
    const videoEvidence=Array.isArray(result.videoEvidence)?result.videoEvidence.slice(0,80).map((item,n)=>({id:`vision:${n}`,kind:['asr_transcript','keyframe_description','frame_ocr'].includes(String(item?.kind||''))?String(item.kind):'',text:String(item?.text||'').trim().slice(0,1000),startMs:Number(item?.startMs),endMs:Number(item?.endMs)})).filter(item=>item.kind&&item.text&&Number.isFinite(item.startMs)&&item.startMs>=0&&Number.isFinite(item.endMs)&&item.endMs>=item.startMs):[];
    if(!hasTranscript&&!videoEvidence.length)throw new Error('云端没有返回可核对的语音或画面依据。');
    capture.ingestStatus='transcribed';capture.ingestError='';
    capture.resolvedSource={provider:String(result.source?.provider||'').slice(0,40),platform:String(result.source?.platform||'').slice(0,40),contentId:String(result.source?.contentId||'').slice(0,100),title:String(result.source?.title||'').slice(0,180),creatorName:String(result.source?.creatorName||'').slice(0,120),description:String(result.source?.description||'').slice(0,2000),durationMs:Number(result.source?.durationMs)||null,retrievedAt:result.source?.retrievedAt||now.toISOString()};
    if(hasTranscript)capture.transcript={source:'asr',model:String(result.transcript.model||'').slice(0,100),text:result.transcript.text.trim().slice(0,30000),segments:Array.isArray(result.transcript.segments)?result.transcript.segments.slice(0,150).map(s=>({startMs:Number(s.startMs)||0,endMs:s.endMs==null?null:Number(s.endMs),text:String(s.text||'').slice(0,1000)})):[],createdAt:result.transcript.createdAt||now.toISOString()};
    if(videoEvidence.length)capture.videoEvidence=videoEvidence;
    capture.videoAnalysis=result.analysis?.provider==='bailian_video_workflow'?{provider:'bailian_video_workflow',createdAt:now.toISOString()}:null;
    const checked=result.cardDraft?validateKnowledgeImport({status:'ok',card:result.cardDraft},capture):null;
    capture.cardDraft=checked?.ok?checked.card:null;
    capture.ingestWarning=String(result.workflowWarning||(!capture.cardDraft?result.cardError||'逐字稿已保存，知识卡可在 App 内重新整理。':'')).slice(0,500);
    const knowledge=state.knowledge.find(k=>k.id===capture.knowledgeId);
    if(knowledge&&knowledge.status==='inbox'){
      knowledge.title=capture.resolvedSource.title||knowledge.title;
      knowledge.sourceTitle=capture.resolvedSource.creatorName||knowledge.sourceTitle;
      knowledge.text=capture.cardDraft?'视频已解析，知识卡草稿等待你核对。':hasTranscript?'视频已转成文字，可再次尝试整理知识卡。':'视频画面已解析，可再次尝试整理知识卡。';
      knowledge.updatedAt=now.toISOString();
    }
  }
  capture.updatedAt=now.toISOString();
  return capture;
}
