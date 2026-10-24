// 世界ランキング中継クライアント（P1.5）。RELAY_URL が空なら機能オフ＝ネットワーク呼び出しは一切しない。
// どの関数も例外を投げない。タイムアウトは AbortController＋競合タイマーの両方で保証。
export let RELAY_URL = '';   // 例: 'https://lander-ranking.xxx.workers.dev'（未設定）
export function __setRelayUrl(u) { RELAY_URL = String(u || '').replace(/\/+$/, ''); }  // テスト用
export function relayEnabled() { return !!RELAY_URL; }
export const NET_TIMEOUT_MS = 5000;

function withTimeout(url, init, ms) {
  const f = globalThis.fetch;
  if (typeof f !== 'function') return Promise.reject(new Error('no fetch'));
  const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => { try { ac && ac.abort(); } catch (_) { /* ignore */ } rej(new Error('timeout')); }, ms);
  });
  const req = Promise.resolve().then(() => f(url, Object.assign({}, init, ac ? { signal: ac.signal } : {})));
  return Promise.race([req, timeout]).finally(() => clearTimeout(timer));
}

// entry = { name, score, stage } -> { ok, status? , error? }
export async function submitScore(entry, timeoutMs = NET_TIMEOUT_MS) {
  if (!RELAY_URL) return { ok: false, error: 'disabled' };
  try {
    const body = JSON.stringify({ name: entry.name, score: entry.score, stage: entry.stage });
    const res = await withTimeout(RELAY_URL + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, timeoutMs);
    return { ok: !!(res && res.ok), status: res && res.status };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// -> 配列（{name,score,stage,date}）または null（オフ/失敗）
export async function fetchWorldTop(timeoutMs = NET_TIMEOUT_MS) {
  if (!RELAY_URL) return null;
  try {
    const res = await withTimeout(RELAY_URL + '/ranking', { method: 'GET' }, timeoutMs);
    if (!res || !res.ok) return null;
    const j = await res.json();
    return (j && Array.isArray(j.top)) ? j.top : null;
  } catch (_) {
    return null;
  }
}
