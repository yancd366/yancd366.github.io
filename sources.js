// 知识库的新来源：书的摘录 / 读书笔记，以及 AI 联网搜索（逐条确认后入库）。纯函数。
// 书：只存摘录和笔记，不存全文；作为一条「分享」保存，可以直接入库，也可以交给 AI 整理成要点。
// AI 搜索：拿不到它读过的原文，无法逐字核对，所以每条要点附来源链接、标「待核对」，默认不参与安排。
import { captureEntry, applyKnowledgeCard } from './knowledge.js';
import { normalizeTopics } from './corpus.js';

const uid = () => globalThis.crypto?.randomUUID?.() || `src-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clip = (value, max) => String(value || '').trim().slice(0, max);
const forbidden = /诊断|治疗|治愈|根治|矫正|(?:无力|失衡|紧张|薄弱).{0,8}(?:导致|造成)|(?:导致|造成).{0,12}(?:圆肩|骨盆|疼痛|痛)/;
const httpsURL = value => { try { const u = new URL(String(value || '').trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };

// ---------- 书 ----------
export function bookEntry(input, state, now = new Date()) {
  const title = clip(input.title, 120).replace(/^《|》$/g, ''), author = clip(input.author, 80), chapter = clip(input.chapter, 80), excerpt = clip(input.excerpt, 8000);
  if (!title) throw new Error('请填写书名。');
  if (!excerpt) throw new Error('请粘贴摘录或写下读书笔记。');
  const { capture, knowledge } = captureEntry({ rawUrl: '', sourceTitle: author || `《${title}》`, shareText: excerpt, userNote: clip(input.note, 1000) }, state, now);
  capture.book = { title, author, chapter };
  Object.assign(knowledge, { title: `《${title}》${chapter ? ` · ${chapter}` : ''}`, sourceKind: 'book', book: capture.book, topics: normalizeTopics(input.topics) });
  return { capture, knowledge };
}
// 不经 AI 直接入库：摘录本身就是一条要点，原文即引证。
export function saveBookDirect(state, captureId, { topics = [], useInPlanning = true } = {}, now = new Date()) {
  const capture = (state.captures || []).find(c => c.id === captureId);
  if (!capture?.book) throw new Error('找不到这条书摘。');
  const quote = clip(capture.shareText, 500), b = capture.book;
  const k = applyKnowledgeCard(state, captureId, { title: `《${b.title}》${b.chapter ? ` · ${b.chapter}` : ''}`, summary: clip(capture.userNote, 700), topics,
    claims: [{ text: quote, evidenceQuote: quote, evidenceId: 'user-text', evidenceKind: 'user_text', evidenceSource: 'user' }], activityLinks: [] }, now);
  k.book = b; k.useInPlanning = Boolean(useInPlanning);
  return k;
}

// ---------- AI 联网搜索 ----------
export function buildSearchInput(state, question, now = new Date()) {
  const q = clip(question, 300);
  if (!q) throw new Error('先写下想搜索的问题。');
  return { today: now.toISOString().slice(0, 10), question: q, existingTopics: [...new Set((state.knowledge || []).flatMap(k => normalizeTopics(k.topics)))].slice(0, 40),
    limits: { maxPoints: 6, maxSourcesPerPoint: 3 } };
}
// 来源只从 searchResults（程序从搜索接口取回的真实结果）里按编号取，模型不能自己写链接。
export function validateSearch(output) {
  if (!output || !['ok', 'empty'].includes(output.status)) return { ok: false, errors: ['status 应为 ok / empty'] };
  if (output.status === 'empty') return { ok: true, status: 'empty', reason: clip(output.reason, 300) || '没有搜到可靠的相关内容。' };
  const results = new Map((Array.isArray(output.searchResults) ? output.searchResults : []).filter(r => httpsURL(r?.url)).map(r => [Number(r.index), r]));
  if (!results.size) return { ok: false, errors: ['这次没有拿到搜索来源，请重试'] };
  const points = Array.isArray(output.points) ? output.points : [], errors = [], kept = [], warnings = [];
  if (!clip(output.title, 120)) errors.push('需要 title');
  if (!points.length || points.length > 6) errors.push('points 应有 1～6 条');
  points.slice(0, 6).forEach((p, n) => {
    const at = `第 ${n + 1} 条`, text = clip(p?.text, 400);
    if (!text) errors.push(`${at}需要 text`);
    if (forbidden.test(text)) errors.push(`${at}不能写诊断、治疗或因果结论`);
    const refs = [...new Set((Array.isArray(p?.refs) ? p.refs : []).map(Number))].slice(0, 3);
    const sources = refs.map(i => results.get(i)).filter(Boolean).map(r => ({ title: clip(r.title, 120) || new URL(r.url).hostname, url: httpsURL(r.url), site: clip(r.site, 40) }));
    // 引不出真实来源的要点直接略去（不让整次搜索失败），全部略去时才算失败。
    if (!sources.length) { if (text) warnings.push(`已略去没有搜索来源的一条：${text.slice(0, 20)}…`); return; }
    if (text && !forbidden.test(text)) kept.push({ text, sources });
  });
  if (!errors.length && !kept.length) errors.push('每条要点的 refs 必须是搜索结果的编号');
  if (errors.length) return { ok: false, errors };
  return { ok: true, status: 'ok', title: clip(output.title, 120), topics: normalizeTopics(output.topics), points: kept, warnings };
}
// 用户改过的要点文字也不能写医学承诺或因果结论。
export function checkEditedPoints(points) { for (const p of points) if (forbidden.test(p.text)) throw new Error(`「${p.text.slice(0, 16)}…」不能写诊断、治疗或因果结论。`); return points; }
// 用户逐条确认后入库：一问一条知识，默认不参与安排（可信级别低）。
export function saveSearchEntry(state, { question, title, topics, points }, now = new Date()) {
  if (!points?.length) throw new Error('至少保留一条要点。');
  const k = { id: uid(), status: 'saved', sourceKind: 'web_search', question: clip(question, 300), title: clip(title, 120) || clip(question, 120),
    text: points.map(p => p.text).join('；').slice(0, 700), url: points[0].sources[0].url, sourceTitle: 'AI 搜索', topics: normalizeTopics(topics),
    claims: points.map(p => ({ text: clip(p.text, 400), evidenceQuote: p.sources.map(s => s.title).join('；'), evidenceKind: 'ai_search', evidenceSource: 'ai_search', sources: p.sources })),
    activityIds: [], activityLinks: [], useInPlanning: false, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  state.knowledge.push(k);
  return k;
}
