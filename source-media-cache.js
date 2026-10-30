// User-confirmed source pictures can outlive the ingest service's seven-day previews.
import {readImageEvidence,readActionFrame} from './ingest.js';
export function sourcePictures(state){
  const saved=new Set((state.knowledge||[]).filter(k=>k.status==='saved').map(k=>k.id)),rows=[];
  for(const c of state.captures||[]){
    if(!saved.has(c.knowledgeId))continue;
    const seen=new Set();
    for(const item of [...(c.imageEvidence||[]),...(c.liveVideoEvidence||[]).map(x=>({...x,thumbnail:x.coverThumbnail}))]){
      if(!item.thumbnail||seen.has(item.imageIndex))continue;seen.add(item.imageIndex);rows.push({captureId:c.id,kind:'image_post',imageIndex:item.imageIndex,sourceJobId:item.thumbnail.jobId,sourceIndex:item.thumbnail.index,item});
    }
    for(const item of [...(c.actionSegments||[]),...(c.videoEvidence||[])]){
      const key=`frame:${item.id}`;if(!item.thumbnail||seen.has(key))continue;seen.add(key);
      rows.push({captureId:c.id,kind:'video_frame',segmentId:item.id,sourceJobId:item.thumbnail.jobId,sourceIndex:item.thumbnail.index,item});
    }
  }
  return rows;
}
export function savedSourceMedia(c,picture){return (c.sourceMedia||[]).find(x=>x.kind===picture.kind&&(x.kind==='image_post'?x.imageIndex===picture.imageIndex:x.segmentId===picture.segmentId)&&x.sourceJobId===picture.sourceJobId&&x.sourceIndex===picture.sourceIndex);}
export const sourcePictureKey=p=>JSON.stringify([p.captureId,p.kind,p.imageIndex??p.segmentId,p.sourceJobId,p.sourceIndex]);
export async function cacheSourcePictures(state,{read,save,check=()=>{},readPost=readImageEvidence,readFrame=readActionFrame,maxDownloads=Infinity,skipSource=()=>false}={}){
  const next=structuredClone(state),pictures=sourcePictures(next),failures=[];let cached=0,missing=0,attempted=0,deferred=0;
  for(const c of next.captures||[]){const current=pictures.filter(p=>p.captureId===c.id);if(current.length&&c.sourceMedia)c.sourceMedia=c.sourceMedia.filter(row=>current.some(p=>savedSourceMedia({sourceMedia:[row]},p)));}
  for(const p of pictures){
    check();const c=next.captures.find(x=>x.id===p.captureId),existing=savedSourceMedia(c,p);
    const bytes=new TextEncoder().encode(JSON.stringify([p.captureId,p.kind,p.imageIndex??p.segmentId,p.sourceJobId,p.sourceIndex]));
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join(''),thumbnailId=existing?.thumbnailId||`source-${digest}`;
    const remember=()=>{const {item,captureId,...reference}=p;c.sourceMedia=(c.sourceMedia||[]).filter(x=>!(x.kind===p.kind&&(x.kind==='image_post'?x.imageIndex===p.imageIndex:x.segmentId===p.segmentId)));c.sourceMedia.push({...reference,thumbnailId});};
    if(await read(thumbnailId)){remember();continue;}
    if(skipSource(p)){missing++;continue;}if(attempted>=maxDownloads){deferred++;continue;}attempted++;
    try{
      const blob=p.kind==='image_post'?await readPost(c,{thumbnail:p.item.thumbnail,imageIndex:p.imageIndex},state):await readFrame(c,p.item,state);check();
      await save(thumbnailId,blob);check();remember();cached++;
    }catch{check();missing++;failures.push(sourcePictureKey(p));}
  }
  return {state:next,cached,missing,deferred,failures};
}
export function hydrateSourceMediaRefs(root,state){
  for(const image of root.querySelectorAll('img[data-frame-capture],img[data-capture-image]')){
    const c=state.captures?.find(c=>c.id===(image.dataset.frameCapture||image.dataset.captureImage));if(!c)continue;
    const item=image.dataset.frameCapture?(c.actionSegments||[]).find(x=>x.id===image.dataset.frameSegment)||(c.videoEvidence||[]).find(x=>x.id===image.dataset.frameSegment):(c.imageEvidence||[]).find(x=>x.imageIndex===Number(image.dataset.imageIndex));
    const thumbnail=item?.thumbnail||(c.liveVideoEvidence||[]).find(x=>x.imageIndex===Number(image.dataset.imageIndex))?.coverThumbnail;if(!thumbnail)continue;
    const saved=savedSourceMedia(c,{kind:image.dataset.frameCapture?'video_frame':'image_post',segmentId:item?.id,imageIndex:Number(image.dataset.imageIndex),sourceJobId:thumbnail.jobId,sourceIndex:thumbnail.index});
    if(saved){image.dataset.localImage=saved.thumbnailId;image.alt='已保存的来源配图';}
  }
}
