// DODGE : Missile evasion game (Itano Circus style)
// Pilot a fixed-wing F-14 fighter and dodge homing missiles from the right.
// Missiles make wide sweeping loops (low turn rate) leaving long white contrails.
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'dodge',
  title: 'DODGE',
  desc: 'Evade the missile barrage',
  glyph: '>',
};

// ---- Constants ----
const PLAY_LEFT   = 0;
const PLAY_RIGHT  = W;
const PLAY_TOP    = 72;         // below HUD
const PLAY_BOTTOM = H - 20;

// Fighter follow speed for drag (px/s)
const FIGHTER_FOLLOW = 420;
// Keyboard movement speed (px/s)
const KEY_SPEED = 200;
// Fighter max X (left 2/3 area)
const FIGHTER_MAX_X = W * 0.62;
// Hit radius (fighter) — small ship, forgiving hitbox
const HIT_R = 7;
// Missile tip hit radius
const MISSILE_R = 5;

// Trail length — very long so loops fill the screen with white contrails
const TRAIL_MAX = 1800;

// Out-of-bounds frames before deletion
const OOB_FRAMES = 5;

// ---- Parallax starfield layer config ----
// Each layer: { count, speed, size, alpha }
const STAR_LAYERS = [
  { count: 80, speed:  18, size: 0.6, alpha: 0.25 }, // very far, tiny, slow
  { count: 50, speed:  45, size: 1.0, alpha: 0.40 }, // far
  { count: 30, speed:  90, size: 1.5, alpha: 0.60 }, // mid
  { count: 15, speed: 160, size: 2.2, alpha: 0.85 }, // near, large, fast
];

// ---- Utility ----
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Normalize angle difference to -π…π
function angleDiff(to, from) {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// ---- Parallax Star ----
class Star {
  constructor(layer) {
    this.layer = layer;
    this.reset(Math.random() * W);
  }
  reset(x) {
    this.x = x;
    this.y = PLAY_TOP + Math.random() * (PLAY_BOTTOM - PLAY_TOP);
  }
  update(dt) {
    this.x -= this.layer.speed * dt;
    if (this.x < -2) this.reset(W + 2);
  }
}

// ---- Missile ----
class Missile {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} angle      current heading (radians)
   * @param {number} speed      px/s
   * @param {number} turnRate   max turn rate (rad/s) — kept LOW for wide loops
   * @param {number} homingBudget  seconds of active homing
   */
  constructor(x, y, angle, speed, turnRate, homingBudget) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = speed;
    this.turnRate = turnRate;

    // Homing lifecycle
    this.homingBudget = homingBudget;
    this.homingUsed   = 0;
    this.homing       = true;

    // Post-disengage: straight flight, then despawn
    this.disengageTime = 0;
    this.selfDestruct  = Math.random() < 0.4; // 40% chance to self-destruct
    this.exploding     = false;
    this.explodeTimer  = 0;
    this.explodeDur    = 0.5;

    // Trail — {x, y} positions; very long for looping paths
    this.trail = [];

    this.age  = 0;
    this.dead = false;
    this._oob = 0;
  }

  update(dt, targetX, targetY) {
    if (this.dead) return;
    this.age += dt;

    if (this.homing) {
      // ---- Homing phase: low turn rate => wide loops ----
      this.homingUsed += dt;

      const dx      = targetX - this.x;
      const dy      = targetY - this.y;
      const desired = Math.atan2(dy, dx);
      const diff    = angleDiff(desired, this.angle);
      const maxTurn = this.turnRate * dt;
      this.angle   += clamp(diff, -maxTurn, maxTurn);

      if (this.homingUsed >= this.homingBudget) {
        this.homing        = false;
        this.disengageTime = 0;
      }
    } else {
      // ---- Disengage phase: fly straight ----
      this.disengageTime += dt;

      if (this.selfDestruct && this.disengageTime >= 1.5 && !this.exploding) {
        this.exploding    = true;
        this.explodeTimer = 0;
      }
      if (this.exploding) {
        this.explodeTimer += dt;
        if (this.explodeTimer >= this.explodeDur) {
          this.dead = true;
          return;
        }
        // During explosion, stop moving but record trail
        this._recordTrail();
        return;
      }
    }

    // Smooth straight-line movement — NO wobble, NO spiral offset
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    this._recordTrail();

    // Cull when far off-screen
    const margin = this.homing ? 80 : 30;
    if (
      this.x < -margin || this.x > W + margin ||
      this.y < PLAY_TOP - margin || this.y > PLAY_BOTTOM + margin
    ) {
      this._oob++;
      if (this._oob > OOB_FRAMES) this.dead = true;
    } else {
      this._oob = 0;
    }
  }

  _recordTrail() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > TRAIL_MAX) this.trail.shift();
  }
}

// ---- Main Game Class ----
export class Game extends Scene {
  enter() {
    // Fighter position
    this.fx = 80;
    this.fy = (PLAY_TOP + PLAY_BOTTOM) / 2;

    // Missiles
    this.missiles = [];

    // Parallax starfield — build each layer
    this.starLayers = STAR_LAYERS.map(layerCfg => {
      const stars = [];
      for (let i = 0; i < layerCfg.count; i++) {
        stars.push(new Star(layerCfg));
      }
      return { cfg: layerCfg, stars };
    });

    // Score / time
    this.elapsed = 0;
    this.score   = 0;
    this.high    = this.engine.storage.getHigh(meta.id) || 0;

    // Spawn management
    this.spawnTimer    = 0;
    this.spawnInterval = 1.8;
    this.volleyCount   = 1;

    // Explosion effect (fighter death)
    this.explosion = null;

    // Game over flag
    this.dead = false;

    // ライフ制：被弾5発までOK。被弾後は一定時間無敵＋点滅。
    this.lives  = 5;
    this._invuln = 0;   // 無敵残り時間（秒）

    // Keyboard input state
    this.keyDir = { x: 0, y: 0 };

    // Engine flame animation
    this.flameTick = 0;
  }

  onInput(action, data) {
    if (this.dead) {
      if (action === 'back')                     { this.engine.toMenu(); return; }
      if (action === 'tap' || action === 'confirm') { this.enter(); return; }
      return;
    }
    if (action === 'back') { this.engine.toMenu(); return; }

    if (action === 'up')    { this.keyDir.y = -1; }
    if (action === 'down')  { this.keyDir.y =  1; }
    if (action === 'left')  { this.keyDir.x = -1; }
    if (action === 'right') { this.keyDir.x =  1; }
  }

  update(dt) {
    if (this.dead) {
      if (this.explosion) {
        this.explosion.t += dt;
        if (this.explosion.t > this.explosion.dur) this.explosion = null;
      }
      return;
    }

    this.elapsed   += dt;
    this.score      = Math.floor(this.elapsed * 100);
    this.flameTick += dt;

    // ---- Fighter movement ----
    const ptr = this.engine.pointer;

    if (ptr.down) {
      const tdx  = ptr.x - this.fx;
      const tdy  = ptr.y - this.fy;
      const dist = Math.sqrt(tdx * tdx + tdy * tdy);
      if (dist > 1) {
        const step = Math.min(FIGHTER_FOLLOW * dt, dist);
        this.fx += (tdx / dist) * step;
        this.fy += (tdy / dist) * step;
      }
    } else {
      if (this.keyDir.x !== 0 || this.keyDir.y !== 0) {
        const klen = Math.sqrt(this.keyDir.x ** 2 + this.keyDir.y ** 2);
        this.fx += (this.keyDir.x / klen) * KEY_SPEED * dt;
        this.fy += (this.keyDir.y / klen) * KEY_SPEED * dt;
      }
    }
    this.keyDir.x = 0;
    this.keyDir.y = 0;

    this.fx = clamp(this.fx, PLAY_LEFT + 20, FIGHTER_MAX_X);
    this.fy = clamp(this.fy, PLAY_TOP + 16, PLAY_BOTTOM - 16);

    // ---- Parallax starfield update ----
    for (const layer of this.starLayers) {
      for (const s of layer.stars) s.update(dt);
    }

    // ---- Missile spawn ----
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawnVolley();
      const t = this.elapsed;
      this.spawnInterval = Math.max(0.45, 1.8 - t * 0.028);
      this.volleyCount   = 1 + Math.floor(t / 8);
      this.spawnTimer    = this.spawnInterval;
    }

    // ---- Missile update ----
    for (const m of this.missiles) {
      m.update(dt, this.fx, this.fy);
    }
    this.missiles = this.missiles.filter(m => !m.dead);

    // ---- 無敵時間の更新 ----
    if (this._invuln > 0) this._invuln = Math.max(0, this._invuln - dt);

    // ---- Collision (homing only, not exploding) ----
    if (this._invuln <= 0) {
      for (const m of this.missiles) {
        if (m.dead || m.exploding) continue;
        const dx   = m.x - this.fx;
        const dy   = m.y - this.fy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < HIT_R + MISSILE_R) {
          m.dead = true;               // 当たったミサイルは消滅
          this.lives -= 1;
          if (this.lives <= 0) {       // ライフ切れでゲームオーバー
            this._gameOver(m.x, m.y);
            return;
          }
          // まだ生存：無敵1秒＋小爆発エフェクト
          this._invuln = 1.0;
          this.engine.audio.bad();
          this.hitFx = { x: this.fx, y: this.fy, t: 0, dur: 0.4 };
          break;
        }
      }
    }
    // 被弾エフェクト更新
    if (this.hitFx) { this.hitFx.t += dt; if (this.hitFx.t > this.hitFx.dur) this.hitFx = null; }
  }

  _spawnVolley() {
    const t = this.elapsed;
    const baseSpeed = 90 + t * 1.5;

    // LOW turn rate: missiles overshoot and sweep in big arcs/loops
    // ~0.55 rad/s at game start => large loop radius
    // Grows slowly over time so they become slightly more dangerous
    const baseTurnRate = 0.55 + t * 0.012;

    // Homing budget: how long they actively track before giving up
    const baseHomingBudget = clamp(2.0 + t * 0.06, 2.0, 6.0);

    const count = this.volleyCount;
    for (let i = 0; i < count; i++) {
      const sy          = PLAY_TOP + 30 + Math.random() * (PLAY_BOTTOM - PLAY_TOP - 60);
      const angleSpread = (Math.random() - 0.5) * (Math.PI / 3);
      const initAngle   = Math.PI + angleSpread;  // leftward (π)
      const speed       = baseSpeed    * (0.8 + Math.random() * 0.5);
      const turnRate    = baseTurnRate * (0.6 + Math.random() * 0.8);
      const homingBudget = baseHomingBudget * (0.7 + Math.random() * 0.6);

      this.missiles.push(
        new Missile(W + 10, sy, initAngle, speed, turnRate, homingBudget)
      );
    }
  }

  _gameOver(ex, ey) {
    this.dead = true;
    this.engine.audio.bad();
    this.explosion = { x: ex, y: ey, t: 0, dur: 1.2 };

    if (this.engine.storage.setHigh(meta.id, this.score)) {
      this.high = this.score;
    } else {
      this.high = this.engine.storage.getHigh(meta.id) || this.high;
    }
  }

  render(ctx) {
    const p = P();

    // ---- Play area background ----
    this.engine.rect(0, PLAY_TOP, W, PLAY_BOTTOM - PLAY_TOP, p.dark);

    // ---- Parallax starfield ----
    this._drawStars(ctx, p);

    // ---- Missiles (contrails + warheads) ----
    for (const m of this.missiles) {
      this._drawMissile(ctx, m, p);
    }

    // ---- Fighter ----
    // 無敵中は点滅（描画を間引く）
    const blink = this._invuln > 0 && (Math.floor(this._invuln * 12) % 2 === 0);
    if ((!this.dead && !blink) || (this.explosion && this.explosion.t < 0.15)) {
      this._drawFighter(ctx, this.fx, this.fy, p);
    }

    // ---- 被弾エフェクト（小さなリング）----
    if (this.hitFx) {
      const f = clamp(this.hitFx.t / this.hitFx.dur, 0, 1);
      ctx.save();
      ctx.globalAlpha = clamp(1 - f, 0, 1);
      ctx.strokeStyle = p.bad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.hitFx.x, this.hitFx.y, Math.max(1, 6 + f * 18), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // ---- Death explosion ----
    if (this.explosion) {
      this._drawExplosion(ctx, this.explosion, p);
    }

    // ---- HUD ----
    this.engine.text('DODGE', 52, 10, 20, p.fg, 'left');
    const secStr = (this.elapsed).toFixed(1) + 's';
    this.engine.text('TIME ' + secStr, 52, 34, 14, p.mid, 'left');
    const hiSec = (this.high / 100).toFixed(1) + 's';
    this.engine.text('BEST ' + hiSec, W - 8, 10, 14, p.dim, 'right');
    // ライフ（残り被弾可能数）を小さな機体アイコンで表示
    for (let i = 0; i < this.lives; i++) {
      const lx = W - 12 - i * 13;
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.moveTo(lx, 30); ctx.lineTo(lx - 9, 34); ctx.lineTo(lx, 38);
      ctx.closePath();
      ctx.fill();
    }

    // ---- Game over overlay ----
    if (this.dead) {
      this._drawGameOver(ctx, p);
    }
  }

  // ---- Parallax starfield ----
  _drawStars(ctx, p) {
    const savedAlpha = ctx.globalAlpha;
    try {
      for (const layer of this.starLayers) {
        const { cfg, stars } = layer;
        // Use hi (near-white) for all star layers — subtle tint
        ctx.fillStyle = p.hi;
        ctx.globalAlpha = clamp(cfg.alpha, 0, 1);
        for (const s of stars) {
          ctx.fillRect(s.x, s.y, cfg.size, cfg.size);
        }
      }
    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
    }
  }

  // ---- Missile draw: long white contrail + oriented warhead ----
  _drawMissile(ctx, m, p) {
    if (!m || m.dead) return;
    const trail = m.trail;
    if (!trail || trail.length < 2) {
      if (!m.exploding) this._drawMissileHead(ctx, m, p);
      return;
    }

    const savedAlpha     = ctx.globalAlpha;
    const savedLineCap   = ctx.lineCap;
    const savedLineJoin  = ctx.lineJoin;
    const savedLineWidth = ctx.lineWidth;

    try {
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';

      const len = trail.length;

      // Fade factor — very slow fade so trails nearly fill the screen
      // Post-disengage fades slowly (over ~8s), exploding fades quickly
      let globalFade = 1.0;
      if (!m.homing) {
        globalFade = clamp(1 - m.disengageTime * 0.12, 0.08, 1);
      }
      if (m.exploding) {
        globalFade *= clamp(1 - m.explodeTimer / m.explodeDur, 0, 1) * 0.6;
      }

      // Draw the trail as a white line — nearly persistent, thin
      ctx.strokeStyle = p.hi;  // white/highlight
      ctx.lineWidth   = 1.2;

      for (let i = 1; i < len; i++) {
        const prev = trail[i - 1];
        const cur  = trail[i];
        if (!prev || !cur) continue;

        // frac: 0 = oldest tail end, 1 = missile tip
        const frac = i / len;

        // Alpha: strong near tip, gentle falloff toward the tail
        // Tail stays visible (bottom floor 0.06) so loops remain on screen
        const alpha = clamp((frac * 0.85 + 0.06) * globalFade, 0, 1);
        if (alpha < 0.005) continue;

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.stroke();
      }

      // Warhead (nose points in direction of travel)
      if (!m.exploding) {
        this._drawMissileHead(ctx, m, p);
      }

      // Self-destruct explosion
      if (m.exploding && trail.length > 0) {
        const ex = trail[trail.length - 1];
        if (ex) {
          this._drawMissileExplosion(ctx, ex.x, ex.y, m.explodeTimer / m.explodeDur, p);
        }
      }

    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
      ctx.lineCap     = savedLineCap;
      ctx.lineJoin    = savedLineJoin;
      ctx.lineWidth   = savedLineWidth;
    }
  }

  // ---- Missile warhead — oriented to velocity/heading ----
  _drawMissileHead(ctx, m, p) {
    if (!m) return;
    const savedAlpha = ctx.globalAlpha;
    try {
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(m.x, m.y);
      // Rotate to actual direction of travel — nose always points forward
      ctx.rotate(m.angle);

      // Nosecone (sharp tip, rightward at angle=0)
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(4, -2);
      ctx.lineTo(4,  2);
      ctx.closePath();
      ctx.fill();

      // Body cylinder
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.rect(-4, -2, 8, 4);
      ctx.fill();

      // Body stripe
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.rect(0, -1, 4, 2);
      ctx.fill();

      // Tail fins (upper and lower)
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(-8, -6);
      ctx.lineTo(-4,  0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-4,  2);
      ctx.lineTo(-8,  6);
      ctx.lineTo(-4,  0);
      ctx.closePath();
      ctx.fill();

      // Engine plume
      ctx.fillStyle = p.warn;
      ctx.globalAlpha = clamp(0.85, 0, 1);
      ctx.beginPath();
      ctx.moveTo(-4, -1.5);
      ctx.lineTo(-9,  0);
      ctx.lineTo(-4,  1.5);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
    }
  }

  // Small self-destruct explosion
  _drawMissileExplosion(ctx, x, y, frac, p) {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const r = 3 + frac * 18;
    const savedAlpha = ctx.globalAlpha;
    try {
      ctx.globalAlpha = clamp((1 - frac) * 0.9, 0, 1);
      ctx.strokeStyle = p.warn;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = clamp((1 - frac * 2) * 0.8, 0, 1);
      ctx.fillStyle   = p.hi;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
    }
  }

  // ---- Fixed-wing F-14 top-view silhouette (no sweep animation) ----
  _drawFighter(ctx, x, y, p) {
    const savedAlpha = ctx.globalAlpha;
    ctx.save();
    ctx.translate(x, y);
    // Fighter faces right (toward incoming missiles)

    try {
      // ===== F-14 トムキャット（真上視点・右向き・白基調）=====
      // 比率: 全長を基準に「機首が長い」「翼支点は約43%で後方」「双発は広い間隔」。
      // 全長 ≈ 32px（ノーズ x=19 〜 排気 x=-13）。翼支点 x≈5（≒43%）。
      const WHITE = p.hi, TRIM = p.mid, GLASS = p.dark;

      // ---- 主翼（中間後退で固定・大きめのテーパー翼）。翼支点 x≈5 ----
      ctx.fillStyle = WHITE;
      // 上主翼
      ctx.beginPath();
      ctx.moveTo(9, -3);     // 付け根 前縁
      ctx.lineTo(-4, -16);   // 翼端 前（前縁が後退）
      ctx.lineTo(-8, -15);   // 翼端 後
      ctx.lineTo(-2, -3);    // 付け根 後縁
      ctx.closePath(); ctx.fill();
      // 下主翼
      ctx.beginPath();
      ctx.moveTo(9, 3); ctx.lineTo(-4, 16); ctx.lineTo(-8, 15); ctx.lineTo(-2, 3);
      ctx.closePath(); ctx.fill();

      // ---- 水平尾翼（テイラロン・後部）----
      ctx.beginPath();
      ctx.moveTo(-7, -2); ctx.lineTo(-13, -10); ctx.lineTo(-15, -9); ctx.lineTo(-11, -2);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-7, 2); ctx.lineTo(-13, 10); ctx.lineTo(-15, 9); ctx.lineTo(-11, 2);
      ctx.closePath(); ctx.fill();

      // ---- 中央フラットボディ＋ツインエンジン・ナセル（広い間隔・後部）----
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.moveTo(8, -7); ctx.lineTo(-13, -7); ctx.lineTo(-13, 7); ctx.lineTo(8, 7);
      ctx.closePath(); ctx.fill();
      // ナセルの仕切り（双発を表すトリムライン）
      ctx.strokeStyle = TRIM; ctx.lineWidth = 1;
      ctx.strokeRect(-13, -7, 21, 4);
      ctx.strokeRect(-13,  3, 21, 4);

      // ---- 機首（長くスリム：全長の約1/3）----
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.moveTo(19, 0);      // 鋭いノーズ先端
      ctx.lineTo(8, -3);
      ctx.lineTo(2, -5);
      ctx.lineTo(-2, -5);
      ctx.lineTo(-2, 5);
      ctx.lineTo(2, 5);
      ctx.lineTo(8, 3);
      ctx.closePath(); ctx.fill();
      // センターライン
      ctx.strokeStyle = TRIM; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(2, 0); ctx.stroke();

      // ---- コックピット（タンデム複座・暗色ガラス）----
      ctx.fillStyle = GLASS;
      ctx.beginPath();
      ctx.ellipse(11, 0, 4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // ---- 双垂直尾翼（後部・ナセル上にハの字）----
      ctx.fillStyle = TRIM;
      ctx.beginPath();
      ctx.moveTo(-4, -5); ctx.lineTo(-12, -9); ctx.lineTo(-13, -7); ctx.lineTo(-6, -4);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-4, 5); ctx.lineTo(-12, 9); ctx.lineTo(-13, 7); ctx.lineTo(-6, 4);
      ctx.closePath(); ctx.fill();

      ctx.globalAlpha = clamp(savedAlpha, 0, 1);

      // ---- エンジン炎（双発・後方 y=±5）----
      const flameLen = 6 + Math.sin(this.flameTick * 18) * 3;
      for (const ey of [-5, 5]) {
        ctx.fillStyle = p.warn; ctx.globalAlpha = clamp(0.9, 0, 1);
        ctx.beginPath();
        ctx.moveTo(-13, ey - 1.5); ctx.lineTo(-13 - flameLen, ey); ctx.lineTo(-13, ey + 1.5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = p.hi; ctx.globalAlpha = clamp(0.75, 0, 1);
        ctx.beginPath();
        ctx.moveTo(-13, ey - 1); ctx.lineTo(-13 - flameLen * 0.55, ey); ctx.lineTo(-13, ey + 1);
        ctx.closePath(); ctx.fill();
      }

    } finally {
      ctx.restore();
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
    }
  }

  _drawExplosion(ctx, exp, p) {
    const frac = exp.t / exp.dur;
    const r    = 8 + frac * 60;
    const savedAlpha = ctx.globalAlpha;
    try {
      ctx.globalAlpha = clamp((1 - frac) * 0.8, 0, 1);
      ctx.strokeStyle = p.bad;
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = clamp((1 - frac * 2) * 0.9, 0, 1);
      ctx.fillStyle   = p.warn;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = clamp((1 - frac * 3) * 1.0, 0, 1);
      ctx.fillStyle   = p.hi;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
      ctx.lineWidth   = 1;
    }
  }

  _drawGameOver(ctx, p) {
    const savedAlpha = ctx.globalAlpha;
    try {
      ctx.globalAlpha = clamp(0.82, 0, 1);
      ctx.fillStyle   = p.dark;
      ctx.fillRect(30, H / 2 - 90, W - 60, 200);
    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
    }
    this.engine.stroke(30, H / 2 - 90, W - 60, 200, p.bad, 2);

    this.engine.text('GAME OVER', W / 2, H / 2 - 72, 30, p.bad, 'center');

    const secStr = (this.elapsed).toFixed(1) + 's';
    this.engine.text('TIME  ' + secStr, W / 2, H / 2 - 28, 20, p.fg, 'center');

    const hiSec = (this.high / 100).toFixed(1) + 's';
    this.engine.text('BEST  ' + hiSec, W / 2, H / 2 + 4, 16, p.dim, 'center');

    const blink = Math.floor(this.elapsed * 3) % 2 === 0;
    if (blink) {
      this.engine.text('TAP TO RETRY', W / 2, H / 2 + 50, 16, p.mid, 'center');
    }

    this.engine.text('‹ BACK to menu', W / 2, H / 2 + 78, 12, p.dim, 'center');
  }
}
