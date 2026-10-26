# LANDER BETA v1.1 — 作業ログ

新しい順。各エントリ: 実施内容 / 判断と理由 / 問題点 / 次アクション。
v1.0 以前の経緯は `../lander/00_log/LOG.md`、計画と決定は `01_docs/PLAN.md`（§7h〜§7j）。

## 2026-10-26 L2: 輪・特典の輪・★3・水星（1.1.0-beta.2）
- 実施:
  - 輪（`02_src/rings.js` 新規）: 通常ステージのみ4〜6個。誘導線（出現位置→パッドの放物線）に沿って経路長で等間隔に置き、地形の最高点(440)より輪の下端が24px以上上（中心Y<=392）、輪どうし48px以上、障害物の縁から10px以上（縦。障害物は横にしか動かない）を優先して±20px ずらす。通過は機体中心が半径17px以内（フレーム間は線分で判定＝高速でもすり抜けない）。得点は 50×コンボ（直前に取った輪の次なら+1、飛ばすと1に戻る）。チャイム `Music.sfx.ring(combo)`（全音で最大10段上昇、ミュート時は無音）、粒子の破裂、「+50 ×N」の浮き文字、HUD に `◯ 3/5  +150`（行E）。得点は着陸時に加算（クリア内訳に RINGS 行）。墜落→Continue では加算されず、輪は新しく作り直す（稼ぎ防止）。ボーナス（TERRA）は輪なし。
  - 特典の輪（金色の二重輪＋ピクトグラム）: ステージ2以降、確率35%で試み、実際に置けるのは約23%。通常の輪の間から脇へ36〜58px。種類は出現時に決まる（見える）。SLOW-MO（隕石50%速度・8秒）/ RADAR（そのステージ中。RADARモジュール所持なら候補から除外）/ ATTITUDE ASSIST（6秒、燃料を使わず水平へ戻す）/ FUEL +15%（上限まで）。バナー（ピクトグラム＋名前＋説明、2.4秒）、HUD に有効な特典と残り秒。自動操縦なし。
  - ★3（`02_src/stars.js` 新規）: `stageBest[パイロット][ステージ] = {grade, stars}`（stars はビット: 1=着陸 2=全輪 4=PERFECT。OR で累積、グレードは良い方を保持）。通常ステージのみ・デバッグ操作のランは記録も表示もしない。L1 形式（gradeだけ）の保存値はそのまま読めて更新時に stars が付く。クリア画面は★3つ（LANDED / RINGS / PERFECT のラベル付き）。集計後（グレードのスタンプの後）に、今回新しく取った★だけが順に押される。既に取った★は最初から塗り。CHOOSE START は各ステージ行に★3つと最高グレード。L3 用に `starsSummary(storage, name)` を公開: `{totalStars, maxStars, bodies:[{id,name,stars,max,grade,stages:[{stage,loop,part,mask,stars,grade}]}]}`（天体は BODIES の順＝水星が最後。1周目の2ステージは未記録でも含む）。
  - 水星（bodies.js）: 7番目（金星の後）、realG 3.70、大気なし・風なし・抗力なし、`visibility` 130（ライトの半径）、`heat` {fuelDrain 0.3/s, mainFuelMul 1.0}（金星は 0.8 と 1.3）、celebTier 2、障害物 rock。見た目: ほぼ黒の空・ほぼ黒の地面(#2d2b2e)・縁は暖色のリム・地平線に巨大な低い太陽（空に描くほか、暗闇の上にも `drawHorizonGlare` を重ねる）・鋭いクレーター。公平のため `guideAboveFog: true` で誘導線を暗闇の上に描く（ビーコンは元から上、輪も暗闇の上）。イントロ行は `MERCURY · g 3.70 m/s² · NONE · DARK CRATER`。BGM は専用シーン `mercury`（月より低く暗く、鐘はまばら）。周回は14ステージに（パッド幅・障害物・重力の式は不変）。HUD の天体名は7文字以上のとき少し詰めた（ミュートボタンに掛かるため）。
  - WHAT'S NEW（日本語5行、各24字以内）: 輪/特別な輪/★3つ/水星/平地接地。`APP_VERSION` = `1.1.0-beta.2`（ラベルは BETA v1.1 のまま、build 表記は `build 1.1.0-beta.2`）。
  - 自動操縦: 任意の経由点 `g._apWayX`（未設定なら従来どおりパッドへ）を追加。輪をたどる飛行のテスト用で、ゲームの AUTO LAND は変更なし。
- テスト: 新規 `04_tests/p13rings.mjs`（246）。全21本が通過: smoke 2 / p1 107 / p15 408 / p2a 30 / p2m 85 / p2b 100 / p2j 54 / p3fix 104 / p4hold 72 / p4save 81 / p4net 132 / p5hud 1511 / p6bonus 383 / p7title 14 / p8start 88 / p9net 80 / p9champ 148 / p10touch 258 / p11net 185 / p12v11 119 / p13rings 246。
  - 既存テストの変更: p15（天体順・周回=14ステージ・実重力表・パッド幅/障害物の式の参照ステージ・障害物スタイル・空の物体・全天体の着陸可能性と AUTO LAND を7天体に・ファズが全7天体を巡るよう決定的に）、p6bonus（ツアーは7天体）、p8start（周回ラベル。25=ORBIT 2·VENUS、29=ORBIT 3·MOON）、p10touch（whatsnew.version を 1.1.0-beta.2 に、クリア画面のパネル高は輪行・★行で伸びる、描画スイープは8天体、ファズは推力を降下の減速に限り・平地上空からの穏やかな降下・600フレームごとの仕切り直しを加えて乱数の流れに依存しないようにした=旧版は seed 7777 でだけ偶然通っていた）、p12v11（版 1.1.0-beta.2 と build 表記）。
- 判断と理由:
  - 輪の位置は誘導線上: プレイヤーが既に見ている「通れる道」で、ON COURSE の得点とも一致する。輪を取るために誘導線から外れる必要がない。
  - 輪の得点はクリア時に加算（Continue での稼ぎ防止）。★2 は「その着陸の挑戦で全輪」。特典の輪は★2の条件に含めない。
  - 水星の「日照側の高温」は、位置による変化はつけず、そのステージ中ずっと一定の受動消費（0.3/s）にした（仕様が曖昧なため最小の解釈。位置で変えるなら heat に x 依存を足す）。
  - 輪・特典の位置は障害物を完全には避けられない（後半は障害物が7個で縦の帯がほぼ埋まる）。縁から10px以上離れる輪は全体の約85%。残りは障害物の動きを見て抜ける必要がある。
  - 特典の輪は寄り道なので、自動操縦（横8px/s）では約75%しか届かない（テストの下限は70%）。人の操縦ならより容易。
- 問題点／未確認:
  - 得点上限: 全ステージ「満タン・PERFECT・全輪最大コンボ」＋毎3ステージの STORM 満タンで84ステージ（水星を含む）進めても、各段階で total <= stage×8000（中継 `MAX_SCORE_PER_STAGE`）。1ステージの最大は約3.3千。
  - 実機（タッチ）での輪の取りやすさ・特典のバランス・水星の暗さと明るさ、SLOW-MO/ATTITUDE ASSIST の体感は未確認（360x640 のブラウザで、輪・特典バナー・HUD・クリア画面・CHOOSE START・水星の暗闇と誘導線を画面で確認）。音は Web Audio の実音を未確認（ミュート時の抑止と呼び出しのみテスト）。
  - タイタン/金星は元から着陸に時間がかかる/落ちやすく、輪をたどる自動操縦でも全輪は 約70〜90%（タイタンは打ち切り）。
  - L3（太陽系マップ）は未着手。`starsSummary` を使う想定。
- 次アクション: 実機で輪・特典・水星を試遊してバランス調整（輪の半径17、特典の確率、水星の視界130・消費0.3）→ L3 太陽系マップ。

## 2026-10-26 公開と中継の再デプロイ
- 実施: v1.1 を push（/game/lander-1.1/）。ユーザーが Worker を貼り替え＋Secret `PIN_PEPPER` を追加。リーダーが本番の応答を確認（/ranking?board=v1.1 → 空、/ranking → board v1.0＋既存記録、/name → hasPin、/pin/login 未登録名 → 404 = ペッパー有効）。ポータルに「LANDER BETA v1.1」を追加。
- 07_lab/solar_map: 太陽系マップ演出の試作 A/B/C を公開。ユーザーは B と C で迷い、B の画面＋C のキャラの動きの D 案を追加中。
- 次: 実機で PIN（設定・別端末ログイン）と世界送信を確認 → L2（輪・特典・★3）＋水星 → L3 太陽系マップ（採用案で）。

## 2026-10-26 v1.1 基盤: 版ラベル・保存分離・引き継ぎ・ボード v1.1・PIN UI
- 実施:
  - 版: `02_src/version.js`（APP_VERSION `1.1.0-beta` / APP_LABEL `BETA v1.1` / APP_BUILD_TEXT / STORAGE_PREFIX `lander11.` / LEGACY_PREFIX `lander.` / APP_BOARD `v1.1`）を単一の定義元に。タイトルのタグ（旧 PUBLIC BETA）と起動画面に `BETA v1.1`、WHAT'S NEW の下に `build 1.1.0-beta`。whatsnew の seenVersion も APP_VERSION。
  - 保存領域: core/storage.js の接頭辞を `lander11.` に。`02_src/migrate.js`（MigrateScene、`lander11.migration` = imported/fresh/none）。初回（`lander11.*` が無い）かつ v1.0 のパイロットがあれば TAP TO BEGIN の後に IMPORT v1.0 PILOTS / START FRESH。コピーするのは `profiles` `activeProfile` `lastName` `worldTop1` `muted` の5キーを値のまま。progress・checkpoint・ranking・stageBest・high・seenVersion・各種ヒント既読は不コピー。`lander.*` は読むだけ。
  - ボード: net.js の RELAY_BOARD 既定 = `v1.1`。`relayBoardState()`（supported/unsupported/unknown）を追加。WorldNet（ranking.js）が取得・送信・称号設定の前に確認し、未対応なら WORLD タブ/ゲームオーバー注記は `WORLD: UPDATING`、送信なし。確認不能（通信失敗）は従来どおり OFFLINE で送信しない。タイトルは未対応の間 WORLD #1 バナーを消す。
  - PIN: PILOTS の各行に PIN ボタン→メニュー（SET/CHANGE/REMOVE、注意書き付き）。名前入力で登録済み＋PINありなら `THIS IS MY NAME — ENTER PIN`→本物の `<form>`（username 欄は画面外・readonly、`type=password inputmode=numeric pattern=\d{4,6}`、login=current-password / set=new-password）。成功で新しい端末キー（makeNameKey）をそのパイロットのキーとして保存。エラー: bad-pin=WRONG PIN、locked=分表示、pin-disabled/旧中継=PIN NOT AVAILABLE YET、rate。PIN は入力欄と関数引数を通るだけで保存・ログしない。WORLD ADMIN の行に PIN RESET（確認付き、hasPin のある名前のみ有効）。
  - テスト: 新規 `04_tests/p12v11.mjs`（119）。既存の変更は下記。
- 既存テストの変更（接頭辞・ボード変更に伴う最小限）:
  - p3fix: `lander.high.lander`/`lander.profiles`/`lander.lastName` → `lander11.*`（2か所）。
  - p10touch: whatsnew.version の期待値 `2026.10.26` → `1.1.0-beta`。
  - p9net: setTitle のリクエスト期待 `board:'v1.0'` → `'v1.1'`。
  - p15: submit/ranking の期待 board を v1.1 に（2か所）、ゲーム経由の fetch モックに `board:'v1.1'` を追加（3か所）、送信前に /ranking 確認が入るため submit の待ちを `setTimeout 5ms` にして /submit だけ数える（2か所）。
  - p4hold・p4save: fetch モックが /ranking に `board:'v1.1'` を返すよう追加。
- 判断と理由:
  - 引き継ぐ「設定」は muted のみ（hudTipSeen・touchHintSeen は初回ヒントなので新版では出し直す）。worldTop1 は指示どおりコピーするが、v1.0 ボードの #1 なので v1.1 ではボード未対応の間は非表示、対応後は取得で上書き。
  - 取得できない(unknown)間は送信しない: 旧 Worker は board を無視して v1.0 に書き込むため。
  - PIN 設定フォームは確認入力なし（1欄）。打ち間違えても、この端末のキーで SET PIN をやり直せる。
  - 引き継ぎは v1.0 パイロットが無い初回起動でも `none` を記録し、後から v1.0 で作った名前は自動では尋ねない。
- 問題点／未確認:
  - 実機の Worker では未検証（ローカルのブラウザは Origin 許可外で /name が OFFLINE になり、PIN メニューは SET PIN のみ表示）。PIN の set/login/clear は fetch モックでのみ確認。
  - パスワードマネージャの保存・自動入力の実機挙動は未確認（form 構造と属性のみ確認）。
  - 実ブラウザの表示確認は 360x640 で 起動画面・引き継ぎ選択・タイトル・PILOTS・PIN メニュー・PIN フォームまで。名前入力の THIS IS MY NAME ボタン、PIN ロック表示、ADMIN の PIN RESET は画面で未確認（テストのみ）。
- 次アクション: 中継を v1.1 ボード対応版に更新後、実機で世界送信・PIN 一巡を確認。v1.1 のゲーム内容（L2 以降）に着手。

## 2026-10-26 v1.0 から切り出し
- 実施: `lander/`（L1 実装済み：どこでも接地・目印・着地グレード・WHAT'S NEW）を `lander-1.1/` へ複製。`lander/` はゲーム内容を公開中の v1.0 に戻した。開発サーバは port 4177（launch.json `lander-1.1`）。
- 判断: 中継 Worker は1つで両版を扱うため、正本は `../lander/06_server/` のみ。本フォルダの p3fix/p4net/p9net/p11net はそれを参照する。05_legacy・07_lab も v1.0 側のみ。
- 状態: 全19テスト通過（p10touch 254、p11net 185 含む）。
- 次: BETA v1.1 表示・`build 1.1.0-beta`・保存領域の分離と v1.0 パイロットの引き継ぎ選択・PIN UI・ボード v1.1（中継対応まで世界送信は停止）。
