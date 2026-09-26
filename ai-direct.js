// Device-key ("direct") mode: the browser holds the API key and calls the model itself, so AI works
// even when the Mac proxy is unreachable (e.g. away from home on a static HTTPS host). This mirrors
// scripts/ai-core.mjs; the context building and validation still live in ai.js next to the local data.
import { buildMessages } from './ai.js';
import { skillPrompts } from './skill-prompts.js';

const TEMPERATURE = { intake: 0, plan: 0.4, log: 0 };

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
  const body = { model: cfg.model, messages, temperature: TEMPERATURE[skill] ?? 0.2, response_format: { type: 'json_object' } };
  if (/dashscope/.test(base)) body.enable_thinking = false;
  const res = await fetchImpl(`${base}/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`AI 服务返回 ${res.status}：${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { reply: parseReply(data.choices?.[0]?.message?.content), usage: data.usage || null };
}
