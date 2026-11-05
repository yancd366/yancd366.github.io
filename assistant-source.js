// Public contract only. Retrieval is performed by authenticated server code.
export function validateTeachingSource(value){
 let url;try{url=new URL(value?.url);}catch{throw Error('教学来源地址无效。');}
 if(value?.format!=='xundong-teaching-v1'||url.protocol!=='https:'||url.username||url.password||typeof value.title!=='string'||value.title.length>240||typeof value.text!=='string'||value.text.length<80||value.text.length>12000||!/^web-[a-f0-9]{24}$/.test(value.evidenceId||'')||!Number.isFinite(Date.parse(value.readAt)))throw Error('教学来源未通过格式校验。');
 return {format:value.format,url:url.href,title:value.title,text:value.text,evidenceId:value.evidenceId,readAt:value.readAt,truncated:Boolean(value.truncated)};
}
