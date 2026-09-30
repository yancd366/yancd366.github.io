// 收藏的训练：只存动作、顺序、组次安排和理由，不存实际重量（下次按最近记录参考）。
// 载入时用当前的档案、器械和今天的状态重新过安全 / 场地 / 器械检查，不合适的动作略去并说明。纯函数。
import { activityById, goals, places, regionLabel } from './catalog.js';
import { uid, aiEligible } from './domain.js';
import { safetyBlock, safetyContext } from './safety.js';

const byId = { get: activityById, has: id => Boolean(activityById(id)) };
const clip = (value, max) => String(value || '').trim().slice(0, max);
const date = now => now.toISOString();
const PRESCRIPTION_KEYS = ['sets', 'reps', 'seconds', 'perSide', 'restSeconds'];
const cleanPrescription = x => x ? Object.fromEntries(PRESCRIPTION_KEYS.map(k => [k, x[k] ?? (k === 'perSide' ? false : null)])) : null;
const cleanRequest = r => ({ minutes: r.minutes, place: r.place, focus: r.focus, targetRegions: [...(r.targetRegions || [])] });

export function defaultPlanName(request, minutes = request.minutes) {
  const focus = request.focus === 'strength' && request.targetRegions?.length ? `力量 · ${regionLabel(request.targetRegions)}` : goals[request.focus] || '训练';
  return clip(`${focus} · ${minutes} 分钟 · ${places[request.place] || ''}`, 60);
}

function template(name, request, items, extra, now) {
  const kept = items.filter(i => byId.has(i.activityId));
  if (!kept.length) throw new Error('这次训练里没有可以收藏的动作库动作。');
  const title = clip(name, 60);
  if (!title) throw new Error('给这套训练起个名字吧。');
  return { id: uid(), name: title, request: cleanRequest(request), explanation: clip(extra.explanation, 400), fromSessionId: extra.fromSessionId || null,
    items: kept.map(i => ({ activityId: i.activityId, plannedMinutes: i.plannedMinutes, prescription: cleanPrescription(i.prescription), reason: clip(i.reason, 200) })),
    createdAt: date(now), updatedAt: date(now), useCount: 0, lastUsedAt: null };
}
// 从还没开始的安排收藏。
export const templateFromPlan = (plan, name, now = new Date()) => template(name, plan.request, plan.items, { explanation: plan.explanation }, now);
// 从练完的记录收藏：只收实际完成的动作，组次用计划值，不用当次实际重量。
export function templateFromSession(session, name, now = new Date()) {
  if (!session?.planSnapshot) throw new Error('补记的训练没有原始安排，暂不能收藏。');
  const done = session.items.filter(i => i.status === 'completed');
  if (!done.length) throw new Error('这次没有完成的动作，暂不能收藏。');
  return template(name, session.planSnapshot.request, done, { explanation: session.planSnapshot.explanation, fromSessionId: session.id }, now);
}

export function saveTemplate(state, t) { state.savedPlans ||= []; state.savedPlans.push(t); return t; }
const find = (state, id) => { const t = (state.savedPlans || []).find(x => x.id === id); if (!t) throw new Error('找不到这套收藏的训练。'); return t; };
export function renameTemplate(state, id, name, now = new Date()) { const t = find(state, id), title = clip(name, 60); if (!title) throw new Error('名字不能为空。'); t.name = title; t.updatedAt = date(now); return t; }
export function deleteTemplate(state, id) { find(state, id); state.savedPlans = state.savedPlans.filter(x => x.id !== id); return true; }
export function markTemplateUsed(state, id, now = new Date()) { const t = (state.savedPlans || []).find(x => x.id === id); if (t) { t.useCount = (t.useCount || 0) + 1; t.lastUsedAt = date(now); } return t || null; }

// 载入成今天的安排。readiness 用今天的选择；返回 {blocked, reason} 或 {plan, skipped}。
export function loadTemplate(state, id, { readiness = 'normal' } = {}, now = new Date()) {
  const t = find(state, id), profile = state.profile;
  const request = { ...cleanRequest(t.request), readiness };
  const block = safetyBlock(profile, request);
  if (block) return { blocked: true, reason: block };
  const skipped = [], kept = [];
  for (const i of t.items) {
    const a = byId.get(i.activityId);
    if (!a) skipped.push({ name: i.activityId, reason: '动作库里已经没有这个动作' });
    else if (!aiEligible(a, request, profile)) skipped.push({ name: a.name, reason: '今天的场地、器械、状态或训练经历不适合' });
    else kept.push({ i, a });
  }
  if (!kept.length) return { blocked: true, reason: `「${t.name}」里的动作今天都不适合：${skipped.map(x => `${x.name}（${x.reason}）`).join('；')}。` };
  const planned = kept.reduce((n, x) => n + x.i.plannedMinutes, 0), minutes = Math.max(t.request.minutes, planned);
  const transition = Math.min(minutes - planned, Math.max(0, kept.length - 1));
  return { skipped, plan: {
    id: uid(), createdAt: date(now), startedAt: null, source: 'saved', templateId: t.id, safetyContext: safetyContext(profile, request), request: { ...request, minutes },
    items: kept.map(({ i, a }) => ({ id: uid(), activityId: a.id, activitySnapshot: structuredClone(a), plannedMinutes: i.plannedMinutes, prescription: i.prescription ? { ...i.prescription, load: null } : null,
      reason: i.reason, status: 'pending', actualMinutes: null, feedback: '', actualSets: null, actualReps: null, actualLoadKg: null, actualSetDetails: null })),
    plannedMinutes: planned, transitionMinutes: transition, unallocatedMinutes: minutes - planned - transition,
    explanation: `来自你收藏的「${t.name}」。${skipped.length ? `今天略去了 ${skipped.map(x => x.name).join('、')}（${skipped[0].reason}）。` : ''}重量请按最近的记录重新选择。`,
    cautions: [], regionCoverage: [] } };
}
