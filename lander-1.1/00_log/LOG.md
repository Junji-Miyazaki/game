# LANDER BETA v1.1 — 作業ログ

新しい順。各エントリ: 実施内容 / 判断と理由 / 問題点 / 次アクション。
v1.0 以前の経緯は `../lander/00_log/LOG.md`、計画と決定は `01_docs/PLAN.md`（§7h〜§7j）。

## 2026-10-26 v1.0 から切り出し
- 実施: `lander/`（L1 実装済み：どこでも接地・目印・着地グレード・WHAT'S NEW）を `lander-1.1/` へ複製。`lander/` はゲーム内容を公開中の v1.0 に戻した。開発サーバは port 4177（launch.json `lander-1.1`）。
- 判断: 中継 Worker は1つで両版を扱うため、正本は `../lander/06_server/` のみ。本フォルダの p3fix/p4net/p9net/p11net はそれを参照する。05_legacy・07_lab も v1.0 側のみ。
- 状態: 全19テスト通過（p10touch 254、p11net 185 含む）。
- 次: BETA v1.1 表示・`build 1.1.0-beta`・保存領域の分離と v1.0 パイロットの引き継ぎ選択・PIN UI・ボード v1.1（中継対応まで世界送信は停止）。
