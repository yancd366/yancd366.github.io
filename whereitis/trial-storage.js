(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WhereitisTrialStorage=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const clone=value=>JSON.parse(JSON.stringify(value));
 function create(driver,initial,notify=()=>{}){
  let value=clone(initial.value),revision=initial.revision,pending=Promise.resolve(),failed=null,serial=0,finished=0;
  return {read:()=>clone(value),write(next){if(failed)throw new Error('本机保存尚未成功，请先备份或重试');value=clone(next);const snapshot=clone(value),expected=revision++,current=++serial;notify('pending');pending=pending.then(()=>driver.save(expected,snapshot)).then(()=>{finished=current;if(finished===serial)notify('saved');}).catch(error=>{failed=error;notify('failed',error);throw error;});pending.catch(()=>{});},flush:()=>pending,isPending:()=>finished!==serial,snapshot:()=>clone(value),error:()=>failed};
 }
 async function open(storageId,empty,notify){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('whereitis-trial-v1-'+storageId,1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('无法打开本机存储，请退出无痕模式或检查浏览器设置'));r.onblocked=()=>reject(new Error('请关闭其他在哪儿网页后重试'));});
  function transact(mode,fn){return new Promise((resolve,reject)=>{const tx=db.transaction('data',mode),store=tx.objectStore('data');let result,error;tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(error||new Error('本机保存失败，可能是空间不足；请先下载备份'));fn(store,v=>{result=v;},e=>{error=e;tx.abort();});});}
  let initial=await transact('readonly',(s,done)=>{const r=s.get('inventory');r.onsuccess=()=>done(r.result);});
  if(!initial)initial={revision:0,value:empty};
  const driver={save(expected,value){return transact('readwrite',(s,done,abort)=>{const r=s.get('inventory');r.onsuccess=()=>{if((r.result?.revision||0)!==expected){abort(new Error('另一个标签页修改了记录。请先备份本页，再刷新读取最新记录'));return;}s.put({revision:expected+1,value},'inventory');done();};});}};
  const adapter=create(driver,initial,notify);if(initial.revision===0){adapter.write(initial.value);await adapter.flush();}return adapter;
 }
 return {create,open};
});
