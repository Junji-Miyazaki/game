#!/bin/sh
# 展示用：人物の切り出しの部品を vendor/ に置く（1回だけ、通信のある所で実行）。置いたあとは通信なしで動く。
# 出典とライセンスは 00_log/LOG.md。版を変える時は index.html の MP_VER も合わせる。
set -e
cd "$(dirname "$0")"
V=1.2.2
B="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$V"
M="https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite"
mkdir -p vendor/tasks-vision/wasm vendor/models
curl -fL --retry 2 -o vendor/tasks-vision/vision_bundle.mjs "$B/vision_bundle.mjs"
for f in vision_wasm_internal.js vision_wasm_internal.wasm vision_wasm_module_internal.js vision_wasm_module_internal.wasm; do
  curl -fL --retry 2 -o "vendor/tasks-vision/wasm/$f" "$B/wasm/$f"
done
curl -fL --retry 2 -o vendor/models/selfie_segmenter_landscape.tflite "$M"
echo "$V" > vendor/VERSION
ls -l vendor/tasks-vision vendor/tasks-vision/wasm vendor/models
