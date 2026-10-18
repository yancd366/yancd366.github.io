import {parseBackup,sanitizeForExport} from './storage.js';
import {referencedMediaIds,mediaIdOK} from './activity-media.js';
import {readImage,saveImage} from './media-store.js';
import {MAX_ACTIVITY_IMAGE_BYTES} from './image-compression.js';
export const MAX_MEDIA_BACKUP_BYTES=75_000_000;
export const MAX_BACKUP_IMAGE_BYTES=50_000_000;
const TYPES=['image/webp','image/jpeg','image/png'];
const fileBytes=text=>new Blob([text]).size;
function base64(bytes){let s='';for(let n=0;n<bytes.length;n+=0x8000)s+=String.fromCharCode(...bytes.subarray(n,n+0x8000));return btoa(s);}
function imageBlob(file){
  if(!file||!mediaIdOK(file.id)||!TYPES.includes(file.type)||typeof file.data!=='string'||file.data.length>4*Math.ceil(MAX_ACTIVITY_IMAGE_BYTES/3)||!file.data.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))throw new Error('备份图片格式无效。');
  let text;try{text=atob(file.data);}catch{throw new Error('备份图片编码无效。');}
  const b=Uint8Array.from(text,c=>c.charCodeAt(0));
  const valid=file.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:file.type==='image/png'?b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71:String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
  if(!valid||b.length>MAX_ACTIVITY_IMAGE_BYTES)throw new Error('备份图片内容无效。');return new Blob([b],{type:file.type});
}
export async function buildMediaBackup(state,{read=readImage}={}){
  const clean=sanitizeForExport(state),files=[],missing=[];let bytes=0;
  if(JSON.stringify(clean).length>5_000_000)throw new Error('文字记录超过 5 MB，请先整理备份范围。');
  for(const id of referencedMediaIds(clean)){
    const blob=await read(id);if(!blob){missing.push(id);continue;}
    if(!TYPES.includes(blob.type)||blob.size>MAX_ACTIVITY_IMAGE_BYTES)throw new Error('本机图片格式异常，未导出不完整的含图备份。');
    bytes+=blob.size;if(files.length>=200||bytes>MAX_BACKUP_IMAGE_BYTES)throw new Error('含图备份超过 200 张或 50 MB 图片限制；本机图片仍保留，可先导出文字备份。');
    files.push({id,type:blob.type,data:base64(new Uint8Array(await blob.arrayBuffer()))});
  }
  const text=JSON.stringify({format:'xundong-media-backup-v1',state:clean,images:files,missingImages:missing});
  if(text.length>MAX_MEDIA_BACKUP_BYTES||fileBytes(text)>MAX_MEDIA_BACKUP_BYTES)throw new Error('含图备份超过大小限制。');
  return {text,imageCount:files.length,missing};
}
export function parseMediaBackup(text){
  if(text.length>MAX_MEDIA_BACKUP_BYTES||fileBytes(text)>MAX_MEDIA_BACKUP_BYTES)throw new Error('请使用 75 MB 以内的含图备份。');
  const raw=JSON.parse(text);
  if(raw?.format!=='xundong-media-backup-v1')return {state:parseBackup(text),images:[]};
  const state=parseBackup(JSON.stringify(raw.state));
  if(!Array.isArray(raw.images)||raw.images.length>200)throw new Error('备份图片数量无效。');
  const allowed=new Set(referencedMediaIds(state)),seen=new Set();let bytes=0;
  const images=raw.images.map(file=>{if(!allowed.has(file?.id)||seen.has(file.id))throw new Error('备份图片没有对应动作或重复。');seen.add(file.id);const blob=imageBlob(file);bytes+=blob.size;if(bytes>MAX_BACKUP_IMAGE_BYTES)throw new Error('备份图片总量过大。');return {id:file.id,blob};});
  return {state,images};
}
export async function restoreMediaImages(images,{read=readImage,save=saveImage}={}){
  let added=0;
  for(const image of images){if(await read(image.id))continue;await save(image.id,image.blob);added++;}
  return added; // Same-id local images win; never overwrite another device's saved image.
}
