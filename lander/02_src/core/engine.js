// MICRO ARCADE エンジン。論理解像度を固定し、スクロールなしで画面にフィットさせる。
// 各ゲームは Scene を継承して enter/update/render/onInput を実装する。
import { Audio } from './audio.js';
import { Storage } from './storage.js';
import { P } from './palette.js';
import { txt, drawBackButton } from '../art.js';

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
    // 全ゲーム共通の「メニューへ戻る」ボタン（左上）。各ゲームは左上HUDを x>=52 から描く。
    this.backBtn = { x: 6, y: 8, w: 42, h: 36 };
    // 押しっぱなし状態（LANDER等の連続操作用）。論理座標。update内で毎フレーム参照できる。
    this.pointer = { down: false, x: 0, y: 0 };
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
    this.ctx.imageSmoothingEnabled = true; // P2a: 滑らかな描画（キャッシュ層の縮小に必要）
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
      // 1ゲームの例外でループ全体（＝アプリ）が停止しないよう保護する
      try {
        this.scene.update(dt);
        this.scene.render(ctx);
        // メニュー以外はBACKボタンを上に重ねる（blocksBack中は機能しないため描画も消し、押せそうで押せないUX不整合を防ぐ）
        if (!this.scene.isRoot && !(this.scene.blocksBack && this.scene.blocksBack())) this._drawBack();
        this._errCount = 0;
      } catch (e) {
        // update() が毎フレーム例外を投げると「描画は続くのにゲームだけ止まる」症状になる。
        // 黙って握り潰さず、画面に赤帯で可視化して調査可能にする（ループ自体は継続）。
        this._errCount = (this._errCount || 0) + 1;
        console.error('[scene error]', e);
        try {
          ctx.save();
          ctx.setTransform(this.scale * (window.devicePixelRatio || 1), 0, 0, this.scale * (window.devicePixelRatio || 1), 0, 0);
          ctx.fillStyle = 'rgba(200,30,60,0.85)';
          ctx.fillRect(0, H - 22, W, 22);
          ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText('ERR ' + String(e && e.message || e).slice(0, 48) + ' (x' + this._errCount + ')', 6, H - 11);
          ctx.restore();
        } catch (_) { /* 描画エラー表示自体の失敗は無視 */ }
      }
    }
    requestAnimationFrame(this._loop); // 例外があっても次フレームは必ず予約する
  }

  // ---- 入力 ----
  // 方針: 全ポインタ(タッチ複数 + マウス)を id で追跡する。解除漏れ(キャンバス外での離し・touchcancel・
  // blur・タブ非表示)で「押しっぱなし」が残ると主エンジンが噴射し続けるため、window 級で必ず解除する。
  _setupInput() {
    const dispatch = (action, data) => {
      this.audio.unlock();
      // BACKボタンのタップはゲームに渡さず、メニューへ戻す（メニュー画面では無効）。
      // ただしシーンが blocksBack()=true を返す間（例: 名前入力中）は無効化し誤タップ退出を防ぐ。
      if (action === 'tap' && data && this.scene && !this.scene.isRoot && this._inBack(data)
          && !(this.scene.blocksBack && this.scene.blocksBack())) {
        this.audio.select();
        if (this.toMenu) this.toMenu();
        return;
      }
      if (this.scene && this.scene.onInput) this.scene.onInput(action, data);
    };

    // キーボード。入力欄(名前入力など)にフォーカス中はゲーム操作として扱わない
    // （Backspace=戻る / Space・Enter の preventDefault が入力を壊すため）。
    const isTextTarget = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable === true);
    window.addEventListener('keydown', (e) => {
      if (isTextTarget(e.target)) return;
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w') { dispatch('up'); e.preventDefault(); }
      else if (k === 'ArrowDown' || k === 's') { dispatch('down'); e.preventDefault(); }
      else if (k === 'ArrowLeft' || k === 'a') { dispatch('left'); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd') { dispatch('right'); e.preventDefault(); }
      else if (k === 'Enter' || k === ' ') { dispatch('confirm'); e.preventDefault(); }
      else if (k === 'Escape' || k === 'Backspace') { dispatch('back'); e.preventDefault(); }
    });

    // ---- ポインタ追跡 ----
    const SWIPE = 24; // スワイプとみなす最小移動量(px CSS)
    this._touchMap = new Map(); // id -> {x,y}（論理座標。this.touches の要素と同一オブジェクト＝常に最新）
    this.touches = [];          // 現在押されている全点（挿入順）
    this._gesture = null;       // タップ/スワイプ判定用。「他の指が無い状態で最初に置かれた指」のみ
    const toLogical = (clientX, clientY) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: (clientX - r.left) / this.scale, y: (clientY - r.top) / this.scale };
    };
    const sync = () => {
      this.touches.length = 0;
      for (const v of this._touchMap.values()) this.touches.push(v);
      const f = this.touches[0];
      if (f) { this.pointer.down = true; this.pointer.x = f.x; this.pointer.y = f.y; }
      else this.pointer.down = false;
    };
    this._pStart = (id, cx, cy) => {
      const wasEmpty = this._touchMap.size === 0;
      this._touchMap.set(id, toLogical(cx, cy));
      // 2本目以降の指が来たらジェスチャ判定は無効（単一指のみ）
      this._gesture = wasEmpty ? { id, sx: cx, sy: cy } : null;
      sync();
    };
    this._pMove = (id, cx, cy) => {
      const pt = this._touchMap.get(id);
      if (!pt) return;
      const lp = toLogical(cx, cy);
      pt.x = lp.x; pt.y = lp.y;
      sync();
    };
    this._pEnd = (id, cx, cy, cancelled) => {
      if (!this._touchMap.has(id)) return;
      this._touchMap.delete(id);
      sync();
      const g = this._gesture;
      if (!g || g.id !== id) return;
      this._gesture = null;
      if (cancelled) return; // キャンセルされた接触はタップ扱いにしない
      const dx = cx - g.sx, dy = cy - g.sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx < SWIPE && ady < SWIPE) dispatch('tap', toLogical(cx, cy));
      else if (adx > ady) dispatch(dx > 0 ? 'right' : 'left');
      else dispatch(dy > 0 ? 'down' : 'up');
    };
    this._clearPointers = () => {
      this._touchMap.clear();
      this._gesture = null;
      sync();
    };

    const c = this.canvas;
    const each = (e, fn) => { for (let i = 0; i < e.changedTouches.length; i++) fn(e.changedTouches[i]); };
    c.addEventListener('touchstart', (e) => { each(e, (t) => this._pStart(t.identifier, t.clientX, t.clientY)); e.preventDefault(); }, { passive: false });
    c.addEventListener('touchmove', (e) => { each(e, (t) => this._pMove(t.identifier, t.clientX, t.clientY)); e.preventDefault(); }, { passive: false });
    c.addEventListener('touchend', (e) => { each(e, (t) => this._pEnd(t.identifier, t.clientX, t.clientY, false)); e.preventDefault(); }, { passive: false });
    c.addEventListener('touchcancel', (e) => { each(e, (t) => this._pEnd(t.identifier, t.clientX, t.clientY, true)); e.preventDefault(); }, { passive: false });

    // マウス（PC確認用）。move/up は window で受け、キャンバス外で離しても必ず解除する。
    c.addEventListener('mousedown', (e) => { this._pStart('mouse', e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => { this._pMove('mouse', e.clientX, e.clientY); });
    window.addEventListener('mouseup', (e) => { this._pEnd('mouse', e.clientX, e.clientY, false); });

    // フォーカス喪失・非表示・ページ離脱では全ポインタ解除（押しっぱなし固着の防止）
    window.addEventListener('blur', this._clearPointers);
    window.addEventListener('pagehide', this._clearPointers);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.hidden) this._clearPointers(); });
    }
  }

  // タップ座標がBACKボタン内か
  _inBack(data) {
    const b = this.backBtn;
    return data.x >= b.x && data.x <= b.x + b.w && data.y >= b.y && data.y <= b.y + b.h;
  }

  // BACKボタン描画（左上・全ゲーム共通）
  _drawBack() {
    drawBackButton(this.ctx, this.backBtn);   // ヘアラインの円 + シェブロン（art.js）
  }

  // ---- 描画ヘルパー（各ゲームから利用）----

  // テキスト（P2a: SF Pro / Helvetica Neue / Rajdhani のスタック、軽めのウェイト）。align: 'left'|'center'|'right'
  text(str, x, y, size = 16, color = null, align = 'left') {
    txt(this.ctx, str, x, y, size, color || P().mid, align);
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
