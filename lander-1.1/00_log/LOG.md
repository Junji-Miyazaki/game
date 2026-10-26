# LANDER BETA v1.1 — 作業ログ

新しい順。各エントリ: 実施内容 / 判断と理由 / 問題点 / 次アクション。
v1.0 以前の経緯は `../lander/00_log/LOG.md`、計画と決定は `01_docs/PLAN.md`（§7h〜§7j）。

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
