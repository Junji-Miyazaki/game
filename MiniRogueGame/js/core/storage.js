// ハイスコア等のローカル保存。localStorageの薄いラッパ。
const PREFIX = 'microarcade.';

export const Storage = {
  getHigh(gameId) {
    const v = localStorage.getItem(PREFIX + 'high.' + gameId);
    return v ? parseInt(v, 10) : 0;
  },
  // 新記録なら保存してtrueを返す
  setHigh(gameId, score) {
    const cur = this.getHigh(gameId);
    if (score > cur) {
      localStorage.setItem(PREFIX + 'high.' + gameId, String(score));
      return true;
    }
    return false;
  },
  get(key, def = null) {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? def : v;
  },
  set(key, val) {
    localStorage.setItem(PREFIX + key, String(val));
  },
};
