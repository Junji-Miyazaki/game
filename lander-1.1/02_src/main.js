// LANDER — エントリポイント（単独ゲーム）
import { Engine } from './core/engine.js';
import { BootScene, TitleScene, restoreMute, fadeInScene } from './title.js';
import { Game } from './game.js';
import { Music } from './music.js';

window.addEventListener('load', () => {
  const canvas = document.getElementById('screen');
  const engine = new Engine(canvas);

  // 生成音楽/効果音: engine.audio の AudioContext を共有（初回タップ後に生成される）。ミュートは保存値を復元
  Music.attach(engine.audio);
  restoreMute(engine);

  // 単独ゲームの遷移：BACK/ゲームオーバー→タイトル、タイトル→(発射)→ゲーム
  const toTitle = () => engine.changeScene(new TitleScene(engine, startGame, { launch: true }));
  const startGame = () => engine.changeScene(fadeInScene(new Game(engine), 0.8));
  engine.toMenu = toTitle;

  // 起動時だけ「TAP TO BEGIN」を挟む（最初のタップで音声を有効化→タイトルは表示と同時に曲が鳴る）。
  // ゲームからタイトルへ戻るときは音声が有効なので直接タイトルへ。
  engine.start(new BootScene(engine, toTitle));
});
