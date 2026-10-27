# EXPEDITION 試作（v1.2 R&D）

仕様: `01_docs/EXPEDITION_MISSIONS.md`（正）/ PLAN §7m。ゲーム本体（02_src, 04_tests）・`../lander/` は無変更。サーバ: preview 設定 `lander-1.1`（port 4177）。URL は `index.html` まで書く。

| 試作 | URL | 内容 |
|---|---|---|
| 00_harness | http://localhost:4177/07_lab/expedition/00_harness/index.html | 共通試作台のデモ。API は 00_harness/README.md |
| 01_sample_return | http://localhost:4177/07_lab/expedition/01_sample_return/index.html | #1 PHOBOS SAMPLE RETURN |
| 02_geyser_run | http://localhost:4177/07_lab/expedition/02_geyser_run/index.html | #2 ENCELADUS GEYSER RUN（間欠泉） |

## 共通シェル（00_harness/shell.js）
#1 で承認済みの枠組みを共通化。メニュー（PRACTICE / MISSION、BEST・累積★）・3 ライフ（×1.0/0.8/0.6）・タイムトライアル（max(0,1500−10×秒)）・ベストの保存（`lander11.exp.<id>.best / .besttime`、★は和集合）・結果 / MISSION FAILED / LIFE LOST 画面・HUD 右上（タイマー / チェック行 / PRACTICE タグ or ライフ）・ヒント行・足元の傾斜マーカー・R キーのライフ消費（**createLab より前に登録**するのでブラウザの発火順に依存しない）。`createShell({id, expLabel, title, options})` → `sh.sess / begin / onLoss / complete(f, [★1,★2,★3]) / tap / drawMenu / drawResult / drawCorner / drawHint`。ミッションは `lab.m` に menu / result / resultT / lifeLost / failed / final / reason / detail を置く。#1・#2 とも使用（#1 は移行後も autotest の `score()` `five()` 全通過）。
- **ヒント行は y=84**（右上の PRACTICE タグ / ライフ行の下）。旧 #1 は y=66 で、長いヒントが PRACTICE タグ・ライフと重なっていたのを修正。

## 01 SAMPLE RETURN
流れ: **母船のドッキングベイに係留した状態で開始**（最終ドッキングと同じ位置・直立姿勢。燃料満タン）→ **TAP TO RELEASE**（点滅表示。キャンバスのどこをタップ / 推力ボタン / Space・↑ で解放。タイマーによる自動解放なし。係留中の待機では何も失わず、ライフを失うのは解放後のみ。解放で母船の水平速度を引き継ぎ、下へ 18px/s で自動で離れる。約1秒は操作不可、その後操作可）→ 琥珀色の SAMPLE SITE（平ら）に着地 → 2.0 秒静止（円ゲージ。推力を入れる/離陸するとゲージはゼロに戻る）→ SAMPLE ACQUIRED → 離陸 → 母船へ戻る。
**ゴースト**: 離れている間、母船のベイに機体の破線アウトライン（直立）を常時表示。母船と一緒に動く＝戻るべき形と位置。枠内・相対速度 ≤10 px/s・傾き ≤20° が揃うと青緑に点灯し、0.25 秒それが続くと MISSION COMPLETE（吸い込み演出）。
失敗: 墜落（v1.1 と同じ閾値）/ 燃料 0 のまま 2 秒（STRANDED）/ 画面外。**母船の船体・ドッキング枠への接触は失敗にならない**: 固体として扱い、相対速度 >10 px/s の接触は法線方向に反発（反発係数 0.35）+ 回転 ±15°/s + 0.3s の画面揺れ + 衝突音 + 'BUMP' 表示、船体の外へ押し出す（前回位置→現在位置を 2px 刻みでスイープするので高速でもすり抜けない）。枠の入口（下側）は開いている。帰路は枠が固体なので、母船の真下へ回り込んで入る。母船は開始時から飛んでいる（輪は採取後に琥珀色に点灯、枠内で速すぎ・傾きすぎると赤字で理由）。
**PRACTICE / MISSION**: 起動時はメニュー（PRACTICE / MISSION の2ボタン、BEST スコアと累積★1-3 を表示）。URL `?mode=practice|mission` でメニューを飛ばせる。
- PRACTICE: 'UNLIMITED RETRIES · NO STARS'。失敗しても R / RETRY で即やり直し、スコア・★は保存しない（HUD に PRACTICE）。メニューのチェック **START AT SITE**（降下を飛ばして採取地点から）/ **START NEAR DOCK**（採取済みで母船の真下から帰路のみ。両方ONなら NEAR DOCK 優先）。URL `site=1` `near=1`。
- MISSION: '3 LIVES · STARS & SCORE'。HUD 右上にライフ（小さな機体アイコン×3）。失敗 → ライフ -1 → 'LIFE LOST' を 1.6 秒表示 → 母船係留スタートへ自動で戻る（母船の位相は従来どおり ph0 から）。0 ライフ → 'MISSION FAILED'（RETRY MISSION＝新しい3ライフ / MENU）。**ミッション中に R を押す（解放後）とライフを1つ失う**（無料リトライの抜け道を塞ぐ。係留中の R は無料）。
- スコア = (1000 + 燃料% ×10 + 着地ボーナス[PERFECT 300 / その他 100] + 時間ボーナス max(0, 1500 − 10×秒)) × ライフ倍率（残り3 ×1.0 / 2 ×0.8 / 1 ×0.6）。勝利時は 'MISSION COMPLETE'・残りライフと倍率・SCORE・★（新規に NEW）・BEST・RETRY MISSION / MENU。
- **タイムトライアル**: 時間 = 解放 → ドッキング成功（成功した命の分だけ。ライフを失うと次の命で 0 から。係留中は進まない）。解放後に HUD 右上へ mm:ss.t を常時表示（PRACTICE も表示するが保存しない）。結果画面に TIME / TIME BONUS、自己ベスト更新で 'NEW BEST TIME'。メニューに BEST SCORE / BEST TIME。ベストタイム（MISSION 勝利のみ・最小値）は `lander11.exp.sample_return.besttime`（秒の数値）、スコア・★は `...best`（別キー）。
- **オフサイト着地**: SAMPLE SITE 以外でも、傾斜 ≤10° かつ SAFE 内なら grounded（採取なし・失敗なし）。推力で離陸（本編 L1 の grounded と同じ規則）。急斜面・強い衝撃は従来どおり失敗（STEEP GROUND / HARD IMPACT）。地形に平地 2 か所（x≈28-92, 300-350）と急な岩（x≈130）を追加。機体の真下の地面に傾斜マーカー（青緑 ≤5° / 琥珀 ≤10° / 赤 >10°）を高度 130px 以内で表示。
- ★: ★1 完了 / ★2 ドッキング時の燃料 ≥30% / ★3 採取した着地が PERFECT。累積（和集合）と最高スコアは localStorage `lander11.exp.sample_return.best` のみ（MISSION 勝利時だけ更新）。旧 `...attempts` は起動時に削除。デバッグパネルの RESET RECORD で記録消去（スコア・ベストタイム両方）。
R か RETRY で即やり直し。
速度ベクトル矢印: 採取前は地面に対する速度、採取後は**母船に対する相対速度（REL）**。機首方向の点線が矢印と逆向きなら逆噴射の向き。デバッグで OFF 可。

URL パラメータ（共通 + 固有）: `g=0.04 thrust=5.2 ang=28 damp=0.82 drag=0 fuel=100 rcs=2.5 vec=1` / `ms`（母船の最大速度 px/s, 既定9）/ `ph0`（母船の開始位相 rad, 既定-1.2）/ `hold`（採取秒, 既定2.0）/ `ring`（枠の半径 px, 既定17）/ `dbg=1`（パネル初期表示）/ `test=1`（`window.__auto.run({ph0})` の検証用自動操縦。姿勢と降下中の横速度を理想的に与えるので人間の腕前の保証ではない。局面ログ: docked → descent → sampling → return → win の5局面。`__auto.bump({speed,ox,dy})` = 母船への衝突テスト（墜落せず続行・すり抜けなし）、`__auto.score()` = メニュー/練習/ミッション/ライフ喪失/MISSION FAILED/永続化の検査、`__auto.five()` = ミッション通常クリア5本、`window.__flow` = begin(mode,opts)・tap(x,y) のテスト用口。test=1 は帰路の横合わせも理想化）。

## 02 GEYSER RUN（ENCELADUS）
流れ: 上から進入（開始待ち: **TAP TO START** — タップ / 推力ボタン / Space・↑。待機中は何も失わずタイマーも止まる）→ 噴気の頂上付近に出る光る**試料**を通過して取る（チャイム）→ **試料が1つ以上**でパッドが開く → 噴気の間のパッドに着地 = 完了。ヒント: 'FLY THROUGH THE PLUMES · GRAB A SAMPLE · LAND ON THE PAD'。
- **世界**: 氷の白青の地表 + 暗い虎縞 + 土星（大）。重力 0.066 px/s²（実 g 0.113 → ゲームの sqrt 写像）、抗力なし、推力 5.2 / 回転 28 / 減衰 0.82 / RCS 2.5 / 燃料 100 は #1 と同じ。
- **噴気 3 本**（x=52 / 150 / 308、周期 6.5 / 7.5 / 8.5 秒、最初の噴出 3.4 / 5.6 / 2.2 秒、強さ係数 0.92 / 1.08 / 1.0）。噴出の **1.2 秒前**から口に霜が舞い（徐々に濃く）、ヒス音。噴出 = 立ち上がり 0.4 s → ピーク 0.3 s → **2.5 s で消える**（計 3.2 s）。高さ 290px の柱。
- **噴気の力**: 柱の内側（半幅 11→20px、高さとともに広がる）で上向きに **口で push（既定 13）× 係数（≈ 10〜12 px/s²）→ 頂上で 3 px/s²** へ直線的に減り、中心ほど強く、消えるにつれ弱まる。加えて横ゆれ（〜±4 px/s²）とスピンの乱れ（〜±5°/s²、減衰があるので ±数十°/s）。**墜落ではない**。
- **噴出口**: 噴出中に口へ降りると墜落でなく**押し返す（BUMP: 上向き速度 + 横へ + 回転、画面揺れ + 音）**。噴出していない口には着地できる（平ら）。接地中に噴いたら持ち上げられる（'VENT ERUPTED'）。
- **試料**: 噴出が立ち上がった後〜噴出が終わるまで、頂上付近（高さ 86%）に出現。噴気ごとに 1 度だけ（最大 3）。取得半径 14px。終わり際に点滅。
- **パッド**（x=200-260、噴気 2 と 3 の間）: 試料 0 の間は **LOCKED**（赤・鍵）。降りても grounded のみ（得点なし・失敗でもない。推力で離陸）。1 つ以上で緑に点灯し、安全着地した瞬間に MISSION COMPLETE（グレードは game.js の表）。
- ★1 = 完了（試料 ≥1 + パッド着地）/ ★2 = 3 つすべて / ★3 = パッドに PERFECT。得点 = (1000 + 燃料%×10 + 着地ボーナス[PERFECT 300 / 他 100] + 時間ボーナス) × ライフ倍率（共通）。試料数による加点はなし（★2 のみ）。
- 失敗: 地面への墜落（v1.1 と同じ閾値、急斜面含む）/ 画面外 / 燃料 0 のまま 2 秒（STRANDED）。オフサイト着地（傾斜 ≤10° = grounded）と足元の傾斜マーカーは #1 と同じ。時間 = タップで開始 → パッド着地（ライフ喪失で 0 から）。
- 調整（デバッグパネル / URL）: `push`（口での押し px/s²、既定 13）/ `hp`（柱の高さ px、既定 290）/ `ph0`（全噴気の位相ずらし秒）+ 共通 `g thrust ang damp drag fuel rcs vec`。`?mode=practice|mission`、`dbg=1`、`test=1`。
- テスト（`?test=1`）: `__auto.physics()` = 噴気の押し（口付近 9〜14・頂上≈4・柱の外 0）/ 前触れ / 周期 / 口でのバウンス / 接地中の噴出 / 試料（出現・1 回だけ・3 本）/ パッドのロック / 失敗 3 種、`__auto.score()` = メニュー〜ライフ〜永続化〜R キー、`__auto.five()` = 位相 6 通りの通常クリア（試料 1 / 3 個）、`__auto.run({mode, ph0, want})`。自動操縦は姿勢と横速度を理想化（人間の腕前の保証ではない。噴気・衝突・試料・ロックは本物の物理）。

## 試遊で評価すること（仕様の残す基準）
1. 説明なしで 30 秒以内に何をすればよいか分かるか（画面の英語は冒頭1行と SAMPLE SITE / DOCK の表示のみ）。
2. スマホの3ボタンで無理なく操作できるか（回転が遅い・左ボタンが右回りの規約も含めて）。
3. ツアーの着陸とは違う楽しさがあるか（着陸の後にもう一段あること）。
4. もう一度やりたくなるか（★2 燃料30%・★3 PERFECT を狙いたくなるか）。
