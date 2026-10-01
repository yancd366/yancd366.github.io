// 五项简短身体自评（docs/身体自评-MVP.md）：每项选「轻松 / 勉强 / 做不到 / 跳过」，可分左右、写备注。
// 结果存成普通的能力观察（assessments），不打分、不排名、不推断原因；
// 只在用户允许「温和参考」时，让对应的一个已通过安全过滤的动作稍微靠前，不能解锁任何动作。
// 动作做法为循动整理，尚未经专业人员核对（界面会标明）。纯函数。
import { normalizeAssessment } from './abilities.js';

export const SELF_CHECK_VERSION = 1;
export const SELF_CHECK_RESULTS = { easy: '轻松', effortful: '勉强', unable: '做不到', skipped: '跳过' };
export const SELF_CHECK_TASKS = [
  { id: 'arm-raise', title: '舒适范围内抬臂', purpose: '看看双臂向上举时是否顺畅。', dimension: 'mobility', bodyAreas: ['shoulder'], sided: true, prefers: ['scapula'],
    how: ['站直或坐直，手臂放在身体两侧。', '一侧手臂伸直，从前方慢慢向上举，只举到不痛、不勉强的高度。', '放下后换另一侧，各做 3～5 次。'], support: '背靠墙站会更稳。' },
  { id: 'seated-rotation', title: '坐姿上背转动', purpose: '看看上背向左右转时是否舒适、可控。', dimension: 'mobility', bodyAreas: ['upper_back'], sided: true, prefers: ['thoracic'],
    how: ['坐在稳固的椅子前半部分，双脚踩地，双手交叉抱在胸前。', '保持骨盆不动，上身慢慢向一侧转，转到舒适的最大范围后回正。', '再转向另一侧，各做 3～5 次。'], support: '坐稳，臀部不离开椅面。' },
  { id: 'hip-mobility', title: '扶稳支撑下的髋部活动', purpose: '看看髋部前后摆动和抬腿时是否顺畅。', dimension: 'mobility', bodyAreas: ['hip'], sided: true, prefers: ['hip'],
    how: ['一手扶墙或稳固的椅背，单脚站稳。', '另一条腿放松，前后小幅摆动 5 次，再屈膝向前抬起 3～5 次。', '换另一侧。'], support: '全程扶稳，幅度从小开始。' },
  { id: 'single-leg-balance', title: '扶墙单脚站立', purpose: '看看左右单脚站时的平衡感。', dimension: 'balance', bodyAreas: ['ankle_foot'], sided: true, prefers: ['balance'],
    how: ['面对墙站，手指轻触墙面。', '抬起一只脚，试着保持 15～30 秒；需要时随时扶稳。', '换另一只脚。'], support: '手一直放在墙边，随时可以扶。' },
  { id: 'sit-to-stand', title: '稳定椅子的坐站动作', purpose: '看看从椅子上站起、坐下是否顺畅。', dimension: 'strength', bodyAreas: ['hip', 'knee'], sided: false, prefers: ['sitstand'],
    how: ['坐在靠墙放稳、不会滑动的椅子上，双脚与肩同宽踩地。', '双手抱胸或放在大腿上，站起来，再慢慢坐下。', '按自己的节奏做 5 次，觉得累就停。'], support: '椅子靠墙放，避免滑动。' }
];
export const STOP_RULE = '任何一项出现疼痛、麻木、头晕或明显不适，立即停止这一项，选「做不到」或「跳过」，并勾选下面的不适说明。';
const task = id => SELF_CHECK_TASKS.find(t => t.id === id);
const clip = (value, max) => String(value || '').trim().slice(0, max);
const uid = () => globalThis.crypto?.randomUUID?.() || `check-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const valid = r => Object.hasOwn(SELF_CHECK_RESULTS, r);
const hard = r => r === 'effortful' || r === 'unable';

// answers: { [taskId]: { left, right } | { both }, discomfort, note }。全部跳过的项不保存。
export function selfCheckRecords(answers, { observedAt, gentle = false, now = new Date() } = {}) {
  const records = [];
  for (const t of SELF_CHECK_TASKS) {
    const a = answers[t.id];
    if (!a) continue;
    const sides = t.sided ? { left: a.left, right: a.right } : { both: a.both };
    if (Object.values(sides).some(r => r != null && !valid(r))) throw new Error('自评结果无效。');
    const done = Object.entries(sides).filter(([, r]) => r && r !== 'skipped');
    if (!done.length) continue;
    const harder = done.filter(([, r]) => hard(r)).map(([s]) => s);
    const side = !t.sided ? 'not_applicable' : harder.length === 2 ? 'both' : harder.length === 1 ? harder[0] : done.length === 2 ? 'both' : done[0][0];
    const label = done.map(([s, r]) => `${s === 'left' ? '左侧' : s === 'right' ? '右侧' : ''}${SELF_CHECK_RESULTS[r]}`).join('；');
    const discomfort = Boolean(a.discomfort);
    const note = `${t.title}：${label}${discomfort ? '。做的时候出现疼痛或不适，已停止' : ''}${clip(a.note, 300) ? `。${clip(a.note, 300)}` : ''}`;
    records.push(normalizeAssessment({ id: uid(), dimension: t.dimension, signal: discomfort || harder.length ? 'limited' : 'comfortable', bodyAreas: t.bodyAreas, side,
      context: '简短自评', method: `循动简短自评 v${SELF_CHECK_VERSION} · ${t.title}`, note, evidenceQuote: '', observedAt, source: 'self_report',
      // 出现不适的项永远不参与安排（备注里含「疼痛」，「温和参考」也会被拒绝）。
      recommendationUse: gentle && !discomfort && harder.length ? 'gentle_preference' : 'off',
      taskId: t.id, taskVersion: SELF_CHECK_VERSION, result: Object.fromEntries(Object.entries(sides).filter(([, r]) => r)), discomfort, createdAt: now.toISOString() }));
  }
  return records;
}

// 每项最近两次（同一任务版本）的记录，用于重测对照。
export function selfCheckHistory(assessments = []) {
  return SELF_CHECK_TASKS.map(t => {
    const rows = assessments.filter(a => a.taskId === t.id && a.taskVersion === SELF_CHECK_VERSION && a.status !== 'archived')
      .sort((x, y) => String(y.observedAt).localeCompare(String(x.observedAt)) || String(y.createdAt).localeCompare(String(x.createdAt)));
    return { task: t, latest: rows[0] || null, previous: rows[1] || null };
  });
}
export const resultText = a => Object.entries(a?.result || {}).map(([s, r]) => `${s === 'left' ? '左 ' : s === 'right' ? '右 ' : ''}${SELF_CHECK_RESULTS[r] || r}`).join(' · ');

// 温和参考：自评觉得某项较难时，对应的那个动作 +3（只作用于已通过安全过滤的候选）。
export function selfCheckPreference(assessment, activityId) {
  const t = task(assessment.taskId);
  return Boolean(t && assessment.signal === 'limited' && !assessment.discomfort && t.prefers.includes(activityId));
}
