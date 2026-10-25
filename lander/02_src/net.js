// 世界ランキング中継クライアント（P1.5）。RELAY_URL が空なら機能オフ＝ネットワーク呼び出しは一切しない。
// どの関数も例外を投げない。タイムアウトは AbortController＋競合タイマーの両方で保証し、本文の読み取り(json)まで含めて覆う。
export let RELAY_URL = 'https://lander-ranking.euler057721.workers.dev';   // ランキング中継（Cloudflare Worker、06_server/）。空にすると機能オフ
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
    const body = JSON.stringify({ name: entry.name, score: entry.score, stage: entry.stage, key: entry.key, ...(Number.isFinite(entry.startStage) ? { startStage: entry.startStage } : {}) });   // startStage は中継が現状は無視（将来の表示用）
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

// 名前の正規化。ワーカー(06_server/ranking-worker.js)の normName と同一にすること。
// 全角/半角・大文字小文字は別名。前後の空白だけ除く。
export function normName(s) { return String(s).trim(); }

// 名前の所有キー（端末ごと・名前ごと）。128bit 以上の乱数を hex で返す。乱数源が無ければ ''（送信は 400 になる）
export function makeNameKey() {
  try {
    const a = new Uint8Array(32);
    globalThis.crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch (_) { return ''; }
}

// -> { ok:true, taken } | { ok:false }（オフ/失敗/不正応答）。決して throw しない
export async function checkName(name, timeoutMs = NET_TIMEOUT_MS) {
  if (!RELAY_URL) return { ok: false };
  try {
    return await request(RELAY_URL + '/name?n=' + encodeURIComponent(String(name ?? '')), { method: 'GET' }, timeoutMs, async (res) => {
      if (!res || !res.ok) return { ok: false };
      const j = await res.json();
      return (j && typeof j.taken === 'boolean') ? { ok: true, taken: j.taken } : { ok: false };
    });
  } catch (_) {
    return { ok: false };
  }
}

const errOf = (res) => (res && res.status === 403 ? 'forbidden' : res && res.status === 404 ? 'unknown' : res && res.status === 401 ? 'unauthorized' : res && res.status === 503 ? 'disabled' : 'status ' + (res && res.status));

// 自分の名前を削除（台帳と WORLD ボードから）。-> { ok:true } | { ok:false, error }
export async function deleteName(name, key, timeoutMs = NET_TIMEOUT_MS) {
  if (!RELAY_URL) return { ok: false, error: 'disabled' };
  try {
    return await request(RELAY_URL + '/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, key }) }, timeoutMs,
      (res) => (res && res.ok) ? { ok: true } : { ok: false, error: errOf(res) });
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

// 管理（DEBUG 用）。-> { ok:true, names } | { ok:false, error }
export async function adminList(adminKey, timeoutMs = NET_TIMEOUT_MS) {
  if (!RELAY_URL) return { ok: false, error: 'disabled' };
  try {
    return await request(RELAY_URL + '/admin/list', { method: 'GET', headers: { 'X-Admin-Key': String(adminKey || '') } }, timeoutMs, async (res) => {
      if (!res || !res.ok) return { ok: false, error: errOf(res) };
      const j = await res.json();
      return (j && Array.isArray(j.names)) ? { ok: true, names: j.names } : { ok: false, error: 'bad response' };
    });
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
export async function adminDelete(adminKey, name, timeoutMs = NET_TIMEOUT_MS) {
  if (!RELAY_URL) return { ok: false, error: 'disabled' };
  try {
    return await request(RELAY_URL + '/admin/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': String(adminKey || '') }, body: JSON.stringify({ name }) }, timeoutMs,
      (res) => (res && res.ok) ? { ok: true } : { ok: false, error: errOf(res) });
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
