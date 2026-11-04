// 試作ページの入口。ミッション本体は 02_src/expedition/m2_enceladus.js（本編と共通）。調整パネル・?test=1 の自動テストはこのページだけ。
import { create } from '../../../02_src/expedition/m2_enceladus.js?v=c88f58267b';

const lab = create({ canvas: document.getElementById('c') });
if (new URLSearchParams(location.search).get('test') === '1') import('./autotest.js?v=71edaca025').then((mod) => mod.install(lab));
lab.start();
