import {activityById} from './catalog.js';
import {safeURL,uid} from './domain.js';
import {esc} from './ui.js';
export const mediaIdOK=id=>typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,180}$/.test(id);
export function attachActivityMedia(state,activityId,source,now=new Date()){
  if(!activityById(activityId)&&!state.personalActivities?.some(p=>p.id===activityId))throw new Error('找不到配图对应的动作。');
  if(!mediaIdOK(source.thumbnailId)||!['video_frame','image_post'].includes(source.kind))throw new Error('配图引用无效。');
  state.activityMedia ||= [];
  const old=state.activityMedia.find(x=>x.activityId===activityId&&x.thumbnailId===source.thumbnailId);if(old)return old;
  if(state.activityMedia.filter(x=>x.activityId===activityId).length>=20)throw new Error('一个动作最多保留 20 张个人配图，请先移除不需要的配图。');
  const p={id:uid(),activityId,thumbnailId:source.thumbnailId,kind:source.kind,lowTrust:Boolean(source.lowTrust),userEdited:source.userEdited===true,sourceUrl:safeURL(source.sourceUrl)||'',caption:String(source.caption||'').trim().slice(0,500),captureId:source.captureId||null,knowledgeId:source.knowledgeId||null,evidenceQuote:String(source.evidenceQuote||'').slice(0,300),imageIndex:Number.isInteger(source.imageIndex)?source.imageIndex:null,startMs:Number.isFinite(source.startMs)?source.startMs:null,endMs:Number.isFinite(source.endMs)?source.endMs:null,createdAt:now.toISOString()};
  state.activityMedia.push(p);return p;
}
export function activityMediaItems(state,id,activity=activityById(id)){
  const rows=(state.activityMedia||[]).filter(x=>x.activityId===id),legacy=activity?.source;
  if(legacy?.thumbnailId&&!rows.some(x=>x.thumbnailId===legacy.thumbnailId))return [...rows,{id:null,activityId:id,thumbnailId:legacy.thumbnailId,kind:legacy.kind||'video_frame',sourceUrl:legacy.sourceUrl||'',caption:legacy.quote||''}];
  return rows;
}
export function activityMediaHTML(state,id,activity=activityById(id)){
  const rows=activityMediaItems(state,id,activity);if(!rows.length)return '';
  return `<details class="activity-media" open><summary>我的来源配图（${rows.length}）</summary>${rows.map(x=>`<figure><img class="activity-detail-image" data-local-image="${esc(x.thumbnailId)}" alt="${esc(activity?.name||'动作')} · ${x.kind==='image_post'?'来源图片':'视频截图'}" loading="lazy"><figcaption><p class="small">${x.userEdited?'你的确认 / 修改：':x.lowTrust?'AI 画面观察（待核对）：':'来源说明：'}${esc(x.caption)}</p>${safeURL(x.sourceUrl)?`<a class="text-button" href="${esc(safeURL(x.sourceUrl))}" target="_blank" rel="noopener noreferrer">打开原${x.kind==='image_post'?'图文':'视频'}</a>`:''}${x.id?`<button class="text-button" data-remove-activity-media="${esc(x.id)}" data-activity="${esc(id)}">移除这张配图</button>`:''}</figcaption></figure>`).join('')}<p class="small muted">你确认保存的来源图，不代表动作已经专业审核。图片在本机，可随含图备份迁移；浏览器清理仍可能移除本机图片。</p></details>`;
}
export function referencedMediaIds(state){
  return [...new Set([...(state.activityMedia||[]).map(x=>x.thumbnailId),...(state.activityExtractions||[]).map(x=>x.thumbnailId),...(state.personalActivities||[]).map(p=>p.source?.thumbnailId),...(state.sessions||[]).flatMap(s=>(s.items||[]).map(i=>i.activitySnapshot?.source?.thumbnailId))].filter(mediaIdOK))];
}
