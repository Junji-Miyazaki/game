// P4: 名前ごとのベスト / 名前台帳+所有キー / GET /name / delete / admin / net クライアント。実行: node 04_tests/p4net.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

const net = await import(path.join(ROOT, '02_src/net.js'));
const W = (await import(path.join(ROOT, '06_server/ranking-worker.js'))).default;

// ---- 時計のオフセット（Worker のメモリキャッシュ TTL を飛ばす）----
const realNow = Date.now.bind(Date); let skew = 0;
Date.now = () => realNow() + skew;
const bust = () => { skew += 120_000; };

// ===== 1. normName parity =====
{
  // ワーカーの normName は非公開なので、/name の判定がクライアントの normName と一致することで間接検証し、
  // さらにソースから関数本体を抜き出して直接比較する
  const src = (await import('node:fs')).readFileSync(path.join(ROOT, '06_server/ranking-worker.js'), 'utf8');
  const m = src.match(/const normName = (\(s\) => [^\n]+);/);
  const wn = m ? eval(m[1]) : null;
  ok(typeof wn === 'function', 'norm: worker normName found');
  const cases = ['ABC', 'abc', 'ＡＢＣ', 'Ａｂｃ', ' a  b ', 'a\tb', 'a　b', 'みや', 'ﾐﾔ', 'ミヤ', 'ｶﾞｰﾄﾞ', 'ガード', '①②', 'ＫＧ', '㎏', 'Straße', 'İ', '😀😀', 'é', 'é', '', '  '];
  for (const c of cases) ok(net.normName(c) === wn(c), 'norm parity: ' + JSON.stringify(c));
  ok(net.normName(' a  b ') === 'a  b' && net.normName('ＡＢＣ') === 'ＡＢＣ' && net.normName('ABC') === 'ABC', 'norm: trim only (no folding, no case change, inner spaces kept)');
  ok(net.normName('ABC') !== net.normName('abc') && net.normName('ABC') !== net.normName('ＡＢＣ') && net.normName('ミヤ') !== net.normName('ﾐﾔ'), 'norm: case / width / kana are different names');
  ok(net.normName(null) === 'null' || typeof net.normName(null) === 'string', 'norm: non-string safe');
}

// ===== Fake GitHub =====
const env = { GITHUB_TOKEN: 'SECRET_TOKEN_123', REPO: 'u/r', ALLOWED_ORIGINS: 'https://u.github.io' };
const files = new Map();
const gh = { n: 0, conflicts: new Map(), puts: [] };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const pathOf = (url) => decodeURIComponent(new URL(url).pathname.replace(/^\/repos\/u\/r\/contents\//, ''));
globalThis.fetch = async (url, init = {}) => {
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
let ipN = 0, leak = false;
const chk = async (r) => { const t = await r.clone().text(); if (t.includes('SECRET')) leak = true; return r; };
const K = (n) => Buffer.from('k:' + n).toString('hex').padEnd(32, '0');   // 名前ごとの決定的テストキー
const post = async (body, origin = 'https://u.github.io') => chk(await W.fetch(new Request('https://w/submit', { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': '3.3.3.' + (ipN++), 'Content-Type': 'application/json' }, body: JSON.stringify({ key: K(body.name), ...body }) }), env));
const rawPost = async (p, body, headers = {}, e = env) => chk(await W.fetch(new Request('https://w' + p, { method: 'POST', headers: { Origin: 'https://u.github.io', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }), e));
const del = (name, key) => rawPost('/delete', { name, key });
const getName = async (n, origin = 'https://u.github.io') => chk(await W.fetch(new Request('https://w/name' + (n === undefined ? '' : '?n=' + encodeURIComponent(n)), { headers: { Origin: origin } }), env));
const getRank = async () => chk(await W.fetch(new Request('https://w/ranking', { headers: { Origin: 'https://u.github.io' } }), env));
const top = () => JSON.parse(files.get('top.json').text);
const names = () => JSON.parse(files.get('names.json').text);
const taken = async (n) => (await (await getName(n)).json()).taken;
const reset = () => { files.clear(); gh.puts.length = 0; gh.conflicts.clear(); bust(); };
const sleepless = () => {};   // backoff は実時間 300ms 単位。テストでは許容

// ===== 3. backfill from top.json (既存の 'みや' 1行) =====
reset();
files.set('top.json', { text: JSON.stringify([{ name: 'みや', score: 5000, stage: 3, date: '2026-10-01T00:00:00.000Z' }]) + '\n', sha: 'sT' });
{
  let r = await getName('みや');
  ok(r.status === 200 && (await r.json()).taken === true, 'backfill: みや taken before names.json exists');
  ok(files.has('names.json') && names()['みや'] && names()['みや'].first === '2026-10-01T00:00:00.000Z', 'backfill: names.json created from top.json on first access');
  ok(await taken('ＭＩＹＡ') === false, 'backfill: unrelated name not taken');
  ok(await taken('みや ') === true, 'backfill: normalised lookup (trailing space)');
}
// backfill on submit path (names.json missing, no prior GET)
reset();
files.set('top.json', { text: JSON.stringify([{ name: 'みや', score: 5000, stage: 3, date: '2026-10-01T00:00:00.000Z' }]) + '\n', sha: 'sT' });
{
  const r = await post({ name: 'Neo', score: 100, stage: 1 });
  ok(r.status === 200 && names()['みや'] && names()['Neo'].name === 'Neo', 'backfill: submit with missing names.json keeps みや and adds neo');
}

// ===== 2/3. best-per-name merge + names.json =====
reset();
{
  let r = await post({ name: 'Ace', score: 1000, stage: 2 });
  ok(r.status === 200 && top().length === 1 && names()['Ace'].name === 'Ace' && /^\d{4}-/.test(names()['Ace'].first), 'merge: first submit inserts row + registers name');
  const firstDate = names()['Ace'].first;
  const putsBefore = gh.puts.filter((p) => p === 'names.json').length;
  await post({ name: ' Ace ', score: 500, stage: 1 });
  ok(top().length === 1 && top()[0].score === 1000 && top()[0].name === 'Ace', 'merge: lower score from same normName (trim) ignored');
  ok(gh.puts.filter((p) => p === 'names.json').length === putsBefore, 'names: not rewritten when name already present');
  ok(names()['Ace'].first === firstDate, 'names: first date preserved');
  await post({ name: 'Ace', score: 2000, stage: 2 });
  ok(top().length === 1 && top()[0].score === 2000 && top()[0].name === 'Ace', 'merge: higher score replaces, display name of stored row kept');
  await post({ name: 'Ace', score: 2000, stage: 3 });
  ok(top()[0].stage === 3 && top()[0].name === 'Ace', 'merge: tie score -> higher stage wins');
  const d = top()[0].date;
  await post({ name: 'Ace', score: 2000, stage: 3 });
  ok(top()[0].date === d, 'merge: full tie keeps earlier date');
  ok(Object.keys(names()).length === 1, 'names: one entry for the variants');
  await post({ name: 'ace', score: 1, stage: 1 }); await post({ name: 'ＡＣＥ', score: 1, stage: 1 });
  ok(Object.keys(names()).length === 3 && top().length === 3, 'case / full-width variants are separate names and rows');
  files.delete('top.json'); files.delete('names.json'); await post({ name: 'Ace', score: 1000, stage: 2 });
  await post({ name: 'Bob', score: 3000, stage: 2 });
  await post({ name: 'Cy', score: 3000, stage: 4 });
  ok(top().map((x) => x.name).join() === 'Cy,Bob,Ace', 'merge: ordering score desc, stage desc');
  await post({ name: 'Dee', score: 3000, stage: 4 });
  ok(top().map((x) => x.name).join() === 'Cy,Dee,Bob,Ace', 'merge: ordering ties -> earlier date first');
}

// migration: duplicate rows already in top.json
reset();
files.set('top.json', { text: JSON.stringify([
  { name: 'Dup', score: 900, stage: 2, date: '2026-01-01T00:00:00.000Z' },
  { name: 'Dup ', score: 1500, stage: 2, date: '2026-01-02T00:00:00.000Z' },
  { name: ' Dup', score: 100, stage: 1, date: '2026-01-03T00:00:00.000Z' },
  { name: 'dup', score: 50, stage: 1, date: '2026-01-03T00:00:00.000Z' },
  { name: 'Solo', score: 800, stage: 1, date: '2026-01-04T00:00:00.000Z' },
]) + '\n', sha: 'sT' });
{
  await post({ name: 'Zed', score: 10, stage: 1 });
  const t = top();
  ok(t.length === 4 && t.filter((x) => x.name.trim() === 'Dup').length === 1, 'migrate: whitespace duplicates deduped on first write (case variant stays separate)');
  ok(t[0].name === 'Dup ' && t[0].score === 1500, 'migrate: best row of duplicates kept with its own display name');
}

// cap 100
reset();
{
  const seed = Array.from({ length: 100 }, (_, i) => ({ name: 'n' + i, score: 1000 + i, stage: 1, date: '2026-01-01T00:00:00.000Z' }));
  files.set('top.json', { text: JSON.stringify(seed) + '\n', sha: 'sT' });
  await post({ name: 'low', score: 1, stage: 1 });
  ok(top().length === 100 && !top().some((x) => x.name === 'low'), 'cap: 100 rows, lowest new entry dropped');
  await post({ name: 'high', score: 7000, stage: 1 });
  ok(top().length === 100 && top()[0].name === 'high' && !top().some((x) => x.name === 'n0'), 'cap: new high enters, lowest dropped');
  await post({ name: 'n5', score: 5000, stage: 1 });
  ok(top().length === 100 && top().filter((x) => x.name === 'n5').length === 1 && top().find((x) => x.name === 'n5').score === 5000, 'cap: existing name improves in place (no duplicate)');
}

// ===== GET /name =====
reset();
{
  await post({ name: 'Ken', score: 10, stage: 1 });
  let r = await getName('Ken'); let j = await r.json();
  ok(r.status === 200 && j.taken === true && j.hasPin === false && Object.keys(j).length === 2, 'name: taken');
  ok(await taken('nobody') === false, 'name: not taken');
  for (const bad of [undefined, '', '   ', '<>', '​‮']) {
    const rr = await getName(bad); ok(rr.status === 400, 'name: 400 on empty-after-sanitise ' + JSON.stringify(bad));
  }
  ok(await taken('ken') === false && await taken('Ｋen') === false, 'name: case / width variants are not taken');
  ok(await taken('<Ken>') === true, 'name: sanitised like submit (<> stripped)');
  ok(await taken('K' + 'e\u200b' + 'n') === true, 'name: zero-width stripped');
  ok(await taken('Ken' + 'x'.repeat(40)) === false, 'name: truncated to 12 graphemes then compared');
  // CORS
  r = await getName('Ken', 'https://u.github.io');
  ok(r.headers.get('Access-Control-Allow-Origin') === 'https://u.github.io' && r.headers.get('Vary') === 'Origin', 'cors: /name allowed origin');
  r = await getName('Ken', 'https://evil.example');
  ok(r.headers.get('Access-Control-Allow-Origin') === 'https://u.github.io', 'cors: /name foreign origin gets allowed origin only');
  r = await chk(await W.fetch(new Request('https://w/name?n=x', { method: 'OPTIONS', headers: { Origin: 'https://u.github.io' } }), env));
  ok(r.status === 204, 'cors: OPTIONS /name');
  r = await chk(await W.fetch(new Request('https://w/name?n=x', { method: 'POST', headers: { Origin: 'https://u.github.io' } }), env));
  ok(r.status === 404, 'name: POST /name not routed');
  // cache invalidated by submit
  ok(await taken('Fresh') === false, 'cache: before');
  await post({ name: 'Fresh', score: 5, stage: 1 });
  ok(await taken('Fresh') === true, 'cache: invalidated on submit (no clock jump)');
  // short-TTL cache: second call within TTL does not read GitHub
  let gets = 0; const real = globalThis.fetch;
  globalThis.fetch = async (u, i) => { if ((i && i.method) !== 'PUT') gets++; return real(u, i); };
  await taken('a'); const g1 = gets; await taken('b'); await taken('c');
  ok(gets === g1, 'cache: repeated /name within TTL makes no GitHub reads');
  globalThis.fetch = real;
  // GitHub down -> 502, generic body
  const real2 = globalThis.fetch; bust();
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  r = await getName('zzz'); const tx = await r.text();
  ok(r.status === 502 && !tx.includes('SECRET') && !tx.includes('github'), 'name: GitHub failure -> 502 generic');
  globalThis.fetch = real2;
}

// ===== concurrency retry on names.json =====
reset();
{
  await post({ name: 'Seed', score: 1, stage: 1 });
  gh.conflicts.set('names.json', 2);
  let r = await post({ name: 'Racer', score: 50, stage: 1 });
  ok(r.status === 200 && names()['Racer'] && names()['Seed'], 'conc: names.json sha conflicts retried (2x) -> 200, both names present');
  gh.conflicts.set('names.json', 99);
  r = await post({ name: 'Doomed', score: 50, stage: 1 });
  ok(r.status === 502, 'conc: persistent names.json conflict -> 502');
  gh.conflicts.clear();
  const [a, b] = await Promise.all([post({ name: 'P1', score: 60, stage: 1 }), post({ name: 'P2', score: 61, stage: 1 })]);
  ok(a.status === 200 && b.status === 200 && names()['P1'] && names()['P2'], 'conc: parallel submits both registered');
  ok(top().some((x) => x.name === 'P1') && top().some((x) => x.name === 'P2'), 'conc: parallel submits both in top');
}
// __proto__ as a name must not poison the registry
reset();
{
  await post({ name: '__proto__', score: 5, stage: 1 });
  ok(await taken('__proto__') === true && await taken('constructor') === false, 'names: __proto__ handled as an ordinary key');
}

// ===== 所有キー / delete / admin =====
const sha = async (x) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x))), (b) => b.toString(16).padStart(2, '0')).join('');
const everything = [];
const track = async (r) => { everything.push(await r.clone().text()); return r; };
const logText = () => files.get(`log/${new Date().toISOString().slice(0, 7)}.jsonl`).text;
reset();
files.set('top.json', { text: JSON.stringify([{ name: 'みや', score: 5000, stage: 3, date: '2026-10-01T00:00:00.000Z' }]) + '\n', sha: 'sT' });
{
  const kA = 'a1'.repeat(16), kB = 'b2'.repeat(16);
  ok(await taken('みや') === true && !names()['みや'].keyHash, 'own: legacy name taken, no keyHash');
  let r = await track(await post({ name: 'みや', score: 6000, stage: 4, key: kA }));
  ok(r.status === 200 && names()['みや'].keys[0] === await sha(kA) && top()[0].score === 6000, 'own: first keyed submit claims legacy name');
  ok(!JSON.stringify(names()).includes(kA), 'own: raw key never stored, only SHA-256');
  r = await track(await post({ name: 'みや', score: 7000, stage: 4, key: kB }));
  ok(r.status === 403 && (await r.json()).error === 'name-taken' && top()[0].score === 6000, 'own: different key -> 403 name-taken, board unchanged');
  const n0 = (logText().match(/\n/g) || []).length;
  await post({ name: 'みや', score: 7001, stage: 4, key: kB });
  ok((logText().match(/\n/g) || []).length === n0, 'own: rejected submit is not logged');
  r = await track(await post({ name: 'みや', score: 6500, stage: 4, key: kA }));
  ok(r.status === 200 && top()[0].score === 6500, 'own: matching key accepted');
  r = await track(await rawPost('/submit', { name: 'NoKey2', score: 5, stage: 1 }, { 'CF-Connecting-IP': '8.8.8.1' })); ok(r.status === 400, 'own: missing key -> 400');
  r = await track(await rawPost('/submit', { name: 'BadKey', score: 5, stage: 1, key: 'short' }, { 'CF-Connecting-IP': '8.8.8.2' })); ok(r.status === 400, 'own: malformed key -> 400');
  await post({ name: 'Vic', score: 100, stage: 1, key: kA });
  r = await track(await del('Vic', kB)); ok(r.status === 403 && names()['Vic'] && top().some((x) => x.name === 'Vic'), 'delete: wrong key -> 403, nothing removed');
  r = await track(await del('Nope', kA)); ok(r.status === 404, 'delete: unknown name -> 404');
  r = await track(await del('Vic', 'short')); ok(r.status === 400, 'delete: malformed key -> 400');
  r = await track(await del('', kA)); ok(r.status === 400, 'delete: empty name -> 400');
  r = await track(await del('Vic', kA));
  ok(r.status === 200 && (await r.json()).ok === true && !names()['Vic'] && !top().some((x) => x.name === 'Vic'), 'delete: right key removes names.json entry and top.json row');
  ok(logText().includes('"Vic"'), 'delete: monthly log keeps the audit line');
  ok(await taken('Vic') === false, 'delete: name is free again (cache invalidated)');
  r = await track(await post({ name: 'Vic', score: 50, stage: 1, key: kB })); ok(r.status === 200 && names()['Vic'].keys[0] === await sha(kB), 'delete: freed name can be registered by someone else');
  r = await track(await W.fetch(new Request('https://w/delete', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Vic', key: kB }) }), env));
  ok(r.status === 403 && names()['Vic'], 'delete: foreign origin refused');
  files.set('names.json', { text: JSON.stringify({ ...names(), Old: { name: 'Old', first: '2026-01-01T00:00:00.000Z' } }) + '\n', sha: 'sN' }); bust();
  r = await track(await del('Old', kA)); ok(r.status === 403, 'delete: legacy keyless name cannot be deleted by players');
}

reset();
{
  const AK = 'admin-' + 'z'.repeat(40);
  const envA = { ...env, ADMIN_KEY: AK };
  const aget = async (key, e = envA, origin = 'https://u.github.io') => track(await W.fetch(new Request('https://w/admin/list', { headers: { Origin: origin, ...(key === undefined ? {} : { 'X-Admin-Key': key }) } }), e));
  const apost = async (key, body, e = envA) => track(await W.fetch(new Request('https://w/admin/delete', { method: 'POST', headers: { Origin: 'https://u.github.io', 'Content-Type': 'application/json', ...(key === undefined ? {} : { 'X-Admin-Key': key }) }, body: JSON.stringify(body) }), e));
  await post({ name: 'Ann', score: 900, stage: 2 });
  await post({ name: 'Bea', score: 800, stage: 1 });
  files.set('names.json', { text: JSON.stringify({ ...names(), Ghost: { name: 'Ghost', keyHash: 'x'.repeat(64), first: '2026-01-01T00:00:00.000Z' } }) + '\n', sha: 'sG' });
  let r = await aget(undefined, env); ok(r.status === 503, 'admin: ADMIN_KEY unset -> 503');
  r = await apost('whatever', { name: 'Ann' }, env); ok(r.status === 503 && names()['Ann'], 'admin: delete with ADMIN_KEY unset -> 503, nothing removed');
  r = await aget(undefined); ok(r.status === 401, 'admin: missing header -> 401');
  const t1 = realNow(); r = await aget('wrong'); ok(r.status === 401 && realNow() - t1 >= 300, 'admin: wrong key -> 401 after a delay');
  r = await apost('wrong', { name: 'Ann' }); ok(r.status === 401 && names()['Ann'], 'admin: delete wrong key -> 401, nothing removed');
  r = await aget(AK); let j = await r.json();
  ok(r.status === 200 && j.names.length === 3, 'admin: list all names');
  const ann = j.names.find((x) => x.name === 'Ann'), gh0 = j.names.find((x) => x.name === 'Ghost');
  ok(ann.best.score === 900 && ann.best.stage === 2 && /^\d{4}/.test(ann.first) && gh0.best === null, 'admin: list joins bests (null when none)');
  ok(!JSON.stringify(j).includes('keyHash') && !JSON.stringify(j).includes('x'.repeat(64)), 'admin: list exposes no keyHash');
  r = await apost(AK, { name: 'Zzz' }); ok(r.status === 404, 'admin: delete unknown -> 404');
  r = await apost(AK, { name: '' }); ok(r.status === 400, 'admin: delete empty -> 400');
  r = await apost(AK, { name: 'Ann' });
  ok(r.status === 200 && !names()['Ann'] && !top().some((x) => x.name === 'Ann') && top().some((x) => x.name === 'Bea'), 'admin: delete removes names.json + top.json row only for that name');
  r = await apost(AK, { name: 'Ghost' }); ok(r.status === 200 && !names()['Ghost'], 'admin: can delete a name with no board row');
  r = await track(await W.fetch(new Request('https://w/admin/list', { method: 'OPTIONS', headers: { Origin: 'https://u.github.io', 'Access-Control-Request-Headers': 'x-admin-key' } }), envA));
  ok(r.status === 204 && /X-Admin-Key/i.test(r.headers.get('Access-Control-Allow-Headers')) && /POST/.test(r.headers.get('Access-Control-Allow-Methods')), 'admin: CORS preflight allows X-Admin-Key and POST');
  r = await aget(AK, envA, 'https://evil.example'); ok(r.headers.get('Access-Control-Allow-Origin') === 'https://u.github.io', 'admin: CORS foreign origin not echoed');
  const all = everything.join('\n');
  ok(!all.includes(AK) && !all.includes('SECRET') && !all.includes('keyHash'), 'leak: ADMIN_KEY / token / keyHash never in any response');
}

// ===== net.js: key / delete / admin クライアント =====
{
  const k1 = net.makeNameKey(), k2 = net.makeNameKey();
  ok(/^[0-9a-f]{64}$/.test(k1) && k1 !== k2, 'client: makeNameKey is 256-bit hex and random');
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  ok(net.makeNameKey() === '', 'client: makeNameKey without crypto -> empty, no throw');
  Object.defineProperty(globalThis, 'crypto', saved);
  net.__setRelayUrl('https://x.invalid/');
  let seen;
  globalThis.fetch = async (u, i) => { seen = { u, i }; return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  await net.submitScore({ name: 'a', score: 1, stage: 1, key: 'kk' });
  ok(JSON.parse(seen.i.body).key === 'kk', 'client: submitScore sends key');
  let r = await net.deleteName('a', 'kk'); ok(r.ok && seen.u === 'https://x.invalid/delete' && seen.i.method === 'POST' && JSON.parse(seen.i.body).name === 'a', 'client: deleteName ok');
  globalThis.fetch = async (u, i) => { seen = { u, i }; return { ok: true, status: 200, json: async () => ({ names: [{ name: 'a', first: 'x', best: null }] }) }; };
  r = await net.adminList('AK'); ok(r.ok && r.names.length === 1 && seen.i.headers['X-Admin-Key'] === 'AK' && seen.u === 'https://x.invalid/admin/list', 'client: adminList ok + header');
  globalThis.fetch = async (u, i) => { seen = { u, i }; return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  r = await net.adminDelete('AK', 'a'); ok(r.ok && seen.i.headers['X-Admin-Key'] === 'AK' && JSON.parse(seen.i.body).name === 'a', 'client: adminDelete ok');
  for (const [st, err] of [[403, 'forbidden'], [404, 'unknown'], [401, 'unauthorized'], [503, 'disabled']]) {
    globalThis.fetch = async () => ({ ok: false, status: st, json: async () => ({}) });
    const a = await net.deleteName('a', 'k'), b = await net.adminList('k'), c = await net.adminDelete('k', 'a');
    ok(!a.ok && !b.ok && !c.ok && a.error === err && b.error === err && c.error === err, 'client: HTTP ' + st + ' -> {ok:false,error:' + err + '}');
  }
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ names: 5 }) });
  r = await net.adminList('k'); ok(!r.ok, 'client: adminList bad shape -> ok:false');
  globalThis.fetch = async () => { throw new Error('net'); };
  const rs = await Promise.all([net.deleteName('a', 'k'), net.adminList('k'), net.adminDelete('k', 'a')]);
  ok(rs.every((x) => x.ok === false && typeof x.error === 'string'), 'client: offline -> {ok:false,error} for all');
  globalThis.fetch = () => new Promise(() => {});
  const t0 = realNow();
  const rt = await Promise.race([Promise.all([net.deleteName('a', 'k', 150), net.adminList('k', 150), net.adminDelete('k', 'a', 150)]), new Promise((res) => setTimeout(() => res('PENDING'), 2000))]);
  ok(rt !== 'PENDING' && rt.every((x) => !x.ok) && realNow() - t0 < 1000, 'client: delete/admin time out');
  net.__setRelayUrl('');
  let calls = 0; globalThis.fetch = async () => { calls++; return {}; };
  const rd = await Promise.all([net.deleteName('a', 'k'), net.adminList('k'), net.adminDelete('k', 'a')]);
  ok(calls === 0 && rd.every((x) => !x.ok), 'client: disabled -> no fetch');
}

ok(!leak, 'token never appears in any response');

// ===== checkName client =====
{
  net.__setRelayUrl('');
  let calls = 0; globalThis.fetch = async () => { calls++; return {}; };
  const r0 = await net.checkName('x');
  ok(r0.ok === false && calls === 0, 'client: disabled -> {ok:false}, no fetch');
  net.__setRelayUrl('https://x.invalid/');
  let seen;
  globalThis.fetch = async (u, i) => { seen = { u, i }; return { ok: true, status: 200, json: async () => ({ taken: true }) }; };
  let r = await net.checkName('みや ＆&=');
  ok(r.ok === true && r.taken === true, 'client: ok taken');
  ok(seen.u === 'https://x.invalid/name?n=' + encodeURIComponent('みや ＆&=') && seen.i.method === 'GET', 'client: URL encoded, GET');
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ taken: false }) });
  r = await net.checkName('a'); ok(r.ok && r.taken === false, 'client: ok not taken');
  const bad = {
    offline: async () => { throw new Error('net'); },
    syncThrow: () => { throw new Error('s'); },
    http400: async () => ({ ok: false, status: 400, json: async () => ({}) }),
    badJson: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }),
    wrongShape: async () => ({ ok: true, status: 200, json: async () => ({ taken: 'yes' }) }),
    nullBody: async () => ({ ok: true, status: 200, json: async () => null }),
  };
  for (const [k, f] of Object.entries(bad)) { globalThis.fetch = f; r = await net.checkName('a'); ok(r.ok === false && !('taken' in r), 'client: ' + k + ' -> {ok:false}'); }
  for (const k of ['hangHeaders', 'hangBody']) {
    globalThis.fetch = k === 'hangHeaders' ? () => new Promise(() => {}) : async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
    const t0 = realNow();
    r = await Promise.race([net.checkName('a', 150), new Promise((res) => setTimeout(() => res('PENDING'), 2000))]);
    ok(r !== 'PENDING' && r.ok === false && realNow() - t0 < 1000, 'client: ' + k + ' times out -> {ok:false}');
  }
  globalThis.fetch = undefined;
  r = await net.checkName('a'); ok(r.ok === false, 'client: no fetch available -> {ok:false}');
  net.__setRelayUrl('');
}

console.log(pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
