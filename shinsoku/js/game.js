// game.js — engine, combat, leveling, godspeed, input, HUD, save.
import { MONSTERS, AREAS, rollDrop, spawnTableFor } from './content.js';
import { drawShadow, drawFighter, drawMonster, drawLoot } from './sprites.js';
import { SFX } from './sfx.js';

const TW = 64, TH = 32;                 // iso tile width/height
const SAVE_KEY = 'shinsoku_save_v1';
const ATTACK_RANGE = 1.7;               // tiles (bigger monsters need a touch more)
const MAX_MONSTERS = 7;
const ISO_U = (64 / 2) * Math.SQRT2;    // world-circle radius (tiles) -> screen px (x)
// active skills (timed buffs); effect & duration scale with skill level
const HASTE_PER_LV = 0.85;              // +85% attack speed per 神速 level while active
const POWER_PER_LV = 0.30;              // +30% attack power per 剛力 level
const VIG_PER_LV = 45;                  // +45 max HP per 活力 level
const SKILL_DUR = lv => 3 + lv * 1.5;   // buff duration in seconds
const SKILL_CD = 14;                    // cooldown after the buff ends
const GOD_THRESHOLD = 8;                // effective atk/s to enter 神速
const CAST_DUR = 0.55;                  // skill-cast flourish length (s)
// dragon breath (apex boss special, telegraphed fire cone)
const BREATH_DUR = 1.7;                 // total seconds of one breath
const BREATH_CD = 6.5;                  // cooldown between breaths
const BREATH_RANGE = 8;                 // tiles
const BREATH_HALF = 0.5;                // cone half-angle (rad, ~29°)
// mid-boss slam-nova special (ogre/golem/wraith bosses)
const SLAM_DUR = 1.3;                   // total seconds
const SLAM_CD = 5.5;                    // cooldown
const SLAM_RADIUS = 4.6;               // tiles the shockwave reaches

const rng = Math.random;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = (x, y) => Math.hypot(x, y);
const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };

export class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.ctx = this.canvas.getContext('2d');
    this.monsters = [];
    this.loot = [];
    this.fx = [];          // floating texts
    this.parts = [];       // particles
    this.keys = {};
    this.move = { x: 0, y: 0 };   // joystick/key movement vector (tile space, normalized)
    this.moveTarget = null;
    this.target = null;
    this.cam = { x: 0, y: 0 };
    this.last = 0;
    this.running = false;
    // active skills: rem=buff seconds left, cd=cooldown left, lv=level it was cast at
    this.buffs = {
      speed: { rem: 0, cd: 0, lv: 0 },
      power: { rem: 0, cd: 0, lv: 0 },
      hp: { rem: 0, cd: 0, lv: 0, bonus: 0 },
    };
    this.hitFlash = 0;     // red screen flash when taking damage
    this.blood = [];       // lingering ground blood decals
    this.visualSwing = 0;
    // area / world state
    this.areaId = 'dungeon'; this.area = AREAS.dungeon; this.R = this.area.radius;
    this.buildLayout(this.area);   // 2部屋＋通路レイアウトを早期に用意（enterArea前のupdateでも安全に）
    this.maxMon = 8; this.exit = null; this.boss = null;
    this.loops = 0; this.areaLevel = 1; this.bossRespawnAt = 0;
    this.castAnim = 0;     // skill-cast flourish timer
    this.hurtAnim = 0;     // flinch/recoil timer on taking a hit
    this.pview = 'front';  // current player view (front/back/side)
    this.ambient = [];     // ambient environment motes (screen-space)
    this.initPlayer();
    this.bindUI();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // ---------------- player ----------------
  initPlayer() {
    this.p = {
      wx: 0, wy: 0, face: 1,
      level: 1, xp: 0, xpToNext: 24,
      hp: 100, hpMax: 100,
      atk: 15, atkSpeed: 1.25, defense: 4,
      baseEvasion: 0.05, moveSpeed: 3.4,
      skillPoints: 0, skills: { speed: 0, power: 0, hp: 0 },
      statPoints: 0,                                      // allocated on level-up
      opt: { atkSpeedPct: 0, hpAbsorbPct: 0, evasionPct: 0 },  // = sum of equipped gear option %s
      gear: { sword: null, shield: null, armor: null },   // equipped items (or null)
      bag: [],                                            // spare gear (unequipped)
      bagOpt: [],                                         // loose options to attach to gear
      potions: 0,                                         // HP recovery potions held
      atkTimer: 0, areaId: 'grassland',
    };
  }
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.level) {
        this.p = Object.assign(this.p, s); this.p.hp = this.p.hpMax;
        if (!this.p.skills || !('speed' in this.p.skills)) this.p.skills = { speed: 0, power: 0, hp: 0 };
        if (!this.p.gear || typeof this.p.gear.sword === 'string') this.p.gear = { sword: null, shield: null, armor: null };
        if (!Array.isArray(this.p.bag)) this.p.bag = [];
        if (!Array.isArray(this.p.bagOpt)) this.p.bagOpt = [];
        if (this.p.potions == null) this.p.potions = 0;
        if (this.p.statPoints == null) this.p.statPoints = 0;
        // options live ONLY on gear — recompute the percent bonuses from equipped gear
        const sum = { atkSpeedPct: 0, hpAbsorbPct: 0, evasionPct: 0 };
        for (const s of ['sword', 'shield', 'armor']) {
          const it = this.p.gear[s];
          if (it && it.options) for (const o of it.options) if (o.stat in sum) sum[o.stat] += o.value;
        }
        this.p.opt = sum;
        this.loops = this.p.loops || 0;
        if (!AREAS[this.p.areaId]) this.p.areaId = 'grassland';   // migrate old save areas
      }
    } catch (e) {}
  }
  save() {
    const { wx, wy, atkTimer, ...rest } = this.p;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(rest)); } catch (e) {}
  }

  // derived
  get aps() { return this.effectiveAPS(); }
  effectiveAPS() {
    const b = this.buffs.speed;
    let mult = 1 + this.p.opt.atkSpeedPct / 100;
    if (b.rem > 0) mult += b.lv * HASTE_PER_LV;
    return this.p.atkSpeed * mult;
  }
  atkEff() {
    const b = this.buffs.power;
    return this.p.atk * (b.rem > 0 ? 1 + b.lv * POWER_PER_LV : 1);
  }
  effEvasion() { return clamp(this.p.baseEvasion + this.p.opt.evasionPct / 100, 0, 0.85); }
  isGod() { return this.effectiveAPS() >= GOD_THRESHOLD; }

  // ---------------- lifecycle ----------------
  start() {
    try { SFX.init(); } catch (e) { console.warn('audio init failed', e); }   // never let audio block startup
    const mb = document.getElementById('btnMute'); if (mb) mb.textContent = SFX.isMuted() ? '🔇' : '🔊';
    this.load();
    this.enterArea(this.p.areaId || 'grassland');
    this.running = true;
    this.last = performance.now();
    this.updateHUD();
    requestAnimationFrame(t => this.loop(t));
  }

  // ---------------- dumbbell layout (two rooms + corridor) ----------------
  // The iso diagonal wx=wy is the south(front)↔north(far) axis.
  uvFromXY(wx, wy) { return { u: (wx + wy) / Math.SQRT2, v: (wy - wx) / Math.SQRT2 }; }   // u: south(+)/north(−), v: perpendicular
  xyFromUV(u, v) { return { wx: (u - v) / Math.SQRT2, wy: (u + v) / Math.SQRT2 }; }        // inverse

  // build the layout for an area: two room circles joined by a corridor band
  buildLayout(area) {
    const rr = Math.max(9, (area.radius || 16) * 0.72);   // per-room radius
    const Du = rr + 6;                                    // each room center offset along the diagonal
    const wc = 3.4;                                        // corridor half-width (perpendicular)
    const c1 = this.xyFromUV(Du, 0);    // SOUTH room (entry / player / exit / normals)
    const c2 = this.xyFromUV(-Du, 0);   // NORTH room (elites / boss)
    this.layout = { rr, Du, wc, c1, c2 };
    this.R = Du + rr;                   // overall extent (minimap scale + ground loop range)
  }

  // walkable test for the dumbbell: inside either room circle OR within the corridor band.
  // m > 0 shrinks the region (collision clamp); m < 0 grows it (ground-fill rim inclusion).
  walkable(wx, wy, m = 0) {
    const L = this.layout; if (!L) return hyp(wx, wy) <= this.R - m;
    if (hyp(wx - L.c1.wx, wy - L.c1.wy) <= L.rr - m) return true;
    if (hyp(wx - L.c2.wx, wy - L.c2.wy) <= L.rr - m) return true;
    const { u, v } = this.uvFromXY(wx, wy);
    return Math.abs(v) <= L.wc - m && u >= -L.Du && u <= L.Du;
  }

  // ---------------- areas / world ----------------
  enterArea(id) {
    // count a full loop each time we return to the start room past the dragon
    if (this.areaId === 'dragon_lair' && id === 'grassland') this.loops = (this.loops || 0) + 1;
    const area = AREAS[id] || AREAS.dungeon;
    this.areaId = id; this.area = area; this.p.areaId = id;
    this.loops = this.loops || 0; this.p.loops = this.loops;
    this.areaLevel = (area.level || 1) + this.loops * 6;   // room difficulty (climbs each loop)
    this.buildLayout(area);                                // sets this.layout + this.R (dumbbell)
    this.maxMon = Math.min(11, Math.max(6, Math.round(area.radius * 0.6)));
    this.monsters = []; this.loot = []; this.blood = []; this.target = null; this.moveTarget = null;
    this.boss = null; this.bossRespawnAt = 0;
    // enter in ROOM1 near its south edge; exit gate sits just behind, at the far south rim
    const { rr, Du } = this.layout;
    const sp = this.xyFromUV(Du + rr - 4, 0);
    this.p.wx = sp.wx; this.p.wy = sp.wy;
    const er = this.xyFromUV(Du + rr - 1.5, 0);
    this.exit = { wx: er.wx, wy: er.wy, next: area.next };
    this.refillSpawns(true);
    if (area.boss) this.spawnBoss(area.boss);
    this.initAmbient(area.theme);
    SFX.enterArea(area.theme); SFX.ambient(area.theme);
    this.float(this.W / 2, this.H / 2 - 50, area.name + '  Lv.' + this.areaLevel, '#e8c870', 26);
    this.updateHUD(); this.save();
  }

  // ---------------- ambient environment motes ----------------
  initAmbient(theme) {
    const n = theme === 'dungeon' ? 34 : theme === 'forest' ? 42 : 46;
    this.ambient = [];
    for (let i = 0; i < n; i++) this.ambient.push(this.makeMote(theme, true));
  }
  makeMote(theme, anywhere) {
    const W = this.W, H = this.H, R = Math.random;
    const p = { x: R() * W, phase: R() * 6.28, theme };
    if (theme === 'dungeon') {
      p.y = anywhere ? R() * H : H + 10; p.vx = (R() - .5) * 6; p.vy = -8 - R() * 12;
      p.r = .8 + R() * 1.4; p.col = R() < .3 ? '255,150,60' : '150,140,120'; p.blink = .4 + R() * .4;
    } else if (theme === 'grassland') {
      p.y = anywhere ? R() * H : R() * H; p.vx = (R() - .5) * 16; p.vy = -4 - R() * 8;
      p.r = 1 + R() * 1.6; p.col = R() < .5 ? '200,255,120' : '255,240,150'; p.blink = .6 + R() * .4;
    } else {
      p.y = anywhere ? R() * H : -10; p.vx = (R() - .5) * 10; p.vy = 8 + R() * 16;
      p.r = 1 + R() * 2; p.col = R() < .5 ? '120,170,90' : '150,120,70'; p.blink = .55;
    }
    return p;
  }
  updateAmbient(dt) {
    const W = this.W, H = this.H;
    for (const p of this.ambient) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.phase += dt * 2;
      if (p.x < -12) p.x = W + 12; else if (p.x > W + 12) p.x = -12;
      if (p.y < -12) p.y = H + 12; else if (p.y > H + 12) p.y = -12;
    }
  }
  drawAmbient() {
    const ctx = this.ctx; ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of this.ambient) {
      const a = (0.28 + 0.5 * Math.abs(Math.sin(p.phase))) * p.blink;
      ctx.fillStyle = `rgba(${p.col},${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  spawnBoss(b) {
    const L = this.areaLevel || 1, lvScale = 1 + (L - 1) * 0.12;
    const lay = this.layout, bp = this.xyFromUV(-(lay.Du + lay.rr - 3), 0);  // ROOM2 north edge
    const bx = bp.wx, by = bp.wy;
    const m = {
      id: 'boss', name: b.name, sprite: b.sprite, isBoss: true, tier: 6,
      hpMax: Math.round(b.hpMax * lvScale), hp: Math.round(b.hpMax * lvScale),
      atk: Math.round(b.atk * (1 + (L - 1) * 0.08)),
      defense: b.defense + Math.floor((L - 1) * 0.5), evade: 0.03,
      xpReward: Math.round(b.xpReward * lvScale),
      speed: 0.95, scale: b.scale, tint: b.tint,
      aggressive: true, senseRange: b.senseRange || 7, atkInterval: b.atkInterval || 0.9,
      wx: bx, wy: by, homeX: bx, homeY: by,
      t: 0, face: 1, walk: 0, hurt: 0, atkTimer: 0.5, deathT: 0, aggro: false,
      breathT: -1, breathCd: 3.5, breathAng: 0, breathTick: 0,   // dragon breath state
      skillT: -1, skillCd: 4,                                    // mid-boss slam state
    };
    this.monsters.push(m); this.boss = m;
  }

  quitToTitle() {
    this.running = false;
    try { SFX.stopAmbient(); } catch (e) {}
    this.save();
    document.getElementById('status').classList.remove('open');
    document.getElementById('title').style.display = '';
  }

  loop(t) {
    if (!this.running) return;
    let dt = (t - this.last) / 1000; this.last = t;
    dt = Math.min(dt, 0.05);
    this.update(dt);
    this.render();
    requestAnimationFrame(n => this.loop(n));
  }

  // ---------------- update ----------------
  update(dt) {
    const p = this.p;
    const pwx0 = p.wx, pwy0 = p.wy;     // for view-direction detection
    this.updateBuffs(dt);
    this.updateSkillHUD();
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.castAnim > 0) this.castAnim -= dt;
    if (this.hurtAnim > 0) this.hurtAnim -= dt;
    // rest regen — HP recovers over time, faster out of combat
    if (p.hp > 0 && p.hp < p.hpMax) {
      const outOfCombat = (this._t - (this.lastHurt || -99)) > 3.5;
      p.hp = Math.min(p.hpMax, p.hp + (outOfCombat ? 0.045 : 0.012) * p.hpMax * dt);
    }

    // movement intent
    let mv = { x: 0, y: 0 };
    const k = this.keys;
    if (k['w'] || k['arrowup']) mv.y -= 1;
    if (k['s'] || k['arrowdown']) mv.y += 1;
    if (k['a'] || k['arrowleft']) mv.x -= 1;
    if (k['d'] || k['arrowright']) mv.x += 1;
    if (this.move.x || this.move.y) { mv.x += this.move.x; mv.y += this.move.y; }

    let manual = mv.x || mv.y;
    // convert screen-axis intent (up/down/left/right) into world tiles
    if (manual) {
      this.moveTarget = null;
      // screen up = -wx-wy ; rotate so controls feel natural in iso
      const wx = (mv.x + mv.y);
      const wy = (mv.y - mv.x);
      const d = hyp(wx, wy) || 1;
      this.stepToward(p, p.wx + wx / d, p.wy + wy / d, p.moveSpeed, dt, true);
    }

    // targeting / chase / click-move
    if (!manual && this.target && this.target.hp > 0) {
      const d = hyp(this.target.wx - p.wx, this.target.wy - p.wy);
      if (d > ATTACK_RANGE) this.stepToward(p, this.target.wx, this.target.wy, p.moveSpeed, dt);
    } else if (!manual && this.moveTarget) {
      const d = hyp(this.moveTarget.wx - p.wx, this.moveTarget.wy - p.wy);
      if (d > 0.15) this.stepToward(p, this.moveTarget.wx, this.moveTarget.wy, p.moveSpeed, dt);
      else this.moveTarget = null;
    }
    if (this.target && this.target.hp <= 0) this.target = null;

    // attacking
    const tgt = this.target;
    let attacking = false;
    if (tgt && tgt.hp > 0) {
      const d = hyp(tgt.wx - p.wx, tgt.wy - p.wy);
      if (d <= ATTACK_RANGE) {
        attacking = true;
        p.face = (this.toScreen(tgt.wx, tgt.wy).x >= this.toScreen(p.wx, p.wy).x) ? 1 : -1;
        const aps = this.effectiveAPS();
        p.atkTimer += dt * aps;
        let hits = 0;
        while (p.atkTimer >= 1 && hits < 12) { p.atkTimer -= 1; this.playerHit(tgt); hits++; if (tgt.hp <= 0) break; }
      }
    }
    if (!attacking) p.atkTimer = Math.min(p.atkTimer, 0.999);
    this.attacking = attacking;
    if (attacking) this.visualSwing += dt * Math.min(this.effectiveAPS(), 6);

    // monsters
    for (const m of this.monsters) this.updateMonster(m, dt);
    this.monsters = this.monsters.filter(m => m.hp > 0 || m.deathT < 0.4);
    if (this.monsters.filter(m => m.hp > 0 && !m.isBoss).length < this.maxMon) this.refillSpawns();
    // boss respawns a while after being slain
    if (this.area.boss && !this.boss && this.bossRespawnAt && this._t >= this.bossRespawnAt) {
      this.bossRespawnAt = 0; this.spawnBoss(this.area.boss);
    }

    // loot pickup
    for (const it of this.loot) {
      it.t += dt;
      if (hyp(it.wx - p.wx, it.wy - p.wy) < 0.7) { this.pickup(it); it.dead = true; }
    }
    this.loot = this.loot.filter(it => !it.dead);

    // exit portal — step onto it to travel to the next area
    if (this.exit && hyp(this.exit.wx - p.wx, this.exit.wy - p.wy) < 0.9) {
      this.enterArea(this.exit.next); return;
    }

    // fx / particles
    for (const f of this.fx) { f.t += dt; f.y += f.vy * dt; f.vy += 40 * dt; }
    this.fx = this.fx.filter(f => f.t < f.life);
    for (const pt of this.parts) { pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 120 * dt; }
    this.parts = this.parts.filter(pt => pt.t < pt.life);
    for (const b of this.blood) b.t += dt;
    this.blood = this.blood.filter(b => b.t < b.life);
    this.updateAmbient(dt);

    // determine sprite view (front/back/side) + facing
    {
      let ddx, ddy;
      if (this.attacking && this.target && this.target.hp > 0) {
        const ts = this.toScreen(this.target.wx, this.target.wy), ps = this.toScreen(p.wx, p.wy);
        ddx = ts.x - ps.x; ddy = ts.y - ps.y;
      } else {
        ddx = ((p.wx - pwx0) - (p.wy - pwy0)) * TW / 2;
        ddy = ((p.wx - pwx0) + (p.wy - pwy0)) * TH / 2;
      }
      if (Math.abs(ddx) + Math.abs(ddy) > 0.4) {
        if (ddy > 0.45 * Math.abs(ddx)) this.pview = 'front';
        else if (ddy < -0.45 * Math.abs(ddx)) this.pview = 'back';
        else this.pview = 'side';
        if (Math.abs(ddx) > 0.1) p.face = ddx >= 0 ? 1 : -1;
      }
    }

    // keep the fighter inside the dungeon arena
    this.clampArena(p);

    // camera
    const sc = this.toScreenRaw(p.wx, p.wy);
    this.cam.x = this.W / 2 - sc.x;
    this.cam.y = this.H / 2 - sc.y;
  }

  clampArena(o) {
    if (this.walkable(o.wx, o.wy, 0.6)) return;
    const L = this.layout;
    if (!L) { const d = hyp(o.wx, o.wy); if (d > this.R - 0.6) { const k = (this.R - 0.6) / d; o.wx *= k; o.wy *= k; } return; }
    // snap to the nearest of: clamped-into-C1, clamped-into-C2, clamped-into-corridor
    const cands = [];
    const intoCircle = (cx, cy, rad) => {
      const dx = o.wx - cx, dy = o.wy - cy, d = hyp(dx, dy) || 1e-6;
      const k = Math.min(1, rad / d);
      return { wx: cx + dx * k, wy: cy + dy * k };
    };
    cands.push(intoCircle(L.c1.wx, L.c1.wy, L.rr - 0.6));
    cands.push(intoCircle(L.c2.wx, L.c2.wy, L.rr - 0.6));
    let { u, v } = this.uvFromXY(o.wx, o.wy);     // corridor clamp
    const vw = Math.max(0, L.wc - 0.6);
    u = clamp(u, -L.Du, L.Du); v = clamp(v, -vw, vw);
    cands.push(this.xyFromUV(u, v));
    let best = cands[0], bd = Infinity;
    for (const c of cands) {
      const dd = hyp(c.wx - o.wx, c.wy - o.wy);
      if (dd < bd) { bd = dd; best = c; }
    }
    o.wx = best.wx; o.wy = best.wy;
  }

  // brief heal/hurt glow on the HP bar (throttled so godspeed doesn't flicker)
  flashHp(type) {
    if (this._t - (this._hpFlashAt || -9) < 0.18) return;
    this._hpFlashAt = this._t;
    const el = document.getElementById('hpbar'); if (!el) return;
    el.classList.remove('heal', 'hurt'); void el.offsetWidth; el.classList.add(type);
  }

  stepToward(p, tx, ty, speed, dt, isDir) {
    const dx = tx - p.wx, dy = ty - p.wy;
    const d = hyp(dx, dy);
    if (d < 1e-4) return;
    const step = Math.min(speed * dt, d);
    p.wx += dx / d * step; p.wy += dy / d * step;
    if (!this.attacking) {
      const s0 = this.toScreen(p.wx - dx, p.wy - dy), s1 = this.toScreen(p.wx, p.wy);
      p.face = (s1.x >= s0.x) ? 1 : -1;
    }
    p.walk = 1;
  }

  // ---------------- combat ----------------
  playerHit(m) {
    const p = this.p;
    const sp = this.toScreen(m.wx, m.wy);
    // monster dodge
    if (rng() < m.evade) { this.float(sp.x, sp.y - 30, 'Miss', '#ffffff', 15); return; }
    const variance = 0.85 + rng() * 0.3;
    const dmg = Math.max(1, Math.round(this.atkEff() * variance - m.defense));
    m.hp -= dmg; m.hurt = 1; m.aggro = true;   // retaliate
    const crit = variance > 1.08;
    if (crit) SFX.crit(); else SFX.hit();
    // at 神速 the hit rate is huge — throttle floats/particles for readability + perf
    const god = this.isGod();
    const showFx = !god || rng() < 0.16;
    if (showFx) this.float(sp.x + (rng() * 16 - 8), sp.y - 28, String(dmg), crit ? '#ffd24a' : '#ffe6c8', crit ? 18 : 14);
    // lifesteal
    if (p.opt.hpAbsorbPct > 0 && p.hp < p.hpMax) {
      const heal = Math.max(1, Math.round(dmg * p.opt.hpAbsorbPct / 100));
      p.hp = Math.min(p.hpMax, p.hp + heal);
      this.flashHp('heal');
      if (showFx && rng() < 0.5) this.float(this.toScreen(p.wx, p.wy).x, this.toScreen(p.wx, p.wy).y - 60, '+' + heal, '#6bff8a', 12);
    }
    if (showFx) {
      this.spark(sp.x, sp.y - 24, god ? '#ff7adf' : '#fff2c8', god ? 4 : 3);
      this.spark(sp.x, sp.y - 22, '#9c1414', 3);                 // blood spray
      if (rng() < 0.3) this.addBlood(m.wx, m.wy, 0.7 + rng() * 0.5);
    }
    if (m.hp <= 0) this.killMonster(m);
  }

  killMonster(m) {
    const p = this.p;
    m.hp = 0; m.deathT = 0; SFX.kill();
    const xp = Math.round(m.xpReward);
    p.xp += xp;
    const sp = this.toScreen(m.wx, m.wy);
    this.float(sp.x, sp.y - 44, '+' + xp + ' XP', '#9fd8ff', 12);
    for (let i = 0; i < 8; i++) this.spark(sp.x, sp.y - 20, m.tint, 1);
    for (let i = 0; i < 10; i++) this.spark(sp.x, sp.y - 18, '#7e1010', 1);   // death blood burst
    this.addBlood(m.wx, m.wy, 1.1 + rng() * 0.7);
    // loot — drop quality scales with room level
    const dropTier = Math.min(6, (m.tier || 1) + Math.floor((this.areaLevel - 1) / 2));
    const drop = rollDrop(dropTier, rng);
    if (drop) this.loot.push({ wx: m.wx, wy: m.wy, t: 0, ...drop });
    if (m.isBoss) {
      this.boss = null;
      this.bossRespawnAt = this._t + 25;                  // boss returns after a while
      this.float(sp.x, sp.y - 72, m.name + ' 撃破！', '#ffd24a', 26);
      for (let i = 0; i < 24; i++) this.spark(sp.x, sp.y - 30, '#ffd24a', 2);
      const n = m.sprite === 'dragon' ? 4 : 2;
      for (let i = 0; i < n; i++) {                       // guaranteed bonus gear
        const g = rollDrop(6, rng);
        if (g) this.loot.push({ wx: m.wx + (rng() - .5) * 3, wy: m.wy + (rng() - .5) * 3, t: 0, ...g });
      }
    }
    // level up check
    while (p.xp >= p.xpToNext) this.levelUp();
    this.updateHUD();
    this.save();
  }

  levelUp() {
    const p = this.p;
    p.xp -= p.xpToNext;
    p.level++;
    p.xpToNext = Math.round(24 * Math.pow(p.level, 1.45));
    p.hpMax += 6; p.hp = p.hpMax;        // small base bump + full heal
    p.statPoints += 3;                   // allocate these yourself (▦ panel)
    p.skillPoints += 1;
    SFX.levelUp();
    const sp = this.toScreen(p.wx, p.wy);
    this.float(sp.x, sp.y - 70, 'LEVEL UP!', '#ffd24a', 20);
    for (let i = 0; i < 18; i++) this.spark(sp.x, sp.y - 30, '#ffd24a', 2);
  }

  updateMonster(m, dt) {
    if (m.hp <= 0) { m.deathT += dt; return; }
    m.hurt = Math.max(0, m.hurt - dt * 4);
    m.t += dt; m.walk = 0;
    // bosses smoulder — drifting embers
    if (m.isBoss && rng() < dt * 6) {
      const bs = this.toScreen(m.wx, m.wy), sc = m.scale * 1.15;
      this.parts.push({ x: bs.x + (rng() - .5) * 24 * sc, y: bs.y - rng() * 30 * sc, vx: (rng() - .5) * 10, vy: -18 - rng() * 22, color: rng() < .5 ? '#ff6a1e' : '#ffb24a', t: 0, life: 0.9 + rng() * 0.7, r: 1 + rng() * 1.6 });
    }
    const p = this.p;
    const dx = p.wx - m.wx, dy = p.wy - m.wy, d = hyp(dx, dy);
    m.atkTimer -= dt;
    // Aggro rules: most monsters are passive and never approach. Only `aggressive`
    // types sense and chase (within senseRange). Any monster aggros once you
    // target or hit it (retaliation), then stays engaged.
    if (!m.aggro) {
      if (m === this.target) m.aggro = true;
      else if (m.aggressive && d <= (m.senseRange || 0)) m.aggro = true;
    }
    if (!m.aggro) { this.wander(m, dt); return; }
    // ---- DRAGON BREATH (ranged telegraphed fire cone) ----
    if (m.sprite === 'dragon') {
      if (m.breathT >= 0) {                       // mid-breath: rear up and exhale, no melee
        m.breathT += dt / BREATH_DUR;
        m.face = this.toScreen(p.wx, p.wy).x >= this.toScreen(m.wx, m.wy).x ? 1 : -1;
        if (m.breathT >= 0.4 && m.breathT < 0.85) {
          m.breathTick -= dt;
          if (m.breathTick <= 0) { m.breathTick = 0.2; this.breathHit(m); }
        }
        if (m.breathT >= 1) { m.breathT = -1; m.breathCd = BREATH_CD; }
        return;
      }
      m.breathCd -= dt;
      if (m.breathCd <= 0 && d <= BREATH_RANGE + 1) {   // begin a breath aimed where you stand
        m.breathAng = Math.atan2(p.wy - m.wy, p.wx - m.wx);
        m.breathT = 0; m.breathTick = 0; m.face = this.toScreen(p.wx, p.wy).x >= this.toScreen(m.wx, m.wy).x ? 1 : -1;
        this.float(this.toScreen(m.wx, m.wy).x, this.toScreen(m.wx, m.wy).y - 80 * m.scale, 'ＧＲＡＡＡ', '#ff7a2a', 22);
        SFX.skill('power');
        return;
      }
    }
    // ---- MID-BOSS SLAM NOVA (ogre/golem/wraith bosses): telegraphed AoE ring ----
    if (m.isBoss && m.sprite !== 'dragon') {
      if (m.skillT >= 0) {
        const prev = m.skillT; m.skillT += dt / SLAM_DUR;
        if (prev < 0.5 && m.skillT >= 0.5) this.slamHit(m);   // impact moment
        m.face = this.toScreen(p.wx, p.wy).x >= this.toScreen(m.wx, m.wy).x ? 1 : -1;
        if (m.skillT >= 1) { m.skillT = -1; m.skillCd = SLAM_CD; }
        return;                                               // root in place while slamming
      }
      m.skillCd -= dt;
      if (m.skillCd <= 0 && d <= SLAM_RADIUS + 2) {
        m.skillT = 0; SFX.skill('power');
        this.float(this.toScreen(m.wx, m.wy).x, this.toScreen(m.wx, m.wy).y - 70 * m.scale, '叩きつけ！', '#ffcaa0', 18);
        return;
      }
    }
    // ---- ELITE CHARGE: periodic speed burst (a quick lunge at the player) ----
    let spd = m.speed;
    if (m.elite) {
      m.speedBoost = Math.max(0, (m.speedBoost || 0) - dt);
      m.chargeCd = (m.chargeCd == null ? rng() * 3 : m.chargeCd) - dt;
      if (m.chargeCd <= 0 && d > 2 && d < 7) {
        m.speedBoost = 0.55; m.chargeCd = 3.5 + rng() * 2;
        const es = this.toScreen(m.wx, m.wy); for (let i = 0; i < 5; i++) this.spark(es.x, es.y - 18, '#c878ff', 1);
      }
      if (m.speedBoost > 0) spd = m.speed * 3.4;
    }
    if (d > ATTACK_RANGE - 0.3) {
      const step = Math.min(spd * dt, d);
      m.wx += dx / d * step; m.wy += dy / d * step; m.walk = 1;
      this.clampArena(m);
      m.face = this.toScreen(p.wx, p.wy).x >= this.toScreen(m.wx, m.wy).x ? 1 : -1;
    } else {
      m.face = this.toScreen(p.wx, p.wy).x >= this.toScreen(m.wx, m.wy).x ? 1 : -1;
      if (m.atkTimer <= 0) { m.atkTimer = m.atkInterval || 1.2; this.monsterHit(m); }
    }
  }

  // Passive monsters stroll around their spawn point (gives the walk animation life).
  wander(m, dt) {
    if (m.wcd === undefined) { m.wcd = rng() * 2.5; m.wtx = m.wx; m.wty = m.wy; }
    m.wcd -= dt;
    if (m.wcd <= 0) {
      m.wcd = 2.5 + rng() * 3.5;
      const homeD = hyp(m.homeX - m.wx, m.homeY - m.wy);
      if (homeD > 5) { m.wtx = m.homeX; m.wty = m.homeY; }        // leash back home
      else { const a = rng() * 6.28, r = 1 + rng() * 2.5; m.wtx = m.wx + Math.cos(a) * r; m.wty = m.wy + Math.sin(a) * r; }
    }
    const dx = m.wtx - m.wx, dy = m.wty - m.wy, d = hyp(dx, dy);
    if (d > 0.15) {
      const step = Math.min(m.speed * 0.35 * dt, d);
      m.wx += dx / d * step; m.wy += dy / d * step; m.walk = 1;
      this.clampArena(m);
      m.face = this.toScreen(m.wtx, m.wty).x >= this.toScreen(m.wx, m.wy).x ? 1 : -1;
    }
  }

  monsterHit(m) {
    const p = this.p;
    const ps = this.toScreen(p.wx, p.wy);
    if (rng() < this.effEvasion()) {
      this.float(ps.x, ps.y - 64, 'MISS', '#cfeaff', 14); return;
    }
    // percentage mitigation: defense scales down damage but never to zero, so even
    // weak monsters chip and hard-hitting bosses stay threatening
    const mit = p.defense / (p.defense + 28);
    const dmg = Math.max(1, Math.round(m.atk * (1 - mit)));
    p.hp = Math.max(0, p.hp - dmg);
    this.float(ps.x + (rng() * 12 - 6), ps.y - 60, '-' + dmg, '#ff6b6b', 15);
    this.spark(ps.x, ps.y - 40, '#b01818', 5);
    SFX.playerHurt();
    this.hitFlash = 0.32; this.lastHurt = this._t; this.hurtAnim = 0.25; this.flashHp('hurt');
    if (rng() < 0.4) this.addBlood(p.wx, p.wy, 0.6 + rng() * 0.4);
    this.updateHUD();
    if (p.hp <= 0) this.onDeath();
  }

  // damage tick from the dragon's fire cone (only if you're still inside it — dodgeable)
  breathHit(m) {
    const p = this.p;
    const dx = p.wx - m.wx, dy = p.wy - m.wy, d = hyp(dx, dy);
    if (d > BREATH_RANGE) return;
    let da = Math.atan2(p.wy - m.wy, p.wx - m.wx) - m.breathAng;
    da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
    if (da > BREATH_HALF) return;                 // stepped out of the cone — dodged
    const ps = this.toScreen(p.wx, p.wy);
    if (rng() < this.effEvasion()) { this.float(ps.x, ps.y - 64, 'MISS', '#cfeaff', 14); return; }
    const mit = p.defense / (p.defense + 28);
    const dmg = Math.max(1, Math.round(m.atk * 1.5 * (1 - mit)));
    p.hp = Math.max(0, p.hp - dmg);
    this.float(ps.x + (rng() * 12 - 6), ps.y - 58, '-' + dmg, '#ff9a3a', 16);
    this.spark(ps.x, ps.y - 34, '#ff6a1e', 4);
    this.hitFlash = 0.4; this.lastHurt = this._t; this.hurtAnim = 0.25; this.flashHp('hurt');
    this.updateHUD();
    if (p.hp <= 0) this.onDeath();
  }

  // mid-boss slam impact — AoE around the boss; dodge by being outside the ring
  slamHit(m) {
    const p = this.p, d = hyp(p.wx - m.wx, p.wy - m.wy);
    const bs = this.toScreen(m.wx, m.wy);
    for (let i = 0; i < 18; i++) this.spark(bs.x, bs.y - 6, '#e8c8a0', 2);   // dust burst
    this.addBlood(m.wx, m.wy, 0);
    if (d > SLAM_RADIUS) return;                       // outside the shockwave — safe
    const ps = this.toScreen(p.wx, p.wy);
    if (rng() < this.effEvasion()) { this.float(ps.x, ps.y - 64, 'MISS', '#cfeaff', 14); return; }
    const mit = p.defense / (p.defense + 28);
    const dmg = Math.max(1, Math.round(m.atk * 1.7 * (1 - mit)));
    p.hp = Math.max(0, p.hp - dmg);
    this.float(ps.x + (rng() * 12 - 6), ps.y - 58, '-' + dmg, '#ffcaa0', 17);
    this.hitFlash = 0.45; this.lastHurt = this._t; this.hurtAnim = 0.25; this.flashHp('hurt');
    this.updateHUD();
    if (p.hp <= 0) this.onDeath();
  }

  onDeath() {
    this.float(this.W / 2, this.H / 2, '気絶...', '#ff6b6b', 26);
    this.p.hp = this.p.hpMax;
    this.enterArea(this.areaId);   // respawn fresh in the same area
  }

  // ---------------- spawns ----------------
  // ROOM1 holds the normal wave (~maxMon); ROOM2 keeps a couple of elites alive.
  refillSpawns(initial) {
    const table = (this.area && this.area.spawn) || spawnTableFor(this.p.level);
    const total = table.reduce((s, e) => s + e.weight, 0);
    const pick = () => { let r = rng() * total, key = table[0].sprite; for (const e of table) { r -= e.weight; if (r <= 0) { key = e.sprite; break; } } return key; };
    const ELITE_TARGET = 3;
    const room1Alive = this.monsters.filter(m => m.hp > 0 && !m.isBoss && !m.elite).length;
    const room2Alive = this.monsters.filter(m => m.hp > 0 && !m.isBoss && m.elite).length;
    if (initial) {
      for (let i = 0; i < this.maxMon; i++) this.spawnMonster(pick(), { room: 'room1' });
      for (let i = 0; i < ELITE_TARGET; i++) this.spawnMonster(pick(), { room: 'room2', elite: true });
    } else {
      const n1 = Math.min(this.maxMon - room1Alive, 2);
      for (let i = 0; i < n1; i++) this.spawnMonster(pick(), { room: 'room1' });
      const n2 = Math.min(ELITE_TARGET - room2Alive, 1);
      for (let i = 0; i < n2; i++) this.spawnMonster(pick(), { room: 'room2', elite: true });
    }
  }

  spawnMonster(key, opts = {}) {
    const def = MONSTERS[key];
    if (!def) return;
    const L0 = this.layout, room = opts.room === 'room2' ? 'room2' : 'room1';
    const c = room === 'room2' ? L0.c2 : L0.c1, rad = Math.max(1, L0.rr - 2);
    // random point within the chosen room circle, at least ~5 tiles from the player
    let ax = c.wx, ay = c.wy;
    for (let tries = 0; tries < 14; tries++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * rad;
      ax = c.wx + Math.cos(a) * r; ay = c.wy + Math.sin(a) * r;
      if (hyp(ax - this.p.wx, ay - this.p.wy) >= 5) break;
    }
    // room-level scaling — deeper/looped rooms have tougher, beefier monsters
    const elite = !!opts.elite;
    const L = (this.areaLevel || 1) + (elite ? 2 : 0), lvScale = 1 + (L - 1) * 0.16;
    const eHp = elite ? 1.6 : 1, eAtk = elite ? 1.4 : 1;
    this.monsters.push({
      ...def,
      elite,
      wx: ax, wy: ay, homeX: ax, homeY: ay,
      scale: (def.scale || 1) * (elite ? 1.15 : 1),
      tint: elite ? '#c878ff' : def.tint,
      hpMax: Math.round(def.hpMax * lvScale * eHp),
      hp: Math.round(def.hpMax * lvScale * eHp),
      atk: Math.round(def.atk * (1 + (L - 1) * 0.12) * eAtk),
      defense: (def.defense || 0) + Math.floor((L - 1) * 0.4),
      xpReward: Math.round(def.xpReward * (1 + (L - 1) * 0.15) * (elite ? 1.4 : 1)),
      mlevel: L, atkInterval: 1.2,
      t: rng() * 3, face: 1, walk: 0, hurt: 0, atkTimer: rng(), deathT: 0, aggro: false,
    });
  }

  // ---------------- loot ----------------
  applyOption(o) {                    // o = { stat, value }
    const p = this.p;
    if (o.stat === 'atkSpeedPct' || o.stat === 'hpAbsorbPct' || o.stat === 'evasionPct') {
      p.opt[o.stat] = (p.opt[o.stat] || 0) + o.value;
    } else {
      p[o.stat] = (p[o.stat] || 0) + o.value;
      if (o.stat === 'hpMax') p.hp = Math.min(p.hpMax, p.hp + o.value);
    }
  }
  pickup(it) {
    const p = this.p;
    if (it.kind === 'gear') {                  // weapon/armor/shield — equipment
      if (!p.gear[it.slot]) this.equipGear(it);  // auto-equip an empty slot
      else this.bagAdd(it);                      // else stash; swap in the panel
    } else if (it.kind === 'option') {         // loose option — attach to a gear later
      p.bagOpt.push(it); if (p.bagOpt.length > 16) p.bagOpt.shift();
    } else if (it.kind === 'potion') {         // HP recovery potion — held, click to use
      p.potions = (p.potions || 0) + 1;
    }
    SFX.pickup(it.rarity);
    const sp = this.toScreen(p.wx, p.wy);
    this.float(sp.x, sp.y - 70, it.text, it.color, 15);
    this.toast(it.text, it.color);
    this.updateHUD();
    this.save();
  }

  // attach a loose option (bagOpt[idx]) to an equipped gear, growing that gear
  augmentGear(idx, slot) {
    const p = this.p, opt = p.bagOpt[idx], g = p.gear[slot];
    if (!opt || !g) return;
    g.options.push({ stat: opt.stat, value: opt.value, suffix: opt.suffix, label: opt.label });
    this.applyOption({ stat: opt.stat, value: opt.value });
    p.bagOpt.splice(idx, 1);
    SFX.pickup('rare'); this.updateHUD(); this.save();
  }
  discardOption(idx) {
    if (idx >= 0 && idx < this.p.bagOpt.length) { this.p.bagOpt.splice(idx, 1); this.updateHUD(); this.save(); }
  }

  // add/remove a gear item's option contributions to live stats (sign +1/-1)
  applyGear(item, sign) {
    const p = this.p;
    for (const o of item.options) {
      if (o.stat === 'atkSpeedPct' || o.stat === 'hpAbsorbPct' || o.stat === 'evasionPct') {
        p.opt[o.stat] = (p.opt[o.stat] || 0) + sign * o.value;
      } else {
        p[o.stat] = (p[o.stat] || 0) + sign * o.value;
        if (o.stat === 'hpMax') { if (sign > 0) p.hp += o.value; else p.hp = Math.min(p.hp, p.hpMax); }
      }
    }
  }
  bagAdd(item) { this.p.bag.push(item); if (this.p.bag.length > 12) this.p.bag.shift(); }
  equipGear(item) {
    const p = this.p, slot = item.slot;
    const i = p.bag.indexOf(item); if (i >= 0) p.bag.splice(i, 1);
    if (p.gear[slot]) { this.applyGear(p.gear[slot], -1); this.bagAdd(p.gear[slot]); }
    p.gear[slot] = item; this.applyGear(item, +1);
    this.updateHUD(); this.save();
  }
  discardGear(idx) {
    if (idx >= 0 && idx < this.p.bag.length) { this.p.bag.splice(idx, 1); this.updateHUD(); this.save(); }
  }

  // ---------------- FX ----------------
  float(x, y, text, color, size) { this.fx.push({ x, y, text, color, size: size || 14, vy: -34, t: 0, life: 1.0 }); }
  spark(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, sp = 40 + rng() * 80;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, color, t: 0, life: 0.4 + rng() * 0.3, r: 1.5 + rng() * 2 });
    }
  }
  toast(text, color) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    el.style.color = color; el.style.borderColor = color;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }
  addBlood(wx, wy, r) {
    this.blood.push({ wx, wy, t: 0, life: 9, r, seed: (rng() * 1e5) | 0 });
    if (this.blood.length > 46) this.blood.shift();
  }

  // ---------------- skills ----------------
  updateBuffs(dt) {
    for (const k of ['speed', 'power', 'hp']) {
      const b = this.buffs[k];
      if (b.rem > 0) {
        b.rem -= dt;
        if (b.rem <= 0) {
          b.rem = 0;
          if (k === 'hp' && b.bonus) { this.p.hpMax -= b.bonus; this.p.hp = Math.min(this.p.hp, this.p.hpMax); b.bonus = 0; }
          this.updateHUD();
        }
      }
      if (b.cd > 0) b.cd -= dt;
    }
  }
  activateSkill(key) {
    const lv = this.p.skills[key], b = this.buffs[key];
    if (lv <= 0 || b.rem > 0 || b.cd > 0) return;
    b.lv = lv; b.rem = SKILL_DUR(lv); b.cd = b.rem + SKILL_CD;
    const names = { speed: '神速', power: '剛力', hp: '活力' };
    const cols = { speed: '#ff7adf', power: '#ff8a3a', hp: '#5be07b' };
    if (key === 'hp') { b.bonus = lv * VIG_PER_LV; this.p.hpMax += b.bonus; this.p.hp += b.bonus; }
    SFX.skill(key);
    this.castAnim = CAST_DUR;                 // play the weapon-raise flourish
    const sp = this.toScreen(this.p.wx, this.p.wy);
    this.float(sp.x, sp.y - 80, names[key] + '！', cols[key], 22);
    for (let i = 0; i < 22; i++) this.spark(sp.x, sp.y - 30, cols[key], 2);   // bigger burst
    this.updateHUD();
  }
  spendSkill(sk) {
    const p = this.p;
    if (p.skillPoints <= 0 || !(sk in p.skills)) return;
    p.skillPoints--; p.skills[sk]++;
    this.updateHUD(); this.save();
  }
  spendStat(st) {
    const p = this.p;
    if (p.statPoints <= 0) return;
    if (st === 'atk') p.atk += 2;
    else if (st === 'hpMax') { p.hpMax += 15; p.hp += 15; }
    else if (st === 'defense') p.defense += 1;
    else if (st === 'atkSpeed') p.atkSpeed += 0.03;
    else return;
    p.statPoints--;
    this.updateHUD(); this.save();
  }

  // ---------------- iso projection ----------------
  toScreenRaw(wx, wy) { return { x: (wx - wy) * TW / 2, y: (wx + wy) * TH / 2 }; }
  toScreen(wx, wy) { const r = this.toScreenRaw(wx, wy); return { x: r.x + this.cam.x, y: r.y + this.cam.y }; }
  toWorld(sx, sy) {
    const ax = (sx - this.cam.x) / (TW / 2), ay = (sy - this.cam.y) / (TH / 2);
    return { wx: (ax + ay) / 2, wy: (ay - ax) / 2 };
  }

  // ---------------- render ----------------
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.drawGround();
    this.drawBlood();

    // depth-sorted draw list — player included so front/back ordering is correct
    const list = [];
    for (const it of this.loot) list.push({ d: it.wx + it.wy - 0.3, kind: 'loot', o: it });
    for (const m of this.monsters) list.push({ d: m.wx + m.wy, kind: 'mon', o: m });
    list.push({ d: this.p.wx + this.p.wy, kind: 'player' });
    list.sort((a, b) => a.d - b.d);

    const ps = this.toScreen(this.p.wx, this.p.wy);
    let playerDrawn = false;
    for (const e of list) {
      if (e.kind === 'loot') {
        const s = this.toScreen(e.o.wx, e.o.wy);
        drawLoot(ctx, { x: s.x, y: s.y, t: e.o.t, color: e.o.color });
      } else if (e.kind === 'player') {
        this.drawPlayer(); playerDrawn = true;
      } else {
        // a monster drawn in front of the player that overlaps it fades so the
        // character stays visible (esp. huge bosses standing nearer the camera)
        let fade = 1;
        if (playerDrawn) {
          const ms = this.toScreen(e.o.wx, e.o.wy);
          if (Math.abs(ms.x - ps.x) < 48 && Math.abs(ms.y - ps.y) < 72) fade = 0.8;
        }
        this.drawMonster(e.o, fade);
      }
    }

    if (this.boss && this.boss.sprite === 'dragon' && this.boss.breathT >= 0) this.drawBreath(this.boss);
    for (const m of this.monsters) if (m.isBoss && m.sprite !== 'dragon' && m.skillT >= 0) this.drawBossSkill(m);
    this.drawParticles();
    this.drawAmbient();
    this.drawFloats();

    // red flash when the player takes a hit
    if (this.hitFlash > 0) {
      const a = Math.min(0.42, this.hitFlash);
      const g = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.2, this.W / 2, this.H / 2, this.H * 0.72);
      g.addColorStop(0, 'rgba(170,0,0,0)'); g.addColorStop(1, `rgba(170,0,0,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
    }

    this.drawBossBar();
    this.drawMinimap();
  }

  // dragon fire-breath cone — telegraph (windup) then a roaring jet of flame
  drawBreath(m) {
    const ctx = this.ctx, ph = m.breathT, sc = (m.scale || 1) * 1.15;
    const hs = this.toScreen(m.wx, m.wy);
    const hx = hs.x, hy = hs.y - 52 * sc;                 // mouth (high on the head)
    const windup = ph < 0.4, intensity = windup ? (ph / 0.4) : (ph < 0.85 ? 1 : Math.max(0, 1 - (ph - 0.85) / 0.15));
    ctx.save();
    // telegraph line during windup so the player can step out of the cone
    if (windup) {
      const far = this.toScreen(m.wx + Math.cos(m.breathAng) * BREATH_RANGE, m.wy + Math.sin(m.breathAng) * BREATH_RANGE);
      ctx.strokeStyle = `rgba(255,120,40,${0.35 * intensity})`; ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(far.x, far.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    // flame jet (additive blobs widening to a cone toward breathAng)
    ctx.globalCompositeOperation = 'lighter';
    const N = 16;
    for (let i = 1; i <= N; i++) {
      const tt = i / N;
      const gp = this.toScreen(m.wx + Math.cos(m.breathAng) * tt * BREATH_RANGE, m.wy + Math.sin(m.breathAng) * tt * BREATH_RANGE);
      const x = hx + (gp.x - hx) * tt, y = hy + (gp.y - hy) * tt;     // arc from mouth down to ground
      const flick = 0.7 + Math.sin(this._t * 32 + i * 1.3) * 0.3;
      const r = (5 + tt * 30) * flick;
      const col = tt < 0.4 ? '255,240,170' : tt < 0.72 ? '255,150,45' : '210,55,20';
      const a = intensity * (0.55 * (1 - tt * 0.45)) * flick;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    // mouth glow
    const mg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 18 * sc);
    mg.addColorStop(0, `rgba(255,225,130,${intensity})`); mg.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(hx, hy, 18 * sc, 0, 7); ctx.fill();
    ctx.restore();
  }

  // mid-boss slam telegraph + shockwave ring (projected onto the iso floor)
  drawBossSkill(m) {
    const ctx = this.ctx, c = this.toScreen(m.wx, m.wy), U = ISO_U, ph = m.skillT;
    const col = m.tint || '#e8c8a0';
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, 0.5);
    if (ph < 0.5) {                                   // windup: growing warning ring
      const r = (ph / 0.5) * SLAM_RADIUS * U, a = 0.25 + ph * 0.3;
      ctx.strokeStyle = `rgba(255,120,60,${a})`; ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(0, 0, SLAM_RADIUS * U, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,120,60,${0.08 * a})`; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    } else {                                          // shockwave bursts outward, fading
      const k = (ph - 0.5) / 0.5, r = k * SLAM_RADIUS * U, a = (1 - k) * 0.8;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${hexToRgb(col)},${a})`; ctx.lineWidth = 8 * (1 - k * 0.5);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
      ctx.strokeStyle = `rgba(255,240,200,${a * 0.8})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // top-center boss HP bar (shown while the area boss lives)
  drawBossBar() {
    const b = this.boss; if (!b || b.hp <= 0) return;
    const ctx = this.ctx, w = Math.min(360, this.W - 40), x = (this.W - w) / 2, y = 8, h = 16;
    ctx.fillStyle = 'rgba(8,8,12,.82)'; ctx.fillRect(x - 4, y - 3, w + 8, h + 20);
    ctx.strokeStyle = '#b8923a'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 4, y - 3, w + 8, h + 20);
    ctx.fillStyle = '#1a0a0a'; ctx.fillRect(x, y, w, h);
    const r = Math.max(0, b.hp / b.hpMax);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#ff8a7a'); g.addColorStop(.5, '#d23a2a'); g.addColorStop(1, '#6a1410');
    ctx.fillStyle = g; ctx.fillRect(x, y, w * r, h);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#ffe6c8'; ctx.font = 'bold 12px "Trebuchet MS",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(b.name + '  ' + Math.ceil(b.hp) + ' / ' + b.hpMax, this.W / 2, y + h + 9);
    ctx.textAlign = 'left';
  }

  // top-right minimap of the current area
  drawMinimap() {
    const ctx = this.ctx, R = 46, cx = this.W - R - 14, cy = R + 14;
    const sc = (R - 5) / this.R;   // tiles -> minimap px
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.closePath();
    ctx.fillStyle = 'rgba(10,12,16,.78)'; ctx.fill();
    ctx.strokeStyle = '#b8923a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.clip();
    // floor tint by theme
    const tint = this.area.theme === 'grassland' ? 'rgba(70,110,50,.5)' : this.area.theme === 'forest' ? 'rgba(40,70,35,.55)' : 'rgba(60,55,45,.5)';
    ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    const px = this.p.wx, py = this.p.wy;
    const mp = (wx, wy) => ({ x: cx + (wx - px) * sc, y: cy + (wy - py) * sc }); // player-centered
    // faint layout outline: two rooms + corridor line
    if (this.layout) {
      const L = this.layout, a1 = mp(L.c1.wx, L.c1.wy), a2 = mp(L.c2.wx, L.c2.wy);
      ctx.strokeStyle = 'rgba(200,180,120,.28)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(a1.x, a1.y, L.rr * sc, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(a2.x, a2.y, L.rr * sc, 0, 7); ctx.stroke();
    }
    // exit
    if (this.exit) { const e = mp(this.exit.wx, this.exit.wy); ctx.fillStyle = '#7ce0ff'; ctx.beginPath(); ctx.arc(e.x, e.y, 3, 0, 7); ctx.fill(); }
    // monsters
    for (const m of this.monsters) {
      if (m.hp <= 0) continue;
      const q = mp(m.wx, m.wy);
      ctx.fillStyle = m.isBoss ? '#ffd24a' : '#e0584a';
      ctx.beginPath(); ctx.arc(q.x, q.y, m.isBoss ? 4 : 2, 0, 7); ctx.fill();
    }
    // player
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill();
    ctx.restore();
    // area name
    ctx.fillStyle = '#e8c870'; ctx.font = 'bold 10px "Trebuchet MS",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(this.area.name, cx, cy + R + 12); ctx.textAlign = 'left';
  }

  // lingering crimson blood splats on the floor (projected onto the iso plane)
  drawBlood() {
    const ctx = this.ctx;
    for (const b of this.blood) {
      const s = this.toScreen(b.wx, b.wy);
      const a = b.t < b.life * 0.6 ? 0.5 : 0.5 * (1 - (b.t - b.life * 0.6) / (b.life * 0.4));
      if (a <= 0) continue;
      ctx.save(); ctx.translate(s.x, s.y); ctx.scale(1, 0.5); ctx.globalAlpha = a;
      ctx.fillStyle = '#560c0c';
      let seed = b.seed;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (let i = 0; i < 6; i++) {
        const ang = rnd() * 6.283, d = rnd() * 16 * b.r, rr = (2 + rnd() * 5) * b.r;
        ctx.beginPath(); ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d, rr, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  themePal(theme) {
    if (theme === 'grassland') return {
      bg: '#0e1408', tiles: ['#3c4f2c', '#36492a', '#41552f', '#324626', '#3a4d29'],
      crack: '#4a3d28', rim: '#22301a', grout: 'rgba(0,0,0,.22)', vig: 0.5,
    };
    if (theme === 'forest') return {
      bg: '#070b05', tiles: ['#2c3a20', '#26331c', '#314026', '#222e18', '#2a371e'],
      crack: '#3a3320', rim: '#141d0e', grout: 'rgba(0,0,0,.3)', vig: 0.66,
    };
    if (theme === 'cave') return {
      bg: '#05070a', tiles: ['#2b2e34', '#24262b', '#2f3238', '#212329', '#282b31'],
      crack: '#34302a', rim: '#13151a', grout: 'rgba(0,0,0,.45)', vig: 0.74,
    };
    if (theme === 'temple') return {
      bg: '#0a0905', tiles: ['#4a463a', '#413d31', '#524d40', '#3a362c', '#454036'],
      crack: '#5a5040', rim: '#26221a', grout: 'rgba(0,0,0,.32)', vig: 0.56,
    };
    return { // dungeon
      bg: '#070605', tiles: ['#39332b', '#2c2720', '#332d26', '#2a251f', '#302a23'],
      crack: '#3d342b', rim: '#1d1a15', grout: 'rgba(0,0,0,.42)', vig: 0.72,
    };
  }

  drawGround() {
    const ctx = this.ctx, theme = this.area.theme, T = this.themePal(theme);
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, this.W, this.H);

    const c = this.toWorld(this.W / 2, this.H / 2);
    const R = 24;
    for (let i = -R; i <= R; i++) {
      for (let j = -R; j <= R; j++) {
        const wx = Math.round(c.wx) + i, wy = Math.round(c.wy) + j;
        if (!this.walkable(wx, wy, -0.6)) continue;          // void outside the dumbbell
        const s = this.toScreen(wx, wy);
        if (s.x < -TW || s.x > this.W + TW || s.y < -TH || s.y > this.H + TH) continue;
        const h = ((wx * 73856093) ^ (wy * 19349663)) >>> 0;
        let col = T.tiles[h % T.tiles.length];
        if (h % 23 === 0) col = T.crack;
        if (!this.walkable(wx, wy, 0.6)) col = T.rim;        // edge tiles
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - TH / 2);
        ctx.lineTo(s.x + TW / 2, s.y);
        ctx.lineTo(s.x, s.y + TH / 2);
        ctx.lineTo(s.x - TW / 2, s.y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = T.grout; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    if (theme === 'dungeon' || theme === 'temple') this.drawSeal();
    this.drawArenaRing(theme);
    this.drawExit();

    const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.22, this.W / 2, this.H / 2, this.H * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${T.vig})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, this.W, this.H);
  }

  // glowing gate to the next area
  drawExit() {
    if (!this.exit) return;
    const ctx = this.ctx, s = this.toScreen(this.exit.wx, this.exit.wy);
    const pulse = 0.6 + Math.sin(this._t * 3) * 0.4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 42);
    gg.addColorStop(0, `rgba(120,230,255,${0.28 * pulse})`); gg.addColorStop(1, 'rgba(120,230,255,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(s.x, s.y, 28, 14, 0, 0, 7); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2a2620';
    ctx.fillRect(s.x - 16, s.y - 46, 6, 46); ctx.fillRect(s.x + 10, s.y - 46, 6, 46);
    const pg = ctx.createLinearGradient(0, s.y - 44, 0, s.y);
    pg.addColorStop(0, `rgba(150,235,255,${0.55 * pulse})`); pg.addColorStop(1, `rgba(80,180,230,${0.2 * pulse})`);
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.moveTo(s.x - 10, s.y); ctx.lineTo(s.x - 10, s.y - 40);
    ctx.quadraticCurveTo(s.x, s.y - 54, s.x + 10, s.y - 40); ctx.lineTo(s.x + 10, s.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cdefff'; ctx.font = 'bold 11px "Trebuchet MS",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('▲ ' + (AREAS[this.exit.next] ? AREAS[this.exit.next].name : '出口'), s.x, s.y - 56);
  }

  // Glowing magic seal engraved on the floor (anchored under the boss in ROOM2).
  drawSeal() {
    const ctx = this.ctx, U = ISO_U;
    const c2 = this.layout ? this.layout.c2 : { wx: 0, wy: 0 };
    const c = this.toScreen(c2.wx, c2.wy);
    const pulse = 0.78 + Math.sin(this._t * 1.6) * 0.22;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, 0.5);                               // project circles onto the iso floor
    // soft ambient glow
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 9 * U);
    g.addColorStop(0, `rgba(120,200,255,${0.12 * pulse})`);
    g.addColorStop(0.6, `rgba(110,150,255,${0.05 * pulse})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 9 * U, 0, 7); ctx.fill();

    const ARC = (r, w, col) => { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * U, 0, 7); ctx.stroke(); };
    const blue = a => `rgba(150,210,255,${a})`;
    ARC(8.2, 2.5, blue(0.55 * pulse));
    ARC(7.5, 1.4, blue(0.4));
    ARC(4.4, 1.8, blue(0.5 * pulse));
    ARC(3.7, 1.2, blue(0.35));
    ARC(1.7, 1.4, blue(0.45));

    // rotating outer rune band (ticks)
    ctx.save(); ctx.rotate(this._t * 0.06);
    ctx.strokeStyle = blue(0.55); ctx.lineWidth = 1.4;
    for (let k = 0; k < 60; k++) {
      const a = k / 60 * 6.283, ca = Math.cos(a), sa = Math.sin(a);
      ctx.beginPath(); ctx.moveTo(ca * 7.5 * U, sa * 7.5 * U); ctx.lineTo(ca * 8.2 * U, sa * 8.2 * U); ctx.stroke();
    }
    ctx.restore();

    // rune glyphs around the mid ring (counter-rotating)
    ctx.save(); ctx.rotate(-this._t * 0.09);
    ctx.fillStyle = blue(0.5 * pulse);
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * 6.283, rr = 6 * U;
      ctx.save(); ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr); ctx.rotate(a);
      ctx.fillRect(-1.2, -5, 2.4, 10); ctx.fillRect(-4, -1.2, 8, 2.4);
      ctx.restore();
    }
    ctx.restore();

    // radial spokes between inner rings
    ctx.strokeStyle = blue(0.3); ctx.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * 6.283, ca = Math.cos(a), sa = Math.sin(a);
      ctx.beginPath(); ctx.moveTo(ca * 1.7 * U, sa * 1.7 * U); ctx.lineTo(ca * 3.7 * U, sa * 3.7 * U); ctx.stroke();
    }

    // central glyph — radiating star with a warm 神速-pink core
    ctx.save(); ctx.rotate(this._t * 0.04);
    ctx.strokeStyle = blue(0.6 * pulse); ctx.lineWidth = 1.6;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * 6.283 + (k % 2 ? 0.39 : 0), r = k % 2 ? 1.6 : 2.6;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * U, Math.sin(a) * r * U); ctx.stroke();
    }
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.3 * U);
    core.addColorStop(0, `rgba(255,140,225,${0.5 * pulse})`); core.addColorStop(1, 'rgba(255,140,225,0)');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, 1.3 * U, 0, 7); ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  // Border decor framing BOTH rooms + the corridor walls — varies by theme.
  drawArenaRing(theme) {
    const ctx = this.ctx, U = ISO_U;
    const L = this.layout || { rr: this.R, Du: 0, wc: 3.4, c1: { wx: 0, wy: 0 }, c2: { wx: 0, wy: 0 } };
    const rr = L.rr;
    if (theme === 'dungeon' || theme === 'cave' || theme === 'temple') {
      // dark stroke arc around each room center
      for (const cc of [L.c1, L.c2]) {
        const c = this.toScreen(cc.wx, cc.wy);
        ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, 0.5);
        ctx.lineWidth = 22; ctx.strokeStyle = theme === 'temple' ? '#1a160f' : '#100d0a';
        ctx.beginPath(); ctx.arc(0, 0, (rr + 0.9) * U, 0, 7); ctx.stroke();
        ctx.lineWidth = 5; ctx.strokeStyle = '#2b251d';
        ctx.beginPath(); ctx.arc(0, 0, (rr + 0.25) * U, 0, 7); ctx.stroke();
        ctx.restore();
      }
      // corridor walls: two iso polylines running along v=±wc from u=−Du..+Du
      ctx.lineWidth = 10; ctx.strokeStyle = theme === 'temple' ? '#1a160f' : '#100d0a';
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const vSide of [L.wc, -L.wc]) {
        ctx.beginPath();
        for (let s = 0; s <= 12; s++) {
          const u = -L.Du + (2 * L.Du) * (s / 12);
          const p = this.xyFromUV(u, vSide), sc = this.toScreen(p.wx, p.wy);
          if (s === 0) ctx.moveTo(sc.x, sc.y); else ctx.lineTo(sc.x, sc.y);
        }
        ctx.stroke();
      }
    }
    const N = theme === 'forest' ? 14 : (theme === 'grassland' ? 12 : 10);
    const posts = [];
    // posts around BOTH room rims
    for (const cc of [L.c1, L.c2]) {
      for (let k = 0; k < N; k++) {
        const a = k / N * 6.283;
        posts.push({ s: this.toScreen(cc.wx + Math.cos(a) * (rr + 0.7), cc.wy + Math.sin(a) * (rr + 0.7)), k });
      }
    }
    // a few posts along each corridor edge
    for (const vSide of [L.wc + 0.7, -(L.wc + 0.7)]) {
      for (let s = 1; s <= 3; s++) {
        const u = -L.Du + (2 * L.Du) * (s / 4);
        const p = this.xyFromUV(u, vSide);
        posts.push({ s: this.toScreen(p.wx, p.wy), k: s + 7 });
      }
    }
    posts.sort((a, b) => a.s.y - b.s.y);   // far decor first
    for (const pp of posts) {
      if (theme === 'forest') this.drawTree(pp.s.x, pp.s.y, pp.k);
      else if (theme === 'grassland') this.drawBush(pp.s.x, pp.s.y, pp.k);
      else {
        const flick = 0.72 + Math.sin(this._t * 9 + pp.k * 1.7) * 0.12 + Math.sin(this._t * 23 + pp.k) * 0.06;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createRadialGradient(pp.s.x, pp.s.y - 4, 0, pp.s.x, pp.s.y - 4, 110);
        gg.addColorStop(0, `rgba(255,150,60,${0.16 * flick})`); gg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(pp.s.x, pp.s.y - 4, 110, 0, 7); ctx.fill();
        ctx.restore();
        this.drawPillar(pp.s.x, pp.s.y, flick);
      }
    }
  }

  drawTree(sx, sy, k) {
    const ctx = this.ctx, sway = Math.sin(this._t * 1.1 + k) * 3;
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(sx - 4, sy - 42, 8, 42);
    for (const c of [[0, -60, 22, '#1e3416'], [-11, -52, 16, '#274320'], [11, -54, 15, '#22381a'], [0, -46, 18, '#2c4a22']]) {
      ctx.fillStyle = c[3]; ctx.beginPath(); ctx.ellipse(sx + c[0] + sway, sy + c[1], c[2], c[2] * 0.85, 0, 0, 7); ctx.fill();
    }
  }
  drawBush(sx, sy, k) {
    const ctx = this.ctx;
    if (k % 3 === 0) {                       // a mossy rock
      ctx.fillStyle = '#56524a'; ctx.beginPath(); ctx.ellipse(sx, sy - 6, 13, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6a655b'; ctx.beginPath(); ctx.ellipse(sx - 3, sy - 10, 7, 5, 0, 0, 7); ctx.fill();
      return;
    }
    for (const c of [[0, -9, 12], [-9, -5, 8], [9, -6, 9]]) {
      ctx.fillStyle = '#2e4420'; ctx.beginPath(); ctx.ellipse(sx + c[0], sy + c[1], c[2], c[2] * 0.8, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#3a5429'; ctx.beginPath(); ctx.ellipse(sx - 2, sy - 13, 7, 5, 0, 0, 7); ctx.fill();
  }

  drawPillar(sx, sy, flick) {
    const ctx = this.ctx, H = 58, W = 13;
    const g = ctx.createLinearGradient(sx - W / 2, 0, sx + W / 2, 0);
    g.addColorStop(0, '#171410'); g.addColorStop(0.5, '#3a342b'); g.addColorStop(1, '#1d1a14');
    ctx.fillStyle = g; ctx.fillRect(sx - W / 2, sy - H, W, H);
    ctx.fillStyle = '#26211a'; ctx.fillRect(sx - W / 2 - 2, sy - 5, W + 4, 7);
    ctx.fillStyle = '#312a21'; ctx.fillRect(sx - W / 2 - 2, sy - H - 4, W + 4, 6);
    ctx.fillStyle = '#1a160f'; ctx.beginPath(); ctx.ellipse(sx, sy - H - 6, 5, 2.5, 0, 0, 7); ctx.fill();
    const fh = 14 * flick;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(sx, sy - H - 8 - fh * 0.4, 1, sx, sy - H - 8 - fh * 0.4, fh);
    fg.addColorStop(0, 'rgba(255,235,170,0.95)'); fg.addColorStop(0.5, `rgba(255,150,50,${0.8 * flick})`); fg.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.ellipse(sx, sy - H - 8 - fh * 0.4, fh * 0.5, fh, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  drawMonster(m, fade = 1) {
    const ctx = this.ctx;
    const s = this.toScreen(m.wx, m.wy);
    ctx.globalAlpha = (m.hp <= 0 ? Math.max(0, 1 - m.deathT / 0.4) : 1) * fade;
    const sc = (m.scale || 1) * (m.isBoss ? 1.15 : 1.5);   // monsters ~char-size and up
    drawShadow(ctx, s.x, s.y, 16 * sc, 7 * sc);
    // elite menace: pulsing violet aura beneath/around the body
    if (m.elite && m.hp > 0) {
      const pl = 0.6 + Math.sin(this._t * 4 + m.wx) * 0.4;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const ag = ctx.createRadialGradient(s.x, s.y - 16 * sc, 0, s.x, s.y - 16 * sc, 34 * sc);
      ag.addColorStop(0, `rgba(190,110,255,${0.28 * pl})`); ag.addColorStop(1, 'rgba(190,110,255,0)');
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(s.x, s.y - 16 * sc, 34 * sc, 0, 7); ctx.fill();
      ctx.restore();
    }
    drawMonster(ctx, m.sprite, { x: s.x, y: s.y, scale: sc, face: m.face, t: m.t, walk: m.walk, hurt: m.hurt, tint: m.tint });
    // elite crown marker above the head
    if (m.elite && m.hp > 0) {
      const cy = s.y - 60 * sc;
      ctx.fillStyle = '#d6a3ff';
      ctx.beginPath();
      ctx.moveTo(s.x - 6, cy); ctx.lineTo(s.x - 6, cy - 5); ctx.lineTo(s.x - 3, cy - 2); ctx.lineTo(s.x, cy - 6);
      ctx.lineTo(s.x + 3, cy - 2); ctx.lineTo(s.x + 6, cy - 5); ctx.lineTo(s.x + 6, cy);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // HP bar (bosses use the top bar instead)
    if (m.hp > 0 && m.hp < m.hpMax && !m.isBoss) {
      const w = 34 * sc, top = s.y - 56 * sc;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(s.x - w / 2, top, w, 5);
      ctx.fillStyle = m.tier >= 4 ? '#ff5a4d' : '#7be07b';
      ctx.fillRect(s.x - w / 2, top, w * (m.hp / m.hpMax), 5);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(s.x - w / 2, top, w, 5);
    }
    // target ring
    if (this.target === m && m.hp > 0) {
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 20 * sc, 10 * sc, 0, 0, 7); ctx.stroke();
    }
  }

  drawPlayer() {
    const ctx = this.ctx;
    const p = this.p;
    const s = this.toScreen(p.wx, p.wy);
    const god = this.isGod();
    drawShadow(ctx, s.x, s.y, 16, 7, 0.4);
    const view = this.pview || 'front';
    // godspeed afterimages
    if (god && this.attacking) {
      ctx.globalAlpha = 0.25;
      for (let i = 1; i <= 2; i++) {
        drawFighter(ctx, { x: s.x - p.face * i * 6, y: s.y, scale: 1, face: p.face, view, t: this._t - i * 0.04, walk: 0, attackP: (this.visualSwing - i * 0.3) % 1, god });
      }
      ctx.globalAlpha = 1;
    }
    const run = p.walk ? clamp((p.moveSpeed - 2) / 2, 0.4, 1) : 0;
    const cast = this.castAnim > 0 ? (1 - this.castAnim / CAST_DUR) : -1;
    const hurt = this.hurtAnim > 0 ? clamp(this.hurtAnim / 0.25, 0, 1) : 0;
    drawFighter(ctx, {
      x: s.x, y: s.y, scale: 1, face: p.face, view, t: this._t || 0,
      walk: p.walk || 0, run, cast, hurt, attackP: this.attacking ? (this.visualSwing % 1) : -1, god,
    });
    p.walk = 0;
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const pt of this.parts) {
      ctx.globalAlpha = Math.max(0, 1 - pt.t / pt.life);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawFloats() {
    const ctx = this.ctx;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.fx) {
      const a = f.t < 0.7 ? 1 : 1 - (f.t - 0.7) / 0.3;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `bold ${f.size}px "Trebuchet MS",sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- HUD ----------------
  updateHUD() {
    const p = this.p, $ = id => document.getElementById(id);
    $('v-level').textContent = p.level;
    $('v-hpfill').style.width = (p.hp / p.hpMax * 100) + '%';
    $('v-hptxt').textContent = Math.ceil(p.hp) + '/' + p.hpMax;
    $('v-xpfill').style.width = (p.xp / p.xpToNext * 100) + '%';
    $('v-xptxt').textContent = 'XP ' + Math.floor(p.xp) + '/' + p.xpToNext;
    const aps = this.effectiveAPS();
    $('v-apsnum').textContent = aps.toFixed(aps >= 10 ? 0 : 1);
    document.getElementById('v-aps').classList.toggle('god', this.isGod());
    // status panel
    $('s-atk').textContent = p.atk;
    $('s-spd').textContent = aps.toFixed(1);
    $('s-def').textContent = p.defense;
    $('s-hpm').textContent = p.hpMax;
    $('s-eva').textContent = Math.round(this.effEvasion() * 100) + '%';
    $('s-move').textContent = p.moveSpeed.toFixed(1);
    // equipped gear (name + options); HP吸収 shown as an armor property
    const optTxt = it => it ? it.options.map(o => o.label + '+' + o.value + o.suffix).join(' / ') : '';
    for (const slot of ['sword', 'shield', 'armor']) {
      const it = p.gear[slot];
      const nameEl = $('e-' + slot), optEl = $('eo-' + slot);
      nameEl.textContent = it ? it.name : 'なし';
      nameEl.style.color = it ? it.color : '';
      optEl.textContent = optTxt(it);
    }
    $('e-leech').textContent = Math.round(p.opt.hpAbsorbPct) + '%';
    this.renderInventory();
    // skills: allocation rows + skill-bar levels
    $('s-sp').textContent = p.skillPoints;
    const can = p.skillPoints > 0;
    for (const k of ['speed', 'power', 'hp']) {
      $('al-' + k).textContent = 'Lv' + p.skills[k];
      $('lv-' + k).textContent = 'Lv' + p.skills[k];
      document.getElementById('act-' + k).disabled = p.skills[k] <= 0;
    }
    document.querySelectorAll('.plus').forEach(b => { b.disabled = !can; });
    // stat-point allocation
    $('s-stp').textContent = p.statPoints;
    const canStat = p.statPoints > 0;
    document.querySelectorAll('.splus').forEach(b => { b.disabled = !canStat; });
    this.renderOpts();
    this.updateSkillHUD();
  }

  renderOpts() {
    const el = document.getElementById('opts'); if (!el) return;
    const list = this.p.bagOpt;
    if (!list.length) { el.innerHTML = '<div class="invempty">（なし）</div>'; return; }
    const slotIcon = { sword: '剣', shield: '盾', armor: '鎧' };
    el.innerHTML = list.map((o, i) => {
      const btns = ['sword', 'shield', 'armor'].map(sl =>
        `<button class="optbtn" data-i="${i}" data-slot="${sl}"${this.p.gear[sl] ? '' : ' disabled'}>${slotIcon[sl]}</button>`).join('');
      return `<div class="invrow" style="border-color:${o.color}55">
        <div class="invinfo"><span style="color:${o.color}">${o.label}+${o.value}${o.suffix}</span><small>装備に付与→</small></div>
        ${btns}<button class="invbtn dc" data-i="${i}">捨</button>
      </div>`;
    }).join('');
  }

  gearStatSum(it) { const m = {}; if (it && it.options) for (const o of it.options) m[o.stat] = (m[o.stat] || 0) + o.value; return m; }

  renderInventory() {
    const el = document.getElementById('inv'); if (!el) return;
    const p = this.p, bag = p.bag;
    if (!bag.length) { el.innerHTML = '<div class="invempty">（空）</div>'; return; }
    const slotIcon = { sword: '剣', shield: '盾', armor: '鎧' };
    const SL = { atkSpeedPct: ['攻速', '%'], hpAbsorbPct: ['吸収', '%'], evasionPct: ['回避', '%'], atk: ['攻', ''], hpMax: ['HP', ''], defense: ['防', ''] };
    el.innerHTML = bag.map((it, i) => {
      const opts = it.options.map(o => o.label + '+' + o.value + o.suffix).join(' / ');
      // comparison vs the currently-equipped item in this slot
      const cur = this.gearStatSum(p.gear[it.slot]), nw = this.gearStatSum(it);
      const keys = [...new Set([...Object.keys(cur), ...Object.keys(nw)])];
      const cmp = keys.map(k => {
        const d = (nw[k] || 0) - (cur[k] || 0); if (!d) return '';
        const L = SL[k] || [k, ''], col = d > 0 ? '#7be07b' : '#ff7a7a';
        return `<span style="color:${col}">${L[0]}${d > 0 ? '+' : ''}${d}${L[1]}${d > 0 ? '▲' : '▼'}</span>`;
      }).filter(Boolean).join(' ');
      const cmpLine = p.gear[it.slot] ? (cmp || '<span style="color:#9a937f">同等</span>') : '<span style="color:#7be07b">新規</span>';
      return `<div class="invrow" style="border-color:${it.color}55">
        <i>${slotIcon[it.slot] || '?'}</i>
        <div class="invinfo"><span style="color:${it.color}">${it.name}</span><small>${opts}</small><small class="cmp">${cmpLine}</small></div>
        <button class="invbtn eq" data-idx="${i}">装備</button>
        <button class="invbtn dc" data-idx="${i}">捨</button>
      </div>`;
    }).join('');
  }

  // per-frame HUD: skill state (active duration / cooldown), HP bar, potions
  updateSkillHUD() {
    const p = this.p, $ = id => document.getElementById(id);
    for (const k of ['speed', 'power', 'hp']) {
      const btn = $('act-' + k), b = this.buffs[k], cd = $('cd-' + k);
      if (!btn) continue;
      const active = b.rem > 0, cooling = !active && b.cd > 0;
      btn.classList.toggle('active', active);
      btn.classList.toggle('cooling', cooling);
      cd.textContent = active ? Math.ceil(b.rem) + 's' : (cooling ? Math.ceil(b.cd) : '');
    }
    // live HP bar (rest-regen / lifesteal happen continuously)
    const hf = $('v-hpfill'); if (hf) { hf.style.width = (p.hp / p.hpMax * 100) + '%'; $('v-hptxt').textContent = Math.ceil(p.hp) + '/' + p.hpMax; }
    const pot = $('btnPotion');
    if (pot) { pot.querySelector('.cnt').textContent = p.potions || 0; pot.disabled = !(p.potions > 0 && p.hp < p.hpMax); }
  }

  usePotion() {
    const p = this.p;
    if (!(p.potions > 0) || p.hp >= p.hpMax) return;
    p.potions--;
    p.hp = Math.min(p.hpMax, p.hp + Math.round(p.hpMax * 0.35));
    const sp = this.toScreen(p.wx, p.wy);
    this.float(sp.x, sp.y - 64, '+HP', '#6bff8a', 16);
    for (let i = 0; i < 8; i++) this.spark(sp.x, sp.y - 30, '#6bff8a', 1);
    SFX.skill('hp'); this.updateHUD(); this.save();
  }

  // ---------------- input / UI ----------------
  bindUI() {
    addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; }, { passive: true });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; }, { passive: true });

    const cv = this.canvas;
    const onTap = (sx, sy) => {
      // hit-test monsters (screen-space, nearest within radius)
      let best = null, bd = 36;
      for (const m of this.monsters) {
        if (m.hp <= 0) continue;
        const s = this.toScreen(m.wx, m.wy);
        const d = hyp(s.x - sx, s.y - (s.y < sy ? sy - 30 : sy));
        const dd = hyp(s.x - sx, s.y - sy + 26);
        if (dd < bd) { bd = dd; best = m; }
      }
      if (best) { this.target = best; this.moveTarget = null; }
      else { this.moveTarget = this.toWorld(sx, sy); this.target = null; }
    };
    cv.addEventListener('pointerdown', e => {
      if (this._stickId != null) return;
      const r = cv.getBoundingClientRect();
      onTap(e.clientX - r.left, e.clientY - r.top);
    });

    // joystick
    const stick = document.getElementById('stick'), knob = document.getElementById('stickKnob');
    if ('ontouchstart' in window) document.body.classList.add('touch');
    const stickCenter = () => { const r = stick.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    stick.addEventListener('pointerdown', e => { this._stickId = e.pointerId; stick.setPointerCapture(e.pointerId); this.moveJoy(e, stickCenter(), knob); });
    stick.addEventListener('pointermove', e => { if (this._stickId === e.pointerId) this.moveJoy(e, stickCenter(), knob); });
    const end = e => { if (this._stickId === e.pointerId) { this._stickId = null; this.move.x = this.move.y = 0; knob.style.transform = 'translate(-50%,-50%)'; } };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);

    // buttons
    document.getElementById('btnStatus').onclick = () => document.getElementById('status').classList.toggle('open');
    document.getElementById('closeStatus').onclick = () => document.getElementById('status').classList.remove('open');
    document.getElementById('btnMute').onclick = (e) => { const m = SFX.toggle(); e.currentTarget.textContent = m ? '🔇' : '🔊'; };
    document.getElementById('btnQuit').onclick = () => this.quitToTitle();
    document.getElementById('btnPotion').onclick = () => this.usePotion();
    document.getElementById('inv').addEventListener('click', e => {
      const b = e.target.closest('.invbtn'); if (!b) return;
      const idx = +b.dataset.idx;
      if (b.classList.contains('eq')) { const it = this.p.bag[idx]; if (it) this.equipGear(it); }
      else this.discardGear(idx);
    });
    document.getElementById('opts').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const i = +b.dataset.i;
      if (b.classList.contains('optbtn')) this.augmentGear(i, b.dataset.slot);
      else if (b.classList.contains('dc')) this.discardOption(i);
    });
    document.querySelectorAll('.actbtn').forEach(b => b.onclick = () => this.activateSkill(b.dataset.sk));
    document.querySelectorAll('.plus').forEach(b => b.onclick = () => this.spendSkill(b.dataset.sk));
    document.querySelectorAll('.splus').forEach(b => b.onclick = () => this.spendStat(b.dataset.st));
  }

  moveJoy(e, center, knob) {
    let dx = e.clientX - center.x, dy = e.clientY - center.y;
    const d = hyp(dx, dy), max = 44;
    const cl = Math.min(d, max);
    const nx = d ? dx / d : 0, ny = d ? dy / d : 0;
    knob.style.transform = `translate(${-50}%,${-50}%) translate(${nx * cl}px,${ny * cl}px)`;
    const dead = 0.18;
    this.move.x = Math.abs(nx) > dead || d > 8 ? nx : 0;
    this.move.y = Math.abs(ny) > dead || d > 8 ? ny : 0;
  }

  // ---------------- resize ----------------
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = innerWidth; this.H = innerHeight;
    this.canvas.width = this.W * dpr; this.canvas.height = this.H * dpr;
    this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

// track a global animation time for sprite idle
Game.prototype.update = (function (orig) {
  return function (dt) { this._t = (this._t || 0) + dt; orig.call(this, dt); };
})(Game.prototype.update);
