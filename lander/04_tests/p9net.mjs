// P9: 二つ名（チャンピオン称号）。/title, /admin/title, names/top 同期, ログ, net.js クライアント。実行: node 04_tests/p9net.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

const net = await import(path.join(ROOT, '02_src/net.js'));
const W = (await import(path.join(ROOT, '06_server/ranking-worker.js'))).default;

const realNow = Date.now.bind(Date); let skew = 0;
Date.now = () => realNow() + skew;
const bust = () => { skew += 120_000; };

// ---- Fake GitHub ----
const AK = 'admin-' + 'q'.repeat(40);
const env = { GITHUB_TOKEN: 'SECRET_TOKEN_123', REPO: 'u/r', ALLOWED_ORIGINS: 'https://u.github.io' };
const envA = { ...env, ADMIN_KEY: AK };
const files = new Map();
const gh = { n: 0, conflicts: new Map(), puts: [] };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const pathOf = (url) => decodeURIComponent(new URL(url).pathname.replace(/^\/repos\/u\/r\/contents\//, ''));
const fakeGH = async (url, init = {}) => {
  const p = pathOf(url); const method = init.method || 'GET';
  const accept = (init.headers && init.headers.Accept) || '';
  if (method === 'GET') {
    const f = files.get(p);
    if (!f) return new Response('{}', { status: 404 });
    const size = Buffer.byteLength(f.text);
    if (accept === 'application/vnd.github.raw') return new Response(f.text, { status: 200 });
    return new Response(JSON.stringify({ type: 'file', sha: f.sha, size, encoding: 'base64', content: b64(f.text) }), { status: 200 });
  }
  if (method === 'PUT') {
    const body = JSON.parse(init.body); gh.puts.push(p);
    const left = gh.conflicts.get(p) || 0;
    if (left > 0) { gh.conflicts.set(p, left - 1); const f = files.get(p); if (f) f.sha = 's' + (++gh.n); return new Response('{}', { status: 409 }); }
    const f = files.get(p);
    if (f && body.sha !== f.sha) return new Response('{}', { status: 409 });
    if (!f && body.sha) return new Response('{}', { status: 422 });
    files.set(p, { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 's' + (++gh.n) });
    return new Response('{}', { status: 201 });
  }
};
globalThis.fetch = fakeGH;
let ipN = 0, leak = false; const allText = [];
const chk = async (r) => { const t = await r.clone().text(); allText.push(t); if (t.includes('SECRET') || t.includes('keyHash') || t.includes(AK)) leak = true; return r; };
const K = (n) => Buffer.from('k:' + n).toString('hex').padEnd(32, '0');
const post = async (body) => chk(await W.fetch(new Request('https://w/submit', { method: 'POST', headers: { Origin: 'https://u.github.io', 'CF-Connecting-IP': '9.9.9.' + (ipN++), 'Content-Type': 'application/json' }, body: JSON.stringify({ key: K(body.name), ...body }) }), env));
const rawPost = async (p, body, headers = {}, e = env, origin = 'https://u.github.io') => chk(await W.fetch(new Request('https://w' + p, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), e));
const title = (name, t, key = K(name)) => rawPost('/title', { name, key, title: t });
const atitle = (key, body, e = envA) => rawPost('/admin/title', body, key === undefined ? {} : { 'X-Admin-Key': key }, e);
const del = (name, key = K(name)) => rawPost('/delete', { name, key });
const getRank = async () => chk(await W.fetch(new Request('https://w/ranking', { headers: { Origin: 'https://u.github.io' } }), env));
const rankRows = async () => (await (await getRank()).json()).top;
const top = () => JSON.parse(files.get('top.json').text);
const names = () => JSON.parse(files.get('names.json').text);
const logLines = () => [...files].filter(([p]) => p.startsWith('log/')).flatMap(([, f]) => f.text.split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const reset = () => { files.clear(); gh.puts.length = 0; gh.conflicts.clear(); bust(); };
const jb = async (r) => r.json();

// ===== 1. champion set / clear =====
reset();
await post({ name: 'Ace', score: 3000, stage: 3 });
await post({ name: 'Bob', score: 1000, stage: 1 });
{
  let r = await title('Ace', '初代ランダーチャンピオン');
  let j = await jb(r);
  ok(r.status === 200 && j.ok === true && j.title === '初代ランダーチャンピオン', 'champ: set -> 200 {ok,title}');
  ok(names()['Ace'].title === '初代ランダーチャンピオン' && top()[0].title === '初代ランダーチャンピオン' && !('title' in top()[1]), 'champ: stored in names.json and top row only');
  ok(names()['Ace'].keys.length === 1 && names()['Ace'].first, 'champ: names entry keeps keys/first');
  let rows = await rankRows();
  ok(rows[0].name === 'Ace' && rows[0].title === '初代ランダーチャンピオン' && !('title' in rows[1]), 'ranking: row carries title, others unchanged');
  r = await title('Ace', '第二世代');
  ok(r.status === 200 && top()[0].title === '第二世代' && names()['Ace'].title === '第二世代', 'champ: change title');
  r = await title(' Ace ', '', K('Ace'));
  // (normalised-name path: key is per normalised name on the client; here the test key is passed explicitly)
  j = await jb(r);
  ok(r.status === 200 && j.ok && j.title === '' && !('title' in names()['Ace']) && !('title' in top()[0]), 'champ: empty string clears (trim-normalised name)');
  rows = await rankRows();
  ok(!('title' in rows[0]), 'ranking: cleared title absent');
}

// ===== 2. errors =====
{
  let r = await title('Bob', 'x');
  ok(r.status === 409 && (await jb(r)).error === 'not-champion' && !('title' in names()['Bob']), 'non-champion -> 409 not-champion, nothing stored');
  r = await title('Ace', 'x', K('Zzz'));
  ok(r.status === 403 && (await jb(r)).error === 'forbidden' && !('title' in names()['Ace']), 'wrong key -> 403 forbidden');
  r = await title('Bob', 'x', K('Ace'));
  ok(r.status === 403, 'wrong key checked before champion status (non-champion + wrong key -> 403)');
  r = await title('Nobody', 'x');
  ok(r.status === 404 && (await jb(r)).error === 'unknown', 'unregistered name -> 404 unknown');
  r = await rawPost('/title', { name: 'Ace', key: 'zz', title: 'x' });
  ok(r.status === 400 && (await jb(r)).error === 'invalid', 'malformed key -> 400 invalid');
  r = await rawPost('/title', { name: 'Ace', title: 'x' });
  ok(r.status === 400, 'missing key -> 400');
  r = await rawPost('/title', { name: 'Ace', key: K('Ace') });
  ok(r.status === 400, 'missing title -> 400');
  r = await rawPost('/title', { name: 'Ace', key: K('Ace'), title: 5 });
  ok(r.status === 400, 'non-string title -> 400');
  r = await rawPost('/title', { name: '', key: K('Ace'), title: 'x' });
  ok(r.status === 400, 'empty name -> 400');
  r = await rawPost('/title', 'not json');
  ok(r.status === 400, 'bad JSON -> 400');
  r = await rawPost('/title', { name: 'Ace', key: K('Ace'), title: 'x' }, {}, env, 'https://evil.example');
  ok(r.status === 403 && (await jb(r)).error === 'origin' && !('title' in names()['Ace']), 'foreign origin -> 403 origin');
  // 旧名（keyHash 無し）
  const n = names(); n['Old'] = { name: 'Old', first: '2026-01-01T00:00:00.000Z' };
  files.get('names.json').text = JSON.stringify(n) + '\n'; bust();
  r = await title('Old', 'x');
  ok(r.status === 403, 'legacy name without keyHash -> 403 forbidden');
  r = await W.fetch(new Request('https://w/title', { headers: { Origin: 'https://u.github.io' } }), env);
  ok(r.status === 404, 'GET /title -> 404 (POST only)');
}

// ===== 3. sanitising / 16 graphemes =====
reset();
await post({ name: 'Ace', score: 3000, stage: 3 });
{
  let j = await jb(await title('Ace', '  <b>勇者</b>‮​\u0007の王  '));
  ok(j.title === 'b勇者/bの王', 'sanitise: strips <>, bidi, zero-width, control; trims -> ' + j.title);
  j = await jb(await title('Ace', 'あ'.repeat(30)));
  ok(Array.from(j.title).length === 16, 'cap: 30 chars -> 16');
  j = await jb(await title('Ace', '👨‍👩‍👧‍👦'.repeat(20)));
  ok(Intl.Segmenter && Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(j.title)).length <= 16 && Array.from(j.title).length <= 64 && j.title.length > 0, 'cap: ZWJ family emoji, grapheme<=16 and codepoints<=64');
  j = await jb(await title('Ace', 'e' + '́'.repeat(200)));
  ok(Array.from(j.title).length <= 64, 'cap: combining-mark flood bounded');
  j = await jb(await title('Ace', 'ABCDEFGHIJKLMNOP'));
  ok(j.title === 'ABCDEFGHIJKLMNOP', 'cap: exactly 16 kept');
  const r = await title('Ace', '<>​  ');
  ok(r.status === 200 && (await jb(r)).title === '' && !('title' in top()[0]), 'sanitise: only-stripped title becomes empty = clear');
}

// ===== 4. survives dethroning; re-entry; ranking =====
reset();
await post({ name: 'Ace', score: 3000, stage: 3 });
await post({ name: 'Bob', score: 1000, stage: 1 });
await title('Ace', '初代ランダーチャンピオン');
{
  await post({ name: 'Bob', score: 9000, stage: 5 });
  ok(top()[0].name === 'Bob' && top()[1].name === 'Ace' && top()[1].title === '初代ランダーチャンピオン', 'dethrone: Ace keeps title in top row');
  ok(names()['Ace'].title === '初代ランダーチャンピオン' && !('title' in top()[0]), 'dethrone: names keeps title; new champ has none');
  let rows = await rankRows();
  ok(rows[1].title === '初代ランダーチャンピオン', 'dethrone: GET /ranking shows former champion title');
  let r = await title('Ace', 'x');
  ok(r.status === 409, 'dethroned: Ace can no longer change title');
  // Ace が自己ベスト更新（top行の置換）しても称号が残る
  await post({ name: 'Ace', score: 5000, stage: 4 });
  ok(top().find((x) => x.name === 'Ace').score === 5000 && top().find((x) => x.name === 'Ace').title === '初代ランダーチャンピオン', 'improve: replaced row keeps title');
  // Ace 再び1位
  await post({ name: 'Ace', score: 20000, stage: 5 });
  ok(top()[0].name === 'Ace' && top()[0].title === '初代ランダーチャンピオン', 'regain #1: title still attached');
  r = await title('Ace', '二代目');
  ok(r.status === 200 && top()[0].title === '二代目', 'regained champion can change title');
  // top.json から押し出された後に再突入：台帳から復元
  const seed = Array.from({ length: 100 }, (_, i) => ({ name: 'n' + i, score: 30000 + i, stage: 9, date: '2026-01-01T00:00:00.000Z' }));
  files.get('top.json').text = JSON.stringify(seed) + '\n';
  bust();
  ok(!(await rankRows()).some((x) => x.name === 'Ace'), 'evicted: Ace not on board');
  await post({ name: 'Ace', score: 31000, stage: 9 });
  const row = top().find((x) => x.name === 'Ace');
  ok(row && row.title === '二代目', 'evicted re-entry: title copied from names.json');
  // submit of a name with stale title in a row but cleared in names -> follows names
  const t = top(); t.find((x) => x.name === 'Ace').title = 'STALE'; files.get('top.json').text = JSON.stringify(t) + '\n';
  await post({ name: 'Ace', score: 10, stage: 1 });
  ok(top().find((x) => x.name === 'Ace').title === '二代目', 'submit re-syncs row title from names.json');
}

// ===== 5. delete removes title =====
reset();
await post({ name: 'Ace', score: 3000, stage: 3 });
await title('Ace', '初代');
{
  let r = await del('Ace');
  ok(r.status === 200 && !names()['Ace'] && top().length === 0, 'delete: name gone');
  await post({ name: 'Ace', score: 100, stage: 1, key: K('Ace') });
  ok(!('title' in names()['Ace']) && !('title' in top()[0]), 'delete: re-registered name has no title');
  await title('Ace', '二つ目');
  r = await atitle(AK, { name: 'Ace', title: 'admin-set' });
  r = await rawPost('/admin/delete', { name: 'Ace' }, { 'X-Admin-Key': AK }, envA);
  ok(r.status === 200 && !names()['Ace'] && !top().some((x) => x.name === 'Ace'), 'admin/delete removes name and title');
  await post({ name: 'Ace', score: 100, stage: 1 });
  ok(!('title' in names()['Ace']), 'admin/delete: no title resurrects');
}

// ===== 6. admin =====
reset();
await post({ name: 'Ace', score: 3000, stage: 3 });
await post({ name: 'Bob', score: 1000, stage: 1 });
{
  let r = await atitle(AK, { name: 'Bob', title: '期待の新人' });
  ok(r.status === 200 && (await jb(r)).title === '期待の新人' && top()[1].title === '期待の新人' && names()['Bob'].title === '期待の新人', 'admin: set title on non-champion');
  r = await atitle(AK, { name: 'Zzz', title: 'x' }); ok(r.status === 404, 'admin: unknown -> 404');
  r = await atitle(AK, { name: '', title: 'x' }); ok(r.status === 400, 'admin: empty name -> 400');
  r = await atitle(AK, { name: 'Bob' }); ok(r.status === 400, 'admin: missing title -> 400');
  r = await atitle(AK, { name: 'Bob', title: 'あ'.repeat(40) });
  ok(r.status === 200 && Array.from((await jb(r)).title).length === 16, 'admin: sanitised/capped');
  r = await W.fetch(new Request('https://w/admin/list', { headers: { Origin: 'https://u.github.io', 'X-Admin-Key': AK } }), envA);
  const j = await jb(await chk(r));
  ok(j.names.find((x) => x.name === 'Bob').title.length === 16 && !('title' in j.names.find((x) => x.name === 'Ace')), 'admin/list includes title when set');
  r = await atitle(AK, { name: 'Bob', title: '' });
  ok(r.status === 200 && !('title' in names()['Bob']) && !('title' in top()[1]), 'admin: clear');
  r = await atitle(undefined, { name: 'Bob', title: 'x' }); ok(r.status === 401 && !('title' in names()['Bob']), 'admin: missing key -> 401');
  const t1 = realNow(); r = await atitle('wrong', { name: 'Bob', title: 'x' });
  ok(r.status === 401 && realNow() - t1 >= 300 && !('title' in names()['Bob']), 'admin: wrong key -> 401 delayed');
  r = await atitle(AK, { name: 'Bob', title: 'x' }, env); ok(r.status === 503, 'admin: ADMIN_KEY unset -> 503');
  r = await W.fetch(new Request('https://w/admin/title', { method: 'GET', headers: { 'X-Admin-Key': AK } }), envA); ok(r.status === 404, 'admin/title GET -> 404');
}

// ===== 7. caches invalidated =====
reset();
await post({ name: 'Ace', score: 3000, stage: 3 });
{
  let rows = await rankRows(); ok(!('title' in rows[0]), 'cache: primed without title');
  await title('Ace', 'ＡＢ');
  rows = await rankRows(); ok(rows[0].title === 'ＡＢ', 'cache: /title invalidates ranking cache (no clock skew)');
  await atitle(AK, { name: 'Ace', title: '' });
  rows = await rankRows(); ok(!('title' in rows[0]), 'cache: /admin/title invalidates ranking cache');
}

// ===== 8. log lines =====
reset();
await post({ name: 'Ace', score: 3000, stage: 3 });
{
  await title('Ace', '初代');
  await atitle(AK, { name: 'Ace', title: '' });
  await title('Nobody', 'x'); await title('Ace', 'x', K('bad'));
  const L = logLines();
  const t = L.filter((x) => x.kind === 'title');
  ok(L.length === 3 && t.length === 2, 'log: 1 score + 2 title lines (rejections not logged)');
  ok(t[0].name === 'Ace' && t[0].title === '初代' && /^\d{4}-\d\d-\d\dT/.test(t[0].date) && t[1].title === '', 'log: title line fields {kind,name,title,date}');
  const s = L.find((x) => x.kind === undefined);
  ok(s && s.score === 3000 && s.stage === 3 && s.name === 'Ace' && !('title' in s) && !('kind' in s), 'log: score line format unchanged');
  ok(Object.keys(t[0]).sort().join() === 'date,kind,name,title', 'log: exact title-line keys');
}

// ===== 9. concurrency retry =====
reset();
await post({ name: 'Ace', score: 3000, stage: 3 });
{
  gh.conflicts.set('names.json', 2); gh.conflicts.set('top.json', 2);
  const r = await title('Ace', '競合テスト');
  ok(r.status === 200 && names()['Ace'].title === '競合テスト' && top()[0].title === '競合テスト', 'retry: names+top sha conflicts retried');
  gh.conflicts.set('names.json', 99);
  const r2 = await title('Ace', '失敗');
  ok(r2.status === 502 && names()['Ace'].title === '競合テスト', 'retry: persistent conflict -> 502, old title kept');
  gh.conflicts.clear();
  gh.conflicts.set('top.json', 99);
  const r3 = await atitle(AK, { name: 'Ace', title: 'x' });
  ok(r3.status === 502, 'retry: persistent top conflict -> 502');
  gh.conflicts.clear();
}

// ===== 10. leak =====
ok(!leak && !allText.join('').includes('SECRET') && !allText.join('').includes(AK) && !allText.join('').includes('keyHash'), 'leak: token / ADMIN_KEY / keyHash never in responses');

// ===== 11. net.js =====
globalThis.fetch = fakeGH;
{
  net.__setRelayUrl('https://x.invalid/');
  let seen = null;
  const reply = (status, body) => { globalThis.fetch = async (u, i) => { seen = { u, i }; return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }); }; };
  reply(200, { ok: true, title: 'T' });
  let r = await net.setTitle('Ace', 'kk', 'T');
  ok(r.ok === true && r.title === 'T' && seen.u === 'https://x.invalid/title' && seen.i.method === 'POST' && JSON.stringify(JSON.parse(seen.i.body)) === JSON.stringify({ name: 'Ace', key: 'kk', title: 'T', board: 'v1.0' }), 'client: setTitle ok + request shape');
  r = await net.adminSetTitle('AK', 'Ace', 'T2');
  ok(r.ok && r.title === 'T' && seen.u === 'https://x.invalid/admin/title' && seen.i.headers['X-Admin-Key'] === 'AK' && JSON.parse(seen.i.body).name === 'Ace' && !('key' in JSON.parse(seen.i.body)), 'client: adminSetTitle ok + header');
  reply(200, {}); r = await net.setTitle('Ace', 'k', ''); ok(r.ok && r.title === '', 'client: ok with no title in body falls back to sent value');
  const cases = [
    [403, { error: 'forbidden' }, 'forbidden'], [404, { error: 'unknown' }, 'unknown'], [409, { error: 'not-champion' }, 'not-champion'],
    [400, { error: 'invalid' }, 'invalid'], [404, { error: 'not found' }, 'unavailable'], [401, { error: 'unauthorized' }, 'unauthorized'],
    [503, { error: 'admin disabled' }, 'disabled'], [500, { error: 'x' }, 'status 500'], [502, '<html>', 'status 502'], [429, { error: 'rate' }, 'status 429'],
  ];
  for (const [st, body, want] of cases) {
    reply(st, body);
    const a = await net.setTitle('Ace', 'k', 'x'), b = await net.adminSetTitle('AK', 'Ace', 'x');
    ok(!a.ok && a.error === want && !b.ok && b.error === want, `client: ${st} ${JSON.stringify(body)} -> ${want} (got ${a.error}/${b.error})`);
  }
  globalThis.fetch = async () => { throw new Error('net down'); };
  let rs = await Promise.all([net.setTitle('a', 'k', 't'), net.adminSetTitle('K', 'a', 't')]);
  ok(rs.every((x) => x.ok === false && typeof x.error === 'string' && x.error.length > 0), 'client: offline -> {ok:false,error}');
  globalThis.fetch = () => new Promise(() => {});
  const t0 = realNow();
  rs = await Promise.race([Promise.all([net.setTitle('a', 'k', 't', 150), net.adminSetTitle('K', 'a', 't', 150)]), new Promise((res) => setTimeout(() => res('PENDING'), 2000))]);
  ok(rs !== 'PENDING' && rs.every((x) => !x.ok) && realNow() - t0 < 1000, 'client: headers hang -> timeout');
  globalThis.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
  rs = await Promise.race([Promise.all([net.setTitle('a', 'k', 't', 150), net.adminSetTitle('K', 'a', 't', 150)]), new Promise((res) => setTimeout(() => res('PENDING'), 2000))]);
  ok(rs !== 'PENDING' && rs.every((x) => !x.ok), 'client: body hang -> timeout');
  let called = 0; globalThis.fetch = async () => { called++; return new Response('{}'); };
  net.__setRelayUrl('');
  rs = await Promise.all([net.setTitle('a', 'k', 't'), net.adminSetTitle('K', 'a', 't')]);
  ok(rs.every((x) => !x.ok && x.error === 'disabled') && called === 0, 'client: RELAY_URL empty -> disabled, no network');
  globalThis.fetch = fakeGH;
  // fetchWorldTop passes rows with title through
  net.__setRelayUrl('https://x.invalid');
  globalThis.fetch = async () => new Response(JSON.stringify({ top: [{ name: 'A', score: 1, stage: 1, date: 'd', title: '初代' }] }), { status: 200 });
  const top1 = await net.fetchWorldTop();
  ok(Array.isArray(top1) && top1[0].title === '初代', 'client: fetchWorldTop keeps title field');
  net.__setRelayUrl('');
}

console.log(`p9net: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
