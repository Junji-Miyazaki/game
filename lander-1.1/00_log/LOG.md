# LANDER BETA v1.1 — 作業ログ

新しい順。各エントリ: 実施内容 / 判断と理由 / 問題点 / 次アクション。
v1.0 以前の経緯は `../lander/00_log/LOG.md`、計画と決定は `01_docs/PLAN.md`（§7h〜§7j）。

## 2026-10-26 プレイヤーの反応（ユーザー伝聞）
- 本番 v1.1 ボード：uematsu2 18,588（ステージ8、称号「uematsu」）、Tom2 4,791、みや 2,270。版別ボード・称号設定が本番で動作。
- Tom2「よくなった」。uematsu「アイテム（特典の輪）の使い方も慣れてきた」。
- 課題：マップは開始地点が2つ以上のときだけ開く（ステージ1のみの人は見られない）。タイトルに MAP ボタン（閲覧のみ可）を提案中・ユーザー返答待ち。

## 2026-10-26 L3 太陽系マップ公開（リーダー確認）
- 起動画面（UPDATE INFORMATION 枠・モノトーン BETA・太陽系背景B）はユーザー了承済み。
- 太陽系マップ（D案）を CHOOSE START の代わりに統合。リーダー修正：★合計は1周目のみで数える（分母を 7天体×2×3=42 に固定。周回の記録で分母が動くと目標が分かりにくいため）。375x812 で俯瞰（★14/42）と木星系拡大（ステージ別★・最高グレード）を目視確認。全23テスト通過。
- 未確認：実機のタッチ・フレームレート、ファンファーレ実音、周回の既定（最新周回）が不便かどうか。

## 2026-10-26 L3 太陽系マップ（CHOOSE START の置き換え）
- 実施（`lander-1.1/` のみ。`../lander/` は不変）:
  - 新規 `02_src/solarmap.js`（`SolarMap` クラス。トップレベル名は `SM_` 接頭辞、build.js の FILES に追加）。07_lab/solar_map の D 案（B の計器表示 + C のキャラの動きを弱めたもの）を移植。A/B/C の分岐は削除。
  - title.js: `pick`（CHOOSE START）を `map`（SolarMap）に置換。`_startOrChoose`（NEW MISSION/START で2つ以上開始地点があるとき）が `new SolarMap({list: _startOptions(), summary: starsSummary(...)})` を開く。選べるステージの源は `_startOptions()` のまま。確定は従来どおり `_startAt(stage)`（チェックポイント破棄・startStage・_begin）。BACK/閉じるはタイトルへ戻るだけ（チェックポイントは触らない）。マップ表示中は入力を独占・`blocksBack()` 真・title の描画は飛ばす。旧 `_pickRects/_pickInput` は削除。art.js の `drawStartPanel` は未使用になった（残置）。
  - 画面: 俯瞰（太陽・6軌道・惑星・衛星・TERRA の◇印・★ n / m・BACK）→ 惑星/チップをタップで船が点線の弧で飛び、約0.5秒で拡大 → 天体ごとのカード（ステージのピップ S1/S2: ★3つ＋グレード、ロック、現在の周回、右に最高グレード）。v1.2 天体（PHOBOS/RYUGU/67P/ENCELADUS/TRITON/PLUTO）は俯瞰の下段にシルエットで、火星とエンケラドゥスは拡大画面にもカード（選択不可、タップでトーストのみ）。TERRA はボーナス専用の印とカード（開始地点ではない）。
  - 開始の確定: ピップをタップ＝選択（船がその天体へ飛び、下に START バーが出る）→ START バーをタップ（52px 高）で開始。キーは ←→ でステージ、↑↓ で周回、Enter 1回目=選択・2回目=開始、Esc/Backspace=戻る。理由: 小さな的を1タップで開始すると、スクロールや誤タップで走り出す。選択→確定の2段なら誤開始が構造的に起きない（ファジングで確認）。
  - 完了表示: 天体ごとの細いリング＝その天体の1周目の全ステージに着陸、金のリング＝1周目の全ステージが★3つ。旗＝いずれかの周回で1回でも着陸。惑星系（ジュピターなど複数天体）は構成天体すべてが満たしたとき。未解放の天体・惑星系は暗く、ロック表示。
  - 周回: ステージは周回を重ねて続くため、カードに ‹ ORBIT n › を出し（解放済みが2周目以上のときだけ）、既定は解放済みの最新の周回。切り替えで選択は解除。
  - 軽量化: グラデーションは ctx ごとに1回（原点・単位半径で作り translate+scale で使い回し）。目盛りは1パス。水星の表面グラデーションは三角形の塗りで近似。定常状態で毎フレームのグラデーション生成は 0（テスト）。
  - マスコット: 宇宙飛行士が船の上で手を振る・小さく跳ねる、タップで jump/spin/wave。イントロ約1.6秒は1タップでスキップ（そのタップは他に使わない）。惑星間の飛行も1タップでスキップ（消費）。拡大画面内の船の移動中のタップは、船をその場で着陸させてそのタップも処理する（選択→START を素早く押しても失敗しない）。`prefers-reduced-motion` ではイントロなし・拡大0.22秒。
  - WHAT'S NEW（beta.2）に「太陽系マップから出発地点を選べる」を追加。
- テスト: 新規 `04_tests/p15map.mjs`（122: 開く場所・選べるステージ=_startOptions（12通りの maxStage）・開始パラメータが旧パス（`_startAt`）と一致（ステージ1〜29）・ロックの無反応・BACK/Esc/イントロ/飛行/拡大中の入力・★/リング/旗/カウンタ・COMING SOON/TERRA は選べない・周回・キー・ファジング（誤開始 0）・描画とグラデーション数・reduce motion・タップ領域 ≥44px・デバッグ）。
- 既存テストの変更: p8start（タイトルのオーバーレイ部を地図の操作に書き換え。解放リスト・進捗・ラン開始の部分は不変。87）、p13rings（CHOOSE START の★表示 → 地図のピップのデータ、WHAT'S NEW の項目数 4〜5 → 4〜6 と新項目の確認。247）。他は変更なし。全 23 本（smoke p1 p15 p2a p2m p2b p2j p3fix p4hold p4save p4net p5hud p6bonus p7title p8start p9net p9champ p10touch p11net p12v11 p13rings p14boot p15map）通過。`node build.js`・`node --check` 通過。
- 目視（preview lander-1.1, 375x812, 進捗を仕込んだ lander11.* で）: 俯瞰、木星の拡大、周回切り替え（ORBIT 1 の★）、地球（BONUS 印・TERRA カード）、ステージ選択→START バー→発射画面、checkpoint に stage 16 / startStage 16 を確認。確認後に lander11.* を削除。
- 判断:
  - 星の合計 `★ n / m` の m は starsSummary の maxStars（1周目14ステージ=42 + 記録のある2周目以降のステージ分）。2周目に記録が付くと分母が増える。
  - ピップのラベルは周回内の S1/S2、START バーに `ST.n`。周回の既定が最新なので、1周目の★は ‹ で戻って見る。
  - 俯瞰のマウスホバー演出は削除（エンジンはホバーを渡さない）。キー操作時だけ焦点の枠を出す。
- 未確認: 実機タッチ、60fps（このプレビューの rAF は約1.5fps でアニメーションが遅く、速度は未測定）、日本語・他フォントでの崩れ（文字は等幅フォント固定）、Safari の letterSpacing 非対応版（字間が無視される）、音（既存のタップ音のみ）。
- 次アクション: 実機で操作感（2段確認が煩わしくないか、周回の既定）を確認 → 必要なら既定の周回・START の出し方を調整。

## 2026-10-26 v1.0 の WORLD CHAMPION プレートと HALL OF FAME を v1.1 へ移植
- 実施（`lander-1.1/` のみ。v1.0 の dc7f9b6 を手で移植）:
  - 流れ: Boot（WHAT'S NEW、タップで音声解除）→［引き継ぎ選択］→ HALL OF FAME（起動ごとに1回・約4秒で自動・タップは消費してタイトルへ・データ無しなら飛ばす）→ Title。main.js の toHall。
  - タイトル: 「PUBLIC BETA」の位置のラベルは `BETA v1.1`（6pt・76x12・y110）。WORLD CHAMPION プレート（250x40・王冠・光の走り・YOU タグ）を y124 に。タップで WORLD タブの一覧（ゲームは始めない）。SET TITLE は現チャンピオン本人のみ、プレート直下（当たり判定 h32）。art.js の drawWorldBanner/drawWorldTop5。
  - ファンファーレ: music.js に playFanfare/stopFanfare（ミュート・音声無効・ctx 無しは何もしない。タイトル曲とは別系統。ホールを出る時に止める。タイトル曲はタイトルでのみ開始）。
  - データ: v1.1 ボードの取得結果だけ。キャッシュ（`lander11.worldTop1`・`worldTop5`）に `board:'v1.1'` の印を付け、印の無い値は読み込まない。中継が未対応/不明の間は取得しないので、v1.1 のキャッシュがあればそれだけ表示。タイトルの取得・WORLD タブの取得でもホール用の上位100件を更新。
- 判断:
  - 引き継ぎで v1.0 の `worldTop1` はコピーしない（IMPORT_KEYS から除外）。既に引き継いだ端末にある印なしの値も上の印チェックで無視される。→ v1.0 のチャンピオンが v1.1 に出ることは無い。
  - 旧版は「未対応(updating)ならバナーを消す」だったが、v1.1 のキャッシュは v1.1 のデータなので消さずに残す（仕様）。
  - 光の走り・呼吸の縁は v1.0 と同じ描画。
- テスト: p9champ に v1.0 の追加分（プレート位置・YOU・SET TITLE 当たり判定・ホール・キャッシュ・ファンファーレ）と、v1.0 の #1 を出さないことの新規ブロック 7d を追加。p12v11 は worldTop1 非コピーに更新。全21本通過（p9champ 194、p12v11 119、他は件数不変）。
- 画面確認: preview 4177 を 375x812 でキャッシュを仕込んで確認（ホール・タイトルのプレート・YOU/SET TITLE・タップで WORLD タブ）。後始末済み。
- 未確認: 実機の Worker 対応後の取得（ローカルは Origin 外で OFFLINE）、ファンファーレの実音、引き継ぎ選択からホールへの実画面遷移（コードとテストのみ）。


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

## 2026-10-26 起動画面の改訂（UPDATE INFORMATION・枠・スクロール・背景B）
- 実施:
  - 版ラベルをモノクロ化: 起動画面の `BETA v1.1` は p.fg の低アルファ（旧 p.mid=ティール）、タイトルの `drawBetaTag`（art.js）も文字を p.fg 低アルファに。色付きのピルなし。
  - 見出しを `UPDATE INFORMATION`（7px・字間5・モノクロ）に。`NEW` ピル（琥珀）は `txtW`（art.js、実測幅）で見出しの右 +10px に置く＝フォントが変わっても重ならない。表示は seenVersion ≠ 先頭 entry の version の間だけ。起動画面タップで seenVersion を保存→次回起動で消える。
  - `02_src/whatsnew.js`: `WHATSNEW_ENTRIES`（新しい順の `{version,date,items}`）。`WHATSNEW = {version: entries[0].version, entries}`。`APP_VERSION`（1.1.0-beta.2）が先頭 version（単一の定義元）。各 entry は `2026.10.26 · build <version>` の日付行＋「・」付き項目（11px・行高18・ぶら下げインデント）。
  - 枠: 角丸1px・低アルファ・暗い半透明塗り（x20,y452,w320,h136）。見出しは枠の上(y436)、build 文字は枠の下(y~596)。内容は枠でクリップ、範囲外の行は描かない。さらに内容がある側の端は文字をフェード、細いスクロールバー（2px）。
  - スクロール: 縦ドラッグ（タッチ/マウス）・マウスホイール・↑↓キー(36px)。エンジン `core/engine.js` に最小の追加: シーンが `dragZone(pt)`+`onDrag` を持つときだけ、その領域で始まった指の 6px 超の移動を `onDrag({dy})` に渡し、その指の解除はタップ/スワイプにしない。`wheel` は `onWheel` を持つシーンの dragZone 内だけ渡し preventDefault。他シーンは影響なし（全テスト通過）。短い無移動のタップは枠内でも BEGIN（音の解除も兼ねる）。Enter/Space も BEGIN。
  - 背景: 07_lab/boot_backdrop の案 B を `02_src/bootfx.js`（`BootFx`、build.js の FILES に追加）へ移植。3層の視差星・流れ星・明るさ30%の太陽グロー・細い軌道・公転する惑星・ロゴの呼吸グロー(周期4s)。太陽グラデーションは ctx ごとに1回だけ生成。lab 側は変更なし。
  - テスト: p10touch(260)/p12v11(119)/p13rings(246) を新構造に更新。新規 `04_tests/p14boot.mjs`（42: NEW ピル出る/タップ後は消える・ピルが実測幅の右・360x640 の枠配置・ホイール/ドラッグ/キーのクランプ・枠内ドラッグで BEGIN しない・枠内/枠外タップで BEGIN・6px 以内はタップ・他シーンの swipe 不変・版ラベルのモノクロ）。
- 判断: ドラッグ判定は engine 側（6px, CSS px）で行い、BootScene の dragZone を枠に限定。枠外のスワイプは何もしない（BEGIN もしない）。ピルは見出しの実測幅で配置し、極端に広いフォントでは画面外に出うる（7px 文字が 1 字 8px まで確認）。
- 目視（preview lander-1.1, 375x812）: 初回（NEW あり・見出しと非重複）、ドラッグでスクロール（上下フェード・バー・BEGIN せず）、枠内タップで開始→seenVersion=1.1.0-beta.2 保存、再読込で NEW なし、タイトルの BETA タグがモノクロ、を確認。
- 未確認: 実機タッチ（慣性なし・mouse/emulated のみ）、実機の 60fps、ホイールは engine のテストのみ（ブラウザ操作ツールのスクロールでは未確認）、日本語フォントのフォールバック別の見え方。
