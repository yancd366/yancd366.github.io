// 按创作者方法安排：用户在安排面板选一张方法卡和采用程度，AI 在安全候选内按方法编排，
// 并必须说明「采用了什么 / 没采用什么、为什么 / 哪些用默认补齐」。纯函数。
// 优先级固定：急性风险 / 不适限制 > 场地、器械、时间、训练经历 > 今天的明确目标和避免项 > 方法卡 > 一般编排偏好。
const clip = (value, max) => String(value || '').trim().slice(0, max);
export const METHOD_MODES = {
  inspiration: { label: '参考灵感', rule: '正常编排，在安全候选里优先选和方法相似的动作；不要求复刻。' },
  prefer: { label: '优先采用', rule: '在安全、场地、器械、时间和今天状态允许时，尽量按方法卡的原则组织主体动作和顺序。' },
  replicate: { label: '尽量复刻', rule: '只用方法卡里确认过的原则和动作来编排；做不到的部分（缺动作、缺信息、今天不合适）逐条写进 skipped，其余用常规编排补齐并说明。' }
};

// 当前生效的方法偏好：卡片存在、已保存、用户打开了「用于安排」，且「参考我的知识库」开着。
export function activeMethodPreference(state) {
  const pref = state.settings?.methodPreference;
  if (!pref || !METHOD_MODES[pref.mode] || state.settings?.useCorpus === false) return null;
  const card = (state.creatorProfiles || []).find(p => p.id === pref.creatorProfileId && p.status === 'saved' && p.allowedInPlanning);
  return card ? { card, mode: pref.mode } : null;
}
// 可供选择的方法卡（用户已允许参与安排的）。
export const plannableMethodCards = state => (state.creatorProfiles || []).filter(p => p.status === 'saved' && p.allowedInPlanning);

// 发给 AI 的方法输入：只给本次候选里能用的动作，另外列出方法里有、但今天用不了的动作。
export function methodPlanInput(pref, candidateIds) {
  if (!pref) return null;
  const ids = new Set(candidateIds), c = pref.card;
  return { id: c.id, title: clip(c.title, 120), creator: clip(c.creatorName, 80), mode: pref.mode, modeLabel: METHOD_MODES[pref.mode].label, modeRule: METHOD_MODES[pref.mode].rule,
    principles: (c.principles || []).map(p => clip(p.text, 200)), preferredActivityIds: (c.activityIds || []).filter(id => ids.has(id)),
    unavailableActivityIds: (c.activityIds || []).filter(id => !ids.has(id)), unknowns: (c.unknowns || []).map(u => clip(u, 120)) };
}

// AI 必须给出取舍说明；返回 {ok, report} 或 {ok:false, error}。
export function validateMethodReport(report, method) {
  if (!method) return { ok: true, report: null };
  if (!report || typeof report !== 'object') return { ok: false, error: '按创作者方法安排时需要 methodReport（采用了什么 / 没采用什么 / 默认补齐了什么）' };
  const adopted = (Array.isArray(report.adopted) ? report.adopted : []).map(x => clip(x, 160)).filter(Boolean).slice(0, 6);
  const skipped = (Array.isArray(report.skipped) ? report.skipped : []).map(x => ({ text: clip(x?.text, 160), reason: clip(x?.reason, 160) })).filter(x => x.text).slice(0, 6);
  if (!adopted.length && !skipped.length) return { ok: false, error: 'methodReport 至少要写一条 adopted 或 skipped' };
  if (skipped.some(x => !x.reason)) return { ok: false, error: 'methodReport.skipped 每条都要写 reason' };
  return { ok: true, report: { adopted, skipped, filledByDefault: clip(report.filledByDefault, 200) } };
}
