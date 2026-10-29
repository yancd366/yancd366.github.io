(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WhereitisRecognitionHistory=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const fields=['name','category','quantity','aliases','note','clothingType','color','material','materialSource','materialEvidence','size','brand'];
 const limits={name:80,category:30,aliases:400,note:1000,clothingType:30,color:40,material:100,materialSource:30,materialEvidence:400,size:40,brand:80};
 const labels={name:'名称',category:'类别',quantity:'数量',aliases:'别名',note:'备注',clothingType:'款式',color:'颜色',material:'材质',materialSource:'材质来源',materialEvidence:'材质依据',size:'尺码',brand:'品牌'};
 const maxEntries=200,clone=x=>JSON.parse(JSON.stringify(x));
 function fail(message){throw new Error(message);}
 function plain(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}
 function snapshot(row){
  if(!plain(row))fail('识别快照格式无效');const out={};
  fields.forEach(key=>{if(key==='quantity'){const value=row[key];out[key]=value==null||value===''?null:Number(value);if(out[key]!==null&&(!Number.isInteger(out[key])||out[key]<1||out[key]>999))fail('识别快照数量应为1～999，未知可留空');return;}const value=row[key]===undefined?(key==='materialSource'?'unknown':''):row[key];if(typeof value!=='string'||value.length>limits[key])fail('识别快照'+labels[key]+'无效或过长');out[key]=value.trim();});
  if(!out.name||!out.category)fail('识别快照需要物品名称和类别');if(!['unknown','manual','spoken','label_text','product_text'].includes(out.materialSource))fail('识别快照材质来源无效');return out;
 }
 function normalizedSnapshot(raw){if(!plain(raw)||Object.keys(raw).some(k=>!fields.includes(k)))fail('识别快照包含不支持的字段');return snapshot(raw);}
 function normalizeEntries(raw){
  if(!Array.isArray(raw)||raw.length>maxEntries)fail('每件物品最多保留200条纠正过程，请先导出记录');const ids=new Set();
  return raw.map(entry=>{if(!plain(entry)||Object.keys(entry).some(k=>!['id','at','source','instruction','before','after','model','action'].includes(k)))fail('识别纠正记录格式无效');
   if(typeof entry.id!=='string'||!entry.id.trim()||entry.id.length>120||ids.has(entry.id))fail('识别纠正编号无效或重复');ids.add(entry.id);
   if(typeof entry.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.at)||!Number.isFinite(Date.parse(entry.at))||new Date(entry.at).toISOString()!==entry.at)fail('识别纠正时间无效');
   if(!['text','voice'].includes(entry.source)||!['applied','reverted'].includes(entry.action))fail('识别纠正来源或操作无效');
   if(typeof entry.instruction!=='string'||!entry.instruction.trim()||entry.instruction.length>4000)fail('识别纠正原话应为1～4000字');if(typeof entry.model!=='string'||entry.model.length>100)fail('识别纠正模型信息无效');
   return {id:entry.id,at:entry.at,source:entry.source,instruction:entry.instruction.trim(),before:normalizedSnapshot(entry.before),after:normalizedSnapshot(entry.after),model:entry.model,action:entry.action};
  });
 }
 function normalize(item){
  const out={};if(item.recognitionOrigin!==undefined)out.recognitionOrigin=normalizedSnapshot(item.recognitionOrigin);
  if(item.recognitionCorrections!==undefined){if(!out.recognitionOrigin)fail('纠正记录缺少最初识别快照');out.recognitionCorrections=normalizeEntries(item.recognitionCorrections);}
  return out;
 }
 function append(row,options){
  const previous=normalize(row),origin=previous.recognitionOrigin||snapshot(row),entries=previous.recognitionCorrections||[];if(entries.length>=maxEntries)fail('已到200条纠正上限，不能继续追加；可导出留存，旧历史不会被截断');
  const before=snapshot(row),after=snapshot(Object.assign({},row,options.after||{})),entry={id:'correction_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10),at:new Date().toISOString(),source:options.source,instruction:options.instruction,before,after,model:options.model||'',action:options.action||'applied'};
  return {recognitionOrigin:clone(origin),recognitionCorrections:normalizeEntries(entries.concat(entry))};
 }
 function merge(existing,input){
  if(input.recognitionOrigin===undefined&&input.recognitionCorrections===undefined)return {};
  const previous=normalize(existing),incoming=normalize({recognitionOrigin:input.recognitionOrigin===undefined?previous.recognitionOrigin:input.recognitionOrigin,recognitionCorrections:input.recognitionCorrections===undefined?previous.recognitionCorrections:input.recognitionCorrections});
  if(previous.recognitionOrigin&&JSON.stringify(previous.recognitionOrigin)!==JSON.stringify(incoming.recognitionOrigin))fail('最初识别快照不能被覆盖');
  const old=previous.recognitionCorrections||[],next=incoming.recognitionCorrections||[];if(next.length<old.length||old.some((entry,i)=>JSON.stringify(entry)!==JSON.stringify(next[i])))fail('已有纠正历史不能删除或改写');return incoming;
 }
 function line(row,keys){return keys.map(k=>labels[k]+'：'+(row[k]==null||row[k]===''?'未确定':String(row[k]))).join(' · ');}
 function view(item){const history=normalize(item),origin=history.recognitionOrigin;if(!origin)return {originLabel:'',steps:[]};return {originLabel:line(origin,['name','category','quantity']),steps:(history.recognitionCorrections||[]).map(entry=>{let changed=fields.filter(k=>entry.before[k]!==entry.after[k]);if(!changed.length)changed=['name'];return {id:entry.id,at:entry.at,instruction:entry.instruction,model:entry.model,actionLabel:entry.action==='reverted'?'撤销这次纠正':'应用纠正',sourceLabel:entry.source==='voice'?'语音补充':'文字补充',beforeLabel:line(entry.before,changed),afterLabel:line(entry.after,changed)};})};}
 return {fields,maxEntries,snapshot,append,normalize,validateItem:normalize,merge,view};
});
