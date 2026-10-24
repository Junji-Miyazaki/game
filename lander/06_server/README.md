# ランキング中継（Cloudflare Worker）セットアップ手順

ゲーム（GitHub Pages）→ この Worker → スコア専用リポジトリの `log.jsonl` に1行追記、という構成。ゲーム側にはトークンを一切置かない。

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
  | `FILE` | Text | `log.jsonl` |
  | `ALLOWED_ORIGINS` | Text | `https://junji-miyazaki.github.io,http://localhost:4176` |

## 4. 動作確認
ブラウザで `https://lander-ranking.<あなたのサブドメイン>.workers.dev/ranking` を開き `{"top":[]}` が返れば成功。
この **Worker の URL（秘密ではない）** をリーダーに伝えればゲーム側に組み込む。

## 制約（事実）
- スコアはブラウザ計算のため、意図的な偽装は完全には防げない（妥当性チェックと連投制限で抑止のみ）。
- 連投制限は Worker isolate のメモリ内で行うベストエフォート（厳密ではない）。
