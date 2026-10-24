// LANDER ranking relay — Cloudflare Worker（ダッシュボードの "Hello World" Worker に貼り付けて使う）
// ブラウザはトークンを持たず、この中継だけが「スコア専用リポジトリ」へ書き込む。
//
// 保存レイアウト（GitHub contents API の 1MB 制限を避けるため分割）
//   {LOG_DIR}/YYYY-MM.jsonl   受理した全エントリを月別に追記（監査ログ。約900KBで YYYY-MM-2.jsonl, -3 ... へ繰り上げ）
//   {TOP_FILE}                上位100件の JSON 配列（score desc, stage desc, 早い日時が先）。受理のたびに更新
//   GET /ranking は TOP_FILE だけを読む（上位20を返す）
//   {NAMES_FILE}              名前台帳 { normName: { name, first } }。先着順で名前の使用済みを判定する（無ければ top.json から自動作成）
//   WORLD ボードは「名前ごとのベストスコア」1行（normName が同じなら同一人物扱い。ログインは無い）
//
// 環境変数（Worker > Settings > Variables and Secrets）
//   GITHUB_TOKEN    [Secret]  fine-grained PAT：対象は lander-scores リポジトリのみ、Contents: Read and write のみ
//   REPO            [Text]    例 "Junji-Miyazaki/lander-scores"
//   LOG_DIR         [Text]    省略時 "log"
//   TOP_FILE        [Text]    省略時 "top.json"
//   ADMIN_KEY       [Secret]  管理用の長い乱数文字列（DEBUG の管理操作用）
//   NAMES_FILE      [Text]    省略時 "names.json"
//   ALLOWED_ORIGINS [Text]    本番は "https://junji-miyazaki.github.io" のみ（localhost は試験中だけ一時的に追加）
//
// API
//   GET  /ranking  → { top: [{name,score,stage,date}, ...] }（上位20、名前ごとに1行）
//   GET  /name?n=  → { taken: boolean }（空は 400）
//   POST /submit   ← { name, score, stage, key }  → { ok: true } / 403 name-taken（キー不一致）
//   POST /delete   ← { name, key }  → { ok: true }（台帳と top.json から削除。月ログは残す）
//   GET  /admin/list, POST /admin/delete {name}  ヘッダ X-Admin-Key 必須（ADMIN_KEY 未設定なら 503）
//
// 限界（事実）: スコアはブラウザ側で計算されるため意図的な偽装は完全には防げない。
// ここでは妥当性チェックと、isolate内メモリによるベストエフォートの連投制限で抑止する。

const GH = 'https://api.github.com';
const MAX_NAME = 12;
const MAX_SCORE_PER_STAGE = 8000;   // 1ステージで取り得る上限より十分大きい値（P1.5で得点式が変わったら見直す）
const RL_MS = 20_000;               // 同一IPの連続送信間隔
const CACHE_MS = 30_000;            // ランキングGETのメモリキャッシュ
const TOP_KEEP = 100;               // top.json に保持する件数
const TOP_SERVE = 20;               // GET /ranking が返す件数
const ROLL_BYTES = 900_000;         // 月ファイルがこれを超えたら次の連番ファイルへ

const ADMIN_DELAY_MS = 400;         // 管理キー誤りの応答遅延
const KEY_RE = /^[0-9a-f]{32,128}$/i;   // クライアント生成の名前キー（hex）

const rl = new Map();               // ip -> 最終送信時刻（isolate単位のベストエフォート）
let cached = null;                  // { at, body }
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
const topPath = (env) => String(env.TOP_FILE || 'top.json').replace(/^\/+/, '');
const namesPath = (env) => String(env.NAMES_FILE || 'names.json').replace(/^\/+/, '');
const monthPath = (env, month, n) => `${dirOf(env)}/${month}${n > 1 ? '-' + n : ''}.jsonl`;
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
async function appendLog(env, entry) {
  const month = entry.date.slice(0, 7);
  const line = JSON.stringify(entry) + '\n';
  for (let attempt = 0; attempt < 4; attempt++) {
    const hint = dirOf(env) + '|' + month;
    let n = monthIdx.get(hint) || 1;
    let cur;
    for (;;) {
      cur = await ghRead(env, monthPath(env, month, n), false);
      if (cur.size > ROLL_BYTES && n < 200) { n++; continue; }
      break;
    }
    monthIdx.set(hint, n);
    const path = monthPath(env, month, n);
    const text = cur.size ? (await ghRead(env, path, true)).text : '';
    // sha は直前に読んだ値を使う（内容再取得との間に更新されたら 409 → 再試行）
    if (await ghPut(env, path, text + line, cur.sha, `score: ${entry.name} ${entry.score} (st.${entry.stage})`)) return;
    await backoff(attempt);
  }
  throw new Error('github log conflict');
}

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
async function updateTop(env, entry) {
  const path = topPath(env);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await ghRead(env, path, true);
    const rows = mergeEntry(parseTop(cur.text), entry);
    if (await ghPut(env, path, JSON.stringify(rows) + '\n', cur.sha, `top: ${entry.name} ${entry.score}`)) return;
    await backoff(attempt);
  }
  throw new Error('github top conflict');
}

// ---- 名前台帳（names.json）{ normName: { name, keyHash?, first } } ----
const sha256hex = async (str) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)))), (b) => b.toString(16).padStart(2, '0')).join('');
// 定数時間比較（同長のハッシュ文字列を想定。長さが違えば不一致）
function teq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const parseNames = (text) => {
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return new Map();
    return new Map(Object.entries(o).filter(([, v]) => v && typeof v === 'object' && typeof v.name === 'string'));
  } catch { return new Map(); }
};
const namesText = (map) => JSON.stringify(Object.fromEntries(map)) + '\n';
// names.json が無いとき top.json から作る（既存の行の名前を使用済み＝キー未設定の旧名にする）
async function namesFromTop(env) {
  const { text } = await ghRead(env, topPath(env), true);
  const rows = parseTop(text).filter((r) => typeof r.name === 'string').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const map = new Map();
  for (const r of rows) { const k = normName(r.name); if (!map.has(k)) map.set(k, { name: r.name, first: String(r.date || '') }); }
  return map;
}
// -> { sha, map }（names.json が無ければ top.json から組み立て、sha:null）
async function readNames(env) {
  const cur = await ghRead(env, namesPath(env), true);
  return { sha: cur.sha, map: cur.sha ? parseNames(cur.text) : await namesFromTop(env) };
}
// 名前の登録/所有確認。 'ok' | 'taken'（キー不一致）。既に登録済みで変更なしなら書き換えない
async function claimName(env, entry, keyHash) {
  const path = namesPath(env);
  const key = normName(entry.name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await readNames(env);
    const e = cur.map.get(key);
    let changed = cur.sha === null;
    if (e) {
      if (e.keyHash) return teq(e.keyHash, keyHash) ? 'ok' : 'taken';
      cur.map.set(key, { ...e, keyHash });          // 旧名（キー無し）は最初のキー付き送信で確保
      changed = true;
    } else {
      cur.map.set(key, { name: entry.name, keyHash, first: entry.date });
      changed = true;
    }
    if (!changed) return 'ok';
    if (await ghPut(env, path, namesText(cur.map), cur.sha, `name: ${entry.name}`)) return 'ok';
    await backoff(attempt);
  }
  throw new Error('github names conflict');
}
// 名前を台帳と top.json から消す（月ログは監査証跡として残す）
async function removeName(env, key) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await readNames(env);
    if (!cur.map.has(key) && cur.sha) break;
    cur.map.delete(key);
    if (await ghPut(env, namesPath(env), namesText(cur.map), cur.sha, 'name: remove')) break;
    if (attempt === 3) throw new Error('github names conflict');
    await backoff(attempt);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await ghRead(env, topPath(env), true);
    const rows = parseTop(cur.text);
    const rest = rows.filter((r) => normName(r.name) !== key);
    if (rest.length === rows.length) return;
    if (await ghPut(env, topPath(env), JSON.stringify(rest) + '\n', cur.sha, 'top: remove')) return;
    await backoff(attempt);
  }
  throw new Error('github top conflict');
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
function cleanNameRaw(raw) {
  const s = String(raw ?? '').replace(STRIP, '').trim();
  const parts = (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment)
    : Array.from(s);
  let out = '', cp = 0, g = 0;
  for (const p of parts) {
    const c = Array.from(p).length;
    if (g >= MAX_NAME || cp + c > MAX_CP) break;
    out += p; cp += c; g++;
  }
  return out.trim();
}
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

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const h = corsHeaders(origin, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    try {
      if (req.method === 'GET' && url.pathname === '/ranking') {
        if (!cached || Date.now() - cached.at > CACHE_MS) {
          const { text } = await ghRead(env, topPath(env), true);
          const top = parseTop(text).sort(cmp).slice(0, TOP_SERVE);
          cached = { at: Date.now(), body: JSON.stringify({ top }) };
        }
        return new Response(cached.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', ...h } });
      }
      if (req.method === 'GET' && url.pathname === '/name') {
        const n = cleanNameRaw(url.searchParams.get('n'));
        if (!n) return json({ error: 'invalid' }, 400, h);
        const map = await loadNames(env);
        return json({ taken: map.has(normName(n)) }, 200, h);
      }
      if (req.method === 'POST' && url.pathname === '/submit') {
        if (!allowedOrigins(env).includes(origin)) return json({ error: 'origin' }, 403, h);
        const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
        const last = rl.get(ip) || 0;
        if (Date.now() - last < RL_MS) return json({ error: 'rate' }, 429, h);
        const body = await req.json().catch(() => null);
        const entry = sanitize(body);
        if (!entry || typeof body.key !== 'string' || !KEY_RE.test(body.key)) return json({ error: 'invalid' }, 400, h);
        rl.set(ip, Date.now());
        if (await claimName(env, entry, await sha256hex(body.key)) === 'taken') { namesCache = null; return json({ error: 'name-taken' }, 403, h); }
        await appendLog(env, entry);
        await updateTop(env, entry);
        cached = null; namesCache = null;
        return json({ ok: true }, 200, h);
      }
      if (req.method === 'POST' && url.pathname === '/delete') {
        if (!allowedOrigins(env).includes(origin)) return json({ error: 'origin' }, 403, h);
        const body = await req.json().catch(() => null);
        const n = body && typeof body === 'object' ? cleanNameRaw(body.name) : '';
        if (!n || typeof body.key !== 'string' || !KEY_RE.test(body.key)) return json({ error: 'invalid' }, 400, h);
        const k = normName(n);
        const e = (await readNames(env)).map.get(k);
        if (!e) return json({ error: 'unknown' }, 404, h);
        if (!e.keyHash || !teq(e.keyHash, await sha256hex(body.key))) return json({ error: 'forbidden' }, 403, h);
        await removeName(env, k);
        cached = null; namesCache = null;
        return json({ ok: true }, 200, h);
      }
      if (url.pathname === '/admin/list' || url.pathname === '/admin/delete') {
        if (!env.ADMIN_KEY) return json({ error: 'admin disabled' }, 503, h);
        if (!(await isAdmin(req, env))) { await delay(ADMIN_DELAY_MS); return json({ error: 'unauthorized' }, 401, h); }
        if (req.method === 'GET' && url.pathname === '/admin/list') {
          const map = (await readNames(env)).map;
          const best = new Map();
          for (const r of dedupeBest(parseTop((await ghRead(env, topPath(env), true)).text))) best.set(normName(r.name), r);
          const names = Array.from(map, ([k, v]) => {
            const b = best.get(k);
            return { name: v.name, first: v.first || '', best: b ? { score: b.score, stage: b.stage, date: b.date } : null };
          });
          return json({ names }, 200, h);
        }
        if (req.method === 'POST' && url.pathname === '/admin/delete') {
          const body = await req.json().catch(() => null);
          const n = body && typeof body === 'object' ? cleanNameRaw(body.name) : '';
          if (!n) return json({ error: 'invalid' }, 400, h);
          const k = normName(n);
          if (!(await readNames(env)).map.has(k)) return json({ error: 'unknown' }, 404, h);
          await removeName(env, k);
          cached = null; namesCache = null;
          return json({ ok: true }, 200, h);
        }
      }
      return json({ error: 'not found' }, 404, h);
    } catch (e) {
      return json({ error: 'server' }, 502, h);
    }
  },
};
