// タイトル＆ゲーム選択メニュー。1画面に収まるリスト。
import { Scene, W, H } from './core/engine.js';
import { P, PALETTES, theme } from './core/palette.js';

export class MenuScene extends Scene {
  constructor(engine, games) {
    super(engine);
    this.games = games;       // [{ meta, Game }]
    this.sel = 0;
    this.t = 0;
  }

  enter() {
    this.rows = this._layout();
  }

  // 各行のヒット領域を計算（タップ判定用）
  _layout() {
    const rows = [];
    const top = 168;
    const rh = 64;
    this.games.forEach((g, i) => {
      rows.push({ type: 'game', index: i, x: 24, y: top + i * rh, w: W - 48, h: rh - 12 });
    });
    rows.push({ type: 'theme', x: 24, y: top + this.games.length * rh + 8, w: W - 48, h: 40 });
    return rows;
  }

  onInput(action, data) {
    const max = this.games.length; // 最後はテーマ切替
    if (action === 'down') { this.sel = Math.min(this.sel + 1, max); this.engine.audio.select(); }
    else if (action === 'up') { this.sel = Math.max(this.sel - 1, 0); this.engine.audio.select(); }
    else if (action === 'confirm') { this._activate(this.sel); }
    else if (action === 'tap') {
      for (const r of this.rows) {
        if (data.x >= r.x && data.x <= r.x + r.w && data.y >= r.y && data.y <= r.y + r.h) {
          this._activate(r.type === 'game' ? r.index : this.games.length);
          return;
        }
      }
    }
  }

  _activate(i) {
    if (i < this.games.length) {
      this.engine.audio.good();
      this.engine.startGame(this.games[i]);
    } else {
      // テーマ切替
      theme.current = theme.current === PALETTES.GREEN ? PALETTES.AMBER : PALETTES.GREEN;
      this.engine.audio.select();
    }
  }

  update(dt) { this.t += dt; }

  render(ctx) {
    const p = P();
    // タイトル
    this.engine.text('MICRO', W / 2, 56, 44, p.mid, 'center');
    this.engine.text('ARCADE', W / 2, 100, 44, p.fg, 'center');
    // 点滅サブタイトル
    if (Math.floor(this.t * 2) % 2 === 0)
      this.engine.text('▼ SELECT GAME ▼', W / 2, 144, 13, p.dim, 'center');

    this.games.forEach((g, i) => {
      const r = this.rows[i];
      const on = this.sel === i;
      if (on) { this.engine.rect(r.x, r.y, r.w, r.h, p.dark); this.engine.stroke(r.x, r.y, r.w, r.h, p.mid, 2); }
      const hi = this.engine.storage.getHigh(g.meta.id);
      this.engine.text((on ? '> ' : '  ') + g.meta.title, r.x + 12, r.y + 8, 18, on ? p.hi : p.fg, 'left');
      this.engine.text(g.meta.desc, r.x + 12, r.y + 30, 11, p.dim, 'left');
      this.engine.text('HI ' + hi, r.x + r.w - 10, r.y + 12, 13, p.warn, 'right');
    });

    // テーマ切替行
    const tr = this.rows[this.games.length];
    const ton = this.sel === this.games.length;
    if (ton) { this.engine.rect(tr.x, tr.y, tr.w, tr.h, p.dark); this.engine.stroke(tr.x, tr.y, tr.w, tr.h, p.mid, 2); }
    this.engine.text((ton ? '> ' : '  ') + 'THEME: ' + p.name, tr.x + 12, tr.y + 10, 14, ton ? p.hi : p.mid, 'left');

    this.engine.text('TAP / SWIPE / ARROWS', W / 2, H - 28, 11, p.dim, 'center');
  }
}
