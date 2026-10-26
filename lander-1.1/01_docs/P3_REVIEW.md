# LANDER P3 第三者検証（独立レビュー）

- 実施: 2026-10-25 / レビュアー: Opus 5.5（実装者とは別インスタンス。LOGは参照のみで、主張はコードと再実行で検証）
- 対象: `8f5d647` 時点の `lander/`（`02_src` は HEAD と差分なし。`00_log/LOG.md` のみ未コミット）
- 検証用スクリプトはスクラッチ領域に置いた（リポジトリ外）。ソースは一切変更していない

## VERDICT: **FIX FIRST**（修正は小さい）

D1（押しっぱなしの指を離すと結果画面が飛ぶ）は通常プレイで頻繁に起きる。D2（localStorage 例外）は起きにくいが、起きると得点が暴走しゲームが止まる。どちらも数行で直せるため、Pages 公開の前に直すことを勧める。D3 は中継（RELAY_URL）を有効にする前に直せばよい。現状 `RELAY_URL=''` なので、公開そのものは止めない。

---

## 確認済みの不具合

### D1 〔中〕0.5 秒より長く押し続けた指を離すと「タップ」になり、結果画面を勝手に進める
- **場所**: `02_src/core/engine.js:174-187`（`_pEnd` は押していた時間に関係なく `'tap'` を送る）、`02_src/game.js:87,468-471`（`INPUT_LOCK_S=0.5` は 0.5 秒以内に離した場合しか防がない）、`engine.js:133-142`（keydown が `e.repeat` を区別しない）
- **再現**: 実際の `Engine` で入力を流して確認した（スクラッチの `input.mjs`）。THRUST（180,600）を押したまま墜落、または着地させ、0.7 秒後に離した結果:
  - continue が残っている墜落: `crashed` → 自動で `_continue()`。continues 3→2、クラッシュ画面を見る前に再開する
  - continue 0 の墜落: `gameover` → `toMenu()`。**ゲームオーバー／ランキング画面を飛ばしてタイトルに戻る**
  - 着地: `landing` → `cleared`。着陸アニメが飛ぶ
  - キーボード: Space（＝推力兼 confirm）を押しっぱなしで墜落すると、オートリピートで continue を消費する（1→0）
- **影響**: 推力を押したまま接地・墜落するのはよくある操作で、人の反応は 0.5 秒を超えやすい。continue が黙って減り、最終スコアの画面が出ないことがある（記録は `_gameOver` で済んでいるので、ランキングの欠損はない）。
- **修正案**: engine の `_gesture` に押下時刻 `t0` を持たせる。①押していた時間が 350ms 程度を超えた解除は `'tap'` にしない、または ②`data.t0` をシーンに渡し、`Game._setOverlayState` が入った時刻より前に押し始めた指のタップは無視する。キーボードは keydown の `e.repeat` を data に載せ、結果画面ではリピートの confirm を無視する。

### D2 〔低頻度・高影響〕localStorage が例外を投げると、ゲームが起動しないか得点が暴走する
- **場所**: `02_src/core/storage.js:5-24`（`getHigh/setHigh/get/set` に try/catch がない）、`game.js:228`（`enter` が `getHigh` を直接呼ぶ）、`game.js:911-918`（`setHigh` が `_setOverlayState('landing')` より前にある）
- **再現**（スクラッチの `storage.mjs`。実際の Engine を使用）:
  - A. ストレージが丸ごとブロックされている場合（Safari/Chrome の「すべての Cookie をブロック」では `localStorage` へのアクセスが SecurityError を投げる）: タイトルは動く（ranking/title 側は try 済み）。START で `Game.enter` が例外を出し、**`state===undefined` のまま止まる**。BACK 以外の操作はできない
  - B. `setItem` だけが投げる場合（QuotaExceeded など）: 着地するたびに `_doSuccess` が例外で中断し、状態が `play` に残る。次のフレームでまた着地判定になり、**得点が毎フレーム加算され続ける**（1 秒で 0→62,459）。画面下に赤い ERR 帯が出たまま進まない
- **補足**: Pages の origin（`*.github.io`）の localStorage 5MB は、同じユーザーの全 Pages サイトで共有される。
- **修正案**: `Storage` の4メソッドを try/catch で包み、失敗時は既定値または false を返す。`getHigh` は `parseInt` の結果が NaN なら 0 にする（現状、壊れた値が入っていると `setHigh` が永久に更新されない）。

### D3 〔中・潜在〕中継 Worker: ログが 1MB を超えると、追記するたびにログを消すか、送信がすべて失敗する
- **場所**: `06_server/ranking-worker.js:58-64`（`ghGet` が `j.content` をそのまま使う）、`:67-85`（`text + 新行` でファイル全体を上書き）
- **根拠**: GitHub の Contents API は 1MB を超えるファイルの本文を返さない。object 形式では `content:""` と `encoding:"none"` になる。既定のメディアタイプで 403 `too_large` になるのか空 content になるのかは［要確認］。
  - 空 content の場合: 偽の GitHub API で再現した（スクラッチの `worker.mjs`）。9 行あったログが、次の送信で **1 行に上書きされる**（sha は正しいので PUT が成功してしまう）。git 履歴からは戻せる
  - 403 の場合: 以後の `/submit` と `/ranking` がすべて 502 になり、世界ランキングが止まる
- **規模**: 1 行は約 90B なので、約 1.1 万件で到達する。連投制限は isolate ごとのベストエフォートなので、悪用されれば早まる。
- **修正案**: `encoding==='none'` または `size>900_000` なら書き込まずに中断する。ファイルを月ごとなどに分けるか、上位 N 件だけのファイルを別に持つ。読み出しは `Accept: application/vnd.github.raw` を使う。

---

## 軽微な指摘（公開の可否には影響しない）
1. **右クリックが押下として扱われる**（`engine.js:202` が `e.button` を見ていない）。macOS ではコンテキストメニューが mousedown で開き、mouseup がページに届かない。その場合、次にクリックするまで推力が出続けるおそれがある［要確認: 実機の Chrome/Safari］。修正: `button!==0` は無視し、`contextmenu` で preventDefault と `_clearPointers()` を行う。
2. **名前入力オーバーレイ表示中も canvas が入力を受ける**。CHANGE で開いたまま START をタップすると発射し、オーバーレイがゲーム画面に残る。Tab で OK ボタンにフォーカスして Enter を押すと、`isTextTarget` が BUTTON を除外しているため confirm がタイトルに届く。さらに preventDefault でボタン自体は押されない。修正: オーバーレイが存在する間は TitleScene が入力を無視する。
3. **`fetchWorldTop` は `res.json()` がタイムアウトの対象外**（`net.js:16-17,36-38`）。ヘッダは返るが本文が来ない場合、WORLD タブが「LOADING…」のまま戻らない（`loading` 中は再取得しない）。中継は現在オフ。
4. **Worker の名前処理**: `slice(0,12)` は UTF-16 単位で切るので、絵文字のサロゲートペアを分断しうる。U+202E（文字の向きの上書き）、ゼロ幅文字、結合文字は通る。表示は canvas の文字描画だけなので XSS にはならないが、表示を荒らす余地は残る。本番の `ALLOWED_ORIGINS` から `http://localhost:4176` を外すことを推奨（Origin は偽装できるので、効果は限定的）。
5. **ローカルの名前**（`sanitizeName`）は 10 コードポイントで切るが、制御文字を除去しない（canvas に描くだけなので実害は小さい）。壊れた ranking の `name` に長さの上限がない（表示がはみ出すだけ）。
6. 設計上の気づき: BACK で途中離脱したランは記録されない。continue 0 の墜落では燃料×2 を加点するが、GIVE UP では加点しない。キーボードの推力はオートリピートによるパルスなので、PC では弱く途切れる。
7. `index.html` は Google Fonts を外部から読み込む（中継とは無関係のネットワーク通信。オフラインではフォールバック）。

## 問題なしと確認した項目
- **スコア偽装は仕様上の限界**として Worker 冒頭・README・PLAN §8 に明記済みで、不具合ではない。
- **正規のプレイで上限 `stage*8000` を超えるか**: 超えない。理論上の最大は、通常ステージが 燃料1500＋soft176＋horz78＋upr140＋omg80＋guide400＋stage400 ＝ 2774、PRECISION ボーナスが (600+1500)×2 ＝ 4200、ゲームオーバー時の加点が ≤300。ステージ s で終わったときの合計は ≤ (s−1)×4174＋300 で、s×8000 より小さい。

---

## 検証した内容と方法
| 項目 | 方法 | 結果 |
|---|---|---|
| 既存テスト | `node 04_tests/{smoke,p1,p15,p2a,p2b,p2m}.mjs` | 2+104+387+30+87+47 = **657/657 PASS** |
| バンドル | 作業コピーで `node build.js` を実行し、コミット済みバンドルと `cmp` | **バイト一致**。`node --check` OK |
| バンドルの残骸 | import/export の残り、`window.__*` などのグローバル、console.log、debugger、低速化フック、`ghp_`/`github_pat_` を grep（履歴も含む） | 該当なし（`__setRelayUrl` は IIFE 内でグローバルに出ない） |
| IIFE の名前衝突 | 15 ファイルのトップレベル宣言名を重複検査 | 重複なし |
| 入力の解除経路 | 実際の `Engine` と DOM スタブで検証: canvas 外での mouseup、touchcancel、2 本指で片方だけ離す、blur、pagehide、visibilitychange（解除後に古い指の move/end が来ても無視されるか）、`<input>` 上でのキー入力 | 17/17 PASS（右クリックの扱いは軽微 #1） |
| 長押しとタップの干渉 | 0.7 秒押してから離す（墜落・着地・ゲームオーバー）、Space のオートリピート | **D1 を確認** |
| 長時間ファズ | 実際の Engine（例外処理込みのループ）でタイトル→発射→ゲーム→ゲームオーバー→タイトルを巡回。ランダムなタッチ（最大 6 本）、マウス、キー、blur/visibility/pagehide、dt の急増（最大 1.3 秒）、ホットスポットへのタップ（DBG、デバッグ全ボタン、モジュールカード、GIVE UP、START など）。開始ステージは 1〜60 をランダムに選び、一部はオートパイロット操縦 | 6 本 × 40,000 秒相当、**約 980 万フレーム**。scene error **0**、NaN **0**、ポインタ不変条件の違反 **0**、ctx の save/restore 不整合 **0**、15 分超の play・2 分超の結果画面 **0**。ゲームオーバー 334、着地 766、ボーナス 289、モジュール選択 287、デバッグパネル 89 回、最大ステージ 60 |
| デバッグランの除外 | `setDebug(true)` で 3 本のファズを実行し、localStorage への書き込みを記録 | ranking・high への書き込み **0 件**（非デバッグ時は通常どおり記録） |
| 壊れた localStorage | 不正 JSON や不正要素の ranking、NaN の score | 落ちない（ranking.js は対応済み）。ストレージ自体が例外を投げる場合が **D2** |
| net.js | RELAY_URL='' での fetch 呼び出し回数。有効時の reject、同期 throw、ヘッダ無応答、壊れた JSON、500、本文無応答 | 無効時の呼び出し **0 回**。どのケースも例外を外に出さず、ヘッダ無応答は 300ms で timeout。本文無応答だけ戻らない（軽微 #3） |
| Worker | 偽の GitHub API で 23 ケース（範囲外の score/stage、文字列数値、Infinity、制御文字と `<>`、bidi、絵文字、結合文字、非 JSON、配列 body、不正 Origin と Origin なし、IP 連投、sha 競合 2 回→成功、9 回→502、GitHub 側 500、OPTIONS、GET /ranking、1MB 超） | 検証・CORS・連投 429・競合の再試行は仕様どおり。トークンはどの応答にも含まれない（エラーは汎用の `server` を返す）。**1MB 超で D3** |
| 着陸できるか | p15（周回 0〜1、各天体 49〜50/50）に加え、周回 2〜4 を各 20 シード | 周回 4 まで全天体で着陸できる（最低は火星 L4 の 14/20）。PRECISION は全天体 20/20、FUEL_RUN は全天体で成功例あり |
| 大気の効果 | `bodies.js` を確認 | 風・抗力・視界制限は火星・タイタン・金星だけ。月・エウロパ・イオは null または 0 ✓ |
| モジュール効果 | `modules.js` と `game.js` を照合 | 説明どおり（燃料＋25%/Lv、角速度減衰 0.82→0.6→0.45、着地速度許容＋6/＋8、RADAR、SHIELD は各ステージ 1 回）✓ |
| 性能 | 毎フレームのグラデーション生成箇所、メモ化の上限、粒子の上限、RADAR 予測の負荷を確認 | 毎フレーム生成するグラデーションは霧 1・RCS 最大 2・タイトルの空 1 だけ。キャッシュの鍵は有限。粒子は爆発 28・煙 80・蒸気 18 が上限。RADAR 予測は ≤2400 ステップで 0.11ms/フレーム（M 系の node）。問題なし |
