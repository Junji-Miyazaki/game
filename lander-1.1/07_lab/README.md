# 07_lab — 実験用ページ（ゲーム本体には未統合）

読み取りのみで `02_src/` を import する。開発サーバ: preview 設定 `lander-1.1`（`node server.js`, port 4177）。
サーバはディレクトリの index を返さないので、`index.html` まで URL に書く。

| ページ | URL | 内容 |
|---|---|---|
| solar_map | http://localhost:4177/07_lab/solar_map/index.html | v1.1 太陽系マップ画面のアニメーション方向性比較（A 静かな軌道図 / B レトロフューチャー計器 / C かわいいおもちゃ箱）。上部ボタンでスタイル切替、reduce motion・faces・ticks（効果音）トグル、`replay unlock`（★ポップ+旗の演出を再生）、`replay intro`、`reset`。 |
| boot_backdrop | http://localhost:4177/07_lab/boot_backdrop/index.html | v1.1 起動画面(TAP TO BEGIN)の背景比較（A 星の視差+流れ星+ロゴ呼吸 / B 暗い太陽系+スクリム）。`?v=A|B&reduce=1`、上部ボタンで切替・reduce motion。 |
| expedition #1 | http://localhost:4177/07_lab/expedition/01_sample_return/index.html | v1.2 EXPEDITION 試作（共通試作台・共通シェル 00_harness + #1 PHOBOS SAMPLE RETURN）。詳細は expedition/README.md。 |
| expedition #2 | http://localhost:4177/07_lab/expedition/02_geyser_run/index.html | #2 ENCELADUS GEYSER RUN（噴気の力・試料・パッドのロック）。同上。 |

solar_map の診断用 URL パラメータ: `?style=A|B|C|D（既定D）&skip=1（イントロ省略）&view=jupiter（ズーム状態で開始）&reduce=1&faces=1`。
ブラウザコンソールから `window.__lab`（`gotoSys('saturn')`, `selectBody('io')`, `state` など）で操作可能。

## キャッシュ対策（コミット前に必須）
GitHub Pages は max-age=600 で配信するため、更新後もスマホが古い .js を掴み続ける。lab の .html/.js が参照する相対の .js/.css（`02_src/` への import を含む）に `?v=<内容ハッシュ>` を刻む:

    node 07_lab/stamp.js      # lab を変更したらコミット前に実行（依存順に固定点まで反復。冪等）

外部URLは触らない。`02_src/` 側の内部 import（art.js → palette.js など）は編集対象外なので刻まれない（lab 側の入口 URL のハッシュは import 先の変更を含めて計算するため、更新自体は反映される）。
