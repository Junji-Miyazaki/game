// レトロカラーパレット（CRT/ゲームボーイ風）。色数を絞って雰囲気を統一する。
export const PALETTES = {
  GREEN: {
    name: 'GREEN CRT',
    bg:   '#0b1a0b', // 背景（暗緑）
    dark: '#10300f', // 影
    dim:  '#1f5d1d', // 弱
    mid:  '#39ff14', // 主役の蛍光グリーン
    fg:   '#9dff7a', // 明
    hi:   '#e8ffe0', // ハイライト
    warn: '#ffd23f', // 警告/アクセント
    bad:  '#ff5b5b', // 敵/失敗
  },
  AMBER: {
    name: 'AMBER',
    bg:   '#1a0f00',
    dark: '#2b1900',
    dim:  '#7a4a00',
    mid:  '#ffb000',
    fg:   '#ffcf63',
    hi:   '#fff0c8',
    warn: '#7af0ff',
    bad:  '#ff5b5b',
  },
};

// 現在のテーマ（メニューから切替可能）
export const theme = { current: PALETTES.GREEN };

export function P() { return theme.current; }
