// METEOR // PROTOCOL — エントリポイント（単独ゲーム）
import { Engine } from './core/engine.js';
import { TitleScene } from './title.js';
import { Game } from './game.js';

window.addEventListener('load', () => {
  const canvas = document.getElementById('screen');
  const engine = new Engine(canvas);

  // 単独ゲームの遷移：BACK/ゲームオーバー→タイトル、タイトル→ゲーム
  const toTitle = () => engine.changeScene(new TitleScene(engine, startGame));
  const startGame = () => engine.changeScene(new Game(engine));
  engine.toMenu = toTitle;   // ゲーム内の「メニューへ」はタイトルに戻る

  engine.start(new TitleScene(engine, startGame));
});
