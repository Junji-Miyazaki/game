// LANDER ranking relay — Cloudflare Worker（ダッシュボードの "Hello World" Worker に貼り付けて使う）
// ブラウザはトークンを持たず、この中継だけが「スコア専用リポジトリ」へ書き込む。
//
// 保存レイアウト（GitHub contents API の 1MB 制限を避けるため分割）
//   {LOG_DIR}/YYYY-MM.jsonl   受理した全エントリを月別に追記（監査ログ。約900KBで YYYY-MM-2.jsonl, -3 ... へ繰り上げ）
//   {TOP_FILE}                上位100件の JSON 配列（score desc, stage desc, 早い日時が先）。受理のたびに更新
//   GET /ranking は TOP_FILE だけを読む（上位20を返す）
//   {NAMES_FILE}              名前台帳 { normName: { name, keys:[keyHash…最大5], first, title?, pinHash?, pinSalt?, pinIp?, pinDay? } }（旧 keyHash は読み込み時に keys[0] へ移行）
//   ボード（board）: 'v1.0'（既定。既存の top.json / log/YYYY-MM.jsonl）と 'v1.1'（top-v1.1.json / log/v1.1/YYYY-MM.jsonl）。名前台帳と二つ名は両ボード共通
//   WORLD ボードは「名前ごとのベストスコア」1行（normName が同じなら同一人物扱い。ログインは無い）
//
// 環境変数（Worker > Settings > Variables and Secrets）
//   GITHUB_TOKEN    [Secret]  fine-grained PAT：対象は lander-scores リポジトリのみ、Contents: Read and write のみ
//   REPO            [Text]    例 "Junji-Miyazaki/lander-scores"
//   LOG_DIR         [Text]    省略時 "log"
//   TOP_FILE        [Text]    省略時 "top.json"
//   ADMIN_KEY       [Secret]  管理用の長い乱数文字列（DEBUG の管理操作用）
//   NAMES_FILE      [Text]    省略時 "names.json"
//   PIN_PEPPER      [Secret]  PIN ハッシュ用の長い乱数文字列（未設定なら PIN 系 API は 503 pin-disabled）
//   ALLOWED_ORIGINS [Text]    本番は "https://junji-miyazaki.github.io" のみ（localhost は試験中だけ一時的に追加）
//
// API
//   GET  /ranking?board= → { board, top: [{name,score,stage,date}, ...] }（上位20、名前ごとに1行。board 省略=v1.0、未知は 400）
//   GET  /name?n=  → { taken, hasPin }（空は 400）
//   POST /pin/set {name,key,pin} / /pin/clear {name,key} / /pin/login {name,pin,newKey}、POST /admin/pin-reset {name} / /admin/pin-set {name,pin}（README 参照）
//   POST /submit   ← { name, score, stage, key, board? }  → { ok: true } / 403 name-taken（キー不一致）。board v1.1 は今週・到達のボードも更新
//   POST /xp       ← { name, key, mission, time }  → { ok:true, best } / 400 invalid / 403 name-taken / 429 rate（EXPEDITION 最速。XP_IDS・XP_MIN_T〜XP_MAX_T 秒）
//   GET  /ranking?board=v1.1-week → { board, week, resetAt, top, last? } / v1.1-reach → { board, top }（到達ステージ順）/ xp-<id> → { board, mission, top }（タイム順）
//   POST /delete   ← { name, key }  → { ok: true }（台帳と top.json から削除。月ログは残す）
//   POST /title    ← { name, key, title, board? }  → { ok:true, title } / 400 invalid / 403 forbidden / 404 unknown / 409 not-champion
//                     二つ名（最大16文字）。現 WORLD 1位の名前の持ち主だけが設定/変更/消去できる（空文字で消去）。
//                     二つ名は名前に付いたまま残る（1位を明け渡しても保持。/delete・/admin/delete で名前ごと消える）
//   GET  /admin/list, POST /admin/delete {name}, POST /admin/title {name,title}  ヘッダ X-Admin-Key 必須（ADMIN_KEY 未設定なら 503）
//
// 限界（事実）: スコアはブラウザ側で計算されるため意図的な偽装は完全には防げない。
// ここでは妥当性チェックと、isolate内メモリによるベストエフォートの連投制限で抑止する。

const GH = 'https://api.github.com';
const MAX_NAME = 12;
const MAX_TITLE = 16;              // 二つ名の書記素上限
const MAX_TITLE_CP = 64;
const MAX_SCORE_PER_STAGE = 8000;   // 1ステージで取り得る上限より十分大きい値（P1.5で得点式が変わったら見直す）
const RL_MS = 20_000;               // 同一IPの連続送信間隔
const CACHE_MS = 30_000;            // ランキングGETのメモリキャッシュ
const TOP_KEEP = 100;               // top.json に保持する件数
const TOP_SERVE = 20;               // GET /ranking が返す件数
const ROLL_BYTES = 900_000;         // 月ファイルがこれを超えたら次の連番ファイルへ

const BOARDS = ['v1.0', 'v1.1'];    // 許可リスト。省略は 'v1.0'
const DEF_BOARD = 'v1.0';
const MAX_KEYS = 5;                 // 1つの名前に登録できる端末キー数（超えたら古い順に破棄）
const PIN_RE = /^\d{4,6}$/;
const PIN_MAX_FAILS = 5;            // (名前, IP) 組ごとの連続失敗上限
const PIN_LOCK_MS = 15 * 60_000;    // 組のロック時間
const PIN_DAY_MAX = 50;             // 名前ごとの UTC 日次失敗上限（全IP合計。超えたら翌 UTC 0時までその名前をロック）
const PIN_IP_KEEP = 20;             // 名前ごとに保持する ipTag の最大数
const PIN_IP_TTL_MS = 24 * 3600_000;
const PIN_IP_MAX = 30, PIN_IP_WIN_MS = 10 * 60_000;   // 同一IPの PIN ログイン試行上限（ベストエフォート）
const ADMIN_DELAY_MS = 400;         // 管理キー誤りの応答遅延
const KEY_RE = /^[0-9a-f]{32,128}$/i;   // クライアント生成の名前キー（hex）
// ---- 追加ランキング（v1.1 のみ）: 今週の得点 / 最高到達ステージ / EXPEDITION 最速タイム ----
// どれも名前ごとのベスト1行。ファイルは top と同じリポジトリ。二つ名は保存せず、返す時に台帳から付ける
const XB_WEEK = 'v1.1-week', XB_REACH = 'v1.1-reach';
const XP_IDS = ['ryugu', 'phobos', 'enceladus', '67p'];   // クライアント expedition/index.js の id と揃える
const XP_MIN_T = 5, XP_MAX_T = 1800;   // 受け付けるクリアタイム（秒）。下限は「これより速いのはありえない」目安［要確認：ミッションごとの実測は未］
const XP_RL_MS = 5_000;                // EXPEDITION 送信の同一IP間隔（スコア送信とは別枠）
const XB_KEEP = 100;
const JST_MS = 9 * 3600_000, WEEK_MS = 7 * 24 * 3600_000;

const rl = new Map();               // ip -> 最終送信時刻（isolate単位のベストエフォート）
const cached = new Map();           // board -> { at, body }
const pinRl = new Map();            // ip -> { n, t }
const xpRl = new Map();             // ip -> 最終 EXPEDITION 送信時刻
let namesCache = null;              // { at, map: Map(normName -> {name, first}) }
const monthIdx = new Map();         // 'YYYY-MM' -> 現在の連番（isolate内ヒント。正はGitHub上のサイズ）

const b64ToUtf8 = (b64) => {
  const bin = atob(String(b64).replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
const utf8ToB64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const allowedOrigins = (env) => (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const corsHeaders = (origin, env) => {
  const list = allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin': list.includes(origin) ? origin : (list[0] || ''),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    'Vary': 'Origin',
  };
};
const json = (body, status, headers) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
});
const ghHeaders = (env) => ({
  'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'lander-ranking-relay',
  'X-GitHub-Api-Version': '2022-11-28',
});
const dirOf = (env) => String(env.LOG_DIR || 'log').replace(/^\/+|\/+$/g, '');
const topPath = (env, board = DEF_BOARD) => {
  const base = String(env.TOP_FILE || 'top.json').replace(/^\/+/, '');
  return board === DEF_BOARD ? base : base.replace(/(\.[^./]*)?$/, (m) => `-${board}${m}`);
};
const namesPath = (env) => String(env.NAMES_FILE || 'names.json').replace(/^\/+/, '');
const monthPath = (env, month, n, board = DEF_BOARD) => `${dirOf(env)}${board === DEF_BOARD ? '' : '/' + board}/${month}${n > 1 ? '-' + n : ''}.jsonl`;
// board パラメータ: 省略/空 -> 'v1.0'、許可リスト外は null（呼び出し側が 400）
const boardOf = (raw) => (raw === undefined || raw === null || raw === '') ? DEF_BOARD : (typeof raw === 'string' && BOARDS.includes(raw) ? raw : null);
const fileUrl = (env, path) => `${GH}/repos/${env.REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;

// sha とサイズ（と、あれば内容）を取る。object 形式は最大100MBまで sha が取れる（内容は空のことがある）。404 は新規。
async function ghMeta(env, path) {
  const r = await fetch(fileUrl(env, path), { headers: { ...ghHeaders(env), 'Accept': 'application/vnd.github.object' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('github get ' + r.status);
  return await r.json();
}
async function ghRaw(env, path) {
  const r = await fetch(fileUrl(env, path), { headers: { ...ghHeaders(env), 'Accept': 'application/vnd.github.raw' } });
  if (!r.ok) throw new Error('github raw ' + r.status);
  return await r.text();
}
// -> { sha, size, text }（無ければ sha:null）。内容が base64 で来なければ raw で取り直す。
async function ghRead(env, path, needText = true) {
  const m = await ghMeta(env, path);
  if (!m) return { sha: null, size: 0, text: '' };
  const size = Number(m.size) || 0;
  if (!needText || size === 0) return { sha: m.sha, size, text: '' };
  if (m.encoding === 'base64' && typeof m.content === 'string' && m.content) return { sha: m.sha, size, text: b64ToUtf8(m.content) };
  return { sha: m.sha, size, text: await ghRaw(env, path) };
}
// 書き込み。true=成功 / false=sha競合(409/422) / それ以外は throw
async function ghPut(env, path, text, sha, message) {
  const body = { message, content: utf8ToB64(text) };
  if (sha) body.sha = sha;
  const r = await fetch(fileUrl(env, path), {
    method: 'PUT',
    headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.ok) return true;
  if (r.status === 409 || r.status === 422) return false;
  throw new Error('github put ' + r.status);
}
const backoff = (attempt) => new Promise((res) => setTimeout(res, 300 * (attempt + 1)));

const cmp = (a, b) => (b.score - a.score) || (b.stage - a.stage) || String(a.date).localeCompare(String(b.date));
const parseTop = (text) => {
  try {
    const a = JSON.parse(text);
    return Array.isArray(a) ? a.filter((o) => o && Number.isFinite(o.score) && Number.isFinite(o.stage)) : [];
  } catch { return []; }
};

// 月別ログへ1行追記（競合は読み直して再試行。約900KB超なら連番ファイルへ繰り上げ）
async function appendLog(env, entry, board = DEF_BOARD) {
  const month = entry.date.slice(0, 7);
  const line = JSON.stringify(entry) + '\n';
  for (let attempt = 0; attempt < 4; attempt++) {
    const hint = dirOf(env) + '|' + board + '|' + month;
    let n = monthIdx.get(hint) || 1;
    let cur;
    for (;;) {
      cur = await ghRead(env, monthPath(env, month, n, board), false);
      if (cur.size > ROLL_BYTES && n < 200) { n++; continue; }
      break;
    }
    monthIdx.set(hint, n);
    const path = monthPath(env, month, n, board);
    const text = cur.size ? (await ghRead(env, path, true)).text : '';
    // sha は直前に読んだ値を使う（内容再取得との間に更新されたら 409 → 再試行）
    if (await ghPut(env, path, text + line, cur.sha, entry.kind === 'title' ? `title: ${entry.name}` : entry.kind === 'pin' ? `pin: ${entry.name} ${entry.action}` : entry.kind === 'xp' ? `xp: ${entry.name} ${entry.mission} ${entry.time}s` : `score: ${entry.name} ${entry.score} (st.${entry.stage})`)) return;
    await backoff(attempt);
  }
  throw new Error('github log conflict');
}

// ---- 追加ランキングの保存 ----
// 週の始まり = 日本時間の月曜 0:00。weekId = その月曜の日付 'YYYY-MM-DD'
const weekStart = (now) => { const j = new Date(now + JST_MS); const dow = (j.getUTCDay() + 6) % 7; return Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() - dow) - JST_MS; };
const weekIdOf = (start) => new Date(start + JST_MS).toISOString().slice(0, 10);
const weekPath = (id) => `week/v1.1/${id}.json`;
const reachPath = () => 'reach-v1.1.json';
const xpPath = (id) => `xp/${id}.json`;
const parseRows = (text) => { try { const a = JSON.parse(text); return Array.isArray(a) ? a.filter((o) => o && typeof o.name === 'string') : []; } catch { return []; } };
const cmpReach = (a, b) => (b.stage - a.stage) || (b.score - a.score) || String(a.date).localeCompare(String(b.date));
const cmpTime = (a, b) => (a.time - b.time) || String(a.date).localeCompare(String(b.date));
// 名前ごとのベストを1行に。better(新, 旧) が真の時だけ書く（それ以外は GitHub に書かない）。-> 書いたら true
async function updateBest(env, path, entry, better, sort, message) {
  const k = normName(entry.name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await ghRead(env, path, true);
    const rows = parseRows(cur.text);
    const i = rows.findIndex((r) => normName(r.name) === k);
    if (i >= 0 && !better(entry, rows[i])) return false;
    const next = rows.slice();
    if (i >= 0) next[i] = { ...entry, name: rows[i].name }; else next.push(entry);
    next.sort(sort);
    if (await ghPut(env, path, JSON.stringify(next.slice(0, XB_KEEP)) + '\n', cur.sha, message)) return true;
    await backoff(attempt);
  }
  throw new Error('github board conflict');
}
// 名前を追加ランキング（今週・到達・EXPEDITION）から消す
async function removeFromExtras(env, key) {
  const paths = [weekPath(weekIdOf(weekStart(Date.now()))), reachPath(), ...XP_IDS.map(xpPath)];
  for (const path of paths) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = await ghRead(env, path, true);
      if (!cur.sha) break;
      const rows = parseRows(cur.text), rest = rows.filter((r) => normName(r.name) !== key);
      if (rest.length === rows.length) break;
      if (await ghPut(env, path, JSON.stringify(rest) + '\n', cur.sha, 'board: remove')) break;
      if (attempt === 3) throw new Error('github board conflict');
      await backoff(attempt);
    }
  }
}
// GET /ranking の追加ボード。-> 応答本文オブジェクト / null（該当なし）
async function extraBoard(env, board) {
  const names = await loadNames(env);
  const titled = (rows) => rows.slice(0, TOP_SERVE).map((r) => { const e = names.get(normName(r.name)); return e && e.title ? { ...r, title: e.title } : r; });
  if (board === XB_WEEK) {
    const start = weekStart(Date.now()), id = weekIdOf(start);
    const rows = parseRows((await ghRead(env, weekPath(id), true)).text).filter((r) => Number.isFinite(r.score) && Number.isFinite(r.stage)).sort(cmp);
    const prev = parseRows((await ghRead(env, weekPath(weekIdOf(start - WEEK_MS)), true)).text).filter((r) => Number.isFinite(r.score)).sort(cmp)[0];
    return { board, week: id, resetAt: start + WEEK_MS, top: titled(rows), ...(prev ? { last: { name: prev.name, score: prev.score } } : {}) };
  }
  if (board === XB_REACH) {
    const rows = parseRows((await ghRead(env, reachPath(), true)).text).filter((r) => Number.isFinite(r.stage) && Number.isFinite(r.score)).sort(cmpReach);
    return { board, top: titled(rows) };
  }
  const m = /^xp-(.+)$/.exec(board);
  if (m && XP_IDS.includes(m[1])) {
    const rows = parseRows((await ghRead(env, xpPath(m[1]), true)).text).filter((r) => Number.isFinite(r.time)).sort(cmpTime);
    return { board, mission: m[1], top: titled(rows) };
  }
  return null;
}
const extraCacheKey = (board) => board === XB_WEEK ? board + '|' + weekIdOf(weekStart(Date.now())) : board;
const isExtraBoard = (b) => b === XB_WEEK || b === XB_REACH || (typeof b === 'string' && /^xp-/.test(b) && XP_IDS.includes(b.slice(3)));

// 名前の正規化（クライアント net.js の normName と同一。別デプロイなので複製。変更時は両方を揃える）
// 全角/半角・大文字小文字は別名として扱う（前後の空白だけ除く）
const normName = (s) => String(s).trim();

// 名前ごとに最良の1行へ（同点は stage 大→早い日時）。表示名は採用した行のもの。
function dedupeBest(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = normName(r.name);
    const e = m.get(k);
    if (!e || cmp(r, e) < 0) m.set(k, r);
  }
  return Array.from(m.values());
}
// 新規エントリを統合：同名が既にあれば高い方を残し、表示名は保存済み行の名前を維持
function mergeEntry(rows, entry) {
  const list = dedupeBest(rows);
  const k = normName(entry.name);
  const i = list.findIndex((r) => normName(r.name) === k);
  if (i < 0) list.push(entry);
  else if (cmp(entry, list[i]) < 0) list[i] = { ...entry, name: list[i].name };
  return list.sort(cmp).slice(0, TOP_KEEP);
}

// top.json を更新（名前ごとのベスト上位100）。既存の重複行は初回書き込みで自然に統合される
// title: names.json 上の現在の二つ名（無ければ ''）。該当行に反映する
const withTitle = (r, title) => { const { title: _t, ...rest } = r; return title ? { ...rest, title } : rest; };
async function updateTop(env, entry, title = '', board = DEF_BOARD) {
  const path = topPath(env, board);
  const k = normName(entry.name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await ghRead(env, path, true);
    const rows = mergeEntry(parseTop(cur.text), entry).map((r) => (normName(r.name) === k ? withTitle(r, title) : r));
    if (await ghPut(env, path, JSON.stringify(rows) + '\n', cur.sha, `top: ${entry.name} ${entry.score}`)) return;
    await backoff(attempt);
  }
  throw new Error('github top conflict');
}

// ---- 名前台帳（names.json）{ normName: { name, keys:[keyHash…], first, title?, pinHash?, pinSalt?, pinIp?, pinDay? } } ----
const sha256hex = async (str) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)))), (b) => b.toString(16).padStart(2, '0')).join('');
const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
// PIN ハッシュ = HMAC-SHA256(key=PIN_PEPPER, msg=salt+':'+pin)。PBKDF2 等は無料プランの CPU 制限に収まらないため HMAC。安全性はペッパーの秘匿＋オンライン試行制限に依存
async function pinHashOf(env, salt, pin) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(env.PIN_PEPPER)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(salt + ':' + pin)));
}
// ipTag = HMAC-SHA256(key=PIN_PEPPER, msg='ip:'+ip) の先頭16hex。生のIPは保存しない
async function ipTagOf(env, ip) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(env.PIN_PEPPER)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('ip:' + ip))).slice(0, 16);
}
// 失効・24時間超の ipTag を捨て、最大 PIN_IP_KEEP 件（ロック中を優先、次に新しい順）に絞る
function prunePinIp(m, now) {
  const out = [];
  if (isObj(m)) for (const [t, v] of Object.entries(m)) {
    if (!isObj(v) || !Number.isFinite(v.t) || now - v.t > PIN_IP_TTL_MS) continue;
    const n = Math.floor(Number(v.n)) || 0;
    if (v.until !== undefined && !(Number(v.until) > now)) continue;   // ロック満了 = カウンタも捨てて0から
    const until = Number(v.until) > now ? Number(v.until) : 0;
    if (!until && n <= 0) continue;
    out.push([t, { n, ...(until ? { until } : {}), t: v.t }]);
  }
  out.sort((a, b) => (b[1].until ? 1 : 0) - (a[1].until ? 1 : 0) || b[1].t - a[1].t);
  return Object.fromEntries(out.slice(0, PIN_IP_KEEP));
}
const utcDay = (now) => new Date(now).toISOString().slice(0, 10);
const nextUtcMidnight = (now) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };
const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
// 定数時間比較（同長のハッシュ文字列を想定。長さが違えば不一致）
function teq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// 登録済みキーのどれかと一致するか（早期 return しない）
const hasKey = (e, hash) => { let ok = false; for (const k of (e.keys || [])) if (teq(k, hash)) ok = true; return ok; };
const addKey = (e, hash) => (hasKey(e, hash) ? e.keys : [...(e.keys || []), hash].slice(-MAX_KEYS));
// 旧形式 keyHash -> keys[0] に移行（読み込み時に毎回適用。次の書き込みで保存される）
function migrateEntry(v) {
  const { keyHash, ...rest } = v;
  const keys = (Array.isArray(v.keys) ? v.keys : []).filter((x) => typeof x === 'string' && x);
  if (!keys.length && typeof keyHash === 'string' && keyHash) keys.push(keyHash);
  return { ...rest, keys: keys.slice(-MAX_KEYS) };
}
const parseNames = (text) => {
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return new Map();
    return new Map(Object.entries(o).filter(([, v]) => v && typeof v === 'object' && typeof v.name === 'string').map(([k, v]) => [k, migrateEntry(v)]));
  } catch { return new Map(); }
};
const namesText = (map) => JSON.stringify(Object.fromEntries(map)) + '\n';
// names.json が無いとき top.json から作る（既存の行の名前を使用済み＝キー未設定の旧名にする）
async function namesFromTop(env) {
  const { text } = await ghRead(env, topPath(env), true);
  const rows = parseTop(text).filter((r) => typeof r.name === 'string').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const map = new Map();
  for (const r of rows) { const k = normName(r.name); if (!map.has(k)) map.set(k, { name: r.name, keys: [], first: String(r.date || ''), ...(typeof r.title === 'string' && r.title ? { title: r.title } : {}) }); }
  return map;
}
// -> { sha, map }（names.json が無ければ top.json から組み立て、sha:null）
async function readNames(env) {
  const cur = await ghRead(env, namesPath(env), true);
  return { sha: cur.sha, map: cur.sha ? parseNames(cur.text) : await namesFromTop(env) };
}
// 名前の登録/所有確認。 -> { status:'ok'|'taken', title }。登録済みキーのどれかが一致すれば ok。変更なしなら書き換えない
async function claimName(env, entry, keyHash) {
  const path = namesPath(env);
  const key = normName(entry.name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await readNames(env);
    const e = cur.map.get(key);
    let changed = cur.sha === null;
    if (e) {
      if (e.keys.length) {
        if (!hasKey(e, keyHash)) return { status: 'taken', title: '' };
        if (!changed) return { status: 'ok', title: e.title || '' };   // 旧形式の保存し直しは他の書き込み時に自然に行う
      } else {
        cur.map.set(key, { ...e, keys: [keyHash] });   // 旧名（キー無し）は最初のキー付き送信で確保
        changed = true;
      }
    } else {
      cur.map.set(key, { name: entry.name, keys: [keyHash], first: entry.date });
      changed = true;
    }
    if (!changed) return { status: 'ok', title: '' };
    if (await ghPut(env, path, namesText(cur.map), cur.sha, `name: ${entry.name}`)) return { status: 'ok', title: (cur.map.get(key) || {}).title || '' };
    await backoff(attempt);
  }
  throw new Error('github names conflict');
}
// 1名分の台帳エントリを更新する。fn(entry) -> { entry?: 新エントリ(変更時のみ), result }。競合時は読み直して fn をやり直す
// -> fn の result / { status:'unknown' }
async function updateEntry(env, key, fn, message) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await readNames(env);
    const e = cur.map.get(key);
    if (!e) return { status: 'unknown' };
    const r = await fn(e);
    if (!r.entry) return r.result;
    cur.map.set(key, r.entry);
    if (await ghPut(env, namesPath(env), namesText(cur.map), cur.sha, message(e))) return r.result;
    await backoff(attempt);
  }
  throw new Error('github names conflict');
}
// 全ボードの top を書き換える。fn(rows)->新rows（変更なしなら null）
async function rewriteTops(env, fn, message) {
  for (const board of BOARDS) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = await ghRead(env, topPath(env, board), true);
      if (!cur.sha) break;
      const next = fn(parseTop(cur.text));
      if (!next) break;
      if (await ghPut(env, topPath(env, board), JSON.stringify(next) + '\n', cur.sha, message)) break;
      if (attempt === 3) throw new Error('github top conflict');
      await backoff(attempt);
    }
  }
}
// 名前を台帳と全ボードの top.json から消す（月ログは監査証跡として残す）
async function removeName(env, key) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await readNames(env);
    if (!cur.map.has(key) && cur.sha) break;
    cur.map.delete(key);
    if (await ghPut(env, namesPath(env), namesText(cur.map), cur.sha, 'name: remove')) break;
    if (attempt === 3) throw new Error('github names conflict');
    await backoff(attempt);
  }
  await rewriteTops(env, (rows) => { const rest = rows.filter((r) => normName(r.name) !== key); return rest.length === rows.length ? null : rest; }, 'top: remove');
  await removeFromExtras(env, key);
}
// 二つ名を names.json と全ボードの top.json に反映（title '' で消去）。-> 'ok' | 'unknown'
async function applyTitle(env, key, title) {
  const r = await updateEntry(env, key, (e) => ({ entry: withTitle(e, title), result: 'ok' }), (e) => 'title: ' + e.name);
  if (r !== 'ok') return 'unknown';
  await rewriteTops(env, (rows) => (rows.some((x) => normName(x.name) === key) ? rows.map((x) => (normName(x.name) === key ? withTitle(x, title) : x)) : null), 'top: title');
  return 'ok';
}
// 現在の WORLD 1位の正規化名（無ければ null）
async function championKey(env, board = DEF_BOARD) {
  const rows = dedupeBest(parseTop((await ghRead(env, topPath(env, board), true)).text)).sort(cmp);
  return rows.length ? normName(rows[0].name) : null;
}
async function loadNames(env) {
  if (namesCache && Date.now() - namesCache.at <= CACHE_MS) return namesCache.map;
  const cur = await readNames(env);
  if (cur.sha === null) {
    try { await ghPut(env, namesPath(env), namesText(cur.map), null, 'names: backfill from top'); } catch { /* 書けなくても判定は返す */ }
  }
  namesCache = { at: Date.now(), map: cur.map };
  return cur.map;
}

const STRIP = /[\u0000-\u001f\u007f-\u009f<>\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\u061c\ufeff]/g;
const MAX_CP = 32;   // 結合文字を大量に連ねた1書記素の暴走を防ぐ（コードポイント総数の上限）
function cleanNameRaw(raw, maxG = MAX_NAME, maxCp = MAX_CP) {
  const s = String(raw ?? '').replace(STRIP, '').trim();
  const parts = (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment)
    : Array.from(s);
  let out = '', cp = 0, g = 0;
  for (const p of parts) {
    const c = Array.from(p).length;
    if (g >= maxG || cp + c > maxCp) break;
    out += p; cp += c; g++;
  }
  return out.trim();
}
const cleanTitle = (raw) => cleanNameRaw(raw, MAX_TITLE, MAX_TITLE_CP);
const cleanName = (raw) => cleanNameRaw(raw) || 'PILOT';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function isAdmin(req, env) {
  const k = req.headers.get('X-Admin-Key') || '';
  if (!k) return false;
  return teq(await sha256hex(k), await sha256hex(env.ADMIN_KEY));
}

function sanitize(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const name = cleanName(body.name);
  const score = Math.floor(Number(body.score));
  const stage = Math.floor(Number(body.stage));
  if (!Number.isFinite(stage) || stage < 1 || stage > 999) return null;
  if (!Number.isFinite(score) || score < 0 || score > stage * MAX_SCORE_PER_STAGE) return null;
  return { name, score, stage, date: new Date().toISOString() };
}

const isObj = (b) => b && typeof b === 'object' && !Array.isArray(b);
const pinLog = (env, name, action) => appendLog(env, { kind: 'pin', name, action, date: new Date().toISOString() }).catch(() => {});   // 秘密は書かない。ログ失敗は本処理に影響させない
function pinIpOk(ip) {
  const now = Date.now();
  const e = pinRl.get(ip);
  if (!e || now - e.t > PIN_IP_WIN_MS) { pinRl.set(ip, { n: 1, t: now }); return 0; }
  if (e.n >= PIN_IP_MAX) return Math.ceil((e.t + PIN_IP_WIN_MS - now) / 1000);
  e.n++; return 0;
}
const ADMIN_PATHS = ['/admin/list', '/admin/delete', '/admin/title', '/admin/pin-reset', '/admin/pin-set'];
const PIN_PATHS = ['/pin/set', '/pin/clear', '/pin/login'];

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const h = corsHeaders(origin, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    try {
      if (req.method === 'GET' && url.pathname === '/ranking' && isExtraBoard(url.searchParams.get('board'))) {
        const b = url.searchParams.get('board'), ck = extraCacheKey(b);
        let c = cached.get(ck);
        if (!c || Date.now() - c.at > CACHE_MS) { c = { at: Date.now(), body: JSON.stringify(await extraBoard(env, b)) }; cached.set(ck, c); }
        return new Response(c.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', ...h } });
      }
      if (req.method === 'GET' && url.pathname === '/ranking') {
        const board = boardOf(url.searchParams.get('board'));
        if (!board) return json({ error: 'invalid' }, 400, h);
        let c = cached.get(board);
        if (!c || Date.now() - c.at > CACHE_MS) {
          const { text } = await ghRead(env, topPath(env, board), true);
          const top = parseTop(text).sort(cmp).slice(0, TOP_SERVE);
          c = { at: Date.now(), body: JSON.stringify({ board, top }) };
          cached.set(board, c);
        }
        return new Response(c.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', ...h } });
      }
      if (req.method === 'GET' && url.pathname === '/name') {
        const n = cleanNameRaw(url.searchParams.get('n'));
        if (!n) return json({ error: 'invalid' }, 400, h);
        const e = (await loadNames(env)).get(normName(n));
        return json({ taken: !!e, hasPin: !!(e && e.pinHash) }, 200, h);
      }
      if (req.method === 'POST' && url.pathname === '/submit') {
        if (!allowedOrigins(env).includes(origin)) return json({ error: 'origin' }, 403, h);
        const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
        const last = rl.get(ip) || 0;
        if (Date.now() - last < RL_MS) return json({ error: 'rate' }, 429, h);
        const body = await req.json().catch(() => null);
        const entry = sanitize(body);
        const board = isObj(body) ? boardOf(body.board) : null;
        if (!entry || !board || typeof body.key !== 'string' || !KEY_RE.test(body.key)) return json({ error: 'invalid' }, 400, h);
        rl.set(ip, Date.now());
        const claim = await claimName(env, entry, await sha256hex(body.key));
        if (claim.status === 'taken') { namesCache = null; return json({ error: 'name-taken' }, 403, h); }
        await appendLog(env, entry, board);
        await updateTop(env, entry, claim.title, board);
        if (board === 'v1.1') {   // 追加ランキング。失敗しても本体の送信は成功として返す（次の送信で追いつく）
          const { name, score, stage, date } = entry;
          if (score > 0) { try { await updateBest(env, weekPath(weekIdOf(weekStart(Date.now()))), { name, score, stage, date }, (a, b) => cmp(a, b) < 0, cmp, `week: ${name} ${score}`); } catch { /* ignore */ } }
          try { await updateBest(env, reachPath(), { name, stage, score, date }, (a, b) => cmpReach(a, b) < 0, cmpReach, `reach: ${name} st.${stage}`); } catch { /* ignore */ }
        }
        cached.clear(); namesCache = null;
        return json({ ok: true }, 200, h);
      }
      // EXPEDITION のクリアタイム（MISSION モードの成功のみ、クライアントが送る）。名前の持ち主確認はスコア送信と同じ
      if (req.method === 'POST' && url.pathname === '/xp') {
        if (!allowedOrigins(env).includes(origin)) return json({ error: 'origin' }, 403, h);
        const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
        if (Date.now() - (xpRl.get(ip) || 0) < XP_RL_MS) return json({ error: 'rate' }, 429, h);
        const body = await req.json().catch(() => null);
        if (!isObj(body) || typeof body.key !== 'string' || !KEY_RE.test(body.key) || !XP_IDS.includes(body.mission)) return json({ error: 'invalid' }, 400, h);
        const t = Number(body.time);
        if (!Number.isFinite(t) || t < XP_MIN_T || t > XP_MAX_T) return json({ error: 'invalid' }, 400, h);
        xpRl.set(ip, Date.now());
        const entry = { name: cleanName(body.name), time: Math.round(t * 10) / 10, date: new Date().toISOString() };
        const claim = await claimName(env, entry, await sha256hex(body.key));
        if (claim.status === 'taken') { namesCache = null; return json({ error: 'name-taken' }, 403, h); }
        try { await appendLog(env, { kind: 'xp', mission: body.mission, ...entry }, 'v1.1'); } catch { /* 監査ログの失敗は本処理に影響させない */ }
        const best = await updateBest(env, xpPath(body.mission), entry, (a, b) => a.time < b.time, cmpTime, `xp: ${entry.name} ${body.mission} ${entry.time}s`);
        cached.clear(); namesCache = null;
        return json({ ok: true, best }, 200, h);
      }
      if (req.method === 'POST' && url.pathname === '/delete') {
        if (!allowedOrigins(env).includes(origin)) return json({ error: 'origin' }, 403, h);
        const body = await req.json().catch(() => null);
        const n = isObj(body) ? cleanNameRaw(body.name) : '';
        if (!n || typeof body.key !== 'string' || !KEY_RE.test(body.key)) return json({ error: 'invalid' }, 400, h);
        const k = normName(n);
        const e = (await readNames(env)).map.get(k);
        if (!e) return json({ error: 'unknown' }, 404, h);
        if (!hasKey(e, await sha256hex(body.key))) return json({ error: 'forbidden' }, 403, h);
        await removeName(env, k);
        cached.clear(); namesCache = null;
        return json({ ok: true }, 200, h);
      }
      if (req.method === 'POST' && url.pathname === '/title') {
        if (!allowedOrigins(env).includes(origin)) return json({ error: 'origin' }, 403, h);
        const body = await req.json().catch(() => null);
        const n = isObj(body) ? cleanNameRaw(body.name) : '';
        const board = isObj(body) ? boardOf(body.board) : null;
        if (!n || !board || typeof body.key !== 'string' || !KEY_RE.test(body.key) || typeof body.title !== 'string') return json({ error: 'invalid' }, 400, h);
        const k = normName(n);
        const title = cleanTitle(body.title);
        const e = (await readNames(env)).map.get(k);
        if (!e) return json({ error: 'unknown' }, 404, h);
        if (!hasKey(e, await sha256hex(body.key))) return json({ error: 'forbidden' }, 403, h);
        if (await championKey(env, board) !== k) return json({ error: 'not-champion' }, 409, h);
        await appendLog(env, { kind: 'title', name: e.name, title, date: new Date().toISOString() }, board);
        if (await applyTitle(env, k, title) === 'unknown') return json({ error: 'unknown' }, 404, h);
        cached.clear(); namesCache = null;
        return json({ ok: true, title }, 200, h);
      }
      if (PIN_PATHS.includes(url.pathname)) {
        if (req.method !== 'POST') return json({ error: 'not found' }, 404, h);
        if (!allowedOrigins(env).includes(origin)) return json({ error: 'origin' }, 403, h);
        if (!env.PIN_PEPPER) return json({ error: 'pin-disabled' }, 503, h);
        const body = await req.json().catch(() => null);
        const n = isObj(body) ? cleanNameRaw(body.name) : '';
        if (!n) return json({ error: 'invalid' }, 400, h);
        const k = normName(n);
        if (url.pathname === '/pin/login') {
          if (typeof body.pin !== 'string' || !PIN_RE.test(body.pin) || typeof body.newKey !== 'string' || !KEY_RE.test(body.newKey)) return json({ error: 'invalid' }, 400, h);
          const wait = pinIpOk(req.headers.get('CF-Connecting-IP') || 'unknown');
          if (wait) return json({ error: 'rate', retryAfter: wait }, 429, h);
          const newHash = await sha256hex(body.newKey);
          const ipTag = await ipTagOf(env, req.headers.get('CF-Connecting-IP') || 'unknown');
          const out = await updateEntry(env, k, async (e) => {
            if (!e.pinHash || !e.pinSalt) return { result: { code: 409, body: { error: 'no-pin' } } };
            const now = Date.now();
            const { fails: _f, lockUntil: _l, pinIp: _pi, pinDay: _pd, ...rest } = e;   // 旧 fails/lockUntil は破棄（移行）
            const today = utcDay(now);
            const day = isObj(e.pinDay) && e.pinDay.d === today ? { d: today, n: Math.max(0, Math.floor(Number(e.pinDay.n)) || 0) } : { d: today, n: 0 };
            if (day.n >= PIN_DAY_MAX) return { result: { code: 429, body: { error: 'locked', scope: 'name', retryAfter: Math.max(1, Math.ceil((nextUtcMidnight(now) - now) / 1000)) } } };
            const ips = prunePinIp(e.pinIp, now);
            const cur = ips[ipTag];
            if (cur && cur.until) return { result: { code: 429, body: { error: 'locked', retryAfter: Math.ceil((cur.until - now) / 1000) } } };
            const okPin = teq(await pinHashOf(env, e.pinSalt, body.pin), e.pinHash);
            if (okPin) {
              delete ips[ipTag];   // 成功でこのIPの組のカウンタだけリセット。日次カウントは戻さない
              return { entry: { ...rest, keys: addKey(e, newHash), pinIp: ips, pinDay: day }, result: { code: 200, log: 'login-ok', body: { ok: true, name: e.name, ...(e.title ? { title: e.title } : {}) } } };
            }
            day.n++;
            const n = (cur ? cur.n : 0) + 1;
            if (day.n >= PIN_DAY_MAX) {
              ips[ipTag] = { n, t: now };
              return { entry: { ...rest, pinIp: prunePinIp(ips, now), pinDay: day }, result: { code: 429, log: 'lock-name', body: { error: 'locked', scope: 'name', retryAfter: Math.max(1, Math.ceil((nextUtcMidnight(now) - now) / 1000)) } } };
            }
            if (n >= PIN_MAX_FAILS) {
              ips[ipTag] = { n, until: now + PIN_LOCK_MS, t: now };
              return { entry: { ...rest, pinIp: prunePinIp(ips, now), pinDay: day }, result: { code: 429, log: 'lock', body: { error: 'locked', retryAfter: Math.ceil(PIN_LOCK_MS / 1000) } } };
            }
            ips[ipTag] = { n, t: now };
            return { entry: { ...rest, pinIp: prunePinIp(ips, now), pinDay: day }, result: { code: 403, log: 'login-fail', body: { error: 'bad-pin' } } };
          }, (e) => 'pin: ' + e.name);
          if (out.status === 'unknown') return json({ error: 'unknown' }, 404, h);
          if (out.log) { await pinLog(env, n, out.log); namesCache = null; }
          return json(out.body, out.code, h);
        }
        if (typeof body.key !== 'string' || !KEY_RE.test(body.key)) return json({ error: 'invalid' }, 400, h);
        const kh = await sha256hex(body.key);
        let pinNew = null;
        if (url.pathname === '/pin/set') {
          if (typeof body.pin !== 'string' || !PIN_RE.test(body.pin)) return json({ error: 'invalid' }, 400, h);
          pinNew = body.pin;
        }
        const out = await updateEntry(env, k, async (e) => {
          if (!hasKey(e, kh)) return { result: 'forbidden' };
          const { pinHash: _a, pinSalt: _b, fails: _c, lockUntil: _d, pinIp: _e, pinDay: _g, ...rest } = e;
          if (pinNew === null) return { entry: rest, result: 'ok' };
          const pinSalt = newSalt();
          return { entry: { ...rest, pinSalt, pinHash: await pinHashOf(env, pinSalt, pinNew) }, result: 'ok' };
        }, (e) => 'pin: ' + e.name);
        if (out.status === 'unknown') return json({ error: 'unknown' }, 404, h);
        if (out === 'forbidden') return json({ error: 'forbidden' }, 403, h);
        await pinLog(env, n, pinNew === null ? 'clear' : 'set');
        namesCache = null;
        return json({ ok: true }, 200, h);
      }
      if (ADMIN_PATHS.includes(url.pathname)) {
        if (!env.ADMIN_KEY) return json({ error: 'admin disabled' }, 503, h);
        if (!(await isAdmin(req, env))) { await delay(ADMIN_DELAY_MS); return json({ error: 'unauthorized' }, 401, h); }
        if (req.method === 'GET' && url.pathname === '/admin/list') {
          const map = (await readNames(env)).map;
          const bests = {};
          for (const b of BOARDS) {
            const m = new Map();
            for (const r of dedupeBest(parseTop((await ghRead(env, topPath(env, b), true)).text))) m.set(normName(r.name), r);
            bests[b] = m;
          }
          const pick = (m, k) => { const b = m.get(k); return b ? { score: b.score, stage: b.stage, date: b.date } : null; };
          const names = Array.from(map, ([k, v]) => ({
            name: v.name, first: v.first || '', ...(v.title ? { title: v.title } : {}),
            best: pick(bests[DEF_BOARD], k),
            bests: Object.fromEntries(BOARDS.map((b) => [b, pick(bests[b], k)])),
            hasPin: !!v.pinHash, devices: v.keys.length,
          }));
          return json({ names }, 200, h);
        }
        if (req.method === 'POST' && url.pathname === '/admin/delete') {
          const body = await req.json().catch(() => null);
          const n = isObj(body) ? cleanNameRaw(body.name) : '';
          if (!n) return json({ error: 'invalid' }, 400, h);
          const k = normName(n);
          if (!(await readNames(env)).map.has(k)) return json({ error: 'unknown' }, 404, h);
          await removeName(env, k);
          cached.clear(); namesCache = null;
          return json({ ok: true }, 200, h);
        }
        if (req.method === 'POST' && url.pathname === '/admin/pin-reset') {
          const body = await req.json().catch(() => null);
          const n = isObj(body) ? cleanNameRaw(body.name) : '';
          if (!n) return json({ error: 'invalid' }, 400, h);
          const out = await updateEntry(env, normName(n), (e) => {
            const { pinHash: _a, pinSalt: _b, fails: _c, lockUntil: _d, pinIp: _e, pinDay: _g, ...rest } = e;
            return { entry: rest, result: 'ok' };
          }, (e) => 'pin: ' + e.name);
          if (out.status === 'unknown') return json({ error: 'unknown' }, 404, h);
          await pinLog(env, n, 'admin-reset');
          namesCache = null;
          return json({ ok: true }, 200, h);
        }
        // 端末キーを失った本人の救済: 管理者が仮の PIN を設定 → 本人が /pin/login で新しい端末キーを登録する。鍵・記録・二つ名は残す。失敗カウンタは消す
        if (req.method === 'POST' && url.pathname === '/admin/pin-set') {
          if (!env.PIN_PEPPER) return json({ error: 'pin-disabled' }, 503, h);
          const body = await req.json().catch(() => null);
          const n = isObj(body) ? cleanNameRaw(body.name) : '';
          if (!n || typeof body.pin !== 'string' || !PIN_RE.test(body.pin)) return json({ error: 'invalid' }, 400, h);
          const pin = body.pin;
          const out = await updateEntry(env, normName(n), async (e) => {
            const { pinHash: _a, pinSalt: _b, fails: _c, lockUntil: _d, pinIp: _e, pinDay: _g, ...rest } = e;
            const pinSalt = newSalt();
            return { entry: { ...rest, pinSalt, pinHash: await pinHashOf(env, pinSalt, pin) }, result: 'ok' };
          }, (e) => 'pin: ' + e.name);
          if (out.status === 'unknown') return json({ error: 'unknown' }, 404, h);
          await pinLog(env, n, 'admin-set');
          namesCache = null;
          return json({ ok: true }, 200, h);
        }
        if (req.method === 'POST' && url.pathname === '/admin/title') {
          const body = await req.json().catch(() => null);
          const n = isObj(body) ? cleanNameRaw(body.name) : '';
          if (!n || typeof body.title !== 'string') return json({ error: 'invalid' }, 400, h);
          const k = normName(n);
          const e = (await readNames(env)).map.get(k);
          if (!e) return json({ error: 'unknown' }, 404, h);
          const title = cleanTitle(body.title);
          await appendLog(env, { kind: 'title', name: e.name, title, date: new Date().toISOString() });
          if (await applyTitle(env, k, title) === 'unknown') return json({ error: 'unknown' }, 404, h);
          cached.clear(); namesCache = null;
          return json({ ok: true, title }, 200, h);
        }
      }
      return json({ error: 'not found' }, 404, h);
    } catch (e) {
      return json({ error: 'server' }, 502, h);
    }
  },
};
