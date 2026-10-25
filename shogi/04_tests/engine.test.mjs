// CYBER SHOGI エンジン回帰テスト: node 04_tests/engine.test.mjs
// v1〜v3開発時にブラウザで確認した項目の恒久化。
import "../02_src/engine.js";
const E = globalThis.Engine;
const {
  computeNets, genMoves, applyMove, legalMoves, inCheck, setCtx,
  initialBoard, makeLineup, makeBoScript, mulberry32, FACTIONS, negamax, orderMoves,
} = E;

const mk = (t, s, p, caps) => ({ t, s, p: !!p, frozen: 0, caps: caps || 0 });
const H = () => ({ 0: { R: 0, B: 0, G: 0, S: 0, P: 0 }, 1: { R: 0, B: 0, G: 0, S: 0, P: 0 } });
const EMPTY = () => new Array(25).fill(null);
const baseCtx = () => ({ down: new Set(), pending: new Map(), faction: null, orbit: false });

let pass = 0, fail = 0;
function t(name, fn) {
  try { setCtx(baseCtx()); fn(); pass++; console.log("ok  " + name); }
  catch (e) { fail++; console.error("FAIL " + name + " — " + e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || "") + " got=" + JSON.stringify(a) + " want=" + JSON.stringify(b)); }
function ok(c, msg) { if (!c) throw new Error(msg || "assertion failed"); }

/* ---- 初期配置・回線 ---- */
t("初期配置: 全駒オンライン(corp)", () => {
  setCtx({ ...baseCtx(), faction: "corp" });
  const { board } = initialBoard("corp");
  const n = computeNets(board);
  for (let i = 0; i < 25; i++) {
    const p = board[i];
    if (p) ok(p.t === "K" || n.on[p.s].has(i), `piece at ${i} offline`);
  }
});
t("陣営編成: botnet=bot4/大駒なし, corp=金2, state=AGI, hacker=銀2", () => {
  const b1 = initialBoard("botnet");
  eq(b1.board.filter(p => p && p.s === 1 && p.t === "P").length, 4);
  eq(b1.board.filter(p => p && p.s === 1 && (p.t === "R" || p.t === "B")).length, 0);
  eq(b1.hands[1].P, 1);
  const b2 = initialBoard("corp");
  eq(b2.board.filter(p => p && p.s === 1 && p.t === "G").length, 2);
  const b3 = initialBoard("state");
  ok(b3.board.some(p => p && p.s === 1 && p.t === "R" && p.p));
  eq(b3.hands[1].P, 1);
  const b4 = initialBoard("hacker");
  eq(b4.board.filter(p => p && p.s === 1 && p.t === "S").length, 2);
});
t("強化適用: awaken/zeroday/extraBots", () => {
  const b = initialBoard("corp", { awaken: true, zeroday: true, extraBots: 2 });
  ok(b.board.some(p => p && p.s === 0 && p.t === "R" && p.p), "awaken");
  eq(b.board.filter(p => p && p.s === 1 && p.t === "P").length, 0, "zeroday");
  eq(b.hands[0].P, 2, "extraBots");
});

/* ---- オフライン制約 ---- */
t("切断された飛車は1歩のみ/接続時は走る", () => {
  let b = EMPTY(); b[20] = mk("K", 0); b[4] = mk("R", 0); b[0] = mk("K", 1);
  eq(genMoves(b, H(), 0).filter(m => m.from === 4).map(m => m.to).sort((a, c) => a - c), [3, 9]);
  let b2 = EMPTY(); b2[20] = mk("K", 0); b2[21] = mk("R", 0); b2[0] = mk("K", 1);
  ok(genMoves(b2, H(), 0).filter(m => m.from === 21).length === 7);
});
t("オフラインは成れない/オンライン歩は成る", () => {
  let b = EMPTY(); b[20] = mk("K", 0); b[6] = mk("S", 0); b[4] = mk("K", 1);
  const ps = genMoves(b, H(), 0).filter(m => m.from === 6 && ((m.to / 5) | 0) === 0);
  ok(ps.length > 0 && ps.every(m => !m.promo), "offline silver no promo");
  let b2 = EMPTY(); b2[20] = mk("K", 0); b2[16] = mk("G", 0); b2[12] = mk("G", 0); b2[7] = mk("P", 0); b2[24] = mk("K", 1);
  const pm = genMoves(b2, H(), 0).filter(m => m.from === 7);
  ok(pm.length === 1 && pm[0].promo === true, "online pawn promotes");
});
t("オフライン歩は最奥段へ前進不可(死に駒防止)", () => {
  let b = EMPTY(); b[20] = mk("K", 0); b[7] = mk("P", 0); b[24] = mk("K", 1);
  eq(genMoves(b, H(), 0).filter(m => m.from === 7).length, 0);
});

/* ---- 打ち込み ---- */
t("打ちは回線隣接のみ+二歩+最奥段禁止", () => {
  setCtx({ ...baseCtx(), faction: "corp" });
  const { board } = initialBoard("corp");
  const h = H(); h[0].P = 1;
  const drops = legalMoves(board, h, 0).filter(m => m.drop === "P").map(m => m.to).sort((a, b2) => a - b2);
  eq(drops, [13, 15, 16, 17, 18]); // 14はc4の二歩で不可、r0は遠い+最奥段
});

/* ---- ネットワーク機能 ---- */
t("SAT中継: 同行の遠隔駒がオンライン", () => {
  let b = EMPTY(); b[20] = mk("K", 0); b[15] = mk("B", 0); b[19] = mk("R", 0); b[0] = mk("K", 1);
  ok(computeNets(b).on[0].has(19));
});
t("HCKタップ: 隣接敵をオフライン化/F/W隣接で防護", () => {
  let b = EMPTY(); b[11] = mk("K", 0); b[6] = mk("R", 0); b[0] = mk("K", 1); b[1] = mk("S", 1);
  const n = computeNets(b);
  ok(!n.on[0].has(6) && n.tapped[0].has(6), "tap");
  b[7] = mk("G", 0);
  const n2 = computeNets(b);
  ok(n2.on[0].has(6), "protected");
});

/* ---- 陣営固有ルール ---- */
t("corp: 敵F/Wの防護半径2(他陣営は半径1)", () => {
  let b = EMPTY(); b[0] = mk("K", 1); b[1] = mk("G", 1); b[2] = mk("P", 1); b[3] = mk("B", 1);
  b[8] = mk("S", 0); b[13] = mk("K", 0);
  setCtx({ ...baseCtx(), faction: "corp" });
  let n = computeNets(b);
  ok(n.on[1].has(3) && !n.tapped[1].has(3), "corp protects at dist2");
  setCtx({ ...baseCtx(), faction: "state" });
  n = computeNets(b);
  ok(n.tapped[1].has(3), "other faction: tapped");
});
t("state: 敵SATは切断中も中継(他陣営は不可)", () => {
  let b = EMPTY(); b[4] = mk("K", 1); b[10] = mk("B", 1); b[14] = mk("R", 1); b[20] = mk("K", 0);
  setCtx({ ...baseCtx(), faction: "state" });
  let n = computeNets(b);
  ok(n.on[1].has(10) && n.on[1].has(14), "state relay");
  setCtx({ ...baseCtx(), faction: "corp" });
  n = computeNets(b);
  ok(!n.on[1].has(14), "no relay otherwise");
});
t("botnet: 敵botの成りで敵手駒+1(applyMove一貫)", () => {
  setCtx({ ...baseCtx(), faction: "botnet" });
  let b = EMPTY(); b[0] = mk("K", 1); b[16] = mk("P", 1); b[4] = mk("K", 0);
  const out = applyMove(b, H(), 1, { from: 16, to: 21, drop: null, promo: true });
  eq(out.h[1].P, 1);
});

/* ---- 捕獲昇格(★) ---- */
t("HCK★: タップ半径2(無印は半径1)", () => {
  let b = EMPTY(); b[20] = mk("K", 0); b[15] = mk("S", 0, 0, 2); b[0] = mk("K", 1); b[5] = mk("P", 1);
  ok(computeNets(b).tapped[1].has(5), "rad2");
  b[15] = mk("S", 0, 0, 0);
  ok(!computeNets(b).tapped[1].has(5), "rad1 control");
});
t("F/W★: 防護半径2(無印は不可)", () => {
  let b = EMPTY(); b[20] = mk("K", 0); b[21] = mk("G", 0, 0, 2); b[16] = mk("P", 0); b[11] = mk("R", 0);
  b[4] = mk("K", 1); b[3] = mk("G", 1); b[7] = mk("S", 1);
  ok(computeNets(b).on[0].has(11), "fw★ protects");
  b[21] = mk("G", 0, 0, 0);
  ok(computeNets(b).tapped[0].has(11), "normal fw: tapped");
});
t("SAT★: 斜め中継(無印は不可)", () => {
  let b = EMPTY(); b[20] = mk("K", 0); b[16] = mk("B", 0, 0, 2); b[4] = mk("R", 0); b[0] = mk("K", 1);
  ok(computeNets(b).on[0].has(4), "diag relay");
  b[16] = mk("B", 0, 0, 0);
  ok(!computeNets(b).on[0].has(4), "control");
});
t("AI★: 切断中も走れる", () => {
  let b = EMPTY(); b[20] = mk("K", 0); b[4] = mk("R", 0, 0, 2); b[0] = mk("K", 1);
  ok(genMoves(b, H(), 0).filter(m => m.from === 4).length > 2);
});
t("bot★: 斜め前にも進める", () => {
  let b = EMPTY(); b[20] = mk("K", 0); b[21] = mk("G", 0); b[16] = mk("G", 0); b[17] = mk("P", 0, 0, 2); b[0] = mk("K", 1);
  eq(genMoves(b, H(), 0).filter(m => m.from === 17).map(m => m.to).sort((a, c) => a - c), [11, 12, 13]);
});
t("捕獲でcaps加算(2で★)", () => {
  let b = EMPTY(); b[20] = mk("K", 0); b[21] = mk("R", 0, 0, 1); b[22] = mk("P", 1); b[0] = mk("K", 1);
  const out = applyMove(b, H(), 0, { from: 21, to: 22, drop: null, promo: false });
  eq(out.b[22].caps, 2);
  ok(E.rk(out.b[22]));
});

/* ---- 衛星軌道(強化) ---- */
t("orbit: 角が左右端をワープ", () => {
  setCtx({ ...baseCtx(), orbit: true });
  let b = EMPTY(); b[20] = mk("K", 0); b[24] = mk("B", 0); b[0] = mk("K", 1);
  ok(genMoves(b, H(), 0).some(m => m.from === 24 && m.to === 15), "wrap to r3c0");
});

/* ---- ダウンマス ---- */
t("ダウンマスへは移動も通過も打ちも不可", () => {
  setCtx({ ...baseCtx(), down: new Set([14]) }); // r2c4
  let b = EMPTY(); b[20] = mk("K", 0); b[24] = mk("R", 0); b[0] = mk("K", 1);
  const tos = genMoves(b, H(), 0).filter(m => m.from === 24).map(m => m.to);
  ok(!tos.includes(14) && !tos.includes(9) && !tos.includes(4), "slide blocked at down cell");
  const h = H(); h[0].P = 1;
  ok(!genMoves(b, h, 0).some(m => m.drop === "P" && m.to === 14), "no drop on down");
});

/* ---- シード決定論 ---- */
t("同一シードで経路・台本が一致/経路は重複なし", () => {
  eq(makeLineup(20261025), makeLineup(20261025));
  eq(makeBoScript(20261025, 1), makeBoScript(20261025, 1));
  const l = makeLineup(12345);
  eq(l.length, 3);
  eq(new Set(l).size, 3);
  const s = makeBoScript(7, 0);
  eq([...s].sort((a, b) => a - b), [...Array(25).keys()], "permutation");
});

/* ---- 詰み・王手 ---- */
t("詰み検出: 合法手ゼロ+王手", () => {
  let b = EMPTY(); b[0] = mk("K", 1); b[5] = mk("G", 0); b[10] = mk("K", 0);
  ok(inCheck(b, H(), 1), "in check");
  eq(legalMoves(b, H(), 1).length, 0, "mate");
});
t("negamax: 浮き駒を取る手を最善とする(接続維持できる位置)", () => {
  // 注: 取りに行くと自駒が回線から切れる局面では「取らない」が正しくなる
  // (オフライン減価>駒得)。それ自体がv2回線ルールの意図した挙動。
  let b = EMPTY(); b[20] = mk("K", 0); b[21] = mk("R", 0); b[16] = mk("P", 1); b[4] = mk("K", 1);
  const mv = legalMoves(b, H(), 0);
  let best = null, bs = -Infinity;
  for (const m of orderMoves(b, mv)) {
    const { b: b2, h } = applyMove(b, H(), 0, m);
    const sc = -negamax(b2, h, 1, 1, -Infinity, Infinity);
    if (sc > bs) { bs = sc; best = m; }
  }
  eq(best.to, 16, "captures hanging pawn");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
