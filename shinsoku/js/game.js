// game.js — engine, combat, leveling, godspeed, input, HUD, save.
import { MONSTERS, rollDrop, spawnTableFor } from './content.js';
import { drawShadow, drawFighter, drawMonster, drawLoot } from './sprites.js';

const TW = 64, TH = 32;                 // iso tile width/height
const SAVE_KEY = 'shinsoku_save_v1';
const ATTACK_RANGE = 1.7;               // tiles (bigger monsters need a touch more)
const MAX_MONSTERS = 7;
const GOD_THRESHOLD = 8;                // effective atk/s to enter 神速

const rng = Math.random;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = (x, y) => Math.hypot(x, y);

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
    this.godBurst = 0;     // remaining seconds of 神速 burst
    this.burstCd = 0;      // cooldown remaining
    this.visualSwing = 0;
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
      skillPoints: 0, skills: { atk: 0, hp: 0, move: 0 },
      opt: { atkSpeedPct: 0, hpAbsorbPct: 0, evasionPct: 0 },
      equip: { sword: 'なし', shield: 'なし', armor: 'なし' },
      atkTimer: 0,
    };
  }
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.level) { this.p = Object.assign(this.p, s); this.p.hp = this.p.hpMax; }
    } catch (e) {}
  }
  save() {
    const { wx, wy, atkTimer, ...rest } = this.p;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(rest)); } catch (e) {}
  }

  // derived
  get aps() { return this.effectiveAPS(); }
  effectiveAPS() {
    const burst = this.godBurst > 0 ? 5 : 1;
    return this.p.atkSpeed * (1 + this.p.opt.atkSpeedPct / 100) * burst;
  }
  effEvasion() { return clamp(this.p.baseEvasion + this.p.opt.evasionPct / 100, 0, 0.85); }
  isGod() { return this.effectiveAPS() >= GOD_THRESHOLD; }

  // ---------------- lifecycle ----------------
  start() {
    this.load();
    this.refillSpawns(true);
    this.running = true;
    this.last = performance.now();
    this.updateHUD();
    requestAnimationFrame(t => this.loop(t));
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
    if (this.godBurst > 0) this.godBurst -= dt;
    if (this.burstCd > 0) { this.burstCd -= dt; if (this.burstCd <= 0) this.refreshSpecialBtn(); }

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
    if (this.monsters.filter(m => m.hp > 0).length < MAX_MONSTERS) this.refillSpawns();

    // loot pickup
    for (const it of this.loot) {
      it.t += dt;
      if (hyp(it.wx - p.wx, it.wy - p.wy) < 0.7) { this.pickup(it); it.dead = true; }
    }
    this.loot = this.loot.filter(it => !it.dead);

    // fx / particles
    for (const f of this.fx) { f.t += dt; f.y += f.vy * dt; f.vy += 40 * dt; }
    this.fx = this.fx.filter(f => f.t < f.life);
    for (const pt of this.parts) { pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 120 * dt; }
    this.parts = this.parts.filter(pt => pt.t < pt.life);

    // camera
    const sc = this.toScreenRaw(p.wx, p.wy);
    this.cam.x = this.W / 2 - sc.x;
    this.cam.y = this.H / 2 - sc.y;
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
    const dmg = Math.max(1, Math.round(p.atk * variance - m.defense));
    m.hp -= dmg; m.hurt = 1; m.aggro = true;   // retaliate
    const crit = variance > 1.08;
    // at 神速 the hit rate is huge — throttle floats/particles for readability + perf
    const god = this.isGod();
    const showFx = !god || rng() < 0.16;
    if (showFx) this.float(sp.x + (rng() * 16 - 8), sp.y - 28, String(dmg), crit ? '#ffd24a' : '#ffe6c8', crit ? 18 : 14);
    // lifesteal
    if (p.opt.hpAbsorbPct > 0 && p.hp < p.hpMax) {
      const heal = Math.max(1, Math.round(dmg * p.opt.hpAbsorbPct / 100));
      p.hp = Math.min(p.hpMax, p.hp + heal);
      if (showFx && rng() < 0.5) this.float(this.toScreen(p.wx, p.wy).x, this.toScreen(p.wx, p.wy).y - 60, '+' + heal, '#6bff8a', 12);
    }
    if (showFx) this.spark(sp.x, sp.y - 24, god ? '#ff7adf' : '#fff2c8', god ? 4 : 3);
    if (m.hp <= 0) this.killMonster(m);
  }

  killMonster(m) {
    const p = this.p;
    m.hp = 0; m.deathT = 0;
    const xp = Math.round(m.xpReward);
    p.xp += xp;
    const sp = this.toScreen(m.wx, m.wy);
    this.float(sp.x, sp.y - 44, '+' + xp + ' XP', '#9fd8ff', 12);
    for (let i = 0; i < 8; i++) this.spark(sp.x, sp.y - 20, m.tint, 1);
    // loot
    const drop = rollDrop(m.tier, rng);
    if (drop) this.loot.push({ wx: m.wx, wy: m.wy, t: 0, ...drop });
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
    p.hpMax += 12; p.atk += 3; p.defense += 1; p.atkSpeed += 0.05;
    p.skillPoints += 1; p.hp = p.hpMax;
    const sp = this.toScreen(p.wx, p.wy);
    this.float(sp.x, sp.y - 70, 'LEVEL UP!', '#ffd24a', 20);
    for (let i = 0; i < 18; i++) this.spark(sp.x, sp.y - 30, '#ffd24a', 2);
  }

  updateMonster(m, dt) {
    if (m.hp <= 0) { m.deathT += dt; return; }
    m.hurt = Math.max(0, m.hurt - dt * 4);
    m.t += dt; m.walk = 0;
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
    if (d > ATTACK_RANGE - 0.3) {
      const step = Math.min(m.speed * dt, d);
      m.wx += dx / d * step; m.wy += dy / d * step; m.walk = 1;
      m.face = this.toScreen(p.wx, p.wy).x >= this.toScreen(m.wx, m.wy).x ? 1 : -1;
    } else {
      m.face = this.toScreen(p.wx, p.wy).x >= this.toScreen(m.wx, m.wy).x ? 1 : -1;
      if (m.atkTimer <= 0) { m.atkTimer = 1.4; this.monsterHit(m); }
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
      m.face = this.toScreen(m.wtx, m.wty).x >= this.toScreen(m.wx, m.wy).x ? 1 : -1;
    }
  }

  monsterHit(m) {
    const p = this.p;
    const ps = this.toScreen(p.wx, p.wy);
    if (this.godBurst > 0 || rng() < this.effEvasion()) {
      this.float(ps.x, ps.y - 64, 'MISS', '#cfeaff', 14); return;
    }
    const dmg = Math.max(1, Math.round(m.atk - p.defense));
    p.hp = Math.max(0, p.hp - dmg);
    this.float(ps.x + (rng() * 12 - 6), ps.y - 60, '-' + dmg, '#ff6b6b', 15);
    this.spark(ps.x, ps.y - 40, '#ff6b6b', 4);
    this.updateHUD();
    if (p.hp <= 0) this.onDeath();
  }

  onDeath() {
    const p = this.p;
    this.float(this.W / 2, this.H / 2, '気絶...', '#ff6b6b', 26);
    // respawn: heal, drop a few levels' edge but keep progress, scatter monsters
    p.hp = p.hpMax; p.wx = 0; p.wy = 0;
    this.monsters.length = 0; this.target = null; this.moveTarget = null;
    this.refillSpawns(true);
    this.updateHUD();
    this.save();
  }

  // ---------------- spawns ----------------
  refillSpawns(initial) {
    const table = spawnTableFor(this.p.level);
    const total = table.reduce((s, e) => s + e.weight, 0);
    const want = MAX_MONSTERS - this.monsters.filter(m => m.hp > 0).length;
    const n = initial ? MAX_MONSTERS : Math.min(want, 2);
    for (let i = 0; i < n; i++) {
      let r = rng() * total, key = table[0].sprite;
      for (const e of table) { r -= e.weight; if (r <= 0) { key = e.sprite; break; } }
      this.spawnMonster(key);
    }
  }

  spawnMonster(key) {
    const def = MONSTERS[key];
    if (!def) return;
    const ang = rng() * Math.PI * 2, dist = 8 + rng() * 6;
    // level scaling so the grind keeps biting
    const lvScale = 1 + (this.p.level - 1) * 0.11;
    this.monsters.push({
      ...def,
      wx: this.p.wx + Math.cos(ang) * dist,
      wy: this.p.wy + Math.sin(ang) * dist,
      homeX: this.p.wx + Math.cos(ang) * dist,
      homeY: this.p.wy + Math.sin(ang) * dist,
      hpMax: Math.round(def.hpMax * lvScale),
      hp: Math.round(def.hpMax * lvScale),
      atk: Math.round(def.atk * (1 + (this.p.level - 1) * 0.06)),
      xpReward: Math.round(def.xpReward * (1 + (this.p.level - 1) * 0.08)),
      t: rng() * 3, face: 1, walk: 0, hurt: 0, atkTimer: rng(), deathT: 0, aggro: false,
    });
  }

  // ---------------- loot ----------------
  pickup(it) {
    const p = this.p;
    if (it.slot === 'stat') {
      p[it.stat] = (p[it.stat] || 0) + it.value;
      if (it.stat === 'hpMax') p.hp = Math.min(p.hpMax, p.hp + it.value);
    } else {
      p.opt[it.stat] = (p.opt[it.stat] || 0) + it.value;
      p.equip[it.slot] = it.label + ' +' + Math.round(p.opt[it.stat]) + it.suffix;
    }
    const sp = this.toScreen(p.wx, p.wy);
    this.float(sp.x, sp.y - 70, it.text, it.color, 15);
    this.toast(it.text, it.color);
    this.updateHUD();
    this.save();
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

    // build depth-sorted draw list (monsters + loot). The player is drawn last so
    // large monsters never fully occlude the character.
    const list = [];
    for (const it of this.loot) list.push({ d: it.wx + it.wy - 0.3, kind: 'loot', o: it });
    for (const m of this.monsters) list.push({ d: m.wx + m.wy, kind: 'mon', o: m });
    list.sort((a, b) => a.d - b.d);

    for (const e of list) {
      if (e.kind === 'loot') {
        const s = this.toScreen(e.o.wx, e.o.wy);
        drawLoot(ctx, { x: s.x, y: s.y, t: e.o.t, color: e.o.color });
      } else {
        this.drawMonster(e.o);
      }
    }
    this.drawPlayer();

    this.drawParticles();
    this.drawFloats();
  }

  drawGround() {
    const ctx = this.ctx;
    // backdrop gradient (sky/ambient)
    const bg = ctx.createLinearGradient(0, 0, 0, this.H);
    bg.addColorStop(0, '#1a2417'); bg.addColorStop(1, '#0a0f08');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, this.W, this.H);

    const c = this.toWorld(this.W / 2, this.H / 2);
    const R = 16;
    for (let i = -R; i <= R; i++) {
      for (let j = -R; j <= R; j++) {
        const wx = Math.round(c.wx) + i, wy = Math.round(c.wy) + j;
        const s = this.toScreen(wx, wy);
        if (s.x < -TW || s.x > this.W + TW || s.y < -TH || s.y > this.H + TH) continue;
        const h = ((wx * 73856093) ^ (wy * 19349663)) >>> 0;
        const grass = (h % 5);
        const base = grass === 0 ? '#3a4d2a' : grass === 1 ? '#33442459' : '#35492759';
        ctx.fillStyle = grass === 0 ? '#3c4f2c' : (h % 7 === 0 ? '#4a3d28' : '#36492a');
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - TH / 2);
        ctx.lineTo(s.x + TW / 2, s.y);
        ctx.lineTo(s.x, s.y + TH / 2);
        ctx.lineTo(s.x - TW / 2, s.y);
        ctx.closePath(); ctx.fill();
        // subtle grid line
        ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    // vignette
    const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.3, this.W / 2, this.H / 2, this.H * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, this.W, this.H);
  }

  drawMonster(m) {
    const ctx = this.ctx;
    const s = this.toScreen(m.wx, m.wy);
    if (m.hp <= 0) { ctx.globalAlpha = Math.max(0, 1 - m.deathT / 0.4); }
    const sc = (m.scale || 1) * 1.5;   // monsters ~char-size and up
    drawShadow(ctx, s.x, s.y, 16 * sc, 7 * sc);
    drawMonster(ctx, m.sprite, { x: s.x, y: s.y, scale: sc, face: m.face, t: m.t, walk: m.walk, hurt: m.hurt, tint: m.tint });
    ctx.globalAlpha = 1;
    // HP bar
    if (m.hp > 0 && m.hp < m.hpMax) {
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
    // godspeed afterimages
    if (god && this.attacking) {
      ctx.globalAlpha = 0.25;
      for (let i = 1; i <= 2; i++) {
        drawFighter(ctx, { x: s.x - p.face * i * 6, y: s.y, scale: 1, face: p.face, t: this._t - i * 0.04, walk: 0, attackP: (this.visualSwing - i * 0.3) % 1, god, hpRatio: p.hp / p.hpMax });
      }
      ctx.globalAlpha = 1;
    }
    drawFighter(ctx, {
      x: s.x, y: s.y, scale: 1, face: p.face, t: this._t || 0,
      walk: p.walk || 0, attackP: this.attacking ? (this.visualSwing % 1) : -1,
      god, hpRatio: p.hp / p.hpMax,
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
    $('s-eva').textContent = Math.round(this.effEvasion() * 100) + '%';
    $('s-leech').textContent = Math.round(p.opt.hpAbsorbPct) + '%';
    $('s-move').textContent = p.moveSpeed.toFixed(1);
    $('e-sword').textContent = p.equip.sword;
    $('e-shield').textContent = p.equip.shield;
    $('e-armor').textContent = p.equip.armor;
    $('s-sp').textContent = p.skillPoints;
    $('sk-atk').textContent = 'Lv' + p.skills.atk;
    $('sk-hp').textContent = 'Lv' + p.skills.hp;
    $('sk-move').textContent = 'Lv' + p.skills.move;
    const can = p.skillPoints > 0;
    document.querySelectorAll('.skbtn').forEach(b => { b.disabled = !can; b.classList.toggle('canbuy', can); });
  }

  spendSkill(sk) {
    const p = this.p;
    if (p.skillPoints <= 0) return;
    p.skillPoints--; p.skills[sk]++;
    if (sk === 'atk') p.atk += 4;
    else if (sk === 'hp') { p.hpMax += 25; p.hp += 25; }
    else if (sk === 'move') p.moveSpeed += 0.4;
    this.updateHUD(); this.save();
  }

  triggerSpecial() {
    if (this.burstCd > 0) return;
    this.godBurst = 5; this.burstCd = 30;
    this.float(this.W / 2, this.H / 2 - 40, '神速発動！', '#ff7adf', 28);
    this.refreshSpecialBtn();
  }
  refreshSpecialBtn() {
    const b = document.getElementById('btnSpecial');
    if (this.burstCd > 0) { b.disabled = true; b.textContent = Math.ceil(this.burstCd); }
    else { b.disabled = false; b.innerHTML = '<b>神</b>'; }
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
    document.getElementById('btnSpecial').onclick = () => this.triggerSpecial();
    document.querySelectorAll('.skbtn').forEach(b => b.onclick = () => this.spendSkill(b.dataset.sk));
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
