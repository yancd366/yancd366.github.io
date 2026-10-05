const DB_NAME='xundong-media-v1',STORE='images',VERSION=1;
let dbPromise;
function db(){
  if(!('indexedDB'in globalThis))return Promise.reject(new Error('当前浏览器不支持本机图片存储。'));
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('无法打开本机图片存储。'));});
  return dbPromise;
}
export async function saveImage(id,blob){
  const image=await createImageBitmap(blob),scale=Math.min(1,480/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d',{alpha:false});if(!context){image.close();throw new Error('无法处理动作截图。');}
  context.drawImage(image,0,0,canvas.width,canvas.height);image.close();
  const compact=await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(new Error('无法压缩动作截图。')),'image/webp',0.72));
  if(compact.size>180_000)throw new Error('压缩后的动作截图仍然过大。');
  const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction(STORE,'readwrite');tx.objectStore(STORE).put({id:String(id),blob:compact,createdAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('保存动作截图失败。'));tx.onabort=()=>reject(tx.error||new Error('保存动作截图失败。'));});
  return String(id);
}
export async function readImage(id){
  if(!id)return null;const database=await db();return new Promise((resolve,reject)=>{const req=database.transaction(STORE,'readonly').objectStore(STORE).get(String(id));req.onsuccess=()=>resolve(req.result?.blob||null);req.onerror=()=>reject(req.error||new Error('读取动作截图失败。'));});
}
