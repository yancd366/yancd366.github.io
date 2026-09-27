import { activities, relations, seedNotes, seedKnowledge, goals, bodyRegions, regionLabel } from './catalog.js';
import { safetyContext, safetyBlock, canonicalMovement, eligibleRisk } from './safety.js';
export const SCHEMA_VERSION = 1;
export const STORE_KEY = 'xundong.v1';
export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function initialState() {
  return { schemaVersion: SCHEMA_VERSION, profile: { name: '', focus: 'balanced', equipment: [], experience: 'beginner', goalText: '', bodyNotes: '', ageRange:'', sleepHours:null, sittingHours:null, preferredSports:'', skipWarmup: false, updatedAt: null }, assessments:[], abilityEvidence:[], settings:{aiConsent:null, aiDirect:null, ingest:null}, notes: structuredClone(seedNotes), knowledge: structuredClone(seedKnowledge), captures:[], sessions: [], observations: [], draft: null };
}
export function eligible(activity, request, profile) {
  return activity.selectable !== false && activity.places.includes(request.place)
    && activity.equipment.every(e => availableEquipment(profile,request).includes(e))
    && (request.focus !== 'strength' || !request.targetRegions?.length || (activity.category === 'strength' && activity.primaryRegions.some(id=>request.targetRegions.includes(id))))
    && !(request.readiness === 'tired' && activity.impact !== 'low')
    && eligibleRisk(activity,profile);
}
// Beginners are only offered entry and intermediate candidates; advanced ones stay browsable.
export const maxTier = profile => profile.experience === 'regular' ? 2 : 1;
// 训练顺序:热身在前、放松在后;正式段内部按 技术/协调 → 力量 → 核心/等长 → 心肺。
export const PHASE_RANK = { warmup: 0, main: 1, cooldown: 2 };
const mainRank = a => a.category === 'coordination' ? 0
  : a.category === 'cardio' ? 3
  : (a.system === 'isometric' || a.primaryRegions.includes('core')) ? 2 : 1;
export const orderRank = a => [PHASE_RANK[a.phase] ?? 1, mainRank(a)];
// AI plans assume a gym has the usual equipment; profile equipment describes what is at home.
// An explicit request.equipment (e.g. "今天只有哑铃") overrides both.
export const GYM_EQUIPMENT = ['mat','band','dumbbell','kettlebell','pullup_bar','jump_rope','bench','barbell','rack','smith','cable','machine','dip_bars'];
export function availableEquipment(profile, request) {
  if (Array.isArray(request.equipment)) return [...request.equipment];
  return request.place === 'gym' ? [...new Set([...profile.equipment, ...GYM_EQUIPMENT])] : [...profile.equipment];
}
// Hard safety filter shared by AI candidates and AI plan re-checks. Region intent is left to the model;
// any stated discomfort limits candidates to low impact.
export function aiEligible(activity, request, profile) {
  if(safetyBlock(profile,request))return false;
  return eligible(activity, { place: request.place, equipment:availableEquipment(profile,request), focus: 'balanced', readiness: request.readiness === 'normal' ? 'normal' : 'tired' }, profile);
}
export function createPlan(request, profile, sessions = [], now = new Date()) {
  const safety=safetyBlock(profile,request);if(safety)return {blocked:true,reason:safety};
  if (request.readiness === 'discomfort') return { blocked: true, reason: '先记录今天哪里不舒服，再决定是否适合训练。本版不根据症状自动开训练方案。' };
  if (profile.bodyNotes?.trim()) return { blocked: true, reason: '身体档案中有需要留意的情况。首版不能解析这些限制，请先明确适合的活动范围。' };
  const budget = Number(request.minutes);
  if (!Number.isInteger(budget)||budget<2||budget>180 || !['home','office','gym'].includes(request.place) || !goals[request.focus]) throw new Error('请选择有效的时间、地点和训练重点。');
  if (request.targetRegions != null && (!Array.isArray(request.targetRegions) || request.targetRegions.some(id=>!Object.hasOwn(bodyRegions,id)))) throw new Error('请选择有效的训练部位。');
  const normalizedRequest = { ...request, targetRegions: request.focus === 'strength' ? [...new Set(request.targetRegions || [])] : [] };
  const wanted = request.focus === 'strength' ? (normalizedRequest.targetRegions.length ? normalizedRequest.targetRegions : Object.keys(bodyRegions).filter(id=>bodyRegions[id].common)) : [];
  const recent = new Set(sessions.filter(s => new Date(s.endedAt) <= now && now - new Date(s.endedAt) < 2 * 86400000).flatMap(s => s.items.filter(i => i.status === 'completed').map(i => i.activityId)));
  const pool = activities.filter(a => eligible(a, normalizedRequest, profile) && (request.focus !== 'strength' || a.category === 'strength'));
  if (request.focus === 'strength' && !pool.length) return { blocked:true, reason:`当前场地和器械下，动作库暂时没有匹配${regionLabel(wanted)}的力量候选。可以调整部位或器械，或先浏览动作库；不会用其他部位的动作代替。` };
  const scored = pool.map((a,index) => ({ a, score: (a.category === request.focus ? 12 : 0) + (request.focus === 'balanced' && ['strength','mobility','cardio'].includes(a.category) ? 4 : 0) + (request.readiness === 'tired' && ['recovery','mobility'].includes(a.category) ? 6 : 0) - (recent.has(a.id) ? 8 : 0) - (profile.experience === 'regular' ? 0 : 3 * ((a.tier ?? 1) - 1)) - index / 100 })).sort((a,b) => b.score-a.score);
  const toItem = a => ({ id: uid(), activityId: a.id, activitySnapshot: structuredClone(a), plannedMinutes: a.minutes, status: 'pending', actualMinutes: null, feedback: '', actualSets: null, actualReps: null, actualLoadKg: null });
  // 热身 / 放松从放宽资格的池里选(不受力量的部位过滤限制),不进入 covered 区域统计。
  const prepPool = phase => activities.filter(a => a.phase === phase && eligible(a, { ...normalizedRequest, focus: 'balanced', targetRegions: [] }, profile))
    .sort((x,y) => (Number(recent.has(x.id))-Number(recent.has(y.id))) || ((x.tier??1)-(y.tier??1)) || (x.minutes-y.minutes));
  let left = budget;
  const items = [];
  const maxItems = budget <= 10 ? 3 : 6;
  const covered = new Set();
  // 除非用户选择「直接开练」,给正式训练前加 1 个热身(mobility 类不需要休息,时间从预算里扣)。
  if (budget > 10 && !profile.skipWarmup && ['strength','balanced','cardio','coordination'].includes(request.focus)) {
    const warmup = prepPool('warmup').find(a => a.minutes <= left);
    if (warmup) { items.push(toItem(warmup)); left -= warmup.minutes; }
  }
  let mainCount = 0;
  while (scored.length && mainCount < maxItems) {
    if (wanted.length) scored.sort((x,y)=>(y.score+20*y.a.primaryRegions.filter(id=>wanted.includes(id)&&!covered.has(id)).length)-(x.score+20*x.a.primaryRegions.filter(id=>wanted.includes(id)&&!covered.has(id)).length));
    const { a } = scored.shift();
    if(items.some(i=>canonicalMovement(i.activitySnapshot)===canonicalMovement(a)||(a.system==='convict'&&i.activitySnapshot.familyId===a.familyId)))continue;
    if (a.minutes > left) continue;
    if (request.focus === 'balanced' && items.filter(i => activities.find(x => x.id === i.activityId).category === a.category).length >= 2) continue;
    items.push(toItem(a));
    left -= a.minutes; mainCount++;
    a.primaryRegions.forEach(id=>covered.add(id));
  }
  // 较长的安排收尾加 1 个放松(拉伸/呼吸);「直接开练」同样跳过。
  if (budget >= 25 && !profile.skipWarmup) {
    const cooldown = prepPool('cooldown').find(a => a.minutes <= left && !items.some(i=>i.activityId===a.id));
    if (cooldown) { items.push(toItem(cooldown)); left -= cooldown.minutes; }
  }
  // 按 热身 → 正式(技术/协调 → 力量 → 核心/等长 → 心肺) → 放松 稳定排序,同名次保留选入顺序。
  items.forEach((it,idx) => { it._i = idx; });
  items.sort((x,y) => { const rx=orderRank(x.activitySnapshot), ry=orderRank(y.activitySnapshot); return rx[0]-ry[0] || rx[1]-ry[1] || x._i-y._i; });
  items.forEach(it => { delete it._i; });
  // Rest/setup is explicitly reserved; never stretch a short sample into a long prescription.
  const allocated = items.reduce((sum,i) => sum+i.plannedMinutes,0);
  const reserve = Math.min(left, Math.max(0, items.length-1));
  return { id: uid(), createdAt: now.toISOString(), startedAt: null, safetyContext:safetyContext(profile,normalizedRequest), request: structuredClone(normalizedRequest), items, plannedMinutes: allocated, transitionMinutes: reserve, unallocatedMinutes: left-reserve,
    regionCoverage: (normalizedRequest.targetRegions.length?wanted:[...new Set([...wanted,...covered])]).filter(()=>request.focus==='strength').map(id=>({id,status:covered.has(id)?'included':pool.some(a=>a.primaryRegions.includes(id))?'time_limited':'unavailable'})),
    explanation: `${request.readiness === 'tired' ? '今天状态偏累，优先轻负荷候选。' : ''}${recent.size ? '近两天已完成的动作降低了优先级。' : '从简单、可控制的候选开始。'}${request.focus === 'balanced' ? '兼顾不同活动类型。' : request.focus === 'strength' ? `本次重点：${normalizedRequest.targetRegions.length?regionLabel(wanted):'全身均衡'}。只把主要训练部位计入覆盖。` : `优先安排${goals[request.focus]}相关活动。`}` };
}
export function replaceItem(plan, itemId, profile) {
  const item = plan.items.find(i => i.id === itemId);
  if (!item || item.status !== 'pending') return null;
  const old = activities.find(a => a.id === item.activityId);
  const relatedIds = new Set(relations.filter(r => r.type === 'alternative' && (r.from === old.id || r.to === old.id)).map(r => r.from === old.id ? r.to : r.from));
  const candidates = activities.filter(a => eligible(a, plan.request, profile) && !plan.items.some(i => canonicalMovement(activities.find(x=>x.id===i.activityId)) === canonicalMovement(a)) && a.minutes <= item.plannedMinutes && a.category === old.category && (a.familyId === old.familyId || relatedIds.has(a.id))
    && (old.level == null || a.level == null || Math.abs(a.level - old.level) <= 1));
  const replacement = candidates.sort((a,b) => Number(b.familyId === old.familyId)-Number(a.familyId === old.familyId))[0];
  return replacement || null;
}
export function checkPlanStart(plan, profile) {
  const block=safetyBlock(profile,plan.request);if(block)return block;
  if(plan.safetyContext&&plan.safetyContext!==safetyContext(profile,plan.request))return '身体档案或训练经历已变化，请重新生成安排。';
  if (plan.source === 'ai') return plan.items.some(i => !activities.find(a => a.id === i.activityId && aiEligible(a, plan.request, profile))) ? '器械或动作条件已经变化，请撤下旧安排后重新生成。' : null;
  if (profile.bodyNotes?.trim()) return '身体档案中有需要留意的情况，暂不自动开始训练。';
  if (plan.request.readiness === 'discomfort') return '今天有不舒服，请先记录状态。';
  if (plan.items.some(i => !activities.find(a => a.id === i.activityId && eligible(a, plan.request, profile)))) return '器械或动作条件已经变化，请撤下旧安排后重新生成。';
  return null;
}
export function applyReplacement(plan,itemId,activity){
  const i=plan.items.find(x=>x.id===itemId);if(!i||i.status!=='pending')throw new Error('只能替换尚未开始的动作。');
  const diff=i.plannedMinutes-activity.minutes;
  Object.assign(i,{activityId:activity.id,activitySnapshot:structuredClone(activity),plannedMinutes:activity.minutes,prescription:null,reason:'已更换动作，请重新选择适合的阻力；原动作的负荷不沿用。',actualSetDetails:null,actualSets:null,actualReps:null,actualLoadKg:null,feedback:''});
  plan.plannedMinutes-=diff;plan.unallocatedMinutes+=diff;
  const covered=new Set(plan.items.flatMap(x=>x.activitySnapshot.primaryRegions));
  if(plan.regionCoverage)plan.regionCoverage.forEach(x=>x.status=covered.has(x.id)?'included':'time_limited');
}
export function finishSession(plan, { actualMinutes, feedback, effort, itemFeedback = {} }, now = new Date()) {
  if (!plan.items.some(i => i.status === 'completed')) throw new Error('请至少确认一个实际完成的动作；未完成的计划不会记成训练。');
  const minutes = actualMinutes === '' || actualMinutes == null ? null : Number(actualMinutes);
  if (minutes != null && (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)) throw new Error('实际时长请填写 1～1440 分钟，或留空。');
  const rpe = effort === '' || effort == null ? null : Number(effort);
  if (rpe != null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10)) throw new Error('费力程度应为 1～10，或留空。');
  return { id: plan.id, planSnapshot: structuredClone(plan), startedAt: plan.startedAt, endedAt: now.toISOString(), actualMinutes: minutes, effort: rpe, feedback: String(feedback || '').trim(), source: 'user_confirmed', items: plan.items.map(i => ({ ...i, status: i.status === 'pending' ? 'skipped' : i.status, feedback: String(itemFeedback[i.id] || '').trim() })) };
}
export function updateNote(state, activityId, text, now = new Date()) {
  const existing = state.notes.find(n => n.activityId === activityId);
  if (existing) {
    if (existing.text !== text) existing.history.push({ text: existing.text, changedAt: existing.updatedAt });
    existing.text = text; existing.updatedAt = now.toISOString();
  } else state.notes.push({ id: uid(), activityId, text, origin: 'user', createdAt: now.toISOString(), updatedAt: now.toISOString(), history: [], pinned: true });
}
export function weekSummary(sessions, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-6);
  const recent = sessions.filter(s => new Date(s.endedAt) >= start && new Date(s.endedAt) <= now);
  return { sessions: recent.length, minutes: recent.reduce((n,s) => n + (s.actualMinutes || 0),0), unknown: recent.filter(s => s.actualMinutes == null).length,
    categories: [...new Set(recent.flatMap(s => s.items.filter(i => i.status === 'completed').map(i => i.activitySnapshot?.category || activities.find(a => a.id === i.activityId)?.category).filter(Boolean)))] };
}
export function safeURL(value) { try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
