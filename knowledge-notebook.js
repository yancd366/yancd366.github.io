// A read model only. Old records remain unchanged; a claim and a picture are
// combined only when their source identity agrees, never by their array order.
import {esc} from './ui.js';
import {safeURL} from './domain.js';

const time=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
export function sourceLabel(point){
  if(point.evidenceKind==='ai_search')return 'AI 搜索来源（待核对）';
  if(point.evidenceKind==='image_description')return `图集第 ${(point.imageIndex??0)+1} 张 · AI 图像描述（待核对）`;
  if(point.evidenceKind==='live_video_description')return `图文第 ${(point.imageIndex??0)+1} 项 · AI 动态视频观察（待核对）`;
  if(point.evidenceKind==='omni_audio_video_summary')return 'Omni 音画理解（待核对）';
  if(point.evidenceSource==='workflow_model')return 'AI 画面描述（待核对）';
  return {user_summary:'你自己写的视频总结',asr_transcript:'视频语音',frame_ocr:'画面字幕',keyframe_description:'画面解析'}[point.evidenceKind]||'来源文字';
}
export function sourceQuoteHTML(point){
  const links=point.evidenceKind==='ai_search'&&Array.isArray(point.sources)?point.sources.filter(s=>safeURL(s.url)):[];
  return `<details class="notebook-source"><summary>${esc(sourceLabel(point))}${Number.isFinite(point.startMs)?` ${time(point.startMs)}`:''} · 查看依据</summary>${links.length?links.map(s=>`<a href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title||s.site||'查看来源')}</a>`).join('；'):`<blockquote>${esc(point.evidenceQuote||'这条旧笔记未记录逐字引证，请打开来源核对。')}</blockquote>`}</details>`;
}
export function notebookPointsHTML(points){
  return points.map(p=>`<section class="notebook-point"><div class="notebook-point-heading"><span class="notebook-number">${String(p.number).padStart(2,'0')}</span><strong>${esc(p.text)}</strong></div>${sourceQuoteHTML(p)}</section>`).join('');
}
export function notebookReadModel(shown,capture={}){
  const imagePoints=new Map(),actionPoints=new Map(),omniPoints=new Map(),unattached=[];
  const claims=Array.isArray(shown.claims)?shown.claims:[];
  claims.forEach((claim,index)=>{
    const point={...claim,number:index+1};let key=null,map=null;
    if(['image_description','live_video_description'].includes(claim.evidenceKind)){
      const prefix=claim.evidenceKind==='image_description'?'image':'live-video';
      const match=String(claim.evidenceId||'').match(new RegExp(`^${prefix}:(\\d+)$`));
      const imageIndex=Number.isInteger(claim.imageIndex)?claim.imageIndex:match?Number(match[1]):null;
      const images=prefix==='image'?capture.imageEvidence:capture.liveVideoEvidence;
      if(imageIndex!=null&&(!claim.evidenceId||claim.evidenceId===`${prefix}:${imageIndex}`)&&images?.some(x=>x.imageIndex===imageIndex&&(!claim.evidenceQuote||x.text?.includes(claim.evidenceQuote)))){
        key=`${prefix}:${imageIndex}`;map=imagePoints;
      }
    }else if(claim.evidenceKind==='omni_audio_video_summary'&&capture.videoAnalysis?.provider==='bailian_omni_video_url'){
      const hits=(capture.videoEvidence||[]).map((x,n)=>({x,id:`vision:${n}`})).filter(({x,id})=>x.kind==='omni_audio_video_summary'&&claim.evidenceId===id&&x.startMs===claim.startMs&&x.endMs===claim.endMs&&(!claim.evidenceQuote||x.text?.includes(claim.evidenceQuote)));
      if(hits.length===1){key=hits[0].id;map=omniPoints;}
    }else if(Number.isFinite(claim.startMs)&&Number.isFinite(claim.endMs)&&claim.evidenceQuote){
      const hits=(capture.actionSegments||[]).filter(seg=>seg.evidence?.some(e=>e.kind===claim.evidenceKind&&e.startMs===claim.startMs&&e.endMs===claim.endMs&&e.quote?.includes(claim.evidenceQuote)));
      if(hits.length===1){key=hits[0].id;map=actionPoints;}
    }
    if(map){if(!map.has(key))map.set(key,[]);map.get(key).push(point);}else unattached.push(point);
  });
  return {count:claims.length,unattached,imagePoints,actionPoints,omniPoints};
}
export function notebookSummaryHTML(shown,fallback=''){
  const text=String(shown.summary||fallback||'').trim();
  if(!text)return '';
  if(!shown.claims?.length)return `<p class="knowledge-full-text">${esc(text)}</p>`;
  const short=text.length<=160?text:`${text.slice(0,160).replace(/[；;，,、\s]+$/u,'')}…`;
  return `<div class="notebook-overview"><span>内容概览</span><p>${esc(short)}</p>${text.length>160?`<details><summary>展开完整摘要</summary><p class="knowledge-full-text">${esc(text)}</p></details>`:''}</div>`;
}
