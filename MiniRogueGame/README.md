# MICRO ARCADE

レトロCRT風の1画面ミニアーケード集（Vanilla JS + Canvas）。メニューから5本のゲームを選んで遊ぶ。スマホ縦持ち・スクロールなし・タップ／スワイプ操作。

→ 企画の詳細は [企画書.md](企画書.md)

## 収録ゲーム
1. **1-BIT HERO** — ミニ・ローグライク（鍵を取って出口へ、敵を避ける）
2. **BINARY** — 目標の数を2進数で作る制限時間パズル
3. **HACK** — 一致コードを時間内にタップ解除
4. **SNAKE** — CRTグリーンの定番スネーク
5. **BEEPER** — 光る順番を記憶して再現（サイモン）

## 動かし方
`index.html` は結合済みのクラシックスクリプト（`js/microarcade.bundle.js`）を読み込むので、
**PCでファイルをダブルクリックして直接開いても動く**（`file://` 可）。スマホ/公開も同様。

ローカルサーバで動かしたい場合（同一LANのスマホ実機確認など）:
```bash
cd MiniRogueGame
node server.js        # → http://localhost:4173
```

### ソースを編集したら必ずビルド
ソースは `js/` 以下の ES モジュール。編集後は結合バンドルを再生成すること:
```bash
node build.js         # js/microarcade.bundle.js を再生成
```
（`index.html` はバンドルのみを読み込む。`node build.js` を忘れると変更が反映されない。）

## 操作
- **タップ / クリック** … 選択・トグル・解除
- **スワイプ / 矢印キー** … 移動（HERO・SNAKE）
- **Enter / Space** … 決定、**Esc / Backspace** … メニューへ戻る

## 構成
- `js/core/` … 共通エンジン（ループ・入力・音・保存・パレット）
- `js/games/` … 1ファイル1ゲーム（`Scene` を継承）
- `js/menu.js` / `js/main.js` … メニューと配線

## ゲームの追加方法
1. `js/games/yourgame.js` を作り、`rogue.js` を手本に `export const meta` と `export class Game extends Scene` を書く。
2. `js/main.js` に `import * as yourgame from './games/yourgame.js';` を足し、`GAMES` 配列に追加。

エンジンAPI（`this.engine`）: `text() / rect() / stroke()`、`audio.beep|move|pick|good|bad|select()`、`storage.getHigh|setHigh()`、`toMenu()`。入力は `onInput(action, data)` で `'up'|'down'|'left'|'right'|'tap'|'confirm'|'back'` を受ける（論理座標 360×640）。
