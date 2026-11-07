# BIRDS RECLAIM 引き継ぎ書（新セッションはここから読む）

更新: 2026-11-07（リーダー Opus 5.5）。経緯は `00_log/LOG.md`、設計は `01_docs/PLAN.md`。

## 1. 現状
| 対象 | 場所 | 状態 |
|---|---|---|
| 試作 v1 | `index.html` ＋ `07_lab/proto_v1/`（stages.js → globe.js → game.js の順に読む） | 地球儀の地図＋3都市（大阪・ロンドン・ニューヨーク）。ローカルのみで、コミットも公開もしていない |
| 設計 | `01_docs/PLAN.md` | §6 に未決事項 6 つ |

- LIGHTHOUSE（`../lighthouse/`）は別のゲームとして残す。こちらは群れ・崩落・包囲・音のコードを v9 から写して育てている。
- 本編（LANDER 準拠の作り）は未着手。ユーザーの OK 待ち。

## 2. 作業手順
- ローカル確認：`.claude/launch.json` の `birds-reclaim`（`node birds-reclaim/server.js`、:4179）。
- 自動プレイ：`node 07_lab/proto_v1/sim.js auto 4 [0|1|2|all]`（強化し続ける）／`none`（強化なし）。地図と描画も呼んでエラーを見る。
- JS を変えたら、`index.html` の `?v=` を次の値に更新する。
  `cat 07_lab/proto_v1/{stages,globe,game}.js | shasum | cut -c1-10`
- 都市を足すとき：
  1. `stages.js` の `STAGES` に1件足す。
  2. ボスを `BOSS` に足す（`make` で図面を描く。`shell` と `core` を決める）。
  3. sim で勝ち負けを見る。
  - 地図の位置は `lat` と `lon` で決まる。

## 3. 規則（ユーザー指示）
- 返答は日本語、短く、結論から。スクリーンショットはユーザーに送らない。
- 新しい案は試作で見せて OK を待つ。
- 同じリポジトリ（main）を他のセッションも使う。触るのは `birds-reclaim/`、`.claude/launch.json` の自分の行、公開時だけトップの `index.html` のリンク行。
  - コミットは `git add birds-reclaim/` のように明示する。ブランチは切り替えない。
- コミットメッセージは「何を・なぜ」を1行、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **push は都度ユーザーに確認**。`token.txt` は絶対にコミット・表示しない。push の方法は `../lander-1.1/00_log/HANDOFF.md` §3。
- ユーザーは github.io を Browser pane で開くのを断っている。公開の確認は curl かローカルのプレビューで行う。
- 建物の線引き（PLAN §4）を守る：ロゴと社名は出さない。宗教施設・慰霊の場・惨事の現場は入れない。

## 4. ユーザーの確認待ち
- 試作 v1 を触った感想（地図、3都市、仕掛け、自然に還る演出）。
- コミットと公開をするか。
- PLAN §6 の未決事項。
