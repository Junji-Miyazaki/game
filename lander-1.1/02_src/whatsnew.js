// 起動画面（TAP TO BEGIN）の UPDATE INFORMATION。新しい順。先頭の version が APP_VERSION（NEW 表示・seenVersion の基準）。
// 項目は日本語の短文（22字まで）。他の表示（英語）と違う見た目にして読んでもらうため日本語にする（ユーザー決定）。
import { APP_VERSION } from './version.js';
export const WHATSNEW_ENTRIES = [
  { version: APP_VERSION, date: '2026.10.26', items: [
    '降下ルートの輪をくぐってコンボ',
    '特別な輪で短時間の特典',
    'ステージごとに★3つを集めよう',
    '新天体：水星（暗闇のクレーター）',
    '起動時に世界ランキング TOP 5',
  ] },
  { version: '1.1.0-beta', date: '2026.10.26', items: [
    '平らな地面ならどこでも着地（得点なし）',
    '着地後も再噴射で離陸できる',
    '着陸の評価 C・B・A・S・PERFECT',
    'PINで別の端末でも同じ名前',
    'ランキングは v1.0 と別集計',
  ] },
];
export const WHATSNEW = { version: WHATSNEW_ENTRIES[0].version, entries: WHATSNEW_ENTRIES };
