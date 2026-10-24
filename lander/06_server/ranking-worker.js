// LANDER ranking relay — Cloudflare Worker（ダッシュボードの "Hello World" Worker に貼り付けて使う）
// ブラウザはトークンを持たず、この中継だけが「スコア専用リポジトリ」へ1行追記する。
//
// 環境変数（Worker > Settings > Variables and Secrets）
//   GITHUB_TOKEN    [Secret]  fine-grained PAT：対象は lander-scores リポジトリのみ、Contents: Read and write のみ
//   REPO            [Text]    例 "Junji-Miyazaki/lander-scores"
//   FILE            [Text]    例 "log.jsonl"（省略時 log.jsonl）
//   ALLOWED_ORIGINS [Text]    例 "https://junji-miyazaki.github.io,http://localhost:4176"
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

const rl = new Map();               // ip -> 最終送信時刻（isolate単位のベストエフォート）
let cached = null;                  // { at, body }

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
const fileUrl = (env) => `${GH}/repos/${env.REPO}/contents/${env.FILE || 'log.jsonl'}`;

async function ghGet(env) {
  const r = await fetch(fileUrl(env), { headers: ghHeaders(env) });
  if (r.status === 404) return { sha: null, text: '' };
  if (!r.ok) throw new Error('github get ' + r.status);
  const j = await r.json();
  return { sha: j.sha, text: b64ToUtf8(j.content || '') };
}

// 追記（同時送信で sha が古ければ 409/422 → 読み直して再試行）
async function ghAppend(env, entry) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { sha, text } = await ghGet(env);
    const body = {
      message: `score: ${entry.name} ${entry.score} (st.${entry.stage})`,
      content: utf8ToB64(text + JSON.stringify(entry) + '\n'),
    };
    if (sha) body.sha = sha;
    const r = await fetch(fileUrl(env), {
      method: 'PUT',
      headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) return;
    if (r.status !== 409 && r.status !== 422) throw new Error('github put ' + r.status);
    await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
  }
  throw new Error('github put conflict');
}

function topN(text, n) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o && Number.isFinite(o.score)) rows.push(o); } catch { /* 壊れた行は無視 */ }
  }
  rows.sort((a, b) => b.score - a.score || b.stage - a.stage || String(a.date).localeCompare(String(b.date)));
  return rows.slice(0, n);
}

function sanitize(body) {
  const name = String(body.name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, MAX_NAME) || 'PILOT';
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
          const { text } = await ghGet(env);
          cached = { at: Date.now(), body: JSON.stringify({ top: topN(text, 20) }) };
        }
        return new Response(cached.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', ...h } });
      }
      if (req.method === 'POST' && url.pathname === '/submit') {
        if (!allowedOrigins(env).includes(origin)) return json({ error: 'origin' }, 403, h);
        const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
        const last = rl.get(ip) || 0;
        if (Date.now() - last < RL_MS) return json({ error: 'rate' }, 429, h);
        const body = await req.json().catch(() => null);
        const entry = body && sanitize(body);
        if (!entry) return json({ error: 'invalid' }, 400, h);
        rl.set(ip, Date.now());
        await ghAppend(env, entry);
        cached = null;
        return json({ ok: true }, 200, h);
      }
      return json({ error: 'not found' }, 404, h);
    } catch (e) {
      return json({ error: 'server' }, 502, h);
    }
  },
};
