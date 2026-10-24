// モジュール（P1.5）: 3ステージごと（ボーナス終了後）に2択で1つ獲得。ラン中は永続（Continueで維持、新規ランでリセット）。
// 燃料タンクはユーザー判断で候補から除外（2026-10-25）。fuelMulFor は FUEL_RUN 等の計算互換のため残す（Lv0=×1）。
export const MODULE_DEFS = [
  { id: 'stab',   name: 'STABILIZER',      icon: 'S', max: 2, desc: 'STRONGER ROTATION DAMPING' },
  { id: 'shock',  name: 'SHOCK ABSORBER',  icon: 'A', max: 2, desc: 'LANDING SPEED LIMITS UP' },
  { id: 'radar',  name: 'RADAR',           icon: 'R', max: 1, desc: 'SHOWS PREDICTED TOUCHDOWN + VELOCITY' },
  { id: 'shield', name: 'SHIELD',          icon: 'H', max: 2, desc: 'ABSORBS 1 HIT PER LEVEL, EVERY STAGE' },
];
export const MODULE_IDS = MODULE_DEFS.map(m => m.id);
export const moduleDef = (id) => MODULE_DEFS.find(m => m.id === id) || null;

export function newModules() {
  const o = {};
  for (const m of MODULE_DEFS) o[m.id] = 0;
  return o;
}

// 効果テーブル（レベル -> 値）
export const FUEL_PER_LEVEL = 0.25;
export const ANG_DAMP_BY_LEVEL = [0.82, 0.6, 0.45];
export const SAFE_VY_PER_LEVEL = 6;
export const BOUNCE_VY_PER_LEVEL = 8;
export const fuelMulFor = (lvl) => 1 + FUEL_PER_LEVEL * lvl;
export const angDampFor = (lvl) => ANG_DAMP_BY_LEVEL[Math.max(0, Math.min(ANG_DAMP_BY_LEVEL.length - 1, lvl))];

export function isMaxed(mods, id) {
  const d = moduleDef(id);
  return !d || (mods[id] || 0) >= d.max;
}

// 最大2つ、重複なし、上限到達済みは除外。候補が1つなら1つ、0なら空。
export function rollOffers(mods, rnd = Math.random, count = 2) {
  const pool = MODULE_DEFS.filter(d => !isMaxed(mods, d.id)).map(d => d.id);
  const out = [];
  while (out.length < count && pool.length) {
    const i = Math.min(pool.length - 1, Math.floor(rnd() * pool.length));
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
