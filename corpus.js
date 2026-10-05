// 个人知识语料：所有已确认的知识条目（视频、粘贴文字、书、AI 搜索、自己的想法）统一成一种视图。
// 旧条目不改写：来源类型和可信级别从已有字段推出来；新条目在保存时写入 sourceKind / topics。纯函数。
export const SOURCE_KINDS = { video: '视频', text: '分享文字', book: '书', web_search: 'AI 搜索', self: '自己的想法' };
// 由高到低。后两级界面必须标「待核对」，默认不参与安排。
export const TRUST_LEVELS = { user_provided: '你提供的原文', parser: '平台字幕 / 语音转写', workflow_model: 'AI 画面描述（待核对）', ai_search: 'AI 搜索摘要（待核对）' };
const TRUST_ORDER = ['user_provided', 'parser', 'workflow_model', 'ai_search'];
export const lowTrust = trust => trust === 'workflow_model' || trust === 'ai_search';
const VIDEO_PLATFORMS = new Set(['douyin', 'xiaohongshu', 'bilibili']);
const clip = (value, max) => String(value || '').trim().slice(0, max);

// 主题标签：去重、去空，每个最多 12 字，最多 5 个。接受数组或「、,，」分隔的文字。
export function normalizeTopics(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[、,，;；\s]+/);
  return [...new Set(list.map(t => clip(t, 12).replace(/^#/, '')).filter(Boolean))].slice(0, 5);
}

export function entryKind(k, capture) {
  if (SOURCE_KINDS[k?.sourceKind]) return k.sourceKind;
  if (!capture) return 'self';
  if (capture.book) return 'book';
  if (VIDEO_PLATFORMS.has(capture.platform) && (capture.transcript?.text || capture.videoEvidence?.length || !capture.shareText)) return 'video';
  return 'text';
}
// 一条知识的可信级别取其中最弱的一条依据。
export function entryTrust(k, kind = k?.sourceKind) {
  if (kind === 'web_search') return 'ai_search';
  const levels = (k?.claims || []).map(c => c.evidenceSource === 'workflow_model' ? 'workflow_model' : ['asr_transcript', 'frame_ocr', 'platform_subtitle'].includes(c.evidenceKind) ? 'parser' : 'user_provided');
  return levels.reduce((worst, x) => TRUST_ORDER.indexOf(x) > TRUST_ORDER.indexOf(worst) ? x : worst, 'user_provided');
}

// 全部已确认条目，按更新时间新到旧；不设数量上限。
export function corpusEntries(state) {
  const caps = new Map((state.captures || []).map(c => [c.id, c]));
  return (state.knowledge || []).filter(k => k.status === 'saved').map(k => {
    const capture = caps.get(k.captureId), kind = entryKind(k, capture);
    return { id: k.id, title: k.title, summary: k.text, kind, trust: entryTrust(k, kind), topics: normalizeTopics(k.topics), book: capture?.book || k.book || null, contentType:k.contentType||null,
      claims: (k.claims || []).map(c => ({ text: c.text, quote: c.evidenceQuote || '' })), planPoints:(k.planPoints||[]).map(p=>({kind:p.kind,text:p.text,quote:p.evidenceQuote||''})), activityIds: k.activityIds || [],
      source: { name: k.sourceTitle || '', url: k.url || '' }, allowed: k.useInPlanning === true, updatedAt: k.updatedAt || k.createdAt || '' };
  }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
// 所有已用过的主题（供筛选和整理），按使用次数排序。
export function corpusTopics(state) {
  const count = new Map();
  for (const e of corpusEntries(state)) for (const t of e.topics) count.set(t, (count.get(t) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([topic, n]) => ({ topic, count: n }));
}

// localStorage 大约能存 500 万个字符；数据整体序列化后估算用量。
export const STORAGE_LIMIT = 5_000_000;
export function storageUsage(state) {
  const used = JSON.stringify(state).length, ratio = used / STORAGE_LIMIT;
  return { used, limit: STORAGE_LIMIT, ratio, level: ratio >= 0.85 ? 'full' : ratio >= 0.7 ? 'warn' : 'ok',
    text: used < 1e4 ? '不到 0.01 / 5 MB' : `约 ${(used / 1e6).toFixed(used < 1e5 ? 2 : 1)} / 5 MB` };
}

// ---------- 按相关性从全部语料挑选 ----------
// 不设条数上限，只按字数预算装入；相关度 = 与本次候选动作的交集 + 与本次要求 / 问题的字面重合。
const squash = s => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const grams = s => { const t = squash(s), out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; };
const overlap = (a, b) => { let n = 0; for (const g of a) if (b.has(g)) n++; return n; };
const entryText = e => [e.title, e.topics.join(' '), e.summary, ...e.claims.map(c => c.text),...e.planPoints.map(p=>p.text)].join(' ');
function pack(rows, budget, shape) {
  const out = []; let used = 0;
  for (const r of rows) { const x = shape(r), size = JSON.stringify(x).length; if (used + size > budget) continue; out.push(x); used += size; }
  return out;
}
const planShape = (e, ids, want) => ({ id: e.id, title: clip(e.title, 120), kind: SOURCE_KINDS[e.kind], contentType:e.contentType, ...(lowTrust(e.trust) ? { trust: TRUST_LEVELS[e.trust] } : {}), topics: e.topics,
  points: e.claims.length ? [...e.claims].sort((a,b)=>overlap(grams(b.text),want)-overlap(grams(a.text),want)).slice(0,5).map(c => clip(c.text, 200)) : [clip(e.summary, 300)],
  ...(e.planPoints.length?{planPoints:[...e.planPoints].sort((a,b)=>overlap(grams(b.text),want)-overlap(grams(a.text),want)).slice(0,5).map(p=>({kind:p.kind,text:clip(p.text,200)}))}:{}),activityIds: e.activityIds.filter(id => ids.has(id)) });

// 安排训练用：只看用户允许参考的条目。
export function corpusForPlan(state, { candidateIds = [], text = '', budget = 6000, selectedIds = null } = {}) {
  const ids = new Set(candidateIds), want = grams(text);
  const selected = selectedIds == null ? null : new Set(selectedIds);
  const scored = corpusEntries(state).filter(e => selected ? selected.has(e.id) : e.allowed).map(e => {
    const hits = e.activityIds.filter(id => ids.has(id)).length;
    const ov = overlap(grams(entryText(e)), want);
    // 至少两处字面重合才算相关，避免偶然撞上一个字对就把无关内容发出去。
    return { e, score: hits * 4 + (ov >= 2 ? Math.min(ov, 6) : 0) };
  }).filter(x => selected || x.score > 0).sort((a, b) => selected ? 0 : b.score - a.score);
  return pack(scored.map(x => x.e), budget, e => planShape(e, ids, want));
}
// 总结类卡片（创作者方法卡、主题总结卡）：用户打开「用于安排」的才给安排用。
const summaryCards = (state, forPlan) => [
  ...(state.creatorProfiles || []).filter(p => p.status === 'saved' && (!forPlan || p.allowedInPlanning)).map(p => ({ id: p.id, type: '方法卡', title: p.title, by: p.creatorName, principles: p.principles })),
  ...(state.topicCards || []).filter(p => p.status === 'saved' && (!forPlan || p.allowedInPlanning !== false)).map(p => ({ id: p.id, type: '主题总结', title: p.title, by: p.topic, principles: p.principles }))];
export function summariesForPlan(state, { text = '', budget = 2500, selectedIds = null } = {}) {
  const want = grams(text);
  const selected = selectedIds == null ? null : new Set(selectedIds);
  const rows = summaryCards(state, selected == null).filter(c=>selected==null||selected.has(c.id)).map(c => ({ c, score: overlap(grams([c.title, c.by, ...c.principles.map(p => p.text)].join(' ')), want) })).sort((a, b) => selected ? 0 : b.score - a.score);
  return pack(rows.map(x => x.c), budget, c => ({ id: c.id, type: c.type, title: clip(c.title, 120), by: c.by, principles: c.principles.map(p => clip(p.text, 200)) }));
}

// ---------- 问我的知识库 ----------
export function buildKnowledgeAskInput(state, question, { budget = 10000, now = new Date() } = {}) {
  const q = clip(question, 500), want = grams(q);
  const rows = corpusEntries(state).map(e => ({ e, score: overlap(grams(entryText(e)), want) }));
  const hit = rows.filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.e);
  const entries = pack(hit, budget * 0.75, e => ({ id: e.id, title: clip(e.title, 120), kind: SOURCE_KINDS[e.kind], ...(lowTrust(e.trust) ? { trust: TRUST_LEVELS[e.trust] } : {}), source: e.source.name, topics: e.topics,
    points: e.claims.length||e.planPoints.length ? [...e.claims,...e.planPoints].map(c => ({ text: clip(c.text, 300), quote: clip(c.quote, 300) })) : [{ text: clip(e.summary, 500), quote: '' }] }));
  const sums = summaryCards(state, false).map(c => ({ c, score: overlap(grams([c.title, c.by, ...c.principles.map(p => p.text)].join(' ')), want) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  const summaries = pack(sums.map(x => x.c), budget * 0.25, c => ({ id: c.id, type: c.type, title: clip(c.title, 120), by: c.by, principles: c.principles.map(p => ({ text: clip(p.text, 300), quotes: (p.sources || []).map(s => clip(s.quote, 200)) })) }));
  return { today: now.toISOString().slice(0, 10), question: q, entries, summaries, totalEntries: corpusEntries(state).length, limits: { maxPoints: 6, maxSourcesPerPoint: 3 } };
}
const forbidden = /诊断|治疗|治愈|根治|矫正|(?:无力|失衡|紧张|薄弱).{0,8}(?:导致|造成)|(?:导致|造成).{0,12}(?:圆肩|骨盆|疼痛|痛)/;
export function validateKnowledgeAnswer(output, input) {
  if (!output || !['ok', 'empty'].includes(output.status)) return { ok: false, errors: ['status 应为 ok / empty'] };
  if (output.status === 'empty') return { ok: true, status: 'empty', reason: clip(output.reason, 300) || '你的知识库里没有找到和这个问题相关的内容。' };
  const hay = new Map([...input.entries.map(e => [e.id, squash([e.title, ...e.points.flatMap(p => [p.text, p.quote])].join(' '))]),
    ...input.summaries.map(c => [c.id, squash([c.title, ...c.principles.flatMap(p => [p.text, ...p.quotes])].join(' '))])]);
  const titles = new Map([...input.entries, ...input.summaries].map(x => [x.id, { title: x.title, kind: x.kind || x.type, trust: x.trust || '' }]));
  const points = Array.isArray(output.answer) ? output.answer : [], errors = [], answer = [];
  if (!points.length || points.length > 6) errors.push('answer 应有 1～6 条');
  points.slice(0, 6).forEach((p, n) => {
    const at = `第 ${n + 1} 条回答`, text = clip(p?.text, 400);
    if (!text) errors.push(`${at}需要 text`);
    if (forbidden.test(text)) errors.push(`${at}不能写诊断、治疗或因果结论`);
    const sources = (Array.isArray(p?.sources) ? p.sources : []).slice(0, 3).filter(s => hay.has(s?.id) && squash(s.quote) && hay.get(s.id).includes(squash(s.quote))).map(s => ({ id: s.id, quote: clip(s.quote, 300), ...titles.get(s.id) }));
    if (!sources.length) errors.push(`${at}的来源必须逐字摘自输入里的知识条目`);
    if (text && sources.length && !forbidden.test(text)) answer.push({ text, sources });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, status: 'ok', answer, gaps: clip(output.gaps, 300) };
}
