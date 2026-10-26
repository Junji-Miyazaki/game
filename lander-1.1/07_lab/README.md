# 07_lab — 実験用ページ（ゲーム本体には未統合）

読み取りのみで `02_src/` を import する。開発サーバ: preview 設定 `lander-1.1`（`node server.js`, port 4177）。
サーバはディレクトリの index を返さないので、`index.html` まで URL に書く。

| ページ | URL | 内容 |
|---|---|---|
| solar_map | http://localhost:4177/07_lab/solar_map/index.html | v1.1 太陽系マップ画面のアニメーション方向性比較（A 静かな軌道図 / B レトロフューチャー計器 / C かわいいおもちゃ箱）。上部ボタンでスタイル切替、reduce motion・faces・ticks（効果音）トグル、`replay unlock`（★ポップ+旗の演出を再生）、`replay intro`、`reset`。 |
| boot_backdrop | http://localhost:4177/07_lab/boot_backdrop/index.html | v1.1 起動画面(TAP TO BEGIN)の背景比較（A 星の視差+流れ星+ロゴ呼吸 / B 暗い太陽系+スクリム）。`?v=A|B&reduce=1`、上部ボタンで切替・reduce motion。 |

solar_map の診断用 URL パラメータ: `?style=A|B|C|D（既定D）&skip=1（イントロ省略）&view=jupiter（ズーム状態で開始）&reduce=1&faces=1`。
ブラウザコンソールから `window.__lab`（`gotoSys('saturn')`, `selectBody('io')`, `state` など）で操作可能。
