// Media manifests refer to private, owner-scoped, immutable image bytes.
import {mediaIdOK,referencedMediaIds} from './activity-media.js';
import {MAX_ACTIVITY_IMAGE_BYTES} from './image-compression.js';
export const CLOUD_MEDIA_FORMAT='xundong-cloud-media-v2';
export const MAX_CLOUD_IMAGES=200;
export const MAX_CLOUD_IMAGE_BYTES=50_000_000;
export const imageTypeOK=type=>['image/jpeg','image/png','image/webp'].includes(type);
export const imageHashOK=hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash);
export function imageSignatureOK(bytes,type){
  if(type==='image/jpeg')return bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(type==='image/png')return bytes.length>=24&&[137,80,78,71,13,10,26,10].every((b,n)=>bytes[n]===b);
  return type==='image/webp'&&bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
}
export function validateMediaDescriptor(d){
  if(!d||!mediaIdOK(d.id)||!imageHashOK(d.sha256)||!imageTypeOK(d.type)||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>MAX_ACTIVITY_IMAGE_BYTES)throw Error('云配图引用无效。');
  return {id:d.id,sha256:d.sha256,type:d.type,bytes:d.bytes};
}
export function validateCloudManifest(state,manifest,{complete=true}={}){
  if(!Array.isArray(manifest)||manifest.length>MAX_CLOUD_IMAGES)throw Error('云备份配图数量无效。');
  const wanted=new Set(referencedMediaIds(state)),seen=new Set();let bytes=0;
  const clean=manifest.map(item=>{const d=validateMediaDescriptor(item);if(!wanted.has(d.id)||seen.has(d.id))throw Error('云配图没有对应动作或重复。');seen.add(d.id);bytes+=d.bytes;return d;});
  if(bytes>MAX_CLOUD_IMAGE_BYTES)throw Error('云备份配图超过 50 MB。');
  if(complete&&wanted.size!==seen.size)throw Error('仍有配图未上传，不能显示含图备份完成。');
  return clean;
}
export function imageBase64(bytes){let value='';for(let n=0;n<bytes.length;n+=0x8000)value+=String.fromCharCode(...bytes.subarray(n,n+0x8000));return btoa(value);}
export async function describeImage(id,blob){
  if(!(blob instanceof Blob)||!blob.size||blob.size>MAX_ACTIVITY_IMAGE_BYTES||!imageTypeOK(blob.type)||!mediaIdOK(id))throw Error('本机配图格式或大小无效。');
  const bytes=new Uint8Array(await blob.arrayBuffer());if(!imageSignatureOK(bytes,blob.type))throw Error('本机配图内容无效。');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  return {descriptor:{id,sha256,type:blob.type,bytes:bytes.length},data:imageBase64(bytes)};
}
