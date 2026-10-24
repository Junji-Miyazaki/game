# ランキング中継（Cloudflare Worker）セットアップ手順

ゲーム（GitHub Pages）→ この Worker → スコア専用リポジトリへ書き込み、という構成。ゲーム側にはトークンを一切置かない。

保存レイアウト（GitHub contents API の 1MB 制限対策で分割）:
- `log/YYYY-MM.jsonl` … 受理した全エントリを月別に追記する監査ログ。約900KBを超えたら `log/YYYY-MM-2.jsonl`, `-3` ... へ繰り上げる。git 履歴も監査証跡になる。
- `top.json` … 上位100件（score 降順 → stage 降順 → 早い日時が先）。受理のたびに更新。
- `GET /ranking` は `top.json` だけを読み、上位20を返す。

## 1. スコア専用リポジトリを作る（GitHub）
- New repository → 名前 `lander-scores` → Private で可（読み出しも Worker 経由のため）→ Create。

## 2. 権限を絞ったトークンを作る（GitHub）
Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
- Repository access: **Only select repositories** → `lander-scores` だけ
- Permissions → Repository permissions → **Contents: Read and write**（他はすべて No access）
- Expiration: 任意（期限切れ時は作り直して Secret を差し替える）
- 生成されたトークンは**チャットに貼らない**。次の手順で Cloudflare に直接入力する。

## 3. Worker を作る（Cloudflare）
Workers & Pages → Create → **Start with Hello World!**（リポジトリ連携 "Import a repository" は使わない）
- 名前: `lander-ranking` → Deploy
- **Edit code** → 既存コードを全削除し `ranking-worker.js` の内容を貼り付け → Deploy
- **Settings → Variables and Secrets** に追加:
  | 名前 | 種別 | 値 |
  |---|---|---|
  | `GITHUB_TOKEN` | **Secret** | 手順2のトークン |
  | `REPO` | Text | `Junji-Miyazaki/lander-scores` |
  | `LOG_DIR` | Text | `log`（省略時 `log`） |
  | `TOP_FILE` | Text | `top.json`（省略時 `top.json`） |
  | `ALLOWED_ORIGINS` | Text | 本番は `https://junji-miyazaki.github.io` **のみ**。`http://localhost:4176` はローカル試験中だけ一時的に追加し、終わったら外す（Origin は偽装できるため効果は限定的だが、許可面は最小にする） |

## 4. 動作確認
ブラウザで `https://lander-ranking.<あなたのサブドメイン>.workers.dev/ranking` を開き `{"top":[]}` が返れば成功。
この **Worker の URL（秘密ではない）** をリーダーに伝えればゲーム側に組み込む。

## 制約（事実）
- スコアはブラウザ計算のため、意図的な偽装は完全には防げない（妥当性チェックと連投制限で抑止のみ）。
- 連投制限は Worker isolate のメモリ内で行うベストエフォート（厳密ではない）。
- 1ファイルが約900KBを超えると月ログは連番ファイルへ繰り上げ、GitHub API の 1MB 制限で全体が壊れないようにしている（sha は `Accept: application/vnd.github.object`、内容は `application/vnd.github.raw` で取得）。
- ログ追記と `top.json` 更新は別々の書き込み。ログ成功後に `top.json` が競合し続けた場合は 502 を返す（ログには残るので、必要なら月ログから `top.json` を再構築できる）。
- 名前は制御文字・`<>`・双方向/ゼロ幅の書式制御文字を除去し、書記素単位で12文字に切り詰める。
