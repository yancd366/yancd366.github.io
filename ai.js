// Pure helpers for AI-assisted features. The model proposes; these functions decide what it sees
// and what is allowed back in. Nothing here calls a network service.
import { activities, goals, places, equipmentLabels, bodyRegions, systems, tiers, phases } from './catalog.js';
import { aiEligible, availableEquipment, uid, PHASE_RANK } from './domain.js';

import { safetyBlock, safetyContext, canonicalMovement } from './safety.js';
import { validateSets, setSummary, setsText, parseSetsText } from './training.js';
export { setSummary, setsText, parseSetsText } from './training.js';

const byId = new Map(activities.map(a => [a.id, a]));
const DAY = 86400000;
const READINESS = { normal: '状态还不错', tired: '有点疲惫', discomfort: '身体有不舒服' };
export const localDate = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
const clip = (text, n = 200) => { const s = String(text || '').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };
const itemName = i => i.activitySnapshot?.name || byId.get(i.activityId)?.name || i.customName || i.activityId;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const optional = (v, test) => v == null || test(v);
const RANGE = /^\d{1,4}(-\d{1,4})?$/;
const validRange=(v,max)=>{if(!RANGE.test(String(v)))return false;const [lo,hi=lo]=String(v).split('-').map(Number);return lo>=1&&hi>=lo&&hi<=max;};

export function buildMessages(skillText, input) {
  return [{ role: 'system', content: skillText }, { role: 'user', content: JSON.stringify(input, null, 1) }];
}

// ---------- shared context ----------

// Summarises real, user-confirmed history. Planned-but-unfinished work never appears here.
export function historySummary(state, now = new Date(), days = 28) {
  const since = now - days * DAY;
  const all = state.sessions.filter(s => new Date(s.endedAt) <= now).sort((a, b) => new Date(a.endedAt) - new Date(b.endedAt));
  const recent = all.filter(s => new Date(s.endedAt) >= since);
  const stats = new Map(), bySystem = {}, byCategory = {};
  for (const s of recent) for (const i of s.items) {
    const key = i.activityId || `custom:${i.customName}`;
    const row = stats.get(key) || { activityId: i.activityId || null, name: itemName(i), completed: 0, skipped: 0, lastDone: null, last: null };
    if (i.status === 'completed') {
      row.completed++; row.lastDone = localDate(s.endedAt);
      row.last = { sets: i.actualSets, reps: i.actualReps, loadKg: i.actualLoadKg, setDetails: i.actualSetDetails || null, minutes: i.actualMinutes };
      const a = i.activitySnapshot || byId.get(i.activityId);
      if (a) { bySystem[a.system] = (bySystem[a.system] || 0) + 1; byCategory[a.category] = (byCategory[a.category] || 0) + 1; }
    } else if (i.status === 'skipped') row.skipped++;
    stats.set(key, row);
  }
  // Convict progress uses all history: the highest step the user actually completed per movement.
  const convict = {};
  for (const s of all) for (const i of s.items) {
    const a = i.status === 'completed' && (i.activitySnapshot || byId.get(i.activityId));
    if (a?.system === 'convict' && (!convict[a.familyId] || convict[a.familyId].level < a.level)) convict[a.familyId] = { level: a.level, activityId: a.id, name: a.name, lastDone: localDate(s.endedAt) };
  }
  const efforts = recent.map(s => s.effort).filter(v => v != null);
  return {
    windowDays: days,
    sessionCount: recent.length,
    averageEffort: efforts.length ? Math.round(efforts.reduce((x, y) => x + y, 0) / efforts.length * 10) / 10 : null,
    completedBySystem: Object.fromEntries(Object.entries(bySystem).map(([k, v]) => [systems[k] || k, v])),
    completedByCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [goals[k] || k, v])),
    activities: [...stats.values()].sort((a, b) => b.completed - a.completed || b.skipped - a.skipped),
    convictProgress: convict,
    recentSessions: recent.slice(-8).map(s => ({
      date: localDate(s.endedAt), minutes: s.actualMinutes, effort: s.effort, feedback: clip(s.feedback),
      source: s.source,
      items: s.items.map(i => ({ activityId: i.activityId || null, name: itemName(i), status: i.status, sets: i.actualSets, reps: i.actualReps, loadKg: i.actualLoadKg, feedback: clip(i.feedback, 120) }))
    })),
    bodyObservations: state.observations.filter(o => new Date(o.createdAt) >= since && new Date(o.createdAt) <= now).slice(-5).map(o => ({ date: localDate(o.createdAt), text: clip(o.text) }))
  };
}

export const CANDIDATE_COLUMNS = 'id|名称|体系|类别|阶段|主要部位|辅助部位|难度|冲击|器械|建议分钟|家族|第几式';
const candidateLine = a => [a.id, a.name, systems[a.system], goals[a.category], phases[a.phase] || '正式', a.primaryRegions.map(r => bodyRegions[r].label).join('、') || '-', a.secondaryRegions.map(r => bodyRegions[r].label).join('、') || '-', tiers[a.tier], a.impact, a.equipment.map(e => equipmentLabels[e]).join('、') || '无', a.minutes, a.familyId, a.level ?? '-'].join('|');
export const aiCandidates = (request, profile) => { const seen=new Set();return activities.filter(a=>{if(!aiEligible(a,request,profile)||seen.has(canonicalMovement(a)))return false;seen.add(canonicalMovement(a));return true;}); };

// ---------- skill: intake (natural language → request) ----------

export function buildIntakeInput(state, text, defaults, now = new Date()) {
  return {
    today: localDate(now),
    userText: String(text || '').trim(),
    defaults: { minutes: defaults.minutes, place: defaults.place, focus: defaults.focus, readiness: defaults.readiness, targetRegions: defaults.targetRegions || [] },
    profile: { experience: state.profile.experience, homeEquipment: state.profile.equipment, bodyNotes: state.profile.bodyNotes || '' },
    options: { place: places, focus: goals, readiness: READINESS, targetRegions: Object.fromEntries(Object.entries(bodyRegions).map(([k, v]) => [k, v.label])), equipment: equipmentLabels, systems }
  };
}

function checkRequestFields(r, errors) {
  if (!r || typeof r !== 'object') { errors.push('request 缺失'); return; }
  if (!optional(r.minutes, v => isInt(v, 5, 180))) errors.push('minutes 应为 5～180 的整数或 null');
  if (!optional(r.place, v => Object.hasOwn(places, v))) errors.push('place 无效');
  if (!optional(r.focus, v => Object.hasOwn(goals, v))) errors.push('focus 无效');
  if (!optional(r.readiness, v => Object.hasOwn(READINESS, v))) errors.push('readiness 无效');
  if (!optional(r.targetRegions, v => Array.isArray(v) && v.every(x => Object.hasOwn(bodyRegions, x)))) errors.push('targetRegions 含无效部位');
  if (!optional(r.equipment, v => Array.isArray(v) && v.every(x => Object.hasOwn(equipmentLabels, x)))) errors.push('equipment 含无效器械');
  if (!optional(r.preferredSystems, v => Array.isArray(v) && v.every(x => Object.hasOwn(systems, x)))) errors.push('preferredSystems 含无效体系');
  for (const k of ['bodyToday', 'preferences']) if (!optional(r[k], v => typeof v === 'string')) errors.push(`${k} 应为文字或 null`);
  if (!optional(r.avoid, v => Array.isArray(v) && v.every(x => typeof x === 'string'))) errors.push('avoid 应为文字数组');
}

// Unstated fields (null) fall back to the on-screen selection; stated ones override it.
export function validateIntake(output, defaults) {
  const errors = [];
  if (!output || !['ok', 'clarify', 'refer'].includes(output.status)) return { ok: false, errors: ['status 应为 ok / clarify / refer'] };
  if (output.status === 'clarify') return typeof output.question === 'string' && output.question.trim() ? { ok: true, status: 'clarify', question: output.question.trim() } : { ok: false, errors: ['clarify 需要 question'] };
  if (output.status === 'refer') return typeof output.reason === 'string' && output.reason.trim() ? { ok: true, status: 'refer', reason: output.reason.trim() } : { ok: false, errors: ['refer 需要 reason'] };
  checkRequestFields(output.request, errors);
  if (errors.length) return { ok: false, errors };
  const r = output.request, pick = (k, fallback) => r[k] ?? fallback;
  const focus = pick('focus', defaults.focus);
  return { ok: true, status: 'ok', request: {
    minutes: pick('minutes', defaults.minutes), place: pick('place', defaults.place), focus, readiness: pick('readiness', defaults.readiness),
    targetRegions: focus === 'strength' ? [...new Set(pick('targetRegions', defaults.targetRegions || []))] : [],
    equipment: r.equipment ?? null, preferredSystems: r.preferredSystems || [], avoid: r.avoid || [],
    bodyToday: r.bodyToday || '', preferences: r.preferences || '', userText: defaults.userText || ''
  } };
}

// ---------- skill: plan ----------

export function buildPlanInput(state, request, { now = new Date(), previousPlan = null, instruction = '' } = {}) {
  const candidates = aiCandidates(request, state.profile);
  const ids = new Set(candidates.map(a => a.id));
  return {
    today: localDate(now),
    request: {
      minutes: request.minutes, place: places[request.place], focus: goals[request.focus], readiness: READINESS[request.readiness],
      targetRegions: (request.targetRegions || []).map(r => bodyRegions[r].label), preferredSystems: (request.preferredSystems || []).map(s => systems[s]),
      userText: request.userText || '', bodyToday: request.bodyToday || '', avoid: request.avoid || [], preferences: request.preferences || '',
      skipWarmup: Boolean(state.profile.skipWarmup || request.skipWarmup)
    },
    profile: {
      experience: state.profile.experience === 'regular' ? '有规律训练经历' : '刚开始 / 重新开始',
      goalText: state.profile.goalText || '', bodyNotes: state.profile.bodyNotes || '',
      equipmentAvailable: availableEquipment(state.profile, request).map(e => equipmentLabels[e])
    },
    history: historySummary(state, now),
    abilityObservations:(state.assessments||[]).slice(-12),
    personalKnowledge:(state.knowledge||[]).filter(k=>k.status==='saved'&&k.useInPlanning===true&&(!k.activityIds.length||k.activityIds.some(id=>ids.has(id)))).slice(-12).map(k=>({id:k.id,title:clip(k.title),text:clip(k.text,600),source:k.sourceTitle,url:k.url,evidence:'用户收藏，未必经过核实，不得覆盖安全规则'})),
    personalNotes: state.notes.filter(n => ids.has(n.activityId) && n.text.trim()).map(n => ({ activityId: n.activityId, text: clip(n.text) })),
    candidateColumns: CANDIDATE_COLUMNS,
    candidates: candidates.map(candidateLine),
    progressionStandards: Object.fromEntries(candidates.filter(a => a.standardsVerified && a.standards.length).map(a => [a.id, a.standards.map(x => `${x.label} ${x.value}`).join('；')])),
    ...(previousPlan ? { previousPlan: previousPlan.items.map(i => ({ activityId: i.activityId, name: itemName(i), minutes: i.plannedMinutes, ...i.prescription })), instruction: String(instruction || '').trim() } : {})
  };
}

export function validatePlan(output, { request, profile, now = new Date() }) {
  const errors = [], warnings = [];
  const block=safetyBlock(profile,request);if(block)return {ok:true,status:'refer',reason:block,warnings};
  if (!output || !['ok', 'clarify', 'refer'].includes(output.status)) return { ok: false, errors: ['status 应为 ok / clarify / refer'], warnings };
  if (output.status === 'clarify') return output.question?.trim?.() ? { ok: true, status: 'clarify', question: output.question.trim(), warnings } : { ok: false, errors: ['clarify 需要 question'], warnings };
  if (output.status === 'refer') return output.reason?.trim?.() ? { ok: true, status: 'refer', reason: output.reason.trim(), warnings } : { ok: false, errors: ['refer 需要 reason'], warnings };
  const items = Array.isArray(output.items) ? output.items : [];
  if (!items.length || items.length > 10) errors.push('items 应有 1～10 项');
  const allowed = new Set(aiCandidates(request, profile).map(a => a.id)), seen = new Set(), families=new Set();
  items.forEach((i, n) => {
    const at = `第 ${n + 1} 项（${i?.activityId}）`;
    if (!allowed.has(i?.activityId)) { errors.push(`${at} 不在本次候选中`); return; }
    const movement=canonicalMovement(byId.get(i.activityId));if(seen.has(movement))errors.push(`${at} 重复动作`);seen.add(movement);
    const candidate=byId.get(i.activityId);if(candidate.system==='convict'&&families.has(candidate.familyId))errors.push(`${at} 同一进阶系列不要连续堆叠多个阶段`);families.add(candidate.familyId);
    if (!isInt(i.minutes, 1, 60)) errors.push(`${at} minutes 应为 1～60 的整数`);
    if (!optional(i.sets, v => isInt(v, 1, 10))) errors.push(`${at} sets 应为 1～10`);
    if (!optional(i.reps, v => validRange(v,100))) errors.push(`${at} reps 应为 "8" 或 "8-12"`);
    if (!optional(i.seconds, v => validRange(v,900))) errors.push(`${at} seconds 应为 "30" 或 "20-30"`);
    if (!optional(i.restSeconds, v => isInt(v, 0, 600))) errors.push(`${at} restSeconds 应为 0～600`);
    if(i.reps!=null&&i.seconds!=null)errors.push(`${at} 次数和秒数请选择一种剂量方式`);
    if(i.sets!=null){const lower=v=>Number(String(v).split('-')[0]);const active=i.seconds!=null?lower(i.seconds):i.reps!=null?lower(i.reps)*2:0;const minimum=i.sets*active*(i.perSide?2:1)+Math.max(0,i.sets-1)*(i.restSeconds||0);if(minimum>i.minutes*60)errors.push(`${at} 组次与休息无法在填写时长内完成`);}
    if (!(typeof i.reason === 'string' && i.reason.trim())) errors.push(`${at} 需要 reason`);
    const a = byId.get(i.activityId);
    if (a.category === 'strength' && i.sets == null) warnings.push(`${at} 力量动作未给组数`);
  });
  const planned = items.reduce((n, i) => n + (Number.isInteger(i?.minutes) ? i.minutes : 0), 0);
  if (planned > request.minutes) errors.push(`动作合计 ${planned} 分钟，超过可用的 ${request.minutes} 分钟`);
  if (!(typeof output.explanation === 'string' && output.explanation.trim())) errors.push('需要 explanation');
  if (errors.length) return { ok: false, errors, warnings };
  // 强制 热身 → 正式 → 放松 的跨阶段顺序;正式段内部保留模型给出的排序。
  const phaseRank = i => PHASE_RANK[byId.get(i.activityId).phase] ?? 1;
  const ordered = items.map((i, idx) => ({ i, idx })).sort((a, b) => phaseRank(a.i) - phaseRank(b.i) || a.idx - b.idx).map(x => x.i);
  if (ordered.some((i, n) => i !== items[n])) warnings.push('已按 热身 → 正式 → 放松 重新排序');
  items.splice(0, items.length, ...ordered);
  const covered = new Set(items.flatMap(i => byId.get(i.activityId).primaryRegions));
  const regionCoverage = request.focus === 'strength' ? (request.targetRegions || []).map(id => ({ id, status: covered.has(id) ? 'included' : [...allowed].some(x => byId.get(x).primaryRegions.includes(id)) ? 'time_limited' : 'unavailable' })) : [];
  for (const r of regionCoverage) if (r.status !== 'included') warnings.push(`未安排所选部位：${bodyRegions[r.id].label}`);
  const plan = {
    id: uid(), createdAt: now.toISOString(), startedAt: null, safetyContext:safetyContext(profile,request), source: 'ai', request: structuredClone(request),
    items: items.map(i => ({ id: uid(), activityId: i.activityId, activitySnapshot: structuredClone(byId.get(i.activityId)), plannedMinutes: i.minutes,
      prescription: { sets: i.sets ?? null, reps: i.reps != null ? String(i.reps) : null, seconds: i.seconds != null ? String(i.seconds) : null, perSide: Boolean(i.perSide), restSeconds: i.restSeconds ?? null, load: null },
      reason: clip(i.reason, 200), status: 'pending', actualMinutes: null, feedback: '', actualSets: null, actualReps: null, actualLoadKg: null, actualSetDetails: null })),
    // Same accounting as rule plans: a small transition reserve, the rest stays visible as unused time.
    plannedMinutes: planned, transitionMinutes: Math.min(request.minutes - planned, Math.max(0, items.length - 1)), unallocatedMinutes: request.minutes - planned - Math.min(request.minutes - planned, Math.max(0, items.length - 1)),
    explanation: clip(output.explanation, 400), cautions: (Array.isArray(output.cautions) ? output.cautions : []).filter(c => typeof c === 'string').map(c => clip(c, 200)).slice(0, 5),
    regionCoverage
  };
  return { ok: true, status: 'ok', plan, warnings };
}

// ---------- skill: log (free text → confirmed records) ----------

export function buildLogInput(state, text, now = new Date()) {
  return {
    today: localDate(now),
    text: String(text || ''),
    catalog: activities.map(a => `${a.id}|${a.name}|${a.aliases.slice(0, 3).join('/')}`),
    catalogColumns: 'id|名称|别名'
  };
}
// Loose normalisation so the model may drop spaces or change punctuation but not invent content.
const norm = s => String(s || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).toLowerCase().replace(/[\s，,。.;；:：、!！?？()（）\[\]【】"'“”‘’\-—_~～]/g, '').replace(/[×＊*]/g, 'x');
const digits = s => (String(s).match(/\d+(\.\d+)?/g) || []).map(Number);
// A parsed value is backed by the source if it appears directly or via a common unit conversion.
const backed = (v, nums, kind) => nums.some(n => n === v
  || (kind === 'seconds' && (n * 60 === v || n * 3600 === v))
  || (kind === 'minutes' && (n * 60 === v || n / 60 === v))
  || (kind === 'kg' && Math.abs(n * 0.4536 - v) < 0.1));

export function validateLog(output, sourceText, now = new Date()) {
  const errors = [], warnings = [];
  if (!output || !['ok', 'clarify'].includes(output.status)) return { ok: false, errors: ['status 应为 ok / clarify'], warnings };
  if (output.status === 'clarify') return output.question?.trim?.() ? { ok: true, status: 'clarify', question: output.question.trim(), warnings } : { ok: false, errors: ['clarify 需要 question'], warnings };
  const sessions = Array.isArray(output.sessions) ? output.sessions : [];
  if (!sessions.length) errors.push('没有解析出训练');
  const source = norm(sourceText), today = localDate(now);
  const drafts = sessions.map((s, n) => {
    const at = `第 ${n + 1} 次训练`;
    if (!optional(s.date, v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)))) errors.push(`${at} date 应为 YYYY-MM-DD 或 null`);
    else if (s.date && s.date > today) errors.push(`${at} 日期在未来`);
    if (s.date == null) warnings.push(`${at} 没有日期，确认前需要补上`);
    if (!optional(s.durationMinutes, v => isNum(v, 1, 1440))) errors.push(`${at} durationMinutes 超出范围`);
    if (!optional(s.effort, v => isInt(v, 1, 10))) errors.push(`${at} effort 应为 1～10`);
    const items = Array.isArray(s.items) ? s.items : [];
    if (!items.length) errors.push(`${at} 没有动作`);
    return { warnings:[], date: s.date ?? null, durationMinutes: s.durationMinutes ?? null, effort: s.effort ?? null, feedback: clip(s.feedback, 2000), bodyNotes: clip(s.bodyNotes, 2000),
      items: items.map((i, k) => {
        const ia = `${at}第 ${k + 1} 项（${i?.name}）`;
        if (!(typeof i?.name === 'string' && i.name.trim())) errors.push(`${ia} 需要 name`);
        let activityId = i?.activityId ?? null;
        if (activityId != null && !byId.has(activityId)) { warnings.push(`${ia} 动作 id ${activityId} 不在动作库，改为自定义动作`); activityId = null; }
        const sets = Array.isArray(i?.sets) ? i.sets : [];
        if (sets.length > 30) errors.push(`${ia} 组数过多`);
        sets.forEach((x, j) => {
          if (!optional(x?.reps, v => isInt(v, 1, 1000)) || !optional(x?.loadKg, v => isNum(v, 0, 500)) || !optional(x?.seconds, v => isInt(v, 1, 7200))) errors.push(`${ia} 第 ${j + 1} 组数值超出范围`);
        });
        if (!optional(i?.durationMinutes, v => isNum(v, 0.5, 1440)) || !optional(i?.distanceKm, v => isNum(v, 0, 500))) errors.push(`${ia} 时长或距离超出范围`);
        const verified = typeof i?.sourceText === 'string' && i.sourceText.trim() !== '' && source.includes(norm(i.sourceText));
        if (!verified) warnings.push(`${ia} 在原文中找不到对应片段，请核对`);
        const nums = digits(i?.sourceText || ''), used = [...sets.flatMap(x => [[x?.reps, 'reps'], [x?.loadKg, 'kg'], [x?.seconds, 'seconds']]), [i?.durationMinutes, 'minutes'], [i?.distanceKm, 'km']].filter(([v]) => v != null);
        const valuesVerified=verified&&!used.some(([v,kind])=>!backed(v,nums,kind));
        const itemWarnings=[];if(!verified)itemWarnings.push('找不到原文片段');if(verified&&!valuesVerified)itemWarnings.push('有数值没有直接出现在原文中，请逐项核对');if(i?.matchConfidence!=='high'&&activityId)itemWarnings.push('动作匹配需要核对');if(itemWarnings.length)warnings.push(`${ia} ${itemWarnings.join('；')}`);
        return { activityId, name: clip(i?.name, 80), matchConfidence: ['high', 'medium', 'low'].includes(i?.matchConfidence) ? i.matchConfidence : 'low', sets: sets.map(x => ({ reps: x?.reps ?? null, loadKg: x?.loadKg ?? null, seconds: x?.seconds ?? null })),
          durationMinutes: i?.durationMinutes ?? null, distanceKm: i?.distanceKm ?? null, note: clip(i?.note, 500), sourceText: clip(i?.sourceText, 300), verified:valuesVerified, warnings:itemWarnings, confirmed:false };
      }) };
  });
  const unparsed = (Array.isArray(output.unparsed) ? output.unparsed : []).filter(x => typeof x === 'string').map(x => clip(x, 300));
  if (unparsed.length) warnings.push(`有 ${unparsed.length} 段文字没有被解析为训练`);
  return errors.length ? { ok: false, errors, warnings } : { ok: true, status: 'ok', drafts, unparsed, warnings };
}

// User-confirmed import. Validate again after editing, not only before displaying the form.
export function logToRecords(drafts,rawText,now=new Date()){
  if(!Array.isArray(drafts)||!drafts.length)throw new Error('没有可保存的记录。');
  const today=localDate(now);
  for(const d of drafts){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')||new Date(d.date+'T12:00:00').toString()==='Invalid Date'||localDate(new Date(d.date+'T12:00:00'))!==d.date||d.date>today)throw new Error('请填写有效的既往日期。');
    if(!optional(d.durationMinutes,v=>isNum(v,1,1440))||!optional(d.effort,v=>isInt(v,1,10)))throw new Error('时长或费力程度超出范围。');
    if(!Array.isArray(d.items)||!d.items.length)throw new Error('至少保留一个动作。');
    for(const i of d.items){
      validateSets(i.sets);
      if(i.activityId&&!byId.has(i.activityId))throw new Error('对应动作不存在。');
      if(i.warnings?.length&&!i.confirmed)throw new Error('请逐项确认有疑问的解析结果。');
      if(!optional(i.durationMinutes,v=>isNum(v,0.5,1440))||!optional(i.distanceKm,v=>isNum(v,0,500)))throw new Error('单项时长或距离超出范围。');
    }
  }
  const sessions=drafts.map(d=>({id:uid(),planSnapshot:null,source:'log_confirmed',rawText:String(rawText||''),startedAt:null,
    endedAt:d.date===today?now.toISOString():new Date(d.date+'T12:00:00').toISOString(),actualMinutes:d.durationMinutes??null,effort:d.effort??null,feedback:d.feedback||'',
    items:d.items.map(i=>({id:uid(),activityId:i.activityId||null,customName:i.activityId?null:i.name,activitySnapshot:i.activityId?structuredClone(byId.get(i.activityId)):null,plannedMinutes:null,status:'completed',actualMinutes:i.durationMinutes??null,...setSummary(i.sets),actualDistanceKm:i.distanceKm??null,feedback:i.note||'',sourceText:i.sourceText||'',verification:{confirmed:Boolean(i.confirmed),warnings:i.warnings||[]}}))
  }));
  return {sessions,observations:drafts.flatMap((d,n)=>d.bodyNotes?[{id:uid(),text:d.bodyNotes,source:'self_report',createdAt:sessions[n].endedAt}]:[])};
}
