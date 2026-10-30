import {esc} from './ui.js';
import {syncRecordTitle,syncProjection,stableJSON,syncState} from './sync-data.js';
import {cloudTextSummary} from './cloud-backup.js';
import {initialState} from './domain.js';
import {accountSummaryHTML} from './account-view.js';
const labels={off:'自动同步未开启',syncing:'正在同步…',pending:'本机已保存，等待同步',conflict:'有不同版本，等你核对',login:'登录后继续同步',offline:'离线保存中，联网后再同步',error:'同步暂未完成，本机资料保留',complete:'资料已同步',deferred:'正在编辑或训练，云端更新稍后合并',images:'文字已保存，部分配图待同步',manual:'当前浏览器请使用手动同步'};
export const syncStatusText=status=>status?.error||labels[status?.mode]||'本机保存 · 可开启云同步';
function variant(row,kind){
  if(row?.deleted)return '<p class="sync-deleted">这个版本删除了该记录</p>';const d=row?.data;let summary='';
  if(kind==='profile')summary=`称呼：${d?.name||'未填写'}\n训练目标：${d?.goalText||'未填写'}\n需要留意的身体情况：${d?.bodyNotes||'未填写'}\n训练经历：${d?.experience==='regular'?'有规律训练经历':'刚开始 / 重新开始'}`;
  else if(kind==='sessions')summary=`实际时长：${d?.actualMinutes??'未写'} 分钟\n${(d?.items||[]).map(i=>`${i.activitySnapshot?.name||i.customName||'动作记录'}：${(i.actualSetDetails||[]).map(s=>`${s.loadKg!=null?s.loadKg+'kg × ':''}${s.reps!=null?s.reps+'次':s.seconds!=null?s.seconds+'秒':'已记一组'}`).join('；')||i.status}`).join('\n')}\n感受：${d?.feedback||'未填写'}`;
  else if(kind==='media')summary=`配图：${d?.bytes?Math.round(d.bytes/1024)+' KB':'未写'}\n内容校验：${d?.sha256?.slice(-10)||''}`;
  else summary=String(d?.text||d?.feedback||d?.description||d?.name||d?.goalText||d?.endedAt||'查看字段以核对');
  return `<p>${esc(summary.slice(0,1000))}</p><details><summary>查看完整字段</summary><pre>${esc(JSON.stringify(d,null,2))}</pre></details>`;
}
export function syncPanelHTML(meta,status,{session=false,preview=null}={}){
  const enabled=Boolean(meta?.enabled),groups=new Map();for(const c of meta?.conflicts||[]){if(!groups.has(c.key))groups.set(c.key,[]);groups.get(c.key).push(c);}
  const remaining=[...groups.values()].filter(g=>g.some(c=>!meta.choices?.[c.id])).length;
  let content=`<div class="section-heading"><h2>自动同步</h2><span class="account-label sync-state-${esc(status?.mode||'off')}" data-sync-status>${esc(syncStatusText(status))}</span></div><p class="small muted">App 打开且联网时同步已保存资料与配图；当前训练草稿、计时器和设备密钥留在本机。</p>`;
  if(session)content+=`<div class="account-buttons">${enabled?'<button class="secondary" data-sync-action="now">现在同步</button><button class="text-button" data-sync-action="pause">暂停自动同步</button>':`<button class="primary" data-sync-action="prepare">${meta?.initialized?'继续同步':'开启自动同步'}</button>`}</div>`;
  else content+='<p class="small muted">先登录当前账号，已保存在本机的资料仍可使用。</p>';
  if(session&&meta?.localMissing)content+='<p class="account-note">本机缓存缺失，已暂停发送删除；云端资料与待传队列仍保留。</p><button class="secondary" data-sync-action="prepare-recovery">核对并恢复本机缓存</button>';
  if(meta?.lastCompleteAt)content+=`<p class="small muted">上次完整同步：${esc(new Date(meta.lastCompleteAt).toLocaleString('zh-CN'))}</p>`;
  if(status?.mode==='images')content+=`<p class="account-note">还有 ${Number(status.missingImages)||'部分'} 张配图待处理；保持打开会继续同步。来源已过期的图需要重新解析；试用配图范围为200张/50MB。</p>`;
  if(preview){
    const local=cloudTextSummary(preview.local.state),remote=cloudTextSummary(syncState(preview.remote.documents)),pristine=stableJSON(syncProjection(preview.local.state))===stableJSON(syncProjection(initialState()));
    if(preview.recovery)content+=`<form id="sync-recover-form" class="sync-enable-preview"><h3>恢复当前账号的本机缓存</h3><p>云端资料</p>${accountSummaryHTML(remote)}<p>恢复已同步资料，同时保留尚未确认送达的队列和本机新增内容；出现不同版本时仍由你核对。</p><label class="checkbox-line"><input type="checkbox" name="confirmed" required>确认恢复此账号；不向云端发送清空指令</label><div class="account-buttons"><button class="primary" type="submit">恢复本机资料</button><button class="secondary" type="button" data-sync-action="cancel">取消</button></div></form>`;
    else content+=`<form id="sync-enable-form" class="sync-enable-preview"><h3>先核对这次同步</h3><p>当前账号本机</p>${accountSummaryHTML(local)}<p>账号云端</p>${accountSummaryHTML(remote)}<label class="checkbox-line"><input type="radio" name="mode" value="merge" ${pristine&&preview.hasCloud?'':'checked'}>合并两边资料；不同版本先保留，交给我核对</label>${pristine?`<label class="checkbox-line"><input type="radio" name="mode" value="pull" ${preview.hasCloud?'checked':''}>从云端资料开始（当前本机为空）</label>`:''}<label class="checkbox-line"><input type="checkbox" name="confirmed" required>我同意将此账号已保存的资料与配图用于云同步</label><div class="account-buttons"><button class="primary" type="submit">确认开启同步</button><button class="secondary" type="button" data-sync-action="cancel">取消</button></div></form>`;
  }
  if(enabled&&groups.size){content+=`<section class="sync-conflicts"><div class="section-heading"><h3>核对 ${groups.size} 条不同版本</h3><button class="secondary" data-sync-action="refresh">刷新云端版本</button></div><p class="small muted">先选择，再一起提交；未确认前不覆盖任何版本。其他设备提交的候选也会在这里显示。</p>`;
    for(const group of groups.values()){
      const first=group[0],remote=first.currentRemote||first.remote,mine=group.find(c=>meta.choices?.[c.id]==='local'),cloudChosen=!mine&&group.every(c=>meta.choices?.[c.id]==='remote');
      content+=`<article class="sync-conflict"><h3>${esc(syncRecordTitle({kind:first.kind,id:first.recordId,data:remote.data||first.local.data}))}</h3><section class="sync-variant sync-cloud ${cloudChosen?'selected':''}"><strong>当前云端版本</strong>${variant(remote,first.kind)}<button class="secondary" data-sync-choice="${esc(first.id)}" data-sync-side="remote">${cloudChosen?'✓ 已选择云端':'采用云端版本'}</button></section>${group.map(c=>`<section class="sync-variant ${mine?.id===c.id?'selected':''}"><strong>待提交版本 · 设备 ${esc(c.deviceId?.slice(-4)||'未知')}</strong>${variant(c.local,c.kind)}${c.reason?`<p class="account-note">${esc(c.reason)}</p>`:''}<button class="secondary" data-sync-choice="${esc(c.id)}" data-sync-side="local" ${c.localChoiceBlocked?'disabled':''}>${mine?.id===c.id?'✓ 已选择此版本':'采用这份待提交版本'}</button></section>`).join('')}</article>`;
    }
    content+=`<p class="small muted">${remaining?`还有 ${remaining} 条没有选择。`:'选择已核对，可以一起提交。'}</p><button class="primary full" data-sync-action="submit-choices" ${remaining?'disabled':''}>提交已核对的选择</button></section>`;
  }
  return `<section class="card sync-panel" data-sync-panel>${content}</section>`;
}
