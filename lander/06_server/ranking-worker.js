// LANDER ranking relay — Cloudflare Worker（ダッシュボードの "Hello World" Worker に貼り付けて使う）
// ブラウザはトークンを持たず、この中継だけが「スコア専用リポジトリ」へ書き込む。
//
// 保存レイアウト（GitHub contents API の 1MB 制限を避けるため分割）
//   {LOG_DIR}/YYYY-MM.jsonl   受理した全エントリを月別に追記（監査ログ。約900KBで YYYY-MM-2.jsonl, -3 ... へ繰り上げ）
//   {TOP_FILE}                上位100件の JSON 配列（score desc, stage desc, 早い日時が先）。受理のたびに更新
//   GET /ranking は TOP_FILE だけを読む（上位20を返す）
//
// 環境変数（Worker > Settings > Variables and Secrets）
//   GITHUB_TOKEN    [Secret]  fine-grained PAT：対象は lander-scores リポジトリのみ、Contents: Read and write のみ
//   REPO            [Text]    例 "Junji-Miyazaki/lander-scores"
//   LOG_DIR         [Text]    省略時 "log"
//   TOP_FILE        [Text]    省略時 "top.json"
//   ALLOWED_ORIGINS [Text]    本番は "https://junji-miyazaki.github.io" のみ（localhost は試験中だけ一時的に追加）
//
// API
//   GET  /ranking  → { top: [{name,score,stage,date}, ...] }（上位20）
//   POST /submit   ← { name, score, stage }  → { ok: true }
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

const rl = new Map();               // ip -> 最終送信時刻（isolate単位のベストエフォート）
let cached = null;                  // { at, body }
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
    'Access-Control-Allow-Headers': 'Content-Type',
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

// top.json を更新（上位100）
async function updateTop(env, entry) {
  const path = topPath(env);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await ghRead(env, path, true);
    const rows = parseTop(cur.text);
    rows.push(entry);
    rows.sort(cmp);
    if (await ghPut(env, path, JSON.stringify(rows.slice(0, TOP_KEEP)) + '\n', cur.sha, `top: ${entry.name} ${entry.score}`)) return;
    await backoff(attempt);
  }
  throw new Error('github top conflict');
}

const STRIP = /[\u0000-\u001f\u007f-\u009f<>\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\u061c\ufeff]/g;
const MAX_CP = 32;   // 結合文字を大量に連ねた1書記素の暴走を防ぐ（コードポイント総数の上限）
function cleanName(raw) {
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
  return out.trim() || 'PILOT';
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
      if (req.method === 'POST' && url.pathname === '/submit') {
        if (!allowedOrigins(env).includes(origin)) return json({ error: 'origin' }, 403, h);
        const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
        const last = rl.get(ip) || 0;
        if (Date.now() - last < RL_MS) return json({ error: 'rate' }, 429, h);
        const body = await req.json().catch(() => null);
        const entry = sanitize(body);
        if (!entry) return json({ error: 'invalid' }, 400, h);
        rl.set(ip, Date.now());
        await appendLog(env, entry);
        await updateTop(env, entry);
        cached = null;
        return json({ ok: true }, 200, h);
      }
      return json({ error: 'not found' }, 404, h);
    } catch (e) {
      return json({ error: 'server' }, 502, h);
    }
  },
};
