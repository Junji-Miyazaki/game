// L2: 降下ルートの輪（リング）と特典の輪。ゲームロジックの純粋部分（配置・通過判定・コンボ得点・特典の定義）。描画は art.js、状態の保持は game.js。
// 輪は誘導線（出現位置からパッドへの放物線）に沿って置く＝プレイヤーが実際に通れる経路。通常ステージのみ（ボーナスは輪なし）。
const RW = 360;
export const RING_R = 17;              // 通過判定の半径(px)。機体の中心がこの内側を通ると取得（フレーム間は線分で判定）
export const RING_SCORE = 50;          // 得点 = 50 × コンボ
export const RING_MIN = 4, RING_MAX = 6;
export const RING_GAP_MIN = 46;        // 輪どうしの中心間の最小距離(px)
export const RING_Y_MAX = 392;         // 輪の中心の最大Y（地形の最高点440より輪の下端が十分上）
export const RING_TERRAIN_MARGIN = 24; // 輪の下端と地形のすきま(px)
export const RING_OBS_MARGIN = 10;     // 輪の中心と障害物の縁のすきま(px。障害物は横にだけ動く＝縦位置は固定)
const RING_START_ARC = 64;             // 出現位置から最初の輪までの経路長(px)

// ---- 特典の輪 ----
export const POWER_RING_GAP = 2 * RING_R + 8;   // 特典の輪と通常の輪の中心間の最小距離
export const POWER_CHANCE = 0.35;      // ステージ2以降、1ステージにつき最大1個。この確率で出る（短く・まれに）
export const POWER_MIN_STAGE = 2;
export const SLOWMO_S = 8, SLOWMO_FACTOR = 0.25;  // SLOW-MO: 隕石(障害物)が8秒間 25%速度（ユーザー要望で 50%→25%）
export const SIDE_S = 8;                           // SIDE THRUST: 8秒間 機体を水平に保ち、左右ボタンで真横に移動（回転入力は無効）
export const SIDE_ACCEL = 12;                      // SIDE THRUST の横加速度(px/s^2)。主推力 5.2・通常RCSのドリフト 2.5 に対し「はっきり効く」値。燃料は通常のRCSと同じ率
export const POWER_FUEL_FRAC = 0.15;               // FUEL: 最大燃料の15%（上限まで）
export const POWER_DEFS = {
  slowmo:   { id: 'slowmo',   name: 'SLOW-MO',         note: 'METEORS AT 1/4 SPEED · 8 S', dur: SLOWMO_S },
  radar:    { id: 'radar',    name: 'RADAR',           note: 'FOR THIS STAGE',                   dur: 0 },
  side:     { id: 'side',     name: 'SIDE THRUST',     note: 'SIDE BUTTONS MOVE SIDEWAYS · 8 S', dur: SIDE_S },
  fuel:     { id: 'fuel',     name: 'FUEL +15%',       note: 'REFUELED',                         dur: 0 },
};
export const POWER_IDS = ['slowmo', 'radar', 'side', 'fuel'];

// 経路上の点（誘導線と同じ式）
export function pathPoint(sx, sy, tx, ty, t) { return { x: sx + (tx - sx) * t, y: sy + (ty - sy) * t * t }; }

// 点 (px,py) と線分 (x0,y0)-(x1,y1) の最短距離
export function segDist(x0, y0, x1, y1, px, py) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

// 地形折れ線の x0..x1 での最小Y（=最も高い点）
export function terrainTopIn(pts, x0, x1) {
  const at = (x) => {
    for (let i = 0; i < pts.length - 1; i++) if (x >= pts[i].x && x <= pts[i + 1].x) { const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x); return pts[i].y + t * (pts[i + 1].y - pts[i].y); }
    return 9999;
  };
  let m = Math.min(at(Math.max(0, x0)), at(Math.min(RW, x1)));
  for (const q of pts) if (q.x > x0 && q.x < x1 && q.y < m) m = q.y;
  return m;
}

// 輪の候補位置が地形から離れているか
export function clearOfTerrain(pts, x, y, r = RING_R) { return y + r + RING_TERRAIN_MARGIN <= terrainTopIn(pts, x - r, x + r); }

// 障害物の縁までの縦のすきま（正=重ならない）。障害物は横方向にしか動かないので、縦が離れていれば輪の中心を通れる
function obsClear(obs, y) {
  let m = 99;
  for (const o of obs || []) m = Math.min(m, Math.abs(y - o.y) - o.r);
  return m;
}

// 輪の配置。opts: { stage, startX, startY, pad, terrainPts, obstacles, radarOwned, rnd }
// 戻り値: { rings: [{x,y,r,i}], power: {x,y,r,kind}|null }
export function buildRings(opts) {
  const rnd = opts.rnd || Math.random;
  const { startX: sx, startY: sy, pad, terrainPts: pts, obstacles } = opts;
  const tx = pad.x + pad.w / 2, ty = pad.y;
  // 経路を細かくサンプルして累積長を持つ
  const N = 240, PTS = [];
  let acc = 0;
  for (let k = 0; k <= N; k++) {
    const q = pathPoint(sx, sy, tx, ty, k / N);
    if (k > 0) acc += Math.hypot(q.x - PTS[k - 1].x, q.y - PTS[k - 1].y);
    PTS.push({ x: q.x, y: q.y, s: acc });
  }
  const at = (s) => {
    s = Math.max(0, Math.min(acc, s));
    let lo = 0, hi = N;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (PTS[m].s <= s) lo = m; else hi = m; }
    const a = PTS[lo], b = PTS[hi], u = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  // 輪を置ける経路の終端 = 中心Yが RING_Y_MAX（かつ地形から離れている）を超える直前
  let sMax = acc * 0.95;
  for (let k = 0; k <= N; k++) { if (PTS[k].y > RING_Y_MAX || !clearOfTerrain(pts, PTS[k].x, PTS[k].y)) { sMax = Math.min(sMax, PTS[Math.max(0, k - 1)].s); break; } }
  const sMin = RING_START_ARC;
  let n = RING_MIN + Math.floor(rnd() * (RING_MAX - RING_MIN + 1));
  while (n > RING_MIN && (sMax - sMin) / (n - 1) < RING_GAP_MIN + 3) n--;
  const rings = [];
  let prevS = -1e9;
  for (let i = 0; i < n; i++) {
    const base = sMin + (sMax - sMin) * (n > 1 ? i / (n - 1) : 0);
    let best = null;
    for (let d = -20; d <= 20; d += 2) {
      const s = base + d;
      if (s < sMin - 1e-6 || s > sMax + 1e-6 || s < prevS + RING_GAP_MIN + 2) continue;
      // 後ろの輪のために、残りの輪が入る余地を残す
      if (sMax - s < (n - 1 - i) * (RING_GAP_MIN + 2) - 1e-6) continue;
      const q = at(s);
      const x = Math.max(RING_R + 8, Math.min(RW - RING_R - 8, q.x));
      if (!clearOfTerrain(pts, x, q.y)) continue;
      const oc = obsClear(obstacles, q.y);
      const score = Math.min(oc, RING_OBS_MARGIN + 6) * 10 - Math.abs(d) * 0.15;
      if (!best || score > best.score) best = { score, s, x, y: q.y };
    }
    if (!best) { // 余地がなければ基準位置（制約を満たす最も近い s）
      const s = Math.max(base, prevS + RING_GAP_MIN + 2); const q = at(s);
      best = { s, x: Math.max(RING_R + 8, Math.min(RW - RING_R - 8, q.x)), y: q.y };
      // 地形に埋まる・経路外なら置かない（取れない輪を作らない＝★2 が必ず取れる）
      if (s > sMax + 1e-6 || best.y > RING_Y_MAX || !clearOfTerrain(pts, best.x, best.y)) break;
    }
    prevS = best.s;
    rings.push({ x: best.x, y: best.y, r: RING_R, i: rings.length });
  }
  // 特典の輪: ステージ2以降、確率で1個。2つの輪の中間から経路の脇（左右どちらか空いている側）へ少し外す
  let power = null;
  if (opts.stage >= POWER_MIN_STAGE && rnd() < POWER_CHANCE && rings.length >= 2) {
    const pool = POWER_IDS.filter((k) => !(k === 'radar' && opts.radarOwned));
    const kind = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
    const gaps = []; for (let j = 0; j < rings.length - 1; j++) gaps.push(j);
    for (let a = gaps.length - 1; a > 0; a--) { const b = Math.floor(rnd() * (a + 1)); const t = gaps[a]; gaps[a] = gaps[b]; gaps[b] = t; }
    search: for (const j of gaps) {
      const A = rings[j], B = rings[j + 1];
      const dirs = rnd() < 0.5 ? [1, -1] : [-1, 1];
      for (const sgn of dirs) for (const off of [36, 42, 50, 58]) for (const fr of [0.5, 0.4, 0.6]) {   // 脇への寄り道は小さめ（輪から 2R+8 以上離す）
        const x = A.x + (B.x - A.x) * fr + sgn * off, y = A.y + (B.y - A.y) * fr;
        if (x < RING_R + 12 || x > RW - RING_R - 12 || y > RING_Y_MAX) continue;
        if (!clearOfTerrain(pts, x, y)) continue;
        if (rings.some((q) => Math.hypot(q.x - x, q.y - y) < POWER_RING_GAP)) continue;
        if (obsClear(obstacles, y) < 4) continue;
        power = { x, y, r: RING_R, kind };
        break search;
      }
    }
  }
  return { rings, power };
}

// ---- 取得状態（1ステージ分）----
export function newRingState(layout) {
  return {
    rings: layout.rings.map((r) => ({ x: r.x, y: r.y, r: r.r, i: r.i, got: false, missed: false })),
    power: layout.power ? { x: layout.power.x, y: layout.power.y, r: layout.power.r, kind: layout.power.kind, got: false } : null,
    combo: 0, last: -1, collected: 0, score: 0,
  };
}
// 輪 idx を取得した時のコンボ処理（直前に取った輪の次なら連続=+1、それ以外はリセットして1）。戻り値: この輪の得点
export function ringCollect(st, idx) {
  st.combo = (idx === st.last + 1) ? st.combo + 1 : 1;
  st.last = idx;
  st.collected += 1;
  const pts = RING_SCORE * st.combo;
  st.score += pts;
  return pts;
}
// 1フレームの移動 (x0,y0)->(x1,y1) で通過した輪を処理する。戻り値: { hits: [{idx, pts, combo, x, y}], power: 特典の輪 or null }
export function ringStep(st, x0, y0, x1, y1) {
  const out = { hits: [], power: null };
  if (!st) return out;
  for (const r of st.rings) {
    if (r.got) continue;
    if (segDist(x0, y0, x1, y1, r.x, r.y) <= r.r) {
      r.got = true; r.missed = false;
      const pts = ringCollect(st, r.i);
      out.hits.push({ idx: r.i, pts, combo: st.combo, x: r.x, y: r.y });
    } else if (y1 > r.y + r.r + 6) {
      r.missed = true;   // 通り過ぎた（上に戻れば取れる）
    } else r.missed = false;
  }
  const p = st.power;
  if (p && !p.got && segDist(x0, y0, x1, y1, p.x, p.y) <= p.r) { p.got = true; out.power = p; }
  return out;
}
export const allRingsGot = (st) => !!st && st.rings.length > 0 && st.rings.every((r) => r.got);
// 1ステージの輪の最大得点 = 50 × (1+2+…+n)
export const maxRingScore = (n) => RING_SCORE * n * (n + 1) / 2;
