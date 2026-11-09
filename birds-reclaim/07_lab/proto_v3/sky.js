// BIRDS RECLAIM 試作 v3 — いまの本物の空（v3.html では stages.js の次に読む。地図が読み込み時に使うため）（見た目だけ。難しさには関わらない）
// 都市を選んだ時と飛び立つ時に、その都市の緯度経度だけを Open-Meteo に問い合わせる（鍵なし、商用でなければ無料、CC BY 4.0）。
// 遊んでいる人の位置や情報は送らない。15 分は覚えておく。
// つながらない時は「季節の空」：月ごとの気候の表から、その日のその都市の空を決める。気温は出さない（でっち上げない）。
// 一時的な演出：竜巻（砂漠では砂の竜巻）が画面を横切る。雷雨の時は稲光。どれも鳥と建物には触れない。
const WXC = {}, WX_TTL = 15 * 60 * 1000;
// 月ごとの気候（ざっくり）：r=ふだんの雨 wet=雨の多い月 wr=その月の雨 dry=乾いた月 snow=雪の月 sn=雪 fog=霧 thunder=雷雨の月 cl=くもり
const CLIM = {
  osaka: { r: .25, wet: [6, 7, 9], wr: .5, snow: [1, 2], sn: .04, cl: .35 }, tokyo: { r: .22, wet: [6, 9, 10], wr: .45, snow: [1, 2], sn: .06, cl: .3 },
  taipei: { r: .4, wet: [5, 6, 8, 9], wr: .6, thunder: [6, 7, 8], cl: .45 }, saigon: { r: .1, wet: [5, 6, 7, 8, 9, 10, 11], wr: .55, thunder: [5, 6, 9, 10], cl: .3 },
  dubai: { r: .02, cl: .05 }, berlin: { r: .28, snow: [12, 1, 2], sn: .3, cl: .55 }, paris: { r: .3, cl: .45 }, barcelona: { r: .12, cl: .2 },
  london: { r: .38, fog: .12, cl: .6 }, seattle: { r: .45, dry: [7, 8], fog: .08, cl: .55 }, sf: { r: .14, dry: [6, 7, 8, 9], fog: .4, cl: .3 },
  vegas: { r: .03, cl: .08 }, newyork: { r: .25, snow: [12, 1, 2], sn: .22, thunder: [6, 7, 8], cl: .35 },
};
const WMO = c => c === 0 ? ['快晴', 'clear', 0] : c === 1 ? ['晴れ', 'clear', 0] : c === 2 ? ['晴れときどきくもり', 'part', 0] : c === 3 ? ['くもり', 'cloud', 0]
  : c === 45 || c === 48 ? ['霧', 'fog', .6] : c >= 51 && c <= 57 ? ['霧雨', 'rain', .25] : c === 61 || c === 80 ? ['小雨', 'rain', .4] : c === 63 || c === 81 || c === 66 ? ['雨', 'rain', .7]
  : c === 65 || c === 82 || c === 67 ? ['大雨', 'rain', 1] : (c >= 71 && c <= 77) || c === 85 || c === 86 ? ['雪', 'snow', c === 75 || c === 86 ? 1 : .6] : c >= 95 ? ['雷雨', 'thunder', .9] : ['くもり', 'cloud', 0];
function localParts(tz) {
  try { const p = {}; for (const x of new Intl.DateTimeFormat('ja-JP', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: false, month: 'numeric', day: 'numeric' }).formatToParts(new Date())) p[x.type] = x.value; return { h: +p.hour % 24, m: p.minute, mo: +p.month, d: +p.day }; }
  catch (e) { const d = new Date(); return { h: d.getHours(), m: String(d.getMinutes()).padStart(2, '0'), mo: d.getMonth() + 1, d: d.getDate() }; }
}
// 時間帯：現地の時刻から。本物の空が昼／夜を返したら、それに合わせる
function phaseOf(h, day) { let p = h >= 5 && h < 9 ? '朝' : h >= 9 && h < 16 ? '昼' : h >= 16 && h < 19 ? '夕方' : '夜'; if (day === false && p === '昼') p = '夜'; if (day === true && p === '夜') p = h < 12 ? '朝' : '夕方'; return p; }
const ampm = L => (L.h < 12 ? '午前' : '午後') + ((L.h % 12) || 12) + ':' + L.m;
// 季節の空：その日・その都市・3時間ごとに同じ答えになるように決める
function wxSeason(ST) {
  const C = CLIM[ST.id] || { r: .2, cl: .3 }, L = localParts(ST.tz), u = hash(L.mo * 31 + L.d, ST.lat * 7 + Math.floor(L.h / 3)), v = hash(L.d * 13 + L.h, ST.lon);
  let r = C.r; if ((C.wet || []).includes(L.mo)) r = C.wr || .5; if ((C.dry || []).includes(L.mo)) r = .04;
  let w = ['晴れ', 'clear', 0];
  if ((C.snow || []).includes(L.mo) && u < C.sn) w = ['雪', 'snow', .6];
  else if (u < r) w = (C.thunder || []).includes(L.mo) && v < .35 ? ['雷雨', 'thunder', .9] : ['雨', 'rain', .5 + v * .4];
  else if (u < r + (C.fog || 0)) w = ['霧', 'fog', .6];
  else if (u < r + (C.fog || 0) + (C.cl || .3)) w = ['くもり', 'cloud', 0];
  return { live: 0, label: w[0], kind: w[1], inten: w[2], day: L.h >= 6 && L.h < 18, phase: phaseOf(L.h), time: ampm(L), temp: null, wind: null };
}
function wxFor(ST) { const c = WXC[ST.id]; if (c && c.d && Date.now() - c.t < WX_TTL) { const L = localParts(ST.tz); return Object.assign({}, c.d, { time: ampm(L), phase: phaseOf(L.h, c.d.day) }); } return wxSeason(ST); }
function wxFetch(ST) {
  if (typeof location === 'undefined' || typeof fetch !== 'function') return; // Node の自動プレイでは問い合わせない
  const c = WXC[ST.id]; if (c && (c.pend || (c.d && Date.now() - c.t < WX_TTL))) return; WXC[ST.id] = { pend: 1, t: 0, d: c && c.d };
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + ST.lat + '&longitude=' + ST.lon + '&current=temperature_2m,weather_code,wind_speed_10m,is_day,cloud_cover&timezone=auto';
  const ac = typeof AbortController === 'function' ? new AbortController() : null; if (ac) setTimeout(() => ac.abort(), 5000);
  fetch(url, ac ? { signal: ac.signal } : {}).then(r => r.json()).then(j => {
    const cu = j.current, w = WMO(cu.weather_code), L = localParts(ST.tz);
    WXC[ST.id] = { t: Date.now(), d: { live: 1, label: w[0], kind: w[1], inten: w[2], day: !!cu.is_day, phase: phaseOf(L.h, !!cu.is_day), time: ampm(L), temp: Math.round(cu.temperature_2m), wind: Math.round(cu.wind_speed_10m), cloud: cu.cloud_cover } };
    if (S && S.st === ST && scene === 'game') { S.wx = wxFor(ST); S.wfx = wxFx(S.wx); }
  }).catch(() => { WXC[ST.id] = { t: 0, d: null }; });
}
// 天気の効き目（小さく、不利と有利を必ず組にする）：spd=鳥の速さ light=光の仕掛けの届く範囲 scroll=進む速さ
function wxFx(w) {
  const f = { spd: 1, light: 1, scroll: 1, txt: [] };
  if (w.kind === 'rain' || w.kind === 'thunder') { f.spd = .9; f.light = .8; f.txt.push('雨で羽が重い（鳥が少し遅い）', '光がにじまない（光の仕掛けが弱い）'); }
  else if (w.kind === 'snow') { f.spd = .9; f.scroll = .9; f.txt.push('雪で鳥が少し遅い', 'ゆっくり進むので、ポイントがたまる'); }
  else if (w.kind === 'fog') { f.light = .7; f.scroll = .9; f.txt.push('霧で光の仕掛けが弱い', '見通しが悪く、ゆっくり進む'); }
  if (w.phase === '夜') { f.light *= 1.1; f.txt.push('夜は光の仕掛けが強い'); }
  if (w.wind != null && w.wind >= 30) { f.scroll *= .85; f.txt.push('強い風で、ゆっくり進む'); }
  return f;
}
// 文字にする：「午前3:30　夜　快晴　6℃」「風 5km/h」
function wxLine(w) { return w.time + '　' + w.phase + '　' + w.label + (w.temp != null ? '　' + w.temp + '℃' : ''); }
function wxSub(w) { return w.live ? (w.wind != null ? '風 ' + w.wind + 'km/h　·　' : '') + '現地のいまの空（Open-Meteo）' : '季節の空（いまの天気は取れなかった）'; }
function wxShort(w) { return (w.temp != null ? w.temp + '℃ ' : '') + w.label + '・' + w.phase; }

// ---------- 空を描く（drawWorld から呼ぶ） ----------
const SAND = ['dubai', 'vegas', 'barcelona'];
const NIGHT = [[8, 12, 30], [22, 28, 56], [46, 46, 78]], DAWN = [[96, 110, 160], [214, 172, 172], [252, 204, 164]];
function skyBase(ST, i) { const ph = S.wx ? S.wx.phase : '昼'; return ph === '夕方' ? ST.sky[1][i] : ph === '夜' ? NIGHT[i] : ph === '朝' ? lerp3(ST.sky[0][i], DAWN[i], .55) : ST.sky[0][i]; }
// 空の色の上にかける：夜は星を出す、くもり・雨は灰色に
function skyTint(t, cam) {
  const w = S.wx; if (!w) return; const rc = S.reclaim, k = 1 - rc * .6;
  if (w.kind === 'cloud' || w.kind === 'rain' || w.kind === 'thunder' || w.kind === 'snow' || w.kind === 'fog') { c.fillStyle = 'rgba(140,146,156,' + (.32 * k) + ')'; c.fillRect(-20, -20, W + 40, GY + 20); }
  else if (w.kind === 'part') { c.fillStyle = 'rgba(160,166,176,' + (.14 * k) + ')'; c.fillRect(-20, -20, W + 40, GY + 20); }
  if (w.phase === '夜') {
    if (w.kind === 'clear' || w.kind === 'part') { c.fillStyle = 'rgba(255,255,255,' + (.7 * k) + ')'; for (let i = 0; i < 46; i++) { const x = wrapX(i * 97 + 13, cam, .02, W + 40), y = 90 + (i * 61) % 260, tw = .5 + .5 * Math.sin(t * 2 + i); c.globalAlpha = tw * k; c.fillRect(x, y, i % 7 ? 1 : 1.6, i % 7 ? 1 : 1.6); } c.globalAlpha = 1; }
  }
}
const wxSun = () => !S.wx || (S.wx.phase !== '夜' && (S.wx.kind === 'clear' || S.wx.kind === 'part'));
// 雨・雪・霧・稲光・竜巻を進める（step から呼ぶ）
function stepSky(dt) {
  const w = S.wx || {}; S.rainOn = (w.kind === 'rain' || w.kind === 'thunder') ? 1 : 0;
  if (S.rainOn) for (let i = 0; i < Math.ceil(1 + 4 * (w.inten || .5)); i++) S.drops.push({ x: Math.random() * (W + 80), y: -10, v: 380 + Math.random() * 120 });
  if (w.kind === 'snow') { S.flakes = S.flakes || []; if (Math.random() < dt * 40 * (w.inten || .6)) S.flakes.push({ x: Math.random() * (W + 60), y: -6, v: 30 + Math.random() * 40, ph: Math.random() * 6 }); }
  if (S.flakes) for (let i = S.flakes.length - 1; i >= 0; i--) { const f = S.flakes[i]; f.y += f.v * dt; f.x += Math.sin(S.t * 1.5 + f.ph) * 12 * dt - 6 * dt; if (f.y > GY) S.flakes.splice(i, 1); }
  if (w.kind === 'thunder') { S.bolt = Math.max(0, (S.bolt || 0) - dt); if ((S.boltT = (S.boltT ?? 4) - dt) <= 0) { S.boltT = 4 + Math.random() * 6; S.bolt = .25; S.boltX = Math.random() * W; if (AC && !muted) try { nz(1.6, 'lowpass', 140, .7, .22, 50); } catch (e) { } } }
  // 竜巻：1都市に1度、包囲の外で、画面の右から左へゆっくり横切る
  const E = S.evt; if (E && !E.done && S.mode === 'play' && !S.siege && S.x + W > E.at) { if (!E.on) { E.on = 1; E.x = S.x + W + 70; S.toast = { s: (E.sand ? '砂の竜巻' : '竜巻') + 'が、遠くを通り過ぎる', t: 0, plain: 1 }; } }
  if (E && E.on && !E.done) { E.t = (E.t || 0) + dt; E.x += (SPEED - 75) * dt; if (E.x < S.x - 120 || E.t > 9) E.done = 1; }
}
function drawSkyFx(t) {
  const w = S.wx || {}, rc = S.reclaim, cam = S.x, E = S.evt;
  if (E && E.on && !E.done) { // 竜巻の漏斗：重ねた楕円が回り、まわりにちりが舞う
    const bx = E.x - cam, col = E.sand ? [206, 178, 132] : [128, 132, 142], a = Math.min(1, E.t / 1.2, (9 - E.t) / 1.5) * (1 - rc);
    for (let i = 0; i < 26; i++) { const u = i / 25, y = GY - u * 330, r = 8 + u * u * 70, ox = Math.sin(t * 3 + u * 5) * (10 + u * 26); c.fillStyle = 'rgba(' + col.join(',') + ',' + (a * (.16 + .1 * Math.sin(t * 9 + i))) + ')'; c.beginPath(); c.ellipse(bx + ox, y, r, 6 + u * 8, 0, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(' + col.map(v => v * .7).join(',') + ',' + a * .7 + ')'; for (let i = 0; i < 30; i++) { const u = (i * .137 + t * .4) % 1, ang = t * 5 + i * 2.4, r = 14 + u * 80; c.fillRect(bx + Math.cos(ang) * r, GY - u * 300 + Math.sin(ang) * 6, 2, 2); }
  }
  if (S.flakes && rc < 1) { c.fillStyle = 'rgba(255,255,255,' + (.85 * (1 - rc)) + ')'; for (const f of S.flakes) { c.beginPath(); c.arc(f.x, f.y, 1.6, 0, 7); c.fill(); } }
  if (w.kind === 'fog' && rc < 1) { c.fillStyle = 'rgba(232,236,240,' + (.32 * (1 - rc)) + ')'; c.fillRect(0, 0, W, PY + 24); for (let i = 0; i < 6; i++) { const x = ((i * 173 - t * 14) % (W + 260) + W + 260) % (W + 260) - 130, y = 200 + (i * 71) % 240; c.fillStyle = 'rgba(240,242,246,' + (.22 * (1 - rc)) + ')'; c.beginPath(); c.ellipse(x, y, 130, 26, 0, 0, 7); c.fill(); } }
  if (S.bolt > 0) { c.fillStyle = 'rgba(240,244,255,' + (S.bolt / .25 * .45) + ')'; c.fillRect(0, 0, W, PY + 24); c.strokeStyle = 'rgba(255,255,255,' + S.bolt / .25 + ')'; c.lineWidth = 2; c.beginPath(); let x = S.boltX, y = 60; c.moveTo(x, y); while (y < GY - 120) { x += (Math.random() - .5) * 40; y += 30 + Math.random() * 30; c.lineTo(x, y); } c.stroke(); }
}
