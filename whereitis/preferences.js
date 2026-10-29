(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WhereitisPreferences=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const key='whereitis-ai-consent-v1';
 function create(adapter){return {enabled(){const value=adapter.read(key);return !!value&&value.version===1&&value.enabled===true;},decided(){const value=adapter.read(key);return !!value&&value.version===1&&typeof value.enabled==='boolean';},setEnabled(enabled){adapter.write(key,{version:1,enabled:!!enabled,updatedAt:new Date().toISOString()});}};}
 const notice='开启后，你主动提交的照片、录音和文字会经后端发送给阿里云百炼，用于识别、转写与理解。物品记录仍保存在本机，草稿经你确认后才保存。此选择只需一次，可随时在设置中关闭。';
 return {key,create,notice};
});
