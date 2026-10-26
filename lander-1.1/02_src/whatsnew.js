// 起動画面（TAP TO BEGIN）の WHAT'S NEW。version を変えると、まだ見ていない端末に NEW 表示が出る。
// 行は日本語の短文（全角20字前後まで、3〜5行）。他の表示（英語）と違う見た目にして読んでもらうため日本語にする（ユーザー決定）。
import { APP_VERSION } from './version.js';
export const WHATSNEW = {
  version: APP_VERSION,
  lines: [
    '降下ルートの輪をくぐってコンボ',
    '特別な輪で短時間の特典',
    'ステージごとに★3つを集めよう',
    '新天体：水星（暗闇のクレーター）',
    '平らな地面ならどこでも着地できる',
  ],
};
