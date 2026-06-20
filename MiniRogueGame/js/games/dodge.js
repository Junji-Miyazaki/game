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

// ---- Difficulty caps (plateau after ramp) ----
const CAP_SPEED      = 165;   // px/s max missile speed
const CAP_TURN_RATE  = 1.0;   // rad/s max (keeps loops wide)
const CAP_VOLLEY     = 4;     // max missiles per volley
const MIN_INTERVAL   = 0.9;   // s minimum spawn interval

// ---- Lull system ----
const LULL_EVERY     = 8.0;   // s between lulls (within active spawning) — more frequent breathers
const LULL_DUR       = 2.5;   // s duration of lull
const LULL_MSG_DUR   = 1.8;   // s to show "WAVE CLEAR" text

// ---- Chaff/Flare constants ----
const FLARE_START    = 3;     // initial chaff count
const FLARE_REGEN_T  = 25;    // s between chaff regeneration
const FLARE_MAX      = 5;     // max storable chaff

// Chaff decoy behavior
const CHAFF_LIFETIME     = 4.0;   // s chaff stays active redirecting all missiles (was 3s)
const CHAFF_EXPLODE_R    = 170;   // px — blast radius at end-of-life (larger, was 110)
const CHAFF_DEPLOY_DIST  = 130;   // px ahead/right of ship (toward missile origin)
const CHAFF_FLY_DIST     = 80;    // px the chaff visually flies out before settling
const CHAFF_TURN_BOOST   = 6.0;   // multiplier on missile turn rate while homing to chaff

// ---- Valkyrie constants ----
const VALKYRIE_CHARGE_TIME  = 20;    // s to fill energy gauge from 0
const VALKYRIE_DURATION     = 14.0;  // s of Valkyrie mode (was 9.5s)
const VALKYRIE_AUTO_LIMIT   = 50;    // max missiles auto-destroyed per activation (was 22)
const VALKYRIE_BEAM_SPD     = 600;   // px/s beam travel
const VALKYRIE_SHOOT_CD     = 0.06;  // s between auto-shots (was 0.18 — much faster)
const VALKYRIE_SPRAY_COUNT  = 3;     // beams per volley (spray multiple targets)
const VALKYRIE_SPRAY_SPREAD = 0.18;  // rad — angular spread added to extra spray beams

// ---- On-screen button rects (logical coords) ----
const BTN_FLARE = { x: 8, y: H - 70, w: 58, h: 52 };
const BTN_VALKYRIE = { x: W - 66, y: H - 70, w: 58, h: 52 };

// ---- Parallax starfield layer config ----
const STAR_LAYERS = [
  { count: 80, speed:  18, size: 0.6, alpha: 0.25 },
  { count: 50, speed:  45, size: 1.0, alpha: 0.40 },
  { count: 30, speed:  90, size: 1.5, alpha: 0.60 },
  { count: 15, speed: 160, size: 2.2, alpha: 0.85 },
];

// ---- Chaff pickup item config ----
const PICKUP_SPAWN_INTERVAL = 18;  // s between pickup spawns
const PICKUP_SPEED          = 55;  // px/s drift leftward
const PICKUP_HIT_R          = 12;  // px pickup collection radius

// ---- Utility ----
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function angleDiff(to, from) {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function inRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
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
  constructor(x, y, angle, speed, turnRate, homingBudget) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = speed;
    this.turnRate = turnRate;

    this.homingBudget = homingBudget;
    this.homingUsed   = 0;
    this.homing       = true;

    this.disengageTime = 0;
    this.selfDestruct  = Math.random() < 0.4;
    this.exploding     = false;
    this.explodeTimer  = 0;
    this.explodeDur    = 0.5;

    this.trail = [];
    this.age   = 0;
    this.dead  = false;
    this._oob  = 0;
  }

  update(dt, targetX, targetY) {
    if (this.dead) return;
    this.age += dt;

    if (this.homing) {
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
        this._recordTrail();
        return;
      }
    }

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    this._recordTrail();

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

// ---- Auto-fire beam (Valkyrie mode) ----
class Beam {
  constructor(x, y, tx, ty) {
    this.x  = x;
    this.y  = y;
    const dx = tx - x;
    const dy = ty - y;
    const d  = Math.sqrt(dx * dx + dy * dy) || 1;
    this.vx = (dx / d) * VALKYRIE_BEAM_SPD;
    this.vy = (dy / d) * VALKYRIE_BEAM_SPD;
    this.angle = Math.atan2(dy, dx);
    this.dead  = false;
    this.age   = 0;
    this.trail = [{ x, y }];
  }
  update(dt) {
    if (this.dead) return;
    this.age += dt;
    this.x   += this.vx * dt;
    this.y   += this.vy * dt;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 10) this.trail.shift();
    if (this.age > 1.2 || this.x < -20 || this.x > W + 20 || this.y < PLAY_TOP - 20 || this.y > PLAY_BOTTOM + 20) {
      this.dead = true;
    }
  }
}

// ---- Hit spark effect ----
class Spark {
  constructor(x, y) {
    this.x   = x;
    this.y   = y;
    this.t   = 0;
    this.dur = 0.35;
    this.dead = false;
  }
  update(dt) {
    this.t += dt;
    if (this.t >= this.dur) this.dead = true;
  }
}

// ---- Chaff resupply pickup item ----
class ChaffPickup {
  constructor() {
    // Spawn from the right edge at a random y within the play area
    this.x    = W + 14;
    this.y    = PLAY_TOP + 30 + Math.random() * (PLAY_BOTTOM - PLAY_TOP - 60);
    this.age  = 0;
    this.dead = false;
    // Slight vertical drift for variety
    this.vy   = (Math.random() - 0.5) * 20;
  }
  update(dt) {
    if (this.dead) return;
    this.age += dt;
    this.x   -= PICKUP_SPEED * dt;
    this.y   += this.vy * dt;
    // Bounce off play area top/bottom
    if (this.y < PLAY_TOP + 16)        this.vy =  Math.abs(this.vy);
    if (this.y > PLAY_BOTTOM - 16)     this.vy = -Math.abs(this.vy);
    // Remove if drifted fully off-screen to the left
    if (this.x < -20) this.dead = true;
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

    // Parallax starfield
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
    this.spawnTimer    = 1.2;   // brief delay before first volley
    this.spawnInterval = 1.8;
    this.volleyCount   = 1;

    // Lull system — tracks time spent actively spawning
    this.activeSpawnTime = 0;   // cumulative time outside lulls
    this.inLull          = false;
    this.lullTimer       = 0;
    this.lullMsgTimer    = 0;

    // Explosion effect (fighter death)
    this.explosion = null;

    // Game over flag
    this.dead = false;

    // Life system
    this.lives   = 5;
    this._invuln = 0;

    // Keyboard input state
    this.keyDir = { x: 0, y: 0 };

    // Engine flame animation
    this.flameTick = 0;

    // ---- CHAFF/FLARE system ----
    this.flares    = FLARE_START;
    this.flareRegenTimer = 0;     // timer for slow regen
    // Active chaff decoy: { x, y, t, lifetime, sparks: [{angle,dist,t}] }
    this.chaff = null;
    // Chaff end-of-life explosion flash: { x, y, t, dur }
    this.chaffExplode = null;

    // ---- VALKYRIE system ----
    this.energy       = 0;        // 0..1 normalized
    this.valkyrieMode = false;
    this.valkyrieTimer = 0;       // time remaining in Valkyrie mode
    this.valkyrieKills = 0;       // missiles destroyed this activation
    this.valkyrieShootTimer = 0;  // cooldown between auto-shots
    this.beams  = [];             // active Beam instances
    this.sparks = [];             // hit spark VFX

    // ---- Chaff pickup items ----
    this.pickups        = [];
    this.pickupTimer    = PICKUP_SPAWN_INTERVAL * 0.5; // first one comes a bit sooner
  }

  onInput(action, data) {
    if (this.dead) {
      if (action === 'back')    { this.engine.toMenu(); return; }
      if (action === 'tap') {
        // don't retry if tapped on a button area (though game is over, be safe)
        this.enter(); return;
      }
      if (action === 'confirm') { this.enter(); return; }
      return;
    }
    if (action === 'back') { this.engine.toMenu(); return; }

    if (action === 'up')    { this.keyDir.y = -1; }
    if (action === 'down')  { this.keyDir.y =  1; }
    if (action === 'left')  { this.keyDir.x = -1; }
    if (action === 'right') { this.keyDir.x =  1; }

    // 'confirm' (Space/Enter) => deploy flare
    if (action === 'confirm') {
      this._deployFlare();
      return;
    }

    // 'tap' => check on-screen buttons
    if (action === 'tap' && data) {
      const { x, y } = data;
      if (inRect(x, y, BTN_FLARE)) {
        this._deployFlare();
        return;
      }
      if (inRect(x, y, BTN_VALKYRIE)) {
        this._activateValkyrie();
        return;
      }
      // Normal tap elsewhere — not used for anything in this game
    }
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
      // Only follow pointer when NOT pressing a button
      const overFlare    = inRect(ptr.x, ptr.y, BTN_FLARE);
      const overValkyrie = inRect(ptr.x, ptr.y, BTN_VALKYRIE);
      if (!overFlare && !overValkyrie) {
        const tdx  = ptr.x - this.fx;
        const tdy  = ptr.y - this.fy;
        const dist = Math.sqrt(tdx * tdx + tdy * tdy);
        if (dist > 1) {
          const step = Math.min(FIGHTER_FOLLOW * dt, dist);
          this.fx += (tdx / dist) * step;
          this.fy += (tdy / dist) * step;
        }
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

    // ---- Lull management ----
    if (this.inLull) {
      this.lullTimer    -= dt;
      this.lullMsgTimer -= dt;
      if (this.lullTimer <= 0) {
        this.inLull = false;
        this.lullTimer = 0;
      }
    }

    // ---- Missile spawn ----
    if (!this.inLull) {
      this.activeSpawnTime += dt;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this._spawnVolley();
        const t = this.elapsed;
        // Capped escalation
        this.spawnInterval = Math.max(MIN_INTERVAL, 1.8 - t * 0.020);
        this.volleyCount   = Math.min(CAP_VOLLEY, 1 + Math.floor(t / 8));
        this.spawnTimer    = this.spawnInterval;
      }

      // Trigger lull every LULL_EVERY seconds of active spawning
      if (this.activeSpawnTime >= LULL_EVERY) {
        this.activeSpawnTime = 0;
        this.inLull          = true;
        this.lullTimer       = LULL_DUR;
        this.lullMsgTimer    = LULL_MSG_DUR;
      }
    }

    // ---- Chaff decoy update ----
    if (this.chaff) {
      this.chaff.t += dt;
      // Animate spark particles on the chaff
      for (const sp of this.chaff.sparks) sp.t += dt;

      if (this.chaff.t >= this.chaff.lifetime) {
        // Chaff explodes — destroy missiles within generous radius
        const cx = this.chaff.x, cy = this.chaff.y;
        for (const m of this.missiles) {
          if (m.dead) continue;
          const dx = m.x - cx, dy = m.y - cy;
          if (Math.sqrt(dx * dx + dy * dy) <= CHAFF_EXPLODE_R) {
            m.dead = true;
            this.sparks.push(new Spark(m.x, m.y));
          }
        }
        // Leave a brief explosion flash, then clear chaff
        this.chaff.exploding = true;
        this.chaff.explodeT  = 0;
        this.chaff.explodeDur = 0.5;
        // We store it as chaffExplode so chaff homing stops immediately
        this.chaffExplode = { x: cx, y: cy, t: 0, dur: 0.5 };
        this.chaff = null;
      }
    }
    if (this.chaffExplode) {
      this.chaffExplode.t += dt;
      if (this.chaffExplode.t >= this.chaffExplode.dur) this.chaffExplode = null;
    }

    // ---- Missile update — home toward chaff if active (with turn boost), else toward player ----
    const missileTargetX  = this.chaff ? this.chaff.x : this.fx;
    const missileTargetY  = this.chaff ? this.chaff.y : this.fy;
    const chaffActive     = !!this.chaff;
    for (const m of this.missiles) {
      // Temporarily boost turn rate while chaff is pulling them in
      const savedTurnRate = m.turnRate;
      if (chaffActive && m.homing) {
        m.turnRate = Math.min(m.turnRate * CHAFF_TURN_BOOST, Math.PI * 3);
      }
      m.update(dt, missileTargetX, missileTargetY);
      m.turnRate = savedTurnRate;  // restore original (only boosted during chaff)
    }
    this.missiles = this.missiles.filter(m => !m.dead);

    // ---- Chaff regen (1 per FLARE_REGEN_T s, up to max) ----
    if (this.flares < FLARE_MAX) {
      this.flareRegenTimer += dt;
      if (this.flareRegenTimer >= FLARE_REGEN_T) {
        this.flareRegenTimer -= FLARE_REGEN_T;
        this.flares = Math.min(FLARE_MAX, this.flares + 1);
      }
    } else {
      this.flareRegenTimer = 0;
    }

    // ---- Energy charge (charges even in Valkyrie mode for recharge after) ----
    if (!this.valkyrieMode) {
      this.energy = clamp(this.energy + dt / VALKYRIE_CHARGE_TIME, 0, 1);
    }

    // ---- Valkyrie mode update ----
    if (this.valkyrieMode) {
      this.valkyrieTimer -= dt;
      // Drain energy proportionally to duration
      this.energy = clamp(this.energy - dt / VALKYRIE_DURATION, 0, 1);

      if (this.valkyrieTimer <= 0 || this.valkyrieKills >= VALKYRIE_AUTO_LIMIT || this.energy <= 0) {
        this.valkyrieMode  = false;
        this.valkyrieTimer = 0;
        this.energy        = 0;
        // Start recharging fresh
      }

      // Auto-fire: spray VALKYRIE_SPRAY_COUNT beams per volley at different targets
      if (this.valkyrieMode && this.valkyrieKills < VALKYRIE_AUTO_LIMIT) {
        this.valkyrieShootTimer -= dt;
        if (this.valkyrieShootTimer <= 0) {
          this.valkyrieShootTimer = VALKYRIE_SHOOT_CD;
          // Collect live missiles sorted by distance
          const liveMissiles = this.missiles.filter(m => !m.dead && !m.exploding);
          liveMissiles.sort((a, b) => {
            const dxa = a.x - this.fx, dya = a.y - this.fy;
            const dxb = b.x - this.fx, dyb = b.y - this.fy;
            return (dxa * dxa + dya * dya) - (dxb * dxb + dyb * dyb);
          });
          // Fire up to VALKYRIE_SPRAY_COUNT beams — primary target + others with slight spread
          const targets = liveMissiles.slice(0, VALKYRIE_SPRAY_COUNT);
          for (let si = 0; si < targets.length; si++) {
            const tgt = targets[si];
            // For extra beams (si > 0) add random angular spread so they fan out
            if (si === 0) {
              this.beams.push(new Beam(this.fx, this.fy, tgt.x, tgt.y));
            } else {
              const spread = (Math.random() - 0.5) * VALKYRIE_SPRAY_SPREAD * 2;
              const baseAngle = Math.atan2(tgt.y - this.fy, tgt.x - this.fx) + spread;
              const dist = 200;
              this.beams.push(new Beam(
                this.fx, this.fy,
                this.fx + Math.cos(baseAngle) * dist,
                this.fy + Math.sin(baseAngle) * dist,
              ));
            }
          }
          // If no targets but mode is still active, fire a forward spray burst
          if (targets.length === 0) {
            for (let si = 0; si < VALKYRIE_SPRAY_COUNT; si++) {
              const ang = (Math.random() - 0.5) * Math.PI * 0.5;
              this.beams.push(new Beam(
                this.fx, this.fy,
                this.fx + Math.cos(ang) * 300,
                this.fy + Math.sin(ang) * 300,
              ));
            }
          }
        }
      }
    }

    // ---- Beam update + beam-missile collision ----
    for (const b of this.beams) {
      b.update(dt);
      if (b.dead) continue;
      for (const m of this.missiles) {
        if (m.dead || m.exploding) continue;
        const dx = b.x - m.x;
        const dy = b.y - m.y;
        if (Math.sqrt(dx * dx + dy * dy) < MISSILE_R + 4) {
          m.dead = true;
          b.dead = true;
          this.sparks.push(new Spark(m.x, m.y));
          if (this.valkyrieMode) this.valkyrieKills++;
          break;
        }
      }
    }
    this.beams  = this.beams.filter(b => !b.dead);
    this.sparks.forEach(s => s.update(dt));
    this.sparks = this.sparks.filter(s => !s.dead);

    // ---- Chaff pickup spawn + update ----
    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0) {
      this.pickupTimer = PICKUP_SPAWN_INTERVAL;
      this.pickups.push(new ChaffPickup());
    }
    for (const pk of this.pickups) pk.update(dt);
    // Collision: fighter touches pickup -> +1 chaff
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      const pdx = pk.x - this.fx;
      const pdy = pk.y - this.fy;
      if (Math.sqrt(pdx * pdx + pdy * pdy) < HIT_R + PICKUP_HIT_R) {
        pk.dead = true;
        this.flares = Math.min(FLARE_MAX, this.flares + 1);
        // Small positive feedback sound
        try { this.engine.audio.select ? this.engine.audio.select() : this.engine.audio.bad(); } catch (_) {}
        // Spawn a spark at pickup location as visual feedback
        this.sparks.push(new Spark(pk.x, pk.y));
      }
    }
    this.pickups = this.pickups.filter(pk => !pk.dead);

    // ---- Invuln countdown ----
    if (this._invuln > 0) this._invuln = Math.max(0, this._invuln - dt);

    // ---- Collision detection (skip if invuln or in Valkyrie — Valkyrie has slight shield feel) ----
    if (this._invuln <= 0 && !this.valkyrieMode) {
      for (const m of this.missiles) {
        if (m.dead || m.exploding) continue;
        const dx   = m.x - this.fx;
        const dy   = m.y - this.fy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < HIT_R + MISSILE_R) {
          m.dead = true;
          this.lives -= 1;
          if (this.lives <= 0) {
            this._gameOver(m.x, m.y);
            return;
          }
          this._invuln = 1.0;
          this.engine.audio.bad();
          this.hitFx = { x: this.fx, y: this.fy, t: 0, dur: 0.4 };
          break;
        }
      }
    }
    if (this.hitFx) {
      this.hitFx.t += dt;
      if (this.hitFx.t > this.hitFx.dur) this.hitFx = null;
    }
  }

  _nearestMissile() {
    let best = null;
    let bestDist = Infinity;
    for (const m of this.missiles) {
      if (m.dead || m.exploding) continue;
      const dx = m.x - this.fx;
      const dy = m.y - this.fy;
      const d  = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = m; }
    }
    return best;
  }

  _deployFlare() {
    if (this.flares <= 0) return;
    if (this.chaff) return;  // already a chaff active
    this.flares--;
    this.flareRegenTimer = 0;  // reset regen timer on use

    // Launch chaff to the right/ahead of the ship (toward missile origin),
    // clamped to the play area.
    const cx = clamp(this.fx + CHAFF_DEPLOY_DIST, PLAY_LEFT + 20, PLAY_RIGHT - 20);
    const cy = clamp(this.fy + (Math.random() - 0.5) * 60, PLAY_TOP + 20, PLAY_BOTTOM - 20);

    // Generate spark particles for the chaff visual
    const sparks = [];
    for (let i = 0; i < 12; i++) {
      sparks.push({
        angle: Math.random() * Math.PI * 2,
        dist:  10 + Math.random() * 20,
        speed: 0.8 + Math.random() * 0.6,  // rotation speed multiplier
        t:     Math.random() * Math.PI * 2, // phase offset for flicker
      });
    }

    this.chaff = {
      x:        cx,
      y:        cy,
      t:        0,
      lifetime: CHAFF_LIFETIME,
      sparks,
    };

    try { this.engine.audio.bad(); } catch (_) {}
  }

  _activateValkyrie() {
    if (this.energy < 1.0) return;   // not fully charged
    if (this.valkyrieMode) return;    // already active
    this.valkyrieMode    = true;
    this.valkyrieTimer   = VALKYRIE_DURATION;
    this.valkyrieKills   = 0;
    this.valkyrieShootTimer = 0;
    // Energy will drain in update
  }

  _spawnVolley() {
    const t = this.elapsed;
    // Capped speed
    const baseSpeed    = Math.min(CAP_SPEED, 90 + t * 1.5);
    // Capped turn rate
    const baseTurnRate = Math.min(CAP_TURN_RATE, 0.55 + t * 0.012);
    // Homing budget still capped at 6s
    const baseHomingBudget = clamp(2.0 + t * 0.06, 2.0, 6.0);

    const count = this.volleyCount;
    for (let i = 0; i < count; i++) {
      const sy          = PLAY_TOP + 30 + Math.random() * (PLAY_BOTTOM - PLAY_TOP - 60);
      const angleSpread = (Math.random() - 0.5) * (Math.PI / 3);
      const initAngle   = Math.PI + angleSpread;
      const speed       = clamp(baseSpeed    * (0.8 + Math.random() * 0.5), 60, CAP_SPEED);
      const turnRate    = clamp(baseTurnRate * (0.6 + Math.random() * 0.8), 0.3, CAP_TURN_RATE);
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

    // ---- Valkyrie beams ----
    if (this.beams.length > 0) {
      this._drawBeams(ctx, p);
    }

    // ---- Spark hit effects ----
    for (const s of this.sparks) {
      this._drawSpark(ctx, s, p);
    }

    // ---- Chaff decoy + chaff explosion flash ----
    if (this.chaff) {
      this._drawChaff(ctx, this.chaff, p);
    }
    if (this.chaffExplode) {
      this._drawChaffExplosion(ctx, this.chaffExplode, p);
    }

    // ---- Chaff pickup items ----
    for (const pk of this.pickups) {
      this._drawChaffPickup(ctx, pk, p);
    }

    // ---- Fighter ----
    const blink = this._invuln > 0 && (Math.floor(this._invuln * 12) % 2 === 0);
    if ((!this.dead && !blink) || (this.explosion && this.explosion.t < 0.15)) {
      if (this.valkyrieMode) {
        this._drawFighterValkyrie(ctx, this.fx, this.fy, p);
      } else {
        this._drawFighter(ctx, this.fx, this.fy, p);
      }
    }

    // ---- Hit effect ----
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

    // ---- Lull "WAVE CLEAR" indicator ----
    if (this.lullMsgTimer > 0) {
      const alpha = clamp(Math.min(this.lullMsgTimer, LULL_DUR - this.lullTimer) * 2.5, 0, 1);
      const savedA = ctx.globalAlpha;
      ctx.globalAlpha = clamp(alpha * 0.65, 0, 1);
      this.engine.text('-- WAVE CLEAR --', W / 2, PLAY_TOP + 20, 13, p.dim, 'center');
      ctx.globalAlpha = clamp(savedA, 0, 1);
    }

    // ---- HUD ----
    this._drawHUD(ctx, p);

    // ---- On-screen buttons ----
    this._drawButtons(ctx, p);

    // ---- Game over overlay ----
    if (this.dead) {
      this._drawGameOver(ctx, p);
    }
  }

  _drawHUD(ctx, p) {
    // Title + time
    this.engine.text('DODGE', 52, 10, 20, p.fg, 'left');
    const secStr = (this.elapsed).toFixed(1) + 's';
    this.engine.text('TIME ' + secStr, 52, 34, 14, p.mid, 'left');

    // Best (top right)
    const hiSec = (this.high / 100).toFixed(1) + 's';
    this.engine.text('BEST ' + hiSec, W - 8, 10, 14, p.dim, 'right');

    // Lives (small plane icons, top right row 2)
    for (let i = 0; i < this.lives; i++) {
      const lx = W - 12 - i * 13;
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.moveTo(lx, 30); ctx.lineTo(lx - 9, 34); ctx.lineTo(lx, 38);
      ctx.closePath();
      ctx.fill();
    }

    // Energy bar (bottom center, above buttons)
    const barW = W - 90;  // leave room for buttons on sides
    const barX = 45;
    const barY = H - 80;
    const barH = 6;
    const savedA = ctx.globalAlpha;

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = p.dim;
    ctx.fillRect(barX, barY, barW, barH);

    const fillW = Math.floor(barW * clamp(this.energy, 0, 1));
    if (this.valkyrieMode) {
      // Pulsing gold when active
      const pulse = 0.7 + 0.3 * Math.sin(this.elapsed * 12);
      ctx.globalAlpha = clamp(pulse, 0, 1);
      ctx.fillStyle = p.warn;
    } else if (this.energy >= 1) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.warn;
    } else {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = p.mid;
    }
    if (fillW > 0) ctx.fillRect(barX, barY, fillW, barH);

    // Energy label
    ctx.globalAlpha = 0.7;
    const energyLabel = this.valkyrieMode ? 'VLK' : this.energy >= 1 ? 'FULL' : 'NRG';
    this.engine.text(energyLabel, barX + barW / 2, barY - 13, 10, p.mid, 'center');

    ctx.globalAlpha = clamp(savedA, 0, 1);
  }

  _drawButtons(ctx, p) {
    const savedA = ctx.globalAlpha;

    // ---- FLARE button (bottom-left) ----
    const bf = BTN_FLARE;
    const flareAlpha = this.flares > 0 ? 0.85 : 0.30;
    ctx.globalAlpha = flareAlpha;
    ctx.fillStyle = p.dark;
    ctx.fillRect(bf.x, bf.y, bf.w, bf.h);
    ctx.strokeStyle = this.flares > 0 ? p.warn : p.dim;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bf.x, bf.y, bf.w, bf.h);

    ctx.globalAlpha = flareAlpha;
    this.engine.text('CHF', bf.x + bf.w / 2, bf.y + 6, 12, p.warn, 'center');
    this.engine.text(`x${this.flares}`, bf.x + bf.w / 2, bf.y + 24, 16, p.hi, 'center');

    // Regen progress pip
    if (this.flares < FLARE_MAX) {
      const regenFrac = clamp(this.flareRegenTimer / FLARE_REGEN_T, 0, 1);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = p.dim;
      ctx.fillRect(bf.x + 4, bf.y + bf.h - 8, bf.w - 8, 4);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = p.warn;
      ctx.fillRect(bf.x + 4, bf.y + bf.h - 8, Math.floor((bf.w - 8) * regenFrac), 4);
    }

    // ---- VALKYRIE button (bottom-right) ----
    const bv = BTN_VALKYRIE;
    const valkReady  = this.energy >= 1.0 && !this.valkyrieMode;
    const valkActive = this.valkyrieMode;
    const valkAlpha  = (valkReady || valkActive) ? 0.9 : 0.30;

    ctx.globalAlpha = valkAlpha;
    ctx.fillStyle = p.dark;
    ctx.fillRect(bv.x, bv.y, bv.w, bv.h);
    ctx.strokeStyle = valkActive ? p.warn : valkReady ? p.hi : p.dim;
    ctx.lineWidth = valkActive ? 2 : 1.5;
    ctx.strokeRect(bv.x, bv.y, bv.w, bv.h);

    ctx.globalAlpha = valkAlpha;
    const vLabel = valkActive ? 'VLK!' : 'VLK';
    const vColor = valkActive ? p.warn : valkReady ? p.hi : p.dim;
    this.engine.text(vLabel, bv.x + bv.w / 2, bv.y + 6, 12, vColor, 'center');
    const vSub = valkActive
      ? Math.ceil(this.valkyrieTimer) + 's'
      : valkReady ? 'RDY' : '';
    if (vSub) {
      this.engine.text(vSub, bv.x + bv.w / 2, bv.y + 24, 14, vColor, 'center');
    }

    ctx.globalAlpha = clamp(savedA, 0, 1);
    ctx.lineWidth = 1;
  }

  _drawBeams(ctx, p) {
    const savedA   = ctx.globalAlpha;
    const savedCap = ctx.lineCap;
    try {
      ctx.lineCap   = 'round';
      ctx.lineWidth = 2.5;
      for (const b of this.beams) {
        if (!b.trail || b.trail.length < 2) continue;
        for (let i = 1; i < b.trail.length; i++) {
          const prev = b.trail[i - 1];
          const cur  = b.trail[i];
          if (!prev || !cur) continue;
          const frac = i / b.trail.length;
          ctx.globalAlpha = clamp(frac * 0.9, 0, 1);
          ctx.strokeStyle = p.warn;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(cur.x, cur.y);
          ctx.stroke();
        }
        // Bright tip
        ctx.globalAlpha = clamp(0.95, 0, 1);
        ctx.fillStyle = p.hi;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } finally {
      ctx.globalAlpha = clamp(savedA, 0, 1);
      ctx.lineCap     = savedCap;
      ctx.lineWidth   = 1;
    }
  }

  _drawSpark(ctx, s, p) {
    if (!s) return;
    const frac    = clamp(s.t / s.dur, 0, 1);
    const savedA  = ctx.globalAlpha;
    try {
      const r = 2 + frac * 12;
      ctx.globalAlpha = clamp((1 - frac) * 0.9, 0, 1);
      ctx.strokeStyle = p.warn;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, r), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = clamp((1 - frac * 1.5) * 0.8, 0, 1);
      ctx.fillStyle   = p.hi;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.5, r * 0.3), 0, Math.PI * 2);
      ctx.fill();
    } finally {
      ctx.globalAlpha = clamp(savedA, 0, 1);
      ctx.lineWidth   = 1;
    }
  }

  // ---- Chaff decoy: bright sparkling/burning lure, draws all missiles toward it ----
  _drawChaff(ctx, ch, p) {
    if (!ch) return;
    const savedA = ctx.globalAlpha;
    const frac   = clamp(ch.t / ch.lifetime, 0, 1);
    // Flicker intensity: fast sine wave
    const flicker = 0.55 + 0.45 * Math.sin(ch.t * 28);
    try {
      // Faint attraction ring (grows as lifetime ticks down — shows danger zone)
      const ringR = 30 + frac * (CHAFF_EXPLODE_R - 30);
      ctx.globalAlpha = clamp(0.18 + 0.1 * Math.sin(ch.t * 6), 0, 1);
      ctx.strokeStyle = p.warn;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(ch.x, ch.y, ringR, 0, Math.PI * 2);
      ctx.stroke();

      // Outer glow
      ctx.globalAlpha = clamp(flicker * 0.35, 0, 1);
      ctx.fillStyle   = p.warn;
      ctx.beginPath();
      ctx.arc(ch.x, ch.y, 16, 0, Math.PI * 2);
      ctx.fill();

      // Core bright dot
      ctx.globalAlpha = clamp(flicker * 0.95, 0, 1);
      ctx.fillStyle   = p.hi;
      ctx.beginPath();
      ctx.arc(ch.x, ch.y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Inner hot-orange nucleus
      ctx.globalAlpha = clamp(flicker * 0.8, 0, 1);
      ctx.fillStyle   = p.warn;
      ctx.beginPath();
      ctx.arc(ch.x, ch.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Spark particles orbiting + drifting
      for (const sp of ch.sparks) {
        const spFrac  = clamp(sp.t / (ch.lifetime * 1.2), 0, 1);
        const spAngle = sp.angle + sp.t * sp.speed * 2.5;
        const spDist  = sp.dist * (0.6 + 0.4 * Math.sin(sp.t * 3 + sp.t));
        const sx = ch.x + Math.cos(spAngle) * spDist;
        const sy = ch.y + Math.sin(spAngle) * spDist;
        ctx.globalAlpha = clamp((1 - spFrac) * flicker * 0.9, 0, 1);
        ctx.fillStyle   = Math.sin(sp.t * 7) > 0 ? p.hi : p.warn;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Countdown pulse ring — urgency indicator
      const pulseR = 8 + Math.sin(ch.t * (6 + frac * 10)) * 6;
      ctx.globalAlpha = clamp(0.5 + frac * 0.4, 0, 1);
      ctx.strokeStyle = frac > 0.7 ? p.bad : p.warn;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(ch.x, ch.y, Math.max(1, pulseR), 0, Math.PI * 2);
      ctx.stroke();

    } finally {
      ctx.globalAlpha = clamp(savedA, 0, 1);
      ctx.lineWidth   = 1;
    }
  }

  // ---- Chaff end-of-life explosion burst ----
  _drawChaffExplosion(ctx, ex, p) {
    if (!ex) return;
    const frac   = clamp(ex.t / ex.dur, 0, 1);
    const savedA = ctx.globalAlpha;
    try {
      // Expanding shockwave ring
      const r1 = CHAFF_EXPLODE_R * frac;
      ctx.globalAlpha = clamp((1 - frac) * 0.9, 0, 1);
      ctx.strokeStyle = p.hi;
      ctx.lineWidth   = 3.5;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, Math.max(1, r1), 0, Math.PI * 2);
      ctx.stroke();

      // Second ring (warm)
      const r2 = CHAFF_EXPLODE_R * 0.65 * frac;
      ctx.globalAlpha = clamp((1 - frac * 1.5) * 0.75, 0, 1);
      ctx.strokeStyle = p.warn;
      ctx.lineWidth   = 5;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, Math.max(1, r2), 0, Math.PI * 2);
      ctx.stroke();

      // Central flash
      if (frac < 0.3) {
        ctx.globalAlpha = clamp((0.3 - frac) / 0.3 * 0.7, 0, 1);
        ctx.fillStyle   = p.hi;
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, 30, 0, Math.PI * 2);
        ctx.fill();
      }
    } finally {
      ctx.globalAlpha = clamp(savedA, 0, 1);
      ctx.lineWidth   = 1;
    }
  }

  // ---- Parallax starfield ----
  _drawStars(ctx, p) {
    const savedAlpha = ctx.globalAlpha;
    try {
      for (const layer of this.starLayers) {
        const { cfg, stars } = layer;
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

      let globalFade = 1.0;
      if (!m.homing) {
        globalFade = clamp(1 - m.disengageTime * 0.12, 0.08, 1);
      }
      if (m.exploding) {
        globalFade *= clamp(1 - m.explodeTimer / m.explodeDur, 0, 1) * 0.6;
      }

      ctx.strokeStyle = p.hi;
      ctx.lineWidth   = 1.2;

      for (let i = 1; i < len; i++) {
        const prev = trail[i - 1];
        const cur  = trail[i];
        if (!prev || !cur) continue;
        const frac  = i / len;
        const alpha = clamp((frac * 0.85 + 0.06) * globalFade, 0, 1);
        if (alpha < 0.005) continue;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.stroke();
      }

      if (!m.exploding) {
        this._drawMissileHead(ctx, m, p);
      }

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

  _drawMissileHead(ctx, m, p) {
    if (!m) return;
    const savedAlpha = ctx.globalAlpha;
    try {
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);

      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(4, -2); ctx.lineTo(4, 2);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = p.warn;
      ctx.beginPath(); ctx.rect(-4, -2, 8, 4); ctx.fill();

      ctx.fillStyle = p.hi;
      ctx.beginPath(); ctx.rect(0, -1, 4, 2); ctx.fill();

      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(-4, -2); ctx.lineTo(-8, -6); ctx.lineTo(-4, 0);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-4, 2); ctx.lineTo(-8, 6); ctx.lineTo(-4, 0);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = p.warn;
      ctx.globalAlpha = clamp(0.85, 0, 1);
      ctx.beginPath();
      ctx.moveTo(-4, -1.5); ctx.lineTo(-9, 0); ctx.lineTo(-4, 1.5);
      ctx.closePath(); ctx.fill();

      ctx.restore();
    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
    }
  }

  _drawMissileExplosion(ctx, x, y, frac, p) {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const r = 3 + frac * 18;
    const savedAlpha = ctx.globalAlpha;
    try {
      ctx.globalAlpha = clamp((1 - frac) * 0.9, 0, 1);
      ctx.strokeStyle = p.warn;
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = clamp((1 - frac * 2) * 0.8, 0, 1);
      ctx.fillStyle   = p.hi;
      ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
    }
  }

  // ---- Standard F-14 fighter ----
  _drawFighter(ctx, x, y, p) {
    const savedAlpha = ctx.globalAlpha;
    ctx.save();
    ctx.translate(x, y);
    try {
      const WHITE = p.hi, TRIM = p.mid, GLASS = p.dark;

      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.moveTo(9, -3); ctx.lineTo(-4, -16); ctx.lineTo(-8, -15); ctx.lineTo(-2, -3);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(9, 3); ctx.lineTo(-4, 16); ctx.lineTo(-8, 15); ctx.lineTo(-2, 3);
      ctx.closePath(); ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-7, -2); ctx.lineTo(-13, -10); ctx.lineTo(-15, -9); ctx.lineTo(-11, -2);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-7, 2); ctx.lineTo(-13, 10); ctx.lineTo(-15, 9); ctx.lineTo(-11, 2);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.moveTo(8, -7); ctx.lineTo(-13, -7); ctx.lineTo(-13, 7); ctx.lineTo(8, 7);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = TRIM; ctx.lineWidth = 1;
      ctx.strokeRect(-13, -7, 21, 4);
      ctx.strokeRect(-13,  3, 21, 4);

      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.moveTo(19, 0); ctx.lineTo(8, -3); ctx.lineTo(2, -5); ctx.lineTo(-2, -5);
      ctx.lineTo(-2, 5); ctx.lineTo(2, 5); ctx.lineTo(8, 3);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = TRIM; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(2, 0); ctx.stroke();

      ctx.fillStyle = GLASS;
      ctx.beginPath();
      ctx.ellipse(11, 0, 4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = TRIM;
      ctx.beginPath();
      ctx.moveTo(-4, -5); ctx.lineTo(-12, -9); ctx.lineTo(-13, -7); ctx.lineTo(-6, -4);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-4, 5); ctx.lineTo(-12, 9); ctx.lineTo(-13, 7); ctx.lineTo(-6, 4);
      ctx.closePath(); ctx.fill();

      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
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

  // ---- Valkyrie battroid (humanoid robot) — facing right, gun-arm extends right ----
  // Coordinate system: x+ = right (forward), y+ = down. Robot is ~38px wide, ~44px tall.
  //   HEAD  : small box centered around (6, -18)
  //   TORSO : main rectangle from (-4,-13) to (10,2)
  //   WAIST : narrow link at (0,-2) to (6,2)
  //   HIPS  : box (-2,2) to (8,8)
  //   LEGS  : two rects below hips, slightly angled
  //   GUN ARM (right/forward): extends from shoulder at (10,-10) forward to (26,-10)
  //   LEFT ARM : shorter, behind at (-4,-10) extending back
  //   SHOULDER FINS: swept back decorative plates
  _drawFighterValkyrie(ctx, x, y, p) {
    const savedAlpha = ctx.globalAlpha;
    ctx.save();
    ctx.translate(x, y);
    try {
      const pulse = 0.28 + 0.22 * Math.sin(this.elapsed * 14);

      // --- Aura glow ---
      ctx.globalAlpha = clamp(pulse * 0.55, 0, 1);
      ctx.fillStyle   = p.warn;
      ctx.beginPath();
      ctx.arc(2, -4, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = clamp(pulse * 0.35, 0, 1);
      ctx.fillStyle   = p.hi;
      ctx.beginPath();
      ctx.arc(2, -4, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = clamp(savedAlpha, 0, 1);

      // ---- LEGS (draw first so body overlaps) ----
      // Right leg (lower, forward-right in robot space = down-right on screen)
      ctx.fillStyle = p.mid;
      // Thigh right
      ctx.beginPath();
      ctx.moveTo(2, 8); ctx.lineTo(6, 8); ctx.lineTo(8, 18); ctx.lineTo(2, 18);
      ctx.closePath(); ctx.fill();
      // Shin right (slightly wider, knee protrusion)
      ctx.fillStyle = p.fg;
      ctx.beginPath();
      ctx.moveTo(1, 18); ctx.lineTo(8, 18); ctx.lineTo(9, 26); ctx.lineTo(0, 26);
      ctx.closePath(); ctx.fill();
      // Foot right
      ctx.fillStyle = p.mid;
      ctx.fillRect(-2, 24, 13, 4);

      // Left leg (slightly offset, mirrored vertically = up on canvas)
      ctx.fillStyle = p.mid;
      // Thigh left
      ctx.beginPath();
      ctx.moveTo(-4, 8); ctx.lineTo(0, 8); ctx.lineTo(-1, 18); ctx.lineTo(-6, 18);
      ctx.closePath(); ctx.fill();
      // Shin left
      ctx.fillStyle = p.fg;
      ctx.beginPath();
      ctx.moveTo(-7, 18); ctx.lineTo(0, 18); ctx.lineTo(-1, 26); ctx.lineTo(-8, 26);
      ctx.closePath(); ctx.fill();
      // Foot left
      ctx.fillStyle = p.mid;
      ctx.fillRect(-10, 24, 12, 4);

      // ---- HIPS ----
      ctx.fillStyle = p.warn;
      ctx.fillRect(-3, 4, 12, 6);
      // Hip highlight
      ctx.fillStyle = p.hi;
      ctx.fillRect(0, 5, 6, 2);

      // ---- WAIST ----
      ctx.fillStyle = p.mid;
      ctx.fillRect(-1, 1, 9, 5);

      // ---- TORSO (chest) ----
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      // Slightly trapezoidal chest, wider at shoulders
      ctx.moveTo(-3, 1);    // lower-left
      ctx.lineTo(10, 1);    // lower-right
      ctx.lineTo(13, -6);   // upper-right (shoulder)
      ctx.lineTo(8, -14);   // upper-chest right
      ctx.lineTo(-2, -14);  // upper-chest left
      ctx.lineTo(-6, -6);   // upper-left (shoulder)
      ctx.closePath();
      ctx.fill();

      // Chest V-fin / armor plate highlight
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.moveTo(4, -1); ctx.lineTo(9, -1); ctx.lineTo(11, -8); ctx.lineTo(6, -12); ctx.lineTo(2, -8);
      ctx.closePath(); ctx.fill();

      // Cockpit eye / chest gem — glowing
      const eyePulse = 0.7 + 0.3 * Math.sin(this.elapsed * 18);
      ctx.globalAlpha = clamp(eyePulse, 0, 1);
      ctx.fillStyle   = p.warn;
      ctx.beginPath();
      ctx.ellipse(6, -6, 4, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.ellipse(6, -6, 2.5, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);

      // ---- SHOULDER FINS (swept-back decorative plates on each shoulder) ----
      ctx.fillStyle = p.mid;
      // Right shoulder fin (top shoulder = negative y)
      ctx.beginPath();
      ctx.moveTo(8, -14); ctx.lineTo(14, -20); ctx.lineTo(6, -20); ctx.lineTo(4, -14);
      ctx.closePath(); ctx.fill();
      // Left shoulder fin
      ctx.beginPath();
      ctx.moveTo(-2, -14); ctx.lineTo(-10, -20); ctx.lineTo(-6, -20); ctx.lineTo(-4, -14);
      ctx.closePath(); ctx.fill();
      // Fin highlights
      ctx.fillStyle = p.fg;
      ctx.beginPath();
      ctx.moveTo(8, -14); ctx.lineTo(12, -18); ctx.lineTo(8, -18); ctx.lineTo(6, -14);
      ctx.closePath(); ctx.fill();

      // ---- LEFT ARM (rear, angled back) ----
      ctx.fillStyle = p.mid;
      ctx.beginPath();
      ctx.moveTo(-3, -12); ctx.lineTo(-7, -12); ctx.lineTo(-14, -6); ctx.lineTo(-11, -4); ctx.lineTo(-5, -8);
      ctx.closePath(); ctx.fill();
      // Fist / hand
      ctx.fillStyle = p.fg;
      ctx.beginPath();
      ctx.moveTo(-14, -6); ctx.lineTo(-18, -8); ctx.lineTo(-19, -4); ctx.lineTo(-14, -3);
      ctx.closePath(); ctx.fill();

      // ---- GUN ARM (right, forward — extends toward missiles) ----
      // Upper arm from shoulder
      ctx.fillStyle = p.mid;
      ctx.beginPath();
      ctx.moveTo(11, -10); ctx.lineTo(11, -14); ctx.lineTo(20, -12); ctx.lineTo(20, -8);
      ctx.closePath(); ctx.fill();
      // Forearm / gun barrel housing
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(20, -13); ctx.lineTo(20, -7); ctx.lineTo(28, -8); ctx.lineTo(28, -12);
      ctx.closePath(); ctx.fill();
      // Gun barrel (twin)
      ctx.fillStyle = p.hi;
      ctx.fillRect(25, -13, 10, 2.5);   // upper barrel
      ctx.fillRect(25, -9,  10, 2.5);   // lower barrel
      // Muzzle flash/glow during auto-fire
      const shooting = this.valkyrieShootTimer < 0.05;
      if (shooting) {
        const mPulse = 0.9;
        ctx.globalAlpha = clamp(mPulse, 0, 1);
        ctx.fillStyle   = p.warn;
        ctx.beginPath();
        ctx.arc(36, -10, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.hi;
        ctx.beginPath();
        ctx.arc(36, -10, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = clamp(savedAlpha, 0, 1);
      }

      // ---- HEAD ----
      // Neck
      ctx.fillStyle = p.mid;
      ctx.fillRect(2, -17, 5, 4);
      // Head box
      ctx.fillStyle = p.warn;
      ctx.fillRect(-1, -26, 11, 10);
      // Helmet highlight
      ctx.fillStyle = p.hi;
      ctx.fillRect(0, -25, 9, 3);
      // Visor / sensor band (glowing)
      const visorPulse = 0.8 + 0.2 * Math.sin(this.elapsed * 10);
      ctx.globalAlpha = clamp(visorPulse, 0, 1);
      ctx.fillStyle   = p.warn;
      ctx.fillRect(1, -21, 8, 3);
      ctx.fillStyle   = p.hi;
      ctx.fillRect(3, -21, 4, 2);
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
      // Side antenna
      ctx.fillStyle = p.mid;
      ctx.fillRect(8, -29, 2, 5);
      ctx.fillRect(-2, -27, 2, 4);

      // ---- THRUSTER PACK / BACKPACK (left side of robot = down on canvas) ----
      ctx.fillStyle = p.mid;
      ctx.fillRect(-8, -10, 6, 10);
      // Thruster nozzles
      const flameLen = 10 + Math.sin(this.flameTick * 22) * 5;
      for (const ey of [-7, -1]) {
        ctx.fillStyle   = p.warn;
        ctx.globalAlpha = clamp(1.0, 0, 1);
        ctx.beginPath();
        ctx.moveTo(-8, ey - 2); ctx.lineTo(-8 - flameLen, ey + 1); ctx.lineTo(-8, ey + 2.5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle   = p.hi;
        ctx.globalAlpha = clamp(0.85, 0, 1);
        ctx.beginPath();
        ctx.moveTo(-8, ey - 1); ctx.lineTo(-8 - flameLen * 0.55, ey + 0.5); ctx.lineTo(-8, ey + 1.5);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);

    } finally {
      ctx.restore();
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
    }
  }

  // ---- Chaff resupply pickup — glowing capsule with "C" label ----
  _drawChaffPickup(ctx, pk, p) {
    if (!pk || pk.dead) return;
    const savedA = ctx.globalAlpha;
    try {
      // Pulsing outer glow
      const pulse = 0.5 + 0.5 * Math.sin(pk.age * 6);
      ctx.globalAlpha = clamp(0.25 + pulse * 0.25, 0, 1);
      ctx.fillStyle   = p.warn;
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, 18, 0, Math.PI * 2);
      ctx.fill();

      // Capsule body (rounded rect via arc)
      ctx.globalAlpha = clamp(0.92, 0, 1);
      ctx.fillStyle   = p.dark;
      ctx.strokeStyle = p.warn;
      ctx.lineWidth   = 1.5;
      const hw = 10, hh = 7;
      ctx.beginPath();
      ctx.moveTo(pk.x - hw + hh, pk.y - hh);
      ctx.lineTo(pk.x + hw - hh, pk.y - hh);
      ctx.arcTo(pk.x + hw, pk.y - hh, pk.x + hw, pk.y, hh);
      ctx.arcTo(pk.x + hw, pk.y + hh, pk.x + hw - hh, pk.y + hh, hh);
      ctx.lineTo(pk.x - hw + hh, pk.y + hh);
      ctx.arcTo(pk.x - hw, pk.y + hh, pk.x - hw, pk.y, hh);
      ctx.arcTo(pk.x - hw, pk.y - hh, pk.x - hw + hh, pk.y - hh, hh);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Dividing line in center
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = p.warn;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(pk.x, pk.y - hh);
      ctx.lineTo(pk.x, pk.y + hh);
      ctx.stroke();

      // "C" label — bright center
      ctx.globalAlpha = clamp(0.9 + pulse * 0.1, 0, 1);
      ctx.fillStyle   = p.warn;
      ctx.font        = 'bold 10px "DotGothic16", monospace';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('C', pk.x, pk.y);

    } finally {
      ctx.globalAlpha = clamp(savedA, 0, 1);
      ctx.lineWidth   = 1;
      ctx.textAlign   = 'left';
      ctx.textBaseline = 'top';
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
