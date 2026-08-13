# P3 独立第三者レビュー — METEOR // PROTOCOL

対象コミット: `5ea227a` (P0 scaffold) / `6bc2ed5` (P1 gameplay) / `b336e01` (P2 visual reskin)
対象ファイル: `meteor/js/game.js` (3333行), `meteor/js/core/*`, `meteor/js/title.js`, `meteor/js/main.js`, `meteor/build.js`, `meteor/index.html`
レビュー方式: 実装者の報告は参照せず、ソース精読 + ヘッドレス実機実行（実 `Engine` + 実 `Game` + save/restore を実装したスタブ Canvas）で検証。
実行規模: 約 10 万フレーム相当（ランダム入力ラン、無入力ラン、標的シナリオ 20 本）。

---

## VERDICT: **FIX FIRST**（軽微・低リスクな2件のみ。クラッシュ・進行不能・支配戦略は無し）

クラッシュ安全性・$経済の単一付与・auto フラグ伝播・`enter()` の状態リセット・CHAIN 上限・バンドル鮮度・ストレージ接頭辞は**すべて合格**。
ただし新規 P1 システム（ライブショップ）に、**プレイヤーの $ が意図と違う商品に消える**確定バグが2件ある。いずれも修正は数行で、`FIX FIRST` としたのは「今回の審査対象がまさに $ 経済の正しさ」であるため。この2件を直せば SHIP 可。

---

## CONFIRMED DEFECTS

### D1 — ショップの当たり判定がスライドアニメを無視しており、**見えているボタンと違う商品を買う**
**Severity: Medium**（誤購入で $ が失われる。価格エスカレーションのため取り返しがつかない）

| | |
|---|---|
| 判定矩形 | `meteor/js/game.js:1874-1884` `_shopBtnRect()` — 常に**全開位置**を返す（`_shopSlide` 非参照） |
| 描画位置 | `meteor/js/game.js:1988-1991` `_drawShop()` — `ctx.translate(0, SHOP_PANEL_H * (1 - slide))` で**ずらして描く** |
| 入力分岐 | `meteor/js/game.js:839-846` `onInput()` — `this.shopOpen`（論理フラグ）だけで判定し、`_shopSlide`（視覚状態）を見ない |

ドロワーのスライドは `game.js:975-979` の `dt * 6` で **0→1 に約167ms**（フレームレート非依存）。この間、描画は `offset` ぶん下にずれるが、ヒットテストは全開位置のまま。

**失敗シナリオ A（開く途中・誤購入）**
1. SHOP タブをタップ → `shopOpen = true`、`_shopSlide` が 0 から増え始める
2. 167ms 以内に、画面に見えている「AUTO TURRET」（左上ボタン）をタップ
3. `_shopTap()` は全開座標で解決するため **row 2（BIG CHARGE / REPAIR CITY）が購入される**

実測（`_shopSlide = 0.5` の時点、ヘッドレス実行で再現）:

```
T6  slide=0.25: ユーザーが見ている AUTO TURRET は y≈642 → ヒット行 -1（デッドゾーン、無反応）
T6  slide=0.50: ユーザーが見ている AUTO TURRET は y≈597 → ヒット行 2（別商品）
T6  slide=0.75: ユーザーが見ている AUTO TURRET は y≈552 → ヒット行 1（別商品）

T6'  「AUTO TURRET」と表示されたピクセルをタップ → turrets 0->0, bigCharges 0->1, money -50
     *** BIG CHARGE を買わされた ***
T6'' 「TURRET LV+」（タレット0本で非活性表示）と表示されたピクセルをタップ → repair 0->1, money -120
     *** REPAIR CITY を買わされた ***
```

2例目が特に悪い。**非活性（dim）に見えているボタンをタップして $120 の REPAIR CITY が成立する**ため、プレイヤーには「押せないはずのものを押したら金が消えた」としか見えない。

**失敗シナリオ B（閉じる途中・タップ貫通）**
`shopOpen = false` になった瞬間からパネルはまだ約167ms 描画され続けるが、`onInput` の `if (this.shopOpen)` が偽になるため、**見えているパネルを貫通して `_fireMissile()` に落ちる**。

```
T8 閉じかけのパネル(y=500)をタップ: missiles 0 -> 1（パネルを貫通して発射）
```
BIG が arm 済みだと BIG チャージを1つ消費する（`game.js:865-867`）。シナリオ A より実害は小さい（「タップした所に撃つ」は概ね意図通り）が、根本原因は同じ。

**修正**（両シナリオ共通・入力を `shopOpen` ではなく `_shopSlide` に従わせる）
```js
// onInput: 論理フラグではなく視覚状態でキャプチャする
if (this._shopSlide > 0.02) {              // ← this.shopOpen から変更
  if (data.y >= H - SHOP_PANEL_H * this._shopSlide) {
    if (this._shopSlide > 0.98) this._shopTap(data.x, data.y);  // 全開時のみ購入成立
    else this.shopOpen = false;             // アニメ中は無反応 or 閉じるだけ
  } else {
    this.shopOpen = false;
  }
  return;
}
```
より単純な代替: `_shopBtnRect()` の `y` に `SHOP_PANEL_H * (1 - this._shopSlide)` を加算し、かつ `_shopTap()` の冒頭で `if (this._shopSlide < 0.98) return;` を入れる（描画と判定を単一の式に統一する方が望ましい）。

---

### D2 — TURRET LV+ が後から買ったタレットに継承されず、ショップの Lv 表示も嘘になる
**Severity: Low-Medium**（$ の効果が消える + HUD が事実と異なる）

| | |
|---|---|
| 新規タレット | `meteor/js/game.js:1914-1918` — `cooldown: 0.5, level: 1` で固定生成 |
| LV+ 購入 | `meteor/js/game.js:1926-1927` — `this.shop.lv++; for (const t of this.turrets) if (t) t.level++;`（**購入時点で存在するタレットのみ**） |
| 表示 | `meteor/js/game.js:2047` — `sub = 'Lv' + this.turrets[0].level;`（**0番だけ**） |

**失敗シナリオ**
1. AUTO TURRET を1本購入（$60）
2. TURRET LV+ を5回購入（$45→$72→$99→$126→$153 = $495）
3. 2本目の AUTO TURRET を購入（$140）→ **Lv1 で出てくる**

実測:
```
T7 5x LV+ 後に2本目を購入したときのタレットレベル: 6,1
   ショップパネルの表示: Lv6
   次の tlv 価格: $180
```
2本目を Lv6 に揃えるには、既にエスカレートした価格で LV+ を5回買い直す必要がある（`SHOP_TLV_BASE * (1 + 0.6 * s.lv)` は購入回数で単調増加）。さらに**パネルは Lv6 と表示し続ける**ため、プレイヤーは3本すべてが Lv6 だと誤認する。`_turretCd()` / `_turretDmg()` は個別の `t.level` を見るので、実効性能は表示より低い。

**修正**
```js
// game.js:1916 — ショップで支払い済みのレベルを継承させる
cooldown: 0.5, level: 1 + (this.shop.lv | 0),
```
表示側（`game.js:2047`）は継承させれば `turrets[0].level` で正しくなるが、より堅くするなら最小レベルを表示する:
```js
else if (it.id === 'tlv' && this.turrets.length > 0)
  sub = 'Lv' + Math.min(...this.turrets.map(t => t.level));
```

---

## 合格した検証項目（証跡付き）

### 1. クラッシュ安全性 — 合格
実 `Engine` + 実 `Game` をヘッドレスで駆動し、`update()`/`render()`/`onInput()` の例外を全捕捉。**例外ゼロ**。

| シナリオ | 内容 | 結果 |
|---|---|---|
| A | 360秒のランダム乱打（sky/city/BIG/shop/card タップ、$ 無限）| stage 5 到達、例外0 |
| B1 | タレット3本 + **隕石ゼロ** 5秒 | `_turretPickTarget()` → `null` → `cooldown 0.12` で正常待機 |
| B2 | タレット3本 + **全隕石がアイテム隕石** 6.7秒 | アイテムは除外され `null` 扱い、例外0 |
| B3 | タレット3本 + **画面外のボスのみ** 10秒 | 例外0（下記のとおり命中もする） |
| C | 所持金0での全商品購入 / 全都市生存で REPAIR / 満タンで BIG / 上限超え TURRET / 5都市全滅→8回 REPAIR | すべてガードが機能、**$ が負にならない**、都市は5で頭打ち |
| D | 全都市破壊 → 発射 → 死亡 → リトライ | `_fireMissile` は `cityIdx < 0` で早期 return、例外0 |
| E | CHAIN3/SHOCK3/DMG5 で40隕石にBIG起爆 | 同時爆発37、例外0 |
| K | **完全無入力** 531秒（全都市喪失まで） | 例外0 |
| 敵対ピーク | 全アップグレードで200秒 | meteors 28 / blasts 93 / missiles 10 / floaters 44 / debris 56 / hitBlastIds 6 |

**Canvas 状態リーク: ゼロ。** スタブ Canvas に本物の save/restore スタックを実装し、毎フレーム終了時に検査:
- `save()`/`restore()` の不均衡: 0（`restore()` アンダーフローも0）
- `globalAlpha` リーク: 0
- **`shadowBlur` リーク: 0**（25箇所すべて `restore()` か明示的な `= 0` で回収されている）
- `globalCompositeOperation` リーク: 0
- `setLineDash` リーク: 0

blast の `kind` / `age` / `chainDepth` / `chainBudget` の受け渡しも、`_spawnBlast`（`kind: 'manual'|'big'`）・`_spawnExtraBlast`（`'chain'|'shock'`）・`_spawnTurretBlast`（`'turret'`）の3経路すべてで初期化されており、`_blastColor()` は `default` で保険もある。star/planet/skyline/floater 描画も例外・リークなし。

### 2. $ 経済の正しさ — 合格
**全撃破経路で $ はちょうど1回だけ付与される**（重複付与も欠落もなし）。

```
T4' manual  : 10体撃破 → $10 （期待 10）OK
T4' scatter : 10体撃破 → $10 （期待 10）OK   ← 7発同時爆発でも二重付与なし
T4' big     : 10体撃破 → $10 （期待 10）OK
T4' shock   : 10体撃破 → $40 （期待 40）OK   ← 巨大隕石 $4
T4' chain   : 10体撃破 → $10 （期待 10）OK
T4' turret  : 10体撃破 → $10 （期待 10）OK   ← タレットでも満額
```
構造上も安全: `m.hitBlastIds` で1爆発1回に制限され、`hp <= 0` になった瞬間に `meteors.splice()` されるため、同一フレームに複数爆発が重なっても撃破イベントは1回。

**タレットキルの経済（半減スコア / コンボ・REROLL なし / $ 満額）— 合格**
```
T1' 手動  : score 11 （= round(10 × combo倍率1.1)）, $1, combo 1
T1' タレット: score  5 （= round(10 × 1.0 × 0.5)）, $1, combo 0
```
**タレットキルから派生した CHAIN 爆発にも auto フラグが伝播している**ことを実測で確認（`game.js:1317-1321` の `auto: isAuto`）:
```
T2 タレット爆発 → 8体撃破（連鎖経由含む）→ combo 0, REROLL 0, 連鎖爆発3個すべて auto=true
T3 手動爆発   → 8体撃破（連鎖経由含む）→ combo 8（手動は従来どおり影響なし）
```
SHOCKWAVE 側（`game.js:1278`, `1327`）にも同じ `auto: isAuto` が渡っている。

**ショップ購入経路 — 合格**（D1 の座標ズレを除く）
価格エスカレーション（`tlv` = ×(1+0.6n)、`reload`/`radius` = ×1.6^n、`repair` = ×1.8^n、`turret` = 60/140/300、`big` = 50固定）はすべて `_shopPrice()` に集約。`_shopBuy()` は全ケースで**減算より前に**前提条件を検査して return する（`turret`:1911、`tlv`:1924、`big`:1949、`repair`:1962）ため、$ が負になる経路は存在しない（10万フレームの実測でも負値ゼロ）。カード表示中は `onInput` が `_cardChoice` ブランチで先に return するため購入不能、かつステージクリア時に `shopOpen = false; _shopSlide = 0`（`game.js:1082-1083`）で強制的に閉じられる。

### 3. `enter()` の状態リセット — 合格（漏れなし）
ゲームオーバー後のリトライ（`onInput` → `this.enter()`）で P1〜P3 の新規状態がすべて初期化されることを実測:
```
D: money 0 / turrets 0 / shopOpen false / shop {lv:0,reload:0,radius:0,repair:0}
   _shopCdMult 1 / _shopRadiusMult 1 / _shopSlide 0 / rerolls 1 / banishes 0 / banned 0
   overdrive false / bigCharges 3 / slots 2 / scatter 0 / rapid 0 / stage 0 / score 0
   run 全10項目 0
T12: ショップ全開のまま全都市喪失 → 死亡描画OK → リトライで shopOpen false / slide 0 / money 0
```

### 4. 入力の競合 — 合格（D1 を除く）
矩形の重なりを実測で総当たり確認、**重複ゼロ**:
```
BIG {x:132,y:44,w:112,h:28} / SHOPタブ閉 {x:115,y:622,w:130,h:18} / SHOPタブ開 {x:115,y:442,w:130,h:18}
都市ヒット箱 {x:16,y:574,w:36,h:30} / BACK {x:6,y:8,w:42,h:36}
big/tabClosed=false  big/tabOpen=false  big/back=false
city/tabClosed=false city/tabOpen=false back/tabClosed=false
```
- ショップを閉じるタップで発射しない（`game.js:843` で `return`）— 二重発火なし
- ショップタブ600回連打 + 毎フレーム更新 → 例外なし、状態は整合（`shopOpen false / slide 0.000`）
- `blocksBack()` はカード表示中 true を返し、Engine 側は BACK ボタンの**描画も判定も**止める（`engine.js:91`, `105-110`）。カード中の `back` で脱出できないことを実測確認
- ラン中の BACK → `toMenu()` は1回だけ発火し、シーン離脱後に走る非同期はオーディオの `setTimeout` ビープのみ（`audio.js:sequence`）。`requestAnimationFrame` は Engine が単一保持しており、stale タイマーは残らない

### 5. CHAIN 上限 — 合格
`b.chainBudget` は**ルート爆発ごと**に遅延生成され（`game.js:1312`）、子爆発に同一オブジェクト参照が渡される（`chainBudget: budget`）。グローバル共有でもフレーム毎リセットでもない。
```
T5 独立した2ルートを同一フレームに起爆 → 連鎖爆発は合計6個（= 3/ルート、上限どおり）
E  観測された最大 chainDepth = 2（CHAIN_MAX_DEPTH どおり、深度2の爆発からは連鎖しない）
```
半径減衰 `CHAIN_R_DECAY 0.65 ^ depth` も `game.js:1316` で適用済み。

### 6. ビルド / バンドル / 残骸 — 合格
- `node build.js` 再生成 → コミット済み `js/meteor.bundle.js` と**バイト単位で一致**（122,709 bytes、`diff -q` 差分なし、`git status` clean）
- 構文チェック: ES モジュール7本を `node --input-type=module --check`、`bundle`/`build.js`/`server.js` を `node --check` → **全通過**
- `index.html` は `js/meteor.bundle.js` のみ読み込み（ES モジュールの二重読み込みなし）
- **`window.__debugGame` は存在しない**。`__debug` / `debugGame` / `console.log` の残骸ゼロ（`build.js` のビルドログと `server.js` の起動ログのみ、いずれも Node 側で正当）
- ストレージ接頭辞は `meteor.`（`core/storage.js:2`）。MICRO ARCADE は `microarcade.` のため、`meta.id` が両方 `'meteor'` でもキーは `meteor.high.meteor` / `microarcade.high.meteor` に分離され**衝突しない**

### 7. ボスまわり — 合格
`_bossIdx` の補正は splice する全4箇所（`game.js:1103-1105`, `1122-1124`, `1223`, `1331`）で漏れなく行われている。`_drawBossHPHud` は `_bossAlive`・`_bossIdx >= 0`・`boss` の3重ガード付き。
なお「降下中のボスにタレットが無駄弾を撃つのでは」という懸念は**実測で否定**された。ボスは r=150〜185 と巨大なため、迎撃点が `iy >= 8` にクランプされても爆発はボス本体に届く:
```
BOSS/TURRET: hp 16 → 撃破 / 初ダメージは3.3秒後（ボス中心 y ≈ -139、まだ大半が画面外）
```

---

## MINOR NOTES（実害なし・任意対応）

1. **毎フレームのグラデーション生成** — `game.js:3177` `_drawBackground()` が `createLinearGradient` を毎フレーム1回呼ぶ（実測 1.00/frame）。背景は静的なので `enter()` で1度作ってキャッシュ可能。ループ内生成ではないので緊急性は低い。
2. **描画中の配列アロケーション** — `game.js:2400` `this.blasts.filter(...)`（毎フレーム）、`game.js:2815` `this.cities.filter(...)`、`game.js:3080`/`3097` `Math.max(...buffs.map(...))`、`game.js:2011` `_shopItems()`（ショップ開時は毎フレーム6オブジェクト生成）。いずれも小さいが GC 圧の常時発生源。
3. **同時爆発ピーク93** — 全アップグレード時の敵対シナリオで観測。`drawAllBlastsSpeckle` は 20個超でグローを落とす保険がある（`game.js:416`）が、93個 × 約9パス ≈ 830 path/frame になる。低スペック端末で確認する価値あり。パーティクル数自体は爆発あたり 5〜10 の固定で無制限ではない。
4. **コメントの記述ずれ**（動作影響なし）
   - `game.js:1153` 「CT半減とスコア×2が効く」— スコア×2 は `03d3a3e` で廃止済み
   - `game.js:674` 「MIN_DRAWABLE_POOL(3)」— 実際の定数は 5（`game.js:88`）
5. **破壊された都市のバフが凍結する** — `updateCityBuffs` は生存都市にしか走らない（`game.js:1004-1006`）ため、破壊時点の POWER/WIDE スタックが残る。飛翔中のミサイルは `cityIdx` 経由でそのバフを参照して起爆する。REPAIR CITY は `makeCityBuffs()` で明示的にクリアする（`game.js:1966`）ので復旧側に持ち越しはない。実害は無視できる。
6. **タレットの巻き込みアイテム回収** — `_turretPickTarget()` はアイテム隕石を狙わない（`game.js:1668`）が、タレット爆発の範囲に入れば `_collectItem()` が走り、アイテム効果と $3 が入る。仕様意図なら問題なし。
7. **`_turretFire` の空振り** — 標的が砲塔と同一座標（`d < 1`）だと `false` を返すが、`_updateTurrets`（`game.js:1723-1724`）は戻り値を見ずに満額クールダウンを設定する。到達困難な縮退ケース。
8. **BANISH のソフトロック無し（確認済み）** — `MIN_DRAWABLE_POOL = 5` により BAN は実質最大4回。差し替えプールは常に3枚以上残るため `cc.cards` が空になる経路（`game.js:717` の splice フォールバック）には到達しない。実測でも 4 個 BAN（mspd/dmg/cd/coin）後は POOL LIMIT で拒否され、カードは常に3枚を維持した。
9. **ステージ0が非常に寛容** — **完全無入力**で 531秒（8.9分）生存し、その間ステージ0を抜けられなかった。+50% ペース後でも序盤の落下時間は十分長く（通常隕石 3〜7.5 px/s ≒ 85〜213秒、FAST でも約25秒）、「素手でステージ0-1が生存可能か」は明確に Yes。むしろ序盤の間延びが気になる水準で、ボス撃破待ちで1ステージ3分超になり得る。バランス調整の余地であり欠陥ではない。

---

## EXPLOIT ANALYSIS

### REPAIR CITY × OVERDRIVE の循環 — **支配戦略ではない（対応不要）**

意図的に都市を1つまで減らして OVERDRIVE（CT×0.5、下限0.12s）を維持し、クリア直前に REPAIR で都市数を戻す戦略を検討した。

**実測値**
```
J: OVERDRIVE 時 CD 0.225s / 通常 0.450s（= 発射レート2倍）
   REPAIR 価格: $120 / $216 / $389 / $700 / $1260（shop.repair でグローバルにエスカレート）
   REPAIR で2都市に戻すと同一フレームで overdrive が false に落ちる（毎フレーム再計算、game.js:1154-1167）
```

**スコア収支**（`game.js:1040-1044`）

| 戦略 | クリア時ボーナス |
|---|---|
| 5都市維持 | 100 + stage×50 + **150×5 = 750** |
| 1都市（OVERDRIVE クリア）| 100 + stage×50 + 150 + **300 = 450** |

意図的に都市を捨てる戦略は**ステージあたり 300 点の純損**。加えて `_cityLostThisStage` が立つため **BANISH +1 を毎ステージ失う**（`game.js:1073`）。
`odBonus` と大きな `cityBonus` は**同時に取れない**（どちらもクリア判定と同一フレームに `aliveCities` から算出され、`overdrive` は「ちょうど1都市」でしか true にならない）ため、循環による二重取りは構造的に不可能。

**「クリア直前に修理して都市ボーナスだけ回収する」変種**も成立しない:

| 修理数 | コスト | 得られる cityBonus | OVERDRIVE維持時(450)との差 |
|---|---|---|---|
| 1都市→2 | $120 | 300 | **−150点** かつ $120 損 |
| 1都市→3 | $336 | 450 | ±0点 で $336 損 |
| 1都市→5 | $1,425 | 750 | +300点 に $1,425 |

1ステージの $ 収入は概算 60〜120（キル $1〜4 + クリア $10+stage×2）なので、$1,425 は**10ステージ分以上の全収入**に相当し、その $ はタレット（$60/140/300）に使えなくなる。**割に合わない。**

さらにリスク側:
- `_spawnMeteor`（`game.js:1461-1468`）は 70% の確率で**生存都市を狙う**。都市が1つなら全隕石の7割がその1点に集中し、1発の漏れが即ゲームオーバー
- 発射台が1箇所になるため、画面端への迎撃は飛翔時間が伸び、実効的な迎撃力は名目の2倍レートほど上がらない
- OVERDRIVE はタレットの CD（`_turretCd`、`game.js:1648`）には**一切影響しない**ため、自動火力との相乗もない

結論: OVERDRIVE の CT 半減は「腕で凌げるなら得られる逆転ボーナス」として設計どおりに機能しており、`03d3a3e` でスコア×2 を撤廃した判断は正しい。**悪用可能な循環は存在しない。**

### その他の悪用経路 — いずれも成立せず

- **$ の水増し**: 収入源はキル・アイテム・クリアの3つのみで、全経路で単一付与を実測確認（上記 T4'）。ショップ購入は全経路で減算前にガード。負値到達なし。
- **タレット放置ファーム**: タレットキルは $ 満額だがスコア半減・コンボ非加算。$ 最大化と**スコア最大化がトレードオフ**になっており、意図した設計どおり。連鎖経由でも auto が伝播するため抜け道なし。
- **REROLL ファーム**: `_comboRewarded` はコンボ切れでリセットされるため繰り返し獲得可能だが、`REROLL_CAP = 3` で頭打ち、消費はカード画面のみ。無意味。
- **BANISH による RARE 固定**: `MIN_DRAWABLE_POOL = 5` と「`slots` を常に除外して保守的に数える」実装（`game.js:685-689`）により、BAN 可能回数は実質4回。COMMON 全消しによる RARE 3枚固定は成立しない（`03d3a3e` の X4 対策が有効に機能していることを実測で確認）。
- **カード凍結中の抜け道**: `update()` はカード表示中スポーン・隕石・ミサイル・爆発・`_elapsed` をすべて停止し（`game.js:950-963`）、進むのは演出タイマーのみ。ショップは強制クローズ。凍結を利用した稼ぎは不可能。

---

## 検証環境メモ

ヘッドレス実行は実 `Engine` / 実 `Game` をそのまま `import` し、`window` / `document` / `localStorage` / `requestAnimationFrame` をスタブ化。Canvas2D スタブには**本物の save/restore 状態スタック**を実装し、毎フレーム終了時に `globalAlpha` / `shadowBlur` / `globalCompositeOperation` / `lineDash` / スタック深度を検査した。ソースは一切変更していない（`git status` で `meteor/` 配下に差分なしを確認済み。本レビュー文書のみ新規追加）。
