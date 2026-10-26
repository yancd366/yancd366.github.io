import {publicActivities} from './catalog.js';
import {uid} from './domain.js';
import {esc} from './ui.js';
import {notebookPointsHTML} from './knowledge-notebook.js';
export function sourcePointsHTML(points){return notebookPointsHTML(points.slice(0,1))+(points.length>1?`<details class="source-more-points"><summary>更多相关观点（${points.length-1}）</summary>${notebookPointsHTML(points.slice(1))}</details>`:'');}
const activity=(s,id)=>s.personalActivities?.find(p=>p.id===id)||publicActivities.find(a=>a.id===id);
const text=x=>typeof x==='string'?x:'';
const imageRef=x=>x?{jobId:text(x.jobId),index:x.index}:null;
export function sourceExtractionSnapshot(c,d){
 if(!c||!d||c.ingestStatus==='queued')return null;
 const base={version:1,url:c.rawUrl||'',contentId:c.resolvedSource?.contentId||null,attempt:c.lastIngestAttempt?.stage==='complete'?c.lastIngestAttempt.id:null};
 if(d.kind==='image_post'){
  const n=Number(d.imageIndex),image=c.imageEvidence?.find(x=>x.imageIndex===n),live=c.liveVideoEvidence?.find(x=>x.imageIndex===n);
  if(!image&&!live)return null;
  return JSON.stringify({...base,type:'image_post',index:n,image:image?{text:image.text,observation:image.observation,visibleText:image.visibleText,thumbnail:imageRef(image.thumbnail)}:null,live:live?{text:live.text,status:live.status,reason:live.reason,durationMs:live.durationMs,thumbnail:imageRef(live.coverThumbnail)}:null});
 }
 const a=c.actionSegments?.find(x=>x.id===d.id),o=c.videoEvidence?.find(x=>x.id===d.id);
 const item=d.omni?o:a;if(!item)return null;
 return JSON.stringify({...base,type:d.omni?'omni':'action',id:item.id,startMs:item.startMs,endMs:item.endMs,text:item.text,description:item.description,instruction:item.instruction,evidence:item.evidence?.map(e=>({kind:e.kind,quote:e.quote,startMs:e.startMs,endMs:e.endMs})),thumbnail:imageRef(item.thumbnail),frameAtMs:item.frameAtMs,frameStatus:item.frameStatus});
}
export function recordSourceExtraction(s,c,d,ids,thumbnailId=null,now=new Date()){
 const snapshot=sourceExtractionSnapshot(c,d);if(!snapshot)return null;
 const activityIds=[...new Set(ids)];if(!activityIds.length||activityIds.some(id=>!activity(s,id)))throw Error('保存的动作引用不完整。');
 const row={id:`extract-${uid()}`,captureId:c.id,knowledgeId:c.knowledgeId,sourceSnapshot:snapshot,activityIds,thumbnailId,confirmedAt:now.toISOString()};s.activityExtractions ||= [];s.activityExtractions.push(row);return row;
}
export function sourceExtractionState(s,c,d){
 const snapshot=sourceExtractionSnapshot(c,d),rows=snapshot?(s.activityExtractions||[]).filter(x=>x.captureId===c.id&&x.sourceSnapshot===snapshot):[];
 const ids=[...new Set(rows.flatMap(x=>x.activityIds))].filter(id=>activity(s,id));
 return {complete:ids.length>0,ids,activities:ids.map(id=>activity(s,id)),thumbnailId:[...rows].reverse().find(r=>r.thumbnailId&&r.activityIds.some(id=>ids.includes(id)))?.thumbnailId||null};
}
export function validateSourceExtractions(s,known){
 if(s.activityExtractions==null)return;
 if(!Array.isArray(s.activityExtractions)||s.activityExtractions.length>10000)throw Error('来源动作确认记录格式无效。');
 const seen=new Set();for(const r of s.activityExtractions){
  if(!/^extract-[\w-]+$/.test(r?.id)||seen.has(r.id)||typeof r.captureId!=='string'||typeof r.knowledgeId!=='string'||!/^[-_a-zA-Z0-9:.]{1,150}$/.test(r.captureId)||!/^[-_a-zA-Z0-9:.]{1,150}$/.test(r.knowledgeId)||typeof r.sourceSnapshot!=='string'||r.sourceSnapshot.length>30000||!Number.isFinite(Date.parse(r.confirmedAt))||!Array.isArray(r.activityIds)||!r.activityIds.length||r.activityIds.length>6||r.activityIds.some(id=>typeof id!=='string'||!/^[-_a-zA-Z0-9:.]{1,150}$/.test(id))||r.thumbnailId!=null&&!/^[\w.:-]{1,180}$/.test(r.thumbnailId))throw Error('来源动作确认记录格式无效。');
  let snap;try{snap=JSON.parse(r.sourceSnapshot);}catch{throw Error('来源动作快照无效。');}if(snap?.version!==1||!['image_post','action','omni'].includes(snap.type))throw Error('来源动作快照版本无效。');seen.add(r.id);
 }
}
export function sourceTileHTML(s,c,d,body,classes='video-action-segment'){
 const state=sourceExtractionState(s,c,d),tag=classes.includes('douyin-image-item')?'figure':'section';
 const edit=`<button type="button" class="secondary" data-source-edit="${esc(c.id)}" data-source-type="${d.kind==='image_post'?'image':d.omni?'omni':'action'}" data-source-id="${esc(d.id||'')}" data-image-index="${d.kind==='image_post'&&Number.isInteger(d.imageIndex)?d.imageIndex:''}">查看 / 详细编辑</button>`;
 if(!state.complete)return `<${tag} class="source-tile ${classes}"><span class="source-tile-status">待核对</span>${body}</${tag}>`;
 const original=body.match(/<img\b[^>]*>/)?.[0]||'',picture=state.thumbnailId?`<img class="source-saved-thumb" data-local-image="${esc(state.thumbnailId)}" alt="已保存的动作配图">`:original;
 const live=d.kind==='image_post'?c.liveVideoEvidence?.find(x=>x.imageIndex===d.imageIndex):null;
 return `<${tag} class="source-tile ${classes} is-complete"><div class="source-complete-heading"><span>✓ 已完成提取</span>${live&&live.status!=='analyzed'?'<small>动态观察仍未成功；已保存的是你核对的内容。</small>':''}<strong>本项已保存 ${state.ids.length} 个动作</strong><p>${state.activities.map(a=>esc(a.name)+(a.status==='archived'?'（已归档）':'')).join('、')}</p></div>${picture}<div class="source-tile-controls">${edit}</div><details class="source-tile-history"><summary>查看来源与重新核对</summary>${body.replace(original,'')}</details></${tag}>`;
}
