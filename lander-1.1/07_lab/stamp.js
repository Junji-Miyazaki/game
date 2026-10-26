#!/usr/bin/env node
// 07_lab の .html/.js が参照する「相対の .js/.css」に ?v=<対象ファイルの内容ハッシュ> を刻む（キャッシュ対策）。
// 依存順に固定点まで繰り返す（最大6回）ので、import 先のハッシュ変化が上流へ伝わる。外部URLは触らない。
// 使い方: node 07_lab/stamp.js   （lab を変更したらコミット前に実行）
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = __dirname;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(html|js)$/.test(e.name) && e.name !== 'stamp.js' ? [path.join(d, e.name)] : []);
// 参照パターン: import/export ... from '…' ・ import('…') ・ import '…' ・ src="…" ・ href="…"
const RE = /((?:from\s*|import\s*\(\s*|import\s+|(?:src|href)\s*=\s*)(["']))((?![a-z][a-z0-9+.-]*:|\/)[^"'?#]+\.(?:js|css))(\?v=[0-9a-f]+)?(\2)/g;
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const cache = new Map();
// ファイルのハッシュ = 自身の内容 + 相対 import 先（再帰）のハッシュ。07_lab 外のファイルは書き換えず、ハッシュ計算にだけ使う
function hashOf(f, stack = []) {
  if (cache.has(f)) return cache.get(f);
  if (stack.includes(f) || !fs.existsSync(f)) return '0000000000';
  const src = fs.readFileSync(f, 'utf8'), deps = [];
  if (f.endsWith('.js')) src.replace(RE, (m, pre, q, rel) => { deps.push(hashOf(path.resolve(path.dirname(f), rel), [...stack, f])); return m; });
  const h = sha(src.replace(/(\.js|\.css)\?v=[0-9a-f]+/g, '$1') + deps.join(''));   // 自身の ?v= 値には依存しない
  cache.set(f, h); return h;
}
let changed = 0;
for (let pass = 1; pass <= 6; pass++) {
  cache.clear(); let n = 0;
  for (const f of walk(ROOT)) {
    const src = fs.readFileSync(f, 'utf8');
    const out = src.replace(RE, (m, pre, q, rel, old) => {
      const abs = path.resolve(path.dirname(f), rel);
      if (!fs.existsSync(abs)) { console.warn('missing:', path.relative(ROOT, f), rel); return m; }
      return pre + rel + '?v=' + hashOf(abs) + q;
    });
    if (out !== src) { fs.writeFileSync(f, out, 'utf8'); n++; }
  }
  changed += n; if (!n) { console.log('stamp: stable after pass ' + pass + ' (' + changed + ' file writes)'); process.exit(0); }
}
console.error('stamp: not converged'); process.exit(1);
