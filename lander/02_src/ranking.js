// ローカルランキング（端末ごとの localStorage 保存）。純関数中心でヘッドレステスト可能。
// Entry = { name, score, stage, date(ISO) }。上位10件を score降順 → stage降順 → 日付が早い順 で保持する。
import { P } from './core/palette.js';
import { relayEnabled, fetchWorldTop, submitScore, makeNameKey } from './net.js';
import * as NetNS from './net.js';
import { txt, rgba, hair, pill, ellipsize } from './art.js';
import { stageInfo, STAGES_PER_BODY, bodyGravity } from './bodies.js';

export const RANK_MAX = 10;

// ---- 世界ランキングの通信窓口（テストで差し替え可能）----
// setTitle は別担当が net.js に追加する。無い／古いワーカーなら 'unavailable' を返し、フローを止めない。
// ESM では名前空間 NetNS、結合バンドルでは import が除去されるので同一スコープの識別子を参照する。
const _netSetTitle = () => {
  try {
    if (typeof NetNS !== 'undefined' && NetNS) return typeof NetNS.setTitle === 'function' ? NetNS.setTitle : null;
    // eslint-disable-next-line no-undef
    return typeof setTitle === 'function' ? setTitle : null;
  } catch (_) { return null; }
};
export const WorldNet = {
  fetchTop: (...a) => fetchWorldTop(...a),
  submit: (e) => submitScore(e),
  setTitle: (name, key, title) => {
    const f = _netSetTitle();
    if (!f) return Promise.resolve({ ok: false, error: 'unavailable' });
    try { return Promise.resolve(f(name, key, title)).then((r) => r || { ok: false, error: 'unavailable' }, () => ({ ok: false, error: 'unavailable' })); }
    catch (_) { return Promise.resolve({ ok: false, error: 'unavailable' }); }
  },
};

// ---- チャンピオンの称号（epithet）と WORLD #1 のキャッシュ ----
export const TITLE_MAX = 16;
const segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
export function graphemes(s) {
  s = String(s == null ? '' : s);
  if (segmenter) { try { return Array.from(segmenter.segment(s), (x) => x.segment); } catch (_) { /* fallthrough */ } }
  return Array.from(s);
}
// 制御文字・双方向制御・ゼロ幅を除き、前後の空白を除いて書記素16文字まで。空文字=称号の削除
export function sanitizeTitle(s) {
  const clean = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').trim();
  return graphemes(clean).slice(0, TITLE_MAX).join('').trim();
}
export function titleResultMessage(r) {
  if (r && r.ok) return 'TITLE SAVED';
  const e = r && r.error;
  if (e === 'not-champion') return 'NOT THE CHAMPION ANYMORE';
  if (e === 'unavailable' || e === 'disabled') return 'TITLE SERVICE UNAVAILABLE';
  if (e === 'forbidden') return 'NOT ALLOWED \u2014 KEY MISMATCH';
  if (e === 'unknown') return 'NAME NOT REGISTERED';
  if (e === 'invalid') return 'INVALID TITLE';
  return 'OFFLINE \u2014 TRY LATER';
}
const TOP1_KEY = 'worldTop1';
const cleanTitleField = (t) => (typeof t === 'string' ? sanitizeTitle(t) : '');
export function loadTop1(storage) {
  try {
    const raw = storage.get(TOP1_KEY, null);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.name !== 'string' || !o.name || !Number.isFinite(o.score)) return null;
    return { name: o.name, score: o.score, title: cleanTitleField(o.title), at: Number.isFinite(o.at) ? o.at : 0 };
  } catch (_) { return null; }
}
export function saveTop1(storage, row) {
  try { storage.set(TOP1_KEY, row ? JSON.stringify({ name: row.name, score: row.score, title: row.title || '', at: row.at || Date.now() }) : ''); return true; } catch (_) { return false; }
}
// 取得した上位から #1 を取り出してキャッシュ更新。空配列=サーバー上に記録なし→消去。返り値は新しい #1 または null
export function top1FromList(storage, list) {
  const r = Array.isArray(list) ? list.find((e) => validEntry(e)) : null;
  const row = r ? { name: String(r.name), score: r.score, title: cleanTitleField(r.title), at: Date.now() } : null;
  saveTop1(storage, row);
  return row;
}

// ---- WORLD TOP のキャッシュ（起動画面で即表示／YOU #N 用に上位~100件）----
const LIST_KEY = 'worldTop5', LIST_MAX = 100;
export function saveWorldList(storage, list) {
  try {
    if (!storage || !Array.isArray(list)) return false;
    const rows = list.filter(validEntry).slice(0, LIST_MAX).map((e) => ({ name: String(e.name), score: e.score, title: cleanTitleField(e.title) }));
    storage.set(LIST_KEY, JSON.stringify({ at: Date.now(), rows }));
    return true;
  } catch (_) { return false; }
}
export function loadWorldList(storage) {
  try {
    const raw = storage && storage.get(LIST_KEY, null);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.rows)) return null;
    const rows = o.rows.filter((e) => e && typeof e.name === 'string' && e.name && Number.isFinite(e.score)).slice(0, LIST_MAX)
      .map((e) => ({ name: e.name, score: e.score, title: cleanTitleField(e.title) }));
    return rows.length ? rows : null;
  } catch (_) { return null; }
}
// 表示用: { rows:[{rank,name,score,title,you}] (最大5), extra:{rank,score}|null (5位圏外の自分) }。list 空なら null
export function worldTop5View(list, myName) {
  if (!Array.isArray(list) || !list.length) return null;
  const rows = list.slice(0, 5).map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, title: e.title || '', you: !!myName && e.name === myName }));
  let extra = null;
  if (myName && !rows.some((r) => r.you)) {
    const i = list.findIndex((e) => e.name === myName);
    if (i >= 5) extra = { rank: i + 1, score: list[i].score };
  }
  return { rows, extra };
}
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
    const tl = (typeof e.title === 'string' && e.title) ? e.title : '';
    const nm = ellipsize(ctx, e.name, 13, 400, 1, 140);
    txt(ctx, nm, x + 38, ry + (tl ? 1 : 4), 13, c, 'left', { w: 400, sp: 1 });
    if (tl) txt(ctx, ellipsize(ctx, tl, 7, 400, 0.5, 140), x + 38, ry + 16, 7, hl ? p.warn : p.dim, 'left', { w: 400, sp: 0.5 });
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
export function rankTabsTap(tabs, x, y, px, py, w, storage) {
  if (!relayEnabled()) return false;
  const r = rankTabRects(x, y, w);
  if (inRect(r.local, px, py)) { tabs.mode = 'local'; return true; }
  if (inRect(r.world, px, py)) {
    tabs.mode = 'world';
    if (tabs.status === 'idle' || tabs.status === 'offline') loadWorld(tabs, storage);
    return true;
  }
  return false;
}

export function loadWorld(tabs, storage) {
  tabs.status = 'loading';
  const tk = ++tabs.token;
  return WorldNet.fetchTop().then((list) => {
    if (tk !== tabs.token) return;
    if (list) { if (storage) saveWorldList(storage, list); tabs.world = list.filter(validEntry).slice(0, RANK_MAX); tabs.status = 'ok'; }
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

// ---- 1ランにつき1行（runId）----
// 同じ runId の行があれば、新スコアが高い時だけ置き換える（低ければ何もしない）。runId 無しは従来どおり追加。
export function recordEntry(list, entry) {
  if (entry && entry.runId) {
    const i = list.findIndex((e) => e.runId === entry.runId);
    if (i >= 0) {
      if (!(entry.score > list[i].score)) return list;
      const rest = list.slice(); rest.splice(i, 1);
      return insertEntry(rest, entry);
    }
  }
  return insertEntry(list, entry);
}
export function newRunId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

// ---- チェックポイント（ステージ開始時の保存。ローカルのみ）----
const CP_KEY = 'checkpoint';
export function loadCheckpoint(storage) {
  try {
    const raw = storage.get(CP_KEY, null);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || c.v !== 1 || typeof c.runId !== 'string' || !c.runId) return null;
    if (!Number.isInteger(c.stage) || c.stage < 1 || c.stage > 9999) return null;
    if (!Number.isFinite(c.totalScore) || c.totalScore < 0) return null;
    if (!Number.isInteger(c.continues) || c.continues < 0 || c.continues > 99) return null;
    if (!c.modules || typeof c.modules !== 'object' || Array.isArray(c.modules)) return null;
    return c;
  } catch (_) { return null; }
}
export function saveCheckpoint(storage, cp) {
  try { return !!storage.set(CP_KEY, JSON.stringify(Object.assign({ v: 1, savedAt: new Date().toISOString() }, cp))); } catch (_) { return false; }
}
export function clearCheckpoint(storage) { try { storage.set(CP_KEY, ''); } catch (_) { /* ignore */ } }

// ---- パイロット・プロフィール（端末ごと最大3名。{name, key}）----
export const PROFILE_MAX = 3;
const PROF_KEY = 'profiles', ACTIVE_KEY = 'activeProfile';
function readProfiles(storage) {
  try {
    const arr = JSON.parse(storage.get(PROF_KEY, '') || '[]');
    if (!Array.isArray(arr)) return [];
    const seen = new Set(), out = [];
    for (const p of arr) {
      if (!p || typeof p.name !== 'string' || typeof p.key !== 'string') continue;
      const nm = sanitizeName(p.name);
      if (!nm || seen.has(nm)) continue;
      seen.add(nm); out.push({ name: nm, key: p.key });
      if (out.length >= PROFILE_MAX) break;
    }
    return out;
  } catch (_) { return []; }
}
function writeProfiles(storage, list) { try { storage.set(PROF_KEY, JSON.stringify(list)); } catch (_) { /* ignore */ } }
// 一覧を返す。プロフィールが無く lastName があれば移行（新しいキーで作成）。lastName が一覧に無ければ（枠があれば）追加
export function loadProfiles(storage) {
  let list = readProfiles(storage);
  const ln = getPlayerName(storage);
  if (ln && !list.some((p) => p.name === ln) && list.length < PROFILE_MAX) {
    list = list.concat([{ name: ln, key: makeNameKey() }]);
    writeProfiles(storage, list);
  }
  return list;
}
export function getActiveProfile(storage) {
  const list = loadProfiles(storage);
  if (!list.length) return null;
  const ln = getPlayerName(storage);
  let act = null; try { act = storage.get(ACTIVE_KEY, null); } catch (_) { /* ignore */ }
  return list.find((p) => p.name === ln) || list.find((p) => p.name === act) || list[0];
}
export function setActiveProfile(storage, name) {
  const list = loadProfiles(storage);
  const p = list.find((x) => x.name === name);
  if (!p) return null;
  try { storage.set(ACTIVE_KEY, p.name); storage.set('lastName', p.name); } catch (_) { /* ignore */ }
  return p;
}
// 追加して有効化。空名/枠なし -> null。同名が既にあれば選択のみ
export function addProfile(storage, name) {
  const nm = sanitizeName(name);
  if (!nm) return null;
  const list = loadProfiles(storage);
  const ex = list.find((p) => p.name === nm);
  if (ex) return setActiveProfile(storage, nm);
  if (list.length >= PROFILE_MAX) return null;
  list.push({ name: nm, key: makeNameKey() });
  writeProfiles(storage, list);
  return setActiveProfile(storage, nm);
}
export function removeProfile(storage, name) {
  const list = loadProfiles(storage).filter((p) => p.name !== name);
  writeProfiles(storage, list);
  clearProgress(storage, name);
  const cur = getPlayerName(storage);
  if (cur === name || !list.some((p) => p.name === cur)) {
    try { storage.set('lastName', list.length ? list[0].name : ''); storage.set(ACTIVE_KEY, list.length ? list[0].name : ''); } catch (_) { /* ignore */ }
  }
  return list;
}

// ---- パイロット別の到達記録（'progress': { 名前: { maxStage } }）。開始地点の解放に使う ----
const PROGRESS_KEY = 'progress';
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function readProgress(storage) {
  try {
    const o = JSON.parse(storage.get(PROGRESS_KEY, '') || '{}');
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (_) { return {}; }
}
function writeProgress(storage, o) { try { storage.set(PROGRESS_KEY, JSON.stringify(o)); } catch (_) { /* ignore */ } }
export function getMaxStage(storage, name) {
  const key = sanitizeName(name);
  if (!key) return 1;
  const o = readProgress(storage);
  const m = hasOwn(o, key) && o[key] ? o[key].maxStage : 1;
  return Number.isInteger(m) && m >= 1 && m <= 9999 ? m : 1;
}
// 通常ステージの開始時に呼ぶ。到達が伸びた時だけ保存
export function recordStageReached(storage, name, stage) {
  const key = sanitizeName(name);
  if (!key || !Number.isInteger(stage) || stage < 1 || stage > 9999) return false;
  if (stage <= getMaxStage(storage, key)) return false;
  const o = readProgress(storage);
  o[key] = { maxStage: stage };
  writeProgress(storage, o);
  return true;
}
export function clearProgress(storage, name) {
  const o = readProgress(storage);
  if (!hasOwn(o, name)) return;
  delete o[name];
  writeProgress(storage, o);
}
// 解放済みの開始地点 = 到達済みの全ステージ（ユーザー判断で天体単位→ステージ単位に変更）。新しい順（最遠が先頭）で返す
// 天体の2ステージ目は名前の後ろに ' 2' を付けて区別する（開始時は天体紹介を表示する：game.js の _introNext）
export function unlockedStarts(maxStage) {
  const m = Math.max(1, Math.floor(maxStage) || 1);
  const out = [];
  for (let s = 1; s <= m; s += 1) {
    const info = stageInfo(s);
    const part = ((s - 1) % STAGES_PER_BODY) + 1;
    out.push({ stage: s, loop: info.loop, name: info.body.name, part, label: (info.loop >= 1 ? 'ORBIT ' + (info.loop + 1) + ' \u00b7 ' : '') + info.body.name + (part > 1 ? ' ' + part : ''),
      realG: info.body.realG, gravity: bodyGravity(info.body, info.loop) });
  }
  return out.reverse();
}
