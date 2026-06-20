// sprites.js — all entity/FX rendering. Pseudo-3D shaded vector art, ~2015 MMO vibe.
// Every draw anchors at the FEET: (x,y) is the ground contact point in screen space.

export function drawShadow(ctx, x, y, rx, ry, a = 0.34) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.min(255, r + amt); g = Math.min(255, g + amt); b = Math.min(255, b + amt);
  return `rgb(${r},${g},${b})`;
}
function darken(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, r - amt); g = Math.max(0, g - amt); b = Math.max(0, b - amt);
  return `rgb(${r},${g},${b})`;
}

// ---------- FIGHTER ----------
// opts: {x,y,scale,face(-1|1),t,walk(0..1),attackP(-1 idle, else 0..1),god,hpRatio}
export function drawFighter(ctx, o) {
  const s = o.scale, face = o.face || 1;
  const bob = Math.sin(o.t * 5) * 2 * (o.walk > .05 ? 1 : .4);
  ctx.save();
  ctx.translate(o.x, o.y);

  // godspeed aura
  if (o.god) {
    const ag = ctx.createRadialGradient(0, -34 * s, 0, 0, -34 * s, 46 * s);
    ag.addColorStop(0, 'rgba(255,122,223,.32)');
    ag.addColorStop(1, 'rgba(255,122,223,0)');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(0, -34 * s, 46 * s, 0, 7); ctx.fill();
  }

  ctx.scale(face, 1);
  ctx.translate(0, bob);

  const STEEL = '#c8d2e0', STEEL_D = '#7d8aa0', CLOTH = '#3a2d6e', GOLD = '#e8c870';

  // legs
  const stride = Math.sin(o.t * 9) * 5 * o.walk;
  legArmored(ctx, -5 * s, -2 * s, stride * s, s, STEEL, STEEL_D, CLOTH);
  legArmored(ctx, 5 * s, -2 * s, -stride * s, s, STEEL, STEEL_D, CLOTH);

  // torso (cuirass)
  roundRect(ctx, -11 * s, -42 * s, 22 * s, 30 * s, 7 * s);
  const tg = ctx.createLinearGradient(-11 * s, -42 * s, 11 * s, -12 * s);
  tg.addColorStop(0, lighten(STEEL, 25)); tg.addColorStop(.5, STEEL); tg.addColorStop(1, STEEL_D);
  ctx.fillStyle = tg; ctx.fill();
  ctx.strokeStyle = darken(STEEL, 60); ctx.lineWidth = 1.4 * s; ctx.stroke();
  // chest emblem
  ctx.fillStyle = GOLD; ctx.beginPath();
  ctx.moveTo(0, -38 * s); ctx.lineTo(5 * s, -28 * s); ctx.lineTo(0, -20 * s); ctx.lineTo(-5 * s, -28 * s);
  ctx.closePath(); ctx.fill();
  // pauldron (back arm)
  shoulder(ctx, -12 * s, -40 * s, 7 * s, s, STEEL, STEEL_D);

  // head + helm
  ctx.fillStyle = '#e7c9a5';
  ctx.beginPath(); ctx.arc(0, -50 * s, 7.5 * s, 0, 7); ctx.fill();
  roundRect(ctx, -8 * s, -60 * s, 16 * s, 13 * s, 5 * s);
  const hg = ctx.createLinearGradient(0, -60 * s, 0, -47 * s);
  hg.addColorStop(0, lighten(STEEL, 30)); hg.addColorStop(1, STEEL_D);
  ctx.fillStyle = hg; ctx.fill();
  ctx.strokeStyle = darken(STEEL, 60); ctx.lineWidth = 1 * s; ctx.stroke();
  // helm plume
  ctx.fillStyle = o.god ? '#ff7adf' : '#c8443a';
  ctx.beginPath(); ctx.moveTo(0, -64 * s);
  ctx.quadraticCurveTo(10 * s, -64 * s, 12 * s, -52 * s);
  ctx.quadraticCurveTo(6 * s, -58 * s, 0 * s, -58 * s); ctx.closePath(); ctx.fill();
  // visor slit
  ctx.fillStyle = '#1a1a22'; ctx.fillRect(-6 * s, -53 * s, 12 * s, 2.4 * s);

  // SWORD ARM — slash animation
  const atk = o.attackP; // -1 idle else 0..1
  let armA;
  if (atk >= 0) {
    // raise then sweep down across the front
    armA = atk < .35
      ? lerp(-1.9, -2.5, atk / .35)        // wind up (up-back)
      : lerp(-2.5, 0.5, (atk - .35) / .65); // sweep down/forward
  } else {
    armA = -1.5 + Math.sin(o.t * 3) * 0.08; // idle ready
  }
  drawSwordArm(ctx, 9 * s, -36 * s, armA, s, STEEL, STEEL_D, GOLD, o.god, atk);

  // shield (front)
  shieldOnArm(ctx, -11 * s, -30 * s, s, STEEL, STEEL_D, GOLD);

  ctx.restore();
}

function drawSwordArm(ctx, sx, sy, ang, s, steel, steelD, gold, god, atk) {
  const upLen = 13 * s, foreLen = 12 * s;
  const ex = sx + Math.cos(ang) * upLen, ey = sy + Math.sin(ang) * upLen;
  const fAng = ang + 0.5;
  const hx = ex + Math.cos(fAng) * foreLen, hy = ey + Math.sin(fAng) * foreLen;
  // upper arm
  ctx.strokeStyle = steelD; ctx.lineWidth = 7 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = steel; ctx.lineWidth = 5 * s;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
  // blade
  const bAng = fAng + 0.15;
  const tipx = hx + Math.cos(bAng) * 40 * s, tipy = hy + Math.sin(bAng) * 40 * s;
  // motion-blur arc during sweep
  if (atk >= .35) {
    const sweep = (atk - .35) / .65;
    ctx.strokeStyle = god ? `rgba(255,122,223,${.5 * (1 - sweep)})` : `rgba(220,235,255,${.45 * (1 - sweep)})`;
    ctx.lineWidth = 6 * s;
    ctx.beginPath(); ctx.arc(sx, sy, 30 * s, fAng - 1.4, fAng + .2); ctx.stroke();
  }
  // guard
  ctx.strokeStyle = gold; ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(hx + Math.cos(bAng + 1.6) * 5 * s, hy + Math.sin(bAng + 1.6) * 5 * s);
  ctx.lineTo(hx - Math.cos(bAng + 1.6) * 5 * s, hy - Math.sin(bAng + 1.6) * 5 * s);
  ctx.stroke();
  // blade body
  const grad = ctx.createLinearGradient(hx, hy, tipx, tipy);
  grad.addColorStop(0, '#aebccf'); grad.addColorStop(.5, '#ffffff'); grad.addColorStop(1, '#d6e4f5');
  ctx.strokeStyle = grad; ctx.lineWidth = 4.5 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
  if (god) {
    ctx.strokeStyle = 'rgba(255,122,223,.6)'; ctx.lineWidth = 8 * s;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function shieldOnArm(ctx, x, y, s, steel, steelD, gold) {
  ctx.save(); ctx.translate(x, y);
  roundRect(ctx, -8 * s, -8 * s, 16 * s, 22 * s, 6 * s);
  const g = ctx.createLinearGradient(-8 * s, -8 * s, 8 * s, 14 * s);
  g.addColorStop(0, lighten(steel, 20)); g.addColorStop(1, steelD);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = gold; ctx.lineWidth = 1.6 * s; ctx.stroke();
  ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(0, 2 * s, 2.6 * s, 0, 7); ctx.fill();
  ctx.restore();
}

function legArmored(ctx, x, top, foot, s, steel, steelD, cloth) {
  ctx.strokeStyle = cloth; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + foot, top + 14 * s); ctx.stroke();
  ctx.fillStyle = steelD; // boot
  ctx.beginPath(); ctx.ellipse(x + foot, top + 15 * s, 5 * s, 3 * s, 0, 0, 7); ctx.fill();
}
function shoulder(ctx, x, y, r, s, steel, steelD) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, lighten(steel, 30)); g.addColorStop(1, steelD);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}

// ---------- MONSTERS ----------
// opts: {x,y,scale,face,t,walk,hurt(0..1),tint}
export function drawMonster(ctx, sprite, o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.face || 1, 1);
  const bob = Math.sin(o.t * 4 + o.x) * 2;
  ctx.translate(0, bob * (sprite === 'wraith' ? 2 : 1));
  if (o.hurt > 0) ctx.filter = `brightness(${1 + o.hurt * 1.4})`;
  switch (sprite) {
    case 'kobold': kobold(ctx, o); break;
    case 'lizardman': lizardman(ctx, o); break;
    case 'wraith': wraith(ctx, o); break;
    case 'ogre': ogre(ctx, o); break;
    case 'golem': golem(ctx, o); break;
    default: lizardman(ctx, o);
  }
  ctx.restore();
}

function body(ctx, tint, x, y, w, h) {
  roundRect(ctx, x, y, w, h, Math.min(w, h) * .4);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, lighten(tint, 34)); g.addColorStop(.6, tint); g.addColorStop(1, darken(tint, 50));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = darken(tint, 70); ctx.lineWidth = 1; ctx.stroke();
}
function eye(ctx, x, y, r, c = '#ffe14a') {
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#1a0a00'; ctx.beginPath(); ctx.arc(x, y, r * .45, 0, 7); ctx.fill();
}

function kobold(ctx, o) {
  const s = o.scale, t = o.tint;
  const stride = Math.sin(o.t * 10 + o.x) * 3 * o.walk;
  ctx.strokeStyle = darken(t, 40); ctx.lineWidth = 2.5 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-3 * s, -6 * s); ctx.lineTo(-3 * s + stride, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3 * s, -6 * s); ctx.lineTo(3 * s - stride, 0); ctx.stroke();
  body(ctx, t, -7 * s, -22 * s, 14 * s, 16 * s); // torso
  // head
  body(ctx, t, -6 * s, -33 * s, 12 * s, 12 * s);
  // ears
  ctx.fillStyle = darken(t, 30);
  tri(ctx, -5 * s, -33 * s, -8 * s, -42 * s, -2 * s, -34 * s);
  tri(ctx, 5 * s, -33 * s, 8 * s, -42 * s, 2 * s, -34 * s);
  eye(ctx, -2.5 * s, -28 * s, 1.8 * s); eye(ctx, 3 * s, -28 * s, 1.8 * s);
  // little spear
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.moveTo(8 * s, -28 * s); ctx.lineTo(11 * s, -6 * s); ctx.stroke();
  ctx.fillStyle = '#cdd'; tri(ctx, 8 * s, -30 * s, 6 * s, -24 * s, 11 * s, -25 * s);
}

function lizardman(ctx, o) {
  const s = o.scale, t = o.tint;
  const stride = Math.sin(o.t * 8 + o.x) * 5 * o.walk;
  // tail
  ctx.strokeStyle = darken(t, 30); ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4 * s, -14 * s);
  ctx.quadraticCurveTo(-18 * s, -10 * s, -22 * s, 0); ctx.stroke();
  // legs
  ctx.lineWidth = 5 * s;
  ctx.beginPath(); ctx.moveTo(-4 * s, -14 * s); ctx.lineTo(-5 * s + stride, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4 * s, -14 * s); ctx.lineTo(5 * s - stride, 0); ctx.stroke();
  // torso
  body(ctx, t, -9 * s, -40 * s, 18 * s, 28 * s);
  // belly stripe
  ctx.fillStyle = lighten(t, 50); roundRect(ctx, -4 * s, -36 * s, 8 * s, 20 * s, 4 * s); ctx.fill();
  // arm + blade
  ctx.strokeStyle = darken(t, 20); ctx.lineWidth = 4.5 * s;
  ctx.beginPath(); ctx.moveTo(7 * s, -34 * s); ctx.lineTo(15 * s, -26 * s); ctx.stroke();
  ctx.strokeStyle = '#b9c6d6'; ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.moveTo(15 * s, -26 * s); ctx.lineTo(24 * s, -40 * s); ctx.stroke();
  // head (snout)
  body(ctx, t, -8 * s, -52 * s, 16 * s, 14 * s);
  ctx.fillStyle = darken(t, 30); roundRect(ctx, 4 * s, -49 * s, 12 * s, 7 * s, 3 * s); ctx.fill();
  // dorsal spikes
  ctx.fillStyle = darken(t, 40);
  for (let i = 0; i < 4; i++) tri(ctx, (-6 + i * 4) * s, -40 * s, (-8 + i * 4) * s, -48 * s, (-4 + i * 4) * s, -40 * s);
  eye(ctx, 6 * s, -48 * s, 2 * s, '#ff5a3a');
}

function wraith(ctx, o) {
  const s = o.scale, t = o.tint;
  const flap = Math.sin(o.t * 8) * 0.5;
  // tattered cloak body
  ctx.fillStyle = `rgba(${hexrgb(t)},.85)`;
  ctx.beginPath();
  ctx.moveTo(0, -46 * s);
  ctx.quadraticCurveTo(16 * s, -30 * s, 10 * s, -4 * s);
  ctx.lineTo(4 * s, -12 * s); ctx.lineTo(0, -2 * s); ctx.lineTo(-4 * s, -12 * s);
  ctx.lineTo(-10 * s, -4 * s);
  ctx.quadraticCurveTo(-16 * s, -30 * s, 0, -46 * s);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -46 * s, 0, 0);
  g.addColorStop(0, lighten(t, 40)); g.addColorStop(1, `rgba(${hexrgb(t)},0)`);
  ctx.fillStyle = g; ctx.fill();
  // wings
  ctx.fillStyle = `rgba(${hexrgb(t)},.45)`;
  for (const dir of [-1, 1]) {
    ctx.save(); ctx.translate(dir * 8 * s, -40 * s); ctx.rotate(dir * (0.5 + flap));
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(dir * 26 * s, -6 * s, dir * 30 * s, 12 * s);
    ctx.quadraticCurveTo(dir * 16 * s, 6 * s, 0, 8 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // glowing eyes
  ctx.shadowColor = '#bfe0ff'; ctx.shadowBlur = 8 * s;
  eye(ctx, -3 * s, -40 * s, 2.2 * s, '#cfeaff'); eye(ctx, 3 * s, -40 * s, 2.2 * s, '#cfeaff');
  ctx.shadowBlur = 0;
}

function ogre(ctx, o) {
  const s = o.scale, t = o.tint;
  const stride = Math.sin(o.t * 5 + o.x) * 4 * o.walk;
  ctx.strokeStyle = darken(t, 40); ctx.lineWidth = 9 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-7 * s, -22 * s); ctx.lineTo(-8 * s + stride, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(7 * s, -22 * s); ctx.lineTo(8 * s - stride, 0); ctx.stroke();
  body(ctx, t, -16 * s, -54 * s, 32 * s, 38 * s);
  ctx.fillStyle = lighten(t, 30); roundRect(ctx, -8 * s, -48 * s, 16 * s, 26 * s, 6 * s); ctx.fill();
  // arms
  ctx.strokeStyle = t; ctx.lineWidth = 8 * s;
  ctx.beginPath(); ctx.moveTo(-13 * s, -48 * s); ctx.lineTo(-20 * s, -22 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(13 * s, -48 * s); ctx.lineTo(22 * s, -28 * s); ctx.stroke();
  // club
  ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 6 * s;
  ctx.beginPath(); ctx.moveTo(22 * s, -28 * s); ctx.lineTo(30 * s, -54 * s); ctx.stroke();
  ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.arc(31 * s, -56 * s, 9 * s, 0, 7); ctx.fill();
  // head
  body(ctx, t, -11 * s, -70 * s, 22 * s, 18 * s);
  eye(ctx, -4 * s, -62 * s, 2.6 * s, '#ffd83a'); eye(ctx, 5 * s, -62 * s, 2.6 * s, '#ffd83a');
  ctx.fillStyle = '#fff'; // tusks
  tri(ctx, -4 * s, -54 * s, -6 * s, -48 * s, -2 * s, -54 * s);
  tri(ctx, 4 * s, -54 * s, 6 * s, -48 * s, 2 * s, -54 * s);
}

function golem(ctx, o) {
  const s = o.scale, t = o.tint;
  const stride = Math.sin(o.t * 3.5 + o.x) * 3 * o.walk;
  // legs (stone blocks)
  blockGrad(ctx, -16 * s, -20 * s, 13 * s, 22 * s, t, stride);
  blockGrad(ctx, 4 * s, -20 * s, 13 * s, 22 * s, t, -stride);
  // torso
  blockGrad(ctx, -22 * s, -62 * s, 44 * s, 44 * s, t, 0);
  // glowing core
  ctx.shadowColor = '#ff8a3a'; ctx.shadowBlur = 16 * s;
  ctx.fillStyle = '#ffb24a'; ctx.beginPath(); ctx.arc(0, -40 * s, 6 * s, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  // arms (huge)
  blockGrad(ctx, -38 * s, -58 * s, 14 * s, 34 * s, t, 0);
  blockGrad(ctx, 24 * s, -58 * s, 14 * s, 34 * s, t, 0);
  // head
  blockGrad(ctx, -13 * s, -80 * s, 26 * s, 20 * s, t, 0);
  eye(ctx, -5 * s, -70 * s, 2.6 * s, '#ff8a3a'); eye(ctx, 5 * s, -70 * s, 2.6 * s, '#ff8a3a');
  // cracks
  ctx.strokeStyle = darken(t, 70); ctx.lineWidth = 1.4 * s;
  ctx.beginPath(); ctx.moveTo(-10 * s, -58 * s); ctx.lineTo(-2 * s, -44 * s); ctx.lineTo(-8 * s, -30 * s); ctx.stroke();
}
function blockGrad(ctx, x, y, w, h, tint, sh) {
  ctx.save(); ctx.translate(sh || 0, 0);
  roundRect(ctx, x, y, w, h, 3);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, lighten(tint, 30)); g.addColorStop(.5, tint); g.addColorStop(1, darken(tint, 45));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = darken(tint, 70); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

// ---------- LOOT ----------
// opts: {x,y,t,color}
export function drawLoot(ctx, o) {
  const pulse = 0.6 + Math.sin(o.t * 4) * 0.4;
  const yb = Math.sin(o.t * 3) * 3;
  ctx.save(); ctx.translate(o.x, o.y);
  // ground glow
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
  g.addColorStop(0, hexa(o.color, .5 * pulse)); g.addColorStop(1, hexa(o.color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 16, 7, 0, 0, 7); ctx.fill();
  // beam
  const bg = ctx.createLinearGradient(0, -34, 0, 0);
  bg.addColorStop(0, hexa(o.color, 0)); bg.addColorStop(1, hexa(o.color, .35 * pulse));
  ctx.fillStyle = bg; ctx.fillRect(-2.5, -34, 5, 34);
  // gem
  ctx.translate(0, -14 + yb);
  ctx.shadowColor = o.color; ctx.shadowBlur = 10;
  ctx.fillStyle = o.color;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 7); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(2.4, 0); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------- helpers ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function tri(ctx, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
}
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function hexrgb(hex) { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }
function hexa(hex, a) { return `rgba(${hexrgb(hex)},${a})`; }
