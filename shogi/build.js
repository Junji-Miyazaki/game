// build: 02_src を結合して shogi.bundle.js を生成し、index.html の参照に
// 内容ハッシュ(?v=sha1先頭10桁)を刻む(キャッシュ対策、LANDER方式)。冪等。
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = __dirname;
const ORDER = ["engine.js", "sfx.js", "music.js", "ui.js", "main.js"];

const bundle = ORDER.map(f => {
  const p = path.join(ROOT, "02_src", f);
  return `/* ===== ${f} ===== */\n` + fs.readFileSync(p, "utf8");
}).join("\n");
fs.writeFileSync(path.join(ROOT, "shogi.bundle.js"), bundle);

const h = s => crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);
const bh = h(bundle);
const ch = h(fs.readFileSync(path.join(ROOT, "03_assets", "style.css"), "utf8"));
const ip = path.join(ROOT, "index.html");
let html = fs.readFileSync(ip, "utf8");
html = html.replace(/shogi\.bundle\.js\?v=[0-9a-z]+/, "shogi.bundle.js?v=" + bh)
           .replace(/style\.css\?v=[0-9a-z]+/, "style.css?v=" + ch);
fs.writeFileSync(ip, html);
console.log("built bundle v=" + bh + " css v=" + ch);
