(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WhereitisHealthCache=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function create({now=Date.now,ttl=60000}={}){
  let current=null,pending=null,generation=0;
  const copy=value=>JSON.parse(JSON.stringify(value));
  function clear(){current=null;pending=null;generation++;}
  async function get(scope,load,{fresh=false}={}){
   if(fresh||current&&current.scope!==scope||pending&&pending.scope!==scope)clear();
   if(current&&current.until>now())return copy(current.value);
   if(pending)return copy(await pending.job);
   const epoch=generation,job=Promise.resolve().then(load);pending={scope,job};
   try{const value=await job;if(epoch===generation&&value&&value.authenticated!==false&&value.configured!==false)current={scope,value:copy(value),until:now()+ttl};return copy(value);}
   finally{if(pending?.job===job)pending=null;}
  }
  return {get,clear};
 }
 return {create};
});
