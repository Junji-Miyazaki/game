// BIRDS RECLAIM 試作 v3 — 映画風の冒頭と終わり（白黒の字幕カード、日本語・英語・フランス語）
// ヌーヴェル・ヴァーグや無声映画の「技法」だけを借りる：字幕カード、ちらつき、粒子、傷、アイリス、原色の題字、FIN。
// 実在の映画の映像・題字・書体は写さない。
// 冒頭は毎回流れる。始まりの画面で「次から冒頭を表示しない」にチェックすると省ける（地図のフィルムのボタンでいつでも見られる）。終わりは13都市をすべて還した時に流れる。
// 確かめ用：v3.html?intro で冒頭、v3.html?ending で終わりをすぐ流す。
const FW = { y: 185, h: 270 }; // 縦長の画面の真ん中に開ける、昔の映画の比率（4:3）の窓
const R_SKIP = { x: 250, y: 584, w: 100, h: 36 };
// ---------- 題辞（エピグラフ） ----------
// 人にとって大事な言葉を、きちんと美しく出す。言葉は馬鹿にしない（ユーザー指示：無用に見える教養こそ大事。ただ鳥は意に介さない）。
// 鳥が1羽降りてきて、文字の上を2〜3字歩き、1字を少しずらして飛び去る。言葉は壊さず、最後まで読めるまま残す。
// 出会った題辞は SV.epi に記録し、パスポートの「言葉の書架」で原文・訳・出典と読み返せる。
// どれも作者の死後 70 年以上たち著作権の切れた原文。和訳・英訳はこのゲームで付けた。原文は入れる前に原典で照らし合わせること［要確認］。
// mode: 既定＝文字の上を歩いて飛び去る 'rest'＝降りてとまるだけ（終わりのゲーテ「おまえも安らぐ」）
const EPI = {
  intro: { o: 'Ein Käfig ging einen Vogel suchen.', ja: '檻が、鳥を探しに出かけた。', en: 'A cage went in search of a bird.', by: 'Franz Kafka — Zürauer Aphorismen, 16' },
  osaka: { o: '行く春や鳥啼魚の目は泪', cjk: 1, ja: 'ゆくはるや　とりなき　うおのめはなみだ', en: 'Spring departs — birds cry, and the eyes of the fish are wet.', by: '松尾芭蕉『おくのほそ道』' },
  saigon: { o: '國破山河在，城春草木深', cjk: 1, ja: '国破れて山河在り　城春にして草木深し', en: 'The state is broken; mountains and rivers remain. Spring in the city — grass and trees grow deep.', by: '杜甫「春望」' },
  paris: { o: 'Ses ailes de géant l’empêchent de marcher.', ja: '巨人の翼が、彼を歩かせない。', en: "His giant's wings keep him from walking.", by: 'Charles Baudelaire — « L’Albatros »' },
  seattle: { o: '…in Wildness is the preservation of the World.', ja: '野生のなかにこそ、世界は保たれている。', en: '', by: 'Henry David Thoreau — “Walking”' },
  newyork: { o: 'Hope is the thing with feathers / That perches in the soul,', ja: '希望とは、羽のあるもの　魂にとまっている', en: '', by: 'Emily Dickinson — “Hope”, Poems: Second Series (1891)' },
  end: { o: 'Die Vögelein schweigen im Walde. / Warte nur, balde / Ruhest du auch.', ja: '小鳥たちは森で黙る。待つがいい、やがて、おまえも安らぐ。', en: 'The little birds are silent in the wood. Only wait — soon you too will rest.', by: 'Goethe — „Ein Gleiches“ (Wandrers Nachtlied II)', mode: 'rest' },
};
// 題辞を描く。at＝出してからの秒、cy＝縦の中心。文字は1字ずつ描き、選ばれた数字が鳥についばまれて落ちる
function epiDraw(E, at, cy, a, fw) { // fw＝映画の窓 {wy,wh}。あれば和訳は窓の下の字幕に出す
  const big = E.cjk ? '600 18px ' + SERIF : '600 italic 15px Georgia,"Times New Roman",serif', L = E.o.split(' / ').flatMap(p => wrapF(p, big, W - 64)), lh = E.cjk ? 26 : 22;
  const sub = [...(fw ? [] : wrapF(E.ja, '500 11px ' + SERIF, W - 44).map(l => [l, '500 11px ' + SERIF])), ...(E.en ? wrapF(E.en, LATIN, W - 70).map(l => [l, LATIN]) : [])];
  const hh = L.length * lh + 14 + sub.length * 15 + 26; let y = cy - hh / 2 + lh - 4; c.globalAlpha = a; c.textAlign = 'left'; c.font = big;
  const chars = []; for (const l of L) { let x = W / 2 - c.measureText(l).width / 2; for (const ch of l) { const w = c.measureText(ch).width; chars.push({ ch, x, y, w }); x += w; } y += lh; }
  const n = chars.length, s0 = Math.floor(hash(n, 3) * Math.max(1, n - 4)), picks = E.mode === 'rest' ? [] : [s0, s0 + 1, s0 + 2].filter(i => i < n && chars[i].ch.trim()), T0 = 2.4;
  const nudge = picks.length ? picks[picks.length - 1] : -1, tN = T0 + .45 + (picks.length - .5) * .38; // 最後に歩いた字だけ、少しずれたまま残る
  chars.forEach((q, i) => { const u = i === nudge ? Math.min(1, Math.max(0, (at - tN) / .15)) : 0; c.save(); c.translate(q.x + q.w / 2 + u * 1.5, q.y + u * 2.5); c.rotate(u * .12); c.fillStyle = '#ECE7DC'; c.fillText(q.ch, -q.w / 2, 0); c.restore(); });
  c.globalAlpha = a; c.textAlign = 'left'; c.textAlign = 'center'; y += 10; for (const [l, f] of sub) { c.font = f; c.fillStyle = 'rgba(236,231,220,.7)'; c.fillText(l, W / 2, y); y += 15; }
  c.font = '500 9.5px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.5)'; c.fillText(E.by, W / 2, y + 10);
  if (fw) { subtitle(E.ja, a, fw.wy, fw.wh); c.globalAlpha = a; }
  // 鳥：右から来て、選んだ字を順にとまってつつき、飛び去る（rest は最後の字にとまったまま）
  const tgt = E.mode === 'rest' ? [chars[n - 1]] : picks.map(i => chars[i]); if (!tgt.length) { c.globalAlpha = 1; return; }
  let bx, by, ang = Math.sin(at * 16) * .7, fold = 0; const first = tgt[0], last = tgt[tgt.length - 1], tEnd = T0 + .45 + tgt.length * .38;
  if (at < T0) { c.globalAlpha = 1; return; }
  if (at < T0 + .45) { const u = (at - T0) / .45; bx = W + 20 + (first.x + first.w / 2 - W - 20) * u; by = first.y - 70 + 52 * u; }
  else if (E.mode === 'rest' || at < tEnd) { const j = Math.min(tgt.length - 1, Math.floor((at - T0 - .45) / .38)), q = tgt[j], hop = ((at - T0 - .45) / .38) % 1; bx = q.x + q.w / 2; by = q.y - 18 - (E.mode === 'rest' ? 0 : Math.sin(hop * Math.PI) * 6); ang = E.mode === 'rest' ? .15 : .3; fold = .6; }
  else { const u = at - tEnd; bx = last.x + last.w / 2 - u * 260; by = last.y - 18 - u * 200; }
  c.globalAlpha = a; birdS(bx, by, 8, ang, fold, at < T0 + .45 ? -1.2 : 0, '#D8D4CA', 'starling'); c.globalAlpha = 1; // 黒い画面でも見えるよう、字幕と同じ淡い色の鳥
}
// v3 その4：字幕カードは英語（またはフランス語）を大きく、もう1言語を小さく。日本語は映画の字幕のように窓の下に小さく出す（ユーザー指示）
// 日本語字幕は句点を付けず、区切りは全角の空き。事実：小惑星の衝突は約6600万年前、生き残った恐竜は鳥の仲間の一部、ホモ・サピエンスは約30万年前
const FILM_INTRO = [
  { k: 'leader', d: 1.2 }, // タップのあと、黒から 1.2 秒でカードがフェードインする
  { k: 'epi', d: 6.2, e: 'intro', snd: 'none' }, // カフカ
  { k: 'card', d: 4.2, snd: 'rumble', en: 'Sixty-six million years ago, a star fell from the sky.', fr: 'Il y a soixante-six millions d’années, une étoile tomba du ciel.', ja: '6600万年前　空から星が落ちた' },
  { k: 'card', d: 3.8, snd: 'wing', en: 'A few, with wings, lived on.', fr: 'Quelques-uns, ailés, survécurent.', ja: '翼をもつ　わずかな者が生きのびた' },
  { k: 'card', d: 3.8, snd: 'none', en: 'Then, three hundred thousand years ago — us.', fr: 'Puis, il y a trois cent mille ans : nous.', ja: 'そして30万年前　わたしたちが現れた' },
  // ゴダール風の「ずれ」：この1枚だけフランス語を大きく出す
  { k: 'card', d: 4.4, snd: 'hum', towers: 1, frBig: 1, en: 'In one century, we covered the sky with glass and light.', fr: 'En un siècle, nous avons couvert le ciel de verre et de lumière.', ja: 'この百年で　わたしたちは空をガラスと光で覆った' },
  { k: 'card', d: 3.4, snd: 'none', en: 'The birds remember the sky.', fr: 'Les oiseaux se souviennent du ciel.', ja: '鳥たちは　空を覚えている' },
  { k: 'peck', d: 6.6, snd: 'flock', en: 'They are coming to take it back.', fr: 'Ils viennent le reprendre.', ja: 'そして　取り戻しにくる' },
  { k: 'title', d: 1.9, snd: 'none' },
  { k: 'iris', d: 1.5 },
];
const FILM_END = [
  { k: 'credits', d: 17, snd: 'chirp' },
  { k: 'card', d: 4.4, snd: 'none', en: 'The birds do not think they have won.', fr: 'Les oiseaux ne pensent pas avoir gagné.', ja: '鳥たちは　勝ったとは思っていない' },
  { k: 'card', d: 5, snd: 'none', en: 'Only, the nights grew dark, and the sky grew quiet.', fr: 'Seulement, les nuits sont devenues noires, et le ciel silencieux.', ja: 'ただ　夜が暗くなり　空が静かになった' },
  { k: 'epi', d: 6.5, e: 'end', snd: 'none' }, // ゲーテ。鳥は降りてとまるだけ
  { k: 'count', d: 5.6, snd: 'quiet' }, // 4′33″ のリミックス：4.33 秒を数えるだけ。映写機も止まり、遠くの鳥だけが聞こえる
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
  if (K.k === 'peck') { FILM.blocks = textBlocks(K.en); FILM.flock = []; }
  if (K.k === 'epi') { SV.epi = SV.epi || {}; if (!SV.epi[K.e]) { SV.epi[K.e] = 1; save(); } }
  if (!AC || muted) return;
  try {
    if (K.snd === 'rumble') { tone(42, 3.2, .2, 'sine', 28); nz(2.6, 'lowpass', 160, .7, .14, 60); }
    else if (K.snd === 'wing') { nz(.22, 'bandpass', 700, .9, .12); nz(.22, 'bandpass', 600, .9, .1, 0); setTimeout(() => AC && nz(.22, 'bandpass', 650, .9, .12), 380); }
    else if (K.snd === 'hum') { tone(120, 4.4, .022, 'sawtooth'); tone(240, 4.4, .008, 'sawtooth'); }
    else if (K.snd === 'chirp') chirp(10, 14);
    else if (K.snd === 'fin') tone(98, 3.4, .06, 'sine', 70);
    else if (K.snd === 'quiet') { projOff(); chirp(4, 4.5); }
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
  c.font = font; const out = []; let cur = ''; const parts = / /.test(s) ? s.split(' ').map((w, i) => (i ? ' ' : '') + w) : [...s];
  for (const p of parts) { if (cur && c.measureText(cur + p).width > maxW) { out.push(cur); cur = p.trimStart(); } else cur += p; } if (cur) out.push(cur); return out;
}
function lines(arr, font, x, y, lh, col) { c.font = font; c.fillStyle = col; c.textAlign = 'center'; for (const l of arr) { c.fillText(l, x, y); y += lh; } return y; }
// 字幕カード：英語（frBig ならフランス語）を大きく、もう1言語を小さく。日本語は窓の下の字幕
const BIGL = '600 italic 17px Georgia,"Times New Roman",serif', SUBJ = '500 12.5px ' + SERIF;
function drawCardText(K, a, wy, wh) {
  const big = wrapF(K.frBig ? K.fr : K.en, BIGL, W - 60), s1 = wrapF(K.frBig ? K.en : K.fr, LATIN, W - 70);
  const hh = big.length * 24 + 12 + s1.length * 15; let y = wy + wh / 2 - hh / 2 + 4; c.globalAlpha = a;
  y = lines(big, BIGL, W / 2, y, 24, '#ECE7DC'); y += 10; lines(s1, LATIN, W / 2, y, 15, 'rgba(236,231,220,.62)');
  subtitle(K.ja, a, wy, wh); c.globalAlpha = 1;
}
// 日本語の字幕：窓の下の端に、白く小さく（影を付けて塔の上でも読める）
function subtitle(s, a, wy, wh) {
  if (!s) return; s = s.replace(/。$/, '').replace(/[、。]/g, '　'); const L = wrapF(s, SUBJ, W - 50); /* 字幕は句読点を付けず、空きで区切る */ let y = wy + wh - 14 - (L.length - 1) * 17; c.save(); c.globalAlpha = a; c.shadowColor = 'rgba(0,0,0,.95)'; c.shadowBlur = 4;
  for (const l of L) { lines([l], SUBJ, W / 2, y, 17, '#F6F2E8'); y += 17; } c.restore();
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
    else if (K.k === 'epi') epiDraw(EPI[K.e], ft, wy + wh / 2 - 12, fade(ft, K.d), { wy, wh });
    else if (K.k === 'count') { const r = Math.max(0, 4.33 - Math.max(0, ft - .6)); c.globalAlpha = Math.min(1, ft / .4, (K.d - ft) / .4); c.fillStyle = '#ECE7DC'; c.textAlign = 'center'; c.font = '500 44px Georgia,"Times New Roman",serif'; c.fillText(r.toFixed(2), W / 2, wy + wh / 2 + 15); c.globalAlpha = 1; }
    else if (K.k === 'fin') { const a = fade(ft, K.d); c.globalAlpha = a; c.fillStyle = '#ECE7DC'; c.textAlign = 'center'; c.font = '600 italic 46px Georgia,"Times New Roman",serif'; c.fillText('FIN', W / 2, wy + wh / 2 + 10); c.font = '500 10px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.6)'; c.fillText('BIRDS RECLAIM', W / 2, wy + wh / 2 + 40); c.globalAlpha = 1; }
  });
  if (FILM.wait && FILM.kind === 'intro') drawNoShow();
  if (!FILM.wait) { c.font = F(11, 600); c.fillStyle = 'rgba(255,255,255,.4)'; c.textAlign = 'right'; c.fillText('スキップ  ›', W - 24, R_SKIP.y + 23); c.textAlign = 'left'; }
  drawToggles();
}
// 始まり：黒い窓に「Tap to start」だけ（日本語は付けない。ユーザー指示）。下に「次から表示しない」のチェック。タップのあとは黒から静かに始める
const R_NOSHOW = { x: 96, y: 486, w: 168, h: 34 };
function drawLeader(t, ft, wy, wh) {
  if (!FILM.wait) return; const cx = W / 2, cy = wy + wh / 2, a = .75 + .25 * Math.sin(t * 2.4);
  c.textAlign = 'center'; c.globalAlpha = a; c.fillStyle = '#ECE7DC'; c.font = '600 italic 17px Georgia,"Times New Roman",serif'; c.fillText('Tap to start', cx, cy + 6); c.globalAlpha = 1;
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
    q.font = BIGL; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillStyle = '#fff'; q.fillText(s, W / 2, 20);
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
  else lines([K.en], BIGL, W / 2, cy + 6, 24, 'rgba(236,231,220,' + Math.max(0, 1 - Math.max(0, ft - 2.6) / 1.2) + ')');
  lines(wrapF(K.fr, LATIN, W - 70), LATIN, W / 2, cy + 40, 15, 'rgba(236,231,220,.62)');
  subtitle(K.ja, a, wy, wh); // 字幕は映画の外のものなので、鳥はつつかない
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
