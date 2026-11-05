// Separate, account-scoped local conversations; never included in business backups.
import {cleanCloudValue} from './cloud-backup.js';
let database;
async function db(){if(!database)database=new Promise((resolve,reject)=>{const r=indexedDB.open('xundong-assistant-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('threads',{keyPath:'scope'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=null;reject(Error('会话暂时无法保存在本机。'));};});return database;}
export const assistantStore={
 async load(scope){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('threads').objectStore('threads').get(scope);r.onsuccess=()=>resolve(r.result?.thread||null);r.onerror=()=>reject(Error('会话读取失败。'));});},
 async save(scope,thread){cleanCloudValue(thread);if(JSON.stringify(thread).length>1_500_000)throw Error('当前对话较长，请开始新对话。');const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('threads','readwrite'),os=tx.objectStore('threads'),r=os.get(scope);let saved,reason;
 r.onsuccess=()=>{const old=r.result,history=old?.history||[],previous=old?.thread?.id===thread.id?old.thread:history.find(t=>t.id===thread.id);if(previous&&(previous.revision||0)!==(thread.revision||0)){reason='另一页面更新了这段对话，请重新打开后继续。';tx.abort();return;}saved={...structuredClone(thread),revision:(previous?.revision||0)+1};const row={scope,thread:saved,history:old?.thread?.id!==thread.id&&old?.thread?[old.thread,...history.filter(t=>t.id!==thread.id)]:history};if(JSON.stringify(row).length>10_000_000){reason='本机会话空间已满，请先保留当前文字；已保存动作仍可使用。';tx.abort();return;}os.put(row);};
 tx.oncomplete=()=>resolve(saved);tx.onerror=tx.onabort=()=>reject(Error(reason||'会话保存失败。'));});},
 async history(scope){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('threads').objectStore('threads').get(scope);r.onsuccess=()=>resolve([r.result?.thread,...(r.result?.history||[])].filter(Boolean));r.onerror=()=>reject(Error('对话列表读取失败。'));});}
};
