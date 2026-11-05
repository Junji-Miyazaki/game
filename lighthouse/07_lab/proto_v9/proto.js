// LIGHTHOUSE 試作 v9（縦向き 360×640）。v8 の遊びを縦画面に移し、タイトル・結果・強化パネル・効果音を足した。
'use strict';
const cv = document.getElementById('cv'), c = cv.getContext('2d');
const W = 360, H = 640, GY = 500, CS = 6, END = 9000, GRAV = 520, PMAX = 1400;
const SPEED = 90;   // スクロールの速さ（px/秒）
const PY = 532;     // 下の強化パネルの上端
const FLX = 165;    // 道中の群れの横位置（画面内）
const BOSSX = 180;
const LO_HP = .35;    // 灯りが消えたら灯台の残りの強度をこの倍率にする（ひびが入る）  // 包囲中のボスの横位置（画面中央）
const DPR = Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1);
cv.width = W * DPR; cv.height = H * DPR;
const FONT = '-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif';
const F = (s, w) => (w || 400) + ' ' + s + 'px ' + FONT;

const MAT = { st: { hp: .35, col: [214, 184, 110], pt: 1, f: .5 }, wd: { hp: .8, col: [150, 104, 66], pt: 2, f: .45 }, br: { hp: 2, col: [168, 84, 62], pt: 3, f: .4 }, co: { hp: 3.4, col: [150, 154, 160], pt: 4, f: .35 }, gl: { hp: 1.4, col: [143, 179, 201], pt: 3, f: .4 }, sl: { hp: 6.5, col: [74, 80, 90], pt: 6, f: .25 }, lw: { hp: 60, col: [236, 236, 240], pt: 5, f: .45 }, lr: { hp: 60, col: [196, 78, 70], pt: 5, f: .3 }, lp: { hp: 100, col: [255, 226, 140], pt: 40, f: .3 }, sn: { hp: 22, col: [176, 166, 148], pt: 6, f: .35 }, ck: { hp: 60, col: [240, 232, 200], pt: 30, f: .3 }, lg: { hp: 45, col: [92, 104, 112], pt: 6, f: .3 }, wt: { hp: 40, col: [120, 150, 160], pt: 8, f: .3 } };
const ZONES = [{ x: 0, n: '村' }, { x: 1600, n: '町' }, { x: 3400, n: '都市' }, { x: 5400, n: '工業地帯' }, { x: 7300, n: '岬' }];
const UP = { b1: { name: '仲間', eff: '+8 羽' }, b2: { name: '守り', eff: '体力 +1' }, b3: { name: '攻撃', eff: '威力 +0.8' } };
const KEYS = ['b1', 'b2', 'b3'];
const BEST_KEY = 'lighthouse.v9.best', MUTE_KEY = 'lighthouse.v9.mute';
let S = null, ff = 1;
let best = Number(lsGet(BEST_KEY)) || 0;

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { } }

// ---------- 建物 ----------
function zoneAt(x) { let z = 0; for (let i = 0; i < ZONES.length; i++) if (x >= ZONES[i].x) z = i; return z; }
function mk(x, w, m) { return { x, w: w * CS, cells: new Map(), orig: [], f: MAT[m].f, dirty: 0 }; }
function put(b, r, k, m) { b.cells.set(r * 200 + k, { r, k, m, hp: MAT[m].hp }); }
function fin(b) { for (const q of b.cells.values()) b.orig[q.r] = (b.orig[q.r] || 0) + 1; return b; }
const ri = (a, n) => a + Math.floor(Math.random() * n);
function hut(x) { const w = ri(8, 4), wh = ri(3, 2), b = mk(x, w + 3, 'wd'); for (let r = 0; r < wh; r++) for (let k = 1; k <= w; k++) put(b, r, k, 'wd'); for (let r = 0; r < w / 2 + 1; r++) for (let k = r; k <= w + 1 - r; k++) put(b, wh + r, k, 'st'); return fin(b); }
function house(x) { const w = ri(10, 5), wh = ri(6, 4), b = mk(x, w, 'wd'); for (let r = 0; r < wh; r++) for (let k = 0; k < w; k++) put(b, r, k, 'wd'); for (let r = 0; r < w / 2; r++) for (let k = r; k < w - r; k++) put(b, wh + r, k, 'br'); for (let r = 0; r < 3; r++) put(b, wh + 2 + r, w - 3, 'br'); return fin(b); }
function brick(x) { const w = ri(9, 6), h = ri(9, 10), b = mk(x, w, 'br'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 4 === 2 && k % 3 === 1) ? 'gl' : 'br'); return fin(b); }
function tower(x, glass, tall) { const w = ri(7, 6), h = tall ? ri(20, 14) : ri(15, 13), b = mk(x, w, glass ? 'gl' : 'co'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, glass ? ((k === 0 || k === w - 1 || r % 6 === 0) ? 'co' : 'gl') : 'co'); return fin(b); }
function pylon(x) { const b = mk(x, 17, 'sl'); for (let r = 0; r < 27; r++) { const hw = Math.max(1, Math.round(6 - r * .18)); for (let k = -hw; k <= hw; k++) { if (Math.abs(k) < hw - 1 && r % 3) continue; put(b, r, k + 8, 'sl'); } } return fin(b); }
function light(x) { const b = mk(x, 19, 'lw'); b.light = 1; for (let r = 0; r < 46; r++) { const hw = r > 41 ? 3 : r > 38 ? 5 : Math.round(9 - r * .1); for (let k = -hw; k <= hw; k++) put(b, r, k + 9, r > 41 ? 'lp' : (r > 38 ? 'lr' : (Math.floor(r / 7) % 2 ? 'lr' : 'lw'))); } return fin(b); }
function clock(x) { const b = mk(x, 17, 'sn'); b.boss = 1; b.core = 'ck'; b.name = '時計塔'; for (let r = 0; r < 25; r++) { const hw = r < 17 ? 8 : r < 19 ? 6 : Math.max(0, Math.round(5 - (r - 19) * .9)); for (let k = -hw; k <= hw; k++) { let m = 'sn'; if (r >= 10 && r <= 15 && Math.abs(k) <= 3) m = 'ck'; else if (r < 8 && r % 4 >= 1 && r % 4 <= 2 && Math.abs(k) % 4 === 2) m = 'gl'; put(b, r, k + 8, m); } } return fin(b); }
function water(x) { const b = mk(x, 18, 'lg'); b.boss = 1; b.core = 'wt'; b.name = '給水塔'; for (let r = 0; r < 12; r++) for (let k = 0; k < 18; k++) { const leg = k <= 2 || k >= 15 || (k >= 7 && k <= 10); if (leg || ((r === 5 || r === 10) && k % 2 === 0)) put(b, r, k, 'lg'); } for (let r = 12; r < 22; r++) for (let k = 0; k < 18; k++) put(b, r, k, 'wt'); for (let r = 22; r < 26; r++) for (let k = r - 21; k < 18 - (r - 21); k++) put(b, r, k, 'lg'); return fin(b); }

// ---------- 1ランの準備 ----------
function reset(mode) {
  S = {
    mode, x: 0, t: 0, inc: [], birds: [], blds: [], chunks: [], wild: [], parts: [], pops: [], txt: [],
    pts: 60, score: 0, armor: 0, atk: 1.6, lv: { b1: 0, b2: 0, b3: 0 }, cost: { b1: 25, b2: 40, b3: 45 }, flash: { b1: 0, b2: 0, b3: 0 },
    cid: 0, zone: -1, sb: -1, bi: 0, shake: 0, banner: null, lost: 0, lostT: 0, peak: 40, endT: 0, lightOut: 0, dark: 0,
    ft: 0, gt: 0, rot: 0, sc: 1, fx: null, fy: null, siege: 0, win: 0, over: 0, bonus: 0, newBest: 0, killed: [],
  };
  for (let i = 0; i < 40; i++) addBird(60 + Math.random() * 80, GY - 280 + Math.random() * 120);
  const BX = [3150, 6950]; let x = 420;
  while (x < END - 700) {
    if (BX.some(v => x > v - 80 && x < v + 300)) { x += 40; continue; }
    const z = zoneAt(x), r = Math.random(); let b;
    if (z === 0) b = r < .6 ? hut(x) : house(x);
    else if (z === 1) b = r < .45 ? house(x) : brick(x);
    else if (z === 2) b = r < .3 ? brick(x) : tower(x, r < .7);
    else if (z === 3) b = r < .45 ? pylon(x) : tower(x, r < .75, true);
    else b = r < .6 ? house(x) : hut(x);
    S.blds.push(b); x += b.w + 30 + Math.random() * (z < 2 ? 60 : 100);
    if (Math.random() < (z < 2 ? .6 : .4)) S.wild.push({ at: x - 20, n: ri(5, 7) });
  }
  S.L = light(END); S.L.boss = 1; S.L.core = 'lp'; S.L.name = '灯台'; S.L.final = 1; S.L.n0 = S.L.cells.size;
  const b1 = clock(BX[0]), b2 = water(BX[1]);
  S.blds.push(b1, b2, S.L); S.bossList = [b1, b2, S.L];
  for (const B of S.bossList) B.core0 = coreLeft(B);
}
function start() { reset('play'); sfx('start'); }
function addBird(x, y, vx, vy) { S.birds.push({ x: S.x + x, y, vx: vx || 0, vy: vy || 0, hp: 2 + S.armor, st: 0, ph: Math.random() * 6, stun: 0, cd: Math.random() * 2 }); }
function aliveN() { let n = 0; for (const b of S.birds) if (b.st !== 2) n++; return n; }
function buy(k) {
  if (S.mode !== 'play') return false;
  if (S.pts < S.cost[k]) { S.flash[k] = -.35; sfx('deny'); return false; }
  S.pts -= S.cost[k]; S.lv[k]++;
  if (k === 'b1') for (let i = 0; i < 8; i++) addBird(30 + Math.random() * 80, GY - 300 + Math.random() * 100);
  if (k === 'b2') { S.armor++; for (const b of S.birds) b.hp++; }
  if (k === 'b3') S.atk += .8;
  S.cost[k] = Math.round(S.cost[k] * 1.55); S.flash[k] = .35; sfx('buy');
  return true;
}
function banner(a, b) { S.banner = { a, b, t: 0, d: 2.4 }; }
function finish() { if (S.score > best) { best = S.score; S.newBest = 1; lsSet(BEST_KEY, best); } }

// ---------- 当たりと崩落 ----------
function cellAt(wx, wy) { for (const b of S.blds) { if (wx < b.x || wx >= b.x + b.w) continue; const k = Math.floor((wx - b.x) / CS), r = Math.floor((GY - wy) / CS); if (r < 0) continue; const q = b.cells.get(r * 200 + k); if (q) return { b, q }; } return null; }
function part(x, y, vx, vy, col, s) { if (S.parts.length >= PMAX) S.parts.shift(); S.parts.push({ x, y, vx, vy, t: 0, col, s }); }
const rgb = m => 'rgb(' + MAT[m].col.join(',') + ')';
function kill(b, q, mul) { const key = q.r * 200 + q.k; if (!b.cells.has(key)) return; b.cells.delete(key); b.dirty = 1; S.score += Math.round(MAT[q.m].pt * (mul || 1)); S.pts += MAT[q.m].pt * .7 * (mul || 1); part(b.x + q.k * CS, GY - (q.r + 1) * CS, -40 + Math.random() * 90, -70 * Math.random(), rgb(q.m), CS * .8); }
function detach(b, list, tip) {
  if (!list.length) return; let sx = 0, sy = 0;
  for (const q of list) { b.cells.delete(q.r * 200 + q.k); sx += b.x + (q.k + .5) * CS; sy += GY - (q.r + .5) * CS; }
  b.dirty = 1; const cx = sx / list.length, cy = sy / list.length;
  if (list.length < 4) { for (const q of list) part(b.x + q.k * CS, GY - (q.r + 1) * CS, 0, 0, rgb(q.m), CS * .8); return; }
  let R = 0; const cells = list.map(q => { const lx = b.x + (q.k + .5) * CS - cx, ly = GY - (q.r + .5) * CS - cy; R = Math.max(R, Math.hypot(lx, ly)); return { lx, ly, m: q.m }; });
  S.chunks.push({ id: ++S.cid, src: b, x: cx, y: cy, vx: 0, vy: 0, a: 0, w: tip, cells, R, t: 0 });
}
// 地面とつながらない部分と、支えきれない段より上を切り離して倒す
function structural(b) {
  b.dirty = 0; if (!b.cells.size) return; const seen = new Set(), st = [];
  for (const [key, q] of b.cells) if (q.r === 0) { seen.add(key); st.push(q); }
  while (st.length) { const q = st.pop(); for (const [a, e] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const key = (q.r + a) * 200 + q.k + e; if (!seen.has(key) && b.cells.has(key)) { seen.add(key); st.push(b.cells.get(key)); } } }
  const loose = []; for (const [key, q] of b.cells) if (!seen.has(key)) loose.push(q); if (loose.length) detach(b, loose, (Math.random() - .5) * .6);
  let top = -1; const cnt = [], mn = [], mx = [], sk = [];
  for (const q of b.cells.values()) { const r = q.r; top = Math.max(top, r); cnt[r] = (cnt[r] || 0) + 1; sk[r] = (sk[r] || 0) + q.k; mn[r] = Math.min(mn[r] ?? 99, q.k); mx[r] = Math.max(mx[r] ?? -99, q.k); }
  let aN = 0, aK = 0; const cumN = [], cumK = [];
  for (let r = top; r >= 0; r--) { cumN[r] = aN; cumK[r] = aK; aN += cnt[r] || 0; aK += sk[r] || 0; }
  for (let r = 0; r < top; r++) {
    const n = cnt[r] || 0; if (!n || !cumN[r]) continue; const com = cumK[r] / cumN[r], mid = (mn[r] + mx[r]) / 2;
    const weak = n / b.orig[r] < b.f, off = com < mn[r] - .5 || com > mx[r] + .5;
    if (weak || off) { const up = []; for (const q of b.cells.values()) if (q.r > r) up.push(q); detach(b, up, Math.sign(com - mid || Math.random() - .5) * (off ? .9 : .35)); break; }
  }
}
function hurtBird(bd, vx, vy) { bd.hp--; if (bd.hp <= 0) { bd.st = 2; bd.vx = vx; bd.vy = vy; S.lost++; S.lostT = .5; } }
function stepChunks(dt) {
  for (let i = S.chunks.length - 1; i >= 0; i--) {
    const ch = S.chunks[i]; ch.t += dt; ch.vy += GRAV * dt; ch.x += ch.vx * dt; ch.y += ch.vy * dt;
    ch.w *= 1 + dt * 1.2; ch.w = Math.max(-3, Math.min(3, ch.w)); ch.a += ch.w * dt;
    const ca = Math.cos(ch.a), sa = Math.sin(ch.a); let hit = null;
    if (ch.t > .04) for (const q of ch.cells) { const wx = ch.x + q.lx * ca - q.ly * sa, wy = ch.y + q.lx * sa + q.ly * ca + CS / 2; if (wy >= GY) { hit = { g: 1 }; break; } const h = cellAt(wx, wy); if (h && !(h.b === ch.src && ch.t < .45)) { hit = h; break; } }
    for (const bd of S.birds) { if (bd.st === 2 || bd.hitBy === ch.id) continue; if (Math.hypot(bd.x - ch.x, bd.y - ch.y) < ch.R * .6) { bd.hitBy = ch.id; hurtBird(bd, ch.vx, ch.vy); } }
    if (hit) {
      const sp = Math.hypot(ch.vx, ch.vy); let gain = 0;
      for (const q of ch.cells) { const wx = ch.x + q.lx * ca - q.ly * sa, wy = ch.y + q.lx * sa + q.ly * ca; const p = Math.round(MAT[q.m].pt * .8); S.score += p; gain += p; S.pts += MAT[q.m].pt * .5; part(wx, wy, ch.vx * .3 + (Math.random() - .5) * 120 + q.lx * 2, -Math.random() * sp * .35, rgb(q.m), CS * .8); }
      if (hit.b) { let dmg = ch.cells.length * sp * .004; const q = hit.q; for (const [a, e] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { if (dmg <= 0) break; const n = hit.b.cells.get((q.r + a) * 200 + q.k + e); if (n) { const d = Math.min(dmg, n.hp + .01); n.hp -= d; dmg -= d; if (n.hp <= 0) kill(hit.b, n); } } }
      const n = ch.cells.length; S.shake = Math.min(9, S.shake + n * .06); sfx('crash', n);
      if (gain >= 8) S.txt.push({ x: ch.x, y: Math.min(GY - 20, ch.y), s: '+' + gain, t: 0 });
      S.chunks.splice(i, 1);
    }
  }
}
function exposed(b) { const e = []; for (const q of b.cells.values()) { if (!b.cells.has(q.r * 200 + q.k - 1) || !b.cells.has(q.r * 200 + q.k + 1) || !b.cells.has((q.r + 1) * 200 + q.k)) e.push(q); } return e; }
function impact(b, nx, ny, hit) {
  const q = hit.q; q.hp -= S.atk;
  if (q.hp <= 0) { let left = -q.hp; kill(hit.b, q); for (const [a, e] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]]) { if (left <= 0) break; const n = hit.b.cells.get((q.r + a) * 200 + q.k + e); if (n) { n.hp -= left * .6; if (n.hp <= 0) { left = -n.hp; kill(hit.b, n); } } } sfx('hit'); return true; }
  S.pops.push({ x: nx, y: ny, t: 0 }); sfx('tick');
  hurtBird(b, -60, -40);
  if (b.st !== 2) { b.vx = -b.vx * .6 - 60 * Math.sign(b.vx || 1); b.vy = -80 + Math.random() * 60; b.stun = .3; }
  return false;
}

// ---------- 群れ ----------
// 編隊の形：V字 → 帯 → 球 を 7 秒ごとに入れ替える。縦画面なので横は詰め、縦に広げる
function slot(i, N, t) { const sh = (t / 7) % 3, k = Math.floor(sh), u = sh - k, w = u < .75 ? 0 : (u - .75) / .25, e = w * w * (3 - 2 * w); const A = shape(k % 3, i, N, t), B = shape((k + 1) % 3, i, N, t); return [(A[0] + (B[0] - A[0]) * e) * .7, (A[1] + (B[1] - A[1]) * e) * 1.4]; }
function shape(k, i, N, t) {
  if (k === 0) { const row = Math.floor((i + 1) / 2), side = i % 2 ? 1 : -1, sp = Math.min(9, 170 / Math.max(1, N / 2)); return [-row * sp + 50, side * row * sp * .7]; }
  if (k === 1) { const u = (i * 0.618034) % 1; const x = -u * 210 + 70; return [x, Math.sin(x * .025 + t * 1.3) * 28 + ((i * 7) % 11 - 5) * 3]; }
  const r = Math.sqrt((i + .5) / N) * Math.min(110, 22 + Math.sqrt(N) * 9), a = i * 2.39996; return [Math.cos(a) * r, Math.sin(a) * r * .7];
}
function pickTarget(wx, wy, near) {
  let best = null, bd = 1e9; const cand = [];
  for (const b of S.blds) {
    if (!b.cells.size || b.x > wx + (near ? 160 : 220) || b.x + b.w < wx - (near ? 160 : 60)) continue;
    if (b.boss && b !== S.boss) continue; if (S.siege && b !== S.boss) continue;
    let top = 0; for (const q of b.cells.values()) top = Math.max(top, q.r);
    for (const q of exposed(b)) { const cx = b.x + (q.k + .5) * CS, cy = GY - (q.r + .5) * CS; if (near) { const d = Math.hypot(cx - wx, cy - wy); if (d < bd) { bd = d; best = { b, q }; } } else if (q.r <= top * .4 || Math.random() < .25) cand.push({ b, q }); }
  }
  if (near) return bd < 200 ? best : null; return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function siegeTarget(bd) {
  const B = S.boss, ex = exposed(B); if (!ex.length) return null; let top = 0; for (const q of ex) top = Math.max(top, q.r);
  if (Math.random() < (S.lightOut ? .6 : .35)) { const lo = ex.filter(q => q.r <= top * .35); if (lo.length) return { b: B, q: lo[Math.floor(Math.random() * lo.length)] }; }
  let best = null, bdist = 1e9; for (const q of ex) { const d = Math.hypot(B.x + (q.k + .5) * CS - bd.x, GY - (q.r + .5) * CS - bd.y) + Math.random() * 50; if (d < bdist) { bdist = d; best = q; } } return { b: B, q: best };
}
// 灯台が崩れきった：立っているマスが最初の 25% 以下で、落ちている塊もない
function demolished() { const L = S.L; if (L.cells.size > L.n0 * .25) return false; for (const ch of S.chunks) if (ch.src === L) return false; return true; }
function coreLeft(B) { let n = 0; for (const q of B.cells.values()) if (q.m === B.core) n++; for (const ch of S.chunks) if (ch.src === B) for (const q of ch.cells) if (q.m === B.core) n++; return n; }

// ---------- 1コマ進める ----------
function step(dt) {
  const play = S.mode === 'play';
  if (play) S.t += dt;
  const L = S.L, B = S.bossList[S.bi], stop = B.x + B.w / 2 - BOSSX;
  if (S.banner) { S.banner.t += dt; if (S.banner.t > S.banner.d) S.banner = null; }
  S.shake = Math.max(0, S.shake - dt * 25); S.lostT = Math.max(0, S.lostT - dt);
  for (const k of KEYS) S.flash[k] = S.flash[k] > 0 ? Math.max(0, S.flash[k] - dt) : Math.min(0, S.flash[k] + dt);
  if (play && !S.win) S.x = Math.min(stop, S.x + dt * SPEED);
  S.siege = play && S.x >= stop - .5 ? 1 : 0; S.boss = B;
  const drift = play && !S.siege ? SPEED : 0;
  if (play) {
    const z = zoneAt(S.x + FLX + 120);
    if (z !== S.zone) { S.zone = z; if (!S.siege) banner(ZONES[z].n, '第' + (z + 1) + '区'); }
    if (S.siege && S.sb !== S.bi) { S.sb = S.bi; banner(B.name, B.final ? '最後の灯台 — ランプを壊して灯りを消せ' : '中ボス — 包囲して光る核を壊せ'); sfx('warn'); }
  }
  let topB = 0; for (const q of B.cells.values()) topB = Math.max(topB, q.r);
  const LX = S.x + FLX, lcx = B.x + B.w / 2, lcy = GY - Math.max(60, topB * CS * .55) + 40;
  // 合流：画面の外から飛んでくる
  if (play) for (const w of S.wild) {
    if (w.got || S.x + FLX + 100 < w.at) continue; w.got = 1;
    const e = Math.random(), side = e < .4 ? 'top' : e < .75 ? 'right' : 'left';
    const bx = side === 'right' ? S.x + W + 30 : side === 'left' ? S.x - 30 : S.x + 40 + Math.random() * 280, by = side === 'top' ? -25 : GY - 380 + Math.random() * 200;
    for (let i = 0; i < w.n; i++) S.inc.push({ x: bx + (Math.random() - .5) * 40, y: by + (Math.random() - .5) * 30, vx: side === 'right' ? -140 : side === 'left' ? 220 : (Math.random() - .5) * 60, vy: side === 'top' ? 140 : (Math.random() - .5) * 40, ph: Math.random() * 6, t: 0 });
    sfx('caw');
  }
  for (let i = S.inc.length - 1; i >= 0; i--) {
    const q = S.inc[i]; q.t += dt; const tx = (S.fx ?? LX) + Math.sin(q.ph) * 30, ty = (S.fy ?? GY - 210) + Math.cos(q.ph) * 20, dx = tx - q.x, dy = ty - q.y, d = Math.hypot(dx, dy) || 1, sp = 230;
    q.vx += (dx / d * sp + drift - q.vx) * dt * 2.2; q.vy += (dy / d * sp - q.vy) * dt * 2.2; q.x += q.vx * dt; q.y += q.vy * dt;
    if (d < 45 || q.t > 6) { addBird(q.x - S.x, q.y, q.vx, q.vy); S.inc.splice(i, 1); }
  }
  S.ft += dt; S.gt -= dt; const gather = S.gt > 0; S.rot += dt * .75; S.ringY = Math.max(130, GY - (topB + 1) * CS - 55);
  const fyT = gather ? S.gy : (S.siege ? lcy - 40 : GY - 230 + Math.sin(S.ft * .35) * 70), fxT = gather ? S.gx : (S.siege ? lcx : LX);
  S.fx = (S.fx ?? LX) + (fxT - (S.fx ?? LX)) * Math.min(1, dt * (gather ? 2.4 : 1.2)); S.fy = (S.fy ?? GY - 210) + (fyT - (S.fy ?? GY - 210)) * Math.min(1, dt * (gather ? 2.4 : 1));
  const breath = gather ? .42 : (S.siege ? 1.5 : 1 + .38 * Math.sin(S.ft * .55)); S.sc += (breath - S.sc) * Math.min(1, dt * 2);
  const N = aliveN(); let idx = 0; S.peak = Math.max(S.peak, N);
  for (let i = S.birds.length - 1; i >= 0; i--) {
    const b = S.birds[i];
    if (b.st === 2) { b.vy += 300 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot = (b.rot || 0) + dt * 6; if (b.y > H + 20) S.birds.splice(i, 1); continue; }
    const my = idx++;
    if (b.stun > 0) { b.stun -= dt; b.vy += 200 * dt; }
    else if (b.st === 1) { const T = b.tg; if (!T.b.cells.has(T.q.r * 200 + T.q.k)) b.st = 0; else { const gx = T.b.x + (T.q.k + .5) * CS, gy = GY - (T.q.r + .5) * CS, dx = gx - b.x, dy = gy - b.y, d = Math.hypot(dx, dy) || 1; b.vx += (dx / d * 400 - b.vx) * dt * 5; b.vy += (dy / d * 400 - b.vy) * dt * 5; } }
    else {
      let tx, ty;
      if (S.siege && !gather) {
        // 包囲：ボスの上空を輪になって回り、輪のあちこちから突っ込む
        const ang = S.rot + 6.2832 * my / Math.max(1, N), lane = (my % 3) - 1, R = (95 + Math.min(55, N * .2)) * (1 + .12 * Math.sin(S.ft * .8)) + lane * 12;
        b.depth = Math.sin(ang); tx = lcx + Math.cos(ang) * R; ty = S.ringY + Math.sin(ang) * R * .35 + lane * 10 + Math.sin(S.ft * 2 + b.ph) * 3;
      } else { const sl = slot(my, N, S.ft); tx = S.fx + sl[0] * S.sc + Math.sin(S.ft * 1.7 + b.ph) * 4; ty = S.fy + sl[1] * S.sc + Math.cos(S.ft * 1.3 + b.ph) * 4; b.depth = null; }
      ty = Math.max(84, ty);
      const k = gather ? 4 : 2.2; b.vx += ((tx - b.x) * k - b.vx) * dt * 3 + drift * dt * 3; b.vy += ((ty - b.y) * k - b.vy) * dt * 3;
      b.cd -= dt;
      if (b.cd < 0 && play && !S.win) { const T = gather ? pickTarget(S.gx, S.gy, 1) : (S.siege ? siegeTarget(b) : pickTarget(b.x, b.y, 0)); if (T) { b.tg = T; b.st = 1; } b.cd = gather ? .3 + Math.random() * .7 : (S.siege ? .5 + Math.random() * 1.1 : 1.2 + Math.random() * 2.4); }
    }
    const vm = Math.hypot(b.vx, b.vy), cap = b.st === 1 ? 440 : 300; if (vm > cap) { b.vx *= cap / vm; b.vy *= cap / vm; }
    const nx = b.x + b.vx * dt, ny = Math.min(GY - 2, b.y + b.vy * dt); const hit = cellAt(nx, ny);
    if (hit) { if (impact(b, nx, ny, hit)) { b.x = nx; b.y = ny; b.vx *= .9; if (b.st === 1) { b.st = 0; b.stun = .2; b.vy = -90; } } else if (b.st === 1) b.st = 0; }
    else { b.x = nx; b.y = ny; }
    if (b.y >= GY - 2) b.vy = -140;
  }
  for (const b of S.blds) if (b.dirty) structural(b);
  stepChunks(dt);
  for (let i = S.parts.length - 1; i >= 0; i--) { const p = S.parts[i]; p.t += dt; if (p.y < GY) { p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y >= GY) { p.y = GY - p.s * Math.random(); p.vx = 0; p.vy = 0; } } if (p.t > 6) S.parts.splice(i, 1); }
  for (let i = S.pops.length - 1; i >= 0; i--) { S.pops[i].t += dt; if (S.pops[i].t > .4) S.pops.splice(i, 1); }
  for (let i = S.txt.length - 1; i >= 0; i--) { const q = S.txt[i]; q.t += dt; q.y -= dt * 30; if (q.t > 1.1) S.txt.splice(i, 1); }
  S.lamp = coreLeft(L);
  if (play && !S.win) {
    if (!aliveN() && !S.inc.length) { S.mode = 'over'; S.over = 1; S.endT = 0; finish(); sfx('over'); return; }
    if (!coreLeft(B) && !B.dead) {
      if (!B.final) {
        B.dead = 1; S.killed.push(B.name); S.score += 250; S.pts += 60; S.shake = 10; sfx('boss');
        const rest = [...B.cells.values()]; if (rest.length) detach(B, rest, (Math.random() - .5) * 1.2); S.bi++; banner(B.name + ' 撃破', '+250 点  +60 ポイント');
      } else if (!S.lightOut) {
        // ランプが消えても終わらない。灯台を崩しきるまで包囲を続ける
        S.lightOut = 1; for (const q of L.cells.values()) q.hp *= LO_HP; S.score += 500; S.shake = 10; sfx('lightout'); banner('LIGHT OUT', '灯りは消えた — 灯台を崩しきれ  +500 点');
      }
    }
    if (S.lightOut && demolished()) {
      L.dead = 1; S.killed.push('灯台'); S.score += 500; S.shake = 14;
      const rest = [...L.cells.values()]; if (rest.length) detach(L, rest, (Math.random() - .5) * 1.4);
      S.win = 1; S.mode = 'win'; S.endT = 0; S.bonus = aliveN() * 10; S.score += S.bonus; finish(); sfx('boss'); sfx('win');
    }
  }
  if (S.lightOut) S.dark = Math.min(1, S.dark + dt * .25);
  if (S.mode === 'over' || S.mode === 'win') S.endT += dt;
}

// ---------- 音（WebAudio で合成。ファイルは使わない） ----------
// 方針：旋律のある BGM は置かない。群れの羽音の層と、電子音の鳴き声（甲高く震える叫び）で不穏さを出す。
let AC = null, MG = null, NB = null, FL = null, muted = lsGet(MUTE_KEY) === '1', lastHit = 0, shT = 1, quietT = 0, flT = 0;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const A = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!A) return;
  try {
    AC = new A(); MG = AC.createGain(); MG.gain.value = muted ? 0 : .7; MG.connect(AC.destination);
    NB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    wind(); flutterInit();
  } catch (e) { AC = null; }
}
function nz(dur, type, f, q, vol, f2) { const t = AC.currentTime, s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = NB; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0005, t + dur); s.connect(fl); fl.connect(g); g.connect(MG); s.start(t, Math.random() * .5); s.stop(t + dur + .02); }
function tone(f, dur, vol, type, f2, delay) { const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0005, t + dur); o.connect(g); g.connect(MG); o.start(t); o.stop(t + dur + .02); }
// 風：ゆっくり揺れる低いノイズ（常時、小さく）
function wind() { const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain(); s.buffer = NB; s.loop = true; fl.type = 'lowpass'; fl.frequency.value = 420; lfo.frequency.value = .13; lg.gain.value = 180; lfo.connect(lg); lg.connect(fl.frequency); g.gain.value = .03; s.connect(fl); fl.connect(g); g.connect(MG); s.start(); lfo.start(); }
// 羽音：ノイズを速さの違う3つの揺れで細かく震わせる。群れが多いほど大きい
function flutterInit() {
  const s = AC.createBufferSource(), bp = AC.createBiquadFilter(), am = AC.createGain(), out = AC.createGain();
  s.buffer = NB; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = .7; am.gain.value = .5;
  for (const [f, a] of [[13, .3], [17.7, .2], [9.1, .15]]) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; g.gain.value = a; o.connect(g); g.connect(am.gain); o.start(); }
  out.gain.value = 0; s.connect(bp); bp.connect(am); am.connect(out); out.connect(MG); s.start(); FL = { out };
}
// 鳴き声：のこぎり波と矩形波を帯域で絞り、音程を跳ね上げてから落とし、速く震わせる（電子的な鳥の叫び）
function shriek(pitch, vol, dur, pan, delay) {
  const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), o2 = AC.createOscillator(), bp = AC.createBiquadFilter(), g = AC.createGain(), vib = AC.createOscillator(), vg = AC.createGain();
  o.type = 'sawtooth'; o2.type = 'square';
  for (const [osc, m] of [[o, 1], [o2, 1.007]]) { const f = osc.frequency; f.setValueAtTime(pitch * .75 * m, t); f.exponentialRampToValueAtTime(pitch * 1.3 * m, t + dur * .25); f.exponentialRampToValueAtTime(pitch * .6 * m, t + dur); }
  vib.frequency.value = 18 + Math.random() * 20; vg.gain.value = pitch * .05; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
  bp.type = 'bandpass'; bp.frequency.value = pitch * 2; bp.Q.value = 2.5;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .015); g.gain.setValueAtTime(vol * .8, t + dur * .5); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
  o.connect(bp); o2.connect(bp); bp.connect(g);
  let end = g; if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); end = p; }
  end.connect(MG);
  for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur + .03); }
}
function cry(n, spread, delay) { for (let i = 0; i < n; i++) shriek(900 + Math.random() * 900, .045 + Math.random() * .035, .18 + Math.random() * .25, (Math.random() * 2 - 1) * .8, (delay || 0) + Math.random() * spread); }
// 毎フレーム：羽音の大きさを群れの数に合わせ、ときどき鳴かせる。灯りが消えた直後は一度静まり、そのあと一斉に鳴く
function audioTick(dt) {
  if (!AC || muted) return;
  flT -= dt; if (flT < 0 && FL) { flT = .2; FL.out.gain.setTargetAtTime(Math.min(.22, .02 * Math.sqrt(aliveN() + S.inc.length)), AC.currentTime, .3); }
  if (quietT > 0) { quietT -= dt; if (quietT <= 0) cry(12, 1.4); return; }
  if (S.mode !== 'play' || !aliveN()) return;
  shT -= dt; if (shT < 0) { cry(S.siege ? 2 : 1, .15); shT = S.siege ? .25 + Math.random() * .5 : .6 + Math.random() * 1.6; }
}
function sfx(k, n) {
  if (!AC || muted) return; const now = AC.currentTime;
  try {
    if (k === 'hit') { if (now - lastHit < .035) return; lastHit = now; nz(.07, 'bandpass', 700 + Math.random() * 700, 1.2, .16); }
    else if (k === 'tick') { if (now - lastHit < .05) return; lastHit = now; nz(.035, 'highpass', 2500, 1, .05); }
    else if (k === 'crash') nz(Math.min(1.3, .3 + n * .012), 'lowpass', Math.min(900, 300 + n * 4), .7, Math.min(.5, .14 + n * .005), 60);
    else if (k === 'buy') { tone(660, .12, .08, 'triangle'); tone(990, .16, .06, 'triangle', 0, .07); }
    else if (k === 'deny') tone(170, .12, .06, 'square');
    else if (k === 'warn') { tone(70, 1.6, .18, 'sine', 55); cry(6, .7); }
    else if (k === 'boss') { tone(110, 1.2, .3, 'sine', 40); nz(1.4, 'lowpass', 600, .7, .4, 50); }
    else if (k === 'lightout') { tone(90, 1.8, .28, 'sine', 35); nz(1.6, 'lowpass', 500, .7, .3, 40); quietT = 1.8; }
    else if (k === 'caw') cry(3, .4);
    else if (k === 'over') tone(110, 1.8, .14, 'sine', 50);
    else if (k === 'win') cry(16, 2.6, .4);
    else if (k === 'start') cry(4, .5);
  } catch (e) { }
}
function toggleMute() { muted = !muted; if (MG) MG.gain.value = muted ? 0 : .7; lsSet(MUTE_KEY, muted ? '1' : '0'); }

// ---------- 操作 ----------
const R_SPD = { x: 268, y: 17, w: 36, h: 36 }, R_SND = { x: 312, y: 17, w: 36, h: 36 };
const inR = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function btnRect(i) { return { x: 12 + i * 115, y: PY + 38, w: 106, h: 64 }; }
function tap(x, y) {
  if (inR(x, y, R_SND)) { toggleMute(); return; }
  if (S.mode === 'title') { start(); return; }
  if (S.mode === 'over' || S.mode === 'win') { if (S.endT > endWait()) start(); return; }
  if (inR(x, y, R_SPD)) { ff = ff === 1 ? 2 : 1; return; }
  if (y >= PY) { KEYS.forEach((k, i) => { if (inR(x, y, btnRect(i))) buy(k); }); return; }
  S.gx = S.x + x; S.gy = Math.max(90, Math.min(GY - 6, y)); S.gt = 2.5;
  for (const b of S.birds) if (b.st === 1 && Math.random() < .5) b.st = 0;
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); audioInit();
  const r = cv.getBoundingClientRect(); tap((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
});
document.addEventListener('visibilitychange', () => { if (!AC) return; if (document.hidden) AC.suspend(); else AC.resume(); });

// ---------- 描画 ----------
// 色：落ち着いた灰と夕暮れの空に、アクセントは琥珀色1色。UI は角の丸い半透明の板にまとめる
const UI = { acc: '#F2B84B', accD: 'rgba(242,184,75,.16)', ink: '#F3F4F6', sub: '#9AA1AB', dim: '#5A606B', card: 'rgba(14,16,20,.46)', red: '#E0604A', panel: '#121419', btn: '#1C1F26', btnOn: '#262B34' };
const mix = (a, b, u) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',') + ')';
const mixA = (a, b, u, al) => 'rgba(' + a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',') + ',' + al + ')';
function rr(x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
function txt(s, x, y, size, col, weight, align) { c.font = F(size, weight); c.fillStyle = col; c.textAlign = align || 'left'; c.fillText(s, x, y); }
function spaced(s, x, y, size, col, gap, weight) { c.font = F(size, weight || 700); c.fillStyle = col; c.textAlign = 'left'; let w = 0; for (const ch of s) w += c.measureText(ch).width + gap; w -= gap; let px = x - w / 2; for (const ch of s) { c.fillText(ch, px, y); px += c.measureText(ch).width + gap; } }
function bird(x, y, s, ang, fold, rot, col) { c.save(); c.translate(x, y); c.rotate(rot); c.strokeStyle = col; c.lineWidth = 1.8; c.lineCap = 'round'; c.lineJoin = 'round'; const sp = s * (1 - fold * .7), ex = sp * .5, ey = -Math.sin(ang) * s * .55, ty = -Math.sin(ang) * s * .2 + s * .25 * Math.max(0, ang); c.beginPath(); c.moveTo(-sp, ty); c.lineTo(-ex, ey); c.lineTo(0, 0); c.lineTo(ex, ey); c.lineTo(sp, ty); c.stroke(); c.restore(); }
const fmtT = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function lstop() { return S.L.x + S.L.w / 2 - BOSSX; }
const wrapX = (base, cam, k, span) => ((base - cam * k) % span + span) % span - (span - W) / 2;

// 小さな線画アイコン（強化・音・得点の印）
function icon(k, x, y, col) {
  c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.7; c.lineCap = 'round'; c.lineJoin = 'round';
  if (k === 'b1') { c.restore(); bird(x - 3, y + 3, 4.6, .55, 0, 0, col); bird(x + 4, y - 3, 4, .55, 0, 0, col); return; }
  if (k === 'b2') { c.beginPath(); c.moveTo(0, -7); c.lineTo(6, -4.5); c.lineTo(5.5, 1); c.quadraticCurveTo(4, 5.5, 0, 7.5); c.quadraticCurveTo(-4, 5.5, -5.5, 1); c.lineTo(-6, -4.5); c.closePath(); c.stroke(); }
  if (k === 'b3') { c.beginPath(); c.moveTo(-5, -5); c.lineTo(4, 4); c.moveTo(4.5, -1.5); c.lineTo(4.5, 4.5); c.lineTo(-1.5, 4.5); c.stroke(); }
  if (k === 'coin') { c.beginPath(); c.moveTo(0, -4.5); c.lineTo(3.8, 0); c.lineTo(0, 4.5); c.lineTo(-3.8, 0); c.closePath(); c.fill(); }
  if (k === 'snd' || k === 'mute') { c.beginPath(); c.moveTo(-6, -2.5); c.lineTo(-3, -2.5); c.lineTo(1, -6); c.lineTo(1, 6); c.lineTo(-3, 2.5); c.lineTo(-6, 2.5); c.closePath(); c.fill(); c.beginPath(); if (k === 'snd') { c.arc(1, 0, 4, -.8, .8); c.moveTo(4.2, -5.2); c.arc(1, 0, 6.8, -.8, .8); } else { c.moveTo(3.5, -3); c.lineTo(8, 3); c.moveTo(8, -3); c.lineTo(3.5, 3); } c.stroke(); }
  c.restore();
}

function drawSky(t, cam, z, pr) {
  // 空：昼の曇り空から、岬に近づくほど夕暮れへ。3段の色で奥行きを出す
  const g = c.createLinearGradient(0, 0, 0, GY);
  g.addColorStop(0, mix([146, 156, 171], [52, 58, 82], pr)); g.addColorStop(.62, mix([188, 194, 203], [142, 116, 128], pr)); g.addColorStop(1, mix([214, 216, 219], [240, 178, 128], pr));
  c.fillStyle = g; c.fillRect(-20, -20, W + 40, GY + 20);
  // 雲の向こうの太陽のにじみ
  const sy = 170 + pr * 270, rg = c.createRadialGradient(W * .7, sy, 0, W * .7, sy, 190);
  rg.addColorStop(0, 'rgba(255,244,222,' + (.38 + .2 * pr) + ')'); rg.addColorStop(1, 'rgba(255,244,222,0)'); c.fillStyle = rg; c.fillRect(-20, -20, W + 40, GY + 20);
  // 雲：やわらかい楕円を2層、遠い層ほどゆっくり
  for (const [n, k, y0, al, s] of [[5, .06, 130, .16, 1.4], [6, .18, 210, .12, 1]]) {
    c.fillStyle = 'rgba(255,255,255,' + al + ')';
    for (let i = 0; i < n; i++) { const x = wrapX(i * 173 + 40, cam, k, W + 300), y = y0 + ((i * 53) % 90); c.beginPath(); c.ellipse(x, y, 70 * s, 9 * s, 0, 0, 7); c.ellipse(x + 30 * s, y - 6 * s, 40 * s, 8 * s, 0, 0, 7); c.fill(); }
  }
  // 遠い丘の稜線
  const hz = mix([120, 130, 146], [96, 80, 100], pr);
  c.fillStyle = hz; c.globalAlpha = .45; c.beginPath(); c.moveTo(-10, GY);
  for (let x = -10; x <= W + 10; x += 8) { const u = x + cam * .12; c.lineTo(x, GY - 58 - 24 * Math.sin(u * .011) - 12 * Math.sin(u * .029 + 1.3)); }
  c.lineTo(W + 10, GY); c.fill(); c.globalAlpha = 1;
  // 中景：区間ごとの街並みのシルエット
  c.fillStyle = mixA([84, 92, 106], [70, 60, 78], pr, .32);
  for (let i = 0; i < 14; i++) { const x = wrapX(i * 83, cam, .4, W + 200), bh = (z < 2 ? 12 : z < 4 ? 46 : 8) + ((i * 37) % (z < 2 ? 18 : 70)), bw = z < 2 ? 26 : 34 + (i % 3) * 8; c.fillRect(x, GY - bh, bw, bh); }
  // 地平線のもや
  const hg = c.createLinearGradient(0, GY - 90, 0, GY); hg.addColorStop(0, mixA([214, 216, 219], [240, 178, 128], pr, 0)); hg.addColorStop(1, mixA([214, 216, 219], [240, 178, 128], pr, .55));
  c.fillStyle = hg; c.fillRect(-20, GY - 90, W + 40, 90);
  if (S.dark) { c.fillStyle = 'rgba(22,26,40,' + (.5 * S.dark) + ')'; c.fillRect(-20, -20, W + 40, GY + 20); }
}
function drawGround(t, cam, z) {
  const L = S.L, gg = c.createLinearGradient(0, GY, 0, PY + 20);
  gg.addColorStop(0, z === 0 ? '#5F6B4B' : '#4C5157'); gg.addColorStop(1, z === 0 ? '#3A4230' : '#2C3035');
  c.fillStyle = gg; c.fillRect(-20, GY, W + 40, PY - GY + 40);
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(-20, GY, W + 40, 1);
  if (L.x + L.w - cam < W + 200) {
    const sx = L.x + L.w - cam + 40, sg = c.createLinearGradient(0, GY, 0, PY + 20); sg.addColorStop(0, '#5D7287'); sg.addColorStop(1, '#2E3A48');
    c.fillStyle = sg; c.fillRect(sx, GY + 3, W + 40, PY - GY + 40); c.fillStyle = 'rgba(255,255,255,.22)';
    for (let i = 0; i < 7; i++) c.fillRect(sx + ((i * 47 + t * 12) % 220), GY + 9 + (i % 3) * 7, 12 + (i % 2) * 8, 1.2);
  }
}
function drawWorld(t) {
  const cam = S.x, z = zoneAt(cam + 200), L = S.L, pr = Math.min(1, cam / lstop());
  c.save(); c.beginPath(); c.rect(0, 0, W, PY + 24); c.clip();
  if (S.shake > 0) c.translate((Math.random() - .5) * S.shake, (Math.random() - .5) * S.shake);
  drawSky(t, cam, z, pr);
  // 灯台の光
  if (S.lamp && L.x - cam < W + 300) {
    let lx = L.x - cam + 57, ly = GY - 45 * CS; for (const q of L.cells.values()) if (q.m === 'lp') { lx = L.x + q.k * CS - cam; ly = GY - (q.r + 1) * CS; break; }
    const a = Math.sin(t * 1.2), bg = c.createLinearGradient(lx, 0, lx - 560, 0); bg.addColorStop(0, 'rgba(255,236,170,' + (.3 + .3 * pr) + ')'); bg.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = bg; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx - 560, ly - 90 + a * 110); c.lineTo(lx - 560, ly - 10 + a * 110); c.fill();
  }
  const pulse = .5 + .5 * Math.sin(t * 6);
  for (const b of S.blds) {
    if (b.x - cam > W + 10 || b.x + b.w - cam < -10) continue; const hot = S.siege && b === S.boss;
    for (const q of b.cells.values()) {
      const col = MAT[q.m].col, f = Math.max(.5, q.hp / MAT[q.m].hp);
      if (hot && q.m === b.core) c.fillStyle = mix(col, [255, 255, 255], .15 + .35 * pulse);
      else c.fillStyle = 'rgb(' + col.map(v => Math.round(v * (.6 + .4 * f))).join(',') + ')';
      c.fillRect(b.x + q.k * CS - cam, GY - (q.r + 1) * CS, CS - 1, CS - 1);
    }
  }
  for (const ch of S.chunks) { c.save(); c.translate(ch.x - cam, ch.y); c.rotate(ch.a); for (const q of ch.cells) { c.fillStyle = rgb(q.m); c.fillRect(q.lx - CS / 2, q.ly - CS / 2, CS - 1, CS - 1); } c.restore(); }
  drawGround(t, cam, z);
  for (const p of S.parts) { c.fillStyle = p.col; c.fillRect(p.x - cam, p.y, p.s, p.s); }
  for (const q of S.inc) bird(q.x - cam, q.y, 6.5, Math.sin(t * 16 + q.ph) * .65, 0, Math.atan2(q.vy, Math.abs(q.vx) + 1) * .5 * Math.sign(q.vx || 1), '#3A4048');
  for (const b of S.birds) bird(b.x - cam, b.y, b.st === 0 && b.depth != null ? 7 * (1 + .28 * b.depth) : 7, b.st === 2 ? .1 : b.st === 1 ? 0 : Math.sin(t * 14 + b.ph) * .6, b.st === 1 ? 1 : b.stun > 0 ? .4 : 0, b.st === 2 ? b.rot : b.st === 1 ? Math.atan2(b.vy, b.vx) + Math.PI / 2 : (b.stun > 0 ? -.6 : Math.atan2(b.vy, Math.max(60, Math.abs(b.vx))) * .6 * Math.sign(b.vx || 1)), b.st === 2 ? '#555A62' : '#15181D');
  if (S.gt > 0) { const u = 2.5 - S.gt; c.strokeStyle = 'rgba(242,184,75,' + Math.min(.8, S.gt * .4) + ')'; c.lineWidth = 1.5; c.beginPath(); c.arc(S.gx - cam, S.gy, 8 + u * 8, 0, 7); c.stroke(); c.fillStyle = UI.acc; c.beginPath(); c.arc(S.gx - cam, S.gy, 2.5, 0, 7); c.fill(); }
  c.lineWidth = 1; for (const p of S.pops) { c.strokeStyle = 'rgba(20,22,26,' + (1 - p.t / .4) + ')'; c.beginPath(); c.arc(p.x - cam, p.y, 3 + p.t * 20, 0, 7); c.stroke(); }
  for (const q of S.txt) { c.globalAlpha = Math.max(0, 1 - q.t / 1.1); txt(q.s, q.x - cam, q.y, 13, '#15181D', 700, 'center'); } c.globalAlpha = 1;
  c.restore();
}
function drawHUD(t) {
  const n = aliveN();
  rr(12, 12, 206, 46, 14); c.fillStyle = UI.card; c.fill();
  txt('得点', 26, 29, 10, UI.sub, 500); txt(S.score.toLocaleString(), 26, 50, 19, UI.ink, 700);
  c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(132, 22, 1, 26);
  txt('群れ', 146, 29, 10, UI.sub, 500); txt(String(n), 146, 50, 19, S.lostT > 0 ? UI.red : UI.ink, 700);
  c.font = F(19, 700); bird(146 + c.measureText(String(n)).width + 13, 44, 5, .5, 0, 0, UI.sub);
  // 道のり：小さな点が区間の境目、赤いひし形がボス、光る点が今いる所
  const X0 = 16, BW = 328, Y = 70, ls = lstop(), pr = Math.min(1, S.x / ls);
  rr(X0, Y - 3, BW, 6, 3); c.fillStyle = 'rgba(14,16,20,.30)'; c.fill();
  rr(X0, Y - 3, Math.max(6, BW * pr), 6, 3); c.fillStyle = 'rgba(243,244,246,.9)'; c.fill();
  for (const Z of ZONES) { if (!Z.x) continue; c.fillStyle = 'rgba(14,16,20,.55)'; c.beginPath(); c.arc(X0 + BW * Math.min(1, Z.x / ls), Y, 1.6, 0, 7); c.fill(); }
  for (const bb of S.bossList) { const zx = X0 + BW * Math.min(1, (bb.x + bb.w / 2 - BOSSX) / ls); c.save(); c.translate(zx, Y); c.rotate(Math.PI / 4); c.fillStyle = bb.dead ? 'rgba(14,16,20,.45)' : UI.red; c.fillRect(-4, -4, 8, 8); c.restore(); }
  c.fillStyle = UI.acc; c.beginPath(); c.arc(X0 + BW * pr, Y, 4.5, 0, 7); c.fill(); c.strokeStyle = 'rgba(242,184,75,.35)'; c.lineWidth = 3; c.beginPath(); c.arc(X0 + BW * pr, Y, 7.5, 0, 7); c.stroke();
  // 区間名の札。包囲中はボス名と残りのバー
  const z = zoneAt(S.x + FLX + 120);
  if (S.siege) {
    const B = S.boss, lo = B.final && S.lightOut, f = lo ? Math.max(0, (B.cells.size - B.n0 * .25) / (B.n0 * .75)) : coreLeft(B) / Math.max(1, B.core0);
    rr(12, 84, 336, 26, 13); c.fillStyle = UI.card; c.fill();
    txt(B.name + (lo ? '　崩しきれ' : '　核を壊せ'), 26, 102, 12, UI.ink, 700);
    rr(170, 94, 164, 6, 3); c.fillStyle = 'rgba(255,255,255,.12)'; c.fill(); if (f > 0) { rr(170, 94, Math.max(6, 164 * f), 6, 3); c.fillStyle = UI.red; c.fill(); }
  } else { c.font = F(12, 700); const w = c.measureText(ZONES[z].n).width + 24; rr(12, 84, w, 24, 12); c.fillStyle = UI.card; c.fill(); txt(ZONES[z].n, 24, 101, 12, UI.ink, 700); }
  drawToggles();
}
function drawToggles() {
  const list = [[R_SND, muted ? 'mute' : 'snd']]; if (S.mode === 'play') list.unshift([R_SPD, ff + '×']);
  for (const [r, k] of list) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2; c.fillStyle = UI.card; c.beginPath(); c.arc(cx, cy, r.w / 2, 0, 7); c.fill();
    if (k === 'snd' || k === 'mute') icon(k, cx - 1, cy, UI.ink); else txt(k, cx, cy + 4.5, 13, ff > 1 ? UI.acc : UI.ink, 700, 'center');
  }
}
function drawBanner() {
  const B = S.banner; if (!B) return; const a = Math.min(1, B.t / .25, (B.d - B.t) / .4), dy = (1 - Math.min(1, B.t / .25)) * 10; c.globalAlpha = Math.max(0, a);
  rr(36, 196 + dy, W - 72, 70, 18); c.fillStyle = 'rgba(14,16,20,.74)'; c.fill();
  rr(W / 2 - 16, 206 + dy, 32, 3, 1.5); c.fillStyle = UI.acc; c.fill();
  txt(B.a, W / 2, 237 + dy, 22, UI.ink, 700, 'center'); txt(B.b, W / 2, 255 + dy, 11, UI.acc, 500, 'center'); c.globalAlpha = 1;
}
function drawPanel(t) {
  // 下のシート：角の丸い暗い板の上に、強化カードを3枚
  c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 16; c.shadowOffsetY = -2;
  rr(0, PY, W, H - PY + 24, 20); c.fillStyle = UI.panel; c.fill(); c.restore();
  rr(W / 2 - 18, PY + 6, 36, 3, 1.5); c.fillStyle = 'rgba(255,255,255,.10)'; c.fill();
  const play = S.mode === 'play';
  icon('coin', 22, PY + 22, UI.acc); txt(String(Math.floor(S.pts)), 32, PY + 27, 15, UI.ink, 700); txt('ポイント', 32 + (c.measureText(String(Math.floor(S.pts))).width) + 6, PY + 27, 10, UI.sub, 500);
  txt('体力 ' + (2 + S.armor) + '　威力 ' + S.atk.toFixed(1), W - 16, PY + 27, 11, UI.sub, 500, 'right');
  KEYS.forEach((k, i) => {
    const r = btnRect(i), u = UP[k], ok = play && S.pts >= S.cost[k], fl = S.flash[k], dx = fl < 0 ? Math.sin(t * 60) * 3 * (-fl / .35) : 0, x = r.x + dx;
    rr(x, r.y, r.w, r.h, 14); c.fillStyle = ok ? UI.btnOn : UI.btn; c.fill();
    if (fl > 0) { rr(x, r.y, r.w, r.h, 14); c.fillStyle = 'rgba(242,184,75,' + fl * 1.2 + ')'; c.fill(); }
    if (ok) { rr(x + .75, r.y + .75, r.w - 1.5, r.h - 1.5, 13.5); c.lineWidth = 1.5; c.strokeStyle = 'rgba(242,184,75,' + (.55 + .35 * Math.sin(t * 4)) + ')'; c.stroke(); }
    c.fillStyle = ok ? UI.accD : 'rgba(255,255,255,.05)'; c.beginPath(); c.arc(x + 21, r.y + 21, 13, 0, 7); c.fill();
    icon(k, x + 21, r.y + 21, ok ? UI.acc : UI.dim);
    txt(u.name, x + 40, r.y + 26, 14, ok ? UI.ink : UI.sub, 700); txt('Lv' + S.lv[k], x + r.w - 10, r.y + 25, 10, UI.dim, 600, 'right');
    txt(u.eff, x + 12, r.y + 45, 11, ok ? '#C9CED6' : UI.dim, 500);
    icon('coin', x + 15, r.y + 54, ok ? UI.acc : UI.dim); txt(String(S.cost[k]), x + 23, r.y + 58, 12, ok ? UI.acc : UI.dim, 700);
    // 値段まであとどれだけか（カード下端の細い線）
    const p = play ? Math.min(1, S.pts / S.cost[k]) : 0; if (p > 0 && !ok) { c.fillStyle = 'rgba(242,184,75,.45)'; c.fillRect(x + 14, r.y + r.h - 3, (r.w - 28) * p, 2); }
  });
}
// 勝った時は灯台が倒れ落ちるのを見せてから結果を出す
function endWait() { return S.mode === 'win' ? 3 : 1; }
function pill(label, y, on) { const w = 188; rr(W / 2 - w / 2, y, w, 46, 23); c.fillStyle = on ? UI.acc : 'rgba(242,184,75,.5)'; c.fill(); txt(label, W / 2, y + 29, 15, '#17191E', 700, 'center'); }
function drawTitle(t) {
  const g = c.createLinearGradient(0, 0, 0, PY); g.addColorStop(0, 'rgba(14,16,20,.55)'); g.addColorStop(.5, 'rgba(14,16,20,.15)'); g.addColorStop(1, 'rgba(14,16,20,.55)'); c.fillStyle = g; c.fillRect(0, 0, W, PY);
  spaced('LIGHTHOUSE', W / 2, 124, 32, UI.ink, 6);
  rr(W / 2 - 14, 140, 28, 3, 1.5); c.fillStyle = UI.acc; c.fill();
  txt('鳥の群れは、人の建てたものを許さない。', W / 2, 166, 12, '#E4E6EA', 500, 'center');
  rr(24, 316, W - 48, 124, 18); c.fillStyle = 'rgba(14,16,20,.62)'; c.fill();
  const lines = [['群れは自動で進み、建物に体当たりして壊す', 'b1'], ['画面をタップ：そこへ群れを集めて集中攻撃', 'b3'], ['下のカード：貯めたポイントで群れを強化', 'coin'], ['時計塔と給水塔を越え、最後の灯台を崩せ', 'b2']];
  lines.forEach(([s, k], i) => { const y = 344 + i * 26; icon(k, 44, y - 4, UI.acc); txt(s, 60, y, 12, '#E4E6EA', 500); });
  pill('はじめる', 456, Math.sin(t * 3) > -.6);
  if (best) txt('最高得点  ' + best.toLocaleString(), W / 2, 524, 11, UI.acc, 600, 'center');
  drawToggles();
}
function drawResult(t) {
  const win = S.mode === 'win', a = Math.max(0, Math.min(1, (S.endT - endWait() + 1) / .6)); if (!a) return; c.globalAlpha = a;
  c.fillStyle = 'rgba(14,16,20,.4)'; c.fillRect(0, 0, W, PY);
  const y0 = 132 + (1 - a) * 14; rr(24, y0, W - 48, 314, 22); c.fillStyle = 'rgba(18,20,25,.92)'; c.fill();
  if (win) { spaced('LIGHT OUT', W / 2, y0 + 50, 28, UI.acc, 5); txt('灯台は崩れ落ちた。', W / 2, y0 + 75, 12, UI.sub, 500, 'center'); }
  else { txt('群れが尽きた', W / 2, y0 + 48, 22, UI.ink, 700, 'center'); txt(S.lightOut ? '灯りは消したが、灯台は残った' : ZONES[S.zone < 0 ? 0 : S.zone].n + 'で力尽きた', W / 2, y0 + 73, 12, UI.sub, 500, 'center'); }
  const rows = [['時間', fmtT(S.t)], ['撃破', S.killed.length ? S.killed.join('・') : 'なし'], ['失った鳥', S.lost + ' 羽'], ['最大の群れ', S.peak + ' 羽']];
  if (win) rows.push(['残った群れ', aliveN() + ' 羽 × 10 = +' + S.bonus]);
  rows.forEach(([k, v], i) => { const y = y0 + 108 + i * 26; c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(48, y - 17, W - 96, 1); txt(k, 48, y, 12, UI.sub, 500); txt(v, W - 48, y, 12, UI.ink, 600, 'right'); });
  txt('得点', 48, y0 + 262, 12, UI.sub, 500); txt(S.score.toLocaleString(), W - 48, y0 + 266, 28, UI.ink, 700, 'right');
  if (S.newBest) { rr(W / 2 - 62, y0 + 280, 124, 22, 11); c.fillStyle = UI.accD; c.fill(); txt('最高得点を更新', W / 2, y0 + 295, 11, UI.acc, 700, 'center'); }
  else txt('最高得点  ' + best.toLocaleString(), W / 2, y0 + 295, 11, UI.sub, 500, 'center');
  if (S.endT > endWait()) pill('もう一度', y0 + 334, true);
  c.globalAlpha = 1;
}
function draw(t) {
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.textBaseline = 'alphabetic';
  drawWorld(t);
  if (S.mode === 'title') drawTitle(t);
  else { drawHUD(t); drawBanner(); if (S.mode !== 'play') drawResult(t); }
  drawPanel(t);
}

// ---------- 開始 ----------
reset('title');
let last = 0;
function loop(ms) { const t = ms / 1000, dt = Math.min(.04, t - last || 0); last = t; const n = S.mode === 'play' ? ff : 1; for (let i = 0; i < n; i++) step(dt); audioTick(dt); draw(t); requestAnimationFrame(loop); }
if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);
