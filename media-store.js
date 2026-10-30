import {compressActivityImage,MAX_ACTIVITY_IMAGE_BYTES} from './image-compression.js';
const DB_NAME='xundong-media-v1',ACCOUNT_DB='xundong-account-media-v1',STORE='images',VERSION=1;
const dbPromises=new Map();
let activeMediaScope='guest';
export function setMediaScope(scope){if(typeof scope!=='string'||!scope||scope.length>500)throw Error('图片分区无效。');activeMediaScope=scope;}
export const mediaStorageKey=(scope,id)=>scope==='guest'?String(id):JSON.stringify([scope,String(id)]);
function db(scope){
  if(!('indexedDB'in globalThis))return Promise.reject(new Error('当前浏览器不支持本机图片存储。'));
  const name=scope==='guest'?DB_NAME:ACCOUNT_DB;
  if(!dbPromises.has(name))dbPromises.set(name,new Promise((resolve,reject)=>{const req=indexedDB.open(name,VERSION);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();dbPromises.delete(name);};resolve(req.result);};req.onerror=()=>{dbPromises.delete(name);reject(req.error||new Error('无法打开本机图片存储。'));};}));
  return dbPromises.get(name);
}
export const saveImage=(id,blob)=>saveScopedImage(activeMediaScope,id,blob);
export async function saveScopedImage(scope,id,blob){
  const compact=await compressActivityImage(blob);
  return saveVerifiedScopedImage(scope,id,compact);
}
// Cloud bytes are already size/type/hash checked; avoid lossy re-encoding on each restore.
export async function saveVerifiedScopedImage(scope,id,blob){
  if(!(blob instanceof Blob)||!blob.size||blob.size>MAX_ACTIVITY_IMAGE_BYTES||!['image/jpeg','image/png','image/webp'].includes(blob.type))throw Error('配图格式或大小无效。');
  const key=mediaStorageKey(scope,id),database=await db(scope);await new Promise((resolve,reject)=>{const tx=database.transaction(STORE,'readwrite');tx.objectStore(STORE).put({id:key,blob,version:crypto.randomUUID(),createdAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('保存动作截图失败。'));tx.onabort=()=>reject(tx.error||new Error('保存动作截图失败。'));});
  return String(id);
}
export const readImage=id=>readScopedImage(activeMediaScope,id);
export async function readScopedImage(scope,id){
  return (await readScopedImageRecord(scope,id))?.blob||null;
}
export async function readScopedImageRecord(scope,id){if(!id)return null;const key=mediaStorageKey(scope,id),database=await db(scope);return new Promise((resolve,reject)=>{const req=database.transaction(STORE,'readonly').objectStore(STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error('读取动作截图失败。'));});}
