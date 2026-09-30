// Device-key ("direct") mode: the browser holds the API key and calls the model itself, so AI works
// even when the Mac proxy is unreachable (e.g. away from home on a static HTTPS host). This mirrors
// scripts/ai-core.mjs; the context building and validation still live in ai.js next to the local data.
import { buildMessages } from './ai.js';
import { skillPrompts } from './skill-prompts.js';

const TEMPERATURE = { intake: 0, plan: 0.4, log: 0, 'ability-intake': 0, 'knowledge-import': 0, 'creator-method': 0.3, 'knowledge-ask': 0.2, 'corpus-digest': 0.3, 'knowledge-search': 0.2, 'activity-intake': 0.2 };
// 整理类任务可在 AI 设置里另选模型（同一服务商百炼，不需要重新授权）；「安排」始终用默认模型。
export const ORGANIZE_SKILLS = ['log', 'ability-intake', 'knowledge-import', 'creator-method', 'knowledge-ask', 'corpus-digest', 'knowledge-search', 'activity-intake'];
export const ORGANIZE_MODELS = ['qwen3.8-flash', 'qwen3.8-max'];
export const organizeModelAllowed = (skill, model) => ORGANIZE_SKILLS.includes(skill) && ORGANIZE_MODELS.includes(model);
// 只有这些技能会让百炼联网搜索（用户在「AI 搜索」里主动提问时）。
// 兼容模式接口不返回搜索来源，模型会自己编链接；所以搜索走百炼原生接口，由程序取回真实的搜索结果
// （标题、链接、网站名）附在回复的 searchResults 上——模型写的同名字段一律被覆盖。
export const SEARCH_SKILLS = ['knowledge-search'];
export async function callSearch({ base, key, model }, messages, temperature, { fetchImpl = fetch, timeoutMs = 180000 } = {}) {
  const origin = new URL(base).origin;
  const body = { model, input: { messages }, parameters: { result_format: 'message', temperature, enable_thinking: false, enable_search: true,
    search_options: { forced_search: true, enable_source: true }, response_format: { type: 'json_object' } } };
  let res;
  try { res = await fetchImpl(`${origin}/api/v1/services/aigc/multimodal-generation/generation`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) }); } catch { throw new AINetworkError(); }
  if (!res.ok) throw new Error(`AI 搜索服务返回 ${res.status}：${(await res.text()).slice(0, 200)}`);
  const data = await res.json(), content = data.output?.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map(x => x?.text || '').join('') : content;
  const searchResults = (data.output?.search_info?.search_results || []).map(r => ({ index: r.index, title: String(r.title || '').trim(), url: r.url, site: r.site_name || '' }));
  return { reply: { ...parseReply(text), searchResults }, usage: data.usage || null };
}
// 本次调用要换用的模型；null 表示用默认模型。
export const organizeModel = (state, skill) => { const m = state?.settings?.aiOrganizeModel; return organizeModelAllowed(skill, m) ? m : null; };
// 直连只放行这张表里的服务；index.html 与 serve.mjs 的 connect-src 必须同步（有测试核对）。
export const DIRECT_HOSTS = ['dashscope.aliyuncs.com'];
export const allowedBase = base => { try { const u = new URL(base); return u.protocol === 'https:' && DIRECT_HOSTS.includes(u.hostname); } catch { return false; } };
// 连不上模型（断网、超时、被拦截）与模型报错分开，界面据此提供本地退路。
export class AINetworkError extends Error { constructor(message = '现在连不上 AI 服务。') { super(message); this.name = 'AINetworkError'; } }
// Mac 代理只会出现在本机或局域网地址；静态托管站点不去探测 /api。
export const proxyPossible = host => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === '[::1]' || host.endsWith('.local');

// The stored config, or null when the user has not opted into keeping a key on this device.
export const directConfig = state => state?.settings?.aiDirect?.key ? state.settings.aiDirect : null;

// A stable, non-secret tag identifying the provider+model pair, so changing either forces re-consent.
// A plain hash (not crypto): consentId is an identity marker and must also work over http://LAN,
// where crypto.subtle is unavailable (non-secure context).
export const directConsentId = (base, model) => {
  const s = `${base}|${model}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
};

export const providerHost = base => { try { return new URL(base).hostname; } catch { return String(base || ''); } };

function parseReply(content) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try { return JSON.parse(text); } catch {
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    if (start >= 0 && end > start) try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
    throw new Error('AI 回复不是有效的 JSON');
  }
}

// Same shape as the server's skillMessages: prompt + input, then one repair turn if validation failed.
export function directMessages(skill, input, repair) {
  const messages = buildMessages(skillPrompts[skill], input);
  if (repair) messages.push({ role: 'assistant', content: JSON.stringify(repair.reply) },
    { role: 'user', content: `程序校验未通过：\n${repair.errors.map(e => `- ${e}`).join('\n')}\n请修正这些问题，重新输出完整的 JSON 对象。` });
  return messages;
}

export async function callDirect(skill, messages, cfg, { fetchImpl = fetch, timeoutMs = 90000 } = {}) {
  const base = String(cfg.base || '').replace(/\/$/, '');
  if (!base || !cfg.key || !cfg.model) throw new Error('本机 AI 直连未配置完整（接口地址 / key / 模型）。');
  if (!allowedBase(base)) throw new Error('本机直连目前只支持阿里云百炼（https://dashscope.aliyuncs.com），请在 AI 设置里改正接口地址。');
  const body = { model: cfg.model, messages, temperature: TEMPERATURE[skill] ?? 0.2, response_format: { type: 'json_object' } };
  if (/dashscope/.test(base)) body.enable_thinking = false;
  if (SEARCH_SKILLS.includes(skill)) return callSearch({ base, key: cfg.key, model: cfg.model }, messages, body.temperature, { fetchImpl });
  let res;
  try {
    res = await fetchImpl(`${base}/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` }, body: JSON.stringify(body) });
  } catch { throw new AINetworkError(); }
  if (!res.ok) throw new Error(`AI 服务返回 ${res.status}：${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { reply: parseReply(data.choices?.[0]?.message?.content), usage: data.usage || null };
}
