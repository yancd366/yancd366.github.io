// 知识库定期整理：AI 按主题把已确认的知识条目归纳成「主题总结卡」，每条结论逐字指回原条目；
// 用户逐张确认后才保存。网页不能后台定时，所以改为「新内容攒够了就提示」由用户触发。纯函数。
import { corpusEntries, normalizeTopics } from './corpus.js';

const uid = () => globalThis.crypto?.randomUUID?.() || `topic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clip = (value, max) => String(value || '').trim().slice(0, max);
const squash = s => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const forbidden = /诊断|治疗|治愈|根治|矫正|(?:无力|失衡|紧张|薄弱).{0,8}(?:导致|造成)|(?:导致|造成).{0,12}(?:圆肩|骨盆|疼痛|痛)/;
export const DIGEST_MIN_ENTRIES = 3;   // 至少这么多条才值得整理
export const DIGEST_PROMPT_AFTER = 10; // 上次整理后新增这么多条就提示

// 上次整理之后新增 / 更新的条目。
export function pendingDigest(state) {
  const all = corpusEntries(state), since = state.digestedAt || '';
  const fresh = all.filter(e => !since || String(e.updatedAt) > since);
  return { total: all.length, fresh: fresh.length, canDigest: all.length >= DIGEST_MIN_ENTRIES,
    shouldPrompt: all.length >= DIGEST_MIN_ENTRIES && (since ? fresh.length >= DIGEST_PROMPT_AFTER : all.length >= 5) };
}

// 新内容优先，再补同主题的旧内容，按字数预算装入。
export function buildDigestInput(state, { budget = 14000, now = new Date() } = {}) {
  const all = corpusEntries(state), since = state.digestedAt || '';
  const fresh = all.filter(e => !since || String(e.updatedAt) > since), freshTopics = new Set(fresh.flatMap(e => e.topics));
  const rest = all.filter(e => !fresh.includes(e)).sort((a, b) => Number(b.topics.some(t => freshTopics.has(t))) - Number(a.topics.some(t => freshTopics.has(t))));
  const entries = []; let used = 0;
  for (const e of [...fresh, ...rest]) {
    const x = { id: e.id, title: clip(e.title, 120), topics: e.topics, points: e.claims.length ? e.claims.map(c => ({ text: clip(c.text, 300), quote: clip(c.quote, 300) })) : [{ text: clip(e.summary, 400), quote: '' }] };
    const size = JSON.stringify(x).length; if (used + size > budget) continue; entries.push(x); used += size;
  }
  return { today: now.toISOString().slice(0, 10), entries, existing: (state.topicCards || []).map(t => ({ topic: t.topic, title: t.title, principles: t.principles.map(p => clip(p.text, 200)) })),
    limits: { maxTopics: 5, maxPrinciplesPerTopic: 6, maxSourcesPerPrinciple: 4 } };
}

export function validateDigest(output, input) {
  if (!output || !['ok', 'empty'].includes(output.status)) return { ok: false, errors: ['status 应为 ok / empty'] };
  if (output.status === 'empty') return { ok: true, status: 'empty', reason: clip(output.reason, 300) || '现有内容还不够归纳出主题。' };
  const hay = new Map(input.entries.map(e => [e.id, squash([e.title, ...e.points.flatMap(p => [p.text, p.quote])].join(' '))]));
  const topics = Array.isArray(output.topics) ? output.topics : [], errors = [], drafts = [], seen = new Set();
  if (!topics.length || topics.length > 5) errors.push('topics 应有 1～5 个');
  topics.slice(0, 5).forEach((t, n) => {
    const at = `第 ${n + 1} 个主题`, topic = normalizeTopics([t?.topic])[0];
    if (!topic) { errors.push(`${at}需要 topic`); return; }
    if (seen.has(topic)) { errors.push(`${at}「${topic}」重复`); return; }
    seen.add(topic);
    const principles = Array.isArray(t.principles) ? t.principles : [], kept = [];
    if (!principles.length || principles.length > 6) errors.push(`${at}的 principles 应有 1～6 条`);
    principles.slice(0, 6).forEach((p, k) => {
      const where = `${at}第 ${k + 1} 条`, text = clip(p?.text, 400);
      if (!text) errors.push(`${where}需要 text`);
      if (forbidden.test(text)) errors.push(`${where}不能写诊断、治疗或因果结论`);
      const sources = (Array.isArray(p?.sources) ? p.sources : []).slice(0, 4).filter(s => hay.has(s?.id) && squash(s.quote) && hay.get(s.id).includes(squash(s.quote))).map(s => ({ knowledgeId: s.id, quote: clip(s.quote, 300) }));
      if (!sources.length) errors.push(`${where}的来源必须逐字摘自输入里的知识条目`);
      if (text && sources.length && !forbidden.test(text)) kept.push({ text, sources });
    });
    drafts.push({ topic, title: clip(t.title, 120) || topic, summary: clip(t.summary, 500), principles: kept });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, status: 'ok', topics: drafts };
}

// 用户确认后写入：同一主题更新原卡（保留「用于安排」开关），新主题新建；并记下这次整理的时间。
export function applyDigest(state, topics, now = new Date()) {
  state.topicCards ||= [];
  const saved = [];
  for (const t of topics) {
    if (!t.principles?.length) continue;
    const base = { topic: t.topic, title: clip(t.title, 120) || t.topic, summary: clip(t.summary, 500), principles: t.principles.map(p => ({ text: clip(p.text, 400), sources: p.sources.map(s => ({ knowledgeId: s.knowledgeId, quote: clip(s.quote, 300) })) })),
      sourceKnowledgeIds: [...new Set(t.principles.flatMap(p => p.sources.map(s => s.knowledgeId)))], updatedAt: now.toISOString() };
    const existing = state.topicCards.find(x => x.topic === t.topic);
    if (existing) { Object.assign(existing, base); saved.push(existing); }
    else { const created = { id: uid(), status: 'saved', allowedInPlanning: true, createdAt: now.toISOString(), ...base }; state.topicCards.push(created); saved.push(created); }
  }
  state.digestedAt = now.toISOString();
  return saved;
}
const findCard = (state, id) => { const t = (state.topicCards || []).find(x => x.id === id); if (!t) throw new Error('找不到这张主题总结。'); return t; };
export function setTopicPlanning(state, id, allowed) { const t = findCard(state, id); t.allowedInPlanning = Boolean(allowed); return t; }
export function deleteTopicCard(state, id) { findCard(state, id); state.topicCards = state.topicCards.filter(x => x.id !== id); return true; }
