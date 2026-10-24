// ローカルランキング（端末ごとの localStorage 保存）。純関数中心でヘッドレステスト可能。
// Entry = { name, score, stage, date(ISO) }。上位10件を score降順 → stage降順 → 日付が早い順 で保持する。
import { P } from './core/palette.js';

export const RANK_MAX = 10;
const RANK_KEY = 'ranking';

const validEntry = (e) => !!e && typeof e.name === 'string' && Number.isFinite(e.score) && Number.isFinite(e.stage);

function cmpEntry(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.stage !== a.stage) return b.stage - a.stage;
  const da = String(a.date || ''), db = String(b.date || '');
  return da < db ? -1 : da > db ? 1 : 0;
}

// 破損JSON・非配列・不正要素は除外して返す（例外は投げない）
export function loadRanking(storage) {
  try {
    const raw = storage.get(RANK_KEY, null);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(validEntry).sort(cmpEntry).slice(0, RANK_MAX);
  } catch (_) {
    return [];
  }
}

export function saveRanking(storage, list) {
  try { storage.set(RANK_KEY, JSON.stringify(list)); return true; } catch (_) { return false; }
}

// 非破壊。新規エントリは同順位の既存より後ろ（ソートは安定、日付で既存が先）。
export function insertEntry(list, entry) {
  return list.concat([entry]).sort(cmpEntry).slice(0, RANK_MAX);
}

export function qualifies(list, score) {
  if (!(score > 0)) return false;
  if (list.length < RANK_MAX) return true;
  const sorted = list.slice().sort(cmpEntry);
  return score > sorted[RANK_MAX - 1].score;
}

// ランキング行の描画（タイトル/ゲームオーバー共通・仮デザイン）。highlight = 強調する行index
export function drawRankingRows(engine, ctx, list, x, y, w, highlight) {
  const p = P();
  const rowH = 22;
  if (!list.length) { engine.text('NO RECORDS YET', x + w / 2, y + 8, 13, p.dim, 'center'); return; }
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const ry = y + i * rowH;
    const hl = i === highlight;
    if (hl) { ctx.fillStyle = p.dim; ctx.fillRect(x, ry - 2, w, rowH); }
    const c = hl ? p.hi : p.fg;
    engine.text(String(i + 1), x + 6, ry, 13, c, 'left');
    engine.text(e.name, x + 30, ry, 13, c, 'left');
    engine.text(String(e.score), x + w - 46, ry, 13, c, 'right');
    engine.text('ST.' + e.stage, x + w - 6, ry, 11, hl ? p.hi : p.mid, 'right');
  }
}
