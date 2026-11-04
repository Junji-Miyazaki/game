// 試作ページの入口。ミッション本体は 02_src/expedition/m4_comet.js（本編と共通）。調整パネル・?test=1 の自動テストはこのページだけ。
import { create } from '../../../02_src/expedition/m4_comet.js?v=46e3c2b9a4';

const lab = create({ canvas: document.getElementById('c') });
if (new URLSearchParams(location.search).get('test') === '1') import('./autotest.js?v=65add40752').then((mod) => mod.install(lab));
lab.start();
