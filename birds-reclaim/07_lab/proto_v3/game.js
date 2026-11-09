// BIRDS RECLAIM 試作 v3 — 遊びの本体。1都市＝1ステージ。LIGHTHOUSE 試作 v9 の群れ・崩落・包囲を土台にした。
// v3 で足したもの：鳥の種類を呼ぶボタン（強化ボタンをやめた）、仕掛けに効く鳥、鳥の描き分け、章のカード、還った土地とごほうび（新しい鳥・鳥の言葉）、映画風の冒頭と終わり（film.js）
// v2 で足したもの：名所の札、建物のカードと鳥の言い分、牛歩・振り子・映像の仕掛け、渡りの場面、到着のカード、パスポート、旅の仲間
const cv = document.getElementById('cv'), c = cv.getContext('2d');
const SPEED = 90, PY = 532, FLX = 165, BOSSX = 180, END = 7800;
const LO_HP = .35; // 象徴の核が消えたら残りの強度をこの倍率にする（ひびが入る）
const DPR = Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1);
cv.width = W * DPR; cv.height = H * DPR;
const FONT = '-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif';
const SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",Georgia,serif'; // 映画の字幕カード（v3）
const F = (s, w) => (w || 400) + ' ' + s + 'px ' + FONT;
const BASE_ATK = 5, BASE_ARMOR = 5; // v3：強化ボタンをやめた。威力と体力は v2 で最初の中ボスまでに強化した分を初めから持つ。中ボスを崩すたびに群れの勢いが上がる（GROW）
const GROW = { atk: 1.6, armor: 2 };
const KUI = { starling: '#C9CED6', crow: '#8E96A3', swallow: '#7FB2FF', owl: '#E0A860', falcon: '#B8C4D8', pelican: '#F0E6D2' }; // ボタンでの鳥の色
const KEYS = ['b1', 'b2', 'b3'];
const SAVE_KEY = 'birdsreclaim.v3', MUTE_KEY = 'birdsreclaim.v1.mute';
let S = null, ff = 1, scene = 'map';

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { } }
const SV0 = () => ({ clear: {}, best: {}, seen: {}, lm: {}, date: {}, last: null, kinds: [...KIND_START], team: [...KIND_START], verse: {}, epi: {}, intro: 0, skipIntro: 0, ended: 0, fe: 0, lv: {}, tip: 0 });
// clear=還した都市 best=最高得点 seen=見た建物のカード lm=還した名所 date=スタンプの日付 last=最後に還した都市（渡りの出発地）
function loadSave() { try { const o = JSON.parse(lsGet(SAVE_KEY) || '{}'); return Object.assign(SV0(), o); } catch (e) { return SV0(); } }
let SV = loadSave();
function save() { lsSet(SAVE_KEY, JSON.stringify(SV)); }
function clearedN() { return STAGES.filter(s => SV.clear[s.id]).length; }
function unlocked(i) { return true; } // 試作の間は、どの都市からでも遊べる（難しさは還した都市の数で上がる）
// 出発の群れ：ムクドリ 40 羽に、還したほかの都市の鳥が 10 羽ずつ旅の仲間として混じる
function othersCleared(i) { return STAGES.filter((s, j) => j !== i && SV.clear[s.id]).length; }
function flockOf(i) { const L = []; for (let k = 0; k < 40; k++) L.push(BIRD.base); STAGES.forEach((s, j) => { if (j !== i && SV.clear[s.id]) for (let k = 0; k < 10; k++) L.push(BIRD[s.bird]); }); return L; }
function startBirds(i) { return flockOf(i).length; }

// ---------- 1都市の準備 ----------
function zoneAt(x) { const Z = S.st.zones; let z = 0; for (let i = 0; i < Z.length; i++) if (x >= Z[i].x) z = i; return z; }
function pickGen(g) { let r = Math.random(); for (const [k, p] of g) { if ((r -= p) < 0) return GEN[k]; } return GEN[g[g.length - 1][0]]; }
function makeBoss(id, x) { const D = BOSS[id], b = D.make(x), sh = D.shell * HPM; for (const q of b.cells.values()) if (q.m !== D.core) { const v = q.m === 'fan' ? sh * .4 : sh; if (q.hp < v) q.hp = q.h0 = v; } else if (D.coreHp) q.hp = q.h0 = D.coreHp * HPM; Object.assign(b, { boss: 1, tags: bossTags(id), id, name: D.name, core: D.core, gim: D.gim, deco: D.deco, sub: D.sub, out: D.out, island: D.island, smoke: D.smoke, shine: D.shine }); return b; }
function startStage(i) {
  const ST = STAGES[i]; HPM = ST.hp * (1 + .05 * othersCleared(i)); // 還した都市が増えるほど建物も硬くなる（群れも増える）
  S = {
    st: ST, si: i, mode: 'play', x: 0, t: 0, inc: [], birds: [], blds: [], chunks: [], wild: [], parts: [], pops: [], txt: [], flora: [], drops: [],
    pts: 60, score: 0, armor: BASE_ARMOR, atk: BASE_ATK, team: SV.team.slice(0, 3), lv: { b1: 0, b2: 0, b3: 0 }, cost: {}, flash: { b1: 0, b2: 0, b3: 0 }, reward: null,
    cid: 0, zone: 0, sb: -1, bi: 0, shake: 0, banner: null, lost: 0, lostT: 0, peak: 0, endT: 0, lightOut: 0, dark: 0, reclaim: 0,
    ft: 0, gt: 0, rot: 0, sc: 1, fx: null, fy: null, siege: 0, win: 0, over: 0, bonus: 0, newBest: 0, killed: [], gim: { cd: 4, ct: 0 },
    card: null, arr: { t: 0 }, toast: null, lmN: 0, lmDown: 0, slow: 0, rainOn: 0,
  };
  S.kinds = {}; for (const k in KIND) { const L = (SV.lv || {})[k] || { p: 0, s: 0 }; S.kinds[k] = Object.assign({}, KIND[k], { am: KIND[k].am * (1 + .2 * L.p), spd: KIND[k].spd * (1 + .15 * L.s), lvP: L.p, lvS: L.s }); }
  S.cdn = { b1: 0, b2: 0, b3: 0 };
  KEYS.forEach((k, j) => { S.cost[k] = KIND[S.team[j]].cost; });
  S.wx = wxFor(ST); S.wfx = wxFx(S.wx); wxFetch(ST);
  if (typeof EPI !== 'undefined' && EPI[ST.id]) { SV.epi = SV.epi || {}; SV.epi[ST.id] = 1; } // 章の題辞に出会った S.flakes = []; S.evt = Math.random() < .65 ? { at: 1200 + Math.random() * 3500, sand: SAND.includes(ST.id) } : null; // いまの空と、通り過ぎる竜巻（見た目だけ）
  const fl = flockOf(i); for (const sp of fl) addBird(60 + Math.random() * 80, GY - 280 + Math.random() * 120, 0, 0, sp); S.peak = fl.length;
  const mids = ST.bosses.map(b => makeBoss(b.id, b.x)); S.L = makeBoss(ST.final, END); S.L.final = 1;
  const lms = (ST.lm || []).map(([x, id]) => { const D = LM[id], b = D.make(x); b.lm = D.name; b.real = D.real; return b; }); S.lmN = lms.length;
  // ボス（島のボスは海の分も）と名所の場所には、道中の建物を置かない
  const occ = mids.map(B => B.island ? [B.x - 170, B.x + B.w + 170] : [B.x - 90, B.x + B.w + 70]).concat(lms.map(b => [b.x - 40, b.x + b.w + 30]));
  let x = 420;
  while (x < END - 700) {
    const z = zoneAt(x), b = pickGen(ST.zones[z].g)(x), o = occ.find(([p, q]) => b.x + b.w > p && b.x < q);
    if (o) { x = o[1] + 10; continue; }
    S.blds.push(b); x += b.w + 30 + Math.random() * 80;
    if (Math.random() < .5) S.wild.push({ at: x - 20, n: Math.round(ri(5, 7) * (BIRD[ST.bird].wn || 1)) });
  }
  S.blds.push(...lms, ...mids, S.L); S.bossList = [...mids, S.L];
  for (const B of S.bossList) B.core0 = coreLeft(B);
  scene = 'game'; ff = 1; sfx('start');
}
function addBird(x, y, vx, vy, sp) { S.birds.push({ x: S.x + x, y, vx: vx || 0, vy: vy || 0, sp, hp: 2 + S.armor + sp.hp, st: 0, ph: Math.random() * 6, stun: 0, cd: Math.random() * 2 }); }
function aliveN() { let n = 0; for (const b of S.birds) if (b.st !== 2) n++; return n; }
function buy(k) {
  if (S.mode !== 'play') return false;
  if (S.pts < S.cost[k] || S.cdn[k] > 0) { S.flash[k] = -.35; sfx('deny'); return false; }
  S.pts -= S.cost[k]; S.lv[k]++;
  // 呼んだ鳥は群れの近くに、画面の外から飛んでくる
  const K = S.kinds[S.team[KEYS.indexOf(k)]], fx = (S.fx ?? S.x + FLX) - S.x, fy = S.fy ?? GY - 210; S.cdn[k] = K.cd;
  for (let i = 0; i < K.n; i++) addBird(Math.max(-40, fx - 140 - Math.random() * 60), fy - 60 + Math.random() * 120, 260, 0, K);
  S.cost[k] = Math.round(S.cost[k] * 1.4); S.flash[k] = .35; sfx('buy'); sfx('caw');
  return true;
}
function banner(a, b) { S.banner = { a, b, t: 0, d: 2.6 }; }
const dstr = () => { const d = new Date(); return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'); };
function finish() {
  const id = S.st.id; if (S.score > (SV.best[id] || 0)) { SV.best[id] = S.score; S.newBest = 1; }
  S.area = 0; for (const b of S.blds) S.area += Math.max(0, b.n0 - b.cells.size); S.area = Math.round(S.area * 25 / 1000) / 10; // 1マス＝5m四方として ha
  if (S.win) {
    S.reward = { verse: VERSE[id] || '', kind: null, first: !SV.clear[id] };
    if (S.reward.first) { const nk = KIND_UNLOCK.find(k => !SV.kinds.includes(k)); if (nk) { SV.kinds.push(nk); S.reward.kind = nk; } SV.verse[id] = 1; }
    S.reward.fe = S.reward.first ? 3 : 1; SV.fe = (SV.fe || 0) + S.reward.fe; // 羽：鳥を育てる（図鑑で使う）
    SV.clear[id] = 1; SV.last = id; if (!SV.date[id]) SV.date[id] = dstr();
  }
  save();
}

// ---------- 当たりと崩落 ----------
function cellAt(wx, wy) { for (const b of S.blds) { if (wx < b.x || wx >= b.x + b.w) continue; const k = Math.floor((wx - b.x) / CS), r = Math.floor((GY - wy) / CS); if (r < 0) continue; const q = b.cells.get(r * 200 + k); if (q) return { b, q }; } return null; }
function part(x, y, vx, vy, col, s) { if (S.parts.length >= PMAX) S.parts.shift(); S.parts.push({ x, y, vx, vy, t: 0, col, s }); }
const rgb = m => 'rgb(' + MAT[m].col.join(',') + ')';
function kill(b, q, mul) { const key = q.r * 200 + q.k; if (!b.cells.has(key)) return; b.cells.delete(key); b.dirty = 1; if (S.mode === 'play') { S.score += Math.round(MAT[q.m].pt * (mul || 1)); S.pts += MAT[q.m].pt * .7 * (mul || 1); } part(b.x + q.k * CS, GY - (q.r + 1) * CS, -40 + Math.random() * 90, -70 * Math.random(), rgb(q.m), CS * .8); }
function detach(b, list, tip) {
  if (!list.length) return; let sx = 0, sy = 0;
  for (const q of list) { b.cells.delete(q.r * 200 + q.k); sx += b.x + (q.k + .5) * CS; sy += GY - (q.r + .5) * CS; }
  b.dirty = 1; const cx = sx / list.length, cy = sy / list.length;
  if (list.length < 4) { for (const q of list) part(b.x + q.k * CS, GY - (q.r + 1) * CS, 0, 0, rgb(q.m), CS * .8); return; }
  let R = 0; const cells = list.map(q => { const lx = b.x + (q.k + .5) * CS - cx, ly = GY - (q.r + .5) * CS - cy; R = Math.max(R, Math.hypot(lx, ly)); return { lx, ly, m: q.m, hp: q.hp, h0: q.h0 }; });
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
// 建物がほぼ崩れたら、跡地に草木が生える（自然への回帰）
function sprout(x, w, big) { S.flora.push({ x, w, t: 0, big: big || 0, seed: Math.random() * 1000 }); }
// 名所が倒れたら「◯◯、還る」と出して点を入れ、パスポートに記録する
function checkGone(b) {
  if (b.gone || b.boss || b.cells.size > b.n0 * .25) return; b.gone = 1; sprout(b.x, b.w, b.real ? 1 : 0);
  if (b.lm && S.mode === 'play') { S.lmDown++; S.score += 40; S.pts += 20; S.toast = { s: b.lm + '、還る', t: 0 }; sfx('caw'); const id = S.st.id; (SV.lm[id] = SV.lm[id] || {})[b.lm] = 1; save(); }
}
function coreCenter(B) { let n = 0, sx = 0, sy = 0; for (const q of B.cells.values()) if (q.m === B.core) { n++; sx += B.x + (q.k + .5) * CS; sy += GY - (q.r + .5) * CS; } return n ? [sx / n, sy / n] : null; }
const sp = b => (b.sp.spd || 1) * (S.wfx ? S.wfx.spd : 1); // 鳥の速さ：種類 × 羽の段 × 天気
function hurtBird(bd, vx, vy) { bd.hp--; if (bd.hp <= 0) { bd.st = 2; bd.vx = vx; bd.vy = vy; S.lost++; S.lostT = .5; } }
function stepChunks(dt) {
  for (let i = S.chunks.length - 1; i >= 0; i--) {
    const ch = S.chunks[i]; ch.t += dt; ch.vy += GRAV * dt; ch.x += ch.vx * dt; ch.y += ch.vy * dt;
    ch.w *= 1 + dt * 1.2; ch.w = Math.max(-3, Math.min(3, ch.w)); ch.a += ch.w * dt;
    const ca = Math.cos(ch.a), sa = Math.sin(ch.a); let hit = null;
    if (ch.t > .04) for (const q of ch.cells) { const wx = ch.x + q.lx * ca - q.ly * sa, wy = ch.y + q.lx * sa + q.ly * ca + CS / 2; if (wy >= GY) { hit = { g: 1 }; break; } const h = cellAt(wx, wy); if (h && !(h.b === ch.src && ch.t < .45)) { hit = h; break; } }
    // 名所（細く高い塔が多い）の塊は、当たっても 6 割の鳥はすり抜ける（倒すたびに群れが減りすぎないように）
    for (const bd of S.birds) { if (bd.st === 2 || bd.hitBy === ch.id) continue; if (Math.hypot(bd.x - ch.x, bd.y - ch.y) < ch.R * .6) { bd.hitBy = ch.id; if (!(ch.src.lm && Math.random() < .6)) hurtBird(bd, ch.vx, ch.vy); } }
    if (hit) {
      const sp = Math.hypot(ch.vx, ch.vy); let gain = 0;
      // ボスの核は落ちても消えない：落ちた列のいちばん上に載り、光ったまま残る（つついて壊す）
      const src = ch.src; if (src.boss && !src.dead) ch.cells = ch.cells.filter(q => {
        if (q.m !== src.core) return true; const wx = ch.x + q.lx * ca - q.ly * sa, k = Math.max(0, Math.min(src.w / CS - 1, Math.floor((wx - src.x) / CS))); let r = 0;
        for (let j = 0; j < 120; j++) if (src.cells.has(j * 200 + k)) r = j + 1; src.cells.set(r * 200 + k, { r, k, m: q.m, hp: q.hp * .6, h0: q.h0 }); src.dirty = 1; return false;
      });
      for (const q of ch.cells) { const wx = ch.x + q.lx * ca - q.ly * sa, wy = ch.y + q.lx * sa + q.ly * ca; const p = S.mode === 'play' ? Math.round(MAT[q.m].pt * .8) : 0; S.score += p; gain += p; S.pts += p ? MAT[q.m].pt * .5 : 0; part(wx, wy, ch.vx * .3 + (Math.random() - .5) * 120 + q.lx * 2, -Math.random() * sp * .35, rgb(q.m), CS * .8); }
      if (hit.b) { let dmg = ch.cells.length * sp * .004; const q = hit.q; for (const [a, e] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { if (dmg <= 0) break; const n = hit.b.cells.get((q.r + a) * 200 + q.k + e); if (n) { const d = Math.min(dmg, n.hp + .01); n.hp -= d; dmg -= d; if (n.hp <= 0) kill(hit.b, n); } } }
      const n = ch.cells.length; S.shake = Math.min(9, S.shake + n * .06); sfx('crash', n);
      if (gain >= 8) S.txt.push({ x: ch.x, y: Math.min(GY - 20, ch.y), s: '+' + gain, t: 0 });
      S.chunks.splice(i, 1);
    }
  }
}
function exposed(b) { const e = []; for (const q of b.cells.values()) { if (!b.cells.has(q.r * 200 + q.k - 1) || !b.cells.has(q.r * 200 + q.k + 1) || !b.cells.has((q.r + 1) * 200 + q.k)) e.push(q); } return e; }
// 得意な建物の札なら ×1.35、苦手なら ×0.65（ボスだけ）
function likeK(sp, B) { if (!B.tags || !sp.like) return 1; let k = 1; for (const t of B.tags) { if (sp.like.includes(t)) k *= 1.35; if (sp.hate.includes(t)) k *= .65; } return k; }
function impact(b, nx, ny, hit) {
  const q = hit.q, sp = b.sp, isCore = hit.b.boss && q.m === hit.b.core, dmg = S.atk * sp.am * (isCore ? (sp.core || 1) : (sp.wall || 1)) * likeK(sp, hit.b);
  q.hp -= dmg;
  // ペリカン：石を落として、まわりのマスも砕く
  if (sp.stone) { for (let a = -2; a <= 2; a++) for (let e = -2; e <= 2; e++) { if ((!a && !e) || Math.abs(a) + Math.abs(e) > 3) continue; const n = hit.b.cells.get((q.r + a) * 200 + q.k + e); if (n) { n.hp -= dmg * .7; if (n.hp <= 0) kill(hit.b, n); } } for (let i = 0; i < 6; i++) part(nx, ny, (Math.random() - .5) * 140, -Math.random() * 90, 'rgb(150,140,120)', 3); }
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
  if (bd.sp.seek && !B.dead) { const p = coreCenter(B); if (p) { let best = null, bdist = 1e9; for (const q of ex) { const d = Math.hypot(B.x + (q.k + .5) * CS - p[0], GY - (q.r + .5) * CS - p[1]) + Math.random() * 12; if (d < bdist) { bdist = d; best = q; } } return { b: B, q: best }; } }
  if (Math.random() < (S.lightOut ? .6 : .35)) { const lo = ex.filter(q => q.r <= top * .35); if (lo.length) return { b: B, q: lo[Math.floor(Math.random() * lo.length)] }; }
  let best = null, bdist = 1e9; for (const q of ex) { const d = Math.hypot(B.x + (q.k + .5) * CS - bd.x, GY - (q.r + .5) * CS - bd.y) + Math.random() * 50; if (d < bdist) { bdist = d; best = q; } } return { b: B, q: best };
}
// 象徴が崩れきった：立っているマスが最初の 25% 以下で、落ちている塊もない
function demolished() { const L = S.L; if (L.cells.size > L.n0 * .25) return false; for (const ch of S.chunks) if (ch.src === L) return false; return true; }
function coreLeft(B) { let n = 0; for (const q of B.cells.values()) if (q.m === B.core) n++; for (const ch of S.chunks) if (ch.src === B) for (const q of ch.cells) if (q.m === B.core) n++; return n; }

// ---------- ボスの仕掛け ----------
// fan：冷却ファンが残っている間、屋根の上の上昇気流が急降下を押し返す（ファンそのものを狙う鳥は通す）
// glare：金のガラスがときどき光り、近くの鳥の目をくらませる（光る前にタップで散らせば避けられる）
// beam：曲面ガラスの反射光が群れのどこかを狙い、輪の中の鳥を焼く
// map：都庁のプロジェクションマッピング。glare と同じく、光る前にタップで散らせば避けられる
// slow：国会議事堂の牛歩戦術。4.5 秒ごとに、群れが遅くなる時間と戻る時間が入れ替わる
// sway：台北101 の制振ダンパー。金の球が揺れたあと、近くの鳥をはじき飛ばす（傷は負わない）
// gust：ルイ・ヴィトン財団のガラスの帆。予告のあと 1.4 秒、横風が群れを押し戻す
// pillar：ルクソールの光の柱。予告の点線のあと、頂の真上の柱に入った鳥が焼かれる
// eye：スフィアの目玉。開いている間、瞳の近くの鳥はその場で固まる（傷は負わない）
function gimmick(B, dt, lcx) {
  const G = S.gim; if (!S.siege || B.dead || !B.gim) return;
  if (B.gim === 'fan') {
    if ((G.ct -= dt) <= 0) { G.ct = .25; let n = 0; for (const q of B.cells.values()) if (q.m === 'fan') n++; G.fan = n; if (G.fan0 == null) G.fan0 = n; }
    if (!G.fan) return; const roof = GY - B.roof * CS, pw = 1300 * G.fan / G.fan0;
    for (const bd of S.birds) {
      if (bd.st === 2 || bd.x < B.x + 2 * CS || bd.x > B.x + B.w - 2 * CS || bd.y < roof - 140 || bd.y > roof + 4) continue;
      if (bd.sp.wind || (bd.st === 1 && bd.tg.q.m === 'fan')) continue;
      bd.vy -= pw * dt; if (bd.st === 1 && bd.vy < 0) bd.st = 0;
    }
  } else if (B.gim === 'glare' || B.gim === 'map') {
    if (G.flash > 0) G.flash -= dt;
    if (G.warn > 0) {
      G.warn -= dt;
      if (G.warn <= 0) {
        G.flash = .45; G.cd = 6.5; sfx('glare');
        for (const bd of S.birds) if (bd.st !== 2 && !bd.sp.light && Math.hypot(bd.x - lcx, bd.y - S.ringY) < 230 * S.wfx.light) { bd.stun = .8; bd.st = 0; bd.vy = -40 + Math.random() * 80; bd.vx *= .3; }
      }
    } else if ((G.cd -= dt) <= 0) { G.warn = 1; sfx('aim'); }
  } else if (B.gim === 'slow') {
    if ((G.ct -= dt) <= 0) { G.on = !G.on; G.ct = G.on ? 4.5 : 3.2; if (G.on) sfx('aim'); }
  } else if (B.gim === 'sway') {
    if (G.wave) { G.wave.t += dt; if (G.wave.t > .6) G.wave = null; }
    if (G.warn > 0) {
      G.warn -= dt;
      if (G.warn <= 0) {
        G.cd = 5.5; const p = coreCenter(B);
        if (p) { G.wave = { x: p[0], y: p[1], t: 0 }; sfx('sway'); for (const bd of S.birds) { if (bd.st === 2) continue; const dx = bd.x - p[0], dy = bd.y - p[1], d = Math.hypot(dx, dy) || 1; if (d < 150) { bd.vx += dx / d * 460; bd.vy += dy / d * 460; bd.st = 0; bd.stun = .5; } } }
      }
    } else if ((G.cd -= dt) <= 0) { G.warn = 1.1; sfx('aim'); }
  } else if (B.gim === 'beam') {
    if (G.burn) { G.burn.t -= dt; if (G.burn.t <= 0) G.burn = null; }
    if (G.aim) {
      G.aim.t -= dt;
      if (G.aim.t <= 0) {
        const A = G.aim; G.aim = null; G.cd = 4.2; G.burn = { x: A.x, y: A.y, t: .45 }; sfx('burn');
        for (const bd of S.birds) if (bd.st !== 2 && Math.hypot(bd.x - A.x, bd.y - A.y) < 46) hurtBird(bd, (Math.random() - .5) * 80, 60);
        for (let i = 0; i < 14; i++) part(A.x + (Math.random() - .5) * 60, A.y + (Math.random() - .5) * 40, (Math.random() - .5) * 60, -40, 'rgb(255,226,150)', 2);
      }
    } else if ((G.cd -= dt) <= 0) {
      const live = S.birds.filter(b => b.st !== 2); if (live.length) { const p = live[Math.floor(Math.random() * live.length)]; G.aim = { x: p.x, y: p.y, t: 1.4 }; sfx('aim'); }
    }
  } else if (B.gim === 'gust') {
    if (G.gust > 0) { G.gust -= dt; for (const bd of S.birds) if (bd.st !== 2 && !bd.sp.wind) { bd.vx -= 700 * dt; if (bd.st === 1 && Math.random() < dt * 3) bd.st = 0; } if (G.gust <= 0) G.cd = 6; }
    else if (G.warn > 0) { G.warn -= dt; if (G.warn <= 0) { G.gust = 1.4; sfx('gust'); } }
    else if ((G.cd -= dt) <= 0) { G.warn = 1; sfx('aim'); }
  } else if (B.gim === 'pillar') {
    const p = coreCenter(B); if (!p) return; G.px = p[0]; G.py = p[1];
    if (G.pon > 0) { G.pon -= dt; if ((G.ct -= dt) <= 0) { G.ct = .35; for (const bd of S.birds) if (bd.st !== 2 && Math.abs(bd.x - p[0]) < 24 && bd.y < p[1] + 10) hurtBird(bd, (bd.x - p[0]) * 4, -40); } if (G.pon <= 0) G.cd = 3.6; }
    else if (G.warn > 0) { G.warn -= dt; if (G.warn <= 0) { G.pon = 1.8; G.ct = 0; sfx('burn'); } }
    else if ((G.cd -= dt) <= 0) { G.warn = 1.1; sfx('aim'); }
  } else if (B.gim === 'eye') {
    G.eo = G.open > 0 ? 1 : G.warn > 0 ? 1 - G.warn / .8 : Math.max(0, (G.eo || 0) - dt * 4);
    if (G.open > 0) {
      G.open -= dt; const p = coreCenter(B);
      if (p) for (const bd of S.birds) if (bd.st !== 2 && !bd.sp.light && Math.hypot(bd.x - p[0], bd.y - p[1]) < 210 * S.wfx.light) { bd.st = 0; bd.vx = 0; bd.vy = 0; bd.stun = 1; } // 固まった鳥は、目が閉じてもしばらく動けない
      if (G.open <= 0) G.cd = 2.6;
    } else if (G.warn > 0) { G.warn -= dt; if (G.warn <= 0) { G.open = 3.2; sfx('glare'); } }
    else if ((G.cd -= dt) <= 0) { G.warn = .8; sfx('aim'); }
  }
}

// ---------- 1コマ進める ----------
function step(dt) {
  if (S.card) { S.card.t += dt; if (S.card.t > 5) S.card = null; else dt *= .3; } // 建物のカードを出している間は時間をゆっくりにする
  S.arr.t += dt; if (S.toast) { S.toast.t += dt; if (S.toast.t > 2.4) S.toast = null; }
  const play = S.mode === 'play', ST = S.st;
  if (play) S.t += dt;
  const L = S.L, B = S.bossList[Math.min(S.bi, S.bossList.length - 1)], stop = B.x + B.w / 2 - BOSSX;
  if (S.banner) { S.banner.t += dt; if (S.banner.t > S.banner.d) S.banner = null; }
  S.shake = Math.max(0, S.shake - dt * 25); S.lostT = Math.max(0, S.lostT - dt);
  for (const k of KEYS) S.cdn[k] = Math.max(0, S.cdn[k] - dt);
  for (const k of KEYS) S.flash[k] = S.flash[k] > 0 ? Math.max(0, S.flash[k] - dt) : Math.min(0, S.flash[k] + dt);
  if (play && !S.win) S.x = Math.min(stop, S.x + dt * SPEED * S.wfx.scroll * (S.evt && S.evt.on && !S.evt.done ? .8 : 1));
  S.siege = play && S.x >= stop - .5 ? 1 : 0; S.boss = B;
  const drift = play && !S.siege ? SPEED : 0;
  if (play) {
    const z = zoneAt(S.x + FLX + 120);
    if (z !== S.zone) {
      const c0 = ST.zones[S.zone].c, c1 = ST.zones[z].c; S.zone = z;
      if (c0 && c1 && c0 !== c1) { const h = HELLO[c1] || ['', '']; banner('国境を越えた — ' + c1, h[0] + '（' + h[1] + 'で「ようこそ」）　' + ST.zones[z].n); sfx('caw'); }
      else if (!S.siege) banner(ST.zones[z].n, ST.city + '　第' + (z + 1) + '区');
    }
    if (S.siege && S.sb !== S.bi) { S.sb = S.bi; S.gim = { cd: 3, ct: 0 }; S.banner = null; S.card = { B, t: 0 }; sfx('warn'); if (!SV.seen[B.id]) { SV.seen[B.id] = 1; save(); } }
  }
  let topB = 0; for (const q of B.cells.values()) topB = Math.max(topB, q.r);
  const LX = S.x + FLX, lcx = B.x + B.w / 2, lcy = GY - Math.max(60, topB * CS * .55) + 40;
  // 合流：その都市の鳥が画面の外から飛んでくる
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
    if (d < 45 || q.t > 6) { addBird(q.x - S.x, q.y, q.vx, q.vy, BIRD[ST.bird]); S.inc.splice(i, 1); }
  }
  S.ft += dt; S.gt -= dt; const gather = S.gt > 0; S.rot += dt * .75; S.ringY = Math.max(130, GY - (topB + 1) * CS - 55);
  const fyT = gather ? S.gy : (S.siege ? lcy - 40 : GY - 230 + Math.sin(S.ft * .35) * 70), fxT = gather ? S.gx : (S.siege ? lcx : LX);
  S.fx = (S.fx ?? LX) + (fxT - (S.fx ?? LX)) * Math.min(1, dt * (gather ? 2.4 : 1.2)); S.fy = (S.fy ?? GY - 210) + (fyT - (S.fy ?? GY - 210)) * Math.min(1, dt * (gather ? 2.4 : 1));
  const breath = gather ? .42 : (S.siege ? 1.5 : 1 + .38 * Math.sin(S.ft * .55)); S.sc += (breath - S.sc) * Math.min(1, dt * 2);
  const N = aliveN(); let idx = 0; S.peak = Math.max(S.peak, N);
  S.slow = S.siege && B.gim === 'slow' && S.gim.on && !B.dead ? 1 : 0;
  for (let i = S.birds.length - 1; i >= 0; i--) {
    const b = S.birds[i];
    if (b.st === 2) { b.vy += 300 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot = (b.rot || 0) + dt * 6; if (b.y > H + 20) S.birds.splice(i, 1); continue; }
    const my = idx++;
    if (b.stun > 0) { b.stun -= dt; b.vy += 200 * dt; }
    else if (b.st === 1) { const T = b.tg; if (!T.b.cells.has(T.q.r * 200 + T.q.k)) b.st = 0; else { const gx = T.b.x + (T.q.k + .5) * CS, gy = GY - (T.q.r + .5) * CS, dx = gx - b.x, dy = gy - b.y, d = Math.hypot(dx, dy) || 1, v = 400 * sp(b); b.vx += (dx / d * v - b.vx) * dt * 5; b.vy += (dy / d * v - b.vy) * dt * 5; } }
    else {
      let tx, ty;
      if (S.mode === 'win') {
        // 還ったあと：群れはゆっくり輪になって舞う
        const ang = S.rot * .6 + 6.2832 * my / Math.max(1, N), R = 120 + (my % 4) * 14; tx = S.x + W / 2 + Math.cos(ang) * R; ty = 250 + Math.sin(ang) * R * .4; b.depth = Math.sin(ang);
      } else if (S.siege && !gather) {
        // 包囲：ボスの上空を輪になって回り、輪のあちこちから突っ込む
        const ang = S.rot + 6.2832 * my / Math.max(1, N), lane = (my % 3) - 1, R = (95 + Math.min(55, N * .2)) * (1 + .12 * Math.sin(S.ft * .8)) + lane * 12;
        b.depth = Math.sin(ang); tx = lcx + Math.cos(ang) * R; ty = S.ringY + Math.sin(ang) * R * .35 + lane * 10 + Math.sin(S.ft * 2 + b.ph) * 3;
      } else { const sl = slot(my, N, S.ft); tx = S.fx + sl[0] * S.sc + Math.sin(S.ft * 1.7 + b.ph) * 4; ty = S.fy + sl[1] * S.sc + Math.cos(S.ft * 1.3 + b.ph) * 4; b.depth = null; }
      ty = Math.max(84, ty);
      const k = gather ? 4 : 2.2; b.vx += ((tx - b.x) * k - b.vx) * dt * 3 + drift * dt * 3; b.vy += ((ty - b.y) * k - b.vy) * dt * 3;
      const slw = S.slow && !b.sp.wind; b.cd -= dt * (slw ? .5 : 1) * sp(b);
      if (b.cd < 0 && play && !S.win) { const T = gather ? pickTarget(S.gx, S.gy, 1) : (S.siege ? siegeTarget(b) : pickTarget(b.x, b.y, 0)); if (T) { b.tg = T; b.st = 1; } b.cd = gather ? .3 + Math.random() * .7 : (S.siege ? .5 + Math.random() * 1.1 : 1.2 + Math.random() * 2.4); }
    }
    const vm = Math.hypot(b.vx, b.vy), cap = (b.st === 1 ? 440 * sp(b) : 300) * (S.slow && !b.sp.wind ? .45 : 1); if (vm > cap) { b.vx *= cap / vm; b.vy *= cap / vm; }
    const nx = b.x + b.vx * dt, ny = Math.min(GY - 2, b.y + b.vy * dt); const hit = S.mode === 'win' ? null : cellAt(nx, ny);
    if (hit) { if (impact(b, nx, ny, hit)) { b.x = nx; b.y = ny; b.vx *= .9; if (b.st === 1) { b.st = 0; b.stun = .2; b.vy = -90; } } else if (b.st === 1) b.st = 0; }
    else { b.x = nx; b.y = ny; }
    if (b.y >= GY - 2) b.vy = -140;
  }
  if (play) gimmick(B, dt, lcx);
  for (const b of S.blds) if (b.dirty) { structural(b); checkGone(b); }
  stepChunks(dt);
  for (let i = S.parts.length - 1; i >= 0; i--) { const p = S.parts[i]; p.t += dt; if (p.y < GY) { p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y >= GY) { p.y = GY - p.s * Math.random(); p.vx = 0; p.vy = 0; } } if (p.t > 6) S.parts.splice(i, 1); }
  for (let i = S.pops.length - 1; i >= 0; i--) { S.pops[i].t += dt; if (S.pops[i].t > .4) S.pops.splice(i, 1); }
  for (let i = S.txt.length - 1; i >= 0; i--) { const q = S.txt[i]; q.t += dt; q.y -= dt * 30; if (q.t > 1.1) S.txt.splice(i, 1); }
  for (const f of S.flora) f.t += dt; if (S.bb) S.bb.t += dt;
  if (play && !S.siege && (S.callT = (S.callT ?? 3) - dt) <= 0) { S.callT = 10 + Math.random() * 7; sfx('call'); } // 土地の鳥の鳴き声
  if (play && !SV.tip && S.t > 7 && !S.banner && !S.card) { SV.tip = 1; save(); banner('下のボタンで鳥を呼ぶ', '鳥ごとに得意な建物がある。ボスの前のカードで、効く鳥を確かめよう'); }
  stepSky(dt); // 雨・雪・稲光・竜巻は、いまの本物の空（sky.js）で決める
  for (let i = S.drops.length - 1; i >= 0; i--) { const d = S.drops[i]; d.y += d.v * dt; d.x -= d.v * .18 * dt; if (d.y > GY) S.drops.splice(i, 1); }
  S.lamp = coreLeft(L);
  if (play && !S.win) {
    if (!aliveN() && !S.inc.length) { S.mode = 'over'; S.over = 1; S.endT = 0; finish(); sfx('over'); return; }
    if (!coreLeft(B) && !B.dead) {
      if (!B.final) {
        B.dead = 1; S.killed.push(B.name); S.score += 250; S.pts += 60; S.shake = 10; sfx('boss'); S.atk += GROW.atk; S.armor += GROW.armor; for (const bd of S.birds) if (bd.st !== 2) bd.hp += GROW.armor; // 群れの勢い
        if (B.id === 'abbey') { S.bb = { x: B.x + B.w / 2, y: GY - 100, t: 0 }; sfx('blackbird'); } // クロウタドリ（ある歌への目くばせ。歌詞も曲も使わない）
        const rest = [...B.cells.values()]; if (rest.length) detach(B, rest, (Math.random() - .5) * 1.2); S.bi++; banner(B.name + ' 崩壊', (BOSS[B.id].after || '跡地に草木が戻る') + '　+250 点  +60 ポイント');
        sprout(B.x - 10, B.w + 20, 1);
      } else if (!S.lightOut) {
        // 核が消えても終わらない。象徴を崩しきるまで包囲を続ける
        S.lightOut = 1; for (const q of L.cells.values()) q.hp *= LO_HP; S.score += 500; S.shake = 10; sfx('lightout'); banner(B.out, '残りは脆い — ' + B.name + 'を崩しきれ  +500 点');
      }
    }
    if (S.lightOut && demolished()) {
      L.dead = 1; S.killed.push(L.name); S.score += 500; S.shake = 14;
      const rest = [...L.cells.values()]; if (rest.length) detach(L, rest, (Math.random() - .5) * 1.4);
      S.win = 1; S.mode = 'win'; S.endT = 0; S.bonus = aliveN() * 10; S.score += S.bonus; finish(); sfx('boss'); sfx('win');
      // 見えている範囲いっぱいに草木を生やす
      for (let x = S.x - 40; x < S.x + W + 40; x += 34 + Math.random() * 30) sprout(x, 24 + Math.random() * 30, Math.random() < .3);
    }
  }
  if (S.lightOut && !S.win) S.dark = Math.min(1, S.dark + dt * .25);
  if (S.mode === 'win') { S.reclaim = Math.min(1, S.endT / 3.5); S.dark = Math.max(0, S.dark - dt * .5); if (S.endT > .8 && !S.chirped) { S.chirped = 1; sfx('reclaim'); } }
  if (S.mode === 'over' || S.mode === 'win') S.endT += dt;
}

// ---------- 音（WebAudio で合成。ファイルは使わない） ----------
// 方針：旋律のある BGM は置かない。群れの羽音と電子音の鳴き声で不穏さを出し、自然に還った時だけ柔らかなさえずりを鳴らす。
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
function wind() { const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain(); s.buffer = NB; s.loop = true; fl.type = 'lowpass'; fl.frequency.value = 420; lfo.frequency.value = .13; lg.gain.value = 180; lfo.connect(lg); lg.connect(fl.frequency); g.gain.value = .03; s.connect(fl); fl.connect(g); g.connect(MG); s.start(); lfo.start(); }
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
// さえずり：高い正弦波を短く上下させる（自然に還った時だけ）
function chirp(n, spread) { for (let i = 0; i < n; i++) { const d = Math.random() * spread, f = 2600 + Math.random() * 1800; tone(f, .07, .035, 'sine', f * 1.35, d); tone(f * 1.2, .06, .025, 'sine', f * .9, d + .08); } }
function audioTick(dt) {
  if (!AC || muted) return;
  const n = scene === 'fly' && FLY ? FLY.n : S && scene === 'game' ? aliveN() + S.inc.length : 0;
  flT -= dt; if (flT < 0 && FL) { flT = .2; FL.out.gain.setTargetAtTime(Math.min(.22, .02 * Math.sqrt(n)), AC.currentTime, .3); }
  if (quietT > 0) { quietT -= dt; if (quietT <= 0) cry(12, 1.4); return; }
  if (scene !== 'game' || S.mode !== 'play' || !aliveN()) return;
  shT -= dt; if (shT < 0) { cry(S.siege ? 2 : 1, .15); shT = S.siege ? .25 + Math.random() * .5 : .6 + Math.random() * 1.6; }
}
function sfx(k, n) {
  if (!AC || muted) return; const now = AC.currentTime;
  try {
    if (k === 'hit') { if (now - lastHit < .035) return; lastHit = now; nz(.07, 'bandpass', 700 + Math.random() * 700, 1.2, .16); }
    else if (k === 'tick') { if (now - lastHit < .05) return; lastHit = now; nz(.035, 'highpass', 2500, 1, .05); }
    else if (k === 'crash' && S && S.st && S.st.id === 'vegas' && Math.random() < .55) vegasCrash(n);
    else if (k === 'crash') nz(Math.min(1.3, .3 + n * .012), 'lowpass', Math.min(900, 300 + n * 4), .7, Math.min(.5, .14 + n * .005), 60);
    else if (k === 'buy') { tone(660, .12, .08, 'triangle'); tone(990, .16, .06, 'triangle', 0, .07); }
    else if (k === 'deny') tone(170, .12, .06, 'square');
    else if (k === 'warn') { tone(70, 1.6, .18, 'sine', 55); cry(6, .7); }
    else if (k === 'boss') { tone(110, 1.2, .3, 'sine', 40); nz(1.4, 'lowpass', 600, .7, .4, 50); }
    else if (k === 'lightout') { tone(90, 1.8, .28, 'sine', 35); nz(1.6, 'lowpass', 500, .7, .3, 40); quietT = 1.8; }
    else if (k === 'caw') cry(3, .4);
    else if (k === 'over') tone(110, 1.8, .14, 'sine', 50);
    else if (k === 'win') cry(10, 1.6, .3);
    else if (k === 'reclaim') { chirp(18, 3.2); tone(196, 3, .05, 'sine'); tone(294, 3, .04, 'sine', 0, .4); }
    else if (k === 'start') cry(4, .5);
    else if (k === 'aim') tone(500, .9, .05, 'sine', 1800);
    else if (k === 'glare') { tone(3200, .35, .06, 'sine', 1200); nz(.3, 'highpass', 4000, .7, .08); }
    else if (k === 'burn') nz(.5, 'bandpass', 2400, 1.5, .2, 600);
    else if (k === 'sway') { tone(70, .7, .22, 'sine', 45); nz(.5, 'lowpass', 400, .7, .2, 80); }
    else if (k === 'gust') nz(1.4, 'bandpass', 260, .7, .24, 900);
    else if (k === 'blackbird') { const P = [784, 880, 988, 1175, 1319, 1568]; let d = .2; for (let i = 0; i < 9; i++) { const f = P[Math.floor(Math.random() * P.length)]; tone(f, .11 + Math.random() * .1, .045, 'sine', f * (Math.random() < .5 ? 1.12 : .9), d); d += .1 + Math.random() * .12; } }
    else if (k === 'call') birdCall(S.st.bird);
  } catch (e) { }
}
// 土地の鳥の鳴き声：鳥ごとの短い型（実際の鳴き方に寄せた粗い近似）
function birdCall(k) {
  const T = (f, d, v, ty, f2, dl) => tone(f, d, v, ty || 'sine', f2, dl);
  if (k === 'crow' || k === 'hcrow' || k === 'amcrow' || k === 'raven') cry(k === 'raven' ? 2 : 3, .5);
  else if (k === 'kite') { T(1700, .5, .03, 'sine', 1300); T(1500, .9, .03, 'sine', 900, .55); } // ピーヒョロロ
  else if (k === 'myna' || k === 'parakeet' || k === 'grackle') chirp(k === 'parakeet' ? 9 : 6, 1);
  else if (k === 'falcon') for (let i = 0; i < 4; i++) T(2300, .09, .03, 'triangle', 2100, i * .12);
  else if (k === 'jackdaw') { T(950, .08, .035, 'triangle', 800); T(1000, .08, .035, 'triangle', 820, .22); }
  else if (k === 'gull') { T(1250, .35, .035, 'triangle', 820); T(1200, .3, .03, 'triangle', 800, .4); T(1150, .3, .03, 'triangle', 760, .75); }
  else if (k === 'pigeon') { T(430, .45, .04, 'sine', 380); T(410, .6, .035, 'sine', 360, .55); }
  else if (k === 'pelican') nz(.3, 'lowpass', 300, .7, .05);
  else chirp(4, .8);
}
// ラスベガス：崩れる音を、ちぐはぐな音のコラージュにする（ベル、拍手、すべり笛）
function vegasCrash(n) {
  const r = Math.random();
  if (r < .34) { tone(1319, .28, .05, 'triangle'); tone(1760, .32, .045, 'triangle', 0, .09); tone(2093, .4, .04, 'triangle', 0, .18); }
  else if (r < .67) nz(Math.min(1.2, .5 + n * .01), 'bandpass', 2600, .5, .14);
  else tone(320, .55, .06, 'sine', 1300);
  nz(.3, 'lowpass', 400, .7, Math.min(.3, .1 + n * .004), 60);
}
function toggleMute() { muted = !muted; if (MG) MG.gain.value = muted ? 0 : .7; lsSet(MUTE_KEY, muted ? '1' : '0'); }

// ---------- 操作 ----------
const R_MAP = { x: 224, y: 17, w: 36, h: 36 }, R_SPD = { x: 268, y: 17, w: 36, h: 36 }, R_SND = { x: 312, y: 17, w: 36, h: 36 };
const inR = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function btnRect(i) { return { x: 12 + i * 115, y: PY + 38, w: 106, h: 64 }; }
const R_AGAIN = { x: 40, w: 132, h: 44 }, R_TOMAP = { x: 188, w: 132, h: 44 };
function resY() { return 132 + 334; }
function tap(x, y) {
  if (inR(x, y, R_SND)) { toggleMute(); return; }
  if (S.card && S.mode === 'play') { S.card = null; return; }
  if (S.arr && S.arr.t < chapDur()) { S.arr.t = chapDur(); return; } // 章のカードを閉じる
  if (S.mode === 'over' || S.mode === 'win') {
    if (S.endT <= endWait()) return; const ry = resY();
    if (S.mode === 'win') { if (y > ry - 10 && y < ry + 54) { if (clearedN() === STAGES.length && !SV.ended) { SV.ended = 1; save(); filmStart('end'); } else mapEnter(S.si); } return; }
    if (y > ry - 10 && y < ry + 54) { if (x < W / 2) startStage(S.si); else mapEnter(); } return;
  }
  if (inR(x, y, R_MAP)) { mapEnter(); return; }
  if (inR(x, y, R_SPD)) { ff = ff === 1 ? 2 : 1; return; }
  if (y >= PY) { KEYS.forEach((k, i) => { if (inR(x, y, btnRect(i))) buy(k); }); return; }
  S.gx = S.x + x; S.gy = Math.max(90, Math.min(GY - 6, y)); S.gt = 2.5;
  for (const b of S.birds) if (b.st === 1 && Math.random() < .5) b.st = 0;
}
const toLocal = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); audioInit(); const [x, y] = toLocal(e);
  if (scene === 'map') { M.down = { x, y, lon0: M.lon0, lat0: M.lat0, moved: 0 }; try { cv.setPointerCapture(e.pointerId); } catch (er) { } return; }
  if (scene === 'fly') { if (inR(x, y, R_SND)) toggleMute(); else startStage(FLY.si); return; }
  if (scene === 'pass') { passTap(x, y); return; }
  if (scene === 'film') { filmTap(x, y); return; }
  if (scene === 'book') { bookTap(x, y); return; }
  if (scene === 'words') { if (inR(x, y, R_SND)) toggleMute(); else if (inR(x, y, R_WBACK)) { scene = 'pass'; sfx('buy'); } return; }
  tap(x, y);
});
cv.addEventListener('pointermove', e => {
  if (scene !== 'map' || !M.down) return; const [x, y] = toLocal(e), D = M.down, dx = x - D.x, dy = y - D.y;
  if (Math.hypot(dx, dy) > 6) D.moved = 1; if (!D.moved || D.y > 400) return;
  M.lon0 = D.lon0 - dx * .5; M.lat0 = Math.max(-60, Math.min(70, D.lat0 + dy * .35)); M.tLon = null; M.idle = 0;
});
cv.addEventListener('pointerup', e => { if (scene !== 'map' || !M.down) return; const [x, y] = toLocal(e), D = M.down; M.down = null; if (!D.moved) mapTap(x, y); });
document.addEventListener('visibilitychange', () => { if (!AC) return; if (document.hidden) AC.suspend(); else AC.resume(); });

// ---------- 描画 ----------
const UI = { acc: '#F2B84B', accD: 'rgba(242,184,75,.16)', ink: '#F3F4F6', sub: '#9AA1AB', dim: '#5A606B', card: 'rgba(14,16,20,.46)', red: '#E0604A', green: '#68D680', panel: '#121419', btn: '#1C1F26', btnOn: '#262B34' };
const mix = (a, b, u) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',') + ')';
const mixA = (a, b, u, al) => 'rgba(' + a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',') + ',' + al + ')';
const lerp3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
function rr(x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
function txt(s, x, y, size, col, weight, align) { c.font = F(size, weight); c.fillStyle = col; c.textAlign = align || 'left'; c.fillText(s, x, y); }
function spaced(s, x, y, size, col, gap, weight) { c.font = F(size, weight || 700); c.fillStyle = col; c.textAlign = 'left'; let w = 0; for (const ch of s) w += c.measureText(ch).width + gap; w -= gap; let px = x - w / 2; for (const ch of s) { c.fillText(ch, px, y); px += c.measureText(ch).width + gap; } }
function bird(x, y, s, ang, fold, rot, col) { c.save(); c.translate(x, y); c.rotate(rot); c.strokeStyle = col; c.lineWidth = 1.8; c.lineCap = 'round'; c.lineJoin = 'round'; const sp = s * (1 - fold * .7), ex = sp * .5, ey = -Math.sin(ang) * s * .55, ty = -Math.sin(ang) * s * .2 + s * .25 * Math.max(0, ang); c.beginPath(); c.moveTo(-sp, ty); c.lineTo(-ex, ey); c.lineTo(0, 0); c.lineTo(ex, ey); c.lineTo(sp, ty); c.stroke(); c.restore(); }
// v3：鳥の描き分け。頭が上（-y）、羽が左右。ang=羽ばたき fold=たたみ具合（急降下）
const SHP = { // span=羽の長さ chord=羽の幅 sweep=羽先の後ろへの反り tail=尾の形 head=頭の大きさ
  starling: { span: 1, chord: .32, sweep: .15, tail: 'short', head: .15 }, crow: { span: 1.12, chord: .42, sweep: .05, tail: 'fan', head: .17, beak: 1 },
  swallow: { span: 1.28, chord: .2, sweep: .45, tail: 'fork', head: .13, throat: '#D9C6B0' }, owl: { span: 1.05, chord: .5, sweep: 0, tail: 'short', head: .27, eyes: 1 },
  falcon: { span: 1.22, chord: .26, sweep: .32, tail: 'narrow', head: .14 }, pelican: { span: 1.3, chord: .4, sweep: .08, tail: 'short', head: .15, pouch: 1 },
  gull: { span: 1.25, chord: .28, sweep: .2, tail: 'short', head: .15, tips: 1 },
};
function birdS(x, y, s, ang, fold, rot, col, shp) {
  const P = SHP[shp] || SHP.starling; c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col;
  const sp = s * P.span * (1 - fold * .72), up = -Math.sin(ang) * s * .55, ch = s * P.chord;
  for (const d of [-1, 1]) { // 羽：肩 → ひじ → 羽先 → 後ろの縁
    c.beginPath(); c.moveTo(d * s * .08, -s * .14); c.quadraticCurveTo(d * sp * .45, up - ch * .4, d * sp, up * 1.2 + s * P.sweep); c.quadraticCurveTo(d * sp * .5, up * .6 + ch, d * s * .08, s * .16); c.fill();
    if (P.tips) { c.fillStyle = '#1A1C20'; c.beginPath(); c.arc(d * sp * .95, up * 1.15 + s * P.sweep, s * .1, 0, 7); c.fill(); c.fillStyle = col; }
  }
  c.beginPath(); c.ellipse(0, s * .02, s * (P.eyes ? .2 : .13), s * .36, 0, 0, 7); c.fill(); // 胴
  c.beginPath(); c.arc(0, -s * .36, s * P.head, 0, 7); c.fill(); // 頭
  c.beginPath(); // 尾
  if (P.tail === 'fork') { c.moveTo(-s * .06, s * .3); c.lineTo(-s * .2, s * .85); c.lineTo(0, s * .45); c.lineTo(s * .2, s * .85); c.lineTo(s * .06, s * .3); }
  else if (P.tail === 'fan') { c.moveTo(-s * .08, s * .3); c.lineTo(-s * .22, s * .72); c.lineTo(s * .22, s * .72); c.lineTo(s * .08, s * .3); }
  else if (P.tail === 'narrow') { c.moveTo(-s * .06, s * .3); c.lineTo(-s * .08, s * .7); c.lineTo(s * .08, s * .7); c.lineTo(s * .06, s * .3); }
  else { c.moveTo(-s * .08, s * .3); c.lineTo(-s * .12, s * .55); c.lineTo(s * .12, s * .55); c.lineTo(s * .08, s * .3); }
  c.fill();
  if (P.beak) { c.beginPath(); c.moveTo(-s * .06, -s * .48); c.lineTo(0, -s * .66); c.lineTo(s * .06, -s * .48); c.fill(); }
  if (P.pouch) { c.fillStyle = '#E2B25A'; c.beginPath(); c.moveTo(-s * .05, -s * .45); c.lineTo(0, -s * 1.05); c.lineTo(s * .07, -s * .45); c.fill(); }
  if (P.eyes) { c.fillStyle = '#F2D27A'; c.beginPath(); c.arc(-s * .1, -s * .38, s * .06, 0, 7); c.arc(s * .1, -s * .38, s * .06, 0, 7); c.fill(); }
  if (P.throat) { c.fillStyle = P.throat; c.beginPath(); c.arc(0, -s * .2, s * .07, 0, 7); c.fill(); }
  c.restore();
}
const fmtT = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function lstop() { return S.L.x + S.L.w / 2 - BOSSX; }
const wrapX = (base, cam, k, span) => ((base - cam * k) % span + span) % span - (span - W) / 2;
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

function icon(k, x, y, col) {
  c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.7; c.lineCap = 'round'; c.lineJoin = 'round';
  if (k === 'b1') { c.restore(); bird(x - 3, y + 3, 4.6, .55, 0, 0, col); bird(x + 4, y - 3, 4, .55, 0, 0, col); return; }
  if (k === 'b2') { c.beginPath(); c.moveTo(0, -7); c.lineTo(6, -4.5); c.lineTo(5.5, 1); c.quadraticCurveTo(4, 5.5, 0, 7.5); c.quadraticCurveTo(-4, 5.5, -5.5, 1); c.lineTo(-6, -4.5); c.closePath(); c.stroke(); }
  if (k === 'b3') { c.beginPath(); c.moveTo(-5, -5); c.lineTo(4, 4); c.moveTo(4.5, -1.5); c.lineTo(4.5, 4.5); c.lineTo(-1.5, 4.5); c.stroke(); }
  if (k === 'coin') { c.beginPath(); c.moveTo(0, -4.5); c.lineTo(3.8, 0); c.lineTo(0, 4.5); c.lineTo(-3.8, 0); c.closePath(); c.fill(); }
  if (k === 'book') { c.strokeRect(-5.5, -6.5, 11, 13); c.beginPath(); c.moveTo(-2.5, -6.5); c.lineTo(-2.5, 6.5); c.stroke(); c.beginPath(); c.arc(1.5, -.5, 2.2, 0, 7); c.stroke(); }
  if (k === 'film') { c.strokeRect(-6.5, -5, 13, 10); for (const yy of [-7, 7]) for (let xx = -6; xx <= 6; xx += 4) c.fillRect(xx - .8, yy - .8, 1.6, 1.6); c.beginPath(); c.moveTo(-1.5, -2.5); c.lineTo(2.5, 0); c.lineTo(-1.5, 2.5); c.closePath(); c.fill(); }
  if (k === 'globe') { c.beginPath(); c.arc(0, 0, 6.5, 0, 7); c.moveTo(-6.5, 0); c.lineTo(6.5, 0); c.moveTo(0, -6.5); c.ellipse(0, 0, 3, 6.5, 0, 0, 7); c.stroke(); }
  if (k === 'snd' || k === 'mute') { c.beginPath(); c.moveTo(-6, -2.5); c.lineTo(-3, -2.5); c.lineTo(1, -6); c.lineTo(1, 6); c.lineTo(-3, 2.5); c.lineTo(-6, 2.5); c.closePath(); c.fill(); c.beginPath(); if (k === 'snd') { c.arc(1, 0, 4, -.8, .8); c.moveTo(4.2, -5.2); c.arc(1, 0, 6.8, -.8, .8); } else { c.moveTo(3.5, -3); c.lineTo(8, 3); c.moveTo(8, -3); c.lineTo(3.5, 3); } c.stroke(); }
  c.restore();
}

function drawSky(t, cam, z, pr) {
  // 空：都市ごとの昼の色から、象徴に近づくほど夕暮れへ。還ると澄んだ空へ
  const ST = S.st, rc = S.reclaim, clear = [[118, 176, 214], [176, 214, 226], [214, 236, 222]];
  const col = i => mix(lerp3(skyBase(ST, i), ST.sky[1][i], S.wx && S.wx.phase === '夜' ? 0 : pr * .3), clear[i], rc); // v3：現地の時間帯の空から始まり、象徴に近づくと少し暮れる
  const g = c.createLinearGradient(0, 0, 0, GY); g.addColorStop(0, col(0)); g.addColorStop(.62, col(1)); g.addColorStop(1, col(2));
  c.fillStyle = g; c.fillRect(-20, -20, W + 40, GY + 20); skyTint(t, cam);
  if (wxSun()) { const sy = 170 + pr * 270 * (1 - rc), rg = c.createRadialGradient(W * .7, sy, 0, W * .7, sy, 190);
  rg.addColorStop(0, 'rgba(255,244,222,' + (.38 + .2 * pr) + ')'); rg.addColorStop(1, 'rgba(255,244,222,0)'); c.fillStyle = rg; c.fillRect(-20, -20, W + 40, GY + 20); }
  for (const [n, k, y0, al, s] of [[5, .06, 130, .16, 1.4], [6, .18, 210, .12, 1]]) {
    c.fillStyle = 'rgba(255,255,255,' + (al * (S.wx && S.wx.phase === '夜' ? .35 : 1) + (S.rainOn ? .06 : 0)) + ')';
    for (let i = 0; i < n; i++) { const x = wrapX(i * 173 + 40, cam, k, W + 300), y = y0 + ((i * 53) % 90); c.beginPath(); c.ellipse(x, y, 70 * s, 9 * s, 0, 0, 7); c.ellipse(x + 30 * s, y - 6 * s, 40 * s, 8 * s, 0, 0, 7); c.fill(); }
  }
  // 遠い丘の稜線（還ると緑）
  c.fillStyle = mix(lerp3([120, 130, 146], [96, 80, 100], pr), [92, 150, 110], rc); c.globalAlpha = .45; c.beginPath(); c.moveTo(-10, GY);
  for (let x = -10; x <= W + 10; x += 8) { const u = x + cam * .12; c.lineTo(x, GY - 58 - 24 * Math.sin(u * .011) - 12 * Math.sin(u * .029 + 1.3)); }
  c.lineTo(W + 10, GY); c.fill(); c.globalAlpha = 1;
  // 中景：区間ごとの街並みのシルエット
  const sil = ST.zones[z].sil; c.fillStyle = mixA(lerp3([84, 92, 106], [70, 60, 78], pr), [84, 128, 98], rc, .32);
  for (let i = 0; i < 14; i++) { const x = wrapX(i * 83, cam, .4, W + 200), bh = (sil[0] + ((i * 37) % sil[1])) * (1 - rc * .7), bw = 26 + (i % 3) * 8; c.fillRect(x, GY - bh, bw, bh); }
  const hz = lerp3(lerp3(skyBase(ST, 2), ST.sky[1][2], S.wx && S.wx.phase === '夜' ? 0 : pr * .3), clear[2], rc), hg = c.createLinearGradient(0, GY - 90, 0, GY); hg.addColorStop(0, mixA(hz, hz, 0, 0)); hg.addColorStop(1, mixA(hz, hz, 0, .55));
  c.fillStyle = hg; c.fillRect(-20, GY - 90, W + 40, 90);
  if (S.dark) { c.fillStyle = 'rgba(22,26,40,' + (.5 * S.dark) + ')'; c.fillRect(-20, -20, W + 40, GY + 20); }
}
function drawGround(t, cam) {
  const rc = S.reclaim, gg = c.createLinearGradient(0, GY, 0, PY + 20);
  gg.addColorStop(0, rc ? mix([84, 90, 96], [86, 128, 70], rc) : S.st.ground[0]); gg.addColorStop(1, rc ? mix([46, 50, 56], [48, 74, 42], rc) : S.st.ground[1]);
  c.fillStyle = gg; c.fillRect(-20, GY, W + 40, PY - GY + 40);
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(-20, GY, W + 40, 1);
  // 島のボス：手前から海、島の上だけ岩（象徴なら画面の右まで海、中ボスなら島のまわりだけ）
  for (const B of S.bossList) {
    if (!B.island || B.x - cam > W + 200 || B.x + B.w + 200 - cam < 0) continue;
    const sx = B.x - 70 - cam, ew = B.final ? W + 400 : B.w + 140, sg = c.createLinearGradient(0, GY, 0, PY + 20); sg.addColorStop(0, '#5D7287'); sg.addColorStop(1, '#2E3A48');
    c.fillStyle = sg; c.fillRect(sx, GY + 3, ew, PY - GY + 40); c.fillStyle = '#5A5850'; rr(B.x - 24 - cam, GY + 1, B.w + 48, 14, 6); c.fill();
    c.fillStyle = 'rgba(255,255,255,.22)'; for (let i = 0; i < 9; i++) { const x = sx + ((i * 47 + t * 12) % Math.max(60, ew)); if (x > B.x - 26 - cam && x < B.x + B.w + 26 - cam) continue; c.fillRect(x, GY + 15 + (i % 3) * 6, 12 + (i % 2) * 8, 1.2); }
  }
  // アビー・ロードの横断歩道
  for (const b of S.bossList) if (b.deco === 'zebra' && b.x - cam < W + 120 && b.x - cam > -260) { c.fillStyle = 'rgba(240,240,236,.75)'; for (let i = 0; i < 6; i++) c.fillRect(b.x - 120 + i * 14 - cam, GY + 6, 8, 18); }
}
// 草木：盛り土と、育っていく木
function drawFlora(f, cam, t) {
  const g = Math.min(1, f.t / 2.5), x0 = f.x - cam; if (x0 > W + 60 || x0 + f.w < -60) return;
  c.fillStyle = 'rgba(78,128,64,' + (.85 * g) + ')'; c.beginPath(); c.ellipse(x0 + f.w / 2, GY + 1, f.w / 2 + 10, 7 * g, 0, Math.PI, 0); c.fill();
  const n = Math.max(1, Math.round(f.w / 22)) + (f.big ? 2 : 0);
  for (let i = 0; i < n; i++) {
    const u = hash(f.seed, i), gx = x0 + (i + .5) * f.w / n + (u - .5) * 10, d = Math.min(1, Math.max(0, (f.t - u * .8) / 2.2)), h = (16 + u * 22) * (f.big ? 1.5 : 1) * d;
    if (h < 1) continue; const sway = Math.sin(t * 1.4 + u * 9) * 1.2;
    c.strokeStyle = '#5B4632'; c.lineWidth = 2; c.beginPath(); c.moveTo(gx, GY); c.lineTo(gx + sway, GY - h); c.stroke();
    const r = (5 + u * 6) * (f.big ? 1.4 : 1) * d;
    for (const [dx, dy, cc] of [[0, 0, '#4E8A4C'], [-r * .6, r * .35, '#5F9E55'], [r * .6, r * .3, '#3F7843']]) { c.fillStyle = cc; c.beginPath(); c.arc(gx + sway + dx, GY - h + dy, r, 0, 7); c.fill(); }
    if (u > .6) { c.fillStyle = '#F2E6A0'; c.fillRect(gx + 6, GY - 3, 2, 2); }
  }
}
function drawWorld(t) {
  const cam = S.x, z = zoneAt(cam + 200), L = S.L, pr = Math.min(1, cam / lstop()), rc = S.reclaim;
  c.save(); c.beginPath(); c.rect(0, 0, W, PY + 24); c.clip();
  if (S.shake > 0) c.translate((Math.random() - .5) * S.shake, (Math.random() - .5) * S.shake);
  drawSky(t, cam, z, pr);
  const pulse = .5 + .5 * Math.sin(t * 6), G = S.gim, moss = [96, 142, 82], labels = [];
  for (const b of S.blds) {
    if (b.x - cam > W + 10 || b.x + b.w - cam < -10) continue; const hot = S.siege && b === S.boss, mo = Math.max(rc, b.gone ? Math.min(1, (S.t - (b.goneT ?? (b.goneT = S.t))) * .4) : 0);
    const glow = hot && (b.gim === 'glare' || b.gim === 'map') ? (G.flash > 0 ? 1 : G.warn > 0 ? .5 + .5 * Math.sin(t * 30) : 0) : 0;
    const sw = hot && b.gim === 'sway' && G.warn > 0 ? Math.sin(t * 13) * 5 : 0; let top = -1;
    for (const q of b.cells.values()) {
      const col = MAT[q.m].col, f = Math.max(.5, Math.min(1, q.hp / q.h0));
      let cc = col.map(v => v * (.6 + .4 * f));
      if (hot && q.m === b.core) cc = lerp3(col, [255, 255, 255], .15 + .35 * pulse);
      if (hot && b.gim === 'map' && q.m !== b.core && !(G.flash > 0)) cc = lerp3(cc, MAPC[Math.floor((q.r + t * 14) / 4) % 4], .22 + (G.warn > 0 ? .45 : 0));
      if (glow && (b.gim === 'map' ? q.m !== b.core : (b.shine || ['gd', 'gc']).includes(q.m))) cc = lerp3(cc, [255, 250, 220], glow * .8);
      if (b.gim === 'eye' && q.m !== b.core) cc = sphereCol(b, q, t, hot).map(v => v * (.6 + .4 * f));
      if (mo) { const h = hash(q.r, q.k + b.x); if (h < mo * .9) cc = lerp3(cc, moss, .5 + .3 * h); }
      if (q.r > top) top = q.r; c.fillStyle = 'rgb(' + cc.map(Math.round).join(',') + ')'; c.fillRect(b.x + q.k * CS - cam + (sw && q.m === b.core ? sw : 0), GY - (q.r + 1) * CS, CS - 1, CS - 1);
    }
    if (b.lm && !b.gone && top >= 0) labels.push([b.x + b.w / 2 - cam, GY - (top + 1) * CS, b.lm]);
    // バタシーの煙（炉が生きている間）
    if (b.smoke && !S.lightOut) for (const k0 of b.stacks) for (let i = 0; i < 4; i++) { const u = ((t * .3 + i * .25 + k0 * .07) % 1), sx = b.x + (k0 + 2) * CS - cam + u * 30, sy = GY - 45 * CS - u * 70; c.fillStyle = 'rgba(220,220,224,' + (.35 * (1 - u)) + ')'; c.beginPath(); c.arc(sx, sy, 5 + u * 14, 0, 7); c.fill(); }
    // データセンターの上昇気流
    if (b.gim === 'fan' && hot && G.fan) { c.strokeStyle = 'rgba(200,230,255,' + (.25 * G.fan / G.fan0) + ')'; c.lineWidth = 1.2; for (let i = 0; i < 9; i++) { const x = b.x + 18 + i * 30 - cam, ph = (t * 2 + i * .37) % 1; c.beginPath(); for (let k = 0; k <= 8; k++) { const yy = GY - b.roof * CS - 8 - (ph * 60 + k * 12) % 130; if (k) c.lineTo(x + Math.sin(yy * .08 + i) * 4, yy); else c.moveTo(x + Math.sin(yy * .08 + i) * 4, yy); } c.stroke(); } }
  }
  for (const ch of S.chunks) { c.save(); c.translate(ch.x - cam, ch.y); c.rotate(ch.a); for (const q of ch.cells) { c.fillStyle = rgb(q.m); c.fillRect(q.lx - CS / 2, q.ly - CS / 2, CS - 1, CS - 1); } c.restore(); }
  drawGround(t, cam);
  for (const p of S.parts) { c.fillStyle = p.col; c.fillRect(p.x - cam, p.y, p.s, p.s); }
  for (const f of S.flora) drawFlora(f, cam, t);
  if (rc < 1) drawLabels(labels);
  if (G.wave) { const u = G.wave.t / .6; c.strokeStyle = 'rgba(255,214,90,' + (1 - u) * .8 + ')'; c.lineWidth = 3; c.beginPath(); c.arc(G.wave.x - cam, G.wave.y, 20 + u * 150, 0, 7); c.stroke(); }
  if (S.slow) txt('牛歩戦術中', S.boss.x + S.boss.w / 2 - cam, Math.max(150, S.ringY - 70), 13, 'rgba(242,184,75,' + (.6 + .4 * Math.sin(t * 5)) + ')', 700, 'center');
  // 反射光：狙いの輪 → 光の柱
  if (G.aim) { const a = 1 - G.aim.t / 1.4; c.strokeStyle = 'rgba(255,226,150,' + (.4 + .5 * a) + ')'; c.lineWidth = 1.6; c.setLineDash([5, 4]); c.beginPath(); c.arc(G.aim.x - cam, G.aim.y, 46 * (1.6 - .6 * a), 0, 7); c.stroke(); c.setLineDash([]); }
  if (G.burn) { const B = S.boss, a = G.burn.t / .45, sx = B.x + B.w / 2 - cam, sy = GY - 26 * CS; c.strokeStyle = 'rgba(255,240,190,' + a + ')'; c.lineWidth = 6 * a + 2; c.beginPath(); c.moveTo(sx, sy); c.lineTo(G.burn.x - cam, G.burn.y); c.stroke(); c.fillStyle = 'rgba(255,236,170,' + .6 * a + ')'; c.beginPath(); c.arc(G.burn.x - cam, G.burn.y, 46, 0, 7); c.fill(); }
  // ルクソールの光の柱：予告の点線 → 柱
  if (S.siege && S.boss.gim === 'pillar' && G.px != null && !S.boss.dead) {
    const x = G.px - cam;
    if (G.pon > 0) { const a = Math.min(1, G.pon / .3); c.fillStyle = 'rgba(255,246,210,' + (.3 * a) + ')'; c.fillRect(x - 24, 0, 48, G.py); c.fillStyle = 'rgba(255,252,236,' + (.75 * a) + ')'; c.fillRect(x - 6, 0, 12, G.py); }
    else if (G.warn > 0) { c.strokeStyle = 'rgba(255,240,200,' + (.3 + .4 * Math.sin(t * 20) ** 2) + ')'; c.lineWidth = 1.5; c.setLineDash([6, 5]); c.beginPath(); c.moveTo(x, G.py); c.lineTo(x, 0); c.stroke(); c.setLineDash([]); }
  }
  // ルイ・ヴィトン財団の横風
  if (S.siege && S.boss.gim === 'gust' && (G.gust > 0 || G.warn > 0)) {
    const g = G.gust > 0; c.strokeStyle = 'rgba(236,244,250,' + (g ? .5 : .15) + ')'; c.lineWidth = 1.2; c.beginPath();
    for (let i = 0; i < 26; i++) { const y = 110 + (i * 61) % 380, x = W + 60 - ((i * 137 + t * (g ? 900 : 260)) % (W + 120)); c.moveTo(x, y); c.lineTo(x + 30 + (i % 3) * 14, y); } c.stroke();
  }
  if (S.bb) { const u = S.bb.t; if (u > 7) S.bb = null; else { const x = S.bb.x - cam + u * 40, y = S.bb.y - u * 55 - Math.sin(u * 3) * 8; birdS(x, y, 8, Math.sin(t * 13) * .7, 0, -.2, '#08080A', 'starling'); c.fillStyle = '#E8A93A'; c.beginPath(); c.arc(x, y - 4, 1.4, 0, 7); c.fill(); } }
  for (const q of S.inc) { const sp = BIRD[S.st.bird]; birdS(q.x - cam, q.y, sp.s * .93, Math.sin(t * 16 + q.ph) * .65, 0, Math.atan2(q.vy, Math.abs(q.vx) + 1) * .5 * Math.sign(q.vx || 1), sp.col, sp.shape); }
  for (const b of S.birds) { if (b.st === 2) continue; const P = b.sp.lvP || 0, Q = b.sp.lvS || 0; if (!P && !Q) continue; const x = b.x - cam;
    if (Q && b.st === 1) { c.strokeStyle = 'rgba(255,255,255,' + (.18 + .12 * Q) + ')'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, b.y); c.lineTo(x - b.vx * .05 * Q, b.y - b.vy * .05 * Q); c.stroke(); }
    if (P) { c.fillStyle = KUI[b.sp.key] || '#fff'; c.globalAlpha = .12 + .1 * P; c.beginPath(); c.arc(x, b.y, b.sp.s * (.75 + .1 * P), 0, 7); c.fill(); c.globalAlpha = 1; } } // 育てた鳥の光（威力）と軌跡（速さ）
  for (const b of S.birds) { const s = b.sp.s; birdS(b.x - cam, b.y, b.st === 0 && b.depth != null ? s * (1 + .28 * b.depth) : s, b.st === 2 ? .1 : b.st === 1 ? 0 : Math.sin(t * 14 + b.ph) * .6, b.st === 1 ? 1 : b.stun > 0 ? .4 : 0, b.st === 2 ? b.rot : b.st === 1 ? Math.atan2(b.vy, b.vx) + Math.PI / 2 : (b.stun > 0 ? -.6 : Math.atan2(b.vy, Math.max(60, Math.abs(b.vx))) * .6 * Math.sign(b.vx || 1)), b.st === 2 ? '#555A62' : b.sp.col, b.sp.shape); }
  if (S.gt > 0) { const u = 2.5 - S.gt; c.strokeStyle = 'rgba(242,184,75,' + Math.min(.8, S.gt * .4) + ')'; c.lineWidth = 1.5; c.beginPath(); c.arc(S.gx - cam, S.gy, 8 + u * 8, 0, 7); c.stroke(); c.fillStyle = UI.acc; c.beginPath(); c.arc(S.gx - cam, S.gy, 2.5, 0, 7); c.fill(); }
  c.lineWidth = 1; for (const p of S.pops) { c.strokeStyle = 'rgba(20,22,26,' + (1 - p.t / .4) + ')'; c.beginPath(); c.arc(p.x - cam, p.y, 3 + p.t * 20, 0, 7); c.stroke(); }
  for (const q of S.txt) { c.globalAlpha = Math.max(0, 1 - q.t / 1.1); txt(q.s, q.x - cam, q.y, 13, '#15181D', 700, 'center'); } c.globalAlpha = 1;
  drawSkyFx(t);
  if (S.drops.length && rc < 1) { c.strokeStyle = 'rgba(220,228,238,' + (.35 * (1 - rc)) + ')'; c.lineWidth = 1; c.beginPath(); for (const d of S.drops) { c.moveTo(d.x, d.y); c.lineTo(d.x + 3, d.y - 12); } c.stroke(); }
  if (G.flash > 0 && S.boss.gim === 'glare') { c.fillStyle = 'rgba(255,250,225,' + (G.flash / .45) * .5 + ')'; c.fillRect(0, 0, W, PY + 24); }
  c.restore();
}
function drawHUD(t) {
  const n = aliveN(), ST = S.st;
  rr(12, 12, 206, 46, 14); c.fillStyle = UI.card; c.fill();
  if (S.mode === 'win' && S.endT > 5.4) { txt('還った土地', 26, 29, 10, UI.sub, 500); txt(S.area + ' ha', 26, 50, 19, UI.green, 700); } // v3：還ったら得点は消える
  else { txt('得点', 26, 29, 10, UI.sub, 500); txt(S.score.toLocaleString(), 26, 50, 19, UI.ink, 700); }
  c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(132, 22, 1, 26);
  txt('群れ', 146, 29, 10, UI.sub, 500); txt(String(n), 146, 50, 19, S.lostT > 0 ? UI.red : UI.ink, 700);
  c.font = F(19, 700); bird(146 + c.measureText(String(n)).width + 13, 44, 5, .5, 0, 0, UI.sub);
  const X0 = 16, BW = 328, Y = 70, ls = lstop(), pr = Math.min(1, S.x / ls);
  rr(X0, Y - 3, BW, 6, 3); c.fillStyle = 'rgba(14,16,20,.30)'; c.fill();
  rr(X0, Y - 3, Math.max(6, BW * pr), 6, 3); c.fillStyle = 'rgba(243,244,246,.9)'; c.fill();
  for (const Z of ST.zones) { if (!Z.x) continue; c.fillStyle = 'rgba(14,16,20,.55)'; c.beginPath(); c.arc(X0 + BW * Math.min(1, Z.x / ls), Y, 1.6, 0, 7); c.fill(); }
  for (const bb of S.bossList) { const zx = X0 + BW * Math.min(1, (bb.x + bb.w / 2 - BOSSX) / ls); c.save(); c.translate(zx, Y); c.rotate(Math.PI / 4); c.fillStyle = bb.dead ? UI.green : UI.red; c.fillRect(-4, -4, 8, 8); c.restore(); }
  c.fillStyle = UI.acc; c.beginPath(); c.arc(X0 + BW * pr, Y, 4.5, 0, 7); c.fill(); c.strokeStyle = 'rgba(242,184,75,.35)'; c.lineWidth = 3; c.beginPath(); c.arc(X0 + BW * pr, Y, 7.5, 0, 7); c.stroke();
  const z = zoneAt(S.x + FLX + 120);
  if (S.siege) {
    const B = S.boss, lo = B.final && S.lightOut, f = lo ? Math.max(0, (B.cells.size - B.n0 * .25) / (B.n0 * .75)) : coreLeft(B) / Math.max(1, B.core0);
    rr(12, 84, 336, 26, 13); c.fillStyle = UI.card; c.fill();
    c.font = F(12, 700); let nm = B.name; while (c.measureText(nm).width > 128 && nm.length > 2) nm = nm.slice(0, -1); if (nm !== B.name) nm += '…';
    txt(nm + (lo ? '　崩しきれ' : ''), 26, 102, 12, UI.ink, 700);
    rr(196, 94, 138, 6, 3); c.fillStyle = 'rgba(255,255,255,.12)'; c.fill(); if (f > 0) { rr(196, 94, Math.max(6, 138 * f), 6, 3); c.fillStyle = UI.red; c.fill(); }
  } else { const s = ST.city + '・' + ST.zones[z].n + (S.wx ? '　' + wxShort(S.wx) : ''); c.font = F(12, 700); const w = c.measureText(s).width + 24; rr(12, 84, w, 24, 12); c.fillStyle = UI.card; c.fill(); txt(s, 24, 101, 12, UI.ink, 700); }
  drawToggles();
}
function drawToggles() {
  const list = [[R_SND, muted ? 'mute' : 'snd']]; if (scene === 'game' && S.mode === 'play') list.unshift([R_MAP, 'globe'], [R_SPD, ff + '×']);
  for (const [r, k] of list) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2; c.fillStyle = scene === 'map' ? 'rgba(255,255,255,.08)' : UI.card; c.beginPath(); c.arc(cx, cy, r.w / 2, 0, 7); c.fill();
    if (k === 'snd' || k === 'mute' || k === 'globe') icon(k, cx - (k === 'globe' ? 0 : 1), cy, UI.ink); else txt(k, cx, cy + 4.5, 13, ff > 1 ? UI.acc : UI.ink, 700, 'center');
  }
}
function drawBanner() {
  const B = S.banner; if (!B) return; const a = Math.min(1, B.t / .25, (B.d - B.t) / .4), dy = (1 - Math.min(1, B.t / .25)) * 10; c.globalAlpha = Math.max(0, a);
  // 説明が長いときは2行に折る
  c.font = F(11, 500); const lines = []; let cur = ''; for (const ch of B.b) { if (c.measureText(cur + ch).width > W - 110) { lines.push(cur); cur = ''; } cur += ch; } lines.push(cur);
  const h = 58 + lines.length * 15; rr(36, 196 + dy, W - 72, h, 18); c.fillStyle = 'rgba(14,16,20,.76)'; c.fill();
  rr(W / 2 - 16, 206 + dy, 32, 3, 1.5); c.fillStyle = UI.acc; c.fill();
  txt(B.a, W / 2, 237 + dy, 21, UI.ink, 700, 'center'); lines.forEach((s, i) => txt(s, W / 2, 256 + i * 15 + dy, 11, UI.acc, 500, 'center')); c.globalAlpha = 1;
}
function drawPanel(t) {
  c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 16; c.shadowOffsetY = -2;
  rr(0, PY, W, H - PY + 24, 20); c.fillStyle = UI.panel; c.fill(); c.restore();
  rr(W / 2 - 18, PY + 6, 36, 3, 1.5); c.fillStyle = 'rgba(255,255,255,.10)'; c.fill();
  const play = S.mode === 'play';
  icon('coin', 22, PY + 22, UI.acc); txt(String(Math.floor(S.pts)), 32, PY + 27, 15, UI.ink, 700); txt('ポイント', 32 + (c.measureText(String(Math.floor(S.pts))).width) + 6, PY + 27, 10, UI.sub, 500);
  txt('ボタンで鳥を呼ぶ　·　呼ぶほど高くなる', W - 16, PY + 27, 10, UI.sub, 500, 'right');
  KEYS.forEach((k, i) => {
    const r = btnRect(i), kk = S.team[i], u = S.kinds[kk], cw = S.cdn[k] > 0, ok = play && S.pts >= S.cost[k] && !cw, fl = S.flash[k], dx = fl < 0 ? Math.sin(t * 60) * 3 * (-fl / .35) : 0, x = r.x + dx;
    rr(x, r.y, r.w, r.h, 14); c.fillStyle = ok ? UI.btnOn : UI.btn; c.fill();
    if (fl > 0) { rr(x, r.y, r.w, r.h, 14); c.fillStyle = 'rgba(242,184,75,' + fl * 1.2 + ')'; c.fill(); }
    if (ok) { rr(x + .75, r.y + .75, r.w - 1.5, r.h - 1.5, 13.5); c.lineWidth = 1.5; c.strokeStyle = 'rgba(242,184,75,' + (.55 + .35 * Math.sin(t * 4)) + ')'; c.stroke(); }
    c.fillStyle = ok ? UI.accD : 'rgba(255,255,255,.05)'; c.beginPath(); c.arc(x + 21, r.y + 21, 13, 0, 7); c.fill();
    birdS(x + 21, r.y + 22, 9, .5, 0, 0, ok ? KUI[kk] : UI.dim, u.shape);
    txt(u.name, x + 39, r.y + 21, 12.5, ok ? UI.ink : UI.sub, 700); txt('×' + u.n + '　威力 ' + Math.round(S.atk * u.am * (u.wall || 1)), x + 39, r.y + 35, 9.5, ok ? KUI[kk] : UI.dim, 700);
    c.font = F(9.5, 500); let ro = u.role; while (c.measureText(ro).width > r.w - 16 && ro.length > 2) ro = ro.slice(0, -1); txt(ro, x + 9, r.y + 47, 9.5, ok ? '#C9CED6' : UI.dim, 500);
    icon('coin', x + 15, r.y + 54, ok ? UI.acc : UI.dim); txt(String(S.cost[k]), x + 23, r.y + 58, 12, ok ? UI.acc : UI.dim, 700);
    if (cw) { const f = S.cdn[k] / u.cd; rr(x, r.y, r.w, r.h, 14); c.fillStyle = 'rgba(8,9,12,.55)'; c.fill(); c.fillStyle = 'rgba(242,184,75,.7)'; c.fillRect(x + 14, r.y + r.h - 3, (r.w - 28) * (1 - f), 2); txt(S.cdn[k].toFixed(1) + '秒', x + r.w - 10, r.y + 58, 10, UI.acc, 700, 'right'); }
    const p = play ? Math.min(1, S.pts / S.cost[k]) : 0; if (p > 0 && !ok && !cw) { c.fillStyle = 'rgba(242,184,75,.45)'; c.fillRect(x + 14, r.y + r.h - 3, (r.w - 28) * p, 2); }
  });
}
// 還った時は草木が育つのを見せてから結果を出す
function endWait() { return S.mode === 'win' ? 6.6 : 1; } // 還った時：草木が育つ → 3.2 秒で結果 → 得点が崩れて土地に置き換わる → ボタン
function pillAt(label, x, y, w, on) { rr(x, y, w, 44, 22); c.fillStyle = on ? UI.acc : 'rgba(255,255,255,.10)'; c.fill(); txt(label, x + w / 2, y + 28, 14, on ? '#17191E' : UI.ink, 700, 'center'); }
function drawResult(t) {
  const win = S.mode === 'win', a = Math.max(0, Math.min(1, (S.endT - (win ? 3.2 : endWait() - 1)) / .6)); if (!a) return; c.globalAlpha = a;
  c.fillStyle = 'rgba(14,16,20,' + (win ? .2 : .4) + ')'; c.fillRect(0, 0, W, PY);
  const y0 = 132 + (1 - a) * 14; rr(24, y0, W - 48, 314, 22); c.fillStyle = 'rgba(18,20,25,.92)'; c.fill();
  if (win) { spaced('RECLAIMED', W / 2, y0 + 50, 26, UI.green, 5); txt(S.st.end, W / 2, y0 + 74, 12, UI.sub, 500, 'center'); txt(BOSS[S.st.final].after || '', W / 2, y0 + 92, 11, UI.green, 500, 'center'); }
  else { txt('群れが尽きた', W / 2, y0 + 48, 22, UI.ink, 700, 'center'); txt(S.lightOut ? S.L.out + 'が、' + S.L.name + 'は残った' : S.st.city + '・' + S.st.zones[Math.max(0, S.zone)].n + 'で力尽きた', W / 2, y0 + 73, 12, UI.sub, 500, 'center'); }
  if (win) { drawReclaimResult(t, y0); if (S.endT > endWait()) pillAt('地球へ戻る', W / 2 - 94, resY(), 188, true); c.globalAlpha = 1; return; }
  const rows = [['時間', fmtT(S.t)], ['崩した象徴', S.killed.length ? S.killed.length + ' / ' + S.bossList.length : 'なし'], ['還した名所', S.lmDown + ' / ' + S.lmN], ['失った鳥', S.lost + ' 羽'], ['最大の群れ', S.peak + ' 羽']];
  rows.forEach(([k, v], i) => { const y = y0 + 114 + i * 25; c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(48, y - 17, W - 96, 1); txt(k, 48, y, 12, UI.sub, 500); txt(v, W - 48, y, 12, UI.ink, 600, 'right'); });
  txt('得点', 48, y0 + 262, 12, UI.sub, 500); txt(S.score.toLocaleString(), W - 48, y0 + 266, 28, UI.ink, 700, 'right');
  if (S.newBest) { rr(W / 2 - 62, y0 + 280, 124, 22, 11); c.fillStyle = UI.accD; c.fill(); txt('最高得点を更新', W / 2, y0 + 295, 11, UI.acc, 700, 'center'); }
  else txt('最高得点  ' + (SV.best[S.st.id] || 0).toLocaleString(), W / 2, y0 + 295, 11, UI.sub, 500, 'center');
  if (S.endT > endWait()) { const ry = resY(); if (win) pillAt('地球へ戻る', W / 2 - 94, ry, 188, true); else { pillAt('もう一度', R_AGAIN.x, ry, R_AGAIN.w, true); pillAt('地球へ戻る', R_TOMAP.x, ry, R_TOMAP.w, false); } }
  c.globalAlpha = 1;
}
// v3：還った時の結果。得点は少し見せたあと崩れ落ち、「還った土地」「戻った鳥」に置き換わる。下にごほうび
function drawReclaimResult(t, y0) {
  const rows = [['時間', fmtT(S.t)], ['崩した象徴', S.killed.length + ' / ' + S.bossList.length], ['還した名所', S.lmDown + ' / ' + S.lmN], ['失った鳥', S.lost + ' 羽']];
  rows.forEach(([k, v], i) => { const y = y0 + 116 + i * 23; c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(48, y - 16, W - 96, 1); txt(k, 48, y, 12, UI.sub, 500); txt(v, W - 48, y, 12, UI.ink, 600, 'right'); });
  const u = Math.max(0, Math.min(1, (S.endT - 4.4) / 1)), ys = y0 + 222;
  if (u < 1) { // 得点の数字が1つずつ崩れ落ちる
    const s = S.score.toLocaleString(); c.font = F(26, 700); let x = W - 48 - c.measureText(s).width; txt('得点', 48, ys, 12, UI.sub, 500);
    [...s].forEach((ch, i) => { const w = c.measureText(ch).width, d = Math.max(0, u * 1.6 - hash(i, 7) * .6); c.globalAlpha = Math.max(0, 1 - d) * Math.min(1, (S.endT - 3.2) / .6); txt(ch, x, ys + 4 + d * d * 70, 26, UI.ink, 700); x += w; });
    c.globalAlpha = 1;
  }
  if (u > .3) { const b = Math.min(1, (u - .3) / .5); c.globalAlpha = b; txt('還った土地', 48, ys - 6, 12, UI.sub, 500); txt(S.area + ' ha', W - 48, ys - 2, 24, UI.green, 700, 'right'); txt('戻った鳥', 48, ys + 20, 12, UI.sub, 500); txt(aliveN() + ' 羽', W - 48, ys + 22, 14, UI.green, 700, 'right'); c.globalAlpha = 1; }
  const R = S.reward; if (!R || S.endT < 5.6) return; c.globalAlpha = Math.min(1, (S.endT - 5.6) / .5);
  let y = ys + 46; for (const l of wrapL('「' + R.verse + '」', W - 96, 12, 600)) { txt(l, W / 2, y, 12, '#DDE8C8', 600, 'center'); y += 17; }
  if (R.kind) { const K = KIND[R.kind]; rr(40, y - 2, W - 80, 26, 13); c.fillStyle = 'rgba(242,184,75,.14)'; c.fill(); birdS(58, y + 11, 7, .5, 0, 0, KUI[R.kind], K.shape); txt('新しい仲間：' + K.name + '　○' + K.like.map(t => TAGN[t]).join('') + ' ×' + K.hate.map(t => TAGN[t]).join(''), 74, y + 15, 11, UI.acc, 700); y += 30; }
  txt('羽 +' + R.fe + '（図鑑で鳥を育てる）', W / 2, y + 12, 10, UI.sub, 600, 'center');
  c.globalAlpha = 1;
}
function draw(t) {
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.textBaseline = 'alphabetic';
  if (scene === 'map') { drawMap(t); return; }
  if (scene === 'fly') { drawFly(t); return; }
  if (scene === 'pass') { drawPass(t); return; }
  if (scene === 'film') { drawFilm(t); return; }
  if (scene === 'book') { drawBook(t); return; }
  if (scene === 'words') { drawWords(t); return; }
  drawWorld(t); drawHUD(t); drawBanner(); drawToast(); drawArrival(t); drawCard(t); if (S.mode !== 'play') drawResult(t); drawPanel(t);
}

// ---------- 名所の札・建物のカード・到着のカード ----------
const MAPC = [[255, 90, 160], [90, 200, 255], [255, 220, 90], [140, 255, 160]]; // 都庁の映像の色
// スフィアの LED：ふだんは色の帯が流れ、包囲中は目玉が開く（S.gim.eo＝開き具合 0〜1）
function sphereCol(b, q, t, hot) {
  const e = hot ? S.gim.eo || 0 : 0, dx = q.k - b.eye[0], dy = q.r - b.eye[1], d = Math.hypot(dx, dy);
  if (e > 0 && Math.abs(dx) < 21 && Math.abs(dy) <= 11 * e * (1 - (dx / 21) ** 2)) return d < 10 ? lerp3([40, 90, 200], [120, 200, 255], d / 10) : [236, 236, 230];
  if (hot && !e && Math.abs(dy) < .6 && Math.abs(dx) < 20) return [250, 230, 200]; // 閉じた目の線
  return lerp3(MAPC[Math.floor((q.r + q.k * .3 + t * 8) / 5) % 4].map(v => v * .55), [36, 40, 58], .35);
}
function wrapL(s, maxW, size, weight) { c.font = F(size, weight || 500); const out = []; let cur = ''; for (const ch of s) { if (cur && c.measureText(cur + ch).width > maxW) { out.push(cur); cur = ''; } cur += ch; } if (cur) out.push(cur); return out; }
// 名所の札：建物の頂の上に名前を出す（画面の上の HUD には重ねない）
function drawLabels(L) {
  for (const [x, y, s] of L) {
    c.font = F(10, 700); const w = c.measureText(s).width + 14, cx = Math.max(w / 2 + 6, Math.min(W - w / 2 - 6, x)), yy = Math.max(124, y - 26);
    if (y - yy > 19) { c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(Math.round(x), yy + 17, 1, y - yy - 19); }
    rr(cx - w / 2, yy, w, 17, 8.5); c.fillStyle = 'rgba(14,16,20,.62)'; c.fill(); txt(s, cx, yy + 12, 10, '#F3F4F6', 700, 'center');
  }
}
function drawToast() {
  const T = S.toast; if (!T) return; const a = Math.max(0, Math.min(1, T.t / .2, (2.4 - T.t) / .4)); c.globalAlpha = a;
  c.font = F(12, 700); const s = T.s + (T.plain ? '' : '　+40'), w = c.measureText(s).width + 28, y = 118; rr(W / 2 - w / 2, y, w, 26, 13); c.fillStyle = T.plain ? 'rgba(20,22,28,.8)' : 'rgba(30,60,36,.85)'; c.fill(); txt(s, W / 2, y + 17, 12, T.plain ? '#E6E2D8' : '#BFF0C8', 700, 'center'); c.globalAlpha = 1;
}
// 包囲が始まる時の建物のカード：名前、場所と年、説明、鳥の言い分、遊び方
function drawCard(t) {
  const K = S.card; if (!K) return; const B = K.B, D = BOSS[B.id], a = Math.max(0, Math.min(1, K.t / .25, (5 - K.t) / .3)); c.globalAlpha = a;
  const fact = wrapL(D.fact || '', W - 72, 11), say = wrapL(D.say || '', W - 104, 13, 700), sub = wrapL(D.sub || '', W - 72, 10.5);
  const y0 = 82, bh = say.length * 18 + 20, h = 100 + fact.length * 15 + bh + 12 + sub.length * 14 + 6 + 26 + 28;
  rr(16, y0, W - 32, h, 18); c.fillStyle = 'rgba(14,16,20,.9)'; c.fill();
  c.font = F(10, 700); const cw = c.measureText(D.kind).width + 18; rr(30, y0 + 14, cw, 18, 9); c.fillStyle = D.kind === '象徴' ? 'rgba(224,96,74,.85)' : 'rgba(224,96,74,.45)'; c.fill(); txt(D.kind, 30 + cw / 2, y0 + 27, 10, UI.ink, 700, 'center');
  txt('タップで閉じる', W - 30, y0 + 27, 9, UI.dim, 500, 'right');
  let fs = 20; c.font = F(fs, 700); while (c.measureText(D.name).width > W - 64 && fs > 13) { fs--; c.font = F(fs, 700); } txt(D.name, 30, y0 + 56, fs, UI.ink, 700);
  txt(D.place + (D.year ? '　·　' + D.year : ''), 30, y0 + 74, 10.5, UI.sub, 500);
  let y = y0 + 96; for (const l of fact) { txt(l, 30, y, 11, '#C9CED6', 500); y += 15; }
  y += 2; rr(28, y - 4, W - 56, bh, 12); c.fillStyle = 'rgba(242,184,75,.12)'; c.fill(); bird(46, y + 9, 6, .5, 0, 0, UI.acc);
  let yy = y + 13; for (const l of say) { txt(l, 62, yy, 13, UI.acc, 700); yy += 18; } txt('— ' + BIRD[S.st.bird].name, W - 40, y + bh - 9, 9, UI.sub, 500, 'right');
  y += bh + 14; for (const l of sub) { txt(l, 30, y, 10.5, UI.ink, 500); y += 14; }
  { const hp = Math.round(D.shell * HPM), s2 = S.team.map(k => { const u = S.kinds[k], d = S.atk * u.am * (u.wall || 1) * likeK(u, B); return u.name + (d >= hp ? ' 一撃' : ' ' + Math.ceil(hp / d) + '回') + (likeK(u, B) > 1 ? '○' : likeK(u, B) < 1 ? '×' : ''); }).join('・');
    txt('壁の硬さ ' + hp + (B.tags.length ? '　札：' + B.tags.map(t => TAGN[t]).join('・') : ''), 30, y, 10, UI.sub, 600); y += 14; txt(s2, 30, y, 10, '#C9CED6', 500); y += 12; }
  const kb = KEYB[D.gim] || (D.kind === '象徴' ? 'crow' : 'falcon'), kd = KIND[kb], have = S.team.includes(kb);
  rr(28, y - 2, W - 56, 22, 11); c.fillStyle = have ? 'rgba(104,214,128,.14)' : 'rgba(255,255,255,.06)'; c.fill(); birdS(44, y + 9, 6.5, .5, 0, 0, KUI[kb], kd.shape);
  txt('効く鳥：' + kd.name + '（' + kd.role + '）' + (have ? '' : '　— 連れてきていない'), 58, y + 13, 10, have ? '#BFF0C8' : UI.sub, 600);
  rr(30, y0 + h - 7, (W - 60) * Math.max(0, 1 - K.t / 5), 2, 1); c.fillStyle = 'rgba(242,184,75,.5)'; c.fill();
  c.globalAlpha = 1;
}
function localTime(tz) { try { return new Intl.DateTimeFormat('ja-JP', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); } catch (e) { return ''; } }
// 章のカードの長さ：題辞のある都市は長め（タップで飛ばせる）
function chapDur() { return typeof EPI !== 'undefined' && EPI[S.st.id] ? 6 : 1.25; }
// 到着のカード：都市に入って最初の数秒。国、都市名、その土地のあいさつ、現地の時刻、天気
function drawArrival(t) {
  const A = S.arr; if (!A) return;
  // v3：古い映画の章のカード（白黒、1秒）
  const CD = chapDur(), E = typeof EPI !== 'undefined' && EPI[S.st.id];
  if (A.t < CD) { const ca = Math.min(1, (CD - A.t) / .3); c.globalAlpha = ca;
    if (S.st.id === 'seattle') { for (let x = 0; x < W; x += 6) { const f = .55 + .45 * Math.sin(x * .19 + Math.sin(x * .05) * 2); c.fillStyle = 'rgb(' + Math.round(70 + 70 * f) + ',' + Math.round(8 + 8 * f) + ',' + Math.round(12 + 10 * f) + ')'; c.fillRect(x, 0, 6, PY + 24); } } // 赤いカーテン（ある映画監督への目くばせ。名前は出さない）
    else { c.fillStyle = '#0B0B0B'; c.fillRect(0, 0, W, PY + 24); }
    if (typeof filmGrain === 'function') filmGrain(t, 0, PY + 24, .9);
    const ty = E ? 170 : 250; c.font = '700 11px ' + SERIF; c.fillStyle = '#D8D4CA'; c.textAlign = 'center'; c.fillText('CHAPITRE ' + (S.si + 1), W / 2, ty);
    c.font = '700 24px ' + SERIF; c.fillText(S.st.en.split(' → ').join(' — '), W / 2, ty + 36, W - 40); c.font = '500 13px ' + SERIF; c.fillText(S.st.city, W / 2, ty + 62);
    if (E) epiDraw(E, A.t - .6, 350, ca * Math.min(1, Math.max(0, (A.t - .4) / .6)));
    c.globalAlpha = 1; return; }
  const at = A.t - CD, d = 4.6; if (at > d) return; const a = Math.max(0, Math.min(1, at / .35, (d - at) / .5)); c.globalAlpha = a;
  const ST = S.st, c0 = ST.zones[0].c || ST.country, h = HELLO[c0] || ['ようこそ', ''], y0 = 150;
  { const nf = Math.min(2, (S.wfx || wxFx(S.wx || wxFor(S.st))).txt.length); rr(36, y0, W - 72, 194 + (nf ? nf * 14 + 8 : 0), 20); c.fillStyle = 'rgba(14,16,20,.74)'; c.fill(); }
  c.font = F(10, 700); const cw = c.measureText(ST.country).width + 18; rr(W / 2 - cw / 2, y0 + 14, cw, 18, 9); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill(); txt(ST.country, W / 2, y0 + 27, 10, UI.sub, 700, 'center');
  let fs = 22; c.font = F(fs, 700); while (c.measureText(ST.en).width + ST.en.length * 3 > W - 100 && fs > 12) { fs--; c.font = F(fs, 700); } spaced(ST.en, W / 2, y0 + 62, fs, UI.ink, 3);
  txt(h[0], W / 2, y0 + 98, 22, UI.acc, 700, 'center'); if (h[0] !== 'ようこそ') txt(h[1] + 'で「ようこそ」', W / 2, y0 + 116, 10, UI.sub, 500, 'center');
  const w = S.wx || wxFor(ST); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(56, y0 + 130, W - 112, 1);
  txt('いま', W / 2, y0 + 148, 9.5, UI.sub, 600, 'center'); let fs2 = 16; c.font = F(fs2, 700); const wl = wxLine(w); while (c.measureText(wl).width > W - 96 && fs2 > 11) { fs2--; c.font = F(fs2, 700); } txt(wl, W / 2, y0 + 170, fs2, UI.ink, 700, 'center');
  txt(wxSub(w), W / 2, y0 + 186, 9, UI.dim, 500, 'center');
  const fx = (S.wfx || wxFx(w)).txt; fx.slice(0, 2).forEach((l, i) => txt(l, W / 2, y0 + 210 + i * 14, 10, '#C9CED6', 500, 'center'));
  c.globalAlpha = 1;
}

// ---------- 渡りの場面（都市から都市へ） ----------
// 最後に還した都市から、選んだ都市へ海と雲の上を飛ぶ。距離は大圏距離。タップで飛ばせる
let FLY = null;
const gcKm = (a, b) => { const p1 = a[0] * RAD, p2 = b[0] * RAD, dl = (b[1] - a[1]) * RAD, h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return Math.round(2 * 6371 * Math.asin(Math.sqrt(h))); };
const endPt = s => s.via && s.via.length ? s.via[s.via.length - 1] : [s.lat, s.lon];
function flyEnter(si) {
  const to = STAGES[si], fi = STAGES.findIndex(s => s.id === SV.last), from = fi >= 0 && fi !== si ? STAGES[fi] : null;
  const fl = flockOf(si), sp = []; for (let i = 0; i < fl.length; i += Math.max(1, Math.floor(fl.length / 46))) sp.push(fl[i]);
  FLY = { si, from, to, km: from ? gcKm(endPt(from), [to.lat, to.lon]) : 0, t: 0, d: from ? 5.5 : 3.4, sp, n: fl.length, kinds: [...new Set(fl.map(b => b.name))] };
  scene = 'fly'; sfx('start'); wxFetch(to);
}
function stepFly(dt) { FLY.t += dt; if (FLY.t >= FLY.d) startStage(FLY.si); }
function drawFly(t) {
  const F0 = FLY, u = Math.min(1, F0.t / F0.d), A = (F0.from || F0.to).sky[0], Bk = F0.to.sky[0];
  const g = c.createLinearGradient(0, 0, 0, 420); [[0, 0], [1, .6], [2, 1]].forEach(([i, s]) => g.addColorStop(s, mix(A[i], Bk[i], u))); c.fillStyle = g; c.fillRect(0, 0, W, 420);
  const rg = c.createRadialGradient(W * .75, 150, 0, W * .75, 150, 160); rg.addColorStop(0, 'rgba(255,244,222,.45)'); rg.addColorStop(1, 'rgba(255,244,222,0)'); c.fillStyle = rg; c.fillRect(0, 0, W, 420);
  for (const [n, sp, y0, al, s] of [[6, 30, 200, .25, 1.2], [5, 90, 250, .3, 1]]) { c.fillStyle = 'rgba(255,255,255,' + al + ')'; for (let i = 0; i < n; i++) { const x = ((i * 151 - t * sp) % (W + 260) + W + 260) % (W + 260) - 130, y = y0 + (i * 41) % 70; c.beginPath(); c.ellipse(x, y, 60 * s, 10 * s, 0, 0, 7); c.ellipse(x + 26 * s, y - 6 * s, 34 * s, 9 * s, 0, 0, 7); c.fill(); } }
  const sg = c.createLinearGradient(0, 420, 0, H); sg.addColorStop(0, '#47708F'); sg.addColorStop(1, '#16263A'); c.fillStyle = sg; c.fillRect(0, 420, W, H - 420);
  c.fillStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 26; i++) { const sp = 30 + (i % 4) * 25, y = 428 + (i * 37) % 200, x = ((i * 89 - t * sp * (1 + (y - 420) / 120)) % (W + 40) + W + 40) % (W + 40) - 20; c.fillRect(x, y, 6 + (i % 3) * 5, 1.2); }
  // 出発の岸は左へ流れ去り、到着の岸が右から来る
  const coast = (x0, dir, ST) => {
    c.fillStyle = '#3E5A48'; c.beginPath(); c.moveTo(x0, 440); for (let k = 0; k <= 12; k++) c.lineTo(x0 + dir * k * 26, 420 - 6 - 6 * Math.sin(k)); c.lineTo(x0 + dir * 420, 440); c.closePath(); c.fill();
    c.fillStyle = 'rgba(60,70,84,.6)'; const sil = ST.zones[0].sil; for (let i = 0; i < 10; i++) { const bh = sil[0] + (i * 37) % sil[1], bx = x0 + dir * (24 + i * 28); c.fillRect(dir > 0 ? bx : bx - 18, 414 - bh, 18, bh); }
  };
  if (F0.from && u < .4) coast(220 - u * 1100, -1, F0.from);
  if (u > .62) coast(W + 20 - (u - .62) / .38 * 240, 1, F0.to);
  for (let i = 0; i < 2; i++) { const x = ((i * 210 + 80 - t * 26) % (W + 60) + W + 60) % (W + 60) - 30, y = 470 + i * 60; c.fillStyle = '#2B3442'; c.fillRect(x, y, 22, 4); c.fillRect(x + 6, y - 4, 8, 4); }
  const N = F0.sp.length; for (let i = 0; i < N; i++) { const s = shape(0, i, N, t), sp = F0.sp[i]; bird(150 + s[0] * .8 + Math.sin(t * 1.3 + i) * 3, 320 + s[1] * .45 + Math.sin(t * 2 + i * .7) * 3, sp.s * .8, Math.sin(t * 14 + i) * .6, 0, 0, sp.col); }
  spaced('MIGRATION', W / 2, 92, 11, '#15181D', 4);
  const ttl = F0.from ? F0.from.en.split(' → ').pop() + '  →  ' + F0.to.en.split(' → ')[0] : F0.to.en.split(' → ')[0] + ' へ'; let fs = 20; c.font = F(fs, 700); while (c.measureText(ttl).width > W - 40 && fs > 11) { fs--; c.font = F(fs, 700); } txt(ttl, W / 2, 124, fs, '#15181D', 700, 'center');
  if (F0.from) txt(Math.round(F0.km * Math.min(1, u * 1.15)).toLocaleString() + ' km', W / 2, 148, 14, '#15181D', 700, 'center');
  let ks = '群れ ' + F0.n + ' 羽　' + F0.kinds.join('・'); c.font = F(10, 500); if (c.measureText(ks).width > W - 40) ks = '群れ ' + F0.n + ' 羽　' + F0.kinds.length + ' 種の鳥の旅'; txt(ks, W / 2, 170, 10, 'rgba(21,24,29,.75)', 500, 'center');
  if (F0.from && F0.from.country !== F0.to.country && u > .38 && u < .72) { const s = '国境を越える　' + F0.from.country.split('・').pop() + ' → ' + F0.to.country.split('・')[0]; c.font = F(11, 700); const w = c.measureText(s).width + 26; rr(W / 2 - w / 2, 384, w, 24, 12); c.fillStyle = 'rgba(14,16,20,.55)'; c.fill(); txt(s, W / 2, 400, 11, UI.ink, 700, 'center'); }
  txt('タップで飛ばす', W / 2, 612, 10, 'rgba(255,255,255,.55)', 500, 'center');
  drawToggles();
}

// ---------- パスポート（還した都市のスタンプと、見た建物のカード） ----------
const P = { sel: -1 }, R_PASS = { x: 12, y: 17, w: 36, h: 36 }, R_BACK = { x: 110, y: 584, w: 140, h: 40 };
const STAMP = ['#E0604A', '#F2B84B', '#68D680', '#5AB0E8', '#B98CE6', '#E88AB4', '#6FD0C0'];
function slotR(i) { return { x: 14 + (i % 3) * 112, y: 128 + Math.floor(i / 3) * 90, w: 108, h: 84 }; } // 3列（13都市）
function stamp(x, y, r, i, ST, rot) {
  const col = STAMP[i % STAMP.length]; c.save(); c.translate(x, y); c.rotate(rot); c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke(); c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r - 5, 0, 7); c.stroke();
  bird(0, -6, r * .32, .55, 0, 0, col); const en = ST.en.split(' → ').pop(); let fs = Math.min(10, r * .3); c.font = F(fs, 700); while (c.measureText(en).width > r * 1.5 && fs > 6) { fs -= .5; c.font = F(fs, 700); }
  txt(en, 0, r * .3, fs, col, 700, 'center'); txt(SV.date[ST.id] || '', 0, r * .3 + r * .3, Math.min(7, r * .26), col, 600, 'center'); c.restore();
}
function drawPass(t) {
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0E1424'); bg.addColorStop(1, '#141A2C'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  if (P.sel >= 0) { drawPassPage(t); drawToggles(); return; }
  spaced('PASSPORT', W / 2, 84, 22, UI.ink, 5); rr(W / 2 - 14, 95, 28, 3, 1.5); c.fillStyle = UI.acc; c.fill();
  txt('還した都市のスタンプ  ' + clearedN() + ' / ' + STAGES.length + '　·　タップで記録を見る', W / 2, 116, 10.5, UI.sub, 500, 'center');
  STAGES.forEach((ST, i) => {
    const R = slotR(i), done = SV.clear[ST.id]; rr(R.x, R.y, R.w, R.h, 14); c.fillStyle = 'rgba(255,255,255,' + (done ? .06 : .03) + ')'; c.fill();
    if (!done) { c.setLineDash([4, 4]); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]); }
    let nm = ST.city; c.font = F(9.5, 600); while (c.measureText(nm).width > R.w - 14 && nm.length > 2) nm = nm.slice(0, -1); if (nm !== ST.city) nm += '…'; txt(nm, R.x + 7, R.y + 15, 9.5, done ? UI.ink : UI.sub, 600);
    const got = Object.keys(SV.lm[ST.id] || {}).length; txt('名所 ' + got + '/' + (ST.lm || []).length, R.x + R.w / 2, R.y + R.h - 7, 8.5, UI.sub, 500, 'center');
    if (done) stamp(R.x + R.w / 2, R.y + 44, 23, i, ST, (hash(i, 3) - .5) * .5); else txt('未踏', R.x + R.w / 2, R.y + 48, 11, UI.dim, 600, 'center');
  });
  pillAt('地図へ戻る', R_BACK.x, R_BACK.y, R_BACK.w, false);
  rr(R_WORDS.x, R_WORDS.y, R_WORDS.w, R_WORDS.h, 13); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill(); txt('言葉の書架  ' + Object.keys(SV.epi || {}).length + '/' + Object.keys(EPI).length, R_WORDS.x + R_WORDS.w / 2, R_WORDS.y + 17, 10.5, '#DDE8C8', 600, 'center');
  drawToggles();
}
function drawPassPage(t) {
  const i = P.sel, ST = STAGES[i], done = SV.clear[ST.id];
  let fs = 20; c.font = F(fs, 700); while (c.measureText(ST.en).width > 230 && fs > 12) { fs--; c.font = F(fs, 700); } txt(ST.en, 24, 84, fs, UI.ink, 700); txt(ST.city + '　' + ST.country, 24, 104, 10.5, UI.sub, 500);
  if (done) stamp(W - 62, 96, 34, i, ST, -.18);
  if (SV.verse[ST.id]) txt('「' + VERSE[ST.id] + '」', 24, 127, 11, '#DDE8C8', 600); // v3：鳥の言葉
  let y = 146; txt('建物のカード', 24, y, 11, UI.acc, 700); y += 22;
  for (const id of [...ST.bosses.map(b => b.id), ST.final]) {
    const D = BOSS[id], seen = SV.seen[id]; txt(seen ? D.name : '？？？', 24, y, 13, seen ? UI.ink : UI.dim, 700); txt(D.kind, W - 24, y, 10, UI.sub, 500, 'right'); y += 17;
    if (seen) { for (const l of wrapL(D.say, W - 60, 11, 500)) { txt(l, 34, y, 11, UI.acc, 500); y += 15; } for (const l of wrapL(D.fact, W - 60, 10, 500).slice(0, 2)) { txt(l, 34, y, 10, UI.sub, 500); y += 14; } }
    y += 10;
  }
  const got = SV.lm[ST.id] || {}, L = (ST.lm || []).map(([, id]) => LM[id].name); txt('還した名所  ' + L.filter(n => got[n]).length + ' / ' + L.length, 24, y, 11, UI.acc, 700); y += 18;
  for (const l of wrapL(L.map(n => got[n] ? n : '？？？').join('　'), W - 48, 11, 500)) { txt(l, 24, y, 11, '#C9CED6', 500); y += 16; }
  pillAt('もどる', R_BACK.x, R_BACK.y, R_BACK.w, false);
}
function passTap(x, y) {
  if (inR(x, y, R_SND)) { toggleMute(); return; }
  if (inR(x, y, R_BACK)) { if (P.sel >= 0) P.sel = -1; else scene = 'map'; sfx('buy'); return; }
  if (P.sel < 0 && inR(x, y, R_WORDS)) { scene = 'words'; sfx('buy'); return; }
  if (P.sel < 0) STAGES.forEach((s, i) => { if (inR(x, y, slotR(i))) { P.sel = i; sfx('buy'); } });
}

// ---------- 開始 ----------
mapEnter();
let last = 0;
function loop(ms) {
  const t = ms / 1000, dt = Math.min(.04, t - last || 0); last = t;
  if (scene === 'map') stepMap(dt); else if (scene === 'film') stepFilm(dt); else if (scene === 'fly') stepFly(dt); else if (scene === 'game') { const n = S.mode === 'play' ? ff : 1; for (let i = 0; i < n; i++) step(dt); }
  audioTick(dt); draw(t); requestAnimationFrame(loop);
}
if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);

// ---------- v3：鳥の図鑑（羽で鳥を育てる。育てた段は次の都市へ持ち越す） ----------
// 威力と速さを、それぞれ 3 段まで。次の段に要る羽は 1・2・3 枚。振り直しはいつでも無料（試作の間）
const BK = { y0: 118, h: 70 };
const bkRow = i => ({ x: 16, y: BK.y0 + i * BK.h, w: W - 32, h: BK.h - 6 });
const bkBtn = (i, j) => ({ x: W - 70, y: BK.y0 + i * BK.h + 8 + j * 26, w: 46, h: 22 });
const R_RESPEC = { x: 24, y: 584, w: 110, h: 40 }, R_BKBACK = { x: 196, y: 584, w: 140, h: 40 };
function drawBook(t) {
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0E1424'); bg.addColorStop(1, '#141A2C'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  spaced('鳥の図鑑', W / 2, 74, 20, UI.ink, 4); txt('羽 ' + (SV.fe || 0) + ' 枚　·　都市を還すともらえる（はじめて 3 枚、2 回目から 1 枚）', W / 2, 98, 9.5, UI.sub, 500, 'center');
  Object.keys(KIND).forEach((k, i) => {
    const K = KIND[k], R = bkRow(i), got = SV.kinds.includes(k), L = (SV.lv || {})[k] || { p: 0, s: 0 };
    rr(R.x, R.y, R.w, R.h, 14); c.fillStyle = 'rgba(255,255,255,' + (got ? .06 : .03) + ')'; c.fill();
    birdS(R.x + 26, R.y + 30, 11, .5 + .2 * Math.sin(t * 3 + i), 0, 0, got ? KUI[k] : UI.dim, K.shape);
    if (!got) { txt('？？？', R.x + 52, R.y + 26, 13, UI.dim, 700); txt('都市を還すと仲間になる', R.x + 52, R.y + 44, 10, UI.dim, 500); return; }
    txt(K.name, R.x + 52, R.y + 20, 13, UI.ink, 700); txt(K.role, R.x + 52 + c.measureText(K.name).width + 8, R.y + 20, 9.5, UI.sub, 500);
    txt('○ ' + (K.like.map(tg => TAGN[tg]).join('・') || '—') + '　× ' + K.hate.map(tg => TAGN[tg]).join('・'), R.x + 52, R.y + 37, 10, '#C9CED6', 600);
    txt('×' + K.n + '　待ち ' + K.cd + '秒　値段 ' + K.cost, R.x + 52, R.y + 53, 9.5, UI.dim, 500);
    [['威力', 'p'], ['速さ', 's']].forEach(([nm, f], j) => {
      const B = bkBtn(i, j), lv = L[f], cost = lv + 1, can = lv < 3 && (SV.fe || 0) >= cost;
      for (let d = 0; d < 3; d++) { c.fillStyle = d < lv ? UI.acc : 'rgba(255,255,255,.15)'; c.beginPath(); c.arc(B.x - 30 + d * 9, B.y + 11, 3, 0, 7); c.fill(); }
      txt(nm, B.x - 44, B.y + 15, 9.5, UI.sub, 600, 'right');
      rr(B.x, B.y, B.w, B.h, 11); c.fillStyle = can ? UI.acc : 'rgba(255,255,255,.07)'; c.fill(); txt(lv >= 3 ? '最大' : '+  ' + cost, B.x + B.w / 2, B.y + 15, 10, can ? '#17191E' : UI.dim, 700, 'center');
    });
  });
  pillAt('振り直し', R_RESPEC.x, R_RESPEC.y, R_RESPEC.w, false); pillAt('地図へ戻る', R_BKBACK.x, R_BKBACK.y, R_BKBACK.w, true); drawToggles();
}
function bookTap(x, y) {
  if (inR(x, y, R_SND)) { toggleMute(); return; }
  if (inR(x, y, R_BKBACK)) { scene = 'map'; sfx('buy'); return; }
  if (inR(x, y, R_RESPEC)) { let back = 0; for (const k in SV.lv) for (const f of ['p', 's']) for (let l = 1; l <= SV.lv[k][f]; l++) back += l; SV.lv = {}; SV.fe = (SV.fe || 0) + back; save(); sfx('buy'); return; }
  Object.keys(KIND).forEach((k, i) => { if (!SV.kinds.includes(k)) return; ['p', 's'].forEach((f, j) => { if (!inR(x, y, bkBtn(i, j))) return; const L = SV.lv[k] = SV.lv[k] || { p: 0, s: 0 }, cost = L[f] + 1; if (L[f] < 3 && (SV.fe || 0) >= cost) { SV.fe -= cost; L[f]++; save(); sfx('buy'); } else sfx('deny'); }); });
}

// ---------- v3：言葉の書架（出会った題辞を、原文・和訳・英訳・出典と読み返す） ----------
// ゲームの中では役に立たない言葉。でも人にとっては残しておくものなので、ここに並べる
const R_WORDS = { x: 14, y: 20, w: 128, h: 28 }, R_WBACK = { x: 110, y: 596, w: 140, h: 36 };
function drawWords(t) {
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0E0E0C'); bg.addColorStop(1, '#16150F'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.fillStyle = '#ECE7DC'; c.font = '600 18px ' + SERIF; c.fillText('言葉の書架', W / 2, 62); c.font = LATIN; c.fillStyle = 'rgba(236,231,220,.55)'; c.fillText('words the birds did not need', W / 2, 80);
  let y = 112; const keys = ['intro', 'osaka', 'saigon', 'paris', 'seattle', 'newyork', 'end'];
  for (const k of keys) {
    const E = EPI[k], seen = (SV.epi || {})[k]; c.fillStyle = 'rgba(236,231,220,.08)'; c.fillRect(28, y - 14, W - 56, 1);
    if (!seen) { c.font = '500 11px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.25)'; c.fillText('— まだ出会っていない言葉 —', W / 2, y + 12); y += 40; continue; }
    const big = E.cjk ? '600 13px ' + SERIF : '600 italic 12px Georgia,"Times New Roman",serif';
    for (const l of E.o.split(' / ').flatMap(p => wrapF(p, big, W - 60))) { c.font = big; c.fillStyle = '#ECE7DC'; c.textAlign = 'center'; c.fillText(l, W / 2, y + 4); y += 16; }
    for (const l of wrapF(E.ja, '500 10px ' + SERIF, W - 60)) { c.font = '500 10px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.72)'; c.fillText(l, W / 2, y + 4); y += 13; }
    if (E.en) for (const l of wrapF(E.en, '500 italic 9.5px Georgia,serif', W - 60)) { c.font = '500 italic 9.5px Georgia,serif'; c.fillStyle = 'rgba(236,231,220,.6)'; c.fillText(l, W / 2, y + 4); y += 12; }
    c.font = '500 8.5px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.42)'; c.fillText(E.by, W / 2, y + 5); y += 22;
  }
  c.textAlign = 'left'; pillAt('もどる', R_WBACK.x, R_WBACK.y - 4, R_WBACK.w, false); drawToggles();
}
