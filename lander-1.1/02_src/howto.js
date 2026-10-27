// HOW TO PLAY カード（操作説明＋言語/操作の向きの設定）。タイトル・MISSION HOLD・初回プレイ前の3か所で共用。
// 名前は全て HT / ht 接頭辞（バンドルは1つのスコープ）。論理座標 360x640。
// 閉じ方: 設定ボタン以外のタップ、または何かのキー。表示直後 0.35 秒と、表示前から押していた指の解除は無視（誤閉じ防止）。
import { W, H } from './core/engine.js';
import { P } from './core/palette.js';
import { i18nLang, i18nSetLang, i18nControls, i18nSetControls } from './core/i18n.js';
import { txt, rr, rgba, pill, panel, veil, drawCtlButton } from './art.js';

const HT_LOCK_MS = 350;
const htNow = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

// タッチ端末か（PC なら矢印キー、タッチならボタンの絵を主に出す）
export function htTouchDevice() {
  try { return typeof window !== 'undefined' && !!(('ontouchstart' in window) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)); } catch (_) { return false; }
}

// 説明文（ja/en）。inv: 操作の向き INVERTED。touch: タッチ端末
export function htContent(lang, inv, touch) {
  const ja = lang === 'ja';
  const tilt = ja
    ? (inv ? '左：機首が左へ（反時計回り） 右：機首が右へ（時計回り）' : '左：機首が右へ（時計回り） 右：機首が左へ（反時計回り）')
    : (inv ? 'LEFT: NOSE TILTS LEFT (COUNTER-CLOCKWISE). RIGHT: NOSE TILTS RIGHT (CLOCKWISE).' : 'LEFT: NOSE TILTS RIGHT (CLOCKWISE). RIGHT: NOSE TILTS LEFT (COUNTER-CLOCKWISE).');
  return {
    all: ja ? '操作はこれだけです' : 'THESE ARE ALL THE CONTROLS',
    tiltHead: ja ? (touch ? '左右のボタンで機体を傾ける' : '← → で機体を傾ける') : (touch ? 'LEFT / RIGHT BUTTONS TILT THE SHIP' : '← → TILT THE SHIP'),
    tilt,
    thrust: ja ? (touch ? '中央のボタンで噴射（落下をゆるめる・傾けて噴射すると横へ進む）' : '↑ / Space で噴射（落下をゆるめる・傾けて噴射すると横へ進む）')
               : (touch ? 'CENTER BUTTON = MAIN THRUST: SLOWS THE FALL. TILT, THEN THRUST TO MOVE SIDEWAYS.' : '↑ / SPACE = MAIN THRUST: SLOWS THE FALL. TILT, THEN THRUST TO MOVE SIDEWAYS.'),
    pause: ja ? '一時停止：画面上部の ‖ ボタン' + (touch ? '' : '（Esc はタイトルへ戻る）') : 'PAUSE: THE ‖ BUTTON AT THE TOP' + (touch ? '' : ' (ESC LEAVES TO THE TITLE)'),
    noWeapons: ja ? '武器はありません。隕石はよけてください' : 'THERE ARE NO WEAPONS. DODGE THE METEORS.',
    goal: ja ? 'パッドにゆっくり・まっすぐ着地（速さと傾きの上限はHUDに表示）' : 'LAND SLOWLY AND UPRIGHT ON THE PAD. SPEED AND TILT LIMITS ARE SHOWN ON THE HUD.',
    flat: ja ? 'パッド以外の平地は得点なしで接地できる。噴射で離陸' : 'FLAT GROUND ELSEWHERE: TOUCH DOWN WITHOUT SCORE, THRUST TO LIFT OFF.',
    rings: ja ? '輪は任意：連続で取るとコンボ。金の輪は短時間の特典（スロー・レーダー・横移動・燃料）' : 'RINGS ARE OPTIONAL: CHAIN THEM FOR COMBO POINTS. GOLD RINGS GIVE A SHORT POWER-UP (SLOW-MO, RADAR, SIDE THRUST, FUEL).',
    other: ja ? (touch ? 'PC：← → ↑ / Space' : 'タッチ：画面下の3つのボタン') : (touch ? 'PC: ← → ↑ / SPACE' : 'TOUCH: THE 3 BUTTONS AT THE BOTTOM'),
    close: ja ? 'タップかキーで閉じる' : 'TAP OR PRESS ANY KEY TO CLOSE',
    langL: 'LANGUAGE', ctlL: 'CONTROLS',
  };
}

// 折り返し（日本語は1字ずつ、英語は単語単位）
export function htWrap(ctx, s, size, wt, sp, maxW) {
  const toks = String(s).match(/[A-Za-z0-9'’.,:;!?\/()+\-·%&=<>←-↓]+ ?| +|[^\sA-Za-z0-9]/gu) || [];
  const lines = []; let cur = '';
  const w = (t) => { ctx.save(); ctx.font = ((wt || 400) + ' ' + size + 'px sans-serif'); const m = ctx.measureText(t).width; ctx.restore(); return (m >= 0 ? m : t.length * size * 0.6) + sp * Math.max(0, Array.from(t).length - 1); };
  for (const t of toks) {
    if (cur && w(cur + t) > maxW) { lines.push(cur.trimEnd()); cur = t.trimStart(); } else cur += t;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}

export class HtCard {
  // opts: { onClose, onTap(音), touch(省略で自動判定), storage(未使用: i18n は束縛済み) }
  constructor(opts) {
    opts = opts || {};
    this.onClose = opts.onClose || null; this.onTap = opts.onTap || null;
    this.touch = opts.touch === undefined ? htTouchDevice() : !!opts.touch;
    this.openedAt = htNow();
    this.closed = false;
  }
  // 設定ボタン（当たり判定は高さ 44px 以上）
  rects() {
    return {
      ja: { x: 200, y: 484, w: 60, h: 44 }, en: { x: 264, y: 484, w: 60, h: 44 },
      std: { x: 160, y: 532, w: 80, h: 44 }, inv: { x: 244, y: 532, w: 80, h: 44 },
    };
  }
  _hit(r, d) { return d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h; }
  close() { if (this.closed) return; this.closed = true; if (this.onClose) this.onClose(); }
  // 入力は常に消費する（下の画面に貫通させない）
  input(action, data) {
    if (this.closed) return true;
    if (data && data.repeat) return true;
    if (action === 'tap' && data) {
      if (data.t0 !== undefined && data.t0 < this.openedAt) return true;   // 表示前から押していた指の解除
      const R = this.rects();
      if (this._hit(R.ja, data)) { i18nSetLang('ja'); if (this.onTap) this.onTap(); return true; }
      if (this._hit(R.en, data)) { i18nSetLang('en'); if (this.onTap) this.onTap(); return true; }
      if (this._hit(R.std, data)) { i18nSetControls('standard'); if (this.onTap) this.onTap(); return true; }
      if (this._hit(R.inv, data)) { i18nSetControls('inverted'); if (this.onTap) this.onTap(); return true; }
    }
    if (htNow() - this.openedAt < HT_LOCK_MS) return true;
    if (this.onTap) this.onTap();
    this.close();
    return true;
  }
  render(ctx) {
    const p = P(), lang = i18nLang(), ja = lang === 'ja', inv = i18nControls() === 'inverted';
    const c = htContent(lang, inv, this.touch);
    const R = this.rects();
    veil(ctx, 0.78);
    panel(ctx, 14, 24, W - 28, 586, { a: 0.94, border: p.mid, ba: 0.26 });
    txt(ctx, 'HOW TO PLAY', W / 2, 38, 16, p.hi, 'center', { sp: 6, w: 300 });
    txt(ctx, c.all, W / 2, 66, ja ? 13 : 10, p.warn, 'center', { sp: ja ? 1 : 2, w: 600 });
    // 操作の絵: タッチ=下のボタンと同じ3つ / PC=キーキャップ
    if (this.touch) {
      for (let i = 0; i < 3; i++) drawCtlButton(ctx, i, 36 + i * 94, 90, 84, 46, false, 0, 0, inv);
    } else {
      const cap = (x, w, label) => { rr(ctx, x, 94, w, 38, 8); ctx.fillStyle = rgba(p.fg, 0.07); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = rgba(p.fg, 0.4); ctx.stroke(); txt(ctx, label, x + w / 2, 105, 14, p.hi, 'center', { w: 500 }); };
      cap(36, 52, '←'); cap(94, 52, '→'); cap(152, 52, '↑'); cap(210, 114, 'SPACE');
    }
    const fs = ja ? 11 : 9, lh = ja ? 16 : 14, sp = ja ? 0.4 : 1, left = 30, mw = W - 60;
    let y = 148;
    const para = (s, color, a, size) => {
      const f = size || fs;
      const ls = htWrap(ctx, s, f, 400, sp, mw);
      for (const l of ls) { txt(ctx, l, left, y, f, color, 'left', { sp, w: 400, a }); y += lh; }
      y += 6;
    };
    para(c.tiltHead, p.hi, 1);
    para(c.tilt, p.mid, 0.9, ja ? 10 : 8);
    para(c.thrust, p.fg, 0.95);
    para(c.pause, p.fg, 0.8);
    y += 2;
    para(c.noWeapons, p.warn, 1);
    para(c.goal, p.fg, 0.95);
    para(c.flat, p.fg, 0.85);
    para(c.rings, p.fg, 0.8);
    txt(ctx, c.other, W / 2, y + 2, ja ? 9 : 7, p.dim, 'center', { sp: ja ? 0.5 : 1.5, w: 400 });
    // 設定: LANGUAGE [JA|EN] / CONTROLS [STANDARD|INVERTED]
    const btn = (r, label, on) => { pill(ctx, r.x, r.y + 6, r.w, 32, on ? rgba(p.mid, 0.18) : rgba(p.fg, 0.03), on ? rgba(p.hi, 0.8) : rgba(p.fg, 0.22), on ? 1.4 : 1); txt(ctx, label, r.x + r.w / 2, r.y + 17, 9, on ? p.hi : p.mid, 'center', { sp: 2, w: 500 }); };
    txt(ctx, c.langL, 30, R.ja.y + 17, 8, p.dim, 'left', { sp: 3, w: 500 });
    txt(ctx, c.ctlL, 30, R.std.y + 17, 8, p.dim, 'left', { sp: 3, w: 500 });
    btn(R.ja, 'JA', lang === 'ja'); btn(R.en, 'EN', lang === 'en');
    btn(R.std, 'STANDARD', !inv); btn(R.inv, 'INVERTED', inv);
    txt(ctx, c.close, W / 2, 590, ja ? 9 : 7, p.dim, 'center', { sp: ja ? 0.6 : 3, w: 500, a: 0.7 });
  }
}
