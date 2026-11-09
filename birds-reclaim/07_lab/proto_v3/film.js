// BIRDS RECLAIM 試作 v3 — 映画風の冒頭と終わり（白黒の字幕カード、日本語・英語・フランス語）
// ヌーヴェル・ヴァーグや無声映画の「技法」だけを借りる：字幕カード、ちらつき、粒子、傷、アイリス、原色の題字、FIN。
// 実在の映画の映像・題字・書体は写さない。
// 冒頭は毎回流れる。始まりの画面で「次から冒頭を表示しない」にチェックすると省ける（地図のフィルムのボタンでいつでも見られる）。終わりは13都市をすべて還した時に流れる。
// 確かめ用：v3.html?intro で冒頭、v3.html?ending で終わりをすぐ流す。
const FW = { y: 185, h: 270 }; // 縦長の画面の真ん中に開ける、昔の映画の比率（4:3）の窓
const R_SKIP = { x: 250, y: 584, w: 100, h: 36 };
const FILM_INTRO = [
  { k: 'leader', d: 1.2 }, // タップのあと、黒から 1.2 秒でカードがフェードインする
  { k: 'card', d: 4.4, snd: 'rumble', ja: '6600万年前、空から星が落ちた。', en: '66 million years ago, a star fell from the sky.', fr: "Il y a 66 millions d'années, une étoile est tombée du ciel." },
  { k: 'card', d: 4.2, snd: 'wing', ja: '生き残った恐竜は、羽を持っていた。', en: 'The dinosaurs that survived had feathers.', fr: 'Les dinosaures qui ont survécu avaient des plumes.' },
  { k: 'card', d: 3.8, snd: 'none', ja: '人がこの星に現れて、30万年。', en: 'Humans appeared 300,000 years ago.', fr: 'Les humains sont apparus il y a 300 000 ans.' },
  // ゴダール風の「ずれ」：この1枚だけフランス語を大きく出す
  { k: 'card', d: 4.6, snd: 'hum', towers: 1, frBig: 1, ja: 'ガラスと光の塔が空を埋めて、まだ100年。', en: 'Towers of glass and light have filled the sky for barely a century.', fr: 'Les tours de verre et de lumière remplissent le ciel depuis à peine un siècle.' },
  { k: 'peck', d: 7, snd: 'flock', ja: '鳥たちは、取り戻しにいく。', en: 'The birds are coming to take it back.', fr: 'Les oiseaux viennent le reprendre.' },
  { k: 'title', d: 1.9, snd: 'none' },
  { k: 'iris', d: 1.5 },
];
const FILM_END = [
  { k: 'credits', d: 17, snd: 'chirp' },
  { k: 'card', d: 4.6, snd: 'none', ja: '鳥たちは、勝ったとは思っていない。', en: 'The birds do not think they have won.', fr: 'Les oiseaux ne pensent pas avoir gagné.' },
  { k: 'card', d: 5.2, snd: 'none', ja: 'ただ、夜が暗くなり、空が静かになった。', en: 'Only, the nights grew dark, and the sky grew quiet.', fr: 'Seulement, les nuits sont devenues sombres, et le ciel silencieux.' },
  { k: 'fin', d: 3.8, snd: 'fin' },
  { k: 'iris', d: 1.5 },
];
let FILM = null;
function filmStart(kind) {
  FILM = { kind, list: kind === 'end' ? FILM_END : FILM_INTRO, i: 0, t: 0, wait: kind !== 'end', blocks: null, flock: null, proj: null };
  scene = 'film'; if (!FILM.wait) { projOn(); cardEnter(); }
}
function filmEnd() {
  projOff(); const k = FILM && FILM.kind; FILM = null;
  if (k === 'intro') { SV.intro = 1; save(); }
  mapEnter(); if (k === 'end') { M.fresh = STAGES.length - 1; M.freshT = 0; }
}
function filmTap(x, y) {
  if (inR(x, y, R_SND)) { toggleMute(); return; }
  if (FILM.wait) { if (FILM.kind === 'intro' && inR(x, y, R_NOSHOW)) { SV.skipIntro = SV.skipIntro ? 0 : 1; save(); sfx('tick'); return; } FILM.wait = 0; FILM.t = 0; projOn(); return; } // ここで音が鳴らせるようになる
  if (inR(x, y, R_SKIP)) { filmEnd(); return; }
  const K = FILM.list[FILM.i]; if (K && K.k !== 'iris') FILM.t = K.d; // タップで次のカードへ
}
function stepFilm(dt) {
  if (!FILM || FILM.wait) return; FILM.t += dt; const K = FILM.list[FILM.i];
  if (K.k === 'iris') stepMap(dt);
  if (K.k === 'peck') stepPeck(dt);
  if (FILM.t >= K.d) { FILM.i++; FILM.t = 0; if (FILM.i >= FILM.list.length) { filmEnd(); return; } cardEnter(); }
}
function cardEnter() {
  const K = FILM.list[FILM.i]; if (K.k === 'iris') { mapEnter(); scene = 'film'; }
  if (K.k === 'peck') { FILM.blocks = textBlocks(K.ja); FILM.flock = []; }
  if (!AC || muted) return;
  try {
    if (K.snd === 'rumble') { tone(42, 3.2, .2, 'sine', 28); nz(2.6, 'lowpass', 160, .7, .14, 60); }
    else if (K.snd === 'wing') { nz(.22, 'bandpass', 700, .9, .12); nz(.22, 'bandpass', 600, .9, .1, 0); setTimeout(() => AC && nz(.22, 'bandpass', 650, .9, .12), 380); }
    else if (K.snd === 'hum') { tone(120, 4.4, .022, 'sawtooth'); tone(240, 4.4, .008, 'sawtooth'); }
    else if (K.snd === 'chirp') chirp(10, 14);
    else if (K.snd === 'fin') tone(98, 3.4, .06, 'sine', 70);
  } catch (e) { }
}
// 映写機の回る音：雑音を 24 コマ／秒で刻む
function projOn() {
  if (!AC || FILM.proj) return;
  try { const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), l = AC.createOscillator(), lg = AC.createGain();
    s.buffer = NB; s.loop = true; f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = .8; g.gain.value = .014; l.type = 'square'; l.frequency.value = 24; lg.gain.value = .008;
    l.connect(lg); lg.connect(g.gain); s.connect(f); f.connect(g); g.connect(MG || AC.destination); s.start(); l.start(); FILM.proj = [s, l]; } catch (e) { }
}
function projOff() { if (FILM && FILM.proj) { try { for (const n of FILM.proj) n.stop(); } catch (e) { } FILM.proj = null; } }

// ---------- 描く ----------
function filmGrain(t, y0, h, k) {
  for (let i = 0; i < 170 * k; i++) { c.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,' + (.04 + Math.random() * .08) * k + ')' : 'rgba(0,0,0,' + (.08 + Math.random() * .12) * k + ')'; c.fillRect(Math.random() * W, y0 + Math.random() * h, Math.random() < .1 ? 2 : 1, 1); }
  if (Math.random() < .35 * k) { c.fillStyle = 'rgba(232,230,222,' + .14 * k + ')'; c.fillRect(Math.floor(Math.random() * W), y0, 1, h); } // 縦の傷
  if (Math.random() < .18 * k) { c.fillStyle = 'rgba(8,8,8,.55)'; c.beginPath(); c.arc(Math.random() * W, y0 + Math.random() * h, .8 + Math.random() * 2.2, 0, 7); c.fill(); } // ほこり
}
// 窓の中を描く。ちらつき・1px の揺れ・粒子・四隅の暗さ
function filmFrame(t, body, bg) {
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const wy = FW.y, wh = FW.h, fl = .9 + Math.random() * .1;
  c.save(); c.beginPath(); c.rect(0, wy, W, wh); c.clip(); c.translate((Math.random() - .5) * 1.2, (Math.random() - .5) * 1.2);
  c.fillStyle = bg || 'rgb(' + [26, 25, 23].map(v => Math.round(v * fl)).join(',') + ')'; c.fillRect(-2, wy - 2, W + 4, wh + 4);
  body(wy, wh, fl); filmGrain(t, wy, wh, 1);
  const g = c.createRadialGradient(W / 2, wy + wh / 2, 70, W / 2, wy + wh / 2, 240); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)'); c.fillStyle = g; c.fillRect(0, wy, W, wh);
  c.restore();
}
const LATIN = '600 italic 11px Georgia,"Times New Roman",serif';
// 字幕用の折り返し：日本語は文字ごと、英語・フランス語は単語ごと
function wrapF(s, font, maxW) {
  c.font = font; const out = []; let cur = ''; const parts = /\s/.test(s) ? s.split(' ').map((w, i) => (i ? ' ' : '') + w) : [...s];
  for (const p of parts) { if (cur && c.measureText(cur + p).width > maxW) { out.push(cur); cur = p.trimStart(); } else cur += p; } if (cur) out.push(cur); return out;
}
function lines(arr, font, x, y, lh, col) { c.font = font; c.fillStyle = col; c.textAlign = 'center'; for (const l of arr) { c.fillText(l, x, y); y += lh; } return y; }
// 字幕カード：大きい1言語＋小さい2言語
function drawCardText(K, a, wy, wh) {
  const JA = '600 17px ' + SERIF, FRB = '600 italic 16px Georgia,"Times New Roman",serif';
  const big = K.frBig ? wrapF(K.fr, FRB, W - 56) : wrapF(K.ja, JA, W - 56), s1 = wrapF(K.en, LATIN, W - 70), s2 = K.frBig ? wrapF(K.ja, '500 11px ' + SERIF, W - 70) : wrapF(K.fr, LATIN, W - 70);
  const hh = big.length * 24 + 16 + (s1.length + s2.length) * 15 + 6; let y = wy + wh / 2 - hh / 2 + 16; c.globalAlpha = a;
  y = lines(big, K.frBig ? FRB : JA, W / 2, y, 24, '#ECE7DC'); y += 14;
  y = lines(s1, LATIN, W / 2, y, 15, 'rgba(236,231,220,.72)'); y += 4; lines(s2, K.frBig ? '500 11px ' + SERIF : LATIN, W / 2, y, 15, 'rgba(236,231,220,.72)');
  c.globalAlpha = 1;
}
const fade = (t, d) => Math.max(0, Math.min(1, t / .6, (d - t) / .5));
function drawFilm(t) {
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.textBaseline = 'alphabetic';
  if (!FILM) return; const K = FILM.list[FILM.i], ft = FILM.t;
  if (K.k === 'iris') { // 丸く開いて、色の付いた地球儀へ
    drawMap(t); const u = Math.min(1, ft / K.d), r = u * u * 480;
    c.fillStyle = '#000'; c.beginPath(); c.rect(0, 0, W, H); c.arc(W / 2, GC.y, Math.max(.1, r), 0, 7); c.fill('evenodd'); return;
  }
  if (K.k === 'title') { drawTitle(t, ft); }
  else filmFrame(t, (wy, wh, fl) => {
    if (K.k === 'leader') drawLeader(t, ft, wy, wh);
    else if (K.k === 'card') { if (K.towers) drawTowers(t, fade(ft, K.d), wy, wh); drawCardText(K, fade(ft, K.d), wy, wh); }
    else if (K.k === 'peck') drawPeck(t, K, ft, wy, wh);
    else if (K.k === 'credits') drawCredits(t, K, ft, wy, wh);
    else if (K.k === 'fin') { const a = fade(ft, K.d); c.globalAlpha = a; c.fillStyle = '#ECE7DC'; c.textAlign = 'center'; c.font = '600 italic 46px Georgia,"Times New Roman",serif'; c.fillText('FIN', W / 2, wy + wh / 2 + 10); c.font = '500 10px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.6)'; c.fillText('BIRDS RECLAIM', W / 2, wy + wh / 2 + 40); c.globalAlpha = 1; }
  });
  if (FILM.wait && FILM.kind === 'intro') drawNoShow();
  if (!FILM.wait) { c.font = F(11, 600); c.fillStyle = 'rgba(255,255,255,.4)'; c.textAlign = 'right'; c.fillText('スキップ  ›', W - 24, R_SKIP.y + 23); c.textAlign = 'left'; }
  drawToggles();
}
// 始まり：黒い窓に「タップでスタート」。下に「次から表示しない」のチェック。タップのあとは黒から静かに始める
const R_NOSHOW = { x: 96, y: 486, w: 168, h: 34 };
function drawLeader(t, ft, wy, wh) {
  if (!FILM.wait) return; const cx = W / 2, cy = wy + wh / 2, a = .75 + .25 * Math.sin(t * 2.4);
  c.textAlign = 'center'; c.globalAlpha = a; c.fillStyle = '#ECE7DC'; c.font = '600 15px ' + SERIF; c.fillText('タップでスタート', cx, cy - 2);
  c.font = LATIN; c.fillStyle = 'rgba(236,231,220,.6)'; c.fillText('Tap to start', cx, cy + 18); c.globalAlpha = 1;
}
function drawNoShow() { // 窓の外（黒い所）に描く
  const R = R_NOSHOW, on = !!SV.skipIntro; c.strokeStyle = 'rgba(236,231,220,.55)'; c.lineWidth = 1.2; c.strokeRect(R.x + 6, R.y + 10, 13, 13);
  if (on) { c.strokeStyle = '#ECE7DC'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(R.x + 9, R.y + 17); c.lineTo(R.x + 12, R.y + 20.5); c.lineTo(R.x + 17, R.y + 12.5); c.stroke(); }
  c.font = '500 11.5px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.7)'; c.textAlign = 'left'; c.fillText('次から冒頭を表示しない', R.x + 27, R.y + 21);
}
// 「ガラスと光の塔」のカードの奥に、塔の影と窓の明かり
function drawTowers(t, a, wy, wh) {
  c.globalAlpha = a * .7; let x = -6;
  for (let i = 0; x < W; i++) { const w = 18 + hash(i, 2) * 26, h = 40 + hash(i, 5) * 120; c.fillStyle = '#3A3936'; c.fillRect(x, wy + wh - h, w, h); c.fillStyle = 'rgba(236,231,220,.5)'; for (let r = 0; r < h / 9 - 1; r++) for (let k = 0; k < w / 7 - 1; k++) if (hash(i * 31 + r, k + Math.floor(t * 2)) < .22) c.fillRect(x + 4 + k * 7, wy + wh - h + 6 + r * 9, 2, 3); x += w + 4; }
  c.globalAlpha = 1;
}
// 鳥が文字をついばむ：日本語の文字をマスに分け、群れが通った所から崩れ落ちる
function textBlocks(s) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return [];
  try {
    const o = document.createElement('canvas'), q = o.getContext('2d'), sc = 2; o.width = W * sc; o.height = 40 * sc; q.scale(sc, sc);
    q.font = '600 17px ' + SERIF; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillStyle = '#fff'; q.fillText(s, W / 2, 20);
    const d = q.getImageData(0, 0, o.width, o.height).data, out = [], st = 2;
    for (let y = 0; y < 40; y += st) for (let x = 0; x < W; x += st) if (d[((y * sc) * o.width + x * sc) * 4 + 3] > 110) out.push({ x, y: y - 20, f: 0, vx: 0, vy: 0, dy: 0 });
    return out;
  } catch (e) { return []; }
}
function stepPeck(dt) {
  const F0 = FILM, ft = F0.t; if (!F0.flock) return;
  if (ft > 2.6 && F0.flock.length < 34 && Math.random() < dt * 40) F0.flock.push({ x: -30 - Math.random() * 60, y: (Math.random() - .5) * 70, ph: Math.random() * 6, v: 150 + Math.random() * 70, s: 5 + Math.random() * 3 });
  for (const b of F0.flock) { b.x += b.v * dt; b.y += Math.sin(ft * 3 + b.ph) * 18 * dt; }
  for (const k of F0.blocks || []) {
    if (!k.f) { for (const b of F0.flock) if (b.x > k.x - 3 && b.x < k.x + 8 && Math.abs(b.y - k.y) < 26 && Math.random() < .12) { k.f = 1; k.vx = (Math.random() - .3) * 60; k.vy = -Math.random() * 50; break; } }
    else { k.vy += 420 * dt; k.x += k.vx * dt; k.dy += k.vy * dt; }
  }
}
function drawPeck(t, K, ft, wy, wh) {
  const a = fade(ft, K.d), cy = wy + wh / 2 - 14; c.globalAlpha = a;
  if (FILM.blocks && FILM.blocks.length) { c.fillStyle = '#ECE7DC'; for (const k of FILM.blocks) if (k.dy < 200) c.fillRect(k.x, cy + k.y + k.dy, 2, 2); }
  else lines([K.ja], '600 17px ' + SERIF, W / 2, cy + 6, 24, 'rgba(236,231,220,' + Math.max(0, 1 - Math.max(0, ft - 2.6) / 1.2) + ')');
  lines(wrapF(K.en, LATIN, W - 70), LATIN, W / 2, cy + 40, 15, 'rgba(236,231,220,.72)'); lines(wrapF(K.fr, LATIN, W - 70), LATIN, W / 2, cy + 58, 15, 'rgba(236,231,220,.72)');
  c.globalAlpha = 1; for (const b of FILM.flock || []) birdS(b.x, cy + b.y, b.s, Math.sin(t * 14 + b.ph) * .7, 0, Math.PI / 2, '#0C0C0C', 'starling');
  if (ft > 2.6 && ft < 2.7 && AC && !muted && !FILM.cried) { FILM.cried = 1; try { cry(12, 2.2); } catch (e) { } }
}
// 題字：原色のカードを唐突に切り替える（ゴダール風）
function drawTitle(t, ft) {
  const V = [['#000', '#E03A2F', 'BIRDS'], ['#1F3FBF', '#F4F1EA', 'RECLAIM'], ['#F4F1EA', '#1F3FBF', 'BIRDS RECLAIM'], ['#000', '#F4F1EA', 'BIRDS'], ['#E03A2F', '#0A0A0A', 'RECLAIM'], ['#000', '#F4F1EA', 'BIRDS RECLAIM'], ['#000', '#F4F1EA', 'BIRDS RECLAIM']];
  const v = V[Math.min(V.length - 1, Math.floor(ft / .27))];
  filmFrame(t, (wy, wh) => { c.fillStyle = v[1]; c.textAlign = 'center'; let fs = 58; c.font = '800 ' + fs + 'px "Futura","Avenir Next","Helvetica Neue",Arial,sans-serif'; while (c.measureText(v[2]).width > W - 40 && fs > 20) { fs -= 2; c.font = '800 ' + fs + 'px "Futura","Avenir Next","Helvetica Neue",Arial,sans-serif'; } c.fillText(v[2], W / 2, wy + wh / 2 + fs * .35); }, v[0]);
}
// 終わり：鳥の言葉を、映画の終わりの字幕のように下から流す
function drawCredits(t, K, ft, wy, wh) {
  const items = STAGES.map(s => [s.en, VERSE[s.id] || '']), rowH = 50, total = 70 + items.length * rowH + wh, y0 = wy + wh - (ft / K.d) * total + 30;
  c.textAlign = 'center'; c.fillStyle = '#ECE7DC'; c.font = '600 12px ' + SERIF; c.fillText('鳥たちの言葉', W / 2, y0); c.font = LATIN; c.fillStyle = 'rgba(236,231,220,.6)'; c.fillText('Ce que les oiseaux ont dit', W / 2, y0 + 16);
  items.forEach(([en, v], i) => { const y = y0 + 64 + i * rowH; if (y < wy - 30 || y > wy + wh + 30) return; c.font = '500 9px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.5)'; c.fillText(en, W / 2, y); lines(wrapF(v, '600 13px ' + SERIF, W - 60), '600 13px ' + SERIF, W / 2, y + 18, 18, '#ECE7DC'); });
}

// 初回だけ冒頭を流す（確かめ用に ?intro と ?ending）
{ const q = typeof location !== 'undefined' ? location.search : ''; if (q.includes('ending')) filmStart('end'); else if (!SV.skipIntro || q.includes('intro')) filmStart('intro'); } // 冒頭は毎回流す。始まりの画面のチェックで省ける（地図のフィルムのボタンでいつでも見られる）
