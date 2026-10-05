// 我的动作库：视频 / 文字里学到、公共动作库里没有的动作，存成和公共动作完全相同的单元格式。
// 公共动作库不被修改；个人动作追加进实时注册表（catalog.setPersonalActivities），所以动作详情、记录、
// 安全检查、器械与场地筛选、本地规则和 AI 安排都照常适用。
// 默认「仅手动使用」= selectable:false（与公共库里「仅供浏览」的动作同一机制），用户允许后才进入自动安排。纯函数。
import { activities, activityById, setPersonalActivities, goals, places, equipmentLabels, bodyRegions, systems, phases, tiers } from './catalog.js';
import { entry } from './library/entry.js';
import { manualEligible, uid } from './domain.js';
import { captureEvidence } from './knowledge.js';
import { normalizeUse } from './activity-uses.js';

const clip = (value, max) => String(value || '').trim().slice(0, max);
const squash = s => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const date = now => now.toISOString();
const forbidden = /诊断|治疗|治愈|根治|矫正|康复/;
export const CATEGORIES = Object.fromEntries(Object.entries(goals).filter(([k]) => k !== 'balanced'));
export const IMPACTS = { low: '低冲击', medium: '中等冲击', high: '高冲击' };
export const PLANNING_USES = { manual_only: '仅手动使用', allowed: '允许自动安排' };
const lines = (value, max, each) => (Array.isArray(value) ? value : String(value || '').split(/\n+/)).map(x => clip(String(x).replace(/^\s*(?:\d+[.、)]|[-•·])\s*/, ''), each)).filter(Boolean).slice(0, max);
const pick = (list, dict, max) => [...new Set((Array.isArray(list) ? list : []).filter(x => Object.hasOwn(dict, x)))].slice(0, max);

// 把 AI 草稿或表单整理成动作单元的字段；返回 {ok, draft, errors}。
export function normalizeActivityDraft(x = {}) {
  const errors = [];
  const category = Object.hasOwn(CATEGORIES, x.category) ? x.category : null;
  if (!category) errors.push('请选择动作类别');
  const draft = {
    name: clip(x.name, 40), aliases: lines(x.aliases, 5, 30), description: clip(x.description, 200), category: category || 'mobility',
    phase: Object.hasOwn(phases, x.phase) ? x.phase : category === 'mobility' ? 'warmup' : category === 'recovery' ? 'cooldown' : 'main',
    primaryRegions: pick(x.primaryRegions, bodyRegions, 3), secondaryRegions: pick(x.secondaryRegions, bodyRegions, 3),
    places: pick(x.places, places, 3), equipment: pick(x.equipment, equipmentLabels, 4),
    tier: [1, 2, 3].includes(Number(x.tier)) ? Number(x.tier) : 1, impact: Object.hasOwn(IMPACTS, x.impact) ? x.impact : 'low',
    minutes: Number.isInteger(Number(x.minutes)) && Number(x.minutes) >= 1 && Number(x.minutes) <= 30 ? Number(x.minutes) : 3,
    system: Object.hasOwn(systems, x.system) ? x.system : 'general',
    setup: lines(x.setup, 4, 80), steps: lines(x.steps, 8, 100), cues: lines(x.cues, 6, 80), mistakes: lines(x.mistakes, 5, 80), dose: clip(x.dose, 100)
  };
  if (!draft.places.length) draft.places = ['home', 'gym'];
  if (!draft.name) errors.push('需要动作名称');
  if (!draft.description && !draft.steps.length) errors.push('需要写一句「怎么做」或动作步骤');
  if (draft.category === 'strength' && !draft.primaryRegions.length) errors.push('力量动作需要选主要训练部位');
  const text = [draft.name, draft.description, draft.dose, ...draft.setup, ...draft.steps, ...draft.cues, ...draft.mistakes].join(' ');
  if (forbidden.test(text)) errors.push('动作说明不能写诊断、治疗、康复或矫正');
  return { ok: !errors.length, draft, errors };
}

// 个人动作 → 与公共动作相同的单元。
export function toUnit(p) {
  const parent = p.parentActivityId ? activityById(p.parentActivityId) : null;
  const body = p.primaryRegions?.length ? p.primaryRegions.map(r => bodyRegions[r].label) : [CATEGORIES[p.category] || '全身'];
  return { ...entry(p.id, p.name, p.category, body, p.minutes, {
    phase: p.phase, primaryRegions: p.primaryRegions, secondaryRegions: p.secondaryRegions, places: p.places, equipment: p.equipment,
    difficulty: `${tiers[p.tier]} · 我的动作`, tier: p.tier, impact: p.impact, system: p.system, aliases: p.aliases, description: p.description,
    setup: p.setup, steps: p.steps, ...(p.cues?.length ? { cues: p.cues } : {}), mistakes: p.mistakes, dose: p.dose,
    sourceId: 'personal', editorialStatus: 'personal' }),
    familyId: parent?.familyId || p.id, canonicalId: p.id, personal: true, archived: p.status === 'archived', source: p.source || null, personalNote: p.personalNote || '', planningUse: p.planningUse, parentActivityId: p.parentActivityId || null,
    selectable: p.status === 'confirmed' && p.planningUse === 'allowed', requiresGuidance: false, standardsVerified: false };
}
// 读取 / 保存数据后调用：把个人动作同步进实时注册表（归档的仍可查找，只是不再可选）。
export function syncPersonalActivities(state) { setPersonalActivities((state.personalActivities || []).map(toUnit)); }
export const isPersonal = a => a?.personal === true;

export function createPersonalActivity(state, input, { source = null, parentActivityId = null, planningUse = 'manual_only', personalNote = '' } = {}, now = new Date()) {
  const { ok, draft, errors } = normalizeActivityDraft(input);
  if (!ok) throw new Error(errors[0]);
  const clash = activities.find(a => [a.name, ...a.aliases].some(n => squash(n) === squash(draft.name)));
  if (clash) throw new Error(`动作库里已经有「${clash.name}」，可以直接给它记用途或心得，不必重复新建。`);
  if (parentActivityId && !activityById(parentActivityId)) throw new Error('找不到母动作。');
  const p = { id: `my-${uid()}`, status: 'confirmed', planningUse: PLANNING_USES[planningUse] ? planningUse : 'manual_only', ...draft,
    parentActivityId, source: source ? { knowledgeId: source.knowledgeId || null, quote: clip(source.quote, 300), lowTrust: Boolean(source.lowTrust), thumbnailId: clip(source.thumbnailId, 180)||null, sourceUrl: clip(source.sourceUrl, 1000)||null, startMs:Number.isFinite(Number(source.startMs))?Number(source.startMs):null, endMs:Number.isFinite(Number(source.endMs))?Number(source.endMs):null } : null,
    personalNote: clip(personalNote, 1000), createdAt: date(now), updatedAt: date(now), archivedAt: null };
  state.personalActivities ||= []; state.personalActivities.push(p);
  return p;
}
const findP = (state, id) => { const p = (state.personalActivities || []).find(x => x.id === id); if (!p) throw new Error('找不到这个个人动作。'); return p; };
export function updatePersonalActivity(state, id, input, now = new Date()) {
  const p = findP(state, id), { ok, draft, errors } = normalizeActivityDraft(input);
  if (!ok) throw new Error(errors[0]);
  const clash = activities.find(a => a.id !== id && [a.name, ...a.aliases].some(n => squash(n) === squash(draft.name)));
  if (clash) throw new Error(`动作库里已经有「${clash.name}」。`);
  Object.assign(p, draft, { updatedAt: date(now) });
  return p;
}
export function setActivityPlanning(state, id, use, now = new Date()) { const p = findP(state, id); if (!PLANNING_USES[use]) throw new Error('用途无效。'); p.planningUse = use; p.updatedAt = date(now); return p; }
export function archivePersonalActivity(state, id, archived = true, now = new Date()) { const p = findP(state, id); p.status = archived ? 'archived' : 'confirmed'; p.archivedAt = archived ? date(now) : null; p.updatedAt = date(now); return p; }
// 被训练记录、心得、收藏、用途备注或当前安排引用的个人动作只能归档，不能删除（否则备份会失效）。
export function activityReferences(state, id) {
  const items = [...(state.sessions || []).flatMap(s => s.items), ...(state.draft?.items || []), ...(state.savedPlans || []).flatMap(t => t.items)];
  return items.filter(i => i.activityId === id).length + (state.notes || []).filter(n => n.activityId === id).length
    + (state.knowledge || []).filter(k => (k.activityIds || []).includes(id)).length + (state.activityUses || []).filter(u => u.activityId === id).length
    + (state.creatorProfiles || []).filter(p => (p.activityIds || []).includes(id)).length;
}
export function deletePersonalActivity(state, id) {
  findP(state, id);
  const n = activityReferences(state, id);
  if (n) throw new Error(`这个动作已被 ${n} 处记录引用，只能归档，不能删除。`);
  state.personalActivities = state.personalActivities.filter(p => p.id !== id);
  return true;
}

// 手动把一个动作加进还没开始的安排：「仅手动使用」也可以，但场地、器械、难度、冲击照样检查。
export { manualEligible };
export function addToDraft(plan, activityId, profile) {
  const a = activityById(activityId);
  if (!plan || plan.startedAt) throw new Error('只能加到还没开始的安排里。');
  if (!a) throw new Error('找不到这个动作。');
  if (plan.items.some(i => i.activityId === a.id)) throw new Error('这个动作已经在安排里了。');
  if (!manualEligible(a, plan.request, profile)) throw new Error('今天的场地、器械、状态或训练经历不适合这个动作。');
  plan.items.push({ id: uid(), activityId: a.id, activitySnapshot: structuredClone(a), plannedMinutes: a.minutes, prescription: null, reason: '你手动加入的动作。', manual: true,
    status: 'pending', actualMinutes: null, feedback: '', actualSets: null, actualReps: null, actualLoadKg: null, actualSetDetails: null });
  plan.plannedMinutes += a.minutes; plan.unallocatedMinutes = Math.max(0, plan.unallocatedMinutes - a.minutes);
  return plan;
}

// ---------- AI：从视频 / 文字里提取动作 ----------
export function buildActivityIntakeInput(state, { capture = null, text = '' } = {}, now = new Date()) {
  const evidence = capture ? captureEvidence(capture) : [{ id: 'user-text', kind: 'user_text', text: clip(text, 4000) }];
  if (!evidence.some(e => clip(e.text, 1))) throw new Error('先提供一段动作描述，或选择有文字 / 视频解析的收藏。');
  return {
    today: date(now).slice(0, 10),
    source: capture ? { platform: capture.platform, url: capture.rawUrl || null, creator: clip(capture.resolvedSource?.creatorName || capture.sourceTitle, 120) || null, title: clip(capture.resolvedSource?.title, 180) || null } : null,
    evidence, userText: capture ? clip(capture.userNote, 500) : '',
    catalog: activities.map(a => ({ id: a.id, name: a.name, aliases: a.aliases.slice(0, 4), category: a.category, ...(a.personal ? { personal: true } : {}) })),
    vocab: { categories: Object.keys(CATEGORIES), phases: Object.keys(phases), regions: Object.keys(bodyRegions), places: Object.keys(places), equipment: Object.keys(equipmentLabels), impacts: Object.keys(IMPACTS), tiers: [1, 2, 3], systems: Object.keys(systems) },
    limits: { maxCandidates: 6 }
  };
}
export function validateActivityIntake(output, input) {
  if (!output || !['ok', 'empty', 'clarify'].includes(output.status)) return { ok: false, errors: ['status 应为 ok / empty / clarify'] };
  if (output.status === 'empty') return { ok: true, status: 'empty', reason: clip(output.reason, 300) || '没有找到足够清楚的动作。' };
  if (output.status === 'clarify') return clip(output.question, 1) ? { ok: true, status: 'clarify', question: clip(output.question, 220) } : { ok: false, errors: ['clarify 需要 question'] };
  const raw = Array.isArray(output.candidates) ? output.candidates : [], candidates = [], warnings = [];
  if (!raw.length || raw.length > 6) return { ok: false, errors: ['candidates 应有 1～6 个'] };
  raw.slice(0, 6).forEach((c, n) => {
    const at = `第 ${n + 1} 个动作`, quote = clip(c?.evidenceQuote, 300);
    const piece = input.evidence.find(p => (!c?.evidenceId || p.id === c.evidenceId) && squash(quote) && squash(p.text).includes(squash(quote)));
    if (!piece) { warnings.push(`${at}「${clip(c?.name, 20)}」缺少可核对的原文，已略去`); return; }
    const lowTrust = piece.evidenceSource === 'workflow_model';
    let type = c.type, matched = c.matchedActivityId ? activityById(c.matchedActivityId) : null;
    if (['existing', 'variant'].includes(type) && !matched) { warnings.push(`${at}对应的动作不在动作库里，已略去`); return; }
    if (type === 'existing') { candidates.push({ type, matchedActivityId: matched.id, name: matched.name, evidenceId: piece.id, evidenceQuote: quote, lowTrust, use: normalizeUse(c.use || {}) }); return; }
    if (!['variant', 'new'].includes(type)) { warnings.push(`${at}类型无效，已略去`); return; }
    const checked = normalizeActivityDraft({ ...c.draft, name: c.draft?.name || c.name });
    // 草稿名字其实就是已有动作：改成「已有动作」，不重复新建。
    const same = activities.find(a => [a.name, ...a.aliases].some(x => squash(x) === squash(checked.draft.name)));
    if (same) { candidates.push({ type: 'existing', matchedActivityId: same.id, name: same.name, evidenceId: piece.id, evidenceQuote: quote, lowTrust, use: null }); warnings.push(`「${checked.draft.name}」动作库里已有，改为关联已有动作`); return; }
    if (!checked.ok) { warnings.push(`${at}「${checked.draft.name || '未命名'}」${checked.errors[0]}，已略去`); return; }
    candidates.push({ type, matchedActivityId: type === 'variant' ? matched.id : null, name: checked.draft.name, evidenceId: piece.id, evidenceQuote: quote, lowTrust, draft: checked.draft });
  });
  if (!candidates.length) return { ok: false, errors: warnings.length ? warnings : ['没有可用的动作候选'] };
  return { ok: true, status: 'ok', candidates, warnings };
}
