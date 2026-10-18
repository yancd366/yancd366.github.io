export const MAX_ACTIVITY_IMAGE_BYTES=512_000;
export const TARGET_ACTIVITY_IMAGE_BYTES=260_000;
export const MAX_ACTIVITY_IMAGE_SIDE=1280;
export const MAX_IMAGE_INPUT_BYTES=20_000_000;
const TYPES=new Set(['image/jpeg','image/webp','image/png']);

// The encoder is injectable so format fallback and size budgeting can be checked
// without assuming a browser honours a requested MIME type or quality parameter.
export async function encodeActivityImage(width,height,encode,{maxBytes=MAX_ACTIVITY_IMAGE_BYTES,targetBytes=TARGET_ACTIVITY_IMAGE_BYTES,maxSide=MAX_ACTIVITY_IMAGE_SIDE}={}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('图片尺寸无效，请换一张图片。');
  let best=null;const sizes=new Set();
  for(const side of [...new Set([maxSide,1024,800,640,480,320,240].filter(n=>n<=maxSide))]){
    const scale=Math.min(1,side/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    const key=`${w}x${h}`;if(sizes.has(key))continue;sizes.add(key);
    for(const quality of [.86,.76,.66]){
      const blob=await encode(w,h,'image/jpeg',quality);
      if(!blob||!TYPES.has(blob.type)||!blob.size)continue;
      if(blob.size<=maxBytes&&(!best||blob.size<best.size))best=blob;
      if(blob.size<=Math.min(targetBytes,maxBytes))return blob;
      // PNG fallback ignores the quality slider: go straight to a smaller size.
      if(blob.type==='image/png')break;
    }
    // Keep the larger dimensions if a readable JPEG fits the hard limit.
    if(best)return best;
  }
  throw new Error(`图片缩小后仍超过 ${Math.round(maxBytes/1000)} KB，请换一张截图后重试。`);
}

async function decodedImage(blob){
  if(typeof createImageBitmap==='function')try{
    const image=await createImageBitmap(blob);return {image,width:image.width,height:image.height,close:()=>image.close()};
  }catch{/* Some Safari/image-format combinations need the HTMLImageElement path. */}
  const url=URL.createObjectURL(blob),image=new Image();
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('图片读取超时，请换一张截图。')),15000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('无法读取这张图片，请使用 JPG、PNG 或 WebP 截图。'));};image.src=url;});}
  catch(error){URL.revokeObjectURL(url);throw error;}
  return {image,width:image.naturalWidth,height:image.naturalHeight,close:()=>URL.revokeObjectURL(url)};
}

export async function compressActivityImage(blob){
  if(!(blob instanceof Blob)||!blob.size)throw new Error('没有可保存的图片。');
  if(blob.size>MAX_IMAGE_INPUT_BYTES)throw new Error('请选择 20 MB 以内的图片。');
  const decoded=await decodedImage(blob),canvas=document.createElement('canvas');
  try{return await encodeActivityImage(decoded.width,decoded.height,(width,height,type,quality)=>{
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('当前浏览器无法处理图片。');
    context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(decoded.image,0,0,width,height);
    return new Promise((resolve,reject)=>{try{canvas.toBlob(resolve,type,quality);}catch{reject(new Error('图片编码失败，请换一张截图。'));}});
  });}finally{decoded.close();}
}
