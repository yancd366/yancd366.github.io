export const abilityDimensions = {
  strength:{label:'力量与肌肉耐力',help:'优先用训练中真实完成的重量、次数、感受；不用先测极限重量。'},
  mobility:{label:'关节活动度与控制',help:'记录哪个动作或方向受限、左右差别、是否疼痛；照片不能直接判断原因。'},
  balance:{label:'平衡与稳定',help:'可记录熟悉的扶稳支撑旁单脚站立体验。测量方式保持一致。'},
  coordination:{label:'协调与运动技能',help:'记录步法、舞蹈、球类等熟练程度和困难点。'},
  cardio:{label:'心肺与耐力',help:'记录步行或其他熟悉活动的时间、距离、说话是否轻松；不要求最大强度测试。'},
  recovery:{label:'恢复与日常状态',help:'睡眠、压力、疲劳、久坐和练后反应。'}
};
// 观察的词表：AI 草稿和手动编辑只能从这里取值。
export const abilitySignals = { comfortable:'目前顺畅', limited:'受限 / 发紧', asymmetry:'左右不一致', fatigued:'疲劳 / 恢复差', unknown:'还说不准' };
export const abilitySides = { not_applicable:'不分左右', left:'左侧', right:'右侧', both:'两侧' };
export const abilityAreas = { neck:'颈部', shoulder:'肩', elbow_wrist:'肘 / 腕', upper_back:'上背', lower_back:'腰', core:'腹部 / 核心', hip:'髋', knee:'膝', ankle_foot:'踝 / 足', whole_body:'全身' };
export const abilityUses = { off:'仅保存', gentle_preference:'温和参考', safety_review:'需专业确认' };
export const abilitySources = { self_report:'我的感受', measurement:'训练或体测记录', professional:'专业意见' };
// 恢复与疲劳类观察两周后自动过期，不让一次没睡好永久影响今天。
const EXPIRES_DAYS = 14;
const uid = () => globalThis.crypto?.randomUUID?.() || `ability-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const today = now => now.toLocaleDateString('en-CA');
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const squash = s => String(s || '').replace(/\s+/g, '');

export function abilityEntry(input,now=new Date()){
  if(!abilityDimensions[input.dimension])throw new Error('请选择能力维度。');
  if(!String(input.note||'').trim())throw new Error('请写下观察或测量结果。');
  if(!['self_report','measurement','professional'].includes(input.source))throw new Error('请选择信息来源。');
  const date=input.date||today(now);
  if(!isDate(date)||date>today(now))throw new Error('请填写有效的既往日期。');
  const use=input.recommendationUse||'off';
  if(!abilityUses[use]||!allowedUses({note:input.note}).includes(use))throw new Error('提到疼痛的观察不能设为「温和参考」。');
  return normalizeAssessment({id:uid(),dimension:input.dimension,source:input.source,method:String(input.method||'').trim(),note:input.note.trim().slice(0,4000),observedAt:date,recommendationUse:use,createdAt:now.toISOString()});
}
// 旧记录没有结构化字段：补齐为「不确定 / 仅保存」，不替用户推断。
export function normalizeAssessment(a){
  return { evidenceIds:[], signal:'unknown', bodyAreas:[], side:'not_applicable', context:'', method:'', evidenceQuote:'',
    recommendationUse:'off', confidence:'user_confirmed', expiresAt:null, status:'active', ...a };
}
export const activeAssessments = (list = [], now = new Date()) => list.filter(a => a.status !== 'archived' && (!a.expiresAt || a.expiresAt >= today(now)));
// 页面三栏：需专业确认 > 目前顺畅 > 值得留意；「不确定」的旧手记单独放。
export const abilityGroup = a => a.recommendationUse === 'safety_review' ? 'review' : a.signal === 'comfortable' ? 'ok' : a.signal === 'unknown' ? 'other' : 'watch';
// 有效的「需专业确认」观察会停掉自动安排，这是额外的限制，不放宽 safety.js 的任何一条。
export function abilityBlock(list, now = new Date()) {
  const a = activeAssessments(list, now).find(x => x.recommendationUse === 'safety_review');
  return a ? `你在个人能力里有一条「需专业确认」的记录（${a.observedAt}：${a.note.slice(0, 40)}）。请先咨询医生或康复专业人员；确认可以训练后，在「我的身体」把它归档或改为「仅保存」，再自动安排。` : null;
}

// ---------- AI skill: ability-intake ----------
// 红旗症状由程序兜底：模型没有转介，也按转介处理。
export const RED_FLAGS = /胸痛|胸闷|心悸|心慌|呼吸困难|喘不上气|晕厥|昏厥|头晕|麻木|发麻|放射痛|发烧|发热|急性|刚扭|肿胀|变形|骨折/;
const PAIN = /疼|痛/;
export const MAX_ABILITY_DRAFTS = 6;
// 模型只能提议「仅保存」或「温和参考」；提到疼痛的条目不能作为推荐依据。
export const allowedUses = draft => draft.recommendationUse === 'safety_review' ? ['safety_review', 'off'] : PAIN.test(`${draft.evidenceQuote || ''}${draft.note || ''}`) ? ['off', 'safety_review'] : ['off', 'gentle_preference', 'safety_review'];

export function buildAbilityIntakeInput(state, { rawText, source, observedOn }, now = new Date()) {
  const label = (dict, keys) => Object.fromEntries(keys.map(k => [k, dict[k]]));
  return {
    today: today(now), rawText: String(rawText || '').trim(), source: abilitySources[source] || abilitySources.self_report, observedOn: observedOn || today(now),
    profile: { experience: state.profile.experience === 'regular' ? '有规律训练经历' : '刚开始 / 重新开始', goalText: state.profile.goalText || '', preferredSports: state.profile.preferredSports || '' },
    existing: activeAssessments(state.assessments, now).slice(-12).map(a => ({ observedAt: a.observedAt, dimension: a.dimension, signal: a.signal, bodyAreas: a.bodyAreas, side: a.side, note: a.note.slice(0, 120) })),
    maxDrafts: MAX_ABILITY_DRAFTS,
    options: { dimension: label(Object.fromEntries(Object.entries(abilityDimensions).map(([k, v]) => [k, v.label])), Object.keys(abilityDimensions)), signal: abilitySignals, side: abilitySides, bodyAreas: abilityAreas, recommendationUse: { off: abilityUses.off, gentle_preference: abilityUses.gentle_preference } }
  };
}

export function validateAbilityIntake(output, { rawText, observedOn, now = new Date() }) {
  const referReason = '你提到的情况可能需要及时处理，不适合由 App 自行判断。请先咨询医生或康复专业人员；这段内容不会写进能力档案。';
  if (RED_FLAGS.test(rawText) && output?.status !== 'refer') return { ok: true, status: 'refer', reason: referReason };
  if (!output || !['ok', 'clarify', 'refer'].includes(output.status)) return { ok: false, errors: ['status 应为 ok / clarify / refer'] };
  if (output.status === 'clarify') return typeof output.question === 'string' && output.question.trim() ? { ok: true, status: 'clarify', question: output.question.trim().slice(0, 200) } : { ok: false, errors: ['clarify 需要 question'] };
  if (output.status === 'refer') return { ok: true, status: 'refer', reason: typeof output.reason === 'string' && output.reason.trim() ? output.reason.trim().slice(0, 300) : referReason };
  const errors = [], drafts = [], warnings = [], source = squash(rawText);
  if (!Array.isArray(output.drafts) || !output.drafts.length) return { ok: false, errors: ['ok 需要 1 条以上 drafts；信息不足时改用 clarify'] };
  if (output.drafts.length > MAX_ABILITY_DRAFTS) errors.push(`drafts 最多 ${MAX_ABILITY_DRAFTS} 条`);
  output.drafts.slice(0, MAX_ABILITY_DRAFTS).forEach((d, n) => {
    const at = `第 ${n + 1} 条`;
    if (!d || typeof d !== 'object') return errors.push(`${at}格式无效`);
    if (!abilityDimensions[d.dimension]) errors.push(`${at} dimension 不在词表中`);
    if (!abilitySignals[d.signal]) errors.push(`${at} signal 不在词表中`);
    if (!abilitySides[d.side ?? 'not_applicable']) errors.push(`${at} side 不在词表中`);
    const areas = d.bodyAreas ?? [];
    if (!Array.isArray(areas) || areas.length > 4 || areas.some(x => !abilityAreas[x])) errors.push(`${at} bodyAreas 只能取词表中的值，最多 4 个`);
    if (typeof d.note !== 'string' || !d.note.trim()) errors.push(`${at}需要 note`);
    const quote = typeof d.evidenceQuote === 'string' ? d.evidenceQuote.trim() : '';
    if (!quote) errors.push(`${at}需要 evidenceQuote`);
    else if (!source.includes(squash(quote))) errors.push(`${at} evidenceQuote 必须逐字摘自原文`);
    const date = d.observedAt || observedOn;
    if (!isDate(date) || date > today(now)) errors.push(`${at} observedAt 应为不晚于今天的日期`);
    if (d.recommendationUse != null && !['off', 'gentle_preference', 'safety_review'].includes(d.recommendationUse)) errors.push(`${at} recommendationUse 无效`);
    if (errors.length) return;
    const draft = { dimension: d.dimension, signal: d.signal, bodyAreas: [...new Set(areas)], side: d.side || 'not_applicable', context: String(d.context || '').trim().slice(0, 100), note: d.note.trim().slice(0, 300), observedAt: date, evidenceQuote: quote.slice(0, 300), recommendationUse: d.recommendationUse || 'off' };
    if (!allowedUses(draft).includes(draft.recommendationUse)) { draft.recommendationUse = 'off'; warnings.push(`「${draft.note.slice(0, 20)}」提到疼痛，不作为推荐依据；如持续或加重，请改为「需专业确认」。`); }
    drafts.push(draft);
  });
  return errors.length ? { ok: false, errors } : { ok: true, status: 'ok', drafts, warnings };
}

// 用户确认后才生成记录：原话进 abilityEvidence，结构化观察进 assessments，两者互相引用。
export function abilityRecords(drafts, { rawText, source }, now = new Date()) {
  if (!drafts.length) return { evidence: null, assessments: [] };
  const evidence = { id: uid(), capturedAt: now.toISOString(), source, rawText: String(rawText).slice(0, 4000), attachmentIds: [], sourceUrl: '', consentedToAI: true, parseStatus: 'confirmed' };
  const assessments = drafts.map(d => {
    for (const [value, dict, name] of [[d.dimension, abilityDimensions, '维度'], [d.signal, abilitySignals, '观察'], [d.side, abilitySides, '左右'], [d.recommendationUse, abilityUses, '用途']]) if (!dict[value]) throw new Error(`${name}选项无效。`);
    if (!Array.isArray(d.bodyAreas) || d.bodyAreas.some(x => !abilityAreas[x])) throw new Error('部位选项无效。');
    if (!String(d.note || '').trim()) throw new Error('每条观察都需要一句说明。');
    if (!isDate(d.observedAt) || d.observedAt > today(now)) throw new Error('请填写有效的既往日期。');
    if (!allowedUses(d).includes(d.recommendationUse)) throw new Error('提到疼痛的观察不能设为「温和参考」。');
    const expires = d.dimension === 'recovery' || d.signal === 'fatigued' ? addDays(d.observedAt, EXPIRES_DAYS) : null;
    return normalizeAssessment({ id: uid(), evidenceIds: [evidence.id], dimension: d.dimension, signal: d.signal, bodyAreas: d.bodyAreas, side: d.side, context: String(d.context || '').trim().slice(0, 100),
      method: '', note: d.note.trim().slice(0, 4000), evidenceQuote: d.evidenceQuote || '', observedAt: d.observedAt, source, recommendationUse: d.recommendationUse, expiresAt: expires, createdAt: now.toISOString() });
  });
  return { evidence, assessments };
}
