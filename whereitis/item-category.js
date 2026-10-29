(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WhereitisItemCategory=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const styles={'衣服':['👕','green'],'鞋子':['👟','blue'],'食物':['🥣','orange'],'水果':['🍎','rose'],'蔬果':['🥬','green'],'药品':['✚','blue'],'工具':['⚒','sand'],'数码配件':['⚡','blue'],'证件资料':['▤','sand'],'书籍':['▥','sand'],'家电':['▣','blue'],'日常用品':['◇','green']};
 function badge(category){const pending=!category||['其他','待分类','待定'].includes(category),s=styles[category]||['●','gray'];return {label:pending?'待分类':category,glyph:pending?'○':s[0],tone:pending?'gray':s[1]};}
 function choices(names){return Array.from(new Set(['其他','衣服','鞋子','食物','水果','药品'].concat(names||[]))).map(name=>({name,...badge(name)}));}
 return {badge,choices};
});
