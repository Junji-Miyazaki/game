// EXPEDITION（本編 v1.1）のパイロットごとの保存と、探査天体の絵。
// 保存キー（接頭辞 lander11. は Storage が付ける）: 'xp.<パイロット名を encodeURIComponent>.<id>.<k>'
//   k = unlocked('1') / seen('1' = マップで正体を見せた) / podMiss（POD を逃した回数）/ played('1' = 一度でも始めた) / best / besttime / skipBrief（shell が使う）
//       / wsent・wsentS（世界ランキングへ送り終えたタイムと得点。これより良い besttime / best.score があれば送る）
// 試作ページの記録（'lander11.exp.<shellId>.*'）とは別。試作で遊んだ記録は本編に出ない。
// 全解放の隠しスイッチ: URL に ?expedition=all（保存はしない。友人の試遊用）。
// バンドルは1つのスコープなので、トップレベルの名前はすべて xp / XP_ で始める。
import { EXP_MISSIONS, EXP_IDS } from './expedition/index.js';
import { rgba } from './art.js';
import { getActiveProfile, WorldNet } from './ranking.js';
import { relayEnabled } from './net.js';
import { isDebug } from './debug.js';

export const XP_STARS_PER = 3;
export const XP_STARS_MAX = EXP_MISSIONS.length * XP_STARS_PER;   // 12（ツアー 48 と合わせて 60）
const XP_enc = (name) => encodeURIComponent(name || '_');
export function xpKey(pilot, id, k) { return 'xp.' + XP_enc(pilot) + '.' + id + '.' + k; }
const XP_get = (st, pilot, id, k) => { try { return st.get(xpKey(pilot, id, k), null); } catch (_) { return null; } };
const XP_set = (st, pilot, id, k, v) => { try { return !!st.set(xpKey(pilot, id, k), v); } catch (_) { return false; } };
// shell.js の cfg.store（get/set）
export function xpStore(storage, pilot, id) { return { get: (k) => XP_get(storage, pilot, id, k), set: (k, v) => XP_set(storage, pilot, id, k, v) }; }

let XP_all = null;
export function xpAllUnlocked() {
  if (XP_all === null) { try { XP_all = typeof location !== 'undefined' && /(^|[?&])expedition=all(&|$)/.test(String(location.search || '')); } catch (_) { XP_all = false; } }
  return XP_all;
}
export function __xpSetAll(v) { XP_all = v == null ? null : !!v; }   // テスト用
export function xpUnlockedSaved(storage, pilot, id) { return XP_get(storage, pilot, id, 'unlocked') === '1'; }
export function xpIsUnlocked(storage, pilot, id) { return xpAllUnlocked() || xpUnlockedSaved(storage, pilot, id); }
export function xpUnlock(storage, pilot, id) { if (xpUnlockedSaved(storage, pilot, id)) return false; return XP_set(storage, pilot, id, 'unlocked', '1'); }
export function xpSeen(storage, pilot, id) { return XP_get(storage, pilot, id, 'seen') === '1'; }
export function xpMarkSeen(storage, pilot, id) { return XP_set(storage, pilot, id, 'seen', '1'); }
export function xpPlayed(storage, pilot, id) { return XP_get(storage, pilot, id, 'played') === '1' || !!XP_get(storage, pilot, id, 'best'); }
export function xpMarkPlayed(storage, pilot, id) { return XP_set(storage, pilot, id, 'played', '1'); }
// まだ一度も遊んでいない解放済みの探査（並び順で最初の1つ）。ツアーの再案内と終了画面の入口が使う。無ければ null
export function xpUnplayed(storage, pilot, bodyId) {
  if (!storage || !pilot) return null;
  const m = EXP_MISSIONS.find((x) => (!bodyId || x.body === bodyId) && xpIsUnlocked(storage, pilot, x.id) && !xpPlayed(storage, pilot, x.id));
  return m ? m.id : null;
}
export function xpPodMiss(storage, pilot, id) { const n = parseInt(XP_get(storage, pilot, id, 'podMiss'), 10); return Number.isFinite(n) && n > 0 ? n : 0; }
export function xpSetPodMiss(storage, pilot, id, n) { return XP_set(storage, pilot, id, 'podMiss', String(Math.max(0, n | 0))); }
export function xpBest(storage, pilot, id) {
  try { const b = JSON.parse(XP_get(storage, pilot, id, 'best')); if (b && Array.isArray(b.stars)) return { score: +b.score || 0, stars: [!!b.stars[0], !!b.stars[1], !!b.stars[2]] }; } catch (_) { /* 無効 */ }
  return { score: 0, stars: [false, false, false] };
}
// マップ用のまとめ: { list:[{ id, name, title, sys, body, no, unlocked, seen, stars }], stars, max }
export function xpSummary(storage, pilot) {
  let total = 0;
  const list = EXP_MISSIONS.map((m) => {
    const b = xpBest(storage, pilot, m.id), n = b.stars.filter(Boolean).length;
    total += n;
    return { id: m.id, name: m.name, title: m.title, sys: m.sys, body: m.body, no: m.no, unlocked: xpIsUnlocked(storage, pilot, m.id), seen: xpSeen(storage, pilot, m.id), stars: n };
  });
  return { list, stars: total, max: XP_STARS_MAX };
}

// ---- 探査天体の絵（計器風。中心 x,y・半径 r）。マップの小さな印と MISSION ACCEPTED の大写しで使う ----
const XP_TAU = Math.PI * 2;
function XP_shade(c, x, y, r) {   // 左上から光（右下を暗く）
  const g = c.createRadialGradient(x - r * 0.45, y - r * 0.45, r * 0.1, x - r * 0.2, y - r * 0.2, r * 1.5);
  g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = g; c.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
}
function XP_path(c, id, x, y, r, t) {
  c.beginPath();
  if (id === 'phobos') c.ellipse(x, y, r, r * 0.76, -0.3, 0, XP_TAU);
  else if (id === 'ryugu') {   // そろばん玉（赤道の尾根）
    c.moveTo(x, y - r * 0.9); c.quadraticCurveTo(x + r * 0.7, y - r * 0.55, x + r, y - r * 0.02); c.quadraticCurveTo(x + r * 0.7, y + r * 0.5, x, y + r * 0.9);
    c.quadraticCurveTo(x - r * 0.7, y + r * 0.5, x - r, y - r * 0.02); c.quadraticCurveTo(x - r * 0.7, y - r * 0.55, x, y - r * 0.9); c.closePath();
  } else if (id === '67p') { c.ellipse(x - r * 0.3, y + r * 0.16, r * 0.66, r * 0.52, 0.25, 0, XP_TAU); c.moveTo(x + r * 0.9, y - r * 0.24); c.ellipse(x + r * 0.46, y - r * 0.24, r * 0.44, r * 0.4, -0.2, 0, XP_TAU); }
  else c.arc(x, y, r, 0, XP_TAU);
}
const XP_COL = { phobos: '#7a675a', ryugu: '#4b4641', '67p': '#56514c', enceladus: '#dfeef6' };
export function xpBodyColor(id) { return XP_COL[id] || '#888'; }
export function xpDrawBody(c, id, x, y, r, t, o) {
  o = o || {}; const a = o.alpha == null ? 1 : o.alpha;
  c.save(); c.globalAlpha *= a;
  if (id === '67p' && r > 14) {   // コマ（淡いもや）
    const g = c.createRadialGradient(x, y, r * 0.5, x, y, r * 1.9); g.addColorStop(0, 'rgba(190,225,255,0.18)'); g.addColorStop(1, 'rgba(190,225,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 1.9, 0, XP_TAU); c.fill();
  }
  if (id === 'enceladus' && r > 14) {   // 南極の噴出
    for (let i = 0; i < 18; i++) { const q = ((t || 0) * 0.35 + i / 18) % 1, sx = x + (Math.sin(i * 2.3) * 0.35) * r; c.fillStyle = 'rgba(225,245,255,' + (0.5 * (1 - q)) + ')'; c.beginPath(); c.arc(sx + Math.sin(i * 5.1) * q * r * 0.5, y + r * 0.9 + q * r * 0.9, r * 0.03 + q * r * 0.05, 0, XP_TAU); c.fill(); }
  }
  c.save(); XP_path(c, id, x, y, r, t); c.clip();
  c.fillStyle = XP_COL[id] || '#888'; c.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
  if (r > 8) {
    c.lineWidth = Math.max(0.6, r * 0.03);
    if (id === 'phobos') {   // スティックニー・クレーターと溝
      c.fillStyle = 'rgba(30,22,18,0.35)'; c.beginPath(); c.arc(x - r * 0.45, y + r * 0.05, r * 0.3, 0, XP_TAU); c.fill();
      c.strokeStyle = 'rgba(30,22,18,0.3)'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x - r * 0.1, y - r * 0.5 + i * r * 0.22); c.lineTo(x + r * 0.9, y - r * 0.7 + i * r * 0.26); c.stroke(); }
      c.fillStyle = 'rgba(30,22,18,0.3)'; [[0.35, 0.3, 0.1], [0.2, -0.35, 0.08], [0.6, 0.0, 0.07]].forEach(([u, v, d]) => { c.beginPath(); c.arc(x + u * r, y + v * r, d * r, 0, XP_TAU); c.fill(); });
    } else if (id === 'ryugu') {   // 赤道の尾根と岩
      c.strokeStyle = 'rgba(160,150,140,0.35)'; c.beginPath(); c.moveTo(x - r, y); c.quadraticCurveTo(x, y + r * 0.12, x + r, y); c.stroke();
      c.fillStyle = 'rgba(170,160,150,0.35)'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(x + Math.sin(i * 2.7) * r * 0.6, y + Math.cos(i * 1.9) * r * 0.55, r * (0.04 + 0.03 * (i % 3)), 0, XP_TAU); c.fill(); }
    } else if (id === '67p') {   // 首の影と層
      c.fillStyle = 'rgba(15,15,18,0.35)'; c.beginPath(); c.ellipse(x + r * 0.1, y - r * 0.02, r * 0.16, r * 0.3, 0.3, 0, XP_TAU); c.fill();
      c.strokeStyle = 'rgba(200,200,210,0.18)'; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x - r * 0.3, y + r * 0.16, r * (0.3 + 0.12 * i), r * (0.22 + 0.1 * i), 0.25, 3.6, 5.6); c.stroke(); }
    } else if (id === 'enceladus') {   // 虎の縞（南極）
      c.strokeStyle = 'rgba(70,140,190,0.6)'; c.lineWidth = Math.max(0.8, r * 0.05);
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x - r * 0.55 + i * r * 0.1, y + r * (0.45 + i * 0.1)); c.lineTo(x + r * 0.35 + i * r * 0.08, y + r * (0.3 + i * 0.1)); c.stroke(); }
    }
  }
  XP_shade(c, x, y, r);
  c.restore();
  XP_path(c, id, x, y, r, t); c.strokeStyle = rgba('#9fe6dc', 0.55); c.lineWidth = Math.max(0.7, r * 0.02); c.stroke();
  c.restore();
}

// ---- 世界ランキング（EXPEDITION 最速タイム）----
// MISSION の自己ベスト（besttime）を、まだ送っていなければ中継へ送る。練習は besttime に残らないので送られない。
// 名前の端末キーが無い・デバッグ中・中継オフなら送らない。429（同じ回線からの連続送信）は約6秒後に1回だけ再送
export const XP_T_MIN = 5, XP_T_MAX = 1800;   // 中継の受付範囲（ranking-worker.js の XP_MIN_T / XP_MAX_T）
const XP_num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
export function xpBestTime(st, pilot, id) { return XP_num(XP_get(st, pilot, id, 'besttime')); }
export function xpSentTime(st, pilot, id) { return XP_num(XP_get(st, pilot, id, 'wsent')); }
export const XP_SCORE_MAX = 5000;   // 中継の XP_MAX_SCORE
export function xpBestScore(st, pilot, id) { try { const b = JSON.parse(XP_get(st, pilot, id, 'best')); const n = Math.round(Number(b && b.score)); return Number.isFinite(n) && n > 0 && n <= XP_SCORE_MAX ? n : null; } catch (_) { return null; } }
export function xpSentScore(st, pilot, id) { return XP_num(XP_get(st, pilot, id, 'wsentS')); }
// 送るべきタイム（無ければ null）
export function xpPendingTime(st, pilot, id) {
  const b = xpBestTime(st, pilot, id), s = xpSentTime(st, pilot, id);
  if (b == null || b < XP_T_MIN || b > XP_T_MAX) return null;
  return s == null || b < s ? b : null;
}
// 送るもの（タイムか得点のどちらかが未送信なら両方の自己ベストを1回で送る）。-> { time, score|null } | null
export function xpPending(st, pilot, id) {
  const t = xpBestTime(st, pilot, id);
  if (t == null || t < XP_T_MIN || t > XP_T_MAX) return null;
  const sc = xpBestScore(st, pilot, id), ss = xpSentScore(st, pilot, id);
  const scoreNew = sc != null && (ss == null || sc > ss);
  if (xpPendingTime(st, pilot, id) == null && !scoreNew) return null;
  return { time: t, score: sc };
}
const XP_inflight = new Set();
let XP_retryMs = 6000;
export function __xpRetryMs(v) { XP_retryMs = v; }   // テスト用
export function xpWorldSend(st, id) {
  try { if (isDebug() || !relayEnabled()) return null; } catch (_) { return null; }
  let prof = null; try { prof = getActiveProfile(st); } catch (_) { prof = null; }
  if (!prof || !prof.key || !prof.name) return null;
  const pd = xpPending(st, prof.name, id);
  const tag = prof.name + '|' + id;
  if (pd == null || XP_inflight.has(tag)) return null;
  XP_inflight.add(tag);
  const e = { name: prof.name, key: prof.key, mission: id, time: pd.time, ...(pd.score != null ? { score: pd.score } : {}) };
  const send = () => Promise.resolve(WorldNet.submitXp(e));
  return send()
    .then((r) => (r && r.ok === false && r.status === 429 ? new Promise((res) => setTimeout(res, XP_retryMs)).then(send) : r))
    .then((r) => { if (r && r.ok) { XP_set(st, prof.name, id, 'wsent', String(pd.time)); if (pd.score != null) XP_set(st, prof.name, id, 'wsentS', String(pd.score)); } return r; }, () => null)
    .finally(() => { XP_inflight.delete(tag); });
}
// タイトルに戻った時など: まだ送っていない自己ベストを1件だけ送る（以前の記録の取りこぼしもここで拾う）
export function xpWorldBackfill(st) {
  let prof = null; try { prof = getActiveProfile(st); } catch (_) { prof = null; }
  if (!prof || !prof.key) return null;
  const id = EXP_IDS.find((x) => xpPending(st, prof.name, x) != null);
  return id ? xpWorldSend(st, id) : null;
}
