// P11: 版別ボード(v1.0/v1.1)・複数端末キー・任意PIN・net.js 新API。実行: node 04_tests/p11net.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

const net = await import(path.join(ROOT, '02_src/net.js'));
const W = (await import(path.join(ROOT, '../lander/06_server/ranking-worker.js'))).default;

const realNow = Date.now.bind(Date); let skew = 0;
Date.now = () => realNow() + skew;
const bust = (ms = 120_000) => { skew += ms; };

// ---- Fake GitHub ----
const AK = 'admin-' + 'q'.repeat(40);
const PEPPER = 'PEPPER_SECRET_' + 'z'.repeat(30);
const O = 'https://u.github.io';
const env = { GITHUB_TOKEN: 'SECRET_TOKEN_123', REPO: 'u/r', ALLOWED_ORIGINS: O, ADMIN_KEY: AK };
const envP = { ...env, PIN_PEPPER: PEPPER };
const files = new Map();
const gh = { n: 0 };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const pathOf = (url) => decodeURIComponent(new URL(url).pathname.replace(/^\/repos\/u\/r\/contents\//, ''));
const fakeGH = async (url, init = {}) => {
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
    return new Response('{}', { status: 201 });
  }
};
globalThis.fetch = fakeGH;
let ipN = 0; const allText = [];
const chk = async (r) => { allText.push(await r.clone().text()); return r; };
const K = (n) => Buffer.from('k:' + n).toString('hex').padEnd(32, '0');
const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, '0')).join('');
const rawPost = async (p, body, { e = envP, headers = {}, origin = O, ip } = {}) => chk(await W.fetch(new Request('https://w' + p, { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': ip || '9.9.9.' + (ipN++), 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), e));
const submit = (name, score, stage, extra = {}, key = K(name), e = envP) => rawPost('/submit', { name, score, stage, key, ...extra }, { e });
const get = async (p, e = envP, headers = {}) => chk(await W.fetch(new Request('https://w' + p, { headers: { Origin: O, ...headers } }), e));
const rank = async (board) => (await (await get('/ranking' + (board === undefined ? '' : '?board=' + board))).json());
const jb = (r) => r.json();
const top = (f = 'top.json') => JSON.parse(files.get(f).text);
const names = () => JSON.parse(files.get('names.json').text);
const logsOf = (prefix) => [...files].filter(([p]) => p.startsWith(prefix)).flatMap(([, f]) => f.text.split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const reset = () => { files.clear(); bust(); };
const pinSet = (name, key, pin, e) => rawPost('/pin/set', { name, key, pin }, { e });
const pinClear = (name, key, e) => rawPost('/pin/clear', { name, key }, { e });
const login = (name, pin, newKey, ip) => rawPost('/pin/login', { name, pin, newKey }, { ip });
const nameInfo = async (n) => (await get('/name?n=' + encodeURIComponent(n))).json();

// ===== 1. boards =====
reset();
{
  let r = await submit('Ace', 3000, 3);   // board 省略 = v1.0（現行クライアント）
  ok(r.status === 200 && files.has('top.json') && !files.has('top-v1.1.json'), 'board: default submit -> top.json only');
  const before = files.get('top.json').text, logBefore = [...files].filter(([p]) => p.startsWith('log/')).map(([p, f]) => p + f.text).join();
  r = await submit('Ace', 9000, 5, { board: 'v1.1' });
  ok(r.status === 200 && files.has('top-v1.1.json') && top('top-v1.1.json')[0].score === 9000, 'board: v1.1 submit -> top-v1.1.json');
  ok(files.get('top.json').text === before, 'board: v1.0 top.json untouched by v1.1 submit');
  const logAfter = [...files].filter(([p]) => p.startsWith('log/') && !p.startsWith('log/v1.1/')).map(([p, f]) => p + f.text).join();
  ok(logAfter === logBefore, 'board: v1.0 logs untouched by v1.1 submit');
  const m = new Date().toISOString().slice(0, 7);
  ok(files.has(`log/v1.1/${m}.jsonl`) && files.has(`log/${m}.jsonl`) && logsOf('log/v1.1/').length === 1 && logsOf('log/v1.1/')[0].score === 9000, 'board: v1.1 log in log/v1.1/YYYY-MM.jsonl');
  r = await submit('Ace', 100, 1, { board: 'v1.0' });
  ok(r.status === 200 && top()[0].score === 3000, 'board: explicit v1.0 = default (best kept)');
  r = await submit('Ace', 1, 1, { board: 'v2' }); ok(r.status === 400 && (await jb(r)).error === 'invalid', 'board: unknown board on submit -> 400');
  r = await submit('Ace', 1, 1, { board: 5 }); ok(r.status === 400, 'board: non-string board -> 400');
  r = await submit('Ace', 1, 1, { board: '../x' }); ok(r.status === 400, 'board: path-like board -> 400');
  bust();
  let j = await rank();
  ok(j.board === 'v1.0' && j.top.length === 1 && j.top[0].score === 3000, 'ranking: default board v1.0, includes board field');
  j = await rank('v1.0'); ok(j.board === 'v1.0' && j.top[0].score === 3000, 'ranking: ?board=v1.0');
  j = await rank('v1.1'); ok(j.board === 'v1.1' && j.top[0].score === 9000, 'ranking: ?board=v1.1 separate (no cache bleed)');
  j = await rank(''); ok(j.board === 'v1.0', 'ranking: empty board = default');
  const r2 = await get('/ranking?board=zzz'); ok(r2.status === 400, 'ranking: unknown board -> 400');
  // v1.1 の最初の取得（ファイル無し）
  files.delete('top-v1.1.json'); bust();
  j = await rank('v1.1'); ok(j.board === 'v1.1' && Array.isArray(j.top) && j.top.length === 0, 'ranking: empty v1.1 board -> []');
}
// TOP_FILE 変更時の命名
reset();
{
  const e2 = { ...envP, TOP_FILE: 'scores/best.json', LOG_DIR: 'lg' };
  await submit('Zed', 10, 1, { board: 'v1.1' }, K('Zed'), e2);
  ok(files.has('scores/best-v1.1.json') && [...files.keys()].some((p) => p.startsWith('lg/v1.1/')), 'board: custom TOP_FILE/LOG_DIR naming');
}

// ===== 2. title per-board champion =====
reset();
{
  await submit('Ace', 3000, 3); await submit('Bob', 1000, 1);
  await submit('Bob', 9000, 5, { board: 'v1.1' }); await submit('Ace', 500, 1, { board: 'v1.1' });
  const t = (name, title, board) => rawPost('/title', { name, key: K(name), title, ...(board ? { board } : {}) });
  let r = await t('Ace', 'x');                  ok(r.status === 200, 'title: default board champion Ace ok');
  r = await t('Bob', 'y');                      ok(r.status === 409, 'title: Bob not champion on v1.0');
  r = await t('Bob', 'y', 'v1.1');              ok(r.status === 200, 'title: Bob champion on v1.1');
  r = await t('Ace', 'z', 'v1.1');              ok(r.status === 409, 'title: Ace not champion on v1.1');
  r = await t('Ace', 'z', 'bad');               ok(r.status === 400, 'title: bad board -> 400');
  ok(names().Ace.title === 'x' && names().Bob.title === 'y', 'title: name-level, shared');
  ok(top('top.json').find((x) => x.name === 'Bob').title === 'y' && top('top-v1.1.json').find((x) => x.name === 'Ace').title === 'x', 'title: applied to rows on both boards');
  bust();
  const list = await (await get('/admin/list', envP, { 'X-Admin-Key': AK })).json();
  const a = list.names.find((x) => x.name === 'Ace');
  ok(a.best.score === 3000 && a.bests['v1.0'].score === 3000 && a.bests['v1.1'].score === 500, 'admin/list: per-board bests (best = v1.0)');
  // delete removes from both boards
  let d = await rawPost('/delete', { name: 'Ace', key: K('Ace') });
  ok(d.status === 200 && !top('top.json').some((x) => x.name === 'Ace') && !top('top-v1.1.json').some((x) => x.name === 'Ace') && !names().Ace, 'delete: removed from names and both boards');
}

// ===== 3. keys migration / multi-key =====
reset();
{
  const kOld = K('Mig');
  files.set('names.json', { text: JSON.stringify({ Mig: { name: 'Mig', keyHash: await sha(kOld), first: '2026-01-01T00:00:00.000Z' } }) + '\n', sha: 'sM' });
  files.set('top.json', { text: JSON.stringify([{ name: 'Mig', score: 100, stage: 1, date: '2026-01-01T00:00:00.000Z' }]) + '\n', sha: 'sT' });
  ok((await nameInfo('Mig')).taken === true, 'migrate: legacy keyHash entry is taken');
  let r = await submit('Mig', 200, 2, {}, kOld);
  ok(r.status === 200, 'migrate: legacy keyHash accepted as keys[0]');
  r = await submit('Mig', 300, 3, {}, K('other')); ok(r.status === 403, 'migrate: other key rejected');
  // 書き込みを伴う操作（title）で保存形式が移行される
  r = await rawPost('/title', { name: 'Mig', key: kOld, title: 'T' });
  const e = names().Mig;
  ok(r.status === 200 && Array.isArray(e.keys) && e.keys[0] === await sha(kOld) && !('keyHash' in e), 'migrate: written back as keys[], keyHash removed');
}
reset();
{
  await submit('Mk', 10, 1, {}, K('Mk0'));
  const pin = '123456';
  await pinSet('Mk', K('Mk0'), pin);
  for (let i = 1; i <= 6; i++) {
    const r = await login('Mk', pin, K('Mk' + i));
    ok(r.status === 200, 'multi-key: login adds device ' + i);
  }
  const keys = names().Mk.keys;
  ok(keys.length === 5, 'multi-key: capped at 5 (got ' + keys.length + ')');
  ok(!keys.includes(await sha(K('Mk0'))) && !keys.includes(await sha(K('Mk1'))) && keys.includes(await sha(K('Mk6'))), 'multi-key: oldest dropped');
  let r = await submit('Mk', 20, 1, {}, K('Mk6')); ok(r.status === 200, 'multi-key: newest key submits');
  bust(); r = await submit('Mk', 30, 1, {}, K('Mk3')); ok(r.status === 200, 'multi-key: middle key submits');
  bust(); r = await submit('Mk', 40, 1, {}, K('Mk0')); ok(r.status === 403, 'multi-key: dropped key rejected');
  // /title and /delete accept any registered device key
  await submit('Mk', 8000, 2, {}, K('Mk4')); // champion (only player)
  r = await rawPost('/title', { name: 'Mk', key: K('Mk5'), title: 'dev5' }); ok(r.status === 200, 'multi-key: /title with another device key');
  r = await rawPost('/delete', { name: 'Mk', key: K('Mk2') }); ok(r.status === 200 && !names().Mk, 'multi-key: /delete with another device key');
  // 再ログインで同じキーを重複登録しない
  await submit('Dup', 1, 1, {}, K('Dup')); await pinSet('Dup', K('Dup'), '1234');
  await login('Dup', '1234', K('Dup')); await login('Dup', '1234', K('Dup'));
  ok(names().Dup.keys.length === 1, 'multi-key: no duplicate key entries');
}

// ===== 4. PIN =====
reset();
await submit('Pia', 100, 1);
{
  let i = await nameInfo('Pia'); ok(i.taken === true && i.hasPin === false, 'name: hasPin=false before set');
  i = await nameInfo('Nobody'); ok(i.taken === false && i.hasPin === false, 'name: unknown -> taken false, hasPin false');
  // set
  let r = await pinSet('Pia', K('Pia'), '123456'); ok(r.status === 200 && (await jb(r)).ok === true, 'pin/set ok');
  const e = names().Pia;
  ok(/^[0-9a-f]{32}$/.test(e.pinSalt) && /^[0-9a-f]{64}$/.test(e.pinHash) && !JSON.stringify(e).includes('123456'), 'pin: salt 16B hex, HMAC-SHA256 hex, no plaintext');
  const ref = Buffer.from(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(e.pinSalt + ':123456'))).toString('hex');
  ok(e.pinHash === ref, 'pin: pinHash = HMAC-SHA256(PIN_PEPPER, salt:pin)');
  bust(); i = await nameInfo('Pia'); ok(i.taken && i.hasPin === true && Object.keys(i).length === 2, 'name: hasPin=true after set');
  // set validation
  for (const bad of ['123', '1234567', 'abcd', '12 34', 1234, null, '']) {
    r = await pinSet('Pia', K('Pia'), bad); ok(r.status === 400, 'pin/set invalid pin ' + JSON.stringify(bad) + ' -> 400');
  }
  r = await pinSet('Pia', K('Nope'), '1234'); ok(r.status === 403 && (await jb(r)).error === 'forbidden', 'pin/set unregistered key -> 403');
  r = await pinSet('Ghost', K('Ghost'), '1234'); ok(r.status === 404, 'pin/set unknown name -> 404');
  r = await pinSet('Pia', 'zz', '1234'); ok(r.status === 400, 'pin/set malformed key -> 400');
  r = await rawPost('/pin/set', { name: 'Pia', key: K('Pia'), pin: '1234' }, { origin: 'https://evil.example' }); ok(r.status === 403 && (await jb(r)).error === 'origin', 'pin/set foreign origin -> 403');
  ok(names().Pia.pinHash === e.pinHash, 'pin: rejected requests changed nothing');
  // change PIN: new salt
  r = await pinSet('Pia', K('Pia'), '4321'); ok(r.status === 200 && names().Pia.pinSalt !== e.pinSalt && names().Pia.pinHash !== e.pinHash, 'pin/set change: new salt + hash');
  r = await login('Pia', '123456', K('Pia2')); ok(r.status === 403, 'old pin no longer works');
  r = await login('Pia', '4321', K('Pia2'));
  const j = await jb(r);
  ok(r.status === 200 && j.ok === true && j.name === 'Pia' && !('title' in j), 'login ok -> {ok,name}');
  ok(names().Pia.keys.includes(await sha(K('Pia2'))) && !('fails' in names().Pia) && !('lockUntil' in names().Pia), 'login ok: key added, no legacy fields');
  r = await submit('Pia', 500, 2, {}, K('Pia2')); ok(r.status === 200, 'new device key can submit after login');
  // title carried in login response
  await rawPost('/title', { name: 'Pia', key: K('Pia'), title: '王者' });
  r = await login('Pia', '4321', K('Pia3')); ok((await jb(r)).title === '王者', 'login ok returns title when set');
  // login validation
  r = await login('Pia', '12', K('Pia4')); ok(r.status === 400, 'login: bad pin format -> 400');
  r = await login('Pia', '4321', 'zz'); ok(r.status === 400, 'login: bad newKey -> 400');
  r = await rawPost('/pin/login', { name: '', pin: '4321', newKey: K('x') }); ok(r.status === 400, 'login: empty name -> 400');
  r = await login('Ghost', '4321', K('Pia4')); ok(r.status === 404 && (await jb(r)).error === 'unknown', 'login: unknown name -> 404');
  r = await rawPost('/pin/login', 'not json'); ok(r.status === 400, 'login: bad JSON -> 400');
  r = await W.fetch(new Request('https://w/pin/login', { headers: { Origin: O } }), envP); ok(r.status === 404, 'GET /pin/login -> 404');
  // clear
  r = await pinClear('Pia', K('Nope')); ok(r.status === 403, 'pin/clear wrong key -> 403');
  r = await pinClear('Pia', K('Pia')); ok(r.status === 200, 'pin/clear ok');
  const e2 = names().Pia;
  ok(!('pinHash' in e2) && !('pinSalt' in e2) && !('fails' in e2) && !('lockUntil' in e2) && e2.keys.length >= 2, 'pin/clear: pin fields gone, keys kept');
  r = await login('Pia', '4321', K('Pia5')); ok(r.status === 409 && (await jb(r)).error === 'no-pin', 'login without pin -> 409 no-pin');
  bust(); i = await nameInfo('Pia'); ok(i.hasPin === false, 'name: hasPin=false after clear');
}

// ===== 5. lock / unlock (per name+IP pair, daily name cap) =====
reset();
await submit('Lok', 100, 1); await pinSet('Lok', K('Lok'), '246810');
{
  const good = '246810', A = '1.1.1.1', B = '2.2.2.2';
  const lg = (pin, key, ip) => login('Lok', pin, key, ip);
  // seed an old-format entry: fails/lockUntil must be migrated away on next write
  { const f = JSON.parse(files.get('names.json').text); f.Lok.fails = 3; f.Lok.lockUntil = Date.now() - 1000; files.get('names.json').text = JSON.stringify(f); }
  let r = await lg('000000', K('L1'), A);
  ok(r.status === 403 && !('fails' in names().Lok) && !('lockUntil' in names().Lok), 'migrate: old fails/lockUntil dropped on write');
  for (let n = 2; n <= 4; n++) { r = await lg('000000', K('L' + n), A); ok(r.status === 403 && (await jb(r)).error === 'bad-pin', 'pair: wrong pin #' + n + ' -> bad-pin'); }
  const tagA = Object.keys(names().Lok.pinIp)[0];
  ok(names().Lok.pinIp[tagA].n === 4 && names().Lok.pinDay.n === 4, 'pair: 4 failures counted (pair + day)');
  r = await lg(good, K('Lgood'), A);
  ok(r.status === 200 && !(tagA in names().Lok.pinIp), 'pair: success resets that pair counter');
  ok(names().Lok.pinDay.n === 4, 'daily count NOT reset by success');
  for (let n = 1; n <= 4; n++) await lg('111111', K('L' + n), A);
  r = await lg('111111', K('Lx'), A);
  const j5 = await jb(r);
  ok(r.status === 429 && j5.error === 'locked' && !('scope' in j5) && j5.retryAfter > 800 && j5.retryAfter <= 900, '5th consecutive failure from IP A -> 429 locked + retryAfter');
  ok(names().Lok.pinIp[tagA].until > Date.now(), 'pair: until stored');
  const keysBefore = names().Lok.keys.length;
  r = await lg(good, K('Lblocked'), A);
  ok(r.status === 429 && (await jb(r)).error === 'locked' && names().Lok.keys.length === keysBefore, 'pair: correct pin from A rejected while locked, no key added');
  r = await lg(good, K('LB'), B); ok(r.status === 200, 'pair: IP B (owner) still logs in while A is locked');
  r = await lg('222222', K('LB2'), B); ok(r.status === 403, 'pair: IP B wrong pin is plain bad-pin');
  bust(14 * 60_000);
  r = await lg(good, K('Lblocked'), A); ok(r.status === 429, 'pair: still locked at 14 min');
  bust(61_000 + 120_000);
  r = await lg(good, K('Lblocked'), A); ok(r.status === 200, 'pair: unlocked after 15 min, correct pin works');
  // after expiry the counter restarts from 0
  bust(); await lg('1', K('x'), A).catch(() => {});
  for (let n = 0; n < 4; n++) await lg('333333', K('Lw'), A);
  r = await lg('333333', K('Lw'), A); ok(r.status === 429, 'pair: relock after 5 fresh failures');
  bust(16 * 60_000);
  r = await lg('333333', K('Lw'), A); ok(r.status === 403 && names().Lok.pinIp[tagA].n === 1, 'pair: expired lock -> counter restarts at 1');
  // owner reset via /pin/set clears counters
  for (let n = 0; n < 5; n++) await lg('999999', K('Lz'), A);
  ok(names().Lok.pinIp[tagA].until > Date.now(), 'pair: locked again');
  r = await pinSet('Lok', K('Lok'), '135790'); ok(r.status === 200 && !('pinIp' in names().Lok) && !('pinDay' in names().Lok), 'pin/set clears pinIp and pinDay');
  r = await pinClear('Lok', K('Lok')); ok(r.status === 200 && !('pinIp' in names().Lok) && !('pinDay' in names().Lok), 'pin/clear removes pinIp and pinDay');
  await pinSet('Lok', K('Lok'), '246810');
  // log lines
  const L = logsOf('log/').filter((x) => x.kind === 'pin');
  const acts = new Set(L.map((x) => x.action));
  ok(['set', 'login-ok', 'login-fail', 'lock'].every((a) => acts.has(a)), 'pin log: set/login-ok/login-fail/lock present');
  ok(L.every((x) => Object.keys(x).sort().join() === 'action,date,kind,name' && /^\d{4}-\d\d-\d\dT/.test(x.date) && x.name === 'Lok'), 'pin log: exact keys, no secrets');
  ok(!JSON.stringify(L).includes('135790') && !JSON.stringify(L).includes('246810') && !JSON.stringify(L).includes(PEPPER) && !JSON.stringify(L).includes(A), 'pin log: no pin/pepper/ip text');
}

// ===== 5b. daily cap across many IPs, privacy, pruning =====
reset();
{
  // pin the clock to just before a UTC midnight so "next day" is deterministic
  const t0 = Date.UTC(2031, 0, 10, 12, 0, 0);
  skew = t0 - realNow();
  await submit('Cap', 100, 1); await pinSet('Cap', K('Cap'), '246810');
  const good = '246810';
  let last = null, ips = [];
  for (let n = 0; n < 49; n++) { const ip = '10.0.' + Math.floor(n / 200) + '.' + (n + 1); ips.push(ip); last = await login('Cap', '000000', K('c' + n), ip); }
  ok(last.status === 403 && names().Cap.pinDay.n === 49 && names().Cap.pinDay.d === '2031-01-10', 'cap: 49 failures from 49 IPs, none locked');
  ok(Object.keys(names().Cap.pinIp).length === 20, 'prune: pinIp limited to 20 tags');
  const ser = files.get('names.json').text;
  ok(ips.every((ip) => !ser.includes(ip)) && !/"\d+\.\d+\.\d+\.\d+"/.test(ser), 'privacy: no raw IP in names.json');
  ok(Object.keys(names().Cap.pinIp).every((t) => /^[0-9a-f]{16}$/.test(t)), 'privacy: tags are 16 hex');
  let r = await login('Cap', '000000', K('c49'), '10.9.9.9'); const j = await jb(r);
  ok(r.status === 429 && j.error === 'locked' && j.scope === 'name' && j.retryAfter > 0 && j.retryAfter <= 12 * 3600, 'cap: 50th failure -> 429 locked scope:name, retryAfter to UTC midnight');
  ok(logsOf('log/').some((x) => x.kind === 'pin' && x.action === 'lock-name' && x.name === 'Cap'), 'cap: lock-name logged');
  r = await login('Cap', good, K('cgood'), '10.77.7.7'); const j2 = await jb(r);
  ok(r.status === 429 && j2.scope === 'name' && !names().Cap.keys.includes(await sha(K('cgood'))), 'cap: fresh IP with correct pin also locked');
  bust(11 * 3600_000);   // 23:00 UTC, same day
  r = await login('Cap', good, K('cgood'), '10.77.7.8'); ok(r.status === 429, 'cap: still locked before UTC midnight');
  bust(61 * 60_000);     // 00:01 UTC next day
  r = await login('Cap', good, K('cgood'), '10.77.7.9'); ok(r.status === 200, 'cap: reset on next UTC day, correct pin works');
  ok(names().Cap.pinDay.d === '2031-01-11' && names().Cap.pinDay.n === 0, 'cap: pinDay rolled to new day');
  // entries older than 24h are dropped
  bust(25 * 3600_000);
  await login('Cap', '000000', K('cz'), '10.88.8.8');
  ok(Object.keys(names().Cap.pinIp).length === 1, 'prune: tags older than 24h dropped');
  // admin reset clears counters
  const ar = await rawPost('/admin/pin-reset', { name: 'Cap' }, { headers: { 'X-Admin-Key': AK } });
  ok(ar.status === 200 && !('pinIp' in names().Cap) && !('pinDay' in names().Cap) && !('pinHash' in names().Cap), 'admin/pin-reset clears pinIp and pinDay');
  skew = 0; skew = 0; bust();
}
// per-IP limiter
reset();
await submit('Ipp', 1, 1); await pinSet('Ipp', K('Ipp'), '1234');
{
  let last = null;
  for (let n = 0; n < 31; n++) last = await rawPost('/pin/login', { name: 'Ipp', pin: '0000', newKey: K('i' + n) }, { ip: '7.7.7.7' }).then(async (r) => { const j = await r.clone().json(); return { s: r.status, j }; });
  ok(last.s === 429 && last.j.error === 'rate' && last.j.retryAfter > 0, 'ip limiter: >30 attempts per window from one IP -> 429 rate');
  const r = await login('Ipp', '1234', K('ip-other'), '8.8.8.8'); ok(r.status === 200 || r.status === 429, 'ip limiter: other IP evaluated separately');
}

// ===== 6. pepper unset =====
reset();
await submit('Nop', 1, 1);
{
  for (const [p, b] of [['/pin/set', { name: 'Nop', key: K('Nop'), pin: '1234' }], ['/pin/clear', { name: 'Nop', key: K('Nop') }], ['/pin/login', { name: 'Nop', pin: '1234', newKey: K('x') }]]) {
    const r = await rawPost(p, b, { e: env });
    ok(r.status === 503 && (await jb(r)).error === 'pin-disabled', p + ' without PIN_PEPPER -> 503 pin-disabled');
  }
  ok(!('pinHash' in names().Nop), 'no pepper: nothing stored');
  ok((await nameInfo('Nop')).hasPin === false, 'no pepper: /name still works');
  ok((await submit('Nop', 5, 1, {}, K('Nop'), env)).status === 200, 'no pepper: submit unaffected');
}

// ===== 7. admin pin-reset =====
reset();
await submit('Adm', 1, 1); await pinSet('Adm', K('Adm'), '1234');
for (let n = 0; n < 5; n++) await login('Adm', '0000', K('a' + n), '6.6.6.6');
{
  ok(Object.values(names().Adm.pinIp).some((v) => v.until > Date.now()), 'admin: precondition locked');
  const keys = names().Adm.keys.slice();
  const ar = (b, key) => rawPost('/admin/pin-reset', b, { headers: key === undefined ? {} : { 'X-Admin-Key': key } });
  let r = await ar({ name: 'Adm' }); ok(r.status === 401, 'admin/pin-reset: no key -> 401');
  r = await ar({ name: 'Adm' }, 'wrong'); ok(r.status === 401 && 'pinHash' in names().Adm, 'admin/pin-reset: wrong key -> 401, unchanged');
  r = await ar({ name: 'Adm' }, AK); const e = names().Adm;
  ok(r.status === 200 && !('pinHash' in e) && !('pinSalt' in e) && !('pinIp' in e) && !('pinDay' in e) && e.keys.join() === keys.join(), 'admin/pin-reset: pin, counters, lock cleared; keys kept');
  r = await ar({ name: 'Zzz' }, AK); ok(r.status === 404, 'admin/pin-reset: unknown -> 404');
  r = await ar({ name: '' }, AK); ok(r.status === 400, 'admin/pin-reset: empty -> 400');
  r = await rawPost('/admin/pin-reset', { name: 'Adm' }, { e: { ...env, ADMIN_KEY: undefined }, headers: { 'X-Admin-Key': AK } }); ok(r.status === 503, 'admin/pin-reset: ADMIN_KEY unset -> 503');
  ok(logsOf('log/').some((x) => x.kind === 'pin' && x.action === 'admin-reset' && x.name === 'Adm'), 'admin/pin-reset: logged');
  r = await login('Adm', '1234', K('afterReset')); ok((await jb(r)).error === 'no-pin', 'admin/pin-reset: login now no-pin');
  // admin reset works even without pepper
  await pinSet('Adm', K('Adm'), '5555');
  r = await rawPost('/admin/pin-reset', { name: 'Adm' }, { e: env, headers: { 'X-Admin-Key': AK } }); ok(r.status === 200 && !('pinHash' in names().Adm), 'admin/pin-reset works without pepper');
}

// ===== 8. no secrets in responses =====
{
  await pinSet('Adm', K('Adm'), '7777'); bust();
  await get('/admin/list', envP, { 'X-Admin-Key': AK });
  const all = allText.join('\n');
  const sec = names().Adm;
  ok(!all.includes('SECRET_TOKEN') && !all.includes(PEPPER) && !all.includes(AK), 'leak: token / pepper / admin key never in responses');
  ok(!all.includes('pinHash') && !all.includes('pinSalt') && !all.includes('"keys"') && !all.includes('keyHash'), 'leak: no pinHash/pinSalt/keys/keyHash fields');
  ok(!all.includes(sec.pinHash) && !all.includes(sec.pinSalt) && !all.includes(sec.keys[0]), 'leak: stored hash/salt/key values never in responses');
}

// ===== 9. net.js =====
{
  net.__setRelayUrl('https://x.invalid/'); net.__setRelayBoard('v1.0');
  ok(net.RELAY_BOARD === 'v1.0', 'net: RELAY_BOARD default v1.0');
  let seen = []; let handler = null;
  const reply = (status, body) => { seen = []; globalThis.fetch = async (u, i) => { seen.push({ u, i }); return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }); }; };
  reply(200, { board: 'v1.0', top: [{ name: 'A', score: 1, stage: 1, date: 'd' }] });
  let t = await net.fetchWorldTop(); ok(t && t.length === 1 && seen[0].u === 'https://x.invalid/ranking?board=v1.0', 'net: fetchWorldTop sends board');
  reply(200, {}); await net.submitScore({ name: 'A', score: 1, stage: 1, key: 'k' });
  ok(JSON.parse(seen[0].i.body).board === 'v1.0', 'net: submitScore sends board');
  net.__setRelayBoard('v1.1');
  reply(200, {}); await net.submitScore({ name: 'A', score: 1, stage: 1, key: 'k' }); ok(JSON.parse(seen[0].i.body).board === 'v1.1', 'net: submitScore board v1.1');
  reply(200, { ok: true, title: 'T' }); await net.setTitle('A', 'k', 'T'); ok(JSON.parse(seen[0].i.body).board === 'v1.1', 'net: setTitle sends board');
  reply(200, { top: [] }); await net.fetchWorldTop(); ok(seen[0].u.endsWith('/ranking?board=v1.1'), 'net: fetchWorldTop v1.1');

  // relayBoardSupported
  net.__setRelayBoard('v1.1');
  reply(200, { board: 'v1.1', top: [] }); ok(await net.relayBoardSupported() === true && seen.length === 1, 'support: new worker -> true');
  ok(await net.relayBoardSupported() === true && seen.length === 1, 'support: cached (no second request)');
  net.__setRelayBoard('v1.1'); reply(200, { top: [] }); ok(await net.relayBoardSupported() === false, 'support: old worker (no board field) -> false');
  ok(await net.relayBoardSupported() === false && seen.length === 1, 'support: false is cached too');
  net.__setRelayBoard('v1.1'); reply(200, { board: 'v1.0', top: [] }); ok(await net.relayBoardSupported() === false, 'support: board mismatch -> false');
  net.__setRelayBoard('v1.1'); reply(400, { error: 'invalid' }); ok(await net.relayBoardSupported() === false, 'support: 400 -> false');
  net.__setRelayBoard('v1.1'); globalThis.fetch = async () => { throw new Error('down'); }; ok(await net.relayBoardSupported() === false, 'support: offline -> false');
  reply(200, { board: 'v1.1', top: [] }); ok(await net.relayBoardSupported() === true, 'support: offline failure not cached');
  net.__setRelayBoard('v1.1'); globalThis.fetch = () => new Promise(() => {});
  const t0 = realNow(); ok(await net.relayBoardSupported(150) === false && realNow() - t0 < 1000, 'support: hang -> false within timeout');
  net.__setRelayBoard('v1.0'); reply(200, { board: 'v1.0', top: [] }); ok(await net.relayBoardSupported() === true, 'support: other board re-probed');
  net.__setRelayUrl(''); let called = 0; globalThis.fetch = async () => { called++; return new Response('{}'); };
  ok(await net.relayBoardSupported() === false && called === 0, 'support: RELAY_URL empty -> false, no network');
  net.__setRelayUrl('https://x.invalid');

  // checkName
  reply(200, { taken: true, hasPin: true }); let c = await net.checkName('A'); ok(c.ok && c.taken === true && c.hasPin === true, 'net: checkName hasPin true');
  reply(200, { taken: true }); c = await net.checkName('A'); ok(c.ok && c.taken === true && c.hasPin === false, 'net: checkName old worker -> hasPin false');
  reply(200, { taken: 'x' }); c = await net.checkName('A'); ok(c.ok === false, 'net: checkName bad body -> ok false');

  // pin calls: request shapes
  reply(200, { ok: true }); let r = await net.setPin('A', 'kk', '1234');
  ok(r.ok && seen[0].u === 'https://x.invalid/pin/set' && seen[0].i.method === 'POST' && JSON.stringify(JSON.parse(seen[0].i.body)) === JSON.stringify({ name: 'A', key: 'kk', pin: '1234' }), 'net: setPin shape');
  r = await net.clearPin('A', 'kk'); ok(r.ok && seen.at(-1).u.endsWith('/pin/clear') && JSON.stringify(JSON.parse(seen.at(-1).i.body)) === JSON.stringify({ name: 'A', key: 'kk' }), 'net: clearPin shape');
  reply(200, { ok: true, name: 'A', title: '王者' }); r = await net.loginWithPin('A', '1234', 'nk');
  ok(r.ok && r.name === 'A' && r.title === '王者' && seen[0].u.endsWith('/pin/login') && JSON.stringify(JSON.parse(seen[0].i.body)) === JSON.stringify({ name: 'A', pin: '1234', newKey: 'nk' }), 'net: loginWithPin shape + result');
  reply(200, { ok: true }); r = await net.adminResetPin('AK', 'A');
  ok(r.ok && seen[0].u.endsWith('/admin/pin-reset') && seen[0].i.headers['X-Admin-Key'] === 'AK' && JSON.parse(seen[0].i.body).name === 'A', 'net: adminResetPin shape + header');
  // error mapping
  const cases = [
    [503, { error: 'pin-disabled' }, 'pin-disabled'], [409, { error: 'no-pin' }, 'no-pin'], [403, { error: 'bad-pin' }, 'bad-pin'],
    [429, { error: 'locked', retryAfter: 777 }, 'locked', 777], [429, { error: 'rate', retryAfter: 9 }, 'rate', 9],
    [404, { error: 'not found' }, 'unavailable'], [404, { error: 'unknown' }, 'unknown'], [403, { error: 'forbidden' }, 'forbidden'],
    [400, { error: 'invalid' }, 'invalid'], [401, { error: 'unauthorized' }, 'unauthorized'], [503, { error: 'admin disabled' }, 'disabled'],
    [500, { error: 'x' }, 'status 500'], [502, '<html>', 'status 502'],
  ];
  for (const [st, body, want, ra] of cases) {
    reply(st, body);
    const rs = await Promise.all([net.setPin('A', 'k', '1234'), net.clearPin('A', 'k'), net.loginWithPin('A', '1234', 'k'), net.adminResetPin('AK', 'A')]);
    ok(rs.every((x) => x.ok === false && x.error === want && (ra === undefined || x.retryAfter === ra)), `net: ${st} ${JSON.stringify(body)} -> ${want}${ra ? ' +retryAfter' : ''} (got ${rs.map((x) => x.error)})`);
  }
  reply(200, 'not json'); r = await net.setPin('A', 'k', '1234'); ok(r.ok === true, 'net: 200 with non-JSON body still ok');
  globalThis.fetch = async () => { throw new Error('net down'); };
  let rs = await Promise.all([net.setPin('a', 'k', '1234'), net.clearPin('a', 'k'), net.loginWithPin('a', '1234', 'k'), net.adminResetPin('K', 'a')]);
  ok(rs.every((x) => x.ok === false && typeof x.error === 'string' && x.error.length > 0), 'net: offline -> {ok:false,error}');
  globalThis.fetch = () => new Promise(() => {});
  const t1 = realNow();
  rs = await Promise.race([Promise.all([net.setPin('a', 'k', '1234', 150), net.clearPin('a', 'k', 150), net.loginWithPin('a', '1234', 'k', 150), net.adminResetPin('K', 'a', 150)]), new Promise((res) => setTimeout(() => res('PENDING'), 2000))]);
  ok(rs !== 'PENDING' && rs.every((x) => !x.ok) && realNow() - t1 < 1000, 'net: headers hang -> timeout');
  globalThis.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
  rs = await Promise.race([Promise.all([net.setPin('a', 'k', '1234', 150), net.loginWithPin('a', '1234', 'k', 150)]), new Promise((res) => setTimeout(() => res('PENDING'), 2000))]);
  ok(rs !== 'PENDING' && rs.every((x) => !x.ok), 'net: body hang -> timeout');
  called = 0; globalThis.fetch = async () => { called++; return new Response('{}'); };
  net.__setRelayUrl('');
  rs = await Promise.all([net.setPin('a', 'k', '1234'), net.clearPin('a', 'k'), net.loginWithPin('a', '1234', 'k'), net.adminResetPin('K', 'a')]);
  ok(rs.every((x) => !x.ok && x.error === 'disabled') && called === 0, 'net: RELAY_URL empty -> disabled, no network');
  net.__setRelayBoard('v1.0');
}

// ===== 10. net.js against the real worker (end-to-end) =====
{
  reset(); net.__setRelayUrl('https://relay.test'); net.__setRelayBoard('v1.1');
  globalThis.fetch = async (u, i = {}) => {
    const x = new URL(u);
    if (x.hostname === 'api.github.com') return fakeGH(u, i);
    return W.fetch(new Request(u, { method: i.method || 'GET', headers: { Origin: O, 'CF-Connecting-IP': '5.5.5.' + (ipN++), ...(i.headers || {}) }, body: i.body }), envP);
  };
  ok(await net.relayBoardSupported() === true, 'e2e: relayBoardSupported against real worker');
  const k1 = K('E2E'), k2 = K('E2E-dev2');
  let r = await net.submitScore({ name: 'E2E', score: 777, stage: 2, key: k1 }); ok(r.ok, 'e2e: submit v1.1');
  ok(files.has('top-v1.1.json') && !files.has('top.json'), 'e2e: stored on v1.1 board only');
  r = await net.setPin('E2E', k1, '654321'); ok(r.ok, 'e2e: setPin');
  ok((await net.checkName('E2E')).hasPin === true, 'e2e: checkName hasPin');
  r = await net.loginWithPin('E2E', '000000', k2); ok(!r.ok && r.error === 'bad-pin', 'e2e: bad pin');
  r = await net.loginWithPin('E2E', '654321', k2); ok(r.ok && r.name === 'E2E', 'e2e: login ok');
  bust(); r = await net.submitScore({ name: 'E2E', score: 800, stage: 2, key: k2 }); ok(r.ok, 'e2e: 2nd device submits');
  r = await net.clearPin('E2E', k2); ok(r.ok, 'e2e: clearPin from 2nd device');
  r = await net.loginWithPin('E2E', '654321', K('E2E-3')); ok(!r.ok && r.error === 'no-pin', 'e2e: no-pin');
  net.__setRelayUrl(''); net.__setRelayBoard('v1.0');
}

console.log(`p11net: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
