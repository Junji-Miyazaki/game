// PD オートパイロット（ランディング可能性テストと、デバッグの AUTO LAND で共用）。
// 入力は game の状態から {left,right,up} を返す。left = CW回転(機首右) / right = CCW回転(機首左) / up = 主エンジン。
// 方針: 推力ベクトル制御。遠距離は弾道予測（風・抗力込み）の着地点誤差から必要横速度を求め、近距離はパッド中心への直接誘導。
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap180 = (a) => ((a + 180) % 360 + 360) % 360 - 180;
const FAR_H = 45;
export const AP = { WIND_FF: 1 };
const TMIN = 0.7;   // これ未満の要求加速度では噴射しない（燃料節約のデッドバンド）   // これより高い間は予測誘導

// 平均風(定常成分のみ。突風は予測に入れずフィードバックで吸収)と抗力を含む簡易弾道予測 -> {x, t}
export function predictMean(g, dt = 0.25) {
  const wb = (g._windSpec && g._windSpec.base) || 0;
  const dx = (g._body && g._body.drag) || 0;
  const dy = (g._body && (g._body.dragY !== undefined ? g._body.dragY : g._body.drag)) || 0;
  let x = g.x, y = g.y, vx = g.vx, vy = g.vy, t = 0;
  while (t < 200) {
    vy += g._gravity * dt; vx += wb * dt;
    vx -= vx * dx * dt; vy -= vy * dy * dt;
    x += vx * dt; y += vy * dt; t += dt;
    if (y + 16 >= g._terrainYAt(Math.max(1, Math.min(359, x)))) break;   // 壁は無視（壁際で予測が反転して暴れるのを防ぐ）
  }
  return { x, t };
}

export function autopilotKeys(g) {
  const keys = { left: false, right: false, up: false };
  if (!g || !g.pad) return keys;
  const padCx = g.pad.x + g.pad.w / 2;
  const h = Math.max(0, g.pad.y - (g.y + 16));
  const tg = h / Math.max(g.vy, 2);                 // 接地までの概算秒
  const far = h > FAR_H && tg > 6;
  const tiltLim = clampN((tg - 4) * 10, 15, 68);     // 接地が近いほど傾きを制限（直立で降りるため）

  // 位置PD＋風フィードフォワード: パッド方向への目標横速度を追い、風（HUDの矢印と同じ値）と抗力を打ち消す横加速度を要求する
  const vlim = far ? 8 : 4;
  const vxd = clampN(0.12 * (padCx - g.x), -vlim, vlim);
  const drag = (g._body && g._body.drag) || 0;
  const Fx = clampN(1.0 * (vxd - g.vx) - AP.WIND_FF * (g._windAccel || 0) + drag * g.vx, -4.5, 4.5);
  // 目標降下速度: 地面に近いほど遅く
  const vyd = Math.min(14, 4 + h * 0.03);
  const Fy = g.vy > vyd ? Math.min(5, g._gravity + 0.8 * (g.vy - vyd)) : 0;

  const T = Math.hypot(Fx, Fy);
  // 目標傾きは要求加速度に連続に追従（しきい値で0/大角度を行き来すると姿勢制御の燃料を浪費する）
  const thd = clampN(Math.atan2(Fx, Math.max(Fy, 1.5)) * 180 / Math.PI, -tiltLim, tiltLim);
  const ang = wrap180(g.angle);
  const err = thd - ang;
  const u = err - g.omega * Math.abs(g.omega) / 56;   // 切替曲線（ANG_ACCEL=28 deg/s^2 の制動距離）
  if (u > 1.5) keys.left = true;
  else if (u < -1.5) keys.right = true;

  if (T >= TMIN && Math.abs(err) < 8 && !(Fy === 0 && g.vy < -8)) keys.up = true;
  return keys;
}

// キーパルスを game に適用して1フレーム進める（テスト用）
export function autopilotFrame(g, dt = 1 / 60) {
  const k = autopilotKeys(g);
  if (k.left) g.onInput('left');
  if (k.right) g.onInput('right');
  if (k.up) g.onInput('up');
  g.update(dt);
}
