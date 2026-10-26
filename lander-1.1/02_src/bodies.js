// 天体ツアー（P1.5）。ステージ2つごとに天体が変わる（月→エウロパ→イオ→火星→タイタン→金星→水星、14ステージで1周）。
// ゲーム性に関わる数値（重力・大気）と、P2が描画に使う見た目トークンを1か所に集約する。
// 真空の天体（moon/europa/io）は風・抗力・視界制限なし（ユーザー指摘どおり）。
export const GRAVITY_BASE = 0.25;   // 月(1.62 m/s^2)でのステージ1重力 px/s^2
const G_REF = 1.62;
export const STAGES_PER_BODY = 2;

// wind: base = 定常風の大きさ(px/s^2, 符号はステージごとにランダム) / gust = 突風の振幅(px/s^2)。0なら風なし。
// drag: 水平速度の抗力係数(1/s)。dragY: 垂直（省略時は drag と同じ）。visibility: 視界半径px(null=無制限)。heat: 高温(燃料の受動消費と主エンジン増)。
// 見た目トークン(P2用): sky=[上,下] / ground=地面塗り / rim=地平線の縁 / accent / fog / haze / skyObject / mood
export const BODIES = [
  { id: 'moon', celebTier: 0, name: 'MOON', atmoTag: 'NONE', realG: 1.62, atmoLabel: 'NONE', atmoType: 'none',
    wind: { base: 0, gust: 0 }, drag: 0, visibility: null, heat: null, obstacleStyle: 'rock',
    visual: { sky: ['#04050a', '#0b0f1a'], ground: '#4a4d58', rim: '#b4bac8', accent: '#c9ecff', fog: null, haze: null,
      skyObject: 'earth', mood: 'grey regolith, Earthrise' } },
  { id: 'europa', celebTier: 0, name: 'EUROPA', atmoTag: 'NONE', realG: 1.31, atmoLabel: 'NONE (TRACE)', atmoType: 'none',
    wind: { base: 0, gust: 0 }, drag: 0, visibility: null, heat: null, obstacleStyle: 'ice',
    visual: { sky: ['#04060e', '#0b1426'], ground: '#a9c2d2', rim: '#f2fbff', accent: '#7fd8ff', fog: null, haze: null,
      skyObject: 'jupiter', mood: 'cracked white ice, giant Jupiter overhead' } },
  { id: 'io', celebTier: 1, name: 'IO', atmoTag: 'TRACE', realG: 1.80, atmoLabel: 'TRACE SO₂', atmoType: 'trace',
    wind: { base: 0, gust: 0 }, drag: 0, visibility: null, heat: null, obstacleStyle: 'lava',
    visual: { sky: ['#0a0507', '#2a1208'], ground: '#a98424', rim: '#ffd96a', accent: '#ff6a1a', fog: null, haze: null,
      skyObject: 'jupiter', mood: 'sulfur yellow plains, lava vents' } },
  { id: 'mars', celebTier: 1, name: 'MARS', atmoTag: 'THIN CO\u2082', realG: 3.71, atmoLabel: 'THIN CO₂', atmoType: 'thin',
    wind: { base: 0.08, gust: 0.3 }, drag: 0.05,   // P1.5調整: 仕様値 0.8/1.2 は 0/50 着陸（04_tests/p15.mjs・LOG参照）
       visibility: null, heat: null, obstacleStyle: 'rock',
    visual: { sky: ['#43211a', '#d08a52'], ground: '#8a3b1e', rim: '#eaa070', accent: '#ffb27a',
      fog: null, haze: { color: '#c2703d', alpha: 0.22 }, skyObject: 'phobos', mood: 'rust dust, butterscotch sky, dust haze' } },
  { id: 'titan', celebTier: 2, name: 'TITAN', atmoTag: 'THICK N\u2082', realG: 1.35, atmoLabel: 'THICK N₂ 1.5 BAR', atmoType: 'thick',
    wind: { base: 0.06, gust: 0.12 }, drag: 0.35, dragY: 0.03,   // 調整: 仕様 風0.6/0.6・縦抗力0.35（終端降下速度 g/drag = 0.65px/s で降下に600秒）
       visibility: 150, heat: null, obstacleStyle: 'ice',
    visual: { sky: ['#6a4514', '#946620'], ground: '#4a3519', rim: '#dca048', accent: '#ffc04a',
      fog: '#6b4510', haze: null, skyObject: 'saturn', mood: 'orange methane murk, thick haze' } },
  { id: 'venus', celebTier: 2, name: 'VENUS', atmoTag: 'EXTREME 460\u00b0C', realG: 8.87, atmoLabel: 'EXTREMELY THICK · 460°C', atmoType: 'extreme',
    wind: { base: 0.05, gust: 0.12 }, drag: 0.2, dragY: 0.045,   // 調整: 仕様 風0.4/0.5・抗力0.5（終端降下速度 1.2px/s）
       visibility: 110, heat: { fuelDrain: 0.8, mainFuelMul: 1.3 }, obstacleStyle: 'lava',
    visual: { sky: ['#7a3410', '#c26a1c'], ground: '#33180a', rim: '#ff8a2a', accent: '#ff9a3c',
      fog: '#7a3a08', haze: null, skyObject: 'sun-glow', mood: 'crushing sulfur clouds, furnace glow' } },
  // MERCURY（v1.1 L2）: ツアーの最後。大気なし（風・抗力なし）。永久影の極域クレーター＝暗闇（visibility: 機体のライトの届く範囲だけ地形が見える。
  // パッドのビーコンと誘導線は暗闇の上に描く＝guideAboveFog）。日照側の高温＝受動的な燃料消費（金星より軽い）。重力は火星とほぼ同じ。
  { id: 'mercury', celebTier: 2, name: 'MERCURY', atmoTag: 'NONE', realG: 3.70, atmoLabel: 'NONE \u00b7 DARK CRATER', atmoType: 'none',
    wind: { base: 0, gust: 0 }, drag: 0, visibility: 130, heat: { fuelDrain: 0.3, mainFuelMul: 1.0 }, guideAboveFog: true, obstacleStyle: 'rock',
    visual: { sky: ['#000000', '#0b0809'], ground: '#2d2b2e', rim: '#ffd29a', accent: '#ffb878', fog: '#000000', haze: null,
      skyObject: 'sun-low', mood: 'permanently shadowed crater, near-black regolith, huge low sun glare on the horizon' } },
];


// ---- TERRA: ボーナス専用の地球型惑星（6天体のツアーには含めない）----
// 実重力 9.81 m/s^2 をツアーと同じ平方根圧縮で使う（≈0.615）。風・抗力はミッションごとに与える（既定は無風・無抗力）。
export const TERRA = { id: 'terra', celebTier: 0, name: 'TERRA', atmoTag: 'EARTH-LIKE', realG: 9.81, atmoLabel: 'N₂/O₂ 1 BAR', atmoType: 'earth',
  wind: { base: 0, gust: 0 }, drag: 0, visibility: null, heat: null, obstacleStyle: 'rock',
  visual: { sky: ['#3f78bd', '#b9dcf0'], ground: '#5c8f4a', rim: '#d9f0a8', accent: '#fff2c0', fog: null, haze: null,
    skyObject: 'day', mood: 'daylight blue sky, drifting clouds, ocean horizon, green hills' } };

// ボーナスミッション。mult: 得点倍率 / stars: 難度 / moving: 移動パッド / wind,drag,dragY: TERRA の大気(null/0なら無し)。
// 数値は 04_tests/p6bonus.mjs の着陸可能性（自動操縦で 50 シード中 80% 以上）で調整済み。
export const BONUS_MISSIONS = {
  CALM:      { id: 'CALM', name: 'CALM APPROACH', stars: 1, mult: 1.0, line: 'TERRA GRAVITY ONLY', padW: 48, moving: false, plateauSegs: 0, padPeriod: 0, wind: null, drag: 0, dragY: 0, grantContinue: false },
  ROVER:     { id: 'ROVER', name: 'ROVER DOCK', stars: 2, mult: 1.5, line: 'THE PAD ROLLS SIDEWAYS', padW: 44, moving: true, plateauSegs: 6, padPeriod: 8, wind: null, drag: 0, dragY: 0, grantContinue: false },
  CROSSWIND: { id: 'CROSSWIND', name: 'CROSSWIND', stars: 2, mult: 1.5, line: 'GUSTING WIND AND DRAG', padW: 44, moving: false, plateauSegs: 0, padPeriod: 0, wind: { base: 0.06, gust: 0.16 }, drag: 0.1, dragY: 0.02, grantContinue: false },
  STORM:     { id: 'STORM', name: 'STORM LANDING', stars: 3, mult: 2.5, line: 'MOVING PAD, WIND, SMALL PAD', padW: 32, moving: true, plateauSegs: 6, padPeriod: 8, wind: { base: 0.05, gust: 0.12 }, drag: 0.08, dragY: 0.02, grantContinue: true },
};
export const BONUS_ORDER = ['CALM', 'ROVER', 'CROSSWIND', 'STORM'];
export const BONUS_ALT = ['ROVER', 'CROSSWIND'];   // ★★ は成立の度に交互
export function missionOf(type) { return Object.prototype.hasOwnProperty.call(BONUS_MISSIONS, type) ? BONUS_MISSIONS[type] : BONUS_MISSIONS.CALM; }
// ミッション用の天体データ: TERRA に風・抗力を載せ、祝福の格を ★-1（最大2）にする
export function bonusBody(type) {
  const m = missionOf(type);
  return Object.assign({}, TERRA, {
    wind: m.wind ? { base: m.wind.base, gust: m.wind.gust } : { base: 0, gust: 0 },
    drag: m.drag || 0, dragY: m.dragY || 0,
    celebTier: Math.min(2, m.stars - 1),
  });
}
// ボーナス得点 = round((600 + 残燃料*10) * 倍率)
export function bonusScoreFor(type, fuel) { return Math.round((600 + (fuel || 0) * 10) * missionOf(type).mult); }

export const BODY_COUNT = BODIES.length;

// stage(1始まり) -> { index, loop, body, firstOfBody }
export function stageInfo(stage) {
  const s = Math.max(1, Math.floor(stage) || 1);
  const index = Math.floor((s - 1) / STAGES_PER_BODY) % BODY_COUNT;
  const loop = Math.floor((s - 1) / (STAGES_PER_BODY * BODY_COUNT));
  return { index, loop, body: BODIES[index], firstOfBody: (s - 1) % STAGES_PER_BODY === 0 };
}

// 周回内のステージ番号(0始まり、0..11)
const inLoop = (stage) => (Math.max(1, Math.floor(stage) || 1) - 1) % (STAGES_PER_BODY * BODY_COUNT);

// ゲーム内重力: 実重力を平方根で圧縮（金星でも遊べる）し、周回ごとに+15%
export function bodyGravity(body, loop) {
  return GRAVITY_BASE * Math.sqrt(body.realG / G_REF) * (1 + 0.15 * loop);
}
export function padWidth(stage) {
  return Math.max(22, 54 - 3 * inLoop(stage) - 8 * stageInfo(stage).loop);
}
export function obstacleCount(stage) {
  if (stage <= 1) return 0;
  const cur = Math.min(2 + Math.floor(inLoop(stage) / 2), 7) + 2 * stageInfo(stage).loop;
  // 1周目だけ序盤をなだらかに（s1 0, s2 1, s3 2, s4 3, s5 4、以降は従来どおり）。2周目以降は不変
  return stageInfo(stage).loop === 0 ? Math.min(cur, inLoop(stage)) : cur;
}
export function obstacleSpeed(stage) {
  return 12 + 3 * inLoop(stage) + 6 * stageInfo(stage).loop;
}

// 風: 定常風(符号ランダム) + 2〜3個の正弦の平均による突風。大気のない天体は null。周回ごとに x(1+0.3*loop)。
export function makeWindSpec(body, loop, rnd = Math.random) {
  if (!body.wind || (!body.wind.base && !body.wind.gust)) return null;
  const mul = 1 + 0.3 * loop;
  const n = rnd() < 0.5 ? 2 : 3;
  const freqs = [], phases = [];
  const FREQS = [0.11, 0.27, 0.53];
  for (let i = 0; i < n; i++) { freqs.push(FREQS[i] * (0.8 + rnd() * 0.4)); phases.push(rnd() * Math.PI * 2); }
  return { base: (rnd() < 0.5 ? -1 : 1) * body.wind.base * mul, amp: body.wind.gust * mul, freqs, phases };
}
export function windAt(spec, t) {
  if (!spec) return 0;
  let s = 0;
  for (let i = 0; i < spec.freqs.length; i++) s += Math.sin(2 * Math.PI * spec.freqs[i] * t + spec.phases[i]);
  return spec.base + spec.amp * s / spec.freqs.length;
}

export function bodyHasWind(body) { return !!(body.wind && (body.wind.base || body.wind.gust)); }

// 例: 'MARS · g 3.71 m/s² · THIN CO₂ · WIND'
export function introText(body) {
  return body.name + ' · g ' + body.realG.toFixed(2) + ' m/s² · ' + body.atmoLabel + (bodyHasWind(body) ? ' · WIND' : '');
}

// ---- 着陸後の祝福モーション（データ/位相関数。描画は game.js の _drawAstronaut が仮図形で行う。P2が差し替える）----
// ジャンプの頂点高さと滞空時間は天体の重力に従う（低重力ほど高く・ゆっくり）。画面外に出ないよう頂点は12..40pxにクランプ。
export function celebrationParams(body) {
  const k = Math.sqrt(G_REF / body.realG);
  return { apex: Math.max(12, Math.min(40, 28 * k)), airtime: Math.max(0.45, Math.min(1.9, 1.2 * k)) };
}
// 周期シーケンス。kind: hop(跳躍) / rest(待機) / dance(loop>=1の締め)。spin: 回転数(負=バク宙)。arms: up|pump|wave
export function celebrationSequence(body, loop) {
  const { airtime: T } = celebrationParams(body);
  const tier = body.celebTier;
  let seq;
  if (tier === 0) seq = [{ kind: 'hop', dur: T, spin: 0, arms: 'up' }, { kind: 'rest', dur: 0.7, arms: 'wave' }];
  else if (tier === 1) seq = [{ kind: 'hop', dur: T, spin: 1, arms: 'up' }, { kind: 'rest', dur: 0.5, arms: 'wave' }];
  else seq = [{ kind: 'hop', dur: T, spin: -1, arms: 'up' }, { kind: 'hop', dur: T, spin: 0, arms: 'pump' }, { kind: 'rest', dur: 0.6, arms: 'pump' }];
  if (loop >= 1) seq.push({ kind: 'dance', dur: 0.9, spin: 0, arms: 'wave' });
  return seq;
}
// t = 着陸シーケンス終了からの秒数。戻り値のポーズ: dy(上方向px) dx rot(rad) armL/armR(下向き0..上向きπのrad) phase fx(祝福エフェクト) flagWave
export function celebrationPose(body, loop, t, perfect) {
  const { apex } = celebrationParams(body);
  const seq = celebrationSequence(body, loop);
  const total = seq.reduce((a, s) => a + s.dur, 0);
  let tc = ((t % total) + total) % total;
  let seg = seq[0];
  for (const s of seq) { if (tc < s.dur) { seg = s; break; } tc -= s.dur; }
  const u = Math.max(0, Math.min(1, tc / seg.dur));
  const pose = { dy: 0, dx: 0, rot: 0, armL: 0.3, armR: 0.3, phase: seg.kind, u, tier: body.celebTier, fx: null, flagWave: Math.sin(t * 6) };
  if (seg.kind === 'hop') {
    pose.dy = 4 * apex * u * (1 - u);
    pose.rot = (seg.spin || 0) * 2 * Math.PI * u;
  } else if (seg.kind === 'dance') {
    pose.dx = 5 * Math.sin(u * 2 * Math.PI * 3);
    pose.rot = 0.25 * Math.sin(u * 2 * Math.PI * 3);
  }
  if (seg.arms === 'up') { pose.armL = 2.6; pose.armR = 2.6; }
  else if (seg.arms === 'pump') { pose.armL = 0.3; pose.armR = 2.5 + 0.5 * Math.sin(t * 18); }
  else if (seg.kind === 'dance') { pose.armL = 1.5 + 0.8 * Math.sin(u * 2 * Math.PI * 3); pose.armR = 1.5 - 0.8 * Math.sin(u * 2 * Math.PI * 3); }
  else { pose.armL = 0.3; pose.armR = 2.3 + 0.5 * Math.sin(t * 14); }
  if (perfect) pose.fx = { u: (t % 1.2) / 1.2, n: 8 };
  return pose;
}
