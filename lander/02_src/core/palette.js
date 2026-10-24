// METEOR // PROTOCOL — 宇宙ネオンパレット（単一テーマ）
// 参照: Falltopia / The Tower（深宇宙ネイビー＋ネオンワイヤーフレーム、色＝役割）
// 既存コードとの互換のため P() のキー名は MICRO ARCADE と同一に保つ。
export const PALETTES = {
  SPACE: {
    name: 'DEEP SPACE',
    bg:   '#0a0e1c', // 深宇宙ネイビー（背景ベース）
    dark: '#151b32', // パネル/シルエット
    dim:  '#33406b', // 弱いライン・非活性
    mid:  '#3ee6ff', // 主役シアン（防衛網・自機側）
    fg:   '#c9ecff', // 明るい本文
    hi:   '#ffffff', // ハイライト（白＝雑魚隕石にも使用）
    warn: '#ffb347', // 琥珀（巨大隕石・報酬・強調）
    bad:  '#ff4f6d', // ピンクレッド（危険・被弾・ボス）
    // 追加の役割色（新規コードから使用可）
    violet: '#b06bff', // 紫（高速隕石）
    pink:   '#ff5cd0', // マゼンタ（特殊/アイテム）
    green:  '#54f0a8', // 緑（$・回復・成功）
  },
};

export const theme = { current: PALETTES.SPACE };
export function P() { return theme.current; }
