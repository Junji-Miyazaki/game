# EXPEDITION 試作（v1.2 R&D）

仕様: `01_docs/EXPEDITION_MISSIONS.md`（正）/ PLAN §7m。ゲーム本体（02_src, 04_tests）・`../lander/` は無変更。サーバ: preview 設定 `lander-1.1`（port 4177）。URL は `index.html` まで書く。

| 試作 | URL | 内容 |
|---|---|---|
| 00_harness | http://localhost:4177/07_lab/expedition/00_harness/index.html | 共通試作台のデモ。API は 00_harness/README.md |
| 01_sample_return | http://localhost:4177/07_lab/expedition/01_sample_return/index.html | #1 PHOBOS SAMPLE RETURN |

## 01 SAMPLE RETURN
流れ: **母船のドッキングベイに係留した状態で開始**（最終ドッキングと同じ位置・直立姿勢。燃料満タン）→ **TAP TO RELEASE**（点滅表示。キャンバスのどこをタップ / 推力ボタン / Space・↑ で解放。タイマーによる自動解放なし。係留中の待機では何も失わず、ライフを失うのは解放後のみ。解放で母船の水平速度を引き継ぎ、下へ 18px/s で自動で離れる。約1秒は操作不可、その後操作可）→ 琥珀色の SAMPLE SITE（平ら）に着地 → 2.0 秒静止（円ゲージ。推力を入れる/離陸するとゲージはゼロに戻る）→ SAMPLE ACQUIRED → 離陸 → 母船へ戻る。
**ゴースト**: 離れている間、母船のベイに機体の破線アウトライン（直立）を常時表示。母船と一緒に動く＝戻るべき形と位置。枠内・相対速度 ≤10 px/s・傾き ≤20° が揃うと青緑に点灯し、0.25 秒それが続くと MISSION COMPLETE（吸い込み演出）。
失敗: 墜落（v1.1 と同じ閾値）/ 燃料 0 のまま 2 秒（STRANDED）/ 画面外。**母船の船体・ドッキング枠への接触は失敗にならない**: 固体として扱い、相対速度 >10 px/s の接触は法線方向に反発（反発係数 0.35）+ 回転 ±15°/s + 0.3s の画面揺れ + 衝突音 + 'BUMP' 表示、船体の外へ押し出す（前回位置→現在位置を 2px 刻みでスイープするので高速でもすり抜けない）。枠の入口（下側）は開いている。帰路は枠が固体なので、母船の真下へ回り込んで入る。母船は開始時から飛んでいる（輪は採取後に琥珀色に点灯、枠内で速すぎ・傾きすぎると赤字で理由）。
**PRACTICE / MISSION**: 起動時はメニュー（PRACTICE / MISSION の2ボタン、BEST スコアと累積★1-3 を表示）。URL `?mode=practice|mission` でメニューを飛ばせる。
- PRACTICE: 'UNLIMITED RETRIES · NO STARS'。失敗しても R / RETRY で即やり直し、スコア・★は保存しない（HUD に PRACTICE）。メニューのチェック **START AT SITE**（降下を飛ばして採取地点から）/ **START NEAR DOCK**（採取済みで母船の真下から帰路のみ。両方ONなら NEAR DOCK 優先）。URL `site=1` `near=1`。
- MISSION: '3 LIVES · STARS & SCORE'。HUD 右上にライフ（小さな機体アイコン×3）。失敗 → ライフ -1 → 'LIFE LOST' を 1.6 秒表示 → 母船係留スタートへ自動で戻る（母船の位相は従来どおり ph0 から）。0 ライフ → 'MISSION FAILED'（RETRY MISSION＝新しい3ライフ / MENU）。**ミッション中に R を押す（解放後）とライフを1つ失う**（無料リトライの抜け道を塞ぐ。係留中の R は無料）。
- スコア = (1000 + 燃料% ×10 + 着地ボーナス[PERFECT 300 / その他 100]) × ライフ倍率（残り3 ×1.0 / 2 ×0.8 / 1 ×0.6）。勝利時は 'MISSION COMPLETE'・残りライフと倍率・SCORE・★（新規に NEW）・BEST・RETRY MISSION / MENU。
- ★: ★1 完了 / ★2 ドッキング時の燃料 ≥30% / ★3 採取した着地が PERFECT。累積（和集合）と最高スコアは localStorage `lander11.exp.sample_return.best` のみ（MISSION 勝利時だけ更新）。旧 `...attempts` は起動時に削除。デバッグパネルの RESET RECORD で記録消去。
タイマー常時表示。R か RETRY で即やり直し。
速度ベクトル矢印: 採取前は地面に対する速度、採取後は**母船に対する相対速度（REL）**。機首方向の点線が矢印と逆向きなら逆噴射の向き。デバッグで OFF 可。

URL パラメータ（共通 + 固有）: `g=0.04 thrust=5.2 ang=28 damp=0.82 drag=0 fuel=100 rcs=2.5 vec=1` / `ms`（母船の最大速度 px/s, 既定9）/ `ph0`（母船の開始位相 rad, 既定-1.2）/ `hold`（採取秒, 既定2.0）/ `ring`（枠の半径 px, 既定17）/ `dbg=1`（パネル初期表示）/ `test=1`（`window.__auto.run({ph0})` の検証用自動操縦。姿勢と降下中の横速度を理想的に与えるので人間の腕前の保証ではない。局面ログ: docked → descent → sampling → return → win の5局面。`__auto.bump({speed,ox,dy})` = 母船への衝突テスト（墜落せず続行・すり抜けなし）、`__auto.score()` = メニュー/練習/ミッション/ライフ喪失/MISSION FAILED/永続化の検査、`__auto.five()` = ミッション通常クリア5本、`window.__flow` = begin(mode,opts)・tap(x,y) のテスト用口。test=1 は帰路の横合わせも理想化）。

## 試遊で評価すること（仕様の残す基準）
1. 説明なしで 30 秒以内に何をすればよいか分かるか（画面の英語は冒頭1行と SAMPLE SITE / DOCK の表示のみ）。
2. スマホの3ボタンで無理なく操作できるか（回転が遅い・左ボタンが右回りの規約も含めて）。
3. ツアーの着陸とは違う楽しさがあるか（着陸の後にもう一段あること）。
4. もう一度やりたくなるか（★2 燃料30%・★3 PERFECT を狙いたくなるか）。
