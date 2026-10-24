# LANDER 作業ログ（申し送り）

新しい順。各エントリ: 実施内容 / 判断と理由 / 問題点 / 次アクション。

## 2026-10-25 P1 — ゲームプレイ修正・機能（Sonnet 5.5）
- **実施**: (1) engine.js: 全ポインタをid追跡（`engine.touches` 配列＋互換 `engine.pointer`）、touchstart/move/end/cancel の changedTouches 全走査、マウスの move/up を window で受信、blur/visibilitychange(hidden)/pagehide で全解除、INPUT/TEXTAREA/contenteditable 上のキー入力は無視。タップ/スワイプは「他の指が無い状態で最初に置かれた指」のみ、cancel はタップにしない。(2) game.js: 全タッチをxゾーンで評価（推力＋傾きの同時押し可）。(3) B1': バウンス状態の累積>1.5秒で決着（|角度|<=33°成功／超過は 'TIPPED OVER'）。(4) B2: 地形帯 FLOOR_Y=540/FLOOR_MIN=440、パッド面Y 455〜515（脚込み下端<=525<=BTN_Y-12）。(5) Continue×3（'crashed'→TAP:CONTINUE / GIVE UP）、HUDにアイコン。(6) ranking.js 新規（純関数＋行描画ヘルパ）、ゲームオーバーで名前入力DOM→ランキング、タイトルにTOP3＋RANKING開閉。(7) ボーナス（3ステージ毎、MOVING_PAD→PRECISION→FUEL_RUN ローテ）。(8) 着陸シーケンス（'landing' 2.6秒、データ `landingSeq`＋`landingPhase()`、描画は `_drawAstronaut`/`_drawLandingFlag` に隔離）。(9) ランキングのstageは到達最大ステージ。build.js の FILES に ranking.js 追加。
- **判断・仕様からの逸脱（理由）**: ①結果画面（landing/cleared/crashed/bonusfailed/gameover-ranking）は入力ロック0.5秒（cleared遷移直後は0.3秒）。操作中の指を離した際の'tap'が即座に次へ進める事故を防ぐため（エンジンは長押し解除も'tap'とするため）。②パッドの下の地形をパッド幅いっぱいに平坦化（従来は端で地形がパッド面と食い違い得た）。③障害物のY上限を480→410、帯幅300→250（地形帯が440〜に上がり被るため）。④クラッシュ時の燃料×2加点は最終クラッシュ（gameover）のみ（Continue/ボーナス失敗でも加点すると稼げてしまうため）。⑤PRECISIONの「score x3」は (600+燃料*10)*3、ボーナス成功時は通常のステージ得点・誘導ボーナスは付けない。⑥バウンス決着タイマーは「地面から30px以上離れたら離陸とみなしリセット」（重力が0.25px/s²と極小でバウンス後は長く浮くため、飛び上がった後の誤決着を避ける）。⑦名前入力中は blocksBack()=true（BACKで入力を失う誤操作防止）。⑧着地後、機体の傾きは landing 中に0へ戻す（宇宙飛行士の絵と整合）。⑨gameover後のタップは従来のリトライではなくタイトルへ（指示どおり）。
- **問題点/注意**: 名前入力DOMの実機確認（iOSの自動フォーカス・キーボード被り）は未実施（headlessはDOM無し＝フックのみ検証）。PRECISION成功は3000点超で強め（要バランス判断）。見た目は全て仮（P2対象）。
- **検証**: `node 04_tests/smoke.mjs` 2/2、`node 04_tests/p1.mjs` 102/102（ランキング純関数、パッド位置2000地形、バウンス決着、Continue、ボーナス、移動パッド、着陸シーケンス、マルチゾーン、タイトル、5000フレームfuzz、エンジン入力スタブ）、`node build.js`＋`node --check` OK。ブラウザでタイトル→開始、コンソールエラーなし、パッドがボタン帯の上に表示されることを目視。

## 2026-10-25 P0 — スタンドアロン化（Opus 5.5 リーダー）
- **実施**: `lander/` を番号付きフォルダで新設（00_log/01_docs/02_src/03_assets/04_tests/05_legacy）。MICRO ARCADE版 `MiniRogueGame/js/games/lander.js` を無改変で `05_legacy/lander_microarcade_v1.js` に保存し、`02_src/game.js` へ移植（import先のみ変更）。core（engine/audio/storage/palette）は meteor/ から fork、保存キー接頭辞は `lander.`。`build.js`（→ `02_src/lander.bundle.js`）、`server.js`（:4176）、`.claude/launch.json` に "lander" 追加。
- **検証**: `node 04_tests/smoke.mjs` 2/2、ブラウザで起動・コンソールエラーなし。
- **判明した問題（コード根拠）**: B1 ポインタ解除漏れ（canvas外のmouseup・touchcancel未処理）で噴射が固着＝「浮遊して動かない」の主因。B1' パッド上での低速バウンス無限ループ。B2 パッドY(545-595)がボタン帯(560-640)と重なる。D1 難易度は重力・パッド幅も上がるがステージ8で頭打ち。詳細は `01_docs/PLAN.md` §2。
- **判断**: MICRO ARCADE版は触らない（保持要件）。ランキングは静的配信の制約でローカル保存（PLAN §3）。オプションと難易度軸は提案に留めユーザー判断待ち（PLAN §6）。
- **次**: P1（Sonnet）ゲームプレイ修正・機能 → P2（Sonnet）ビジュアル/音 → P3（Opus）第三者検証。push は指示待ち。
