# LANDER 作業ログ（申し送り）

新しい順。各エントリ: 実施内容 / 判断と理由 / 問題点 / 次アクション。

## 2026-10-25 中継差し替えの確認・HUD公開（Opus 5.5 リーダー）
- **中継**: ユーザーが ranking-worker.js を貼り替え、Secret `ADMIN_KEY` を追加。書き込みなしで確認：/ranking 正常、/name で「みや」=登録済み・「ミヤ」=未使用（全角・カナは別名）、鍵なし送信400、管理キーなし/誤り401、他人の削除403。**ユーザーが実機で名前の追加・削除（WORLD記録の削除を含む）を確認済み**。
- **HUD（Sonnet）**: 計器ラベル DESCENT/DRIFT/TILT/SPIN、重力・大気の常時表示、PILOT名、初回だけの計器説明（表示中は物理停止）。全テスト 2,388件通過、画面を目視確認。
- **既知の軽微点**: ステージ開始直後、機体（Y=90）が情報行の右端と一瞬重なる（すぐ降下して解消）。
- **次**: ボーナス再設計（PLAN §7f：TERRA＋3択＋SKIP）。

## 2026-10-25 統合・公開：HOLD/ABORT・再開・パイロット・所有キー・WORLD ADMIN（Opus 5.5 リーダー）
- **統合**: ゲーム側（Sonnet: HOLD/ABORT、保存と再開、PUBLIC BETA、パイロット3名、WORLD ADMIN）と中継側（Sonnet: 名前ごとベスト、names.json、所有キー、/name /delete /admin/*）を並行実装→統合。全テスト 1,212件通過（smoke p1 p15 p2a p2m p2b p2j p3fix p4hold p4save p4net）。
- **問題と対処**: 2担当が同じ p3fix.mjs を編集し、中継担当の「送信に鍵を自動付与」修正が後勝ちで消えていた → リーダーが1行で復元。教訓: 並行担当に同じテストファイルを触らせない。
- **互換性の確認**: 新ゲームは旧中継（稼働中）でも送信可、/name は旧中継で404→オフライン扱いで登録許可。よって **ゲームを先に公開→中継を後で差し替え** の順序で安全。公開済み（PUBLIC BETA を公開バンドルで確認）。
- **次（ユーザー作業）**: Cloudflare で ranking-worker.js を貼り替えて Deploy、Secret `ADMIN_KEY` を追加。差し替え後、ユーザーのスマホで1回プレイして「みや」を鍵付きで確保。

## 2026-10-25 世界ランキング有効化（Opus 5.5 リーダー）
- **実施**: ユーザーが Cloudflare Worker `lander-ranking` を作成（https://lander-ranking.euler057721.workers.dev）。`02_src/net.js` の `RELAY_URL` に設定して公開。
- **確認（データを書かない範囲）**: GET /ranking 200 `{"top":[]}`、CORS許可元 `https://junji-miyazaki.github.io`、OPTIONS 204、許可外Origin 403、不正値 400。テスト実行後も本番ランキングは空（Node の fetch は Origin を付けないため 403 で弾かれ、書き込まれない）。
- **実プレイで確認済み**: ユーザーの通常プレイ（名前「みや」、1421点、ステージ2）が送信され、GET /ranking に反映（top.json への書き込み成功＝トークン権限・端から端まで動作）。日時はUTCで保存（JST＝+9時間）。

## 2026-10-25 公開（Opus 5.5 リーダー）
- **実施**: ポータル `index.html` に LANDER のリンクを追加し、18コミットを push。GitHub Pages で `lander/index.html` が 200、公開バンドルが最新（シールドLv2の文言で確認）、ポータルのリンク反映を確認。公開URL: https://junji-miyazaki.github.io/game/lander/index.html （デバッグは `?debug`）。
- **問題と対処**: 旧トークン（classic）とキーチェーンの認証が失効しており push 不可。ユーザーが fine-grained トークンを作成。`token.txt` に複数のトークンが入っており、`game` への push は上から2番目で成功。一番下のトークンは `game` に拒否された（`lander-scores` 専用なら正しい）。push のトークン抽出は `github_pat_` 形式にも対応させた。
- **次**: 実機での確認（音・操作感・名前入力・fps）。ランキング中継は Worker の URL 待ち（受け取ったら `02_src/net.js` の `RELAY_URL` に設定）。`token.txt` の失効済みトークンの整理はユーザー側で行う。

## 2026-10-25 モジュール調整（Opus 5.5 リーダー、直接実装）
- **実施**: ユーザー判断で FUEL TANK（燃料+25%）を候補から除外。SHIELD を Lv2 まで重ねられるように変更（レベル＝ステージ毎の吸収回数、毎ステージ回復、残り回数ぶん同心円リングを表示）。候補は STABILIZER / SHOCK ABSORBER / RADAR / SHIELD の4種・合計7レベル。
- **テスト**: p15 にシールドLv2（2回吸収→3回目でクラッシュ→次ステージで回復）を追加。燃料150前提だった PRECISION の期待値と、モジュール数を5と決め打ちしていたファズを修正。全テスト832件通過。
- **補足**: fuelMulFor は FUEL_RUN 計算の互換のため残置（Lv0=×1）。art.js の燃料グリフも未使用だが残置（害なし）。

## 2026-10-25 リーダー統合（Opus 5.5）— P2b後の調整
- **実施**: 新SFXと重複していた旧8bitビープを削除（モジュール取得・着陸・タイトル開始。開始は uiTap に置換）。**クラッシュ音はユーザー指定で旧来の低いビープ（120Hz・ノコギリ波・0.25秒）に戻した**（生成SFXは不採用）。p2bのテストを意図に合わせて更新。
- **判断**: 発射演出は `TitleScene` に `{launch:true}` を渡したときだけ有効（main.jsで指定済み）。既存テストの前提を壊さないため、この形を採用。初回タップがSTARTだとタイトル曲が鳴らずに発射へ進む（iOSの仕様で最初の入力までは音を出せない）→ 許容。
- **確認**: 全テスト 657/657。タイトル画面をスクリーンショットで目視確認。
- **未確認**: 実機での音の聴感（全音源）、iOSでのフォント・fps、名前入力DOM。
- **次**: P3 Opus第三者検証（1回）→ ユーザーの push 指示待ち → 中継URLの組み込み（ユーザーのWorker作成後）。

## 2026-10-25 P2b — アニメーションタイトル・発射シーケンス・音楽フック・ミュート（Sonnet 5.5）
- **実施**: (1) タイトル再設計（art.js に追加のみ: `SITE/astronautCycle/drawTitleSky/drawLaunchSite/drawTower/drawRocket/drawLaunchFlame/drawGroundBlast/drawSmoke/drawSpeaker`。既存関数は無変更）。地球の青の時間帯の発射場: まばらに瞬く星・低い地平線の暁光・遠景の丘と灯り・パッドと照明柱。白い汎用の再使用型ブースター（ロゴ/ブランド/既存リバリー無し。象牙〜青白のグラデ、段間にティールの細線、グリッドフィン、折りたたみ脚）、格子のサービスタワー（クルーアクセスアーム＋上段アーム、航空障害灯2つがゆっくり点滅）、足元と側面の蒸気。宇宙飛行士は `drawAstronaut` を1.4倍で使用、22秒周期: タワーから歩く→手を振る→ハッチへ搭乗(フェード、ハッチが点灯)→内部→ハッチで再び手を振る→引っ込む→無人→再開。ロゴ=軽いウェイト・字間16の `LANDER`、デバッグ5連打ターゲットはロゴ枠のまま。UI: PILOT/CHANGE・START(ピル、呼吸する枠)・BEST・RANKING・右上にスピーカー(MUTE)。全UIは発射場の地面(y>=408)に置きロケット/タワーと重ならない。
- **(2) 発射**: `LAUNCH={total:3.5, ignite:0.75, arm 1.0-1.7, lift:1.6, accel:300}`。0〜0.75s 控えめな3-2-1、点火(閃光＋`sfx.launch`＋煙バースト12個)、アーム退避、上昇は 0.5*300*u^2（ゆっくり→加速）、カメラは上昇量の0.6倍で追従＋空が宇宙色へ、2.85s から暗転→3.5s で `startGame()`。ゲーム側は `fadeInScene()`（main.js）が暗転から0.8sでフェードイン。タップ/決定でスキップ（1回だけ発火）。名前未設定は従来どおり名前入力→確定→発射。**`new TitleScene(engine, startGame, {launch:true})` のときだけ発射を挟む**（省略時は従来の即開始。p1/p15 の既存テストが「タップ→即 started」を前提にしているため。main.js は launch:true を指定）。
- **煙（モクモク）**: 1粒=陰の円＋4つの柔らかい円(位置が回転して転がる)＋若い粒だけ暖色の下照り。放射グラデはキャッシュ済みの単位円を scale して再利用（粒ごとにグラデ生成しない）。粒は横へ110〜260px/sで噴き出し→指数減衰で減速・半径が拡大(11〜19→約50〜70)・浮力で上昇・ゆるい横風・寿命2.3〜3.4s でフェード。点火時は30粒/s＋バースト、上昇後は12粒/s。炎は煙の手前（白い芯＋琥珀、ノズル根元のグロー、パッド上では炎導坑で切る）。
- **性能上限**: 煙 `SMOKE_MAX=80`、蒸気 `STEAM_MAX=18`（spawn 側で強制、5000回スパムでも超えない）。最悪時の円描画は 80x6 ≒ 480 回/フレーム（発射の約2秒のみ）。待機中は蒸気最大18粒＋タワー/ロケットのパス描画のみ。オフスクリーンキャッシュは使っていない（動く要素が多いため）。実機fpsは未計測。
- **(3) フック**: main.js: `Music.attach(engine.audio)`＋保存値の `restoreMute`。キー `muted`('1'/'0'、実体は `lander.muted`)。title.js 共通ヘルパー `musicOf/applyMute/toggleMute/restoreMute/isMuted`（`engine.music` でテスト差し替え可）。タイトル: 最初の入力で `playTitle`、`update` で `tick`、ゲームから戻った時（audio.ctx 有り）は enter で即 `playTitle`、START で `stopAll(2.5)`、点火で `sfx.launch`。ゲーム: `_initStage` で天体が変わった時だけ `playBody(id)`（同天体の次ステージ/Continueでは再起動しない）、`update` で `tick`、`_doSuccess`→`sfx.landing`、`_doCrash`→`sfx.crash`、`_pickModule`→`sfx.module`、CONTINUE/GIVE UP タップ→`sfx.uiTap`、`exit()`→`stopAll(0.6)`。ミュートは `Music.setMuted` と `engine.audio.enabled=false`（ビープも消える）。ゲーム内ミュートボタンは HUD 上段(x140..178, y18..50)＝操作無効帯・BACK・DBG・DEBUGタグ・スコアのいずれとも非重複（右上はスコア/モジュールで埋まるため）。
- **判断/注意**: 既存の8bitビープ(`engine.audio.good/bad/beep`)はそのまま残してある（SFXと二重に鳴る。生成音楽の世界観と合わなければ整理）。初回は音声がロックされているため、最初のタップが START だと「タイトル曲なし→すぐ発射」になる（RANKING/CHANGE/MUTE など先に触ると鳴る）。iOS制約の範囲での仕様。名前入力オーバーレイのスタイルは未変更。
- **テスト**: `04_tests/p2b.mjs` 87件（発射の状態機械/スキップ/名前先行/CHANGE・ロゴ非発射、粒子上限とスパム、粒子の物理、上昇の加速、タップ対象の非重複・ロケット非重複・40pt、スタブMusicでの全フック、ミュートの永続・復元・ビープ停止、飛行士サイクルの連続性、`fadeInScene`、3000フレームのランダム入力ファズ、異常dt、save/restoreとNaN）。既存 smoke 2/2・p1 104/104・p15 387/387・p2a 30/30・p2m 47/47 通過、`node build.js`＋`node --check` OK。
- **目視(ブラウザ 390x700, ?debug、rAFを0.05倍速にして各時点を撮影)**: タイトル待機（飛行士が歩く/手を振る）、カウントダウン、点火＋煙、アーム退避、リフトオフ、上昇＋宇宙色＋暗転、ステージ1(Moon)へフェードイン、HUDのミュートアイコン。煙は厚い雲として左右へ広がり薄れるのを確認。ミュート保存値の '1'→'0' 切替も実ブラウザで確認。コンソールの新規エラー無し。
- **未確認**: **音は一切聴いていない**（タイトル曲/発射SFX/ミュートの実音、スキップ時に `sfx.launch` が鳴り続ける挙動、`stopAll(2.5)` と `playBody` のクロスフェードの聞こえ方）。実機iOS（字間、60fps、発射中のfps、名前入力DOM）。搭乗後に「ハッチで手を振る」場面の目視（周期22秒のため静止画では未確認、サイクル関数は単体テスト済み）。
- **次**: P3 第三者検証。push/commit は指示待ち。

## 2026-10-25 P2a — ビジュアル再設計（Sonnet 5.5）
- **実施**: `art.js` に全描画プリミティブを実装（背景/天体/地形/パッド/誘導線/障害物/機体/宇宙飛行士/旗/祝福FX/粒子/HUD/操作バー/オーバーレイ/BACK）。game.js は描画部のみ置換（`_renderScene` 以降の `_draw*` を art 呼び出しに。物理・状態機械・タイミング・判定は無変更、`_drawAstronaut/_drawLander/_drawCelebFx/_drawLandingFlag` は薄いラッパとして残置）。palette.js を新ベースライン（#06080E / 象牙#ECE6D8 / ティール#63D8C9 / 琥珀#FFB547 / 赤#FF4A3D=危険のみ、キー名は互換維持）に。bodies.js は見た目トークンのみ調整（sky/ground/rim。ゲーム数値は不変）。engine.js は text()/_drawBack()/imageSmoothing のみ（フォントスタック `-apple-system, "SF Pro Display", "Helvetica Neue", "Rajdhani"`）。ranking.js は行/タブの描画のみ（ヘアライン区切り、行高 22→30）。style.css/index.html は色とフォントと名前入力DOM（!important上書き）。
- **デザイン判断**: 静かな余白・2アクセントまで・スキャンライン/重いグローなし。グローは機体の炎とパッドのビーコン/誘導灯のみ。HUDはヘアライン枠＋ベクトルのピクトグラム（しずく/下矢印/左右矢印/実角度で傾くバー/円弧矢印/風=矢印+流線/残機=小さな船/モジュール=5種のグリフ）、数値は固定幅スロット（`num()`）でジッター無し、速度・角度は既存しきい値で象牙→琥珀→赤。機体=象牙のカプセル＋目のような大きな丸窓（ハイライト付き）＋ゆっくり点滅するアンテナ＋丸い足パッド、炎は白→琥珀のグラデ。宇宙飛行士=2頭身（バイザー反射・バックパック・胸の計器）、celebrationPose(dy,dx,rot,armL,armR,flagWave,fx)と着陸フェーズ(descend=ハシゴ/walk/flag/wave)を全て描画、FXは星とハート。地形=3層（奥2層は空色に寄せる空気遠近）＋稜線のリムライト、天体別の質感（月=クレーター/エウロパ=ひび/イオ=溶岩筋+脈動する噴出口/金星=亀裂）。空=月の地球（薄い大気縁）、木星（縞+大赤斑ヒント+周縁減光、HUD可読性のため減光）、土星（霞越し・環）、フォボス、金星の拡散太陽光。星は真空天体のみ・ゆっくり瞬く。霧(radial gradient 9段ストップ)・火星の霞は帯が出ない。障害物=rock(面ごと陰影)/ice(半透明シアン)/lava(暗い地殻+脈動する亀裂)、半径は当たり判定以内。静的な空と地形は画面外キャンバス(2x)に1回だけ描いてキャッシュ（`cachedLayer`）、グラデもキーでキャッシュ。
- **操作バーの向き（要確認）**: 入力ゾーンは不変。左ボタン=機首が右(時計回り)・右ボタン=機首が左(反時計回り)という既存の表記に合わせ、ピクトグラムは「機首の回転方向」を示す（左ボタンに時計回り矢印）。「左ボタン=左回転の絵」にしたい場合は art.js `drawControls` の `rotArrow(…, i === 0)` を反転するだけ。
- **テスト変更（理由付き）**: p15 の2か所（霧のradial gradient検出）を「最初のradial gradient」→「半径=visibility(150/110)のradial gradient」に変更。空/船のグラデもradialになり、旧検出法は実装詳細に依存していたため。意図（霧の半径・火星に霧なし・ビーコンが霧の後）は同じ。新規 `04_tests/p2a.mjs`（30件）: 全天体x全状態x周回x全ボーナス種のgame描画、全関数直接呼び、全celebrationPose/全着陸フェーズ、save/restore釣り合い、NaN/Infinity非混入、SAFE/BOUNCE値・重力・パッド式・LANDING_SEQ_S・各判定矩形（クリアパネル/GIVE UP/モジュールカード/DBG/デバッグボタン）・操作3ゾーン・パレットのスポットチェック。
- **検証**: `node build.js`＋`node --check` OK。smoke 2/2、p1 104/104、p15 387/387、p2a 30/30（p2m 47/47 は別担当、通過を確認）。ブラウザ(390x700, ?debug)で目視: 月/エウロパ/イオ/火星/タイタン/金星の各プレイ画面、着陸シーケンス＋祝福＋クリアパネル(金星,PERFECT)、CRASHED、BONUS FAILED、モジュール2択、ゲームオーバーのランキング(10行)、HUD(通常/ボーナス/DEBUG)、主エンジン押下状態、名前入力DOM、AUTO LAND飛行。コンソールエラーなし（履歴に出る "Unexpected token 'export'" 2件は再読込後に増えず、バンドル自体は `new Function` で構文OK＝過去ロードの残り）。
- **未確認/注意**: 実機iOS(SF Pro・ctx.letterSpacing対応差・60fps)は未確認（非対応環境は字間を手動描画するフォールバックあり、p2aで実行のみ確認）。タイトル画面(title.js)は未リデザイン（engine.textの新フォントで表示は崩れないが旧レイアウトのまま、次フェーズ）。2系統同時押しの見た目（左+推力）はスクリーンショットで未確認（単押しのみ）。RCS噴射と主炎の目視はMoon上の単押しのみ。ホットパスのメモリ/fpsは未計測。
- **次**: P2b タイトル再設計、P3 第三者検証。push/commit は指示待ち。

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

## 2026-10-25 P2m — 生成音楽＋効果音（Sonnet 5.5）
- **実施**: `02_src/music.js` を実装（API不変: attach/setMuted/isMuted/playTitle/playBody/stopAll/tick/sfx.*）。WebAudioのみ。音楽バス≒-18dBFS(0.125)、SFXバス0.32。ctxは`engineAudio.ctx`を遅延取得、無い間は全no-op（ミュートは先に保存し、ctx生成時に反映）。スケジューラはAudioContext時計＋0.6秒先読み（tick駆動、setInterval無し）。ノイズバッファは1本共有。
- **天体別**: title=A基音の鋸歯3本ドローン(LPF+0.045Hz LFO)＋長調ペンタのベル＋フィードバックディレイ／moon=ほぼ無音（極小サイン＋微かな空気＋8〜16秒に1つの柔らかいベル）／europa=高音の硝子質ベル（倍音3.5）＋高域ノイズ、冷たく短いディレイ／io=低域サブパルス（間引き8拍）＋10〜24秒毎の低域ランブル／mars=帯域ノイズの風（ゆっくりした突風）＋低い鋸歯ドローン／titan=厚いローパス鋸歯ドローン＋ごく稀な低い三角波／venus=重低音＋ウェーブシェイパ歪み、0.06Hzのうねりで歪み量が増減。切替は2秒クロスフェード。未知ID・`__proto__`等はmoonへフォールバック。
- **SFX**: landing=C-E-Gの上昇3音チャイム／crash=サイン低音(110→32Hz)＋ノイズバースト／module=三角波5音の速いアルペジオ／launch=ローパスノイズ120→2500Hz＋サブ上昇、約3秒／uiTap=1.8kHz 35msクリック。`engine.audio.enabled===false`ならSFXは無音。
- **ボイス上限**: 一過性は音楽14＋SFX10＝最大24。持続ノードはシーン毎に約10〜14（クロスフェード中は2シーン分）。終了ノードはtick内のsweepでstop/disconnect。
- **検証**: `node 04_tests/p2m.mjs` 47/47（偽AudioContext、120秒×7シーン、SFX連打、クロスフェード破棄、mute/unmute、ctx差し替え）、`node --check`、`node build.js`、smoke 2/2。**実際の音は未試聴**（音量バランス・音色の良否は実機/ブラウザで要確認）。フック（タイトル/ゲーム側の呼び出し・ミュートUI・永続化）はリーダー側。

## 2026-10-25 P3fix — 第三者検証指摘の修正（Sonnet 5.5）
- **D1**: engine.js — 押下時刻 t0 を記録し、400ms 超の押下の解除、およびマウスの長押しは 'tap' にしない（スワイプは従来どおり）。tap データに t0 を載せ、Game は結果画面（landing/cleared/crashed/bonusfailed/module/gameover）に入る前から押していた指のタップを無視（`_overlayAt`）。キーの `e.repeat`: Escape/Backspace は破棄、Space/Enter は `confirm {repeat:true}` で届け、結果画面とタイトルは無視（プレイ中の推力パルスは維持）。矢印キーのリピートは従来どおり（プレイが依存）。
- **D2**: storage.js 4メソッドを try/catch（getHigh=0/NaN→0、get=既定値、set/setHigh=false）。game.js の遷移順は変更不要（storage が投げなくなったため setOverlayState に必ず到達）。
- **D3**: ranking-worker.js を月別ログ `LOG_DIR/YYYY-MM[-n].jsonl`（約900KBで繰り上げ）＋`TOP_FILE`（上位100）へ再設計。GET は top.json のみ。sha は object 形式、内容は raw 形式。409/422 再試行は両書き込みに維持。名前は bidi/書式制御除去＋書記素12文字（Intl.Segmenter、無ければコードポイント）、結合文字の暴走対策でコードポイント総数32上限。環境変数 FILE→LOG_DIR/TOP_FILE、README 更新、ALLOWED_ORIGINS は本番 Pages のみ推奨。
- **軽微**: 非主ボタンの mousedown/mouseup 無視＋canvas の contextmenu で preventDefault と全ポインタ解除／キー入力は BUTTON/SELECT 上でも無視／名前入力オーバーレイ表示中は TitleScene が入力無視、TitleScene.exit と Game.enter/exit でオーバーレイ除去（export: nameOverlayOpen/hideNameOverlay）／net.js のタイムアウトを本文 json() まで含めて覆う。
- **検証**: `node build.js`＋`node --check`、smoke 2/2、p1 104、p15 387、p2a 30、p2m 47、p2b 99、p2j 54、新規 `04_tests/p3fix.mjs` 104/104。物理・見た目・音楽は未変更。実機（iOS タッチ長押し、実 GitHub API、実 DOM のフォーカス挙動）は未確認。

## 2026-10-25 P4 — MISSION HOLD / ABORT、保存と再開、パイロット・プロフィール、WORLD ADMIN（Sonnet 5.5）
- **HOLD/ABORT**: HUD に HOLD ボタン（ヘアライン円＋縦2本、`_holdRect` x184 y18 w38 h32。ミュート x140..178 と DEBUG タグ/ステージ行(y<=17)/操作無効帯(y<52)の内側、BACK・DBG と非重複をテストで検証）。`play` のみ表示/有効。押下→state 'hold'（前状態を保存）。update は即 return で物理・タイマー・風・障害物・燃料すべて凍結、描画は前状態で `_renderScene` ＋ `drawHoldPanel`（MISSION HOLD / STAGE・天体 / T+ mm:ss / RESUME / ABORT MISSION）。RESUME→前状態へ、0.5 秒（`HOLD_GRACE_S`）は操縦入力（ポインタ/キー）を無視。ABORT→同パネルで確認（ABORT MISSION? / YOUR SCORE WILL BE RECORDED / CANCEL / CONFIRM ABORT）。CONFIRM→`_gameOver(false, true)`＝残機に関係なく即終了、燃料ボーナスなし、ローカル1行＋WORLD送信は通常のゲームオーバーと同一経路（デバッグランは除外）、音は uiTap のみ。
- **キー**: タップ専用。Escape/Backspace は既に BACK（メニュー退出）で P 用のエンジン動作が無いため新規割当なし。HOLD 中は `blocksBack()`=true（BACK ボタン無効）にし、Escape(=back) を「RESUME / 確認の CANCEL」に割当。ミュートボタンは HOLD 中は無効（RESUME 後に操作）。
- **自動HOLD**: engine.js に `onHidden` フック（blur / pagehide / visibilitychange(hidden) で全ポインタ解除→`scene.onHidden()`）。Game は `play` の時だけ HOLD へ。自動再開なし。HOLD に入る前から押していた指の解除は tap にしない（`_overlayAt` と t0、結果画面と同じ規則）。パネル出現/切替直後 0.3 秒はボタン無視。
- **音**: `Music.duck(on)`（music.js）。音楽バスだけ 30% へ 80ms 時定数でランプ、SFX/ジングルは下げない。ctx 未生成なら状態だけ保存（ctx 生成時に反映）。Game は duck が無いスタブでも動く。exit/abort/resume で解除。
- **A 保存と再開**: ranking.js に `loadCheckpoint/saveCheckpoint/clearCheckpoint`（キー 'checkpoint'、v:1・runId・stage・totalScore・continues・modules・name・savedAt。検証付き読込、壊れていれば null）。保存は `_initStage` の末尾（=毎ステージ開始・Continue 後も。ボーナス中は「次の通常ステージ」を保存）と ABORT 確定時。デバッグ中/デバッグ操作ランは保存せず、本当のゲームオーバー（残機切れ/GIVE UP）で破棄（デバッグランでは破棄もしない）。ABORT は保持。タイトル: チェックポイントがあれば START の代わりに CONTINUE MISSION（ST.n · 天体名 · スコア）と NEW MISSION。CONTINUE は `engine.resumeCheckpoint` 経由で Game.enter が復元（main.js 無改変）。**発射シーケンスは再生する**（演出を残す。タップでスキップ可）。地形は新規。NEW MISSION で破棄。チェックポイント有りの間は他の場所のタップでは開始しない。
- **runId**: 各ランに runId（`newRunId`）。ローカル行に保存、`recordEntry`: 同 runId の行は高スコアの時だけ置換（1ラン=1行）。runId 無しの旧行は不変。
- **B**: タイトルのロゴ下に PUBLIC BETA（ヘアライン・dim、`betaBox` y114..130）。タップはロゴ連打カウントに算入。DEBUG ON トーストは y140 へ移動。
- **C' パイロット**: ranking.js に `loadProfiles/getActiveProfile/setActiveProfile/addProfile/removeProfile`（'profiles' 最大3 {name,key}、'activeProfile'、'lastName' を有効名と同期＝既存の getPlayerName 互換）。lastName からの移行（鍵は新規生成、読込時に自動）。名前は大小/全半角を区別（sanitizeName のみ）。タイトル: CHANGE→PILOTS（`changeBtn`）で一覧パネル（選択/DEL/ADD PILOT、3名で MAX 3 PILOTS 表示）。DEL→確認（'DELETE <NAME>? THIS ALSO REMOVES ITS WORLD RECORD'）→`deleteName(name,key)`: ok または error==='unknown' ならローカル削除、通信失敗等は 'OFFLINE — TRY AGAIN' で残す（'forbidden' は 'NOT ALLOWED — KEY MISMATCH' で残す）。リレー無効時はローカルのみ削除。ローカルのランキング行は消さない。追加: 名前入力オーバーレイ（空は 'ENTER A NAME'）、リレー有効かつ新規名なら checkName（CHECKING…表示、taken なら 'NAME ALREADY REGISTERED — CHOOSE ANOTHER' でオーバーレイ維持、{ok:false} は許可）。showNameOverlay を拡張（onSubmit が文字列/Promise を返せる、opts.label/password/max、メッセージ欄はボタンの下）。世界送信は有効プロフィールの name+key。サーバーが 403/409 を返したら結果画面に小さく 'WORLD: NAME OWNED BY ANOTHER DEVICE'（ローカルは不変）。プロフィールが無い時の START は ADD PILOT から。旧 `_submitName`（同期・空→PILOT）は互換のため残し、プロフィールも作成/選択する。
- **D WORLD ADMIN（?debug のみ）**: DBG パネルに WORLD ADMIN ボタン（`_dbgButtons()` の個数は 11 のまま、`_adminBtnRect` を別枠で描画）。管理キーは password の DOM 入力で1セッションに1度、メモリ変数のみ（localStorage/sessionStorage に書かない。テストで setItem が呼ばれないことを確認）。一覧（5件/ページ、PREV/NEXT/CLOSE、名前・BEST・ST.・FIRST）、行ごとの DEL→確認→adminDelete→再取得。エラーは UNAUTHORIZED(401/403で鍵を忘れる)/ADMIN DISABLED/OFFLINE を枠内に表示。
- **既存テストの変更（最小・理由付き）**: p3fix の名前入力確定テストのみ。新規名は WORLD 重複確認(非同期)を挟むため、同期経路を見るよう前に `lander.profiles/lastName` を消しリレーを一時オフにした。そのほか既存テストは無改変で通過（p2a のデバッグボタン数 11 を維持するため ADMIN を別枠にした）。オーバーレイの DOM 子の順序（input=1, button=2）も既存テストに合わせてメッセージ欄を末尾に置いた。
- **テスト**: 新規 `04_tests/p4hold.mjs` 72件（凍結・復帰・0.5秒無視・ABORT/CANCEL/CONFIRM・ランキング1行・WORLD 1回・デバッグ除外・自動HOLD(エンジンの blur/pagehide/visibility 経由も)・play 以外では不可・貫通/長押し解除・非重複・duck・全天体/ボーナスの描画・3000フレームfuzz）、`04_tests/p4save.mjs` 81件（チェックポイントの保存/破棄規則・再開復元・runId 更新と旧行不変・lastName 移行・追加(未使用/使用済み/オフライン/上限/空)・選択・削除(成功/オフライン/unknown)・送信が有効プロフィールの鍵を使う・403 注記・タイトルのボタン非重複と CONTINUE/NEW・ベータタグ・ADMIN の一覧/削除/不正鍵/オフライン/ページ送り/鍵非保存・fuzz 3000）。スイート: smoke 2/2、p1 104、p15 392、p2a 30、p2m 47、p2b 99、p2j 54、p4hold 72、p4save 81 すべて通過。`node build.js`＋`node --check` OK。
- **p3fix の失敗1件（本担当外）**: `D3: valid submit writes monthly log + top.json` が失敗（06_server/ranking-worker.js を並行担当が改修中で、鍵無しの submit が拒否されるため）。私の変更範囲の p3fix 項目はすべて通過。ワーカー側テストの更新が必要。
- **目視（Chrome ペイン 280px幅, ?debug / 通常）**: HUD の HOLD ボタン、MISSION HOLD、ABORT MISSION? 確認パネル、チェックポイント有りのタイトル（PUBLIC BETA / PILOTS / CONTINUE MISSION・NEW MISSION）、PILOTS パネルを確認。コンソールの既存の古いエラー（'Unexpected token export' 履歴, 404）以外に新規なし。
- **未確認**: 音（duck の聞こえ方、uiTap）は聴いていない。実機 iOS（blur/visibilitychange の発火、タップ感、名前入力 DOM の CHECKING…/エラー表示）。WORLD ADMIN と実サーバーとの通し（ここでは fetch スタブのみ。管理パネルの目視は未実施）。サーバーの submit が名前の所有者違いで返すステータスを 403/409 と仮定（net.js の `errOf` と実装側に合わせて要確認）。deleteName の 'unknown' は net.js の 404 対応に依存。

## 2026-10-25 P5 — HUD 改善（計器ラベル・天体情報・PILOT・初回ヒント）（Sonnet 5.5）
- **要望**: 「画面上部の矢印と数字の意味が分からない。ステージの重力等とパイロット名も表示して」。
- **計器行**: 枠を y64..90（h26）に拡大し、各セル上部に 7px の薄い字間ラベル（ivory 64%）を追加。文言 `DESCENT / DRIFT / TILT / SPIN`（↓縦速度・↔横速度・傾き角・回転速度）。数値は 12px、アイコン/数値の下げ（cy82）。安全限界値の併記は混むため見送り（色 ivory→amber→red は初回ヒントで説明）。
- **天体情報**: y94 左 x14、7px 'g 1.62 m/s²  ·  NO ATMOSPHERE'（真空は NONE→NO ATMOSPHERE、他は bodies.js の atmoTag）。幅 176 を超えたら省略。風のある天体は WIND ラベル＋矢印を x200 に移動（BACK/HOLD/ミュートの下で衝突しない。DBG は x316 以降）。BONUS 表示は従来どおり行Aのまま。
- **PILOT**: BEST の下（右端 x348、y40、7px）。`PILOT` は dim、名前は明るく 8px。最大幅 112 を超えると『…』で省略（`fitText`、サロゲート対応）。名前は `getActiveProfile(storage)`（ranking.js 既存）を runId 変更時のみ解決して `_pilotName` にキャッシュ。日本語は FONT に Hiragino/Yu Gothic/Noto Sans JP を追加。DEBUG タグ（x178）と重ならない（右端区間 x>=236）。
- **初回ヒント**: `hudTipSeen`（storage）が無い端末で `enter()` 後に state 'tip' を1回だけ表示（表示時にフラグ保存。ブロックされた storage でも例外なし。その場合は保存できないので毎回出る）。物理・時計・風・障害物・紹介バナーとも凍結、約 4 秒で自動、またはタップで解除。表示後 0.3 秒と出現前から押していた指の解除は無視。解除後は RESUME と同じ 0.5 秒の操縦無効（`_holdGrace`）で、タップが推力にならない。HOLD/ミュート位置のタップも解除のみ。パネルは y124（機体の初期位置 y90 の下）、キャレットは計器行を指す。文言 `DESCENT ↓  DRIFT ↔  TILT  SPIN / KEEP THEM WHITE TO LAND SAFELY / AMBER = CAUTION  RED = TOO FAST / TAP TO START`。
- **コード**: art.js（drawHUD、drawHudTip、textW/fitText/HUD_LAYOUT/HUD_LABELS/hudInfoText 新規 export）、game.js（HUD データ受け渡し、'tip' 状態、_maybeShowTip/_endTip）。コミットなし。
- **既存テストの最小変更**: 新規端末では tip が出るため、p1/p15/p2b/p4save/p4hold のストレージ初期値に `hudTipSeen` を入れ、p3fix の freshGame と p4hold のエンジン経由 2 箇所で tip を閉じる。ロジックは無改変。
- **テスト**: 新規 `04_tests/p5hud.mjs` 1271 件（文言、全 6 天体×ボーナス有無×デバッグ有無×6 種の名前（長い ASCII/日本語含む）×8 状態の描画で例外なし、文字グリフ単位で BACK/ミュート/HOLD/DBG と非重複・画面外なし、レイアウト非重複、tip の1回限り・凍結・自動/タップ解除・誤推力なし・ブロック storage）。既存 smoke 2, p1 104, p15 392, p2a 30, p2m 47, p2b 99, p2j 54, p3fix 104, p4hold 72, p4save 81, p4net 132 すべて通過。bundle 再生成・`node --check` OK。
- **目視（Chrome ペイン 360x640, ?debug）**: MOON（初回ヒント表示中）、MARS（風矢印）、IO（日本語長名の省略）、VENUS（明るい空でのラベル可読性→alpha 0.46→0.64 に調整）を確認。コンソールは既存の古いエラーのみ。
- **未確認**: 実機 iOS の字面幅（canvas フォント）、開始直後（y90）の機体が左の情報行に一瞬重なる点（機体は落下で離れる）。

## 2026-10-25 P6 — ボーナスミッション再設計（PLAN §7f）（Sonnet 5.5）
- **TERRA**（bodies.js: `TERRA`、6天体のツアーには含めない）: 実重力 9.81（HUD 'g 9.81 m/s²'）、ゲーム内重力は√圧縮 0.25*√(9.81/1.62)=0.6151（周回で +15%）。昼の青空（上部HUD可読性のため上端を沈める）＋太陽光＋ゆっくり流れる雲5つ＋遠い海の水平線＋緑の層状の丘（art.js `paintDaySky/drawClouds`、terra 用の地形テクスチャ）。音楽: music.js に `terra`（C長調add9のやわらかいパッド＋風＋稀なハーモニックのベル）。成功ジングルは従来どおり。
- **選択**: s%3===0 のクリア後に state 'bonusselect'（3カード＋小さな SKIP BONUS）。★ CALM APPROACH ×1.0（重力のみ・固定パッド）／★★ ROVER DOCK（移動パッド）と CROSSWIND（風＋抗力）を機会ごとに交互 ×1.5／★★★ STORM LANDING（移動パッド＋風＋抗力＋小パッド）×2.5、成功で +1 continue（上限3）。タップ規則は既存どおり（入力ロック0.5s、押しっぱなし解除・キーリピート無視、blocksBack）。キー: ←=1枚目 ↑=2枚目 →=3枚目。背景は TERRA の昼空と丘のプレビュー。SKIP → モジュール選択 → s+1（得点なし）。失敗（クラッシュ）は continue を消費せず 'bonusfailed' → モジュール選択 → s+1。SKIP も機会を消費する（次の★★は交互）。
- **得点**: `round((600 + 残燃料*10) * 倍率)`（`bonusScoreFor`）。ボーナスに通常ステージ得点・ガイドボーナスは付かない。FUEL_RUN と旧 PRECISION/MOVING_PAD のローテーションは廃止（メカニクスは ROVER/STORM に継承）。
- **調整値（`BONUS_MISSIONS`、bodies.js）**: CALM pad 48 固定／ROVER pad 44・台地6区間(120px)・周期8s／CROSSWIND pad 44・風 base0.06 gust0.16・抗力 0.10（縦 0.02）／STORM pad 32・台地6区間・周期8s・風 base0.05 gust0.12・抗力 0.08（縦 0.02）。当初案のまま変更なし（パラメータでなく自動操縦側の対応で 80% 超えを達成）。台地は旧 8区間160px から6区間120px、移動パッドの初期位置を余弦位相に合わせ左端へ（旧: 中央から初フレームで跳ぶ）。
- **自動操縦（autopilot.js）**: 移動パッド用に拡張。近い方の台地の「端」の上で待ち、パッドが端で折り返す（速度≈0）時刻に接地するよう降下速度で時刻合わせ（`_apEnd/_apTE`）。横位置が合うまで降りない。静的パッドの挙動は不変。
- **着陸可能性（障害物なし、50シード、loop0/loop1）**: CALM 50/50 ・ 50/50、ROVER 49 ・ 49、CROSSWIND 50 ・ 50、STORM 48 ・ 49（200シードでは CALM/CROSSWIND 200、ROVER 196/193、STORM 196/193 ＝ 96〜100%）。
- **ボーナスの障害物**: 無し（`obstacles=[]`）。仕様「CALM＝重力のみ」に合わせた判断。旧実装は通常ステージsの障害物を残していた。要望があれば戻せる。
- **その他の仕様**: 祝福の格＝★-1（上限2、周回加算なし）。ジングル tier も同値。HUD は行Aに 'BONUS · STAGE n'＋'TERRA'、情報行に 'g 9.81 m/s² · <ミッション名>'（風ありは WIND 矢印）。HOLD/ABORT はボーナス中も動作。**チェックポイント**: ボーナスの中・選択画面では「次の通常ステージ s+1」を保存（ボーナス開始時）。選択画面で終了した場合は stage s の開始が保存済みなので **ステージ s からの再開**になる（ボーナスの途中・選択画面には復帰しない）。デバッグ 'BONUS ▶' は選択画面を開く（デバッグランは従来どおり除外・チェックポイント非保存）。
- **既存テストの変更（意図した挙動変更のみ）**: p1（§2 ボーナス型名と台地幅120、§5 フローを選択画面経由に、§6 MOVING_PAD→ROVER・パッド往復幅>60、fuzz の型名）／p15（ボーナス型名、FUEL_RUN 項を「ボーナスは満タンで開始」に、§7 得点を STORM ×2.5 に、デバッグ BONUS を選択画面の確認に、fuzz の天体 6 種判定は TERRA が加わるため BODIES 基準に）／p2a（型名リスト）／p2b（ボーナス開始は選択→カード選択後に stopJingle+playBody）／p2m（terra を ID 一覧に追加）／p4hold・p4save（型名）／p5hud（ボーナス型を STORM に＝風ラベルとの非重複検査を維持）。ロジックは無改変。
- **テスト**: 新規 `04_tests/p6bonus.mjs` 383件（選択は3/6/9/12のみ・3枚の倍率・★★交互・入力規則・SKIP→module→s+1・得点なし・各ミッションの物理フラグ/パッド幅/重力/障害物なし/祝福の格・HUD文言・得点式（燃料 0/12.3/55/100）・STORM +1 continue と上限・失敗で continue 不変・HOLD/ABORT・チェックポイント・デバッグ BONUS・リレー上限 stage*8000（60ステージ最良ケース＋全ステージ STORM 満タンでも半分未満）・自動操縦着陸可能性・全ミッション×全状態×loop 描画・3000フレーム fuzz）。全体: smoke 2, p1 107, p15 392, p2a 30, p2m 49, p2b 100, p2j 54, p3fix 104, p4hold 72, p4save 81, p4net 132, p5hud 1307, p6bonus 383 すべて通過。`node build.js`＋`node --check` OK。
- **目視（Chrome ペイン ?debug → DBG → BONUS ▶）**: 選択画面（TERRA の昼空・丘が透ける）、CALM APPROACH / CROSSWIND / ROVER DOCK / STORM LANDING のプレイ画面（バナー・星・HUD・雲・太陽・海・丘）を確認。コンソールに新規エラーなし（既存の 'Unexpected token export'/404 履歴のみ）。
- **未確認**: terra 音楽・ジングルは聴いていない（音量・音色は要試聴）。実機 iOS 未確認。人間の操作での難易度（自動操縦は折り返し待ちの戦略で 96〜100% だが、人間にとって ROVER/STORM のタイミングが適切かは体感確認が必要）。プレイ画面右上の 'BEST' など dim 色の文字は昼空では薄め（上端を沈めて改善済みだが最も淡い）。
