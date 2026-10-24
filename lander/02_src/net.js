// 世界ランキング中継クライアント（P1.5）。RELAY_URL が空なら機能オフ＝ネットワーク呼び出しは一切しない。
// どの関数も例外を投げない。タイムアウトは AbortController＋競合タイマーの両方で保証し、本文の読み取り(json)まで含めて覆う。
export let RELAY_URL = '';   // 例: 'https://lander-ranking.xxx.workers.dev'（未設定）
export function __setRelayUrl(u) { RELAY_URL = String(u || '').replace(/\/+$/, ''); }  // テスト用
export function relayEnabled() { return !!RELAY_URL; }
export const NET_TIMEOUT_MS = 5000;

// fetch〜本文の読み取り(parse)までを1本のタイムアウトで覆う。決して throw しない（失敗は reject→呼び出し側で握る）。
function request(url, init, ms, parse) {
  const f = globalThis.fetch;
  if (typeof f !== 'function') return Promise.reject(new Error('no fetch'));
  const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => { try { ac && ac.abort(); } catch (_) { /* ignore */ } rej(new Error('timeout')); }, ms);
  });
  const work = Promise.resolve()
    .then(() => f(url, Object.assign({}, init, ac ? { signal: ac.signal } : {})))
    .then((res) => parse(res));
  work.catch(() => {});   // timeout 後に遅れて失敗しても未処理 rejection にしない
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

// entry = { name, score, stage } -> { ok, status? , error? }
export async function submitScore(entry, timeoutMs = NET_TIMEOUT_MS) {
  if (!RELAY_URL) return { ok: false, error: 'disabled' };
  try {
    const body = JSON.stringify({ name: entry.name, score: entry.score, stage: entry.stage });
    return await request(RELAY_URL + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, timeoutMs,
      (res) => ({ ok: !!(res && res.ok), status: res && res.status }));
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// -> 配列（{name,score,stage,date}）または null（オフ/失敗）
export async function fetchWorldTop(timeoutMs = NET_TIMEOUT_MS) {
  if (!RELAY_URL) return null;
  try {
    return await request(RELAY_URL + '/ranking', { method: 'GET' }, timeoutMs, async (res) => {
      if (!res || !res.ok) return null;
      const j = await res.json();
      return (j && Array.isArray(j.top)) ? j.top : null;
    });
  } catch (_) {
    return null;
  }
}
