// L2: ステージごとの★3つ（パイロット別・累積）と最高グレードの保存・読み出し。
// 保存先は L1 の 'stageBest' = { パイロット名: { ステージ: { grade, stars } } }（stars はビットマスク）。通常ステージのみ・デバッグ操作のランは呼び出し側で除外。
// ★1 パッドに着陸 / ★2 そのステージの輪を全部取って着陸 / ★3 PERFECT。別の挑戦で取った★も累積（OR）。
import { BODIES, STAGES_PER_BODY, stageInfo } from './bodies.js';

export const STAR_LANDED = 1, STAR_RINGS = 2, STAR_PERFECT = 4;
export const STAR_LABELS = ['LANDED', 'RINGS', 'PERFECT'];
export const GRADES = ['C', 'B', 'A', 'S', 'PERFECT'];
const rankOf = (g) => GRADES.indexOf(g);
export const starCount = (mask) => ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0);

// 保存値を安全に読む（壊れていれば空）。戻り値は prototype を持たない { 名前: { ステージ: {grade, stars} } }
export function readStageBest(storage) {
  const o = Object.create(null);
  try {
    const raw = storage.get('stageBest', null);
    const j = raw ? JSON.parse(raw) : null;
    if (j && typeof j === 'object' && !Array.isArray(j)) for (const k of Object.keys(j)) if (k !== '__proto__' && j[k] && typeof j[k] === 'object') o[k] = j[k];
  } catch (_) { /* 壊れていれば作り直す */ }
  return o;
}
const cleanRec = (r) => ({ grade: (r && GRADES.indexOf(r.grade) >= 0) ? r.grade : '', stars: ((r && Number(r.stars)) | 0) & 7 });

// このステージの記録を返す（無ければ { grade:'', stars:0 }）
export function stageRecord(storage, name, stage) {
  const all = readStageBest(storage);
  const mine = name && all[name];
  return cleanRec(mine && typeof mine === 'object' ? mine[String(stage)] : null);
}

// 記録を更新する（グレードは良い方、★は OR で累積）。戻り値: { grade, stars(累積), fresh(今回あらたに増えた★のマスク) }
export function recordStage(storage, name, stage, grade, mask) {
  const prev = { grade: '', stars: 0 };
  if (!name || name === '__proto__') return { grade, stars: mask & 7, fresh: mask & 7, saved: false };
  const o = readStageBest(storage);
  const mine = Object.create(null);
  if (o[name]) for (const k of Object.keys(o[name])) if (k !== '__proto__') mine[k] = o[name][k];
  const key = String(stage);
  const cur = cleanRec(mine[key]);
  prev.grade = cur.grade; prev.stars = cur.stars;
  const g = (cur.grade && rankOf(cur.grade) >= rankOf(grade)) ? cur.grade : grade;
  const stars = cur.stars | (mask & 7);
  mine[key] = { grade: g, stars }; o[name] = mine;
  let saved = true;
  try { storage.set('stageBest', JSON.stringify(o)); } catch (_) { saved = false; }
  return { grade: g, stars, fresh: stars & ~prev.stars, saved };
}

// L3（太陽系マップ）が使う集計: 天体ごと・ステージごとの★と最高グレード。
// 戻り値: { totalStars, maxStars, bodies: [{ id, name, stars, max, grade(最高), stages: [{ stage, loop, part, mask, stars, grade }] }] }
// 各天体に、1周目の2ステージ（記録がなくても）と、記録のある2周目以降のステージを含める。
export function starsSummary(storage, name) {
  const all = readStageBest(storage);
  const mine = (name && all[name] && typeof all[name] === 'object') ? all[name] : {};
  const recs = new Map();
  for (const k of Object.keys(mine)) { const s = Number(k); if (Number.isInteger(s) && s >= 1 && s <= 9999 && k !== '__proto__') recs.set(s, cleanRec(mine[k])); }
  const bodies = BODIES.map((b) => ({ id: b.id, name: b.name, stars: 0, max: 0, grade: '', stages: [] }));
  const add = (s) => {
    const info = stageInfo(s), B = bodies[info.index], r = recs.get(s) || { grade: '', stars: 0 };
    if (B.stages.some((x) => x.stage === s)) return;
    B.stages.push({ stage: s, loop: info.loop, part: ((s - 1) % STAGES_PER_BODY) + 1, mask: r.stars, stars: starCount(r.stars), grade: r.grade });
  };
  for (let s = 1; s <= STAGES_PER_BODY * BODIES.length; s++) add(s);
  for (const s of recs.keys()) add(s);
  let total = 0, maxT = 0;
  for (const B of bodies) {
    B.stages.sort((a, b) => a.stage - b.stage);
    for (const st of B.stages) { B.stars += st.stars; B.max += 3; if (st.grade && rankOf(st.grade) > rankOf(B.grade)) B.grade = st.grade; }
    total += B.stars; maxT += B.max;
  }
  return { totalStars: total, maxStars: maxT, bodies };
}
