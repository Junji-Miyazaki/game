// P27: 追加ランキング（今週の得点・最高到達ステージ・EXPEDITION 最速タイム）の中継側。実行: node 04_tests/p27boards.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

const W = (await import(path.join(ROOT, '../lander/06_server/ranking-worker.js'))).default;

const realNow = Date.now.bind(Date); let skew = 0;
Date.now = () => realNow() + skew;
const bust = (ms = 120_000) => { skew += ms; };

const AK = 'admin-' + 'q'.repeat(40);
const O = 'https://u.github.io';
const env = { GITHUB_TOKEN: 'SECRET_TOKEN_123', REPO: 'u/r', ALLOWED_ORIGINS: O, ADMIN_KEY: AK };
const files = new Map();
const gh = { n: 0, puts: [] };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const pathOf = (url) => decodeURIComponent(new URL(url).pathname.replace(/^\/repos\/u\/r\/contents\//, ''));
globalThis.fetch = async (url, init = {}) => {
  const p = pathOf(url); const method = init.method || 'GET';
  const accept = (init.headers && init.headers.Accept) || '';
  if (method === 'GET') {
    const f = files.get(p);
    if (!f) return new Response('{}', { status: 404 });
    if (accept === 'application/vnd.github.raw') return new Response(f.text, { status: 200 });
    return new Response(JSON.stringify({ type: 'file', sha: f.sha, size: Buffer.byteLength(f.text), encoding: 'base64', content: b64(f.text) }), { status: 200 });
  }
  if (method === 'PUT') {
    const body = JSON.parse(init.body);
    const f = files.get(p);
    if (f && body.sha !== f.sha) return new Response('{}', { status: 409 });
    if (!f && body.sha) return new Response('{}', { status: 422 });
    files.set(p, { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 's' + (++gh.n) });
    gh.puts.push(p);
    return new Response('{}', { status: 201 });
  }
};
let ipN = 0;
const K = (n) => Buffer.from('k:' + n).toString('hex').padEnd(32, '0');
const post = (p, body, { ip, headers = {} } = {}) => W.fetch(new Request('https://w' + p, { method: 'POST', headers: { Origin: O, 'CF-Connecting-IP': ip || '9.9.' + Math.floor(ipN / 250) + '.' + (ipN++ % 250), 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }), env);
const get = async (p) => (await W.fetch(new Request('https://w' + p, { headers: { Origin: O } }), env));
const submit = (name, score, stage, board = 'v1.1', key = K(name)) => post('/submit', { name, score, stage, key, board });
const xp = (name, mission, time, key = K(name), ip) => post('/xp', { name, key, mission, time }, { ip });
const rows = (p) => (files.get(p) ? JSON.parse(files.get(p).text) : null);
const board = async (b) => { bust(); return (await get('/ranking?board=' + b)).json(); };

// 期待する週（日本時間の月曜 0:00 始まり）
const weekOf = (now) => { const j = new Date(now + 9 * 3600e3); const dow = (j.getUTCDay() + 6) % 7; const s = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() - dow) - 9 * 3600e3; return { start: s, id: new Date(s + 9 * 3600e3).toISOString().slice(0, 10) }; };

// ===== 1. 週の境界（純粋な計算の確認） =====
{
  // 2026-11-08(日) 23:59 JST = 14:59 UTC → 週は 11-02(月)。11-09(月) 00:00 JST = 11-08 15:00 UTC → 週は 11-09
  ok(weekOf(Date.UTC(2026, 10, 8, 14, 59)).id === '2026-11-02', 'week: Sunday 23:59 JST belongs to the previous Monday');
  ok(weekOf(Date.UTC(2026, 10, 8, 15, 0)).id === '2026-11-09', 'week: Monday 00:00 JST starts a new week');
}

// ===== 2. 今週・到達は v1.1 の送信で更新、v1.0 では更新しない =====
{
  const wk = weekOf(Date.now()).id, wp = 'week/v1.1/' + wk + '.json';
  let r = await submit('Ann', 1200, 3); ok(r.status === 200, 'submit v1.1 ok');
  ok(rows(wp) && rows(wp)[0].name === 'Ann' && rows(wp)[0].score === 1200, 'week board gets the score');
  ok(rows('reach-v1.1.json') && rows('reach-v1.1.json')[0].stage === 3, 'reach board gets the stage');
  r = await submit('Old', 9000, 9, 'v1.0'); ok(r.status === 200, 'submit v1.0 ok');
  ok(!rows(wp).some((x) => x.name === 'Old') && !rows('reach-v1.1.json').some((x) => x.name === 'Old'), 'v1.0 does not touch week / reach');
  // 低い得点・浅いステージでは書き換えない
  gh.puts.length = 0;
  await submit('Ann', 800, 2);
  ok(rows(wp).find((x) => x.name === 'Ann').score === 1200, 'week keeps the best score');
  ok(rows('reach-v1.1.json').find((x) => x.name === 'Ann').stage === 3, 'reach keeps the deepest stage');
  ok(!gh.puts.includes(wp) && !gh.puts.includes('reach-v1.1.json'), 'no GitHub write when not improved');
  await submit('Ann', 700, 5);
  ok(rows('reach-v1.1.json').find((x) => x.name === 'Ann').stage === 5 && rows(wp).find((x) => x.name === 'Ann').score === 1200, 'deeper stage with lower score: reach updates, week keeps best');
  await submit('Bob', 3000, 4); await submit('Cat', 500, 7);
  const w = await board('v1.1-week');
  ok(w.board === 'v1.1-week' && w.week === wk && w.resetAt === weekOf(Date.now()).start + 7 * 24 * 3600e3, 'GET week: board, week id, resetAt');
  ok(w.top.map((x) => x.name).join() === 'Bob,Ann,Cat', 'GET week: sorted by score');
  ok(!('last' in w), 'GET week: no last week yet');
  const rc = await board('v1.1-reach');
  ok(rc.top.map((x) => x.name + x.stage).join() === 'Cat7,Ann5,Bob4', 'GET reach: sorted by stage');
  // 0 点は今週に入れない
  await submit('Zero', 0, 1);
  ok(!rows(wp).some((x) => x.name === 'Zero'), 'zero score not on week board');
}

// ===== 3. 週が変わると新しいボード、先週の1位が last に出る =====
{
  const before = weekOf(Date.now());
  skew += before.start + 7 * 24 * 3600e3 - Date.now() + 60_000;   // 次の月曜 0:01 JST へ
  const now = weekOf(Date.now());
  ok(now.id !== before.id, 'clock moved to next week');
  let w = await board('v1.1-week');
  ok(w.week === now.id && w.top.length === 0 && w.last && w.last.name === 'Bob' && w.last.score === 3000, 'new week: empty board, last week champion shown');
  await submit('Dan', 100, 1);
  w = await board('v1.1-week');
  ok(w.top.length === 1 && w.top[0].name === 'Dan', 'new week collects new scores');
  ok(rows('week/v1.1/' + before.id + '.json').length === 3, 'previous week file kept');
}

// ===== 4. EXPEDITION 最速タイム =====
{
  let r = await xp('Ann', 'ryugu', 42.37); let j = await r.json();
  ok(r.status === 200 && j.ok && j.best === true, 'xp: first time accepted');
  ok(rows('xp/ryugu.json')[0].time === 42.4, 'xp: time rounded to 0.1 s');
  r = await xp('Ann', 'ryugu', 50); j = await r.json();
  ok(r.status === 200 && j.best === false && rows('xp/ryugu.json')[0].time === 42.4, 'xp: slower time does not replace');
  r = await xp('Ann', 'ryugu', 30); ok(rows('xp/ryugu.json')[0].time === 30, 'xp: faster time replaces');
  await xp('Bob', 'ryugu', 25); await xp('Cat', 'ryugu', 61);
  let b = await board('xp-ryugu');
  ok(b.board === 'xp-ryugu' && b.mission === 'ryugu' && b.top.map((x) => x.name).join() === 'Bob,Ann,Cat', 'GET xp: sorted fastest first');
  ok((await xp('Ann', 'mars', 30)).status === 400, 'xp: unknown mission -> 400');
  ok((await xp('Ann', 'ryugu', 2)).status === 400, 'xp: too fast -> 400');
  ok((await xp('Ann', 'ryugu', 5000)).status === 400, 'xp: too slow -> 400');
  ok((await xp('Ann', 'ryugu', 'abc')).status === 400, 'xp: not a number -> 400');
  ok((await post('/xp', { name: 'Ann', mission: 'ryugu', time: 30 })).status === 400, 'xp: no key -> 400');
  ok((await xp('Ann', 'ryugu', 20, K('stranger'))).status === 403, 'xp: someone else\'s name -> 403');
  ok(rows('xp/ryugu.json').find((x) => x.name === 'Ann').time === 30, 'xp: stranger did not change the record');
  // 新しい名前は台帳に登録される
  r = await xp('Eve', '67p', 88); ok(r.status === 200 && JSON.parse(files.get('names.json').text).Eve, 'xp: new name registered in ledger');
  // 同じ IP の連続送信
  r = await xp('Ann', 'phobos', 40, K('Ann'), '1.2.3.4'); ok(r.status === 200, 'xp: first from IP ok');
  r = await xp('Ann', 'phobos', 39, K('Ann'), '1.2.3.4'); ok(r.status === 429, 'xp: second within 5 s -> 429');
  // スコア送信の制限とは別枠
  r = await post('/submit', { name: 'Ann', score: 1300, stage: 3, key: K('Ann'), board: 'v1.1' }, { ip: '1.2.3.4' }); ok(r.status === 200, 'xp rate limit separate from score submit');
  const logs = Array.from(files).filter(([p]) => p.startsWith('log/v1.1/')).flatMap(([, f]) => f.text.split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  ok(logs.some((x) => x.kind === 'xp' && x.mission === 'ryugu' && x.name === 'Bob' && x.time === 25), 'xp: logged with kind xp');
  const origin = await W.fetch(new Request('https://w/xp', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ann', key: K('Ann'), mission: 'ryugu', time: 10 }) }), env);
  ok(origin.status === 403, 'xp: wrong origin -> 403');
  ok((await (await get('/ranking?board=xp-mars')).status) === 400, 'GET unknown xp board -> 400');
}

// ===== 5. 二つ名は返す時に台帳から付く =====
{
  const nm = JSON.parse(files.get('names.json').text); nm.Bob.title = 'ACE'; files.set('names.json', { text: JSON.stringify(nm), sha: 's' + (++gh.n) });
  const b = await board('xp-ryugu');
  ok(b.top.find((x) => x.name === 'Bob').title === 'ACE' && !b.top.find((x) => x.name === 'Ann').title, 'titles attached from ledger');
  ok(!rows('xp/ryugu.json').some((x) => 'title' in x), 'titles not stored in board files');
}

// ===== 6. 名前を消すと追加ランキングからも消える =====
{
  await submit('Ann', 5000, 6);
  const wp = 'week/v1.1/' + weekOf(Date.now()).id + '.json';
  ok(rows(wp).some((x) => x.name === 'Ann'), 'precondition: Ann on week');
  let r = await post('/delete', { name: 'Ann', key: K('Ann') });
  ok(r.status === 200, 'delete ok');
  ok(!rows(wp).some((x) => x.name === 'Ann') && !rows('reach-v1.1.json').some((x) => x.name === 'Ann') && !rows('xp/ryugu.json').some((x) => x.name === 'Ann') && !rows('xp/phobos.json').some((x) => x.name === 'Ann'), 'delete removes from week, reach and xp boards');
  ok(rows('xp/ryugu.json').some((x) => x.name === 'Bob'), 'others kept');
  r = await post('/admin/delete', { name: 'Bob' }, { headers: { 'X-Admin-Key': AK } });
  ok(r.status === 200 && !rows('xp/ryugu.json').some((x) => x.name === 'Bob') && !rows('reach-v1.1.json').some((x) => x.name === 'Bob'), 'admin delete removes from extras too');
}

// ===== 7. 既存の GET /ranking は変わらない =====
{
  const r = await board('v1.1');
  ok(r.board === 'v1.1' && Array.isArray(r.top) && !('week' in r), 'plain v1.1 board unchanged');
  ok((await (await get('/ranking?board=v9')).status) === 400, 'unknown board still 400');
}

console.log(`p27boards: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
