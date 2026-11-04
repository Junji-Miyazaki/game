// 試作ページの入口。ミッション本体は 02_src/expedition/m1_phobos.js（本編と共通）。調整パネル・?test=1 の自動テストはこのページだけ。
import { create } from '../../../02_src/expedition/m1_phobos.js?v=c7b4b5f7f3';

const lab = create({ canvas: document.getElementById('c') });
if (new URLSearchParams(location.search).get('test') === '1') import('./autotest.js?v=b92c2829f5').then((m) => m.install(lab));
lab.start();
