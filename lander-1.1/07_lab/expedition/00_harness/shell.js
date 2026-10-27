// EXPEDITION 共通ミッションシェル（07_lab / v1.2 R&D）。#1 で承認済みの枠組みを抜き出したもの。
// メニュー（PRACTICE / MISSION）・3 ライフ（×1.0/0.8/0.6）・タイムトライアル（max(0,1500−10×秒)）・
// ★の和集合 + 最高スコア + ベストタイム（localStorage 'lander11.exp.<id>.*'）・結果 / 失敗画面・HUD 右上・足元の傾斜マーカー。
// ミッション固有の状態は lab.m に置く。シェルが読む lab.m のフィールド:
//   m.menu / m.result('win'|'lose') / m.resultT / m.lifeLost / m.failed / m.final / m.reason / m.detail
// 使い方: const sh = createShell({ id, expLabel:'EXPEDITION 02', title, options:[{key,label,btn,param}] });
import { txt, rgba, rr } from '../../../02_src/art.js?v=86285db95f';
import { P } from '../../../02_src/core/palette.js?v=a36de9d9c3';
import { W, C, footSlopeDeg } from './harness.js?v=ff32a905ee';

export const LIVES0 = 3;
export const LIFE_MULT = { 3: 1.0, 2: 0.8, 1: 0.6 };
export const lifeMult = (lives) => LIFE_MULT[lives] || 0.6;
export const TIME_BONUS_MAX = 1500, TIME_BONUS_RATE = 10;   // 時間ボーナス = max(0, 1500 − 10×秒)
export const timeBonus = (sec) => Math.max(0, Math.round(TIME_BONUS_MAX - TIME_BONUS_RATE * sec));
export const LIFE_LOST_S = 1.6;
export const HINT_Y = 84;   // ヒント行（右上のタイマー / チェック / PRACTICE・ライフ行の下。重ならない高さ）
export const mmss = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); };

export function star(ctx, cx, cy, r, on) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.42 : r; ctx.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fillStyle = on ? '#FFC94D' : 'rgba(255,255,255,0.1)'; ctx.fill(); ctx.strokeStyle = on ? '#FFE9A8' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
}
export function button(ctx, b, oy, label, col, hot, fs = 14, on = null) {
  rr(ctx, b.x, b.y + oy, b.w, b.h, 20); ctx.fillStyle = '#0D111B'; ctx.fill(); ctx.fillStyle = rgba(col, 0.16 + 0.06 * hot + (on ? 0.14 : 0)); ctx.fill(); ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 1.4; ctx.stroke();
  txt(ctx, label, b.x + b.w / 2, b.y + oy + b.h / 2 - fs * 0.45, fs, col, 'center', { w: 800, sp: 1.6 });
}
export const hit = (b, x, y, oy = 0) => x >= b.x && x <= b.x + b.w && y >= b.y + oy && y <= b.y + oy + b.h;

// 足元の傾斜マーカー（機体の真下の地面）: 青緑 ≤5° / 琥珀 ≤10° / 赤 >10°（STEEP GROUND）。高度 130px 以内で表示
export function drawLandability(ctx, l, terrain) {
  const s = l.ship, p = P(); if (!s || l.hideShip || l.state === 'crashed' || (l.m && (l.m.menu || l.m.docked || l.m.waiting))) return;
  const alt = l.terrainY(s.x) - (s.y + C.LEG_Y), a = Math.max(0, Math.min(1, (130 - alt) / 90)) * 0.85; if (a <= 0.02) return;
  ctx.save(); ctx.lineWidth = 3; ctx.lineCap = 'butt';
  for (let x = Math.max(0, Math.floor((s.x - 42) / 6) * 6); x < Math.min(W, s.x + 42); x += 6) {
    const sl = footSlopeDeg(terrain, x + 3), col = sl <= 5 ? '#63D8C9' : sl <= C.LAND_SLOPE_DEG ? p.warn : p.bad;
    ctx.globalAlpha = a * (1 - Math.min(1, Math.abs(x + 3 - s.x) / 48) * 0.7); ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(x, l.terrainY(x) + 1.5); ctx.lineTo(x + 6.2, l.terrainY(x + 6) + 1.5); ctx.stroke();
  }
  ctx.restore();
}

export function createShell(cfg) {
  const id = cfg.id, options = cfg.options || [];
  const KEY_B = 'lander11.exp.' + id + '.best', KEY_T = 'lander11.exp.' + id + '.besttime';
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 保存できなくても続行 */ } };
  const qp = new URLSearchParams(location.search);
  const sess = { mode: qp.get('mode') === 'practice' || qp.get('mode') === 'mission' ? qp.get('mode') : 'menu', lives: LIVES0 };
  for (const o of options) sess[o.key] = qp.get(o.param) === '1';
  const loadBest = () => { try { const b = JSON.parse(lsGet(KEY_B)); if (b && Array.isArray(b.stars)) return { score: +b.score || 0, stars: [!!b.stars[0], !!b.stars[1], !!b.stars[2]] }; } catch (e) { /* 無効 */ } return { score: 0, stars: [false, false, false] }; };
  const loadBestTime = () => { const v = parseFloat(lsGet(KEY_T)); return Number.isFinite(v) && v > 0 ? v : null; };
  // ボタン配置（論理座標 360x640）。高さはすべて 44 以上
  const BTN = {
    practice: { x: 40, y: 284, w: 280, h: 52 }, mission: { x: 40, y: 436, w: 280, h: 52 },
    res1: { x: 24, y: 0, w: 152, h: 48 }, res2: { x: 184, y: 0, w: 152, h: 48 },
  };
  options.forEach((o, i) => { BTN[o.btn] = { x: i ? 182 : 24, y: 366, w: 154, h: 44 }; });
  const btnY = (m) => (m.result === 'win' ? 478 : 330);

  const sh = { id, sess, BTN, KEY_B, KEY_T, loadBest, loadBestTime, lsGet, lsSet, lifeMult, timeBonus, LIFE_LOST_S, HINT_Y, mmss, star, button, hit };
  sh.score = (base, lives, sec = 1e9) => Math.round((base + timeBonus(sec)) * lifeMult(lives));

  // ---- セッション ----
  sh.onStart = (prev) => { if (sess.mode === 'mission' && prev && (prev.result === 'win' || prev.failed)) sess.lives = LIVES0; };   // R で結果画面から再開 = 新しい3ライフ
  sh.begin = (lab, mode, opt = {}) => { sess.mode = mode; if (mode === 'mission') sess.lives = LIVES0; for (const o of options) if (opt[o.key] != null) sess[o.key] = !!opt[o.key]; lab.reset(); };
  sh.onLoss = (m) => {   // 失敗: ミッションならライフ -1（0 で MISSION FAILED）
    if (sess.mode === 'mission') { sess.lives = Math.max(0, sess.lives - 1); m.livesLeft = sess.lives; if (sess.lives > 0) m.lifeLost = true; else m.failed = true; }
  };
  // 勝利の確定。f = { t, base, fuel, ...固有 } に lives/mult/tbonus/score と保存結果（newStars/newBest/best/newBestTime/bestTime）を足す。練習は保存しない
  sh.complete = (f, got) => {
    f.practice = sess.mode === 'practice'; f.lives = sess.lives; f.mult = lifeMult(sess.lives); f.tbonus = timeBonus(f.t); f.score = sh.score(f.base, sess.lives, f.t);
    const prev = loadBest(), pt = loadBestTime();
    if (f.practice) { f.newStars = [false, false, false]; f.newBest = false; f.newBestTime = false; f.best = prev; f.bestTime = pt; return f; }
    f.newBestTime = pt == null || f.t < pt; f.bestTime = f.newBestTime ? f.t : pt; if (f.newBestTime) lsSet(KEY_T, String(f.t));
    f.newStars = got.map((g, i) => g && !prev.stars[i]); f.newBest = f.score > prev.score;
    f.best = { score: Math.max(prev.score, f.score), stars: got.map((g, i) => g || prev.stars[i]) };
    lsSet(KEY_B, JSON.stringify(f.best));
    return f;
  };
  // メニュー / 結果画面のタップ。処理したら true
  sh.tap = (l, x, y) => {
    const m = l.m;
    if (m.menu) {
      if (hit(BTN.practice, x, y)) sh.begin(l, 'practice');
      else if (hit(BTN.mission, x, y)) sh.begin(l, 'mission');
      else for (const o of options) if (hit(BTN[o.btn], x, y)) sess[o.key] = !sess[o.key];
      return true;
    }
    if (!m.result || m.resultT < 0.4 || m.lifeLost) return false;
    const oy = btnY(m);
    if (hit(BTN.res1, x, y, oy)) sh.begin(l, sess.mode);        // RETRY / RETRY MISSION
    else if (hit(BTN.res2, x, y, oy)) sh.begin(l, 'menu');      // MENU
    return true;
  };
  // R: ミッション中（開始後）に押すとライフを1つ失う（無料リトライの抜け道を作らない）。それ以外は harness の即リセット
  // 注意: リスナーは createLab（harness の R = 即リセット）より前に登録する。ブラウザによっては window 上の同一ターゲットで登録順に発火するため
  let rHook = null;
  window.addEventListener('keydown', (e) => {
    if (!rHook || (e.key !== 'r' && e.key !== 'R') || e.metaKey || e.ctrlKey) return;
    const lab = rHook.lab;
    if (sess.mode === 'mission' && lab.m && rHook.started(lab.m) && !lab.m.result) { e.stopImmediatePropagation(); e.preventDefault(); rHook.lose(lab, 'RESTARTED', 'R pressed: life lost'); }
  }, true);
  sh.hookR = (lab, started, lose) => { rHook = { lab, started, lose }; };
  sh.addResetButton = () => { const box = document.getElementById('dbg'); if (box) { const b = document.createElement('button'); b.textContent = 'RESET RECORD'; b.style.cssText = 'margin-top:8px;font:9px monospace;opacity:.6;padding:2px 6px'; b.onclick = () => { lsSet(KEY_B, ''); lsSet(KEY_T, ''); }; box.appendChild(b); } };

  // ---- 描画 ----
  // HUD 右上: タイマー(y38) / チェック行(y54) / PRACTICE タグ or ライフ(y72〜)。ヒントは HINT_Y（下）に出す
  sh.drawCorner = (ctx, l, o) => {
    const p = P();
    if (o.time != null) txt(ctx, mmss(o.time), W - 12, 36, 13, p.fg, 'right', { w: 700 });
    if (o.check) txt(ctx, o.check, W - 12, 54, 7.5, o.checkOk ? p.green : p.dim, 'right', { w: 700, sp: 1 });
    if (sess.mode === 'practice') txt(ctx, 'PRACTICE', W - 12, 72, 7, p.mid, 'right', { w: 700, sp: 1.4 });
    else for (let i = 0; i < LIVES0; i++) {   // ライフ: 小さな機体アイコン（右から）
      const cx = W - 18 - i * 14, cy = 76, on = i < sess.lives;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy - 1, 4, Math.PI, 0); ctx.lineTo(cx + 4, cy + 3); ctx.lineTo(cx - 4, cy + 3); ctx.closePath();
      ctx.fillStyle = on ? p.green : 'rgba(255,255,255,0.1)'; ctx.fill(); ctx.strokeStyle = on ? p.fg : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore();
    }
  };
  sh.drawHint = (ctx, text, bad) => { if (text) txt(ctx, text, 180, HINT_Y, 7.5, bad ? P().bad : P().fg, 'center', { w: 600, sp: 0.4, a: 0.95 }); };

  sh.drawMenu = (ctx, l) => {
    const p = P(), best = loadBest(), hot = Math.floor(l.clock * 2) % 2;
    ctx.fillStyle = 'rgba(4,6,12,0.55)'; ctx.fillRect(0, 180, W, 340);
    txt(ctx, cfg.expLabel, 180, 192, 7, p.dim, 'center', { w: 600, sp: 2 });
    txt(ctx, cfg.title, 180, 206, 13, p.fg, 'center', { w: 800, sp: 1.2 });
    const nst = best.stars.filter(Boolean).length, bt = loadBestTime();
    txt(ctx, 'BEST SCORE ' + (best.score || '-') + '   ·   ★ ' + nst + ' / 3', 180, 225, 9, nst ? '#FFC94D' : p.dim, 'center', { w: 700, sp: 0.8 });
    txt(ctx, 'BEST TIME ' + (bt == null ? '-' : mmss(bt)), 180, 240, 9, bt == null ? p.dim : '#FFC94D', 'center', { w: 700, sp: 0.8 });
    for (let i = 0; i < 3; i++) star(ctx, 150 + i * 30, 266, 8, best.stars[i]);
    button(ctx, BTN.practice, 0, 'PRACTICE', p.mid, hot, 16);
    txt(ctx, 'UNLIMITED RETRIES · NO STARS', 180, 344, 7.5, p.dim, 'center', { w: 600, sp: 0.8 });
    for (const o of options) {
      const b = BTN[o.btn], on = sess[o.key];
      rr(ctx, b.x, b.y, b.w, b.h, 12); ctx.fillStyle = rgba(p.fg, on ? 0.12 : 0.04); ctx.fill(); ctx.strokeStyle = rgba(p.fg, 0.4); ctx.lineWidth = 1; ctx.stroke();
      rr(ctx, b.x + 10, b.y + 15, 14, 14, 3); ctx.strokeStyle = on ? p.green : rgba(p.fg, 0.5); ctx.stroke();
      if (on) { ctx.beginPath(); ctx.moveTo(b.x + 13, b.y + 22); ctx.lineTo(b.x + 16.5, b.y + 26); ctx.lineTo(b.x + 22, b.y + 18); ctx.lineWidth = 2; ctx.strokeStyle = p.green; ctx.stroke(); }
      txt(ctx, o.label, b.x + 32, b.y + 18, 8, on ? p.fg : p.dim, 'left', { w: 700, sp: 0.6 });
    }
    if (options.length) txt(ctx, '(PRACTICE ONLY)', 180, 418, 6.5, p.dim, 'center', { w: 500, sp: 0.8 });
    button(ctx, BTN.mission, 0, 'MISSION', p.warn, hot, 16);
    txt(ctx, '3 LIVES · STARS & SCORE', 180, 496, 7.5, p.dim, 'center', { w: 600, sp: 0.8 });
  };

  // 結果 / 失敗。r = { winTitle?, rows:[[on,label,value]]（★3行）, failNote: string|null, failTime: 秒 }
  sh.drawResult = (ctx, l, r) => {
    const p = P(), m = l.m, win = m.result === 'win';
    if (!m.result || m.resultT <= (win ? 0.7 : 0.5)) return;
    const k = Math.min(1, (m.resultT - (win ? 0.7 : 0.5)) / 0.3);
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(4,6,12,0.72)'; ctx.fillRect(0, 0, W, 560);
    const x = 30, y = 100, w = 300, h = win ? 360 : (m.lifeLost ? 150 : 190), RY = btnY(m), prac = sess.mode === 'practice';
    ctx.fillStyle = 'rgba(13,17,27,0.96)'; rr(ctx, x, y, w, h, 16); ctx.fill(); ctx.strokeStyle = rgba(win ? p.green : p.bad, 0.7); ctx.lineWidth = 1.4; ctx.stroke();
    if (win) {
      const f = m.final;
      txt(ctx, prac ? 'PRACTICE CLEAR' : 'MISSION COMPLETE', 180, y + 18, 13, p.green, 'center', { w: 800, sp: 1.4 });
      txt(ctx, cfg.title, 180, y + 40, 8, p.dim, 'center', { w: 600, sp: 1.5 });
      r.rows.forEach((row, i) => {
        const ry = y + 72 + i * 50, pop = Math.min(1, Math.max(0, (m.resultT - 0.9 - i * 0.3) / 0.2));
        ctx.save(); ctx.translate(x + 38, ry + 14); ctx.scale(0.4 + 0.6 * pop, 0.4 + 0.6 * pop); ctx.globalAlpha = k * pop; star(ctx, 0, 0, 14, row[0]); ctx.restore();
        txt(ctx, row[1], x + 66, ry + 3, 9, row[0] ? p.fg : p.dim, 'left', { w: 700, sp: 0.6 });
        txt(ctx, row[2], x + 66, ry + 18, 11, row[0] ? p.warn : p.dim, 'left', { w: 700 });
        if (f.newStars[i]) txt(ctx, 'NEW', x + w - 18, ry + 10, 9, '#FFC94D', 'right', { w: 800, sp: 1.2, a: 0.6 + 0.4 * Math.sin(l.clock * 8) });
      });
      if (prac) {
        txt(ctx, 'NO SCORE · NO STARS IN PRACTICE', 180, y + 232, 9, p.warn, 'center', { w: 700, sp: 0.8 });
        txt(ctx, 'TIME ' + mmss(f.t) + '   ·   FUEL ' + f.fuel.toFixed(0) + '%', 180, y + 262, 8, p.dim, 'center', { w: 600, sp: 0.8 });
      } else {
        txt(ctx, 'SCORE ' + f.score, 180, y + 214, 16, '#FFC94D', 'center', { w: 800, sp: 1 });
        txt(ctx, f.lives + ' LIVES LEFT · ×' + f.mult.toFixed(1), 180, y + 238, 9, p.warn, 'center', { w: 700, sp: 0.8 });
        txt(ctx, 'TIME ' + mmss(f.t) + '   ·   TIME BONUS +' + f.tbonus, 180, y + 258, 9, p.fg, 'center', { w: 700, sp: 0.8 });
        if (f.newBestTime) txt(ctx, 'NEW BEST TIME', 180, y + 276, 11, '#FFC94D', 'center', { w: 800, sp: 1.4, a: 0.65 + 0.35 * Math.sin(l.clock * 8) });
        else txt(ctx, 'BEST TIME ' + mmss(f.bestTime), 180, y + 276, 8, p.dim, 'center', { w: 700, sp: 0.8 });
        txt(ctx, 'BEST SCORE ' + f.best.score + (f.newBest ? '  NEW' : '') + '   ·   ★ ' + f.best.stars.filter(Boolean).length + ' / 3', 180, y + 296, 8, f.newBest ? '#FFC94D' : p.dim, 'center', { w: 700, sp: 0.8 });
        txt(ctx, 'FUEL ' + f.fuel.toFixed(0) + '%', 180, y + 314, 8, p.dim, 'center', { w: 600, sp: 0.8 });
      }
    } else if (m.lifeLost) {
      txt(ctx, 'LIFE LOST', 180, y + 24, 15, p.warn, 'center', { w: 800, sp: 1.8 });
      txt(ctx, m.reason || '', 180, y + 62, 11, p.fg, 'center', { w: 700, sp: 1 });
      txt(ctx, m.livesLeft + (m.livesLeft === 1 ? ' LIFE' : ' LIVES') + ' LEFT · RESTARTING', 180, y + 100, 9, p.dim, 'center', { w: 600, sp: 0.8 });
    } else {
      txt(ctx, prac ? 'FAILED' : 'MISSION FAILED', 180, y + 22, 15, p.bad, 'center', { w: 800, sp: 1.8 });
      txt(ctx, m.reason || '', 180, y + 62, 12, p.fg, 'center', { w: 700, sp: 1 });
      txt(ctx, m.detail || '', 180, y + 86, 9, p.warn, 'center', { w: 600, sp: 0.6 });
      txt(ctx, r.failNote || '', 180, y + 118, 8, p.dim, 'center', { w: 600, sp: 0.6 });
      txt(ctx, 'TIME ' + mmss(r.failTime || 0), 180, y + 142, 8, p.dim, 'center', { w: 600, sp: 0.8 });
    }
    if (!m.lifeLost) {
      const hot = Math.floor(l.clock * 2) % 2;
      button(ctx, BTN.res1, RY, prac ? 'RETRY' : 'RETRY MISSION', p.mid, hot, prac ? 14 : 11);
      button(ctx, BTN.res2, RY, 'MENU', p.fg, 0, 13);
      txt(ctx, 'R = retry', 180, RY + 62, 7, p.dim, 'center', { w: 500, sp: 0.8 });
    }
    ctx.restore();
  };
  return sh;
}
