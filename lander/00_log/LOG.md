# LANDER 作業ログ（申し送り）

新しい順。各エントリ: 実施内容 / 判断と理由 / 問題点 / 次アクション。

## 2026-10-25 P1.5 — 天体ツアー・モジュール・世界ランキングnet・名前事前入力・デバッグ・祝福（Sonnet 5.5）
- **実施**: (1) `bodies.js` 新規: 6天体データ（実重力・大気・見た目トークン sky/ground/rim/accent/fog/haze/skyObject/mood・obstacleStyle・celebTier）、`stageInfo`、重力=0.25*sqrt(realG/1.62)*(1+0.15*loop)、パッド幅/障害物数/速度の新式、風（2〜3正弦の突風＋符号ランダムの定常風、周回で x(1+0.3loop)）。旧ステージ毎+15%重力は撤廃。(2) game.js: 風・抗力・視界（放射グラデの霧。パッドのビーコンは霧の上に常時点滅）・金星の熱（受動-0.8/s、主エンジンx1.3）、火星の砂塵は視覚のみ(haze)。HUD: 天体名・実g・大気タグ・風矢印・モジュールアイコン。各天体の最初のステージに2秒の紹介バナー。(3) `modules.js` 新規＋game.js: FUEL TANK/STABILIZER/SHOCK ABSORBER/RADAR/SHIELD。ボーナス終了（成功/失敗とも）後・次ステージ前に 'module' 状態で2択（上限到達は除外、候補が1つなら1択、0なら省略）。永続（Continueで維持、新規ランでリセット）。blocksBack=true。(4) PRECISION x3 → x2。(5) `net.js` 新規: RELAY_URL='' で完全オフ、`__setRelayUrl`（テスト用）、submitScore/fetchWorldTop（5秒、AbortController＋競合タイマー、例外なし）。ranking.js に LOCAL/WORLD タブ（RELAY_URL設定時のみ。LOADING…/OFFLINE）、title.js のTOP10にも同タブ。build.js の FILES に bodies/modules/net/debug/autopilot を追加。
- **追加スコープ A 名前事前入力**: タイトルで名前未設定なら START でHTML名前入力→確定後に開始。設定済みなら `PILOT: NAME` ＋ CHANGE。ゲームオーバーは名前入力なし（保存名、無ければ PILOT で自動記録→ランキングで強調）。世界送信も同名。DOMは document 無しでガード、テストフックは `TitleScene._submitName`。ゲーム側の名前DOM（_showNameDom/_submitName）は削除。
- **追加スコープ B デバッグ**: `debug.js`（?debug または タイトルロゴ2秒以内5連打、セッション限り・保存しない、'DEBUG ON' トースト）。プレイ中（play/landing/cleared/crashed/bonusfailed）右上 y=100 に DBG ボタン、押すと一時停止パネル: AUTO LAND / WIN NOW / CRASH / STAGE -+ / NEXT BODY / BONUS▶(種類を順送り) / MODULE / FUEL FULL / +3 CONTINUES / CLOSE。`autopilot.js` はテストと AUTO LAND で共用。デバッグ中、またはデバッグ操作を使ったラン（`_dbgTainted`）はローカルランキング・ハイスコア・世界送信すべて対象外、HUDに DEBUG タグ。
- **追加スコープ C 祝福**: cleared でも着陸シーン（機体・旗・宇宙飛行士）を描き続け、スコアパネルを y128〜344 に移動・縮小（パッド面 y>=455 との差 >=111px、テストで400地形検証）。着陸シーケンス後は祝福ループ（`celebrationPose`、データ駆動）。ジャンプ頂点/滞空は重力に従う（月 28px/1.2s … 金星 12px/0.51s、12..40pxにクランプ）。tier0(月/エウロパ)=ふわっと大ジャンプ+手振り、tier1(イオ/火星)=ジャンプ+360°回転、tier2(タイタン/金星)=バク宙+拳突き上げ+2段ジャンプ、loop>=1 はダンス追加。PERFECT（vy<=8, vx<=3, 角度<=5°, ω<=6）で星のバースト。`_drawAstronaut(ctx,x,y,phase,t,pose)` に pose{dy,dx,rot,armL,armR} を渡す（描画は仮図形、P2が差し替え）。
- **判断・仕様からの逸脱（理由）**:
  1. **大気パラメータの調整（指示の「落ちる天体のみ調整」条項）**: 仕様値では着陸不能。同一のPDオートパイロット・50シード・250秒打切りで、火星(風0.8/1.2)=0/50、タイタン(抗力0.35・風0.6/0.6)=0/50(全て時間切れ)、金星(抗力0.5・風0.4/0.5)=0/50(時間切れ)。原因は物理: (a) 重力が0.23〜0.59px/s²と小さく、風加速(火星で最大2.0)が重力(0.38)を上回り、風に逆らう噴射の上向き成分で降下できない。(b) 縦方向にも抗力をかけると終端降下速度=g/drag がタイタン0.65・金星1.2px/s となり降下に数百秒かかる。調整: **火星 風 base0.08/gust0.3（抗力0.05据置）**、**タイタン 風0.06/0.12・水平抗力0.35据置・縦抗力 dragY=0.03**、**金星 風0.05/0.12・水平抗力0.2・dragY=0.045**（熱・視界は仕様どおり）。`dragY`（縦の抗力。省略時は drag と同じ）を新設したのは、指示の「vx,vyの両方に抗力」を守ると降下が非現実的になるため。結果: 全12条件 >=49/50。**風が仕様の1/10以下になった点は要判断**（オートパイロットは人間の最低限の目安。人間向けに強めたい場合は bodies.js の値を上げて p15.mjs の着陸テストで再確認）。
  2. 着陸可能性テストは障害物を除外（障害物は大気と無関係でオートパイロットに回避ロジックが無いため）。パッドが狭い各天体の2番目のステージで実施。DEBUGのAUTO LAND中は障害物の当たり判定を無効化（デバッグ専用）。
  3. タイトルのロゴタップは5連打カウント専用でゲームを開始しない（開始は他の場所のタップ）。
  4. ボーナス成功/失敗後に必ず module 状態を挟むため、p1 の該当テスト（ボーナス後 stage 遷移）を「module → _pickModule → 次ステージ」に変更。他の p1 変更: PRECISION x3→x2 の期待値、ステージ5の障害物数 5→4（新式）、名前入力フェーズ廃止（gameover は常に 'ranking'・自動記録）、title テスト（名前未設定は開始しない）、fuzz の _submitName→_pickModule、FUEL_RUN 検証前にモジュールを0へ（ランダム取得で燃料が変わるため）。
  5. 旧 `stageParams` のステージ上限8での頭打ちは廃止（stageBonus のみ min(stage,8)*50 を維持）。得点式は不変（モジュール最大でも1ステージ最大 4200 程度 < 8000）。
  6. FUEL_RUN の燃料は 45 x 燃料タンク倍率。
  7. 世界送信は「ローカルのTOP10入り」に関係なく score>0 のランで実施（世界側は上位20を別に管理）。
- **問題/注意**: 名前入力DOM・DBG操作の実機(iOS)確認は未実施。Chromeでタイトル→開始→DBG→WIN NOW→クリア画面（宇宙飛行士が見える・PERFECT表示）まで動作確認、最終ビルドでコンソールエラーなし。**build.js の stripExport が `export async function` を落としていた不具合を修正**（net.js で顕在化。修正前はバンドルが SyntaxError で真っ白）。RELAY_URL は未設定のまま。
- **検証**: `node build.js`＋`node --check` OK、smoke 2/2、p1 104/104、p15 387/387（反復で安定）。

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
