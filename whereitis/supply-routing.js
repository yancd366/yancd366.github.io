(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WhereitisSupplyRouting=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function kind(row){if(row?.category)return row.category==='药品'?'medicine':row.category==='食物'?'food':'';return ['food','medicine'].includes(row?.supplyKind)?row.supplyKind:'';}
 function only(rows){return Array.isArray(rows)&&rows.length&&rows.every(x=>kind(x)===kind(rows[0]))?kind(rows[0]):'';}
 return {kind,only};
});
