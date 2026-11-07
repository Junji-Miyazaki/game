# LANDER 引き継ぎ書（新セッションはここから読む）

更新: 2026-10-29（リーダー Opus 5.5）。詳細の経緯は `00_log/LOG.md`（新しい順）、決定事項は `01_docs/PLAN.md`（§7h〜§7s）。

## 1. 構成
| 対象 | 場所 | 公開 URL | 状態 |
|---|---|---|---|
| v1.0（公開中・安定版） | `../lander/` | https://junji-miyazaki.github.io/game/lander/index.html | 致命的不具合のみ修正 |
| BETA v1.1（主開発） | `lander-1.1/` | https://junji-miyazaki.github.io/game/lander-1.1/index.html | 版 `1.1.0-beta.9`、表示「BETA v1.1」 |
| EXPEDITION（beta.8 で本編に組み込み、§7t） | 正本 `lander-1.1/02_src/expedition/`、試作ページ `07_lab/expedition/` | 本編はマップから / 試作は `07_lab/expedition/…` | #1〜#4。解放はツアー中の POD |
| 中継 Worker（両版共通の正本） | `../lander/06_server/ranking-worker.js` | https://lander-ranking.euler057721.workers.dev | ユーザーが Cloudflare で貼り替え |

フォルダ規約: `00_log/ 01_docs/ 02_src/ 03_assets/ 04_tests/ 05_legacy/ 06_server/ 07_lab/`。

## 2. 作業手順
- 編集後 `node build.js`（`lander-1.1/` で実行。ES モジュールを1つの IIFE に束ねるので、新しいトップレベル名は接頭辞付きにする: `SM_` `PT_` `BFX_` など）。`index.html` の `?v=` は build.js が自動更新。
- テスト: `lander-1.1/` で smoke と `04_tests/p*.mjs` 全部（`p10setup` は補助なので除外）。現在 31 ファイル全通過。
  ```bash
  for f in 04_tests/smoke*.mjs 04_tests/p*.mjs; do case $f in *p10setup*) continue;; esac; node $f >/tmp/o.txt 2>&1 || { echo "FAIL $f"; grep -i fail /tmp/o.txt | head -3; }; done
  ```
- lab ページを変えたら `node 07_lab/stamp.js`（キャッシュ対策）。
- ローカル確認: `.claude/launch.json` の `lander-1.1`（:4177）。v1.0 は `lander`（:4176）。
- 版番号を上げると版固定のテスト（p10/p12/p18/p19/p21 ほか）の更新が必要。同日の小改修は版を据え置き、`02_src/whatsnew.js` の最新 entry に1行足す運用にしている。

## 3. 規則（ユーザー指示）
- 返答は日本語、短く、結論から。スクリーンショットはユーザーに送らない（確認は文章で）。
- **議論中に実装を始めない**。ユーザーが「率直な意見は？」「どうか？」と聞いたら意見と案を返し、「OK」を待つ。
- Opus が采配し、検証しやすい実装は Sonnet のエージェントに任せてよい。
- 毎回 `00_log/LOG.md` に記録（実施 / 判断と理由 / 未確認）。
- git: commit 後の push は承認済み。メッセージ末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
  ```bash
  T=$(grep -oE 'github_pat_[A-Za-z0-9_]+' token.txt | head -1); git push "https://x-access-token:${T}@github.com/Junji-Miyazaki/game.git" main 2>&1 | sed -E 's/(github_pat_|gh[a-z]_)[A-Za-z0-9_]*/***TOKEN***/g'
  ```
  （`game/` 直下で実行。`token.txt` は絶対にコミット・表示しない。）
- `ADMIN_KEY`・`PIN_PEPPER` は Cloudflare の Secret。ユーザーだけが入力する。チャットに貼らせない。書き込みトークンをクライアントに埋め込まない。
- ユーザーは github.io を Browser pane で開くのを断っている。公開確認はローカル preview かテストで行う。

## 4. BETA v1.1 の現状（beta.7、2026-10-28 公開）
- ツアー 8 天体 × 2 ステージ = 1 周 16 ステージ（月・エウロパ・イオ・火星・タイタン・金星・水星・冥王星）。周回ごとに重力 ×(1+0.15·周)。3 ステージごとに TERRA ボーナス。★ は 1 周目のみで 48 個、PERFECT パッチ 8 枚。
- 輪とコンボ、特典の輪（SLOW-MO・RADAR・SIDE THRUST・FUEL）、LANDABLE 表示、隕石の尾と衝突警告、墜落理由の数値表示。
- HOW TO PLAY（JA/EN、操作の向き STANDARD/INVERTED）: ラン開始ごとに表示、「次回から表示しない」可。再表示の入口は起動画面の HOW TO PLAY ボタンと一時停止（MISSION HOLD）の中。
- ステージ開始時に、やることを1文で表示。
- **SHIELD ゲージ**（PLAN §7r）: 20 秒で満タン（play と grounded の時間）、ラン内で持ち越し、使うと 0。発動はボタン / マウスクリック（操作帯の外）/ ↓・S。効果は 5 秒の泡で隕石を弾く（地面への衝撃は従来どおり失敗）。ボタン自体がゲージ: 充填中は 0.72 倍・薄い・紫、満タンで膨らむ＋光＋短い音、その後は赤と琥珀で点滅。緊急シールド（2 回墜落）は廃止。モジュールの SHIELD は別物で残っている。
- 起動画面: UPDATE INFORMATION（JA/EN、日付つき、スクロール）、太陽系の背景、Hall of Fame（WORLD TOP 5、ファンファーレ）、太陽系マップ（MAP ボタン）。
- ランキング: v1.1 専用ボード（`top-v1.1.json`）、名前は版共通、任意の PIN（4〜6 桁）。

## 4b. beta.8（2026-11-04）EXPEDITION を本編へ（PLAN §7t）
- マップの下段と惑星系のカードが入口。未解放は ???、POD を取ると解放。POD: 月=RYUGU・火星=PHOBOS・タイタン=ENCELADUS・冥王星=67P、30%→50%→70%→必ず。ステージ後に MISSION ACCEPTED。★は x/60。記録はパイロットごと・端末内。説明カード JA/EN。全解放 `?expedition=all`。
- テスト: 既存 31 + `04_tests/p24expedition.mjs`（87 項目）= 32 ファイル全通過。試作ページの autotest も通る。

## 4c. beta.9（2026-11-04）寄り道の分岐と POD の出し方（PLAN §7u）
- MISSION ACCEPTED の最後に「いま向かう / ツアーを続ける」。いま向かう = ツアーを止めたまま探査を MISSION で1回 → 「ツアーへ戻る」で同じ画面から再開（main.js `engine.toDetour`、Game は `_suspended` の間 enter/exit で状態を消さない）。探査はツアーの得点に足さない。
- 未挑戦の探査は、その天体のステージをクリアした後に再案内（ランごと1回、`played` で停止）。ゲームオーバー画面の下に入口。
- POD は機体が画面の中ほどまで降りた時に、反対側の横・少し下に出て付いて来ない（出る時に音）。
- テスト: 32 ファイル全通過（p24expedition 120 項目）。
- 同日: クリアの得点は集計が合計に届くまで右上・BEST に出さない（`_scoreShown`）。世界ランキングはステージクリアごとと途中でやめた時にも送る（`_worldSend`、中継は変更なし）。テスト 34 ファイル全通過（p25score・p26world 追加）。

## 4d. 2026-11-06 管理者の仮 PIN（版は上げず）
- 端末の保存データが消えて自分の名前に入れない人のため、WORLD ADMIN の PIN なしの名前に SET PIN。Worker `POST /admin/pin-set`。本人は THIS IS MY NAME → 仮 PIN でログイン → PILOTS で変更。
- **Worker の再デプロイはユーザー待ち**（済むまで SET PIN は 404）。

## 4e. 2026-11-07 世界ランキング 3 種類（版は上げず）
- タイトルの WORLD に ALL / WEEK（今週・月曜 0:00 JST リセット）/ STAGE（最高到達）/ EXPEDITION 4 ミッションの最速タイム。ゲームオーバー画面は ALL のみ。
- Worker: `/submit` が今週・到達も更新、`POST /xp`、`GET /ranking?board=v1.1-week|v1.1-reach|xp-<id>`。**再デプロイはユーザー待ち**（それまで新しい種類は UPDATING）。
- 既存の記録から埋める: 管理画面の FILL WEEK / STAGE（Worker `POST /admin/backfill`）。**再デプロイと実行はユーザー待ち**。
- 見送り: 週替わりのお題（今週のチャレンジ）。今週のボードに毎週 10 人ほど載るようになったら検討（通常ステージの地形を週ごとに固定する作り直しが要る）。

## 5. ユーザーの実機確認待ち
- beta.9: POD の見つけやすさ・取りに行く手間（反対側 110〜170px・吸い寄せ 28px）、出る時の音、いま向かう → ツアーへ戻るの流れ、再案内のしつこさ、ゲームオーバー画面の入口。
- beta.8: マップの ??? と正体が現れる演出、ミッションから MAP で戻る流れ、英語の説明カード。
- SHIELD: 音と見え方は 2026-11-04 ユーザー OK。PC のクリック誤発動は未報告。
- INVERTED 操作の感触、冥王星の滑りと中継着陸の所要時間（自動操縦の中央値 約 270 秒）、Hall of Fame の音。
- 起動画面の HOW TO PLAY ボタンの押しやすさ（画面最下部）。
- EXPEDITION #2（間欠泉）: 噴気の押す強さ、試料の残り時間、3 つ全部が取れるか。
- EXPEDITION #3（RYUGU）: 2026-11-03 改訂（左上から流れ込んで開始 → 採取後に静止 → LIFT OFF の合図 → 9 秒で 104px の線 → CLEAR → 自動で真上へ去る。母艦なし。地表は円弧）。合図が分かるか、9 秒の余裕、進入の初速（横 8・縦 16）、岩の押し返しの感触、弧の見た目は 2026-11-04 OK。同日、星空がごくゆっくり回る演出を追加（試遊待ち）。POD は月ステージ。2026-11-03 ユーザー OK。
- EXPEDITION #4（COMET 67P ANCHOR）: 2026-11-03 試作。燃料切れは全ミッション共通で「5 秒流れて LOST CONTROL」（爆発しない）（くびれの底に 10 px/s 以下で触れて錨・横向きのガス 2 か所・速すぎは大きく跳ね返る）。2026-11-04 ユーザー: 難しい（跳ねると上へ進み、戻す間に燃料が尽きる）、ガスの強さは変化してよい。同日 改訂（跳ねたら約 24 px 上で止まり 5 px/s で降りてくる・ガスの強さは毎回 3/5/7 で霜の量が強さを示す）→ 2026-11-04 ユーザー OK（この形で確定）。

## 6. 次の候補（未着手・ユーザー判断待ち）
- **v1.2 は作らない**（2026-10-29 ユーザー決定、PLAN §7s）。EXPEDITION は v1.1 の同じアドレスに追加し、保存・ツアーのランキング・名前と PIN を継続する。
- EXPEDITION: #1〜#4 は本編に組み込み済み（beta.8）。次は #5 以降（TRITON の再設計など）か、ミッション別の世界ランキング（Worker の更新とユーザーの再デプロイが必要）。
- 保留: TERRA ROVER のパッド速度の調整（必要なら）。

## 7. 既知の注意点
- v1.0 と v1.1 は保存キーを分けている（v1.1 は `lander11.` 接頭辞）。v1.0 のパイロットは初回に引き継ぎを選べる（`migrate.js`）。
- p15 の net テストは、送信内容と URL に board が入る前提。
- 水星の音楽で AudioParam が落ちた前例がある（修正済み）。音の変更は実ブラウザでも確認する。
