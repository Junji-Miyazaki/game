// ハイスコア等のローカル保存。localStorageの薄いラッパ。
// localStorage はブロック(SecurityError)・容量超過で例外を投げうるため、全メソッドが決して投げない。
import { STORAGE_PREFIX } from '../version.js';
const PREFIX = STORAGE_PREFIX;   // 'lander11.'（v1.0 は 'lander.'。同一オリジンなので混ざらないよう分離）

export const Storage = {
  getHigh(gameId) {
    try {
      const v = localStorage.getItem(PREFIX + 'high.' + gameId);
      const n = v ? parseInt(v, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch (_) { return 0; }
  },
  // 新記録なら保存してtrueを返す（保存失敗・非新記録は false）
  setHigh(gameId, score) {
    try {
      const cur = this.getHigh(gameId);
      if (score > cur) {
        localStorage.setItem(PREFIX + 'high.' + gameId, String(score));
        return true;
      }
    } catch (_) { /* ignore */ }
    return false;
  },
  get(key, def = null) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? def : v;
    } catch (_) { return def; }
  },
  set(key, val) {
    try {
      localStorage.setItem(PREFIX + key, String(val));
      return true;
    } catch (_) { return false; }
  },
};
