// ローカルランキング（端末ごとの localStorage 保存）。純関数中心でヘッドレステスト可能。
// Entry = { name, score, stage, date(ISO) }。上位10件を score降順 → stage降順 → 日付が早い順 で保持する。
import { P } from './core/palette.js';
import { relayEnabled, fetchWorldTop } from './net.js';
import { txt, rgba, hair, pill } from './art.js';

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

// ランキング行の描画（タイトル/ゲームオーバー共通）。P2a: ヘアライン区切り + 控えめな強調。highlight = 強調する行index
export function drawRankingRows(engine, ctx, list, x, y, w, highlight) {
  const p = P();
  const rowH = 30;
  if (!list.length) { txt(ctx, 'NO RECORDS YET', x + w / 2, y + 12, 10, p.dim, 'center', { sp: 3, w: 500 }); return; }
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const ry = y + i * rowH;
    const hl = i === highlight;
    if (hl) { pill(ctx, x - 4, ry, w + 8, rowH - 4, rgba(p.warn, 0.10), rgba(p.warn, 0.4)); }
    else if (i > 0) hair(ctx, x + 4, ry - 2, x + w - 4, ry - 2, p.fg, 0.08);
    const c = hl ? p.warn : p.fg;
    txt(ctx, String(i + 1).padStart(2, '0'), x + 10, ry + 5, 11, p.dim, 'left', { w: 300, sp: 1 });
    txt(ctx, e.name, x + 38, ry + 4, 13, c, 'left', { w: 400, sp: 1 });
    txt(ctx, String(e.score), x + w - 54, ry + 3, 15, c, 'right', { w: 300 });
    txt(ctx, 'ST.' + e.stage, x + w - 10, ry + 7, 9, hl ? p.warn : p.dim, 'right', { w: 500, sp: 1.5 });
  }
}

// ---- LOCAL / WORLD タブ（RELAY_URL 設定時のみ表示）----
export function createRankTabs() { return { mode: 'local', world: null, status: 'idle', token: 0 }; }

export function rankTabRects(x, y, w) {
  const bw = Math.floor((w - 8) / 2), h = 18;
  return { local: { x, y, w: bw, h }, world: { x: x + bw + 8, y, w: bw, h } };
}

const inRect = (r, px, py) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

// タップがタブに当たったか処理する。当たったら true（WORLD 選択時は取得を開始）
export function rankTabsTap(tabs, x, y, px, py, w) {
  if (!relayEnabled()) return false;
  const r = rankTabRects(x, y, w);
  if (inRect(r.local, px, py)) { tabs.mode = 'local'; return true; }
  if (inRect(r.world, px, py)) {
    tabs.mode = 'world';
    if (tabs.status === 'idle' || tabs.status === 'offline') loadWorld(tabs);
    return true;
  }
  return false;
}

export function loadWorld(tabs) {
  tabs.status = 'loading';
  const tk = ++tabs.token;
  return fetchWorldTop().then((list) => {
    if (tk !== tabs.token) return;
    if (list) { tabs.world = list.filter(validEntry).slice(0, RANK_MAX); tabs.status = 'ok'; }
    else tabs.status = 'offline';
  });
}

// タブ＋リスト本体の描画。localList は端末内ランキング。rows は y+24 から
export function drawRankPanel(engine, ctx, tabs, localList, x, y, w, highlight) {
  const p = P();
  if (!relayEnabled()) { drawRankingRows(engine, ctx, localList, x, y + 24, w, highlight); return; }
  const r = rankTabRects(x, y, w);
  for (const k of ['local', 'world']) {
    const on = tabs.mode === k;
    pill(ctx, r[k].x, r[k].y, r[k].w, r[k].h, on ? rgba(p.fg, 0.10) : null, rgba(p.fg, on ? 0.4 : 0.16));
    txt(ctx, k.toUpperCase(), r[k].x + r[k].w / 2, r[k].y + 5, 9, on ? p.hi : p.dim, 'center', { sp: 3, w: 500 });
  }
  if (tabs.mode === 'local') drawRankingRows(engine, ctx, localList, x, y + 24, w, highlight);
  else if (tabs.status === 'loading' || tabs.status === 'idle') txt(ctx, 'LOADING\u2026', x + w / 2, y + 40, 11, p.mid, 'center', { sp: 3 });
  else if (tabs.status === 'offline') txt(ctx, 'OFFLINE', x + w / 2, y + 40, 11, p.bad, 'center', { sp: 3 });
  else drawRankingRows(engine, ctx, tabs.world || [], x, y + 24, w, -1);
}

// ---- プレイヤー名（プレイ前にタイトルで入力。保存キー 'lastName'）----
export function sanitizeName(name) {
  return Array.from(String(name == null ? '' : name).trim()).slice(0, 10).join('').trim();
}
export function getPlayerName(storage) {
  try { return sanitizeName(storage.get('lastName', '') || ''); } catch (_) { return ''; }
}
export function setPlayerName(storage, name) {
  const nm = sanitizeName(name) || 'PILOT';
  try { storage.set('lastName', nm); } catch (_) { /* 保存不可でも続行 */ }
  return nm;
}
