// MICRO ARCADE エンジン。論理解像度を固定し、スクロールなしで画面にフィットさせる。
// 各ゲームは Scene を継承して enter/update/render/onInput を実装する。
import { Audio } from './audio.js';
import { Storage } from './storage.js';
import { P } from './palette.js';

// 論理解像度（全ゲーム共通の座標系）。実際の表示はこれを拡大縮小する。
export const W = 360;
export const H = 640;

// シーン基底クラス。これが「ゲーム実装の契約」。
export class Scene {
  constructor(engine) {
    this.engine = engine;
  }
  enter() {}                 // シーン開始時の初期化
  exit() {}                  // シーン終了時の後始末
  update(dt) {}              // 毎フレームのロジック（dt: 秒）
  render(ctx) {}             // 毎フレームの描画
  // action: 'up'|'down'|'left'|'right'|'tap'|'confirm'|'back'
  // data: tapの場合 {x,y}（論理座標）
  onInput(action, data) {}
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = new Audio();
    this.storage = Storage;
    this.scene = null;
    this.last = 0;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);
    this._setupInput();
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  // 画面サイズに合わせてキャンバスを拡大（アスペクト比維持・スクロールなし）
  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.scale = Math.min(vw / W, vh / H);
    const cssW = Math.floor(W * this.scale);
    const cssH = Math.floor(H * this.scale);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = Math.floor(W * this.scale * dpr);
    this.canvas.height = Math.floor(H * this.scale * dpr);
    this.ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false; // ドット絵をクッキリ
    this.offsetX = (vw - cssW) / 2;
    this.offsetY = (vh - cssH) / 2;
  }

  changeScene(scene) {
    if (this.scene && this.scene.exit) this.scene.exit();
    this.scene = scene;
    if (scene.enter) scene.enter();
  }

  start(scene) {
    this.changeScene(scene);
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  }

  _loop(now) {
    let dt = (now - this.last) / 1000;
    if (dt > 0.1) dt = 0.1; // タブ復帰時の暴走防止
    this.last = now;
    const ctx = this.ctx;
    // 背景クリア
    ctx.fillStyle = P().bg;
    ctx.fillRect(0, 0, W, H);
    if (this.scene) {
      this.scene.update(dt);
      this.scene.render(ctx);
    }
    requestAnimationFrame(this._loop);
  }

  // ---- 入力 ----
  _setupInput() {
    const dispatch = (action, data) => {
      this.audio.unlock();
      if (this.scene && this.scene.onInput) this.scene.onInput(action, data);
    };

    // キーボード
    window.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w') { dispatch('up'); e.preventDefault(); }
      else if (k === 'ArrowDown' || k === 's') { dispatch('down'); e.preventDefault(); }
      else if (k === 'ArrowLeft' || k === 'a') { dispatch('left'); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd') { dispatch('right'); e.preventDefault(); }
      else if (k === 'Enter' || k === ' ') { dispatch('confirm'); e.preventDefault(); }
      else if (k === 'Escape' || k === 'Backspace') { dispatch('back'); e.preventDefault(); }
    });

    // タッチ／マウス（スワイプ判定＋タップ）
    const SWIPE = 24; // スワイプとみなす最小移動量(px CSS)
    let sx = 0, sy = 0, st = 0, moved = false;
    const toLogical = (clientX, clientY) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: (clientX - r.left) / this.scale,
        y: (clientY - r.top) / this.scale,
      };
    };
    const onStart = (x, y) => { sx = x; sy = y; st = performance.now(); moved = false; };
    const onEnd = (x, y) => {
      const dx = x - sx, dy = y - sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx < SWIPE && ady < SWIPE) {
        dispatch('tap', toLogical(x, y)); // タップ
      } else if (adx > ady) {
        dispatch(dx > 0 ? 'right' : 'left');
      } else {
        dispatch(dy > 0 ? 'down' : 'up');
      }
    };

    const c = this.canvas;
    c.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; onStart(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    c.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0]; onEnd(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });

    // マウス（PC確認用）
    let down = false;
    c.addEventListener('mousedown', (e) => { down = true; onStart(e.clientX, e.clientY); });
    c.addEventListener('mouseup', (e) => { if (down) onEnd(e.clientX, e.clientY); down = false; });
  }

  // ---- 描画ヘルパー（各ゲームから利用）----

  // ビットマップ風テキスト。align: 'left'|'center'|'right'
  text(str, x, y, size = 16, color = null, align = 'left') {
    const ctx = this.ctx;
    ctx.fillStyle = color || P().mid;
    ctx.font = `${size}px "DotGothic16", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(str, x, y);
  }

  // 角丸なしの矩形（塗り）
  rect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  // 枠線
  stroke(x, y, w, h, color, lw = 2) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
  }
}
