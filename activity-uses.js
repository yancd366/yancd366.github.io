// 动作用途备注：用户确认过的「这个动作可以用来做什么」，例如「臀桥 · 热身 · 髋腿」。
// 来源是知识卡（带原文引证）或用户自己；只记在个人数据里，不改公共动作库。纯函数。
import { activityById, bodyRegions } from './catalog.js';

export const USES = { warmup: '热身', mobility: '活动度', cooldown: '放松', main: '正式训练' };
// 某种用途可以把动作放进计划的哪个阶段。活动度既可以放在热身，也可以放在放松。
export const USE_PHASES = { warmup: ['warmup'], mobility: ['warmup', 'cooldown'], cooldown: ['cooldown'], main: ['main'] };
const known = { has: id => Boolean(activityById(id)) };
const uid = () => globalThis.crypto?.randomUUID?.() || `use-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clip = (value, max) => String(value || '').trim().slice(0, max);
const forbidden = /诊断|治疗|治愈|根治|矫正|康复/;
const date = now => now.toISOString();

// 把 AI 或表单给的用途整理成合法值；用途不合法时返回 null（关联动作本身仍然保留）。
export function normalizeUse(x) {
  const use = USES[x?.use] ? x.use : null;
  if (!use) return null;
  const note = clip(x.note, 60);
  return { use, region: Object.hasOwn(bodyRegions, x?.region) ? x.region : '', note: forbidden.test(note) ? '' : note };
}
export const useLabel = u => `${USES[u.use]}${u.region ? ` · ${bodyRegions[u.region].label}` : ''}`;

// 知识卡保存后：用这张卡关联动作上的用途，替换掉此前由同一张卡产生的用途。
export function replaceKnowledgeUses(state, knowledge, now = new Date()) {
  state.activityUses = (state.activityUses || []).filter(u => u.source?.knowledgeId !== knowledge.id);
  for (const link of knowledge.activityLinks || []) {
    const u = normalizeUse(link);
    if (!u || !known.has(link.activityId)) continue;
    state.activityUses.push({ id: uid(), activityId: link.activityId, ...u, source: { knowledgeId: knowledge.id, quote: clip(link.evidenceQuote, 300) }, createdAt: date(now), updatedAt: date(now) });
  }
  return state.activityUses;
}
// source 为空表示用户自己加的；来自知识卡时带 {knowledgeId, quote}。
export function addManualUse(state, activityId, input, now = new Date(), source = null) {
  if (!known.has(activityId)) throw new Error('动作库里没有这个动作。');
  const u = normalizeUse(input);
  if (!u) throw new Error('请选择用途。');
  state.activityUses ||= [];
  if (state.activityUses.some(x => x.activityId === activityId && x.use === u.use && x.region === u.region && (x.source?.knowledgeId || null) === (source?.knowledgeId || null))) throw new Error('这个用途已经记过了。');
  const created = { id: uid(), activityId, ...u, source: source ? { knowledgeId: source.knowledgeId || null, quote: clip(source.quote, 300) } : null, createdAt: date(now), updatedAt: date(now) };
  state.activityUses.push(created);
  return created;
}
export function deleteUse(state, id) {
  const before = (state.activityUses || []).length;
  state.activityUses = (state.activityUses || []).filter(u => u.id !== id);
  if (state.activityUses.length === before) throw new Error('找不到这条用途备注。');
  return true;
}
export const usesFor = (state, activityId) => (state.activityUses || []).filter(u => u.activityId === activityId);
// 删除知识卡时，一并删除它产生的用途（手记的用途不受影响）。
export const dropKnowledgeUses = (state, knowledgeId) => { state.activityUses = (state.activityUses || []).filter(u => u.source?.knowledgeId !== knowledgeId); };
// 某动作能否按用户用途放到某阶段；返回命中的用途（用于说明），否则 null。
export const useForPhase = (uses, activityId, phase) => (uses || []).find(u => u.activityId === activityId && USE_PHASES[u.use]?.includes(phase)) || null;
