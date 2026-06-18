// エントリポイント。エンジンを起動し、全ゲームを登録してメニューを表示する。
import { Engine } from './core/engine.js';
import { MenuScene } from './menu.js';

// 各ゲーム（meta + Game）。新しいゲームはここに import を1行足すだけで追加できる。
import * as rogue from './games/rogue.js';
import * as binary from './games/binary.js';
import * as hack from './games/hack.js';
import * as snake from './games/snake.js';
import * as beeper from './games/beeper.js';

const GAMES = [rogue, binary, hack, snake, beeper].map(m => ({ meta: m.meta, Game: m.Game }));

window.addEventListener('load', () => {
  const canvas = document.getElementById('screen');
  const engine = new Engine(canvas);

  // メニュー／ゲーム間の遷移ヘルパーをエンジンに生やす
  engine.toMenu = () => engine.changeScene(new MenuScene(engine, GAMES));
  engine.startGame = (g) => engine.changeScene(new g.Game(engine));

  engine.start(new MenuScene(engine, GAMES));
});
