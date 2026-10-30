import {accountOrigin,validateAccountScope} from './account-scope.js';
import {validateMediaDescriptor,describeImage,imageSignatureOK} from './cloud-media.js';
import {validateSyncDocuments} from './sync-data.js';
export class AccountAPIError extends Error{constructor(message,code='network'){super(message);this.code=code;}}
const ERRORS={login_required:'登录已到期，请重新输入邀请登录码。',invalid_credentials:'登录码无效或已停用。',login_rate_limited:'登录尝试过多，请稍后再试。',backup_limit:'云备份已满，请先删除不需要的旧备份。',not_found:'这份云备份已不存在，请刷新列表。',invalid_backup:'备份未通过校验，请先导出本机备份检查内容。',invalid_image:'配图校验未通过，请换图或只备份文字。',media_missing:'仍有配图未上传，请重新核对。',storage_unavailable:'云备份服务暂不可用，本机记录仍保留。'};
Object.assign(ERRORS,{sync_unavailable:'同步数据库尚未启用，本机资料继续保留。',sync_busy:'其他设备正在提交，稍后自动重试。',sync_conflict_changed:'云端或本机版本又有修改，请重新核对。',sync_dependencies:'修改涉及关联条目或配图限额，请保留备份并核对相关内容。',sync_conflict_large:'这条冲突较大，请先导出双方版本后处理。',sync_conflict_limit:'待核对冲突过多，请先处理已有冲突。',sync_size:'同步资料达到容量限制，请先导出备份并整理范围。',invalid_sync:'同步条目未通过校验，本机与云端原资料都保留。'});
export function validateAccountSession(value,now=Date.now()){
  const scope=validateAccountScope(value);
  if(typeof value.token!=='string'||!/^xd-session-v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value.token)||value.token.length>2048||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=now||Date.parse(value.expiresAt)>now+12*60*60*1000+60000)throw new AccountAPIError('登录已到期，请重新登录。','login_required');
  let c;try{c=JSON.parse(atob(value.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{throw new AccountAPIError('登录会话格式无效，请重新登录。','login_required');}
  // The server verifies the signature. The client also binds the displayed
  // owner to the token subject, so mixed-up cached metadata cannot misfile data.
  if(c?.aud!=='xundong-accounts'||c.sub!==scope.userId||!Number.isSafeInteger(c.epoch)||c.epoch<1||!Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||c.exp-c.iat!==43200||c.exp*1000!==Date.parse(value.expiresAt)||c.iat*1000>now+60000||!/^[a-f0-9-]{36}$/.test(c.jti||''))throw new AccountAPIError('登录会话与账号不一致，请重新登录。','login_required');
  return {...scope,token:value.token,expiresAt:value.expiresAt};
}
export function createAccountClient(base,{fetchImpl=(...args)=>fetch(...args)}={}){
  const origin=accountOrigin(base);if(!origin)throw Error('请填写管理员提供的杭州阿里云账号服务地址。');
  async function call(path,{session,body,method='GET',signal,binary=false,maxReplyBytes=5_100_000}={}){
    if(session)validateAccountSession(session);
    if(session&&session.serviceOrigin!==origin)throw Error('账号服务不匹配，请重新登录。');
    const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)abort.abort();const timer=setTimeout(()=>abort.abort(),30000);
    try{
      let res;try{res=await fetchImpl(`${origin}/v1/account${path}`,{method,mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',signal:abort.signal,headers:{...(session?{Authorization:`Bearer ${session.token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw new AccountAPIError(signal?.aborted?'操作已取消。':'暂时无法连接账号服务，本机记录没有改变。');}
      if(binary&&res.ok){const reader=res.body.getReader(),chunks=[];let bytes=0;try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>512000){await reader.cancel();throw new AccountAPIError('配图过大。','invalid_response');}chunks.push(value);}}finally{reader.releaseLock();}return new Blob(chunks,{type:res.headers.get('Content-Type')?.split(';')[0]||''});}
      const reader=res.body?.getReader(),decoder=new TextDecoder();let text='',bytes=0;
      if(reader)try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxReplyBytes){await reader.cancel();throw new AccountAPIError('服务返回内容过大。','invalid_response');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
      let value;try{value=JSON.parse(text);}catch{throw new AccountAPIError('账号服务返回格式无效。','invalid_response');}
      if(!res.ok)throw new AccountAPIError(ERRORS[value?.error]||'操作未完成，本机记录没有改变。',value?.error||'server');
      return value;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  const id=key=>{if(typeof key!=='string'||!/^\d{13}-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(key))throw Error('云备份编号无效。');return encodeURIComponent(key);};
  return {
    async login(loginCode,signal){const r=await call('/login',{method:'POST',body:{loginCode},signal});return validateAccountSession({...r.user,serviceOrigin:origin,token:r.token,expiresAt:r.expiresAt});},
    me:(session,signal)=>call('/me',{session,signal}),
    async syncRead(session,cursor,signal){const r=await call(`/sync${cursor===undefined?'':`?cursor=${encodeURIComponent(cursor)}`}`,{session,signal,maxReplyBytes:12_100_000});if(!Number.isSafeInteger(r?.cursor)||r.cursor<0)throw Error('同步游标无效。');if(!r.unchanged){if(r.protocol!==1||!r.documents||Object.keys(r.documents).length>10000||!Array.isArray(r.conflicts)||r.conflicts.length>120)throw Error('云端同步格式无效。');validateSyncDocuments(r.documents);for(const d of Object.values(r.documents))if(!Number.isSafeInteger(d.revision)||d.revision<1||d.revision>r.cursor||typeof d.deleted!=='boolean')throw Error('同步记录版本无效。');}return r;},
    async syncPush(session,op,signal){const r=await call('/sync',{method:'POST',session,body:op,signal,maxReplyBytes:12_100_000});if(!['ok','conflict'].includes(r?.status)||!Number.isSafeInteger(r.cursor)||r.cursor<1||!Array.isArray(r.accepted))throw Error('同步回执无效。');if(r.status==='ok'&&(r.accepted.length!==op.changes.length||new Set(r.accepted.map(x=>x.key)).size!==r.accepted.length||r.accepted.some(x=>!op.changes.some(c=>c.kind+'/'+c.id===x.key)||!Number.isSafeInteger(x.revision)||x.revision<0||x.revision>r.cursor)))throw Error('同步回执与队列不一致。');return r;},
    async logout(session,signal){const r=await call('/logout',{method:'POST',session,signal});if(r?.loggedOut!==true)throw new AccountAPIError('云端会话撤销未确认。','invalid_response');return r;},
    async list(session,cursor='',signal){if(typeof cursor!=='string'||cursor.length>2048)throw Error('分页参数无效。');const r=await call(`/backups${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,{session,signal});if(!Array.isArray(r?.items)||r.items.length>20||r.nextCursor!=null&&(typeof r.nextCursor!=='string'||r.nextCursor.length>2048))throw Error('云备份列表无效。');for(const x of r.items){id(x.id);if(!Number.isFinite(Date.parse(x.createdAt)))throw Error('云备份日期无效。');}return r;},
    async upload(session,state,signal,media){const r=await call('/backups',{method:'POST',session,body:{confirmed:true,state,...(media!==undefined?{media}:{})},signal});id(r?.id);if(!Number.isFinite(Date.parse(r.createdAt))||r.includesImages!==(media!==undefined))throw new AccountAPIError('服务尚未确认备份已保存。','invalid_response');return r;},
    async read(session,key,signal){const r=await call(`/backups/${id(key)}`,{session,signal});if(r?.id!==key||typeof r.includesImages!=='boolean')throw new AccountAPIError('备份编号或格式不一致。','invalid_response');return r;},
    async uploadImage(session,key,blob,signal){const {descriptor,data}=await describeImage(key,blob);const r=await call('/media',{method:'POST',session,body:{confirmed:true,id:key,type:blob.type,data},signal});if(JSON.stringify(validateMediaDescriptor(r))!==JSON.stringify(descriptor))throw new AccountAPIError('配图上传未通过完整性校验。','invalid_response');return descriptor;},
    async readImage(session,item,signal){const d=validateMediaDescriptor(item),blob=await call(`/media/${d.sha256}`,{session,signal,binary:true});const checked=await describeImage(d.id,blob);if(checked.descriptor.sha256!==d.sha256||blob.type!==d.type||blob.size!==d.bytes||!imageSignatureOK(new Uint8Array(await blob.arrayBuffer()),d.type))throw new AccountAPIError('配图下载未通过校验。','invalid_response');return blob;},
    async remove(session,key,signal){const r=await call(`/backups/${id(key)}`,{method:'DELETE',session,signal});if(r?.deleted!==true)throw new AccountAPIError('服务尚未确认删除。','invalid_response');return r;}
  };
}
