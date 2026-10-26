# EXPEDITION 試作（v1.2 R&D）

仕様: `01_docs/EXPEDITION_MISSIONS.md`（正）/ PLAN §7m。ゲーム本体（02_src, 04_tests）・`../lander/` は無変更。サーバ: preview 設定 `lander-1.1`（port 4177）。URL は `index.html` まで書く。

| 試作 | URL | 内容 |
|---|---|---|
| 00_harness | http://localhost:4177/07_lab/expedition/00_harness/index.html | 共通試作台のデモ。API は 00_harness/README.md |
| 01_sample_return | http://localhost:4177/07_lab/expedition/01_sample_return/index.html | #1 PHOBOS SAMPLE RETURN |

## 01 SAMPLE RETURN
流れ: 高所から降下 → 琥珀色の SAMPLE SITE（平ら）に着地 → 2.0 秒静止（円ゲージ。推力を入れる/離陸するとゲージはゼロに戻る）→ SAMPLE ACQUIRED → 離陸 → 左右に往復する母船のドッキング枠（母船の下の点線の輪）へ、枠の中心が半径17px以内・母船との相対速度 ≤10 px/s・傾き ≤20° で入ると完了。
失敗: 墜落（v1.1 と同じ閾値）/ 燃料 0 のまま 2 秒（STRANDED）/ 画面外 / 母船の船体に相対速度 >10 で接触。母船は採取前から飛んでいる（輪は採取後に琥珀色に点灯、枠内で速すぎ・傾きすぎると赤字で理由）。
★: ★1 完了 / ★2 ドッキング時の燃料 ≥30% / ★3 採取した着地が PERFECT。タイマー常時表示。R か RETRY で即やり直し。
速度ベクトル矢印: 採取前は地面に対する速度、採取後は**母船に対する相対速度（REL）**。機首方向の点線が矢印と逆向きなら逆噴射の向き。デバッグで OFF 可。

URL パラメータ（共通 + 固有）: `g=0.04 thrust=5.2 ang=28 damp=0.82 drag=0 fuel=100 rcs=2.5 vec=1` / `ms`（母船の最大速度 px/s, 既定9）/ `ph0`（母船の開始位相 rad, 既定-1.2）/ `hold`（採取秒, 既定2.0）/ `ring`（枠の半径 px, 既定17）/ `dbg=1`（パネル初期表示）/ `test=1`（`window.__auto` の検証用自動操縦。姿勢を理想的に与えるので人間の腕前の保証ではない）。

## 試遊で評価すること（仕様の残す基準）
1. 説明なしで 30 秒以内に何をすればよいか分かるか（画面の英語は冒頭1行と SAMPLE SITE / DOCK の表示のみ）。
2. スマホの3ボタンで無理なく操作できるか（回転が遅い・左ボタンが右回りの規約も含めて）。
3. ツアーの着陸とは違う楽しさがあるか（着陸の後にもう一段あること）。
4. もう一度やりたくなるか（★2 燃料30%・★3 PERFECT を狙いたくなるか）。
