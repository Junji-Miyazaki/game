# ランキング中継（Cloudflare Worker）セットアップ手順

ゲーム（GitHub Pages）→ この Worker → スコア専用リポジトリへ書き込み、という構成。ゲーム側にはトークンを一切置かない。

保存レイアウト（GitHub contents API の 1MB 制限対策で分割）:
- `log/YYYY-MM.jsonl` … 受理した全エントリを月別に追記する監査ログ。約900KBを超えたら `log/YYYY-MM-2.jsonl`, `-3` ... へ繰り上げる。git 履歴も監査証跡になる。
- `top.json` … 上位100件（score 降順 → stage 降順 → 早い日時が先）。受理のたびに更新。
- `GET /ranking` は `top.json` だけを読み、上位20を返す。
- `top-v1.1.json`, `log/v1.1/YYYY-MM.jsonl` … **v1.1 ボード**用（v1.0 のファイルは従来のまま。ロールオーバーも同じ）。
- `names.json` … 名前台帳（**全ボード共通**）`{ "<名前>": { "name", "keys": [keyHash…最大5], "first", "title"?, "pinHash"?, "pinSalt"?, "pinIp"?, "pinDay"? } }`。`keys` は端末が持つ秘密キーの SHA-256（生のキーは保存しない）。旧形式 `keyHash` は読み込み時に `keys[0]` へ自動移行（次の書き込みで保存し直される）。無ければ `top.json` から自動作成（既存の名前は「キー未設定の旧名」になる）。

## ボード（版別ランキング）
- `board` ∈ `v1.0` / `v1.1`（許可リスト）。**省略 = `v1.0`**（公開中の v1.0 クライアントは無変更で動く）。許可外は 400 `invalid`。
- `GET /ranking?board=`、`POST /submit {…, board}`、`POST /title {…, board}`（その板の1位かを検査）。`/ranking` の応答には常に `board` が入る（旧 Worker には無い → クライアントは `relayBoardSupported()` で対応を判定できる）。
- パイロット名・二つ名・端末キー・PIN は版共通。二つ名は両板の行に反映される。`/delete`・`/admin/delete` は両板から名前を消す。
- `/admin/list` は各名前に `best`（v1.0 のベスト）、`bests: {"v1.0":…,"v1.1":…}`、`hasPin`、`devices`（登録端末数）を返す。

## 複数端末と PIN（任意）
- 端末キーは名前ごとに最大5つ（超えたら古い順に破棄）。`/submit`・`/delete`・`/title`・`/pin/set`・`/pin/clear` は登録済みのどのキーでも通る。
- **PIN は任意・4〜6桁の数字（6桁推奨）**。別の端末で同じ名前を使うとき `/pin/login` に PIN を送ると、その端末のキーが登録される。
- 保存: `pinHash = hex(HMAC-SHA256(key=PIN_PEPPER, msg = salt + ':' + pin))`、`salt` は名前ごとのランダム16バイト(hex)。PBKDF2 等の重いハッシュは Workers 無料プランの CPU 制限に収まらない［要確認：未実測］ため HMAC を採用。**安全性は PIN_PEPPER が秘密であること**（`names.json` だけでは総当たりできない）と**オンラインの試行制限**に依存する。
- **試行制限（方針C）**: 名前は順位表で公開されるため、「名前単位ロック」では第三者が5回失敗させるだけで本人を締め出せる（嫌がらせ）。そこで次の2層にした。
  1. **(名前, クライアントIP) 組ロック**: 同じIPから同じ名前に連続5回失敗 → その組だけ15分ロック（429 `locked` + `retryAfter` 秒。5回目の失敗の応答自体が 429）。他のIP（本人）は影響を受けない。そのIPでの成功で組のカウンタはリセット。ロック満了後はカウンタも0から。
  2. **名前ごとの日次上限**: 1名前につき UTC 1日あたり失敗50回（全IP合計）に達すると、翌 UTC 0時までその名前の `/pin/login` を全IPで拒否（429 `locked` + `scope:"name"` + `retryAfter`、正しい PIN でも拒否）。成功しても日次カウントは戻らない。
  - 保存: 台帳エントリの `pinIp: { <ipTag>: { n, until?, t } }`（最大20件。満了・24時間超は破棄、ロック中を優先して残す）と `pinDay: { d:"YYYY-MM-DD", n }`。**生のIPは保存しない**: `ipTag = hex(HMAC-SHA256(key=PIN_PEPPER, msg='ip:'+ip))` の先頭16桁。旧 `fails`/`lockUntil` は無視され、次の書き込みで消える。`/pin/set`・`/pin/clear`・`/admin/pin-reset` は `pinIp`/`pinDay` も消す。
  - 加えて同一IPのメモリ内制限（10分に30回、isolate 単位のベストエフォート）は従来どおり。
  - 計算［計算値、未実測］: 日次上限50回なら、全探索（平均はその半分）に 6桁 = 10^6/50 = 2万日 ≒ 55年、4桁 = 10^4/50 = 200日。
  - **残るリスク**: 多数のIPを使える攻撃者は日次上限50回を消費して本人を最大1日締め出せる（本人はその日 PIN ログインできない。翌 UTC 日または管理者の `/admin/pin-reset` で復旧）。ただし組ロック方式の「5回で即締め出し」よりは桁違いにコストが高い。将来案B: PIN とは別の非公開ログインID（名前と別に持つ）を導入し、公開名では試行を受け付けない。
- **限界**: 4桁は10,000通りしかなく、試行を続ければ破れる（1つのIPからは15分に5回 ≒ 1日約480回だが、名前ごとの日次上限50回で、全IP合計でも4桁の全探索に約200日かかる計算）。ペッパーが漏れ、かつ `names.json` が漏れた場合のみオフライン総当たりが可能（6桁でも短時間で可能）。他サービスのパスワードを使い回さないこと。ゲームスコアの名前を守る程度の強度で、重要な資産の保護には使わない。名前を狙った締め出しは上記の日次上限分のコストが要る（上の「残るリスク」）。忘れた場合は管理者が `POST /admin/pin-reset` で初期化（鍵は残る）。
- `PIN_PEPPER` が未設定なら `/pin/*` は 503 `pin-disabled`（他の機能は通常どおり）。ペッパーを**変更すると既存の PIN はすべて無効**になる（各自が再設定、または管理者が初期化）。
- 応答に `pinHash` / `pinSalt` / `keys` / `PIN_PEPPER` は一切含まれない。比較は定数時間。PIN 操作は月ログに `{ "kind":"pin", "name", "action":"set|clear|login-ok|login-fail|lock|lock-name|admin-reset", "date" }` として追記（PIN 値は書かない。読み取り側は `kind` のある行を除外すること）。

## ボードの意味（名前ごとのベスト）
- WORLD は **名前ごとに1行のベストスコア**。同じ名前の再送は、高い方（同点は stage が高い方→早い日時）だけが残り、表示名は保存済みの行のものを維持。既存 `top.json` の重複行は最初の書き込みで統合される。
- 名前の同一性は **前後の空白を除いた完全一致**。全角/半角・大文字/小文字は別の名前。
- 名前は先着順。端末が名前ごとに乱数キーを作って送り、ログインは無い。端末を変えると同じ名前の所有は証明できない（仕様として許容）。

## 二つ名（チャンピオン称号）
- 現在の WORLD 1位だけが、自分の名前に二つ名（例「初代ランダーチャンピオン」）を付けられる。サーバーが「キーが `names.json` の `keys` のどれかと一致」かつ「その名前が `top.json` の先頭」を検証する。
- 二つ名は名前に付いたまま残る。1位を明け渡しても元王者の二つ名は保持され、名前を `/delete` または `/admin/delete` で消すと一緒に消える。再度 `top.json` に入ったときは台帳の二つ名が行へ復元される。
- 制御文字・`<>`・双方向/ゼロ幅/書式制御文字を除去して前後を trim し、書記素16文字に切り詰める。空文字で消去。
- `GET /ranking` の各行に、設定されていれば `title` が付く（それ以外は従来どおり）。
- 変更は月ログ `log/YYYY-MM*.jsonl` に `{ "kind":"title", "name", "title", "date" }` の行として追記（監査証跡。スコア行の形式は不変。読み取り側は `kind==='title'` の行を除外すること）。

## API
| メソッド | パス | 内容 |
|---|---|---|
| GET | `/ranking?board=` | `{ board, top: [...] }` 上位20（board 省略=v1.0、許可外は 400） |
| GET | `/name?n=<名前>` | `{ taken, hasPin }`。空は 400。短時間キャッシュ、submit/delete で無効化 |
| POST | `/submit` | `{ name, score, stage, key, board? }`。新規名は登録。キー一致なら受理。キー不一致は **403 `name-taken`**。キー未設定の旧名（例: 既存の「みや」）は最初のキー付き送信で確保。`key` は hex 32〜128 文字（無ければ 400） |
| POST | `/delete` | `{ name, key }`。キー一致で `names.json` と `top.json` から削除し `{ ok: true }`。不一致/旧名は 403、未登録は 404 |
| POST | `/title` | `{ name, key, title, board? }`。**その板の現 WORLD 1位の名前の持ち主だけ**が二つ名を設定/変更/消去（`title: ""` で消去）。成功 `200 { ok:true, title }`（サニタイズ後の値）。`400 invalid`（名前/キー形式/`title` が文字列でない）、`403 forbidden`（キー不一致・旧名でキー未設定）、`404 unknown`（未登録の名前）、`409 not-champion`（1位ではない）。Origin 検査あり |
| POST | `/pin/set` | `{ name, key, pin }`。登録済みキーの端末が PIN を設定/変更（`/^\d{4,6}$/` 以外は 400）。`{ ok:true }` / 403 `forbidden` / 404 `unknown` / 503 `pin-disabled` |
| POST | `/pin/clear` | `{ name, key }`。PIN・失敗カウンタ(pinIp/pinDay)を削除。`{ ok:true }` |
| POST | `/pin/login` | `{ name, pin, newKey }`。成功で `newKey` の SHA-256 を `keys` に追加し `{ ok:true, name, title? }`。404 `unknown` / 409 `no-pin` / 403 `bad-pin` / 429 `locked`(`retryAfter` 秒。名前日次上限は `scope:"name"` 付き) / 429 `rate` / 400 `invalid`（`newKey` は hex 32〜128） |
| GET | `/admin/list` | ヘッダ `X-Admin-Key`。`{ names: [{ name, first, title?, best, bests:{v1.0,v1.1}, hasPin, devices }] }`（`best`/`bests.*` は `{score,stage,date}` または null） |
| POST | `/admin/pin-reset` | ヘッダ `X-Admin-Key`、`{ name }`。PIN・失敗カウンタ(pinIp/pinDay)を消す（端末キーは残す。`PIN_PEPPER` 無しでも可）。`{ ok:true }` / 404 |
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
  | `PIN_PEPPER` | **Secret** | PIN ハッシュ用の長い乱数文字列（32文字以上。パスワードマネージャ等で自分で生成し、Cloudflare に直接入力。**チャットに貼らない**。未設定なら PIN 機能は無効） |
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

## 再デプロイ（既存の Worker を更新するとき）— 版別ボード・PIN 対応版
1. Cloudflare → Workers & Pages → `lander-ranking` → **Edit code**。
2. 既存コードを**すべて**消し、新しい `ranking-worker.js` の内容を丸ごと貼り付ける。
3. **Settings → Variables and Secrets** → Add → 種別 **Secret**、名前 `PIN_PEPPER`、値は自分で生成した長い乱数文字列 → Save。（`ADMIN_KEY` 等ほかの変数は変更不要。）
4. **Deploy**（コード貼り付けと Secret 追加のあと、デプロイ操作を1回行う）。
5. 確認: ブラウザで `/ranking?board=v1.1` を開き `{"board":"v1.1","top":[]}`、`/ranking` が `"board":"v1.0"` を含むこと。`/name?n=…` が `{"taken":…,"hasPin":…}` を返すこと。
- 更新後も v1.0 のファイル（`top.json`・`log/YYYY-MM.jsonl`）は変わらない。`names.json` は旧 `keyHash` 形式のまま動作し、書き込みのたびに `keys` 形式へ移行される。
- 古い Worker のままだと `/ranking` に `board` が無く、v1.1 クライアントは世界送信を停止する（`relayBoardSupported()` が false）。
