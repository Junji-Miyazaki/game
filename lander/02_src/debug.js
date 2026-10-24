// 隠しデバッグモード（セッション限り・localStorage には保存しない）。
// 有効化: URL に ?debug、またはタイトルのロゴを2秒以内に5回タップ。
let dbgOn = false;
let dbgTaps = [];
const DBG_TAPS_NEEDED = 5;
const DBG_WINDOW_MS = 2000;

function dbgQuery() {
  try { return typeof location !== 'undefined' && /[?&]debug(=|&|$)/.test(String(location.search || '')); } catch (_) { return false; }
}
export function isDebug() { return dbgOn || dbgQuery(); }
export function setDebug(v) { dbgOn = !!v; dbgTaps = []; }
// ロゴタップを1回記録。5回に達したら有効化して true
export function debugLogoTap(nowMs) {
  const now = (typeof nowMs === 'number') ? nowMs : Date.now();
  dbgTaps.push(now);
  dbgTaps = dbgTaps.filter((t) => now - t <= DBG_WINDOW_MS);
  if (dbgTaps.length >= DBG_TAPS_NEEDED) { dbgOn = true; dbgTaps = []; return true; }
  return false;
}
