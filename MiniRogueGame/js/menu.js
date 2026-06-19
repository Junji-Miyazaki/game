// タイトル＆ゲーム選択メニュー。8本を2列グリッドで1画面に収める（スクロールなし）。
import { Scene, W, H } from './core/engine.js';
import { P, PALETTES, theme } from './core/palette.js';

const COLS = 2;
const MARGIN = 16;
const GAP = 12;
const TILE_W = (W - MARGIN * 2 - GAP) / COLS;  // 158
const TILE_H = 96;
const TOP = 100;
const PITCH = TILE_H + 12;

export class MenuScene extends Scene {
  constructor(engine, games) {
    super(engine);
    this.games = games;       // [{ meta, Game }]
    this.sel = 0;
    this.t = 0;
    this.isRoot = true;       // 最上位＝BACKボタン非表示
  }

  enter() {
    this.tiles = this._layout();
    this.themeIndex = this.games.length;
  }

  // 各タイル／テーマ行のヒット領域を計算
  _layout() {
    const tiles = [];
    this.games.forEach((g, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      tiles.push({
        index: i,
        x: MARGIN + col * (TILE_W + GAP),
        y: TOP + row * PITCH,
        w: TILE_W, h: TILE_H,
      });
    });
    const rows = Math.ceil(this.games.length / COLS);
    this.themeRect = { x: MARGIN, y: TOP + rows * PITCH, w: W - MARGIN * 2, h: 34 };
    return tiles;
  }

  onInput(action, data) {
    const max = this.games.length; // = テーマ行のindex
    if (action === 'right') { this.sel = Math.min(this.sel + 1, max); this.engine.audio.select(); }
    else if (action === 'left') { this.sel = Math.max(this.sel - 1, 0); this.engine.audio.select(); }
    else if (action === 'down') { this.sel = Math.min(this.sel + COLS, max); this.engine.audio.select(); }
    else if (action === 'up') { this.sel = Math.max(this.sel - COLS, 0); this.engine.audio.select(); }
    else if (action === 'confirm') { this._activate(this.sel); }
    else if (action === 'tap') {
      for (const tile of this.tiles) {
        if (this._hit(tile, data)) { this._activate(tile.index); return; }
      }
      if (this._hit(this.themeRect, data)) { this._activate(this.themeIndex); }
    }
  }

  _hit(r, d) { return d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h; }

  _activate(i) {
    if (i < this.games.length) {
      this.engine.audio.good();
      this.engine.startGame(this.games[i]);
    } else {
      theme.current = theme.current === PALETTES.GREEN ? PALETTES.AMBER : PALETTES.GREEN;
      this.engine.audio.select();
    }
  }

  update(dt) { this.t += dt; }

  render(ctx) {
    const p = P();
    // タイトル
    this.engine.text('MICRO ARCADE', W / 2, 36, 30, p.mid, 'center');
    if (Math.floor(this.t * 2) % 2 === 0)
      this.engine.text('▼ SELECT GAME ▼', W / 2, 74, 12, p.dim, 'center');

    // ゲームタイル
    this.games.forEach((g, i) => {
      const tile = this.tiles[i];
      const on = this.sel === i;
      const cx = tile.x + tile.w / 2;
      this.engine.rect(tile.x, tile.y, tile.w, tile.h, on ? p.dark : p.bg);
      this.engine.stroke(tile.x, tile.y, tile.w, tile.h, on ? p.mid : p.dim, on ? 2 : 1);
      const hi = this.engine.storage.getHigh(g.meta.id);
      this.engine.text(g.meta.glyph || '?', cx, tile.y + 10, 30, on ? p.hi : p.mid, 'center');
      this.engine.text(g.meta.title, cx, tile.y + 50, 14, on ? p.hi : p.fg, 'center');
      this.engine.text('HI ' + hi, cx, tile.y + 72, 11, p.warn, 'center');
    });

    // テーマ切替
    const tr = this.themeRect;
    const ton = this.sel === this.themeIndex;
    if (ton) { this.engine.rect(tr.x, tr.y, tr.w, tr.h, p.dark); this.engine.stroke(tr.x, tr.y, tr.w, tr.h, p.mid, 2); }
    this.engine.text((ton ? '> ' : '') + 'THEME: ' + p.name, W / 2, tr.y + 9, 14, ton ? p.hi : p.mid, 'center');

    this.engine.text('TAP / SWIPE / ARROWS', W / 2, H - 24, 11, p.dim, 'center');
  }
}
