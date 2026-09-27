import { esc,icon,dateText } from './ui.js';
import { activities } from './catalog.js';
import { LOAD_BASES,FEELINGS,setsText,weightReference,lastLoad,isLoaded,timeTarget } from './training.js';
import { abilityDimensions,abilitySignals,abilitySides,abilityAreas,abilityUses,abilitySources,activeAssessments,abilityGroup,allowedUses } from './abilities.js';
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
  return `<p class="muted">先记录事实，不自动换算成强弱评分。照片不是必需项，也不能单独证明肌肉无力或疼痛原因。</p><form id="assessment-form"><label>能力维度<select name="dimension">${Object.entries(abilityDimensions).map(([v,x])=>`<option value="${v}">${x.label}</option>`).join('')}</select></label><label>日期<input name="date" type="date" required value="${new Date().toLocaleDateString('en-CA')}"></label><label>信息来源<select name="source"><option value="self_report">我的感受</option><option value="measurement">实际测量 / 设备记录</option><option value="professional">专业人员评估</option></select></label><label>测量或观察方式<input name="method" maxlength="200" placeholder="例如：同一器械、同一动作版本；步行路线"></label><label>是否用于推荐<select name="recommendationUse">${Object.entries(abilityUses).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>结果与感受<textarea name="note" required maxlength="4000" placeholder="例如：今天同样路线走了20分钟，能正常交谈；或记录专业评估结论"></textarea></label><p class="helper left">不要求极限测试。有不适时停止自行测试，记录情况即可。</p><button class="primary full" type="submit">保存能力观察</button></form>`;
}
const options=(dict,selected,keys=Object.keys(dict))=>keys.map(v=>`<option value="${v}" ${v===selected?'selected':''}>${esc(typeof dict[v]==='string'?dict[v]:dict[v].label)}</option>`).join('');
const abilityMeta=a=>[abilitySignals[a.signal]&&a.signal!=='unknown'?abilitySignals[a.signal]:'',(a.bodyAreas||[]).map(x=>abilityAreas[x]).join('、'),a.side&&a.side!=='not_applicable'?abilitySides[a.side]:'',a.context,abilitySources[a.source]||'',a.method].filter(Boolean).join(' · ');
const ABILITY_GROUPS=[['review','需专业确认','不自动安排训练。请咨询医生或康复专业人员，确认可以训练后归档或改为「仅保存」。'],['ok','目前顺畅','可作为基础；设为「温和参考」时，同类动作可能稍微靠前。'],['watch','值得留意','只作为偏向温和活动的参考，不作病因判断。'],['other','其他记录','早先的手记，没有分类，仅保存。']];
function abilityCard(s,a,active=true){
  const raw=a.evidenceIds?.map(id=>(s.abilityEvidence||[]).find(e=>e.id===id)).find(Boolean);
  return `<article class="ability-entry"><strong>${esc(abilityDimensions[a.dimension]?.label||a.dimension)} · ${dateText(a.observedAt)}${active?'':a.status==='archived'?' · 已归档':' · 已过期'}</strong><p>${esc(a.note)}</p>${abilityMeta(a)?`<p class="small muted">${esc(abilityMeta(a))}</p>`:''}${a.evidenceQuote?`<p class="small">原话：「${esc(a.evidenceQuote)}」</p>`:''}${raw?`<details><summary>查看完整原话</summary><p class="small">${esc(raw.rawText)}</p></details>`:''}<div class="field-row"><label>用途<select data-ability-use="${a.id}">${options(abilityUses,a.recommendationUse,allowedUses(a))}</select></label></div><div class="dialog-actions"><button class="text-button" data-ability-archive="${a.id}">${a.status==='archived'?'恢复':'归档'}</button><button class="text-button" data-ability-delete="${a.id}">删除</button></div></article>`;
}
export function capacityHTML(s){
  const all=s.assessments||[],active=activeAssessments(all),inactive=all.filter(a=>!active.includes(a));
  const groups=ABILITY_GROUPS.map(([id,title,help])=>{const rows=active.filter(a=>abilityGroup(a)===id);return rows.length?`<div class="ability-group ${id}"><h3>${title}（${rows.length}）</h3><p class="small muted">${help}</p>${[...rows].reverse().map(a=>abilityCard(s,a)).join('')}</div>`:'';}).join('');
  return `<section class="card capacity"><div class="section-heading"><h2>个人能力记录</h2><button class="text-button" data-action="assessment">${icon('plus')} 手动记一次</button></div><p class="muted">用自己的话说说最近的身体和运动情况，AI 会整理成几条观察，逐条确认后才保存。没有记录就不猜分数。</p><button class="primary full" data-action="ability-intake">让 AI 整理我的身体与能力情况 ${icon('arrow')}</button>${groups||'<p class="helper left">还没有有效的观察。</p>'}${inactive.length?`<details><summary>已归档或过期（${inactive.length}）</summary>${[...inactive].reverse().map(a=>abilityCard(s,a,false)).join('')}</details>`:''}<p class="helper left">只有设为「温和参考」的观察会发给 AI 参与安排，而且只影响已通过安全过滤的动作顺序；「需专业确认」会暂停自动安排。照片/视频暂未接入。</p></section>`;
}
export function abilityIntakeForm(p={}){
  const today=new Date().toLocaleDateString('en-CA');
  return `<form id="ability-intake-form"><label>告诉我你最近的身体和运动情况<textarea name="rawText" required maxlength="4000" rows="7" placeholder="可粘贴一段话、体测报告文字、医生或教练的限制、手表摘要。例如：久坐后右侧髋前面紧，深蹲到底不舒服；羽毛球启动慢；上周睡眠 6 小时。">${esc(p.rawText||'')}</textarea></label><div class="field-row"><label>资料类型<select name="source">${options(abilitySources,p.source||'self_report')}</select></label><label>大约发生在<input type="date" name="observedOn" required max="${today}" value="${esc(p.observedOn||today)}"></label></div><p class="helper left">这段文字会发给你启用的 AI 服务。AI 只整理和追问、不诊断；整理结果逐条确认后才保存。附件暂未接入。</p><button class="primary full" type="submit">开始整理 ${icon('arrow')}</button></form>`;
}
export function abilityConfirmForm(p){
  const today=new Date().toLocaleDateString('en-CA');
  return `${p.warnings?.length?`<div class="notice error">${p.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</div>`:''}<p class="helper left">默认「仅保存」。只有你改成「温和参考」的条目才会参与安排；不需要的条目取消勾选即可，不会保存。</p><form id="ability-confirm-form">${p.drafts.map((d,n)=>`<fieldset class="log-session"><legend><label class="checkbox-line"><input type="checkbox" name="keep_${n}" checked> 第 ${n+1} 条</label></legend><p class="small">原话：「${esc(d.evidenceQuote)}」</p><div class="field-row"><label>维度<select name="dimension_${n}">${options(abilityDimensions,d.dimension)}</select></label><label>观察<select name="signal_${n}">${options(abilitySignals,d.signal)}</select></label></div><div class="equipment-checks">${Object.entries(abilityAreas).map(([v,l])=>`<label class="check-pill"><input type="checkbox" name="area_${n}" value="${v}" ${d.bodyAreas.includes(v)?'checked':''}>${l}</label>`).join('')}</div><div class="field-row"><label>左右<select name="side_${n}">${options(abilitySides,d.side)}</select></label><label>日期<input type="date" name="observedAt_${n}" required max="${today}" value="${esc(d.observedAt)}"></label></div><label>情境<input name="context_${n}" maxlength="100" value="${esc(d.context)}" placeholder="例如：久坐后、深蹲到底时"></label><label>说明<textarea name="note_${n}" required maxlength="300">${esc(d.note)}</textarea></label><label>用途${d.recommendationUse==='gentle_preference'?'<span class="small muted">（AI 建议：温和参考）</span>':''}<select name="use_${n}">${options(abilityUses,'off',allowedUses(d))}</select></label></fieldset>`).join('')}<button class="primary full" type="submit">保存勾选的观察 ${icon('check')}</button><button class="secondary full" type="button" data-action="ability-retry">回到原文修改</button></form>`;
}
export function privacyHTML(s){return `<section class="card privacy"><h2>数据与 AI</h2><p>记录保存在当前浏览器。主动启用 AI 后，所选服务会收到必要的身体档案、近期记录、心得和你允许参考的收藏；不会后台自动发送。</p><p class="small muted">${s.settings?.aiConsent?'已允许当前服务；可随时关闭。':'AI 数据发送默认关闭。'}</p><div class="dialog-actions"><button class="secondary" data-action="ai-settings">AI 设置</button><button class="secondary" data-action="export">导出备份</button><button class="secondary" data-action="import">恢复备份</button></div><p class="helper left">不同浏览器或地址的记录不自动同步。恢复时合并记录，已有同 ID 内容优先保留。</p><p class="helper left">iPhone：Safari 与「添加到主屏幕」的 App 存储互不相通。请先添加到主屏幕、从主屏幕打开，再在里面恢复备份并重新填写 AI key。</p><p class="small muted" data-offline-status>正在检查离线状态…</p></section>`;}
