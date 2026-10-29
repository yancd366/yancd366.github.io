(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WhereitisBrowserDrafts=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const clone=x=>JSON.parse(JSON.stringify(x));
 function create(driver){const versions=new Map();let queue=Promise.resolve();const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};return {
  all:()=>serial(async()=>{const rows=await driver.all();return rows.sort((a,b)=>a.updated-b.updated).map(x=>clone(x.value));}),
  read:id=>serial(async()=>{const row=await driver.get(id);versions.set(id,row?.version||0);return row?clone(row.value):null;}),
  write(value){const copy=clone(value);copy.history=[];return serial(async()=>{let expected=versions.get(copy.id);if(expected===undefined){const old=await driver.get(copy.id);if(old&&old.value.revision>copy.revision)throw new Error('已有更新的草稿，请先打开原草稿再继续');expected=old?.version||0;}await driver.put(copy.id,expected,{id:copy.id,value:copy,updated:Date.now(),version:expected+1});versions.set(copy.id,expected+1);});},
  remove:id=>serial(async()=>{await driver.remove(id);versions.delete(id);}),
  clear:()=>serial(async()=>{await driver.clear();versions.clear();})
 };}
 let database,adapter;
 async function open(){if(database)return database;const scope=globalThis.WhereitisWeb?.storageId||'local-preview';database=new Promise((resolve,reject)=>{const r=indexedDB.open('whereitis-drafts-v1-'+scope,1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('无法打开草稿存储，请检查浏览器空间'));});return database;}
 async function transaction(mode,run){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode),store=tx.objectStore('drafts');let result,error;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(error||new Error('草稿未可靠保存，请先保留本页内容'));run(store,v=>result=v,e=>{error=e;tx.abort();});});}
 function current(){if(adapter)return adapter;adapter=create({all:()=>transaction('readonly',(s,done)=>{const r=s.getAll();r.onsuccess=()=>done(r.result);}),get:id=>transaction('readonly',(s,done)=>{const r=s.get(id);r.onsuccess=()=>done(r.result);}),put:(id,expected,value)=>transaction('readwrite',(s,done,abort)=>{const r=s.get(id);r.onsuccess=()=>{if((r.result?.version||0)!==expected){abort(new Error('另一标签页已经修改草稿，请保留当前内容，再打开最新草稿'));return;}s.put(value);done();};}),remove:id=>transaction('readwrite',(s,done)=>{s.delete(id);done();}),clear:()=>transaction('readwrite',(s,done)=>{s.clear();done();})});return adapter;}
 return {create,all:()=>current().all(),read:id=>current().read(id),write:s=>current().write(s),remove:id=>current().remove(id),clear:()=>current().clear()};
});
