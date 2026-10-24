# LANDER 作業ログ（申し送り）

新しい順。各エントリ: 実施内容 / 判断と理由 / 問題点 / 次アクション。

## 2026-10-25 P0 — スタンドアロン化（Opus 5.5 リーダー）
- **実施**: `lander/` を番号付きフォルダで新設（00_log/01_docs/02_src/03_assets/04_tests/05_legacy）。MICRO ARCADE版 `MiniRogueGame/js/games/lander.js` を無改変で `05_legacy/lander_microarcade_v1.js` に保存し、`02_src/game.js` へ移植（import先のみ変更）。core（engine/audio/storage/palette）は meteor/ から fork、保存キー接頭辞は `lander.`。`build.js`（→ `02_src/lander.bundle.js`）、`server.js`（:4176）、`.claude/launch.json` に "lander" 追加。
- **検証**: `node 04_tests/smoke.mjs` 2/2、ブラウザで起動・コンソールエラーなし。
- **判明した問題（コード根拠）**: B1 ポインタ解除漏れ（canvas外のmouseup・touchcancel未処理）で噴射が固着＝「浮遊して動かない」の主因。B1' パッド上での低速バウンス無限ループ。B2 パッドY(545-595)がボタン帯(560-640)と重なる。D1 難易度は重力・パッド幅も上がるがステージ8で頭打ち。詳細は `01_docs/PLAN.md` §2。
- **判断**: MICRO ARCADE版は触らない（保持要件）。ランキングは静的配信の制約でローカル保存（PLAN §3）。オプションと難易度軸は提案に留めユーザー判断待ち（PLAN §6）。
- **次**: P1（Sonnet）ゲームプレイ修正・機能 → P2（Sonnet）ビジュアル/音 → P3（Opus）第三者検証。push は指示待ち。
