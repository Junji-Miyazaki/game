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

// ---------- FIGHTER (female swordsman, articulated vector, directional) ----------
// opts: {x,y,scale,face(-1|1),t,walk(0..1),attackP(-1 idle else 0..1),god,view}
// view ∈ 'front' | 'back' | 'side'. Sword = right hand, shield = left hand.
const PAL = {
  SKIN: '#f1c9a5', SKIN_D: '#cf9f78', HAIR: '#5a3620', HAIR_HL: '#8a5630',
  ARM: '#cdd6e3', ARM_D: '#8b97aa', GOLD: '#e8c870',
  SKIRT: '#6a2f73', SKIRT_D: '#431d4a', LEG: '#3c3548', LEG2: '#463f54',
  BOOT: '#5a4a36', LEATHER: '#6b4a2e',
};
function segL(ctx, x1, y1, x2, y2, w, c) {
  ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

export function drawFighter(ctx, o) {
  const s = o.scale, face = o.face >= 0 ? 1 : -1, t = o.t || 0;
  const walk = o.walk || 0, atk = (o.attackP == null ? -1 : o.attackP), god = !!o.god;
  const view = o.view || 'front';
  const moving = walk > 0.05;
  const bob = (moving ? Math.abs(Math.sin(t * 9)) * 2.4 : Math.sin(t * 2.2) * 1.0) * s;

  ctx.save();
  ctx.translate(o.x, o.y - bob);
  if (god) {
    const ag = ctx.createRadialGradient(0, -38 * s, 0, 0, -38 * s, 52 * s);
    ag.addColorStop(0, 'rgba(255,122,223,.30)'); ag.addColorStop(1, 'rgba(255,122,223,0)');
    ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(0, -38 * s, 52 * s, 0, 7); ctx.fill();
  }
  const D = { s, face, t, walk, atk, god, moving };
  if (view === 'back') fighterBack(ctx, D);
  else if (view === 'side') fighterSide(ctx, D);
  else fighterFront(ctx, D);
  ctx.restore();
}

function fighterFront(ctx, D) {
  const { s, face, t, walk, atk, god, moving } = D, P = PAL;
  const sway = Math.sin(t * 3) * 2 * s + (moving ? Math.sin(t * 9) * 2 * s : 0);
  // ponytail behind (long, flows opposite facing)
  ctx.fillStyle = P.HAIR;
  ctx.beginPath();
  ctx.moveTo(-face * 3 * s, -57 * s);
  ctx.quadraticCurveTo(-face * 17 * s, -50 * s + sway, -face * 13 * s, -27 * s + sway);
  ctx.quadraticCurveTo(-face * 11 * s, -40 * s, -face * 3 * s, -50 * s);
  ctx.closePath(); ctx.fill();
  // legs
  const stride = moving ? Math.sin(t * 9) : Math.sin(t * 2.2) * 0.06;
  drawLeg(ctx, -2.5 * s, -26 * s, -stride, s, P.LEG, P.BOOT, face);
  drawLeg(ctx, 2.5 * s, -26 * s, stride, s, P.LEG2, P.BOOT, face);
  // skirt
  ctx.fillStyle = P.SKIRT;
  ctx.beginPath();
  ctx.moveTo(-7 * s, -32 * s); ctx.lineTo(7 * s, -32 * s); ctx.lineTo(10 * s, -19 * s);
  ctx.lineTo(face * 2 * s, -17 * s); ctx.lineTo(-10 * s, -19 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.SKIRT_D; ctx.fillRect(-10 * s, -20.5 * s, 20 * s, 2.4 * s);
  // shield arm (LEFT hand = +x) behind torso
  const shB = moving ? Math.sin(t * 9 + Math.PI) * 1.5 * s : 0;
  segL(ctx, 5.5 * s, -46 * s, 11 * s, -33 * s + shB, 4.5 * s, P.SKIN);
  // torso (slim hourglass)
  ctx.beginPath();
  ctx.moveTo(-6.5 * s, -47 * s);
  ctx.quadraticCurveTo(-7.5 * s, -39 * s, -4 * s, -32 * s);
  ctx.lineTo(4 * s, -32 * s);
  ctx.quadraticCurveTo(7.5 * s, -39 * s, 6.5 * s, -47 * s);
  ctx.quadraticCurveTo(3.2 * s, -50.5 * s, 0, -48.6 * s);
  ctx.quadraticCurveTo(-3.2 * s, -50.5 * s, -6.5 * s, -47 * s);
  ctx.closePath();
  const tg = ctx.createLinearGradient(-7 * s, -50 * s, 7 * s, -32 * s);
  tg.addColorStop(0, '#eef2f8'); tg.addColorStop(.5, P.ARM); tg.addColorStop(1, P.ARM_D);
  ctx.fillStyle = tg; ctx.fill();
  ctx.strokeStyle = '#6c7891'; ctx.lineWidth = 1 * s; ctx.stroke();
  segL(ctx, 0, -48 * s, 0, -32 * s, 1.2 * s, P.GOLD);
  ctx.fillStyle = P.GOLD; ctx.fillRect(-4.5 * s, -33.5 * s, 9 * s, 1.8 * s);
  // pauldrons
  ctx.fillStyle = P.ARM_D;
  ctx.beginPath(); ctx.ellipse(-6.5 * s, -46 * s, 3.2 * s, 2.4 * s, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(6.5 * s, -46 * s, 3.2 * s, 2.4 * s, 0, 0, 7); ctx.fill();
  // neck + head
  ctx.fillStyle = P.SKIN_D; ctx.fillRect(-1.8 * s, -51 * s, 3.6 * s, 3.5 * s);
  ctx.fillStyle = P.SKIN; ctx.beginPath(); ctx.arc(face * 0.5 * s, -56 * s, 5.5 * s, 0, 7); ctx.fill();
  ctx.fillStyle = P.HAIR;
  ctx.beginPath();
  ctx.arc(0, -57.5 * s, 6.1 * s, Math.PI * 0.92, Math.PI * 2.08);
  ctx.quadraticCurveTo(face * 6 * s, -55 * s, face * 4 * s, -53.5 * s);
  ctx.quadraticCurveTo(0, -56 * s, -face * 4 * s, -54 * s);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2a22';
  ctx.beginPath(); ctx.arc(face * 1.8 * s, -56 * s, 1 * s, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(face * 4 * s, -56 * s, 1 * s, 0, 7); ctx.fill();
  // shield (LEFT hand, front, +x)
  ctx.save(); ctx.translate(12 * s, -30 * s + shB);
  const sg = ctx.createRadialGradient(-2 * s, -2 * s, 1, 0, 0, 11 * s);
  sg.addColorStop(0, '#cfd7e3'); sg.addColorStop(1, '#7d889d');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, 9 * s, 0, 7); ctx.fill();
  ctx.strokeStyle = P.GOLD; ctx.lineWidth = 2 * s; ctx.stroke();
  ctx.fillStyle = P.GOLD; ctx.beginPath(); ctx.arc(0, 0, 2.6 * s, 0, 7); ctx.fill();
  ctx.restore();
  // sword arm (RIGHT hand = -x)
  drawSwordArm(ctx, -5 * s, -46 * s, atk, t, face, s, P.SKIN, P.GOLD, god);
}

function fighterBack(ctx, D) {
  const { s, t, walk, atk, god, moving } = D, P = PAL;
  const stride = moving ? Math.sin(t * 9) : 0;
  drawLeg(ctx, -2.5 * s, -26 * s, -stride, s, P.LEG, P.BOOT, 1);
  drawLeg(ctx, 2.5 * s, -26 * s, stride, s, P.LEG2, P.BOOT, 1);
  ctx.fillStyle = P.SKIRT;
  ctx.beginPath(); ctx.moveTo(-7 * s, -32 * s); ctx.lineTo(7 * s, -32 * s);
  ctx.lineTo(10 * s, -19 * s); ctx.lineTo(-10 * s, -19 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.SKIRT_D; ctx.fillRect(-10 * s, -20.5 * s, 20 * s, 2.4 * s);
  // shield arm LEFT (-x from behind), sword arm RIGHT (+x)
  const shB = moving ? Math.sin(t * 9 + Math.PI) * 1.5 * s : 0;
  segL(ctx, -5.5 * s, -46 * s, -11 * s, -33 * s + shB, 4.5 * s, P.SKIN);
  // torso back
  ctx.beginPath();
  ctx.moveTo(-6.5 * s, -47 * s);
  ctx.quadraticCurveTo(-7.5 * s, -39 * s, -4 * s, -32 * s);
  ctx.lineTo(4 * s, -32 * s);
  ctx.quadraticCurveTo(7.5 * s, -39 * s, 6.5 * s, -47 * s);
  ctx.closePath();
  const tg = ctx.createLinearGradient(-7 * s, -47 * s, 7 * s, -32 * s);
  tg.addColorStop(0, '#dfe6f0'); tg.addColorStop(.5, P.ARM); tg.addColorStop(1, P.ARM_D);
  ctx.fillStyle = tg; ctx.fill(); ctx.strokeStyle = '#6c7891'; ctx.lineWidth = 1 * s; ctx.stroke();
  // back straps (X)
  ctx.strokeStyle = P.LEATHER; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-5 * s, -46 * s); ctx.lineTo(5 * s, -34 * s);
  ctx.moveTo(5 * s, -46 * s); ctx.lineTo(-5 * s, -34 * s); ctx.stroke();
  ctx.fillStyle = P.ARM_D;
  ctx.beginPath(); ctx.ellipse(-6.5 * s, -46 * s, 3.2 * s, 2.4 * s, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(6.5 * s, -46 * s, 3.2 * s, 2.4 * s, 0, 0, 7); ctx.fill();
  // head from behind (hair only) + band
  ctx.fillStyle = P.SKIN_D; ctx.fillRect(-1.8 * s, -51 * s, 3.6 * s, 3.5 * s);
  ctx.fillStyle = P.HAIR; ctx.beginPath(); ctx.arc(0, -56 * s, 6 * s, 0, 7); ctx.fill();
  ctx.fillStyle = P.GOLD; ctx.fillRect(-5 * s, -58.5 * s, 10 * s, 1.6 * s);
  // long ponytail down the back
  const psw = Math.sin(t * 3) * 2 * s + (moving ? Math.sin(t * 9) * 2 * s : 0);
  ctx.fillStyle = P.HAIR;
  ctx.beginPath();
  ctx.moveTo(-3.5 * s, -54 * s);
  ctx.quadraticCurveTo(-4 * s + psw * 0.3, -40 * s, -2.5 * s + psw, -25 * s);
  ctx.quadraticCurveTo(0 + psw, -21 * s, 2.5 * s + psw, -25 * s);
  ctx.quadraticCurveTo(4 * s + psw * 0.3, -40 * s, 3.5 * s, -54 * s);
  ctx.closePath(); ctx.fill();
  // shield back (-x)
  ctx.save(); ctx.translate(-12 * s, -30 * s + shB);
  ctx.fillStyle = '#6f7a8c'; ctx.beginPath(); ctx.arc(0, 0, 9 * s, 0, 7); ctx.fill();
  ctx.strokeStyle = P.ARM_D; ctx.lineWidth = 2 * s; ctx.stroke();
  ctx.restore();
  drawSwordArm(ctx, 5 * s, -46 * s, atk, t, 1, s, P.SKIN, P.GOLD, god);
}

function fighterSide(ctx, D) {
  const { s, face, t, walk, atk, god, moving } = D, P = PAL;
  ctx.save(); ctx.scale(face, 1);                 // draw facing right; mirror for left
  const stride = moving ? Math.sin(t * 9) : Math.sin(t * 2.2) * 0.05;
  drawLeg(ctx, -1 * s, -26 * s, -stride * 1.3, s, darken(P.LEG, 18), P.BOOT, 1);  // far leg
  ctx.fillStyle = P.SKIRT;
  ctx.beginPath(); ctx.moveTo(-5 * s, -32 * s); ctx.lineTo(6 * s, -32 * s);
  ctx.lineTo(7 * s, -19 * s); ctx.lineTo(-6 * s, -19 * s); ctx.closePath(); ctx.fill();
  drawLeg(ctx, 1.5 * s, -26 * s, stride * 1.3, s, P.LEG2, P.BOOT, 1);            // near leg
  // ponytail trailing behind (-x)
  const sway = Math.sin(t * 3) * 2 * s + (moving ? Math.sin(t * 9) * 2 * s : 0);
  ctx.fillStyle = P.HAIR;
  ctx.beginPath();
  ctx.moveTo(-2 * s, -57 * s);
  ctx.quadraticCurveTo(-17 * s, -51 * s + sway, -15 * s, -32 * s + sway);
  ctx.quadraticCurveTo(-9 * s, -44 * s, -2 * s, -52 * s);
  ctx.closePath(); ctx.fill();
  const shB = moving ? Math.sin(t * 9 + Math.PI) * 1.5 * s : 0;
  // torso profile (chest forward +x)
  ctx.beginPath();
  ctx.moveTo(-4 * s, -47 * s);
  ctx.quadraticCurveTo(5 * s, -45 * s, 4.5 * s, -38 * s);
  ctx.quadraticCurveTo(5 * s, -34 * s, 2 * s, -32 * s);
  ctx.lineTo(-3 * s, -32 * s);
  ctx.quadraticCurveTo(-5 * s, -40 * s, -4 * s, -47 * s);
  ctx.closePath();
  const tg = ctx.createLinearGradient(-4 * s, -47 * s, 5 * s, -32 * s);
  tg.addColorStop(0, P.ARM); tg.addColorStop(1, P.ARM_D);
  ctx.fillStyle = tg; ctx.fill(); ctx.strokeStyle = '#6c7891'; ctx.lineWidth = 1 * s; ctx.stroke();
  ctx.fillStyle = P.ARM_D; ctx.beginPath(); ctx.ellipse(-1 * s, -46 * s, 3.4 * s, 2.6 * s, 0, 0, 7); ctx.fill();
  // head profile
  ctx.fillStyle = P.SKIN_D; ctx.fillRect(-1.5 * s, -51 * s, 3 * s, 3.5 * s);
  ctx.fillStyle = P.SKIN; ctx.beginPath(); ctx.arc(0.5 * s, -56 * s, 5.3 * s, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(5 * s, -56.5 * s); ctx.lineTo(6.6 * s, -54.8 * s); ctx.lineTo(5 * s, -53.4 * s); ctx.closePath(); ctx.fill(); // nose
  ctx.fillStyle = P.HAIR;
  ctx.beginPath(); ctx.arc(0, -57.5 * s, 5.9 * s, Math.PI * 0.72, Math.PI * 2.12); ctx.lineTo(-1.5 * s, -53 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2a22'; ctx.beginPath(); ctx.arc(3 * s, -56 * s, 1 * s, 0, 7); ctx.fill();
  // shield on near arm (in front of torso)
  ctx.save(); ctx.translate(2 * s, -30 * s + shB);
  ctx.fillStyle = '#9aa6ba'; ctx.beginPath(); ctx.ellipse(0, 0, 4.5 * s, 9 * s, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = P.GOLD; ctx.lineWidth = 1.6 * s; ctx.stroke();
  ctx.restore();
  // sword arm forward (face=1 inside the mirrored space)
  drawSwordArm(ctx, 3 * s, -46 * s, atk, t, 1, s, P.SKIN, P.GOLD, god);
  ctx.restore();
}

function drawLeg(ctx, hipX, hipY, phase, s, col, boot, face) {
  const thigh = 12 * s, shin = 12 * s;
  const a1 = Math.PI / 2 + phase * 0.5 * face;       // swing along facing
  const kx = hipX + Math.cos(a1) * thigh, ky = hipY + Math.sin(a1) * thigh;
  const a2 = a1 + (phase * face < 0 ? 0.55 : 0.08);  // bend the trailing knee
  const fx = kx + Math.cos(a2) * shin, fy = ky + Math.sin(a2) * shin;
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  ctx.lineWidth = 5.5 * s; ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.lineWidth = 4.5 * s; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
  ctx.fillStyle = boot; ctx.beginPath(); ctx.ellipse(fx + face * 2 * s, fy + 1 * s, 5 * s, 2.8 * s, 0, 0, 7); ctx.fill();
}

// Sword arm with raise→strike→recover. Joints given as forehand keyframes (dx,dy
// from shoulder); x is multiplied by `face` so the blade leads toward facing while
// the shoulder stays on screen-right (= the right hand, always).
function drawSwordArm(ctx, sx, sy, atk, t, face, s, skin, gold, god) {
  const KF = {
    idle:   { e: [2, 10],  h: [3, 20],  p: [4, 41] },   // sword lowered
    wind:   { e: [-3, -7], h: [-8, -17], p: [-5, -42] }, // raised overhead (windup)
    strike: { e: [9, -4],  h: [19, 2],  p: [40, 9] },   // extended forward
    down:   { e: [5, 9],   h: [10, 21], p: [16, 41] },  // cut-through, low
  };
  let A, B, f;
  if (atk < 0)        { A = KF.idle;  B = KF.idle;  f = 0; }
  else if (atk < .25) { A = KF.idle;  B = KF.wind;  f = atk / .25; }
  else if (atk < .50) { A = KF.wind;  B = KF.strike; f = (atk - .25) / .25; }
  else if (atk < .70) { A = KF.strike; B = KF.down; f = (atk - .50) / .20; }
  else                { A = KF.down;  B = KF.idle;  f = (atk - .70) / .30; }
  const mix = (a, b) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const e = mix(A.e, B.e), h = mix(A.h, B.h), p = mix(A.p, B.p);
  const ex = sx + e[0] * face * s, ey = sy + e[1] * s;
  const hx = sx + h[0] * face * s, hy = sy + h[1] * s;
  const tx = sx + p[0] * face * s, ty = sy + p[1] * s;

  // motion-blur arc during the strike
  if (atk >= .28 && atk < .64) {
    const k = (atk - .28) / .36;
    ctx.strokeStyle = god ? `rgba(255,122,223,${.6 * (1 - k)})` : `rgba(220,235,255,${.5 * (1 - k)})`;
    ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
    const a0 = -1.7, a1 = 0.6;
    ctx.beginPath();
    if (face >= 0) ctx.arc(sx, sy + 4 * s, 36 * s, a0, a1);
    else ctx.arc(sx, sy + 4 * s, 36 * s, Math.PI - a1, Math.PI - a0);
    ctx.stroke();
  }

  // arm: upper (skin) + forearm (skin)
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#e6bd97'; ctx.lineWidth = 5 * s;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = skin; ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();

  // sword: guard, then blade hand→tip
  const bx = tx - hx, by = ty - hy, bl = Math.hypot(bx, by) || 1, nx = -by / bl, ny = bx / bl;
  ctx.strokeStyle = gold; ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(hx + nx * 5 * s, hy + ny * 5 * s); ctx.lineTo(hx - nx * 5 * s, hy - ny * 5 * s);
  ctx.stroke();
  const bg = ctx.createLinearGradient(hx, hy, tx, ty);
  bg.addColorStop(0, '#aebccf'); bg.addColorStop(.5, '#ffffff'); bg.addColorStop(1, '#dce8f6');
  ctx.strokeStyle = bg; ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
  if (god) {
    ctx.strokeStyle = 'rgba(255,122,223,.55)'; ctx.lineWidth = 8 * s;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
  }
  ctx.lineCap = 'butt';
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
    case 'skeleton': skeleton(ctx, o); break;
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

function skeleton(ctx, o) {
  const s = o.scale, t = o.tint;
  const stride = Math.sin(o.t * 8 + o.x) * 4 * o.walk;
  const bone = t, boneD = darken(t, 45);
  ctx.strokeStyle = boneD; ctx.lineCap = 'round';
  // legs (bone)
  ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.moveTo(-3 * s, -16 * s); ctx.lineTo(-4 * s + stride, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3 * s, -16 * s); ctx.lineTo(4 * s - stride, 0); ctx.stroke();
  // spine + ribcage
  ctx.strokeStyle = bone; ctx.lineWidth = 3.5 * s;
  ctx.beginPath(); ctx.moveTo(0, -40 * s); ctx.lineTo(0, -16 * s); ctx.stroke();
  ctx.strokeStyle = boneD; ctx.lineWidth = 1.6 * s;
  for (let i = 0; i < 4; i++) {
    const y = (-36 + i * 5) * s, w = (6 - i * 0.6) * s;
    ctx.beginPath(); ctx.moveTo(-w, y); ctx.quadraticCurveTo(0, y + 2 * s, w, y); ctx.stroke();
  }
  // arms — one holds a rusty sword
  ctx.strokeStyle = bone; ctx.lineWidth = 2.6 * s;
  ctx.beginPath(); ctx.moveTo(-5 * s, -38 * s); ctx.lineTo(-10 * s, -24 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5 * s, -38 * s); ctx.lineTo(12 * s, -30 * s); ctx.stroke();
  ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 2.4 * s;
  ctx.beginPath(); ctx.moveTo(12 * s, -30 * s); ctx.lineTo(20 * s, -46 * s); ctx.stroke();
  // skull
  ctx.fillStyle = bone;
  ctx.beginPath(); ctx.arc(0, -46 * s, 5.4 * s, 0, 7); ctx.fill();
  ctx.fillStyle = boneD; ctx.fillRect(-3.5 * s, -42 * s, 7 * s, 3 * s); // jaw
  // eye sockets (glowing)
  ctx.fillStyle = '#ff5a3a';
  ctx.beginPath(); ctx.arc(-2.2 * s, -47 * s, 1.4 * s, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(2.2 * s, -47 * s, 1.4 * s, 0, 7); ctx.fill();
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
