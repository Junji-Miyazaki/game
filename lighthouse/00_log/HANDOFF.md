# LIGHTHOUSE 引き継ぎ書（新セッションはここから読む）

更新: 2026-11-06（リーダー Opus 5.5）。経緯は `00_log/LOG.md`、設計は `01_docs/PLAN.md`。

## 1. 現状
| 対象 | 場所 | 公開 URL | 状態 |
|---|---|---|---|
| 試作 v9（公開ページ） | `index.html` ＋ `07_lab/proto_v9/proto.js` | https://junji-miyazaki.github.io/game/lighthouse/index.html | 縦向き 360×640。タイトル・結果・強化パネル・効果音・最高得点あり。ランキングなし |
| 試作 v8（旧） | `07_lab/proto_v8/` | — | 横向き 640×360。記録として残す |
| 設計 | `01_docs/PLAN.md` | — | §10 に未決事項 6 つ（縦持ちは決定） |

- 本編（P0 以降、LANDER 準拠の作り）は未着手。ユーザーの OK 待ち。
- 試作は1ファイルの素の JS（モジュール分けなし、乱数の種なし）。本編では PLAN §12 のとおり分ける。

## 2. 作業手順
- ローカル確認：`.claude/launch.json` の `lighthouse`（`node lighthouse/server.js`、:4178）。
- 自動プレイ：`node 07_lab/proto_v9/sim.js auto 4`（強化し続ける）／`none 4`（強化なし）。描画関数も数回呼んでエラーを見る。
- `proto.js` を変えたら、`index.html` の `?v=` を `shasum 07_lab/proto_v9/proto.js | cut -c1-10` に更新する（GitHub Pages のキャッシュ対策）。

## 3. 規則（ユーザー指示）
- 返答は日本語、短く、結論から。スクリーンショットはユーザーに送らない。
- 議論中は実装しない。案と試作を見せて OK を待つ。
- 同じリポジトリ（main）を他のセッションも使う。触るのは `lighthouse/` と、必要な時だけトップの `index.html` のリンク行。コミットは `git add lighthouse/ index.html` のように明示する。ブランチは切り替えない。
- コミットメッセージは「何を・なぜ」を1行、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **push は都度ユーザーに確認**（2026-11-06 の試作公開は指示あり）。`token.txt` は絶対にコミット・表示しない。push の方法は `../lander-1.1/00_log/HANDOFF.md` §3。
- ユーザーは github.io を Browser pane で開くのを断っている。公開の確認は curl かローカルのプレビューで行う。

## 4. ユーザーの確認待ち
- 試作 v9 の実機での感触（スマホ縦向き、タップで集合、強化ボタン、音量）。
- PLAN §10 の未決事項（タイトル名、永続強化、強化の買い方、周回、ランキング、フォルダ名）。
