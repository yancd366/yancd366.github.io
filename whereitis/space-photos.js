(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WhereitisSpacePhotos=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const maxCount=9,maxBytes=10*1024*1024;
 function bytes(value){const m=String(value||'').match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!m)throw new Error('照片格式无法读取，请重选或重新拍摄');return m[1].length*3/4-(m[1].endsWith('==')?2:m[1].endsWith('=')?1:0);}
 async function prepare(files,convert,progress){if(!files.length||files.length>maxCount)throw new Error('每次最多9张空间照片');let images=[];for(let i=0;i<files.length;i++){progress?.('压缩照片 '+(i+1)+' / '+files.length);images.push(await convert(files[i],{maxEdge:1600,quality:70}));}let size=images.reduce((n,x)=>n+bytes(x),0);if(size>maxBytes){images=[];for(let i=0;i<files.length;i++){progress?.('进一步压缩照片 '+(i+1)+' / '+files.length);images.push(await convert(files[i],{maxEdge:1100,quality:55}));}size=images.reduce((n,x)=>n+bytes(x),0);}if(size>maxBytes)throw new Error('这些照片压缩后仍较大，请分两次补充同一个空间');return images;}
 return {maxCount,maxBytes,bytes,prepare};
});
