# EXPEDITION 共通試作台（段階1）

`harness.js` = 360x640 論理キャンバス + v1.1 と同じ物理・操作・着地判定 + デバッグパネル。`game.js` の Game クラスには依存しない（定数だけ複製、描画は `02_src/art.js` を読み取り import）。
デモ: http://localhost:4177/07_lab/expedition/00_harness/index.html （平地+パッドに着陸/離陸。`demo.js`）

## 操作（ゲームと同じ）
画面下の3ボタン（左=左回転ボタン / 中=メイン噴射 / 右）。画面のどこでも左1/3・中1/3・右1/3 を押すと同じ（y>52、マルチタッチ可）。キー: ←/→ または A/D、↑/W/Space、**R = 即リセット**。
左ボタン=機首が時計回り+右へドリフト（game.js の反作用規約そのまま）。

## API
```js
import { createLab, gradeFor, W, H } from '../00_harness/harness.js';
const lab = createLab({
  canvas, title, defaults: { g, thrust, ang, damp, drag, fuel, rcs, vec },   // ミッション既定（URL が優先）
  extraParams: [{ key, label, min, max, step, def }],                       // ミッション固有スライダー → lab.params[key] / ?key=
  world: { terrain: [{x,y}...], pads: [{x,y,w,id}] },                      // terrain は x=0..360 昇順
  start(lab) { lab.resetShip({x,y,vx,vy,angle}); /* ミッション状態をここで初期化 */ },
  onUpdate(lab, dt), onTouchdown(lab, {kind:'pad'|'ground', pad, m:{vy,vx,ang,om,dist}, grade}),
  onLiftoff(lab), onCrash(lab, reason, detail), onTap(lab, x, y),   // onTap は lab.controlsEnabled=false の間だけ
  onDrawBack(ctx, lab), onDrawMid(ctx, lab) /* 地形の後 */, onDrawFront(ctx, lab), drawTerrain(ctx, lab),
  velRef(lab) -> {vx,vy}|null,        // 速度ベクトル矢印の基準系（相対速度表示に）
  telemetryExtra(lab) -> string, hud: false /* 標準 HUD を消す */
});
lab.start();
```
主な lab メンバ: `ship{x,y,vx,vy,angle,omega,fuel}`, `state('play'|'grounded'|'crashed')`, `t`(経過秒), `clock`, `params`, `input{left,main,right}`, `frozen`(物理停止), `controlsEnabled`, `hideShip`, `crash(reason,detail)`, `reset()`, `padAt(x)`, `terrainY(x)`, `fuelPct()`, `drawHud()`, `burst(x,y,n,color)`。
テスト用: `lab.script = (lab)=>({left,main,right})`（実入力の代わり）、`lab.step(dt)`、`lab.simulate(秒, controller, untilFn)`（描画なしで進める）。`window.__lab` に公開。

## デバッグパネル
右上 DEBUG ボタン（幅 760px 以上、または `?dbg=1` で初期表示）。スライダー: 重力 / 推力 / 角加速度 / 角速度減衰 / 抗力 / 燃料 / RCS ドリフト（+ミッション固有）。値は URL に差分だけ書かれる（`?g=0.03&thrust=5.2`）→ COPY LINK で共有。DEFAULTS / RESET。速度ベクトル（機首方向の点線つき）の切替。テレメトリ: state, t, vx, vy, angle, omega, fuel, 高度。
物理（game.js と同じ）: 角加速度 ang°/s²、角速度は damp^dt で減衰、主推力は機首方向、`vy += g·dt`、抗力 `v -= v·drag·dt`、燃料 主5/s・RCS1.5/s。着地は SAFE(22/13/28°/20) 即成功・BOUNCE(45/26/55°/40) までバウンス・超えると即クラッシュ・傾斜 >10° は STEEP GROUND、パッド外の安全接地は grounded（推力で離陸、初速 -7）。グレード表は game.js と同じ。
