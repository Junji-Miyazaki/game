// EXPEDITION（本編 v1.1）のパイロットごとの保存と、探査天体の絵。
// 保存キー（接頭辞 lander11. は Storage が付ける）: 'xp.<パイロット名を encodeURIComponent>.<id>.<k>'
//   k = unlocked('1') / seen('1' = マップで正体を見せた) / podMiss（POD を逃した回数）/ best / besttime / skipBrief（shell が使う）
// 試作ページの記録（'lander11.exp.<shellId>.*'）とは別。試作で遊んだ記録は本編に出ない。
// 全解放の隠しスイッチ: URL に ?expedition=all（保存はしない。友人の試遊用）。
// バンドルは1つのスコープなので、トップレベルの名前はすべて xp / XP_ で始める。
import { EXP_MISSIONS } from './expedition/index.js';
import { rgba } from './art.js';

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
