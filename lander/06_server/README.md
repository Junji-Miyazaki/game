# ランキング中継（Cloudflare Worker）セットアップ手順

ゲーム（GitHub Pages）→ この Worker → スコア専用リポジトリへ書き込み、という構成。ゲーム側にはトークンを一切置かない。

保存レイアウト（GitHub contents API の 1MB 制限対策で分割）:
- `log/YYYY-MM.jsonl` … 受理した全エントリを月別に追記する監査ログ。約900KBを超えたら `log/YYYY-MM-2.jsonl`, `-3` ... へ繰り上げる。git 履歴も監査証跡になる。
- `top.json` … 上位100件（score 降順 → stage 降順 → 早い日時が先）。受理のたびに更新。
- `GET /ranking` は `top.json` だけを読み、上位20を返す。
- `names.json` … 名前台帳 `{ "<名前>": { "name", "keyHash", "first", "title"? } }`。`keyHash` は端末が持つ秘密キーの SHA-256（生のキーは保存しない）。無ければ `top.json` から自動作成（既存の名前は「キー未設定の旧名」になる）。

## ボードの意味（名前ごとのベスト）
- WORLD は **名前ごとに1行のベストスコア**。同じ名前の再送は、高い方（同点は stage が高い方→早い日時）だけが残り、表示名は保存済みの行のものを維持。既存 `top.json` の重複行は最初の書き込みで統合される。
- 名前の同一性は **前後の空白を除いた完全一致**。全角/半角・大文字/小文字は別の名前。
- 名前は先着順。端末が名前ごとに乱数キーを作って送り、ログインは無い。端末を変えると同じ名前の所有は証明できない（仕様として許容）。

## 二つ名（チャンピオン称号）
- 現在の WORLD 1位だけが、自分の名前に二つ名（例「初代ランダーチャンピオン」）を付けられる。サーバーが「キーが `names.json` の `keyHash` と一致」かつ「その名前が `top.json` の先頭」を検証する。
- 二つ名は名前に付いたまま残る。1位を明け渡しても元王者の二つ名は保持され、名前を `/delete` または `/admin/delete` で消すと一緒に消える。再度 `top.json` に入ったときは台帳の二つ名が行へ復元される。
- 制御文字・`<>`・双方向/ゼロ幅/書式制御文字を除去して前後を trim し、書記素16文字に切り詰める。空文字で消去。
- `GET /ranking` の各行に、設定されていれば `title` が付く（それ以外は従来どおり）。
- 変更は月ログ `log/YYYY-MM*.jsonl` に `{ "kind":"title", "name", "title", "date" }` の行として追記（監査証跡。スコア行の形式は不変。読み取り側は `kind==='title'` の行を除外すること）。

## API
| メソッド | パス | 内容 |
|---|---|---|
| GET | `/ranking` | `{ top: [...] }` 上位20 |
| GET | `/name?n=<名前>` | `{ taken: boolean }`。空は 400。短時間キャッシュ、submit/delete で無効化 |
| POST | `/submit` | `{ name, score, stage, key }`。新規名は登録。キー一致なら受理。キー不一致は **403 `name-taken`**。キー未設定の旧名（例: 既存の「みや」）は最初のキー付き送信で確保。`key` は hex 32〜128 文字（無ければ 400） |
| POST | `/delete` | `{ name, key }`。キー一致で `names.json` と `top.json` から削除し `{ ok: true }`。不一致/旧名は 403、未登録は 404 |
| POST | `/title` | `{ name, key, title }`。**現 WORLD 1位の名前の持ち主だけ**が二つ名を設定/変更/消去（`title: ""` で消去）。成功 `200 { ok:true, title }`（サニタイズ後の値）。`400 invalid`（名前/キー形式/`title` が文字列でない）、`403 forbidden`（キー不一致・旧名でキー未設定）、`404 unknown`（未登録の名前）、`409 not-champion`（1位ではない）。Origin 検査あり |
| GET | `/admin/list` | ヘッダ `X-Admin-Key`。`{ names: [{ name, first, title?, best: {score,stage,date} \| null }] }` |
| POST | `/admin/delete` | ヘッダ `X-Admin-Key`、`{ name }`。台帳と `top.json` から削除 |
| POST | `/admin/title` | ヘッダ `X-Admin-Key`、`{ name, title }`。順位に関係なく任意の名前の二つ名を設定/消去。`200 { ok:true, title }` / 400 / 404 / 401 / 503 |

- 月ログ `log/YYYY-MM*.jsonl` は監査証跡なので削除してもそのまま残る（git 履歴にも残る）。
- 管理系は `ADMIN_KEY` 未設定なら 503。キー誤りは 401（約0.4秒遅延、定数時間比較）。キーは **自分で作った長い乱数文字列**（パスワードマネージャ等で生成）を Cloudflare の Secret に直接入力する。チャットに貼らない。

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
  | `NAMES_FILE` | Text | `names.json`（省略時 `names.json`） |
  | `ADMIN_KEY` | **Secret** | 管理用の長い乱数文字列（DEBUG の管理操作用。未設定なら管理APIは無効） |
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

## 再デプロイ（既存の Worker を更新するとき）
1. Cloudflare → Workers & Pages → `lander-ranking` → **Edit code**。
2. 既存コードを**すべて**消し、新しい `ranking-worker.js` の内容を丸ごと貼り付けて **Deploy**。
3. 二つ名（`POST /title`, `/admin/title`）を使うには、この更新版 `ranking-worker.js` のデプロイが必須（未更新だと `/title` は 404 `not found` になり、クライアントは `unavailable` と扱う）。新しい変数は不要。
4. **Settings → Variables and Secrets** で `ADMIN_KEY` を **Secret** として追加（管理機能を使う場合。自分で生成した長い乱数）。それ以外の変数は変更不要。
5. `names.json` は初回アクセス時に `top.json` から自動作成される。
