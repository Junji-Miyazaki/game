// main.js — bootstrap: title screen → Game.
import { Game } from './game.js';

const game = new Game();
window.SHINSOKU = game; // dev handle
const title = document.getElementById('title');

document.getElementById('startBtn').addEventListener('click', () => {
  title.style.display = 'none';
  game.start();
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('セーブデータを消去しますか？')) {
    localStorage.removeItem('shinsoku_save_v1');
    location.reload();
  }
});
