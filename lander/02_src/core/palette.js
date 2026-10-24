// LANDER — レトロフューチャー × 抑制のパレット（単一テーマ）。
// 近黒の背景 / 象牙の船体 / ティールの計器 / 琥珀の燃料・推力 / 赤は危険状態（低燃料・クラッシュ・速度超過）のみ。
// 既存コードとの互換のため P() のキー名は維持する。
export const PALETTES = {
  SPACE: {
    name: 'DEEP SPACE',
    bg:   '#06080E', // 近黒（背景）
    dark: '#0D111B', // パネル/シルエット
    dim:  '#5B667C', // 弱いライン・補助ラベル
    mid:  '#63D8C9', // ティール（計器・案内）
    fg:   '#ECE6D8', // 象牙（船体・本文）
    hi:   '#F8F4EA', // ハイライト
    warn: '#FFB547', // 琥珀（燃料・推力・強調）
    bad:  '#FF4A3D', // 赤（危険のみ）
    violet: '#A79BFF',
    pink:   '#FF9DB8',
    green:  '#7FE3B0',
  },
};

export const theme = { current: PALETTES.SPACE };
export function P() { return theme.current; }
