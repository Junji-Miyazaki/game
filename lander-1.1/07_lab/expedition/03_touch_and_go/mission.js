// 試作ページの入口。ミッション本体は 02_src/expedition/m3_ryugu.js（本編と共通）。調整パネル・?test=1 の自動テストはこのページだけ。
import { create } from '../../../02_src/expedition/m3_ryugu.js?v=89a4370fa8';

const lab = create({ canvas: document.getElementById('c') });
if (new URLSearchParams(location.search).get('test') === '1') import('./autotest.js?v=62954a6e44').then((mod) => mod.install(lab));
lab.start();
