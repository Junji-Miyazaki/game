// 起動画面（TAP TO BEGIN）の WHAT'S NEW。version を変えると、まだ見ていない端末に NEW 表示が出る。
// 行は日本語の短文（全角20字前後まで、3〜5行）。他の表示（英語）と違う見た目にして読んでもらうため日本語にする（ユーザー決定）。
import { APP_VERSION } from './version.js';
export const WHATSNEW = {
  version: APP_VERSION,
  lines: [
    '平らな地面ならどこでも着地できる（得点なし）',
    '着地後も再噴射で飛び立ち、パッドを目指せる',
    '着陸の評価：C・B・A・S・PERFECT',
    'PINを設定すると別の端末でも同じ名前で遊べる',
    'ランキングは v1.0 とは別に集計',
  ],
};
