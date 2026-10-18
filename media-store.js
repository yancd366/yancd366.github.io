import {compressActivityImage} from './image-compression.js';
const DB_NAME='xundong-media-v1',STORE='images',VERSION=1;
let dbPromise;
function db(){
  if(!('indexedDB'in globalThis))return Promise.reject(new Error('当前浏览器不支持本机图片存储。'));
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();dbPromise=null;};resolve(req.result);};req.onerror=()=>{dbPromise=null;reject(req.error||new Error('无法打开本机图片存储。'));};});
  return dbPromise;
}
export async function saveImage(id,blob){
  const compact=await compressActivityImage(blob);
  const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction(STORE,'readwrite');tx.objectStore(STORE).put({id:String(id),blob:compact,createdAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('保存动作截图失败。'));tx.onabort=()=>reject(tx.error||new Error('保存动作截图失败。'));});
  return String(id);
}
export async function readImage(id){
  if(!id)return null;const database=await db();return new Promise((resolve,reject)=>{const req=database.transaction(STORE,'readonly').objectStore(STORE).get(String(id));req.onsuccess=()=>resolve(req.result?.blob||null);req.onerror=()=>reject(req.error||new Error('读取动作截图失败。'));});
}
