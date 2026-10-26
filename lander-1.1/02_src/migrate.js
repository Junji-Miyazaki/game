// v1.0 → v1.1 のパイロット引き継ぎ。v1.0 の保存領域（'lander.'）は読むだけで、書き込み・削除は一切しない。
// 引き継ぐのは「パイロットの身元」だけ：プロフィール（名前＋所有キー）・選択中の名前・チャンピオン称号のキャッシュ・ミュート。
// 進行(progress)・チェックポイント・ステージ開始・ローカルランキング・stageBest・ハイスコアは、ルールが違うので引き継がない。
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';
import { txt, pill, rgba } from './art.js';
import { STORAGE_PREFIX, LEGACY_PREFIX, APP_LABEL } from './version.js';

export const IMPORT_KEYS = ['profiles', 'activeProfile', 'lastName', 'worldTop1', 'muted'];   // 'lander.'+key → 'lander11.'+key
export const MIGRATION_KEY = 'migration';   // 'lander11.migration' = 'imported' | 'fresh' | 'none'（一度だけ尋ねる印）

const rawGet = (raw, k) => { try { return raw.getItem(k); } catch (_) { return null; } };
const rawKeys = (raw) => { const out = []; try { for (let i = 0; i < raw.length; i++) { const k = raw.key(i); if (k != null) out.push(k); } } catch (_) { /* ignore */ } return out; };

// v1.0 のパイロット名の一覧（壊れていれば空）。プロフィールが無く lastName だけの端末も 1 名として扱う
export function legacyPilotNames(raw) {
  const names = [];
  try {
    const arr = JSON.parse(rawGet(raw, LEGACY_PREFIX + 'profiles') || '[]');
    if (Array.isArray(arr)) for (const p of arr) if (p && typeof p.name === 'string' && p.name.trim() && typeof p.key === 'string') names.push(p.name.trim());
  } catch (_) { /* ignore */ }
  if (!names.length) { const ln = String(rawGet(raw, LEGACY_PREFIX + 'lastName') || '').trim(); if (ln) names.push(ln); }
  return names;
}
// v1.1 側に既にデータがあるか（'lander11.' で始まるキーが 1 つでもあるか）
export function hasOwnData(raw) { return rawKeys(raw).some((k) => k.startsWith(STORAGE_PREFIX)); }
// 起動時に 1 度だけ呼ぶ（BootScene が seenVersion を書く前）。-> 'ask' | 'skip'
//   v1.1 のデータが既にある／既に尋ねた → 'skip'。初回で v1.0 パイロットが無い → 印だけ付けて 'skip'（後から v1.0 を遊んでも再度は尋ねない）
export function migrationPlan(raw) {
  try {
    if (rawGet(raw, STORAGE_PREFIX + MIGRATION_KEY) != null) return 'skip';
    if (hasOwnData(raw)) return 'skip';
    if (legacyPilotNames(raw).length) return 'ask';
    raw.setItem(STORAGE_PREFIX + MIGRATION_KEY, 'none');
  } catch (_) { /* ignore */ }
  return 'skip';
}
// 'imported' | 'fresh' を記録する。import のときは IMPORT_KEYS だけコピー。-> コピーしたキー名の配列
export function applyMigration(raw, choice) {
  const copied = [];
  try {
    if (choice === 'imported') {
      for (const k of IMPORT_KEYS) {
        const v = rawGet(raw, LEGACY_PREFIX + k);
        if (v != null && v !== '') { raw.setItem(STORAGE_PREFIX + k, v); copied.push(k); }
      }
    }
    raw.setItem(STORAGE_PREFIX + MIGRATION_KEY, choice === 'imported' ? 'imported' : 'fresh');
  } catch (_) { /* 保存できなくても続行 */ }
  return copied;
}

// ---- 選択画面（TAP TO BEGIN の後・タイトルの前）----
export class MigrateScene extends Scene {
  constructor(engine, next, raw, names) {
    super(engine);
    this.next = next; this.raw = raw; this.names = names || [];
    this.isRoot = true; this.t = 0; this.done = false; this.sel = 0;
    this.btnImport = { x: 40, y: 340, w: W - 80, h: 48 };
    this.btnFresh = { x: 40, y: 400, w: W - 80, h: 48 };
  }
  choose(choice) {
    if (this.done) return;
    this.done = true;
    applyMigration(this.raw, choice);
    if (typeof this.next === 'function') this.next();
  }
  _hit(b, d) { return d.x >= b.x && d.x <= b.x + b.w && d.y >= b.y && d.y <= b.y + b.h; }
  onInput(action, data) {
    if (this.done || (data && data.repeat)) return;
    if (action === 'up' || action === 'down') { this.sel = this.sel ? 0 : 1; return; }
    if (action === 'confirm') { this.choose(this.sel === 0 ? 'imported' : 'fresh'); return; }
    if (action === 'tap' && data) {
      if (this._hit(this.btnImport, data)) this.choose('imported');
      else if (this._hit(this.btnFresh, data)) this.choose('fresh');   // それ以外のタップでは何も決めない
    }
  }
  update(dt) { this.t += (dt > 0 ? dt : 0.016); }
  render(ctx) {
    const p = P();
    ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    txt(ctx, 'LANDER', W / 2, 96, 22, p.hi, 'center', { sp: 12, w: 300, a: 0.85 });
    txt(ctx, APP_LABEL, W / 2, 130, 9, p.mid, 'center', { sp: 5, w: 500 });
    txt(ctx, 'v1.0 PILOTS FOUND', W / 2, 190, 11, p.fg, 'center', { sp: 5, w: 500 });
    const shown = this.names.slice(0, 3);
    shown.forEach((n, i) => txt(ctx, Array.from(n).slice(0, 12).join(''), W / 2, 220 + i * 22, 13, p.hi, 'center', { sp: 3, w: 500 }));
    txt(ctx, 'COPIES NAMES, KEYS & SETTINGS ONLY.', W / 2, 296, 7, p.dim, 'center', { sp: 2, w: 400 });
    txt(ctx, 'PROGRESS AND RANKINGS ARE NOT COPIED.', W / 2, 310, 7, p.dim, 'center', { sp: 2, w: 400 });
    const bs = [[this.btnImport, 'IMPORT v1.0 PILOTS'], [this.btnFresh, 'START FRESH']];
    bs.forEach(([b, lab], i) => {
      const on = this.sel === i;
      pill(ctx, b.x, b.y, b.w, b.h, rgba(p.mid, on ? 0.10 : 0.03), rgba(on ? p.mid : p.fg, on ? 0.6 : 0.22), on ? 1.2 : 1);
      txt(ctx, lab, W / 2, b.y + b.h / 2 - 6, 11, on ? p.hi : p.fg, 'center', { sp: 4, w: 500 });
    });
    txt(ctx, 'ASKED ONLY ONCE. v1.0 DATA IS NEVER CHANGED.', W / 2, 474, 7, p.dim, 'center', { sp: 2, w: 400 });
  }
}
