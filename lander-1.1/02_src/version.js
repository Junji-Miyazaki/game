// 版の単一の定義元。表示ラベル・保存領域の接頭辞・ランキングのボードはここだけで決める。
// v1.0 と v1.1 は同一オリジン(junji-miyazaki.github.io)で動くため、localStorage の接頭辞を分ける（v1.0 は 'lander.'）。
export const APP_VERSION = '1.1.0-beta.6';
export const APP_LABEL = 'BETA v1.1';
export const APP_BUILD_TEXT = 'build ' + APP_VERSION;
export const STORAGE_PREFIX = 'lander11.';
export const LEGACY_PREFIX = 'lander.';      // v1.0 の保存領域（読み取り専用。書き込み・削除は一切しない）
export const APP_BOARD = 'v1.1';
