// 世界ランキング中継クライアント（P1.5）。RELAY_URL が空なら機能オフ＝ネットワーク呼び出しは一切しない。
// どの関数も例外を投げない。タイムアウトは AbortController＋競合タイマーの両方で保証し、本文の読み取り(json)まで含めて覆う。
export let RELAY_URL = 'https://lander-ranking.euler057721.workers.dev';   // ランキング中継（Cloudflare Worker、06_server/）。空にすると機能オフ
export function __setRelayUrl(u) { RELAY_URL = String(u || '').replace(/\/+$/, ''); boardSupport = null; }  // テスト用
// ランキングのボード（版別）。v1.0 は既存、v1.1 は別ボード。中継が board 非対応(旧版)なら relayBoardSupported() が false
export let RELAY_BOARD = 'v1.0';
let boardSupport = null;   // 確定した応答のみキャッシュ（ネットワーク失敗は次回再試行）
export function __setRelayBoard(b) { RELAY_BOARD = String(b || 'v1.0'); boardSupport = null; }
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
    const body = JSON.stringify({ name: entry.name, score: entry.score, stage: entry.stage, key: entry.key, board: RELAY_BOARD, ...(Number.isFinite(entry.startStage) ? { startStage: entry.startStage } : {}) });   // startStage は中継が現状は無視（将来の表示用）
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
    return await request(RELAY_URL + '/ranking?board=' + encodeURIComponent(RELAY_BOARD), { method: 'GET' }, timeoutMs, async (res) => {
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

// 中継がこのボードに対応しているか。GET /ranking?board= の応答に board === RELAY_BOARD があれば true（旧中継は board を返さない→false）。
// 応答を受け取れたときだけセッション内キャッシュ。-> boolean（オフ/失敗は false）
export async function relayBoardSupported(timeoutMs = NET_TIMEOUT_MS) {
  if (!RELAY_URL) return false;
  if (boardSupport && boardSupport.url === RELAY_URL && boardSupport.board === RELAY_BOARD) return boardSupport.v;
  const url = RELAY_URL, board = RELAY_BOARD;
  try {
    const v = await request(url + '/ranking?board=' + encodeURIComponent(board), { method: 'GET' }, timeoutMs, async (res) => {
      if (!res || !res.ok) return false;
      const j = await res.json();
      return !!(j && j.board === board);
    });
    boardSupport = { url, board, v };
    return v;
  } catch (_) {
    return false;
  }
}

// -> { ok:true, taken, hasPin } | { ok:false }（オフ/失敗/不正応答）。決して throw しない
export async function checkName(name, timeoutMs = NET_TIMEOUT_MS) {
  if (!RELAY_URL) return { ok: false };
  try {
    return await request(RELAY_URL + '/name?n=' + encodeURIComponent(String(name ?? '')), { method: 'GET' }, timeoutMs, async (res) => {
      if (!res || !res.ok) return { ok: false };
      const j = await res.json();
      return (j && typeof j.taken === 'boolean') ? { ok: true, taken: j.taken, hasPin: j.hasPin === true } : { ok: false };
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

// 二つ名（WORLD 1位のみ）。-> { ok:true, title } | { ok:false, error }
// error: 'forbidden'|'unknown'|'not-champion'|'invalid'|'unauthorized'|'disabled'|'unavailable'(中継が未更新で /title が無い)|'status N'|ネットワーク/timeout 文字列
async function titleCall(path, headers, payload, timeoutMs) {
  if (!RELAY_URL) return { ok: false, error: 'disabled' };
  try {
    return await request(RELAY_URL + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(payload) }, timeoutMs, async (res) => {
      let j = null;
      try { j = await res.json(); } catch (_) { /* 本文なし/不正 */ }
      if (res && res.ok) return { ok: true, title: (j && typeof j.title === 'string') ? j.title : String(payload.title ?? '') };
      const e = j && typeof j.error === 'string' ? j.error : '';
      if (res && res.status === 404 && e === 'not found') return { ok: false, error: 'unavailable' };
      if (res && res.status === 409 && e === 'not-champion') return { ok: false, error: 'not-champion' };
      if (res && res.status === 400 && e === 'invalid') return { ok: false, error: 'invalid' };
      return { ok: false, error: errOf(res) };
    });
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
export function setTitle(name, key, title, timeoutMs = NET_TIMEOUT_MS) {
  return titleCall('/title', {}, { name, key, title, board: RELAY_BOARD }, timeoutMs);
}
export function adminSetTitle(adminKey, name, title, timeoutMs = NET_TIMEOUT_MS) {
  return titleCall('/admin/title', { 'X-Admin-Key': String(adminKey || '') }, { name, title }, timeoutMs);
}

// ---- PIN（任意。別端末でも同じ名前を使うため）。どれも throw しない ----
// error: 'pin-disabled'(中継に PIN_PEPPER 無し)|'no-pin'|'locked'(+retryAfter 秒)|'bad-pin'|'rate'(+retryAfter)|'forbidden'|'unknown'|'invalid'|'unauthorized'|'disabled'|'unavailable'(旧中継)|'status N'|ネットワーク文字列
async function pinCall(path, headers, payload, timeoutMs) {
  if (!RELAY_URL) return { ok: false, error: 'disabled' };
  try {
    return await request(RELAY_URL + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(payload) }, timeoutMs, async (res) => {
      let j = null;
      try { j = await res.json(); } catch (_) { /* 本文なし/不正 */ }
      if (res && res.ok) {
        const out = { ok: true };
        if (j && typeof j.name === 'string') out.name = j.name;
        if (j && typeof j.title === 'string') out.title = j.title;
        return out;
      }
      const e = j && typeof j.error === 'string' ? j.error : '';
      const ra = j && Number.isFinite(j.retryAfter) ? { retryAfter: j.retryAfter } : {};
      const st = res && res.status;
      if (st === 404 && e === 'not found') return { ok: false, error: 'unavailable' };
      if (st === 503 && e === 'pin-disabled') return { ok: false, error: 'pin-disabled' };
      if (st === 409 && e === 'no-pin') return { ok: false, error: 'no-pin' };
      if (st === 429 && e === 'locked') return Object.assign({ ok: false, error: 'locked' }, ra);
      if (st === 429 && e === 'rate') return Object.assign({ ok: false, error: 'rate' }, ra);
      if (st === 403 && e === 'bad-pin') return { ok: false, error: 'bad-pin' };
      if (st === 400 && e === 'invalid') return { ok: false, error: 'invalid' };
      return { ok: false, error: errOf(res) };
    });
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
export function setPin(name, key, pin, timeoutMs = NET_TIMEOUT_MS) { return pinCall('/pin/set', {}, { name, key, pin }, timeoutMs); }
export function clearPin(name, key, timeoutMs = NET_TIMEOUT_MS) { return pinCall('/pin/clear', {}, { name, key }, timeoutMs); }
// 成功すると中継がこの端末の newKey を登録する。-> { ok:true, name, title? }
export function loginWithPin(name, pin, newKey, timeoutMs = NET_TIMEOUT_MS) { return pinCall('/pin/login', {}, { name, pin, newKey }, timeoutMs); }
export function adminResetPin(adminKey, name, timeoutMs = NET_TIMEOUT_MS) { return pinCall('/admin/pin-reset', { 'X-Admin-Key': String(adminKey || '') }, { name }, timeoutMs); }
