import {scopeStoreKey} from './account-scope.js';
export const defaultSyncMeta=()=>({enabled:false,initialized:false,deviceId:crypto.randomUUID(),cursor:0,baseline:{},pending:null,conflicts:[],choices:{},media:[],lastCompleteAt:null,lastError:null});
let database;
function db(){if(!database)database=new Promise((resolve,reject)=>{const r=indexedDB.open('xundong-sync-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('metadata',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=null;reject(Error('无法读取本机同步队列。'));};});return database;}
export const browserSyncMetadata={
  async load(scope){const d=await db(),id=scopeStoreKey(scope);return new Promise((resolve,reject)=>{const r=d.transaction('metadata','readonly').objectStore('metadata').get(id);r.onsuccess=()=>resolve(r.result?.value||defaultSyncMeta());r.onerror=()=>reject(Error('无法读取本机同步队列。'));});},
  async save(scope,value){const d=await db(),id=scopeStoreKey(scope);await new Promise((resolve,reject)=>{const tx=d.transaction('metadata','readwrite');tx.objectStore('metadata').put({id,value:structuredClone(value)});tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('同步队列保存失败；本机记录仍保留。'));});}
};
