import { esc,icon,dateText } from './ui.js';
import { activities } from './catalog.js';
import { LOAD_BASES,FEELINGS,setsText,weightReference,lastLoad,isLoaded,timeTarget } from './training.js';
import { abilityDimensions } from './abilities.js';
export const activityName=i=>i.activitySnapshot?.name||activities.find(a=>a.id===i.activityId)?.name||i.customName||'未命名动作';
export function recordedSetsHTML(item){
  return (item.actualSetDetails||[]).map((x,n)=>`<div class="set-line"><span>第 ${n+1} 组</span><strong>${esc(setsText([x]))}</strong><span>${x.loadKg!=null?esc(LOAD_BASES[x.loadBasis]||'重量口径未注明'):''}${x.feeling?` · ${esc(FEELINGS[x.feeling]||'')}`:''}</span></div>`).join('');
}
export function exerciseLogForm(item,state){
  const a=activities.find(a=>a.id===item.activityId);
  // Pre-fill from the last recorded set (and planned reps) so you only change what differs; never auto-increases.
  const prev=lastLoad(a,state);
  const basis=prev?.loadBasis||'unknown';
  const repsPrefill=prev?.reps??Number(String(item.prescription?.reps||'').match(/\d+/)?.[0])??'';
  // 只有负重动作(哑铃/杠铃/器械等)才显示公斤数与重量口径;活动度、自重、心肺动作不问重量。
  const weightRow=isLoaded(a)?`<div class="field-row"><label>本组重量（kg，可选）<input name="loadKg" type="number" min="0" max="500" step="0.1" inputmode="decimal" placeholder="填实际使用的" value="${prev?.loadKg??''}"></label><label>重量口径<select name="loadBasis">${Object.entries(LOAD_BASES).map(([v,l])=>`<option value="${v}" ${v===basis?'selected':''}>${l}</option>`).join('')}</select></label></div>`:'';
  return `<p class="muted">${esc(weightReference(a,state).text)}</p><div class="set-history">${recordedSetsHTML(item)||'<p class="small muted">本次还没有记录组次。</p>'}</div><form id="set-form" data-item="${item.id}">${weightRow}<div class="field-row"><label>本组次数（可选）<input name="reps" type="number" min="1" max="1000" inputmode="numeric" value="${repsPrefill||''}"></label><label>保持秒数（可选）<input name="seconds" type="number" min="1" max="7200" inputmode="numeric"></label></div><label>本组感觉<select name="feeling"><option value="">暂不填写</option>${Object.entries(FEELINGS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><button class="primary full" type="submit">保存本组 ${icon('check')}</button></form><p class="helper left">默认填的是上次数据，只改这次变化的部分；不把建议重量或计划组数当作实际完成。</p>`;
}
// 计时/保持型动作的进行中卡:大按钮起「准备倒数 → 计时」,到点提示;手动记录折进备选。
export function timedCard(item,state){
  const a=activities.find(a=>a.id===item.activityId);
  const t=timeTarget(item);
  const rounds=item.prescription?.sets||1;
  const done=(item.actualSetDetails||[]).length;
  const roundText=rounds>1?`第 ${Math.min(done+1,rounds)} / ${rounds} 回合`:'';
  const targetText=t?(t.countdown?`保持 ${t.min} 秒`:`${t.min}–${t.max} 秒`):'自己计时，停止时记录用时';
  const restText=item.prescription?.restSeconds?` · 回合间休息 ${item.prescription.restSeconds} 秒`:'';
  return `<div class="timed-card"><p class="timed-target">${esc(targetText)}${roundText?` · ${roundText}`:''}${restText}</p>`
    +`<div class="set-history">${recordedSetsHTML(item)||'<p class="small muted">还没有计时记录。</p>'}</div>`
    +`<button class="primary full timed-start" data-timer="${item.id}">${icon('play')} ${done>=rounds&&rounds>1?'再来一回合':'开始计时'}</button>`
    +`<details class="timed-manual"><summary>改用手动记录</summary>${exerciseLogForm(item,state)}</details>`
    +`<p class="helper left">到点会有提示（可静音）；保持中如有疼痛立即停止。</p></div>`;
}
export function sessionEditForm(s){
  return `<form id="session-form" data-id="${s.id}"><div class="field-row"><label>实际分钟<input name="actualMinutes" type="number" min="1" max="1440" value="${s.actualMinutes??''}"></label><label>费力程度<input name="effort" type="number" min="1" max="10" value="${s.effort??''}"></label></div>${s.items.map(i=>`<fieldset class="edit-record-item"><legend>${esc(activityName(i))} · ${i.status==='completed'?'已完成':'已跳过'}</legend>${recordedSetsHTML(i)}<label>修改组次<input name="sets_${i.id}" value="${esc(setsText(i.actualSetDetails||[]))}" placeholder="如 20kg×10、20kg×8"></label><label>这个动作的感受<textarea name="note_${i.id}" maxlength="2000">${esc(i.feedback||'')}</textarea></label>${i.sourceText?`<p class="small muted">来源原文：${esc(i.sourceText)}</p>`:''}</fieldset>`).join('')}<label>整次感受<textarea name="feedback" maxlength="4000">${esc(s.feedback||'')}</textarea></label><button class="primary" type="submit">保存修改</button></form>`;
}
export function assessmentForm(){
  return `<p class="muted">先记录事实，不自动换算成强弱评分。照片不是必需项，也不能单独证明肌肉无力或疼痛原因。</p><form id="assessment-form"><label>能力维度<select name="dimension">${Object.entries(abilityDimensions).map(([v,x])=>`<option value="${v}">${x.label}</option>`).join('')}</select></label><label>日期<input name="date" type="date" required value="${new Date().toLocaleDateString('en-CA')}"></label><label>信息来源<select name="source"><option value="self_report">我的感受</option><option value="measurement">实际测量 / 设备记录</option><option value="professional">专业人员评估</option></select></label><label>测量或观察方式<input name="method" maxlength="200" placeholder="例如：同一器械、同一动作版本；步行路线"></label><label>结果与感受<textarea name="note" required maxlength="4000" placeholder="例如：今天同样路线走了20分钟，能正常交谈；或记录专业评估结论"></textarea></label><p class="helper left">不要求极限测试。有不适时停止自行测试，记录情况即可。</p><button class="primary full" type="submit">保存能力观察</button></form>`;
}
export function capacityHTML(s){
  const entries=s.assessments||[];
  return `<section class="card capacity"><div class="section-heading"><h2>个人能力记录</h2><button class="text-button" data-action="assessment">${icon('plus')} 记一次</button></div><p class="muted">通过训练记录与可重复的观察逐步了解身体。没有记录的维度不猜分数。</p>${Object.entries(abilityDimensions).map(([id,x])=>{const a=entries.filter(a=>a.dimension===id).at(-1);return `<details class="ability-row"><summary>${x.label}<span>${a?dateText(a.observedAt):'待了解'}</span></summary><p class="small muted">${x.help}</p>${a?`<p>${esc(a.note)}</p><p class="small muted">${a.source==='professional'?'专业评估':a.source==='measurement'?'测量记录':'自述'} · ${esc(a.method||'未填写方式')}</p>`:''}</details>`;}).join('')}<details><summary>查看全部观察（${entries.length}）</summary>${[...entries].reverse().map(a=>`<article class="ability-entry"><strong>${esc(abilityDimensions[a.dimension]?.label||a.dimension)} · ${dateText(a.observedAt)}</strong><p>${esc(a.note)}</p></article>`).join('')}</details><p class="helper left">照片/视频上传和动作识别尚未接入。若以后使用，应自愿提供，并结合动态表现与感受解读。</p></section>`;
}
export function privacyHTML(s){return `<section class="card privacy"><h2>数据与 AI</h2><p>记录保存在当前浏览器。主动启用 AI 后，所选服务会收到必要的身体档案、近期记录、心得和你允许参考的收藏；不会后台自动发送。</p><p class="small muted">${s.settings?.aiConsent?'已允许当前服务；可随时关闭。':'AI 数据发送默认关闭。'}</p><div class="dialog-actions"><button class="secondary" data-action="ai-settings">AI 设置</button><button class="secondary" data-action="export">导出备份</button><button class="secondary" data-action="import">恢复备份</button></div><p class="helper left">不同浏览器或地址的记录不自动同步。恢复时合并记录，已有同 ID 内容优先保留。</p><p class="small muted" data-offline-status>正在检查离线状态…</p></section>`;}
