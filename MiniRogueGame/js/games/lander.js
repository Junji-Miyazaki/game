// LANDER: Control attitude with RCS thrusters and soft-land on the lunar surface.
// Reaction-thruster convention (physically correct):
//   LEFT  button (x < 120): right-side thruster fires RIGHT -> reaction pushes nose LEFT  -> craft rotates CW  (omega +)
//   RIGHT button (x > 240): left-side thruster fires LEFT  -> reaction pushes nose RIGHT -> craft rotates CCW (omega -)
//   THRUST button (center): main engine fires along craft's up-axis.
// Safe landing on the pad = STAGE CLEAR. Crash = GAME OVER.
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'lander',
  title: 'LANDER',
  desc: 'Attitude control: soft-land on the lunar surface',
  glyph: '^',
};

// ---- Physics tuning constants ----
// GRAVITY_BASE: Stage-1 gravity in px/s^2. ゆっくりとした降下で余裕のある操作感。
// THRUST_ACCEL: メインエンジン加速度。小さな補正を重ねる穏やかな推力。
// ANG_ACCEL: RCS回転加速度。慎重な姿勢制御のため抑え目。
// ANG_DAMP: 角速度の減衰。パイロットが姿勢を安定させやすくする。
// RCS_DRIFT: サイドジェットの横方向ドリフト量（px/s^2）。ジェット排気の反作用。
const GRAVITY_BASE      = 0.35;  // px/s^2 — ステージ1は非常にゆっくりとした降下（旧値0.6）
const THRUST_ACCEL      = 3.5;   // px/s^2 — 穏やかな主推力（旧値8.0）。小刻みな補正向き。
const ANG_ACCEL         = 28.0;  // deg/s^2 — 慎重な姿勢変更（旧値40.0）
const ANG_DAMP          = 0.82;  // 角速度減衰（旧値0.88、より強い減衰で安定しやすく）
const RCS_DRIFT         = 2.5;   // px/s^2 — サイドジェット横ドリフト（排気反作用、新規）
// NO VEL_DAMP — 並進運動はニュートン力学（減衰なし）
const FUEL_MAX          = 100;
const FUEL_RATE_MAIN    = 5;     // 旧7、穏やか推力に合わせ消費も削減
const FUEL_RATE_RCS     = 1.5;   // 旧2
const SAFE_VY           = 14;
const SAFE_VX           = 8;
const SAFE_ANGLE        = 18;
const SAFE_OMEGA        = 12;
const PAD_W_BASE        = 54;
const TERRAIN_SEGS      = 18;
const LANDER_START_Y    = 90;
const GUIDE_THRESHOLD   = 30;    // ON COURSEとみなす誘導線からの距離(px)
const GUIDE_PTS         = 32;

// Control zones (logical coordinates 0..360)
const ZONE_L_MAX  = 120;  // left button: x < ZONE_L_MAX
const ZONE_R_MIN  = 240;  // right button: x > ZONE_R_MIN
const CONTROL_Y_MIN = 52; // ignore pointer input above this Y (BACK button zone)

// Bottom button bar geometry
const BTN_Y   = H - 80;  // top of button bar
const BTN_H   = 80;       // height of button bar

// ---- Stage difficulty scaling ----
// Stage 1: low gravity, no obstacles.
// Stage 2+: gravity increases per stage; floating obstacles added and multiplied.
function stageParams(stage) {
  const s = Math.min(stage, 8);
  return {
    // gravity increases ~15% per stage beyond stage 1
    gravity:      GRAVITY_BASE * (1 + (s - 1) * 0.15),
    padW:         Math.max(24, PAD_W_BASE - (s - 1) * 4),
    stageBonus:   s * 50,
    // obstacles: 0 in stage 1, then 2 + (s-2) extras per stage
    obstacleCount: s <= 1 ? 0 : 2 + (s - 2),
    // obstacle drift speed scales with stage
    obstacleSpeed: 12 + (s - 1) * 4,
  };
}

// ---- Terrain generation ----
function buildTerrain(padW) {
  const segW    = W / TERRAIN_SEGS;
  const FLOOR_Y   = 608;
  const FLOOR_MIN = 525;
  const pts       = [];

  // Pick one random segment for the landing pad
  const available = [];
  for (let i = 2; i < TERRAIN_SEGS - 3; i++) available.push(i);
  const padSeg = available[Math.floor(Math.random() * available.length)];

  for (let i = 0; i <= TERRAIN_SEGS; i++) {
    const x = i * segW;
    let y;
    if (i === 0 || i === TERRAIN_SEGS) {
      y = FLOOR_Y;
    } else {
      y = FLOOR_MIN + Math.random() * (FLOOR_Y - FLOOR_MIN);
    }
    pts.push({ x, y });
  }

  // Flatten the pad segment
  const midX  = (padSeg + 0.5) * segW;
  const flatY = FLOOR_MIN + 20 + Math.random() * 50;
  const lx    = midX - padW / 2;
  pts[padSeg].y     = flatY;
  pts[padSeg + 1].y = flatY;
  if (padSeg > 0)                  pts[padSeg - 1].y = (pts[padSeg - 1].y + flatY) / 2;
  if (padSeg + 2 <= TERRAIN_SEGS)  pts[padSeg + 2].y = (pts[padSeg + 2].y + flatY) / 2;

  const pad = { x: lx, y: flatY, w: padW };
  return { pts, pad };
}

// ---- Stars (background) ----
function buildStars(count) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W,
      y: 20 + Math.random() * 460,
      r: Math.random() < 0.2 ? 2 : 1,
    });
  }
  return stars;
}

// ---- Descent trajectory guide (parabolic from start to pad center) ----
function buildGuide(startX, startY, pad, numPts) {
  const targetX = pad.x + pad.w / 2;
  const targetY = pad.y;
  const pts     = [];
  for (let i = 0; i <= numPts; i++) {
    const t = i / numPts;
    pts.push({
      x: startX + (targetX - startX) * t,
      y: startY + (targetY - startY) * (t * t),
    });
  }
  return pts;
}

// ---- Floating obstacles (stages 2+) ----
// Obstacles drift horizontally. They appear in the mid-descent zone (y 150-480)
// and bounce off the left/right walls. Touching one = crash.
function buildObstacles(count, speed) {
  const obs = [];
  if (count <= 0) return obs;
  for (let i = 0; i < count; i++) {
    // Spread evenly through descent zone, avoid spawning right at the start
    const yBand   = 150 + (i / count) * 300 + Math.random() * 60;
    const vxSign  = Math.random() < 0.5 ? 1 : -1;
    const r       = 10 + Math.floor(Math.random() * 8); // radius 10-17
    obs.push({
      x:  30 + Math.random() * (W - 60),
      y:  Math.max(150, Math.min(480, yBand)),
      vx: (speed * 0.6 + Math.random() * speed * 0.8) * vxSign,
      r,
    });
  }
  return obs;
}

export class Game extends Scene {

  enter() {
    this.high       = (this.engine.storage.getHigh(meta.id) || 0);
    this.totalScore = 0;
    this.stage      = 1;
    this.state      = 'play';
    this._initStage();
  }

  // ---- Initialize one stage ----
  _initStage() {
    this.state    = 'play';
    this.fuel     = FUEL_MAX;
    this.angle    = (Math.random() - 0.5) * 8;  // tiny initial tilt (degrees)
    this.omega    = 0;                           // angular velocity (deg/s)
    this.x        = W / 2 + (Math.random() - 0.5) * 50;
    this.y        = LANDER_START_Y;
    this.vx       = (Math.random() - 0.5) * 4;  // near-zero initial horizontal speed
    this.vy       = 2;                           // slow initial downward speed

    this._thrustMain = false;
    this._thrustRcsL = false;
    this._thrustRcsR = false;

    const sp       = stageParams(this.stage);
    this._gravity  = sp.gravity;
    this._padW     = sp.padW;

    const terrain     = buildTerrain(this._padW);
    this.terrainPts   = terrain.pts;
    this.pad          = terrain.pad;
    this.stars        = this.stars || buildStars(40);

    this.guidePts = buildGuide(this.x, this.y, this.pad, GUIDE_PTS);

    this._guideDevTotal = 0;
    this._guideDevCount = 0;
    this._stageScore    = 0;
    this._guideBonus    = 0;
    this.particles      = [];

    // ON COURSEポップインジケーター用タイマー
    this._onCourseTime = 0;   // ON COURSE状態の累積時間(秒)
    this._onCoursePulse = 0;  // 点滅アニメーション用位相(秒)

    // Floating obstacles (stage 2+)
    this.obstacles = buildObstacles(sp.obstacleCount, sp.obstacleSpeed);

    this._keys = this._keys || { left: false, right: false, up: false };
  }

  // ---- Distance to nearest guide point ----
  _distToGuide(x, y) {
    let minDist = Infinity;
    const pts = this.guidePts;
    if (!pts) return Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = x - pts[i].x;
      const dy = y - pts[i].y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  // ---- Keyboard discrete input ----
  onInput(action, data) {
    if (this.state === 'cleared') {
      if (action === 'tap' || action === 'confirm') {
        this.stage += 1;
        this._initStage();
      }
      if (action === 'back') { this.engine.toMenu(); }
      return;
    }
    if (this.state === 'gameover') {
      if (action === 'tap' || action === 'confirm') {
        this.totalScore = 0;
        this.stage      = 1;
        this._initStage();
      }
      if (action === 'back') { this.engine.toMenu(); }
      return;
    }
    if (action === 'back') { this.engine.toMenu(); return; }

    if (this._keys) {
      if (action === 'left')    this._keys.left  = true;
      if (action === 'right')   this._keys.right = true;
      if (action === 'up')      this._keys.up    = true;
      if (action === 'confirm') this._keys.up    = true;
    }
  }

  // ---- Per-frame logic ----
  update(dt) {
    if (typeof dt !== 'number' || dt <= 0 || dt > 0.1) dt = 0.016;

    if (this.state !== 'play') {
      this._updateParticles(dt);
      if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
      return;
    }

    const ptr = this.engine.pointer;

    // ---- Read control inputs ----
    // Pointer press-and-hold in the bottom button bar (y > BTN_Y) is the primary control.
    // Top strip y < CONTROL_Y_MIN is ignored to avoid conflicting with the BACK button.
    this._thrustMain = false;
    this._thrustRcsL = false;
    this._thrustRcsR = false;

    if (ptr.down && ptr.y > CONTROL_Y_MIN) {
      if (ptr.x < ZONE_L_MAX) {
        // LEFT button pressed
        this._thrustRcsL = true;
      } else if (ptr.x > ZONE_R_MIN) {
        // RIGHT button pressed
        this._thrustRcsR = true;
      } else {
        // CENTER: main engine
        this._thrustMain = true;
      }
    }

    // Keyboard (one-shot pulse per frame)
    if (this._keys) {
      if (this._keys.left)  this._thrustRcsL = true;
      if (this._keys.right) this._thrustRcsR = true;
      if (this._keys.up)    this._thrustMain  = true;
      this._keys.left  = false;
      this._keys.right = false;
      this._keys.up    = false;
    }

    // ---- RCS attitude jets — reaction-thruster convention ----
    // Physical convention: the nozzle FIRES toward the button side; Newton's 3rd law
    // pushes the craft nose the OPPOSITE way.
    //
    // LEFT button  -> left-side nozzle fires leftward -> nose pushed RIGHT -> CW rotation
    //   omega += ANG_ACCEL * dt  (positive omega -> angle increases -> ctx.rotate(+rad) -> CW on screen)
    //
    // RIGHT button -> right-side nozzle fires rightward -> nose pushed LEFT -> CCW rotation
    //   omega -= ANG_ACCEL * dt  (negative omega -> angle decreases -> ctx.rotate(-rad) -> CCW on screen)
    //
    // サイドジェット横ドリフト（排気反作用）:
    //   LEFT  button -> 左ノズルが左に排気 -> 機体が右にドリフト (vx += RCS_DRIFT * dt)
    //   RIGHT button -> 右ノズルが右に排気 -> 機体が左にドリフト (vx -= RCS_DRIFT * dt)
    //
    // Keyboard: ArrowLeft maps to _thrustRcsL (same CW convention).
    //           ArrowRight maps to _thrustRcsR (same CCW convention).
    if (this._thrustRcsL && this.fuel > 0) {
      this.omega += ANG_ACCEL * dt;         // CW: nose tilts RIGHT
      this.vx    += RCS_DRIFT * dt;         // 左ノズル排気反作用 -> 右ドリフト
      this.fuel   = Math.max(0, this.fuel - FUEL_RATE_RCS * dt);
    }
    if (this._thrustRcsR && this.fuel > 0) {
      this.omega -= ANG_ACCEL * dt;         // CCW: nose tilts LEFT
      this.vx    -= RCS_DRIFT * dt;         // 右ノズル排気反作用 -> 左ドリフト
      this.fuel   = Math.max(0, this.fuel - FUEL_RATE_RCS * dt);
    }

    // ---- Angular damping (mild drag so craft can be stabilized) ----
    this.omega *= Math.pow(ANG_DAMP, dt);

    // ---- Integrate omega -> angle ----
    this.angle += this.omega * dt;
    // Normalize to -180..180
    this.angle  = ((this.angle + 180) % 360 + 360) % 360 - 180;

    // ---- Main engine: thrust along craft's up-axis ----
    // angle=0 => pointing straight up. craft up vector in screen coords:
    //   when angle=0, "up" is -Y (screen). ctx.rotate(+rad) rotates CW.
    //   craft up unit vector: (-sin(angle_rad), -cos(angle_rad)) in canvas (x,y).
    // 穏やかなTHRUST_ACCELで小刻みな補正を実現。大きく吹かすと燃料を浪費。
    if (this._thrustMain && this.fuel > 0) {
      const rad = this.angle * Math.PI / 180;
      this.vx  += (-Math.sin(rad)) * THRUST_ACCEL * dt;
      this.vy  += (-Math.cos(rad)) * THRUST_ACCEL * dt;
      this.fuel = Math.max(0, this.fuel - FUEL_RATE_MAIN * dt);
    }

    // ---- Gravity (straight down = +Y in canvas) ----
    // NO translational damping. Purely Newtonian: only gravity and engine thrust change velocity.
    this.vy += this._gravity * dt;

    // ---- Position update ----
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // ---- Horizontal clamp (weak bounce at edges) ----
    const PAD = 14;
    if (this.x < PAD)     { this.x = PAD;     this.vx =  Math.abs(this.vx) * 0.3; }
    if (this.x > W - PAD) { this.x = W - PAD; this.vx = -Math.abs(this.vx) * 0.3; }
    // Top clamp
    if (this.y < 60) { this.y = 60; this.vy = Math.max(0, this.vy); }

    // ---- Guide deviation tracking (upper half only) ----
    // 誘導線からの偏差を累積。スコアリングに使用。
    const guideDist = this._distToGuide(this.x, this.y);
    if (this.y < 420) {
      this._guideDevTotal += guideDist;
      this._guideDevCount += 1;
    }

    // ---- ON COURSE pulse timer update ----
    if (guideDist <= GUIDE_THRESHOLD && this.state === 'play') {
      this._onCourseTime  += dt;
      this._onCoursePulse += dt;
    } else {
      // 誘導線を外れたらタイマーリセット（点滅は停止）
      this._onCourseTime  = 0;
      this._onCoursePulse = 0;
    }

    // ---- Update floating obstacles (stages 2+) ----
    if (this.obstacles && this.obstacles.length > 0) {
      for (const ob of this.obstacles) {
        ob.x += ob.vx * dt;
        // Bounce off walls
        if (ob.x - ob.r < 0)     { ob.x = ob.r;     ob.vx = Math.abs(ob.vx); }
        if (ob.x + ob.r > W)     { ob.x = W - ob.r; ob.vx = -Math.abs(ob.vx); }
      }
      // Check collision with lander (circle vs. point, craft body ~16x18 -> use 14px radius)
      const craftR = 14;
      for (const ob of this.obstacles) {
        const dx = this.x - ob.x;
        const dy = this.y - ob.y;
        if (Math.sqrt(dx * dx + dy * dy) < craftR + ob.r) {
          // Hit an obstacle — crash
          this._explode();
          this.engine.audio.bad();
          this.totalScore += Math.round((this.fuel || 0) * 2);
          if (this.totalScore > this.high) {
            this.high = this.totalScore;
            this.engine.storage.setHigh(meta.id, this.high);
          }
          this.state = 'gameover';
          return;
        }
      }
    }

    // ---- Terrain collision ----
    this._checkCollision();
  }

  // ---- Collision & landing check ----
  _checkCollision() {
    const terrainY = this._terrainYAt(this.x);
    const footY    = this.y + 16;

    if (footY < terrainY) return;

    const onPad   = (this.x >= this.pad.x && this.x <= this.pad.x + this.pad.w);
    const absAngle = Math.abs(((this.angle + 180) % 360 + 360) % 360 - 180);
    const absOmega = Math.abs(this.omega);

    const safeLand = onPad &&
                     Math.abs(this.vy) <= SAFE_VY &&
                     Math.abs(this.vx) <= SAFE_VX &&
                     absAngle          <= SAFE_ANGLE &&
                     absOmega          <= SAFE_OMEGA;

    if (safeLand) {
      this.y  = terrainY - 16;
      this.vx = 0; this.vy = 0; this.omega = 0;

      const sp        = stageParams(this.stage);
      const fuelBonus = Math.round(this.fuel * 10);

      // 着地精度ボーナス: 速度・姿勢が安全値を下回るほど高得点
      const softBonus = Math.round(Math.max(0, SAFE_VY - Math.abs(this.vy)) * 8);
      const horzBonus = Math.round(Math.max(0, SAFE_VX - Math.abs(this.vx)) * 6);
      const uprBonus  = Math.round(Math.max(0, SAFE_ANGLE - absAngle) * 5);
      const omgBonus  = Math.round(Math.max(0, SAFE_OMEGA - absOmega) * 4);

      // 軌道追従ボーナス: 誘導線を忠実にたどるほど高得点（最大400点）
      // avgDev 0px -> 400点, avgDev GUIDE_THRESHOLD(30px) -> 100点, それ以上 -> 0点
      let guideBonus = 0;
      if (this._guideDevCount > 0) {
        const avgDev = this._guideDevTotal / this._guideDevCount;
        // avgDev=0 -> 400, avgDev=60 -> 0 (勾配: -400/60)
        guideBonus = Math.round(Math.max(0, 400 - avgDev * (400 / 60)));
      }
      this._guideBonus  = guideBonus;
      this._stageScore  = fuelBonus + softBonus + horzBonus + uprBonus + omgBonus + guideBonus + sp.stageBonus;
      this.totalScore  += this._stageScore;

      if (this.totalScore > this.high) {
        this.high = this.totalScore;
        this.engine.storage.setHigh(meta.id, this.high);
      }

      this.engine.audio.good();
      this.state = 'cleared';

    } else {
      this._explode();
      this.engine.audio.bad();

      this.totalScore += Math.round((this.fuel || 0) * 2);

      if (this.totalScore > this.high) {
        this.high = this.totalScore;
        this.engine.storage.setHigh(meta.id, this.high);
      }

      this.state = 'gameover';
    }
  }

  // ---- Explosion particles ----
  _explode() {
    this.particles = [];
    for (let i = 0; i < 28; i++) {
      const spd = 20 + Math.random() * 60;
      const dir = Math.random() * Math.PI * 2;
      this.particles.push({
        x:    this.x,
        y:    this.y,
        vx:   Math.cos(dir) * spd,
        vy:   Math.sin(dir) * spd - 25,
        life: 0.7 + Math.random() * 1.0,
        max:  1.7,
      });
    }
  }

  _updateParticles(dt) {
    if (!this.particles) return;
    for (const pt of this.particles) {
      pt.x    += pt.vx * dt;
      pt.y    += pt.vy * dt;
      pt.vy   += (this._gravity || GRAVITY_BASE) * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter(pt => pt.life > 0);
  }

  // ---- Linear interpolation of terrain Y at given X ----
  _terrainYAt(x) {
    const pts = this.terrainPts;
    if (!pts || pts.length < 2) return H;
    for (let i = 0; i < pts.length - 1; i++) {
      if (x >= pts[i].x && x <= pts[i + 1].x) {
        const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
        return pts[i].y + t * (pts[i + 1].y - pts[i].y);
      }
    }
    return H;
  }

  // ---- Main render ----
  render(ctx) {
    const p = P();

    // Stars
    if (this.stars) {
      for (const s of this.stars) {
        ctx.fillStyle = s.r > 1 ? p.dim : p.dark;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
    }

    // Descent trajectory guide (常に描画)
    this._drawGuide(ctx);

    // Floating obstacles (stages 2+)
    this._drawObstacles(ctx);

    // Terrain
    if (this.terrainPts && this.terrainPts.length > 0) {
      ctx.fillStyle = p.dark;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (const pt of this.terrainPts) ctx.lineTo(pt.x, pt.y);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = p.dim;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      for (let i = 0; i < this.terrainPts.length; i++) {
        const pt = this.terrainPts[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else         ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // Landing pad
    if (this.pad) {
      const pd = this.pad;
      ctx.fillStyle = p.fg;
      ctx.fillRect(pd.x, pd.y, pd.w, 4);
      ctx.fillStyle = p.mid;
      ctx.fillRect(pd.x,            pd.y, 4, 10);
      ctx.fillRect(pd.x + pd.w - 4, pd.y, 4, 10);
      // Flag pole
      ctx.fillStyle = p.mid;
      ctx.fillRect(pd.x + pd.w / 2 - 1, pd.y - 22, 2, 22);
      ctx.fillStyle = p.warn;
      ctx.fillRect(pd.x + pd.w / 2 + 1, pd.y - 20, 12, 9);
      this.engine.text('PAD', pd.x + pd.w / 2, pd.y - 38, 10, p.mid, 'center');
    }

    // Explosion particles
    if (this.particles) {
      for (const pt of this.particles) {
        const t = Math.max(0, Math.min(1, pt.life / (pt.max || 1.7)));
        ctx.fillStyle = t > 0.5 ? p.warn : p.bad;
        const r = Math.max(1, Math.round(t * 4));
        ctx.fillRect(pt.x - r / 2, pt.y - r / 2, r, r);
      }
    }

    // Lander craft
    if (this.state !== 'gameover' || (this.particles && this.particles.length > 0)) {
      if (this.state === 'play' || this.state === 'cleared') {
        this._drawLander(ctx, this.x, this.y, this.angle);
      }
    }

    // HUD
    this._drawHUD(ctx);

    // Bottom button controls
    this._drawButtons(ctx);

    // Result overlays
    if (this.state === 'cleared') {
      this._drawClearScreen(ctx);
    } else if (this.state === 'gameover') {
      this._drawGameOver(ctx);
    }
  }

  // ---- Floating obstacles ----
  _drawObstacles(ctx) {
    if (!this.obstacles || this.obstacles.length === 0) return;
    const p = P();
    for (const ob of this.obstacles) {
      // Draw as a jagged rock/asteroid (octagon-ish)
      ctx.save();
      ctx.translate(ob.x, ob.y);
      ctx.fillStyle   = p.dark;
      ctx.strokeStyle = p.bad;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      const sides = 7;
      for (let i = 0; i < sides; i++) {
        // Slightly irregular radius for rock feel
        const jitter = 0.75 + (((i * 37 + 13) % 7) / 7) * 0.5;
        const angle  = (i / sides) * Math.PI * 2;
        const rx     = Math.cos(angle) * ob.r * jitter;
        const ry     = Math.sin(angle) * ob.r * jitter;
        if (i === 0) ctx.moveTo(rx, ry);
        else         ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Small warning highlight
      ctx.fillStyle   = p.warn;
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.55));
      ctx.fillRect(-2, -2, 4, 4);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // ---- Descent trajectory guide ----
  // 常に描画: 誘導線は常にはっきり見えるようにする。
  // ON COURSE時: 明るく太く、機体周辺に円形マーカー＋上部テキスト表示＋パルス点滅。
  // OFF COURSE時: dim色で細いが消えない（0.55 alpha）。
  _drawGuide(ctx) {
    const p   = P();
    const pts = this.guidePts;
    if (!pts || pts.length < 2) return;

    const dist     = (this.state === 'play')
      ? this._distToGuide(this.x, this.y)
      : Infinity;
    const onCourse = (dist <= GUIDE_THRESHOLD);

    // ON COURSEパルス: sin波で輝度を変調（1Hzで点滅）
    // _onCoursePulseはupdateで加算され、sin計算で[0..1]の輝度係数に変換
    const pulse = onCourse
      ? (0.7 + 0.3 * Math.sin(((this._onCoursePulse || 0) * Math.PI * 2) * 1.5))
      : 1.0;

    // ガイドライン描画（常に表示）
    ctx.save();
    if (onCourse) {
      // ON COURSE: 明るく太い実線
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.85 * pulse));
      ctx.strokeStyle = p.hi;
      ctx.lineWidth   = 2.5;
      ctx.setLineDash([6, 4]);
    } else {
      // OFF COURSE: 常に見える薄い点線（消えない）
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.55));
      ctx.strokeStyle = p.warn;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 8]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Diamond marker at target
    const last = pts[pts.length - 1];
    ctx.fillStyle   = onCourse ? p.hi : p.warn;
    ctx.globalAlpha = Math.max(0, Math.min(1, onCourse ? 0.9 * pulse : 0.5));
    ctx.beginPath();
    ctx.moveTo(last.x,     last.y - 8);
    ctx.lineTo(last.x + 7, last.y);
    ctx.lineTo(last.x,     last.y + 8);
    ctx.lineTo(last.x - 7, last.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ON COURSEポップインジケーター（機体周辺＋テキスト）
    if (onCourse && this.state === 'play') {
      this._drawOnCourseIndicator(ctx, pulse);
    }
  }

  // ---- ON COURSE pop indicator ----
  // 機体周辺の明るいリング＋上部のテキストバナー。
  // パルス点滅で「今乗っている」ことを明確に伝える。
  _drawOnCourseIndicator(ctx, pulse) {
    if (typeof pulse !== 'number') pulse = 1;
    const p = P();

    // 機体周囲のハローリング（スケールパルス）
    const ringR = 22 + 4 * Math.sin(((this._onCoursePulse || 0) * Math.PI * 2) * 1.5);
    ctx.save();
    ctx.globalAlpha  = Math.max(0, Math.min(1, 0.6 * pulse));
    ctx.strokeStyle  = p.hi;
    ctx.lineWidth    = 2.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // 内側の小さなドット（中心確認マーカー）
    ctx.globalAlpha = Math.max(0, Math.min(1, 0.8 * pulse));
    ctx.fillStyle   = p.hi;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 上部テキストバナー（HUDエリアの直下）
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, pulse));
    this.engine.text('ON COURSE', W / 2, 72, 13, p.hi, 'center');
    ctx.restore();
  }

  // ---- Lander craft with 4 RCS nozzles ----
  // Rotation math (ctx.rotate convention):
  //   ctx.rotate(+rad) = clockwise (CW) on screen
  //   ctx.rotate(-rad) = counter-clockwise (CCW) on screen
  //
  //   omega > 0 -> angle increases -> ctx.rotate(+rad) -> CW on screen (nose tilts RIGHT)
  //   omega < 0 -> angle decreases -> ctx.rotate(-rad) -> CCW on screen (nose tilts LEFT)
  //
  //   LEFT  button -> omega += -> CW  (nose tilts right)   LEFT nozzle fires left -> reaction right
  //   RIGHT button -> omega -= -> CCW (nose tilts left)   RIGHT nozzle fires right -> reaction left
  //
  // The FLAME is drawn on the FIRING nozzle side, consistent with actual exhaust direction.
  _drawLander(ctx, x, y, angleDeg) {
    const p   = P();
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const rad = ((angleDeg || 0) * Math.PI / 180);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad);  // positive rad = CW on canvas; negative = CCW

    // Main engine flame (bottom nozzle, fires downward in body space)
    if (this._thrustMain && this.fuel > 0) {
      const fl = 10 + Math.random() * 10;
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(-6, 9);
      ctx.lineTo(0,  9 + fl);
      ctx.lineTo(6,  9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.moveTo(-3, 9);
      ctx.lineTo(0,  9 + fl * 0.5);
      ctx.lineTo(3,  9);
      ctx.closePath();
      ctx.fill();
    }

    // Body
    ctx.fillStyle   = p.mid;
    ctx.fillRect(-8, -10, 16, 18);
    ctx.strokeStyle = p.fg;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(-8, -10, 16, 18);

    // Cabin window
    ctx.fillStyle = p.hi;
    ctx.fillRect(-4, -8, 8, 7);

    // Left landing leg
    ctx.strokeStyle = p.mid;
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(-7, 8);   ctx.lineTo(-14, 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 16); ctx.lineTo(-18, 16); ctx.stroke();

    // Right landing leg
    ctx.beginPath(); ctx.moveTo(7, 8);    ctx.lineTo(14, 16);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 16);  ctx.lineTo(18, 16);  ctx.stroke();

    // Main engine nozzle (bottom center)
    ctx.fillStyle = p.dark;
    ctx.fillRect(-5, 9, 10, 5);
    ctx.strokeStyle = (this._thrustMain && this.fuel > 0) ? p.warn : p.dim;
    ctx.lineWidth   = 1;
    ctx.strokeRect(-5, 9, 10, 5);

    // LEFT RCS nozzle (body left side, upper area)
    // LEFT button fires LEFT nozzle to the LEFT. Reaction: nose goes RIGHT = CW = omega +.
    // Flame jets LEFT from left nozzle.
    ctx.fillStyle = p.dark;
    ctx.fillRect(-12, -6, 4, 4);
    if (this._thrustRcsL && this.fuel > 0) {
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(-12 - (5 + Math.random() * 5), -2);
      ctx.lineTo(-12, -6 + 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = (this._thrustRcsL && this.fuel > 0) ? p.warn : p.dim;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(-12, -6, 4, 4);

    // RIGHT RCS nozzle (body right side, upper area)
    // RIGHT button fires RIGHT nozzle to the RIGHT. Reaction: nose goes LEFT = CCW = omega -.
    // Flame jets RIGHT from right nozzle.
    ctx.fillStyle = p.dark;
    ctx.fillRect(8, -6, 4, 4);
    if (this._thrustRcsR && this.fuel > 0) {
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(12, -4);
      ctx.lineTo(12 + (5 + Math.random() * 5), -2);
      ctx.lineTo(12, -6 + 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = (this._thrustRcsR && this.fuel > 0) ? p.warn : p.dim;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(8, -6, 4, 4);

    // Top attitude nozzle (visual reference)
    ctx.fillStyle   = p.dark;
    ctx.fillRect(-3, -14, 6, 4);
    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(-3, -14, 6, 4);

    ctx.restore();
  }

  // ---- HUD (top area, x >= 52 to clear the BACK button) ----
  _drawHUD(ctx) {
    const p = P();

    this.engine.text('LANDER', 52, 8, 16, p.fg, 'left');
    this.engine.text('ST.' + this.stage, 52, 26, 12, p.mid, 'left');
    this.engine.text('HI ' + (this.high || 0),      W - 8, 8,  12, p.dim, 'right');
    this.engine.text('TOT ' + this.totalScore,       W - 8, 22, 12, p.mid, 'right');

    // Fuel bar
    const bx = 52, by = 44, bw = 110, bh = 10;
    this.engine.rect(bx, by, bw, bh, p.dark);
    const fr   = Math.max(0, Math.min(1, (this.fuel || 0) / FUEL_MAX));
    const fclr = fr > 0.4 ? p.mid : fr > 0.15 ? p.warn : p.bad;
    if (fr > 0) this.engine.rect(bx, by, Math.round(bw * fr), bh, fclr);
    this.engine.stroke(bx, by, bw, bh, p.dim, 1);
    this.engine.text('FUEL', bx + bw + 4, by, 10, p.dim, 'left');

    if (this.state !== 'play') return;

    // Vertical speed
    const vy    = this.vy || 0;
    const vyclr = Math.abs(vy) <= SAFE_VY ? p.mid : Math.abs(vy) <= SAFE_VY * 1.6 ? p.warn : p.bad;
    this.engine.text('VY ' + Math.round(vy), W - 8, 38, 11, vyclr, 'right');

    // Horizontal speed
    const vx    = this.vx || 0;
    const vxclr = Math.abs(vx) <= SAFE_VX ? p.mid : Math.abs(vx) <= SAFE_VX * 2 ? p.warn : p.bad;
    this.engine.text('VX ' + Math.round(vx), W - 8, 52, 11, vxclr, 'right');

    // Angle
    const ang    = this.angle || 0;
    const absAng = Math.abs(((ang + 180) % 360 + 360) % 360 - 180);
    const aclr   = absAng <= SAFE_ANGLE ? p.mid : absAng <= SAFE_ANGLE * 2 ? p.warn : p.bad;
    this.engine.text('A ' + Math.round(ang) + '°', 52, 58, 11, aclr, 'left');

    // Angular velocity
    const om    = this.omega || 0;
    const omclr = Math.abs(om) <= SAFE_OMEGA ? p.mid : Math.abs(om) <= SAFE_OMEGA * 2 ? p.warn : p.bad;
    this.engine.text('ω ' + Math.round(om), W - 8, 66, 11, omclr, 'right');
  }

  // ---- Bottom button bar ----
  // Label convention (reaction-thruster):
  //   LEFT  button -> fires left nozzle -> nose tilts RIGHT (CW)
  //   RIGHT button -> fires right nozzle -> nose tilts LEFT (CCW)
  // Labels reflect the NOSE direction for clarity to the player.
  _drawButtons(ctx) {
    const p = P();

    const BW = 120;
    const bY = BTN_Y;
    const bH = BTN_H;

    const drawBtn = (bx, label, sublabel, active) => {
      ctx.fillStyle = active ? p.dim : p.dark;
      ctx.fillRect(bx, bY, BW, bH);

      ctx.strokeStyle = active ? p.hi : p.dim;
      ctx.lineWidth   = active ? 2.5 : 1.5;
      ctx.strokeRect(bx + 1, bY + 1, BW - 2, bH - 2);

      if (active) {
        ctx.fillStyle = p.hi;
        ctx.globalAlpha = Math.max(0, Math.min(1, 0.25));
        ctx.fillRect(bx + 2, bY + 2, BW - 4, 6);
        ctx.globalAlpha = 1;
      }

      const labelColor = active ? p.hi : p.fg;
      this.engine.text(label,    bx + BW / 2, bY + bH / 2 - 14, 13, labelColor, 'center');
      if (sublabel) {
        this.engine.text(sublabel, bx + BW / 2, bY + bH / 2 + 2,  10, active ? p.warn : p.dim, 'center');
      }
    };

    // LEFT button: nose tilts right (CW)    RIGHT button: nose tilts left (CCW)
    drawBtn(0,   '◄ TILT R',  'NOSE RIGHT', this._thrustRcsL);
    drawBtn(120, 'THRUST',    null,          this._thrustMain);
    drawBtn(240, 'TILT L ►', 'NOSE LEFT',  this._thrustRcsR);

    // Dividers
    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(120, bY); ctx.lineTo(120, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(240, bY); ctx.lineTo(240, H); ctx.stroke();
  }

  // ---- Stage Clear overlay ----
  _drawClearScreen(ctx) {
    const p  = P();
    const cx = W / 2;
    const cy = H / 2;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, 0.92));
    this.engine.rect(20, cy - 130, W - 40, 270, p.dark);
    this.engine.stroke(20, cy - 130, W - 40, 270, p.mid, 2);
    ctx.restore();

    this.engine.text('STAGE CLEAR!',                cx, cy - 116, 24, p.hi,   'center');
    this.engine.text('ST.' + this.stage + ' COMPLETE', cx, cy - 86, 13, p.mid, 'center');

    this.engine.text('STAGE SCORE',                 cx, cy - 62,  12, p.dim,  'center');
    this.engine.text('+' + (this._stageScore || 0), cx, cy - 46,  20, p.fg,   'center');
    this.engine.text('GUIDE BONUS +' + (this._guideBonus || 0), cx, cy - 22, 11, p.warn, 'center');

    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(40, cy + 4); ctx.lineTo(W - 40, cy + 4); ctx.stroke();

    this.engine.text('TOTAL SCORE',                 cx, cy + 14,  12, p.dim,  'center');
    this.engine.text('' + this.totalScore,          cx, cy + 30,  24, p.hi,   'center');
    this.engine.text('BEST ' + (this.high || 0),    cx, cy + 60,  14, p.mid,  'center');

    this.engine.text('TAP → STAGE ' + (this.stage + 1), cx, cy + 90, 14, p.fg,  'center');
    this.engine.text('BACK → MENU', cx, cy + 110, 11, p.dim, 'center');
  }

  // ---- Game Over overlay ----
  _drawGameOver(ctx) {
    const p  = P();
    const cx = W / 2;
    const cy = H / 2;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, 0.92));
    this.engine.rect(20, cy - 120, W - 40, 250, p.dark);
    this.engine.stroke(20, cy - 120, W - 40, 250, p.bad, 2);
    ctx.restore();

    this.engine.text('GAME OVER',               cx, cy - 106, 28, p.bad,  'center');
    this.engine.text('CRASHED! ST.' + this.stage, cx, cy - 74, 13, p.warn, 'center');

    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(40, cy - 54); ctx.lineTo(W - 40, cy - 54); ctx.stroke();

    this.engine.text('FINAL SCORE',             cx, cy - 40,  12, p.dim,  'center');
    this.engine.text('' + this.totalScore,       cx, cy - 24,  26, p.fg,   'center');

    ctx.beginPath(); ctx.moveTo(40, cy + 8); ctx.lineTo(W - 40, cy + 8); ctx.stroke();

    this.engine.text('BEST',                    cx, cy + 18,  11, p.dim,  'center');
    this.engine.text('' + (this.high || 0),     cx, cy + 34,  22, p.hi,   'center');

    this.engine.text('TAP TO RETRY',            cx, cy + 68,  14, p.fg,   'center');
    this.engine.text('BACK → MENU',        cx, cy + 88,  11, p.dim,  'center');
  }
}
