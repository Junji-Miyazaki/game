// 起動画面（TAP TO BEGIN）の UPDATE INFORMATION。新しい順。先頭の version が APP_VERSION（NEW 表示・seenVersion の基準）。
// items = 日本語の短文（22字まで）、itemsEn = 同じ順の英語（34字まで）。表示は設定の言語（i18nLang）で切り替える（既定は navigator.language）。
import { APP_VERSION } from './version.js';
import { i18nLang } from './core/i18n.js';
export const WHATSNEW_ENTRIES = [
  { version: APP_VERSION, date: '2026.10.27', items: [
    '操作説明（HOW TO PLAY）を追加',
    '説明文を日本語・英語で切替',
    '左右の操作の向きを設定で反転',
    'ステージ開始時にやることを1文で表示',
  ], itemsEn: [
    'Added HOW TO PLAY guide',
    'Text language: Japanese / English',
    'Invert left/right in settings',
    'One-line goal at each stage start',
  ] },
  { version: '1.1.0-beta.5', date: '2026.10.26', items: [
    '新天体：冥王星（氷で滑る・中継着陸）',
    'ツアーは1周16ステージに',
    '★は48個、パッチは8枚に',
  ], itemsEn: [
    'New: Pluto (ice slide, waypoint)',
    'Tour is now 16 stages per loop',
    '48 stars and 8 patches',
  ] },
  { version: '1.1.0-beta.4', date: '2026.10.26', items: [
    'SIDE THRUST：左右で真横に移動',
    '平地の上に LANDABLE を表示',
    '隕石に進行方向の尾と危険表示',
    '隕石で2回墜落すると緊急シールド',
    '序盤の隕石を少しずつ増やす',
    '失敗理由に速さ・傾きの数値を表示',
  ], itemsEn: [
    'SIDE THRUST: slide sideways',
    'LANDABLE label over flat ground',
    'Meteor tails and danger warning',
    'Emergency shield after 2 crashes',
    'Fewer meteors in early stages',
    'Crash reasons show speed and tilt',
  ] },
  { version: '1.1.0-beta.3', date: '2026.10.26', items: [
    'PERFECT で天体ごとのパッチ',
    'タイトルの MAP から太陽系マップ',
    '隕石スローを 1/4 の速さに強化',
  ], itemsEn: [
    'Patches for PERFECT per world',
    'Solar-system map via title MAP',
    'Meteor SLOW-MO now 1/4 speed',
  ] },
  { version: '1.1.0-beta.2', date: '2026.10.26', items: [
    '輪でコンボ・特別な輪で特典',
    'ステージごとに★3つを集めよう',
    '新天体：水星（暗闇のクレーター）',
    '起動時に世界ランキング TOP 5',
  ], itemsEn: [
    'Rings: combos, gold = power-ups',
    'Collect 3 stars per stage',
    'New world: Mercury (dark craters)',
    'World TOP 5 shown at launch',
  ] },
  { version: '1.1.0-beta', date: '2026.10.26', items: [
    '平らな地面ならどこでも着地（得点なし）',
    '着地後も再噴射で離陸できる',
    '着陸の評価 C・B・A・S・PERFECT',
    'PINで別の端末でも同じ名前',
    'ランキングは v1.0 と別集計',
  ], itemsEn: [
    'Land on any flat ground, no score',
    'Thrust again to lift off',
    'Landing grades C, B, A, S, PERFECT',
    'Same name on other devices: PIN',
    'Ranking is separate from v1.0',
  ] },
];
// 表示言語での項目（itemsEn が無い/不足なら日本語にフォールバック）
export function whatsnewItems(en, lang) {
  const l = lang || i18nLang();
  if (l === 'en' && Array.isArray(en.itemsEn) && en.itemsEn.length === en.items.length) return en.itemsEn;
  return en.items;
}
export const WHATSNEW = { version: WHATSNEW_ENTRIES[0].version, entries: WHATSNEW_ENTRIES };
