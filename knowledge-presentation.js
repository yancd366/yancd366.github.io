// Display-only state, derived from the existing records; never rewrites data.
export const KNOWLEDGE_STATES={
  pending:{label:'待整理',action:'开始整理'},
  processing:{label:'整理中',action:'查看进度'},
  review:{label:'待核对',action:'核对入库'},
  saved:{label:'已入库',action:'查看详情'},
  attention:{label:'需处理',action:'查看原因'}
};
const platforms=new Set(['douyin','xiaohongshu','bilibili']);
export function knowledgePresentation(knowledge,capture){
  const saved=knowledge.status==='saved',manual=capture?.ingestErrorCode==='too_long'||Boolean(capture?.manualSummary);
  const id=saved?'saved':capture?.ingestStatus==='queued'?'processing':capture?.cardDraft?'review':capture?.ingestStatus==='failed'&&!manual?'attention':'pending';
  const updated=saved?(capture?.ingestStatus==='queued'?'正在更新，原卡仍可查看':capture?.cardDraft?'有新草稿待核对':capture?.ingestStatus==='failed'&&!manual?'本次更新未完成，原卡已保留':''):'';
  const step=saved?3:id==='review'?2:1;
  return {id,...KNOWLEDGE_STATES[id],action:manual&&!saved?'自己整理':KNOWLEDGE_STATES[id].action,notice:updated,
    flow:Boolean(capture&&platforms.has(capture.platform)&&capture.rawUrl&&!manual),
    steps:['收藏','解析','核对','入库'].map((label,index)=>({label,state:saved?'done':index<step?'done':index===step?id==='attention'?'failed':'current':'next'}))};
}
export function cleanKnowledgeTitle(value){
  const original=String(value||'').trim();
  return original.replace(/#[^\s#]+/gu,'').replace(/\s+/g,' ').trim()||original||'未命名收藏';
}
export function knowledgeExcerpt(knowledge,capture){
  const p=knowledgePresentation(knowledge,capture);
  if(p.id==='processing')return '正在读取来源内容，整理完成后可核对入库。';
  if(p.id==='review')return String(capture.cardDraft.summary||'草稿已准备好，核对观点与来源后即可入库。').replace(/\s+/g,' ').slice(0,130);
  if(p.id==='attention')return '整理暂未完成，原始链接已保留。打开详情查看处理方式。';
  if(capture?.ingestErrorCode==='too_long'&&p.id!=='saved')return '视频超过 30 分钟，可写下自己的总结并保留原链接。';
  return String(knowledge.text||'打开详情，继续整理你的收藏。').replace(/\s+/g,' ').slice(0,130);
}
export function knowledgeAddedDate(knowledge,capture){
  for(const value of [capture?.capturedAt,knowledge.createdAt]){
    if(typeof value!=='string'||!value.trim())continue;
    const date=new Date(value);if(!Number.isFinite(date.getTime()))continue;
    return {iso:date.toISOString(),text:date.toLocaleString('zh-CN',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})};
  }
  return {iso:null,text:'未记录'};
}
export function newestKnowledgeFirst(rows,captures=[]){
  const byKnowledge=new Map(captures.map(c=>[c.knowledgeId,c]));
  const added=k=>{
    for(const value of [byKnowledge.get(k.id)?.capturedAt,k.createdAt]){
      if(typeof value==='string'&&value.trim()&&Number.isFinite(Date.parse(value)))return Date.parse(value);
    }
    return -Infinity;
  };
  // A tie (or missing dates) uses reverse insertion order; never sort the store in place.
  return rows.map((row,index)=>({row,index,time:added(row)})).sort((a,b)=>a.time===b.time?b.index-a.index:b.time-a.time).map(x=>x.row);
}
