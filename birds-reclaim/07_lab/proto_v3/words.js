// BIRDS RECLAIM 試作 v3 — 言葉のコレクション（崩した建物の中から、人の叡智が取り出される）
// ボス・象徴・名所を崩すと、確率で「言葉の欠片」（淡く光る紙片）が瓦礫から舞い上がり、2.5 秒で書架に入る。鳥は素通りする。
// 同じ建物でも、まだ持っていない言葉が優先して出るので、2回目以降に新しい言葉を掘り出せる。新しい言葉なら「新たな言葉をコレクションしました」と出す。
// 言葉はすべて著作権の切れた原典から。原文は公有の原典（ウィキソース、グーテンベルク、青空文庫など）で照らし合わせたものだけを入れる。
// 和訳・英訳はこのゲームで付けた。
// v3.html では film.js の次に読む（EPI を使う）。
const WORDS = {};
for (const k in EPI) WORDS['epi_' + k] = Object.assign({ city: k === 'intro' || k === 'end' ? '*' : k }, EPI[k]); // 章の題辞もコレクションの一部
// 言葉を足す：id、棚（都市）、原文（改行は ' / '）、和訳、英訳（原文が英語なら空）、出典、出る建物（ボス・象徴・名所の id）
const DROP = {};
function addWord(id, city, o, ja, en, by, from, cjk) { WORDS[id] = { city, o, ja, en, by, cjk }; for (const b of from) (DROP[b] = DROP[b] || []).push(id); }
// 英語圏（原典で照合済み：2026-11-09。グーテンベルク、ウィキソース、fourmilab）
// 日本・中国・ベトナム（原典で照合済み：2026-11-09。青空文庫、zh/vi.wikisource。西鶴は阪大の論文に引かれた本文）
addWord('saikaku', 'osaka', '金銀を溜べし。是二親の外に命の親なり。', '（金と銀を貯めよ。それは父母のほかの、命の親である）', 'Save up gold and silver: after your two parents, they are the parents of your life.', '井原西鶴『日本永代蔵』（1688）', ['yumeshima', 'fucho', 'kani'], 1);
addWord('soseki', 'tokyo', '智に働けば角が立つ。情に棹させば流される。意地を通せば窮屈だ。とかくに人の世は住みにくい。', '', 'Work with the intellect and you make enemies; give way to feeling and you are swept along; insist on your will and you are cramped. In any case, the human world is hard to live in.', '夏目漱石『草枕』（1906）', ['roppongi', 'diet', 'tokyostation'], 1);
addWord('hojoki', 'tokyo', '行く川のながれは絶えずして、しかも本の水にあらず。 / 世の中にある人とすみかと、またかくの如し。', '', 'The flowing river never stops, and yet the water is never the same. So it is with people and their dwellings in this world.', '鴨長明『方丈記』（1212）', ['tmg', 'skytree', 'boj'], 1);
addWord('laozi', 'taipei', '企者不立，跨者不行', '企つ者は立たず、跨ぐ者は行かず（つま先立ちでは立っていられず、大股では歩き続けられない）', 'One on tiptoe cannot stand; one who strides cannot keep walking.', '『老子』第二十四章（王弼本）', ['t101', 'baiyoke', 'shinkong'], 1);
addWord('zhuangzi', 'taipei', '人皆知有用之用，而莫知无用之用也。', '人は皆、役に立つものの役立ちを知っているが、役に立たないものの役立ちを知らない。', 'Everyone knows the use of the useful, but no one knows the use of the useless.', '『莊子』人間世', ['tsmc', 'maha'], 1);
addWord('kieu', 'saigon', 'Trăm năm trong cõi người ta, / Chữ tài chữ mệnh khéo là ghét nhau.', '百年、この人の世に。才と運とは、とかく憎み合う。', 'A hundred years in this human world — talent and destiny are apt to hate each other.', 'Nguyễn Du — Truyện Kiều', ['l81', 'benthanh', 'petronas']);
// ヨーロッパ（原典で照合済み：2026-11-09。グーテンベルク、de/fr/es/en.wikisource、MIT の Shakespeare）
addWord('faust', 'berlin', 'Grau, teurer Freund, ist alle Theorie, / Und grün des Lebens goldner Baum.', '灰色なのだ、友よ、理論はすべて。緑なのは、生命の黄金の木だ。', 'All theory, dear friend, is grey, and green the golden tree of life.', 'Goethe — Faust I（メフィストフェレス）', ['ecb', 'dbank', 'commerzbank']);
addWord('nietzsche', 'berlin', 'Wer die Menschen einst fliegen lehrt, der hat alle Grenzsteine verrückt;', 'いつか人に飛ぶことを教える者は、あらゆる境界石を動かしてしまったのだ。', 'He who one day teaches men to fly will have moved all the boundary stones;', 'Nietzsche — Also sprach Zarathustra III, „Vom Geist der Schwere“ 2', ['brandenburg', 'fernsehturm', 'dbank']);
addWord('rilke', 'berlin', 'Ihm ist, als ob es tausend Stäbe gäbe / und hinter tausend Stäben keine Welt.', '彼には、千本の格子があるように思える。千本の格子の向こうに、世界はない。', 'It seems to him there are a thousand bars, and behind the thousand bars no world.', 'Rainer Maria Rilke — „Der Panther“ (Neue Gedichte, 1907)', ['tesla', 'sonycenter', 'spheres']);
addWord('rousseau', 'paris', 'Tout est bien, sortant des mains de l’Auteur des choses : tout dégenere entre les mains de l’homme.', '万物をつくる者の手を離れる時、すべては善い。人の手のなかで、すべては悪くなる。', 'Everything is good as it leaves the hands of the Author of things; everything degenerates in the hands of man.', 'Jean-Jacques Rousseau — Émile, Livre I (éd. 1782)', ['montecarlo', 'arche', 'eiffel']);
addWord('pascal', 'paris', 'L’homme n’est qu’un roseau, le plus faible de la nature ; mais c’est un roseau pensant.', '人間は一本の葦にすぎない。自然のなかでいちばん弱いもの。だが、それは考える葦である。', 'Man is only a reed, the weakest thing in nature; but he is a thinking reed.', 'Blaise Pascal — Pensées (éd. Brunschvicg, 347)', ['arche', 'louvre', 'flv']);
addWord('wilde', 'paris', 'A man who knows the price of everything and the value of nothing.', '（皮肉屋とは）あらゆるものの値段を知り、どれの価値も知らない人間。', '', 'Oscar Wilde — Lady Windermere’s Fan, Act III', ['flv', 'lafayette', 'montecarlo']);
addWord('cervantes', 'barcelona', '…que aquellos que allí se parecen no son gigantes, sino molinos de viento,', '……あそこに見えておりますのは、巨人ではなく、風車でございます。', '…those that appear over there are not giants, but windmills,', 'Cervantes — Don Quijote I, cap. VIII (ed. 1842)', ['kio', 'cuatrotorres', 'bernabeu']);
addWord('lorca', 'barcelona', 'Verde que te quiero verde.', '緑よ、おまえが好きだ、緑よ。', 'Green, how I want you green.', 'Federico García Lorca — „Romance sonámbulo“ (1928)', ['glories', 'casamila', 'palacioreal']);
addWord('hamlet', 'london', 'there’s a special providence in the fall of a sparrow.', '一羽の雀が落ちるのにも、特別な摂理がある。', '', 'Shakespeare — Hamlet, V.ii', ['abbey', 'walkie', 'bttower']);
addWord('blake', 'london', 'To see a World in a Grain of Sand / And a Heaven in a Wild Flower', '一粒の砂に世界を見る。一輪の野の花に天を見る。', '', 'William Blake — “Auguries of Innocence” (Pickering Manuscript)', ['battersea', 'gherkin', 'shard']);
// 役者の言葉（シェイクスピアは役者でもあった。世阿弥は能役者。ユーザー：無理に入れなくてよいが、この2人ならよい）
// 世阿弥は法政大学能楽研究所が公開する『風姿花伝』の本文で照合（2026-11-09）
addWord('zeami', 'osaka', '秘すれば花なり。秘せずば花なるべからず', '（隠しておくから花になる。隠さなければ花にはならない）', 'Hidden, it is the flower; not hidden, it cannot be the flower.', '世阿弥『風姿花伝』第七 別紙口伝', ['tsutenkaku', 'oskcastle', 'umedasky'], 1);
addWord('stage', 'london', 'All the world’s a stage, / And all the men and women merely players;', 'この世はすべて舞台。男も女も、みなただの役者にすぎない。', '', 'Shakespeare — As You Like It, II.vii', ['londoneye', 'msg', 'sphere']);
addWord('ozymandias', 'dubai', 'Look on my works ye Mighty, and despair! / … / The lone and level sands stretch far away.', '我が業を見よ、強き者よ、そして絶望せよ。……ひとり平らな砂が、はるかに広がるばかり。', '', 'Percy Bysshe Shelley — “Ozymandias” (The Examiner, 1818)', ['khalifa', 'frame', 'baa']);
addWord('smith', 'london', 'It is not from the benevolence of the butcher, the brewer, or the baker that we expect our dinner, but from their regard to their own interest.', 'われわれが夕食にありつけるのは、肉屋や酒屋やパン屋の博愛心からではなく、彼ら自身の利益への関心からである。', '', 'Adam Smith — The Wealth of Nations (1776)', ['boe', 'battersea', 'nyse']);
addWord('lovelace', 'sf', 'The Analytical Engine has no pretensions whatever to originate anything. It can do whatever we know how to order it to perform.', '解析機関は、何かを自ら生み出すつもりなど少しもない。私たちが命じ方を知っていることなら、何でもする。', '', 'Ada Lovelace — Note G (1843)', ['nvidia', 'cloud', 'msft']);
addWord('muir', 'sf', 'When we try to pick out anything by itself, we find it hitched to everything else in the universe.', '何か一つだけを取り出そうとすると、それが宇宙のほかのすべてにつながっていると気づく。', '', 'John Muir — My First Summer in the Sierra (1911)', ['apple', 'cloud', 'goldengate']);
addWord('veblen', 'vegas', 'Conspicuous consumption of valuable goods is a means of reputability to the gentleman of leisure.', '高価な品を見せびらかして消費することは、有閑の紳士にとって世間の評判を得る手段である。', '', 'Thorstein Veblen — The Theory of the Leisure Class (1899)', ['luxor', 'sphere', 'strat', 'caesars', 'goldtower']);
addWord('lazarus', 'newyork', 'Give me your tired, your poor, / Your huddled masses yearning to breathe free,', '疲れた人を、貧しい人を、私に与えよ。自由に息をしたいと身を寄せ合う群れを。', '', 'Emma Lazarus — “The New Colossus” (1883)', ['liberty']);
addWord('whitman', 'newyork', 'I believe a leaf of grass is no less than the journey work of the stars,', '一枚の草の葉も、星々の旅の仕事に劣らないと、私は信じる。', '', 'Walt Whitman — “Song of Myself” 31, Leaves of Grass', ['rock', 'liberty', 'msg']);
addWord('emerson', 'seattle', 'In the woods, we return to reason and faith.', '森の中で、私たちは理性と信頼に立ち返る。', '', 'Ralph Waldo Emerson — Nature (1836)', ['spheres', 'boeing', 'spaceneedle']);
const DROP_P = { boss: .7, final: .9, lm: .3 };
DROP.tsutenkaku = ['saikaku', 'epi_osaka']; // 通天閣
// 章の題辞も、その都市の象徴から掘り出せる（章のカードで見逃しても集められる）
for (const st of STAGES) if (EPI[st.id]) (DROP[st.final] = DROP[st.final] || []).push('epi_' + st.id);
const CITY_OF = {}; // 建物 → 都市
for (const s of STAGES) { for (const b of s.bosses) CITY_OF[b.id] = s.id; CITY_OF[s.final] = s.id; for (const [, id] of s.lm || []) CITY_OF[id] = s.id; }
// まだ掘り出していない言葉のヒント：どの建物の瓦礫から出るか
function wordFrom(id) { const out = [], city = WORDS[id] && WORDS[id].city; for (const b in DROP) if (DROP[b].includes(id) && (!CITY_OF[b] || CITY_OF[b] === city || city === '*')) { const nm = (typeof BOSS !== 'undefined' && BOSS[b] && BOSS[b].name) || (typeof LM !== 'undefined' && LM[b] && LM[b].name); if (nm && !out.includes(nm)) out.push(nm); } return out.slice(0, 2); } // その都市の建物を2つまで
const fitW = (s, w) => { if (c.measureText(s).width <= w) return s; while (s.length > 4 && c.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }; // 幅に収める（今の字体で測る）
const shelfOf = city => Object.keys(WORDS).filter(k => WORDS[k].city === city);
function wordsSeen() { if (!SV.words) SV.words = {}; for (const k in SV.epi || {}) SV.words['epi_' + k] = 1; return SV.words; } // 前の保存（SV.epi）も数える
function wordCount() { const w = wordsSeen(); return Object.keys(WORDS).filter(id => w[id]).length; }
// 建物を崩した時：確率で欠片を出す。まだ持っていない言葉を優先する
function wordDrop(b, kind, id) {
  const pool = (DROP[id] || []).filter(w => WORDS[w]); if (!pool.length || Math.random() > DROP_P[kind]) return;
  const seen = wordsSeen(), fresh = pool.filter(w => !seen[w]), list = fresh.length && Math.random() < .8 ? fresh : pool, w = list[Math.floor(Math.random() * list.length)];
  let top = 0; for (const q of b.cells.values()) top = Math.max(top, q.r);
  S.frags.push({ id: w, x: b.x + b.w / 2 + (Math.random() - .5) * b.w * .4, y: GY - Math.min(top, 40) * CS * .5 - 20, t: 0, ph: Math.random() * 6 });
}
function stepFrags(dt) {
  // v3 その4：還したあと（結果を出す時）は、舞っている欠片をその場で書架に入れる。知らせは出さず、結果のあとの「言葉」の頁で見せる
  if (S.mode !== 'play') { for (const f of S.frags) { const seen = wordsSeen(), isNew = !seen[f.id]; seen[f.id] = 1; S.wordsGot.push(f.id); if (isNew) S.wordsNew.push(f.id); } if (S.frags.length) save(); S.frags.length = 0; S.wtoast = null; return; }
  for (let i = S.frags.length - 1; i >= 0; i--) {
    const f = S.frags[i]; f.t += dt; f.y -= (40 + f.t * 30) * dt; f.x += Math.sin(f.t * 2.4 + f.ph) * 22 * dt + SPEED * dt * (S.siege ? 0 : 1);
    if (f.t > 2.5) {
      S.frags.splice(i, 1); const seen = wordsSeen(), isNew = !seen[f.id]; seen[f.id] = 1; save(); S.wordsGot.push(f.id); if (isNew) S.wordsNew.push(f.id);
      S.wtoast = { id: f.id, isNew, t: 0 }; if (AC && !muted) try { tone(isNew ? 1568 : 1175, .5, .04, 'sine', isNew ? 2093 : 0); if (isNew) tone(2093, .7, .03, 'sine', 0, .15); } catch (e) { }
    }
  }
  if (S.wtoast) { S.wtoast.t += dt; if (S.wtoast.t > 3.6) S.wtoast = null; }
}
function drawFrags(t, cam) { // 淡く光る紙片
  for (const f of S.frags) { const x = f.x - cam, y = f.y, a = Math.min(1, f.t / .3); c.save(); c.translate(x, y); c.rotate(Math.sin(f.t * 3 + f.ph) * .5);
    c.globalAlpha = a * .35; c.fillStyle = '#FFF4D2'; c.beginPath(); c.arc(0, 0, 14, 0, 7); c.fill(); c.globalAlpha = a; c.fillStyle = '#F4ECD8'; c.fillRect(-6, -8, 12, 16); c.fillStyle = 'rgba(80,70,50,.5)'; for (let r = 0; r < 4; r++) c.fillRect(-4, -5 + r * 3.4, 8 - (r === 3 ? 3 : 0), .9); c.restore(); }
}
// 言葉を拾った時の知らせ。新しい言葉ははっきり、すでに持っている言葉は控えめに
function drawWToast() {
  const T = S.wtoast; if (!T || S.mode !== 'play') return; const E = WORDS[T.id], a = Math.max(0, Math.min(1, T.t / .25, (3.6 - T.t) / .5)); c.globalAlpha = a;
  const y = 116, h = T.isNew ? 70 : 34; rr(26, y, W - 52, h, 14); c.fillStyle = 'rgba(28,24,16,.92)'; c.fill(); c.strokeStyle = 'rgba(244,236,216,' + (T.isNew ? .55 : .2) + ')'; c.lineWidth = 1; c.stroke();
  c.textAlign = 'center';
  if (T.isNew) { c.font = '600 12px ' + SERIF; c.fillStyle = '#F2D27A'; c.fillText('新たな言葉をコレクションしました', W / 2, y + 20); }
  const f0 = E.cjk ? '600 12px ' + SERIF : '600 italic 11.5px Georgia,"Times New Roman",serif'; let l = E.o.split(' / ')[0]; c.font = f0; while (c.measureText(l).width > W - 84 && l.length > 4) l = l.slice(0, -1); if (l !== E.o.split(' / ')[0]) l += '…';
  c.fillStyle = '#F4ECD8'; c.fillText(l, W / 2, y + (T.isNew ? 40 : 21)); if (T.isNew) { c.font = '500 9px ' + SERIF; c.fillStyle = 'rgba(244,236,216,.6)'; c.fillText(E.by, W / 2, y + 57); }
  else { c.font = '500 8.5px ' + SERIF; c.fillStyle = 'rgba(244,236,216,.45)'; c.textAlign = 'right'; c.fillText('書架にある言葉', W - 36, y + 30); }
  c.textAlign = 'left'; c.globalAlpha = 1;
}

// ---------- 言葉の書架（都市ごとの棚） ----------
// 扉の言葉は荘子「無用の用」（照らし合わせ済みのときだけ出す）
const WB = { sel: null };
const R_WBACK = { x: 110, y: 596, w: 140, h: 36 }, R_WORDS = { x: 14, y: 20, w: 128, h: 28 };
const SHELVES = () => [['*', '序と結び'], ...STAGES.map(s => [s.id, s.city])];
const wbRow = i => ({ x: 24, y: 178 + i * 28, w: W - 48, h: 26 });
function drawWords(t) {
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0E0E0C'); bg.addColorStop(1, '#16150F'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  const seen = wordsSeen(); c.textAlign = 'center'; c.fillStyle = '#ECE7DC'; c.font = '600 18px ' + SERIF; c.fillText('言葉の書架', W / 2, 62);
  c.font = LATIN; c.fillStyle = 'rgba(236,231,220,.55)'; c.fillText('words the birds did not need　·　' + wordCount() + ' / ' + Object.keys(WORDS).length, W / 2, 80);
  if (WB.sel == null) {
    const Z = WORDS.zhuangzi; if (Z) { c.font = '600 13px ' + SERIF; c.fillStyle = '#ECE7DC'; c.fillText(Z.o, W / 2, 112); let zy = 128; for (const l of wrapF(Z.ja, '500 10px ' + SERIF, W - 60)) { c.font = '500 10px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.6)'; c.fillText(l, W / 2, zy); zy += 13; } c.font = '500 8.5px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.4)'; c.fillText(Z.by, W / 2, zy + 3); }
    SHELVES().forEach(([id, nm], i) => { const R = wbRow(i), L = Object.keys(WORDS).filter(k => WORDS[k].city === id), got = L.filter(k => seen[k]).length;
      c.fillStyle = 'rgba(236,231,220,' + (got ? .07 : .03) + ')'; c.fillRect(R.x, R.y, R.w, R.h); c.textAlign = 'left'; c.font = '500 11.5px ' + SERIF; c.fillStyle = got ? '#ECE7DC' : 'rgba(236,231,220,.35)'; c.fillText(nm, R.x + 12, R.y + 17);
      // アルバムの枠：持っている言葉は紙片、まだの言葉は「？」
      c.textAlign = 'center'; L.forEach((k, j) => { const sx = R.x + R.w - 14 - (L.length - 1 - j) * 15; if (seen[k]) { c.fillStyle = '#F4ECD8'; c.fillRect(sx - 4.5, R.y + 6, 9, 13); c.fillStyle = 'rgba(80,70,50,.55)'; for (let r = 0; r < 3; r++) c.fillRect(sx - 3, R.y + 9 + r * 3.2, 6, .9); } else { c.strokeStyle = 'rgba(236,231,220,.28)'; c.lineWidth = 1; c.strokeRect(sx - 4.5, R.y + 6.5, 9, 12); c.font = '600 9px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.45)'; c.fillText('？', sx, R.y + 16.5); } }); });
  } else {
    const [, nm] = SHELVES().find(([id]) => id === WB.sel) || ['', '']; c.font = '600 13px ' + SERIF; c.fillStyle = '#F2D27A'; c.fillText(nm, W / 2, 108);
    let y = 138; for (const k of Object.keys(WORDS).filter(k => WORDS[k].city === WB.sel)) {
      const E = WORDS[k]; c.fillStyle = 'rgba(236,231,220,.08)'; c.fillRect(28, y - 14, W - 56, 1); c.textAlign = 'center';
      if (!seen[k]) { c.strokeStyle = 'rgba(236,231,220,.22)'; c.setLineDash && c.setLineDash([3, 3]); c.strokeRect(40, y - 4, W - 80, 40); c.setLineDash && c.setLineDash([]);
        c.font = '600 16px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.5)'; c.fillText('？', W / 2, y + 13); const fr = wordFrom(k); c.font = '500 9.5px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.42)'; c.fillText(fitW(fr.length ? 'まだ眠っている言葉 — ' + fr.join('、') + 'の瓦礫に' : 'まだ眠っている言葉', W - 90), W / 2, y + 29); y += 54; continue; }
      const big = E.cjk ? '600 13px ' + SERIF : '600 italic 12px Georgia,"Times New Roman",serif';
      for (const l of E.o.split(' / ').flatMap(p => wrapF(p, big, W - 60))) { c.font = big; c.fillStyle = '#ECE7DC'; c.fillText(l, W / 2, y + 4); y += 16; }
      for (const l of wrapF(E.ja, '500 10px ' + SERIF, W - 60)) { c.font = '500 10px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.72)'; c.fillText(l, W / 2, y + 4); y += 13; }
      if (E.en) for (const l of wrapF(E.en, '500 italic 9.5px Georgia,serif', W - 60)) { c.font = '500 italic 9.5px Georgia,serif'; c.fillStyle = 'rgba(236,231,220,.6)'; c.fillText(l, W / 2, y + 4); y += 12; }
      c.font = '500 8.5px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.42)'; c.fillText(E.by, W / 2, y + 5); y += 24;
    }
  }
  c.textAlign = 'left'; pillAt('もどる', R_WBACK.x, R_WBACK.y - 4, R_WBACK.w, false); drawToggles();
}
function wordsTap(x, y) {
  if (inR(x, y, R_SND)) { toggleMute(); return; }
  if (inR(x, y, R_WBACK)) { if (WB.sel != null) WB.sel = null; else scene = WB.from || 'pass'; sfx('buy'); return; }
  if (WB.sel == null) SHELVES().forEach(([id], i) => { if (inR(x, y, wbRow(i))) { WB.sel = id; sfx('buy'); } });
}

// ---------- 還した後の「言葉」の頁（v3 その4、ユーザー指示：結果と重ねず、言葉の発掘を強調。まだの言葉は「？」） ----------
// 結果の頁で「つづける」を押すと出る。その都市の棚を開いて、今回掘り出した言葉を光らせ、新しい言葉に「新」を付ける
const R_WGO = { x: W / 2 - 94, y: 574, w: 188, h: 44 };
function drawCityWords(t) {
  const a = Math.min(1, (S.endT - S.rp0) / .4); c.globalAlpha = a;
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, 'rgba(14,14,12,.97)'); bg.addColorStop(1, 'rgba(22,21,15,.98)'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  const seen = wordsSeen(), L = shelfOf(S.st.id), got = new Set(S.wordsGot), nw = new Set(S.wordsNew), have = L.filter(k => seen[k]).length;
  c.textAlign = 'center'; c.font = '600 17px ' + SERIF; c.fillStyle = '#F2D27A'; c.fillText('瓦礫から掘り出した言葉', W / 2, 74);
  c.font = '500 11px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.7)'; c.fillText(S.st.city + 'の棚　' + have + ' / ' + L.length + (nw.size ? '　·　新しい言葉 ' + nw.size : ''), W / 2, 96);
  // 項目の高さを測って、入りきらなければ和訳を省く（新しい言葉は省かない）
  const big = E => E.cjk ? '600 14px ' + SERIF : '600 italic 13px Georgia,"Times New Roman",serif';
  const meas = (k, full) => { const E = WORDS[k]; if (!seen[k]) return { k, h: 54 }; const o = E.o.split(' / ').flatMap(p => wrapF(p, big(E), W - 84)).slice(0, 3), j = full ? wrapF(E.ja, '500 10.5px ' + SERIF, W - 84).slice(0, 2) : []; return { k, o, j, h: o.length * 18 + j.length * 14 + 30 + (got.has(k) ? 16 : 0) }; };
  let items = L.map(k => meas(k, true)); if (items.reduce((s, q) => s + q.h + 10, 0) > 440) items = L.map(k => meas(k, nw.has(k)));
  let y = 122;
  for (const q of items) { const E = WORDS[q.k];
    if (!seen[q.k]) { c.strokeStyle = 'rgba(236,231,220,.24)'; c.setLineDash && c.setLineDash([3, 3]); c.lineWidth = 1; c.strokeRect(30, y, W - 60, q.h - 6); c.setLineDash && c.setLineDash([]);
      c.font = '600 18px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.5)'; c.fillText('？', W / 2, y + 22); const fr = wordFrom(q.k); c.font = '500 9.5px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.45)'; c.fillText(fitW(fr.length ? 'まだ眠っている — ' + fr.join('、') + 'の瓦礫に' : 'まだ眠っている', W - 76), W / 2, y + 39); y += q.h + 10; continue; }
    const isN = nw.has(q.k), isG = got.has(q.k), glow = isN ? .5 + .5 * Math.sin(t * 3) : 0;
    c.fillStyle = isN ? 'rgba(242,210,122,' + (.1 + .06 * glow) + ')' : 'rgba(236,231,220,.05)'; c.fillRect(30, y, W - 60, q.h - 4);
    if (isN) { c.strokeStyle = 'rgba(242,210,122,.55)'; c.lineWidth = 1; c.strokeRect(30.5, y + .5, W - 61, q.h - 5); rr(38, y + 6, 24, 16, 8); c.fillStyle = '#F2D27A'; c.fill(); c.font = '700 10px ' + SERIF; c.fillStyle = '#1A160C'; c.fillText('新', 50, y + 18); }
    else if (isG) { c.font = '500 9px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.45)'; c.textAlign = 'left'; c.fillText('また出てきた', 38, y + 17); c.textAlign = 'center'; }
    let yy = y + 22 + (isN || isG ? 16 : 0); /* 「新」「また出てきた」は上の1行に */ for (const l of q.o) { c.font = big(E); c.fillStyle = '#ECE7DC'; c.fillText(l, W / 2, yy); yy += 18; }
    for (const l of q.j) { c.font = '500 10.5px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.7)'; c.fillText(l, W / 2, yy); yy += 14; }
    c.font = '500 8.5px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.45)'; c.fillText(E.by, W / 2, yy + 2); y += q.h + 10; }
  c.font = '500 10px ' + SERIF; c.fillStyle = 'rgba(236,231,220,.5)'; c.fillText('書架 ' + wordCount() + ' / ' + Object.keys(WORDS).length + '　·　地図の紙片のボタンからいつでも読める', W / 2, 556);
  c.textAlign = 'left'; if (S.endT - S.rp0 > .6) pillAt('地球へ戻る', R_WGO.x, R_WGO.y, R_WGO.w, true); c.globalAlpha = 1;
}
