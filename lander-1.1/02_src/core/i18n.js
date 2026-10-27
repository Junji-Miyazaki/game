// 説明文の言語（JA/EN）と操作の向き（STANDARD/INVERTED）の設定。保存キー 'lang' / 'controls'（接頭辞 lander11.）。
// 言語は説明文だけに効く（STAGE・START・RANKING などのデザイン上のラベルは常に英語）。
// 既定: 'lang' が無ければ navigator.language が ja* なら JA、それ以外は EN。
// art.js など描画層は engine を持たないため、i18nBind(storage) で束ねた保存先を読む（未束縛なら Storage）。
import { Storage } from './storage.js';

let I18N_ST = Storage;
export function i18nBind(storage) { I18N_ST = storage || Storage; }
function i18nRead(key) { try { return I18N_ST.get(key, null); } catch (_) { return null; } }
export function i18nDetect() {
  try {
    const n = (typeof navigator !== 'undefined' && navigator && (navigator.language || (navigator.languages && navigator.languages[0]))) || '';
    return /^ja/i.test(String(n)) ? 'ja' : 'en';
  } catch (_) { return 'en'; }
}
export function i18nLang() { const v = i18nRead('lang'); return v === 'ja' || v === 'en' ? v : i18nDetect(); }
export function i18nSetLang(v) { if (v !== 'ja' && v !== 'en') return false; try { return !!I18N_ST.set('lang', v); } catch (_) { return false; } }
export function i18nControls() { return i18nRead('controls') === 'inverted' ? 'inverted' : 'standard'; }
export function i18nInverted() { return i18nControls() === 'inverted'; }
export function i18nSetControls(v) { if (v !== 'standard' && v !== 'inverted') return false; try { return !!I18N_ST.set('controls', v); } catch (_) { return false; } }
// 言語に合わせて選ぶ。ja が空なら en を返す
export function i18nTr(ja, en) { return (i18nLang() === 'ja' && ja != null && ja !== '') ? ja : en; }
