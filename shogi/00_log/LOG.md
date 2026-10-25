# CYBER_SHOGI 作業ログ(申し送り)

新しい順。各エントリ: 実施内容 / 判断と理由 / 問題点 / 次アクション。

## 2026-10-25 LANDER式再編+テスト恒久化+ランキング準備(Fable リーダー、直接実装)
- **実施**: 単一HTML(05_legacy/cyber-shogi-prototype-v3.html)を分割。
  `02_src/engine.js`(ルール・探索。DOM非依存、`globalThis.Engine`、盤外状態は `setCtx({down,pending,faction,orbit})` で注入=nodeテスト可能)
  / `02_src/sfx.js` / `02_src/ui.js` / `02_src/main.js`。`build.js` が結合して `shogi.bundle.js` を生成し、
  index.html の参照に内容ハッシュ `?v=` を刻む(LANDERのキャッシュ対策方式)。CSSは `03_assets/style.css`。
  **回帰テスト `04_tests/engine.test.mjs` 23件**(回線/中継/タップ/防護/★5種/陣営4種固有ルール/打ち制限/
  ダウンマス/シード決定論/詰み/negamax)を恒久化。`node 04_tests/engine.test.mjs` で実行。
- **ランキング準備**: 終局時に RunRecord(シード・経路・スコア・ランク・総手数・強化・全棋譜)を
  localStorage へ保存(`cs.runs` 直近20件 / `cs.best` / `cs.daily.<seed>`)。リザルトに自己ベスト・本日ベスト表示。
  決定論ゲームなので棋譜+シード=将来のWORLDランキングのサーバ側リプレイ検証の弾。
  WORLD中継はLANDERのranking-worker互換API(GET /ranking・GET /name・POST /score)を想定、名前登録UIはv4b。
- **判断**: タイトルは **CYBER_SHOGI** で確定(ユーザー決定)。音楽方向は「スパイ・ファンク×インターロック」
  案(5/4クラビリフ+7/8 Karplus-Strongオスティナートのポリメーター、Eドリアン+♭5、Rockit系エレクトロ)を提示中。
- **発見**: negamaxテストで「遠くの浮き駒を取ると自駒が回線から切れて減価(-240)が駒得(+165)を上回り、
  取らないのが最善」となる局面を確認。回線ルールが探索に正しく効いている証拠(テスト内コメント参照)。
- **検証**: 23/23テスト通過。ブラウザでDAILY 3連戦自動対戦(state→hacker→corp、ブラックアウト・記録保存・
  ベスト表示・棋譜蓄積83行)、コンソールエラー0。
- **次アクション**: v4a = ①07_labに音楽試聴ページ(A: 5/4スパイ・クラビ / B: 7/8インターロック / C: エレクトロ寄り)
  → ユーザー選定 ②タイトル画面(TAP TO CONNECT起動1枚→音声アンロック、ネットワーク背景、本日の経路カード)
  ③駒のSVGアイコン化・陣営カラー ④HOW TO PLAYカード5枚+初回コンテキストヒント。

## 〜2026-10-25 v1→v3(経緯の要約。詳細は 01_docs/DESIGN.md)
- v1: 5五将棋準拠+ローグライク3連戦+強化ドラフト(fa19802)
- v2: 回線ルール・ネットワーク機能(SAT中継/HCKタップ/F/W防護)・予告ブラックアウト(1449310)
- v3: 敵ファクション4種・捕獲昇格★・シード分離(954564d)
- 検証方式: エンジンは機械的テスト優先(CLAUDE.md)。v1/v2はOpus第三者レビュー実施、いずれもCRITICAL 0。
