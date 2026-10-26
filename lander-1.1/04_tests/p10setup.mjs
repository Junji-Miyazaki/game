// p10touch 用: art.js が letterSpacing 対応ブラウザと判定するよう、import より先にダミーの CanvasRenderingContext2D を置く
globalThis.CanvasRenderingContext2D = class { };
globalThis.CanvasRenderingContext2D.prototype.letterSpacing = '0px';
