// グローバル変数
let audioCtx;
let oscillator1, oscillator2;
let gainNode1, gainNode2;
let filter1, filter2;
let delay1, delay2;
let delayGain1, delayGain2;
let lfo;
let lfoGain1, lfoGain2;
let am1, am2;
let amGain1, amGain2;
let isPlaying = false;
let video, canvas, ctx;
let animationId;

// 設定の保存
function saveSettings() {
    const settings = {
        // 一般設定
        isPlaying: isPlaying,
        lastFacingMode: currentFacingMode, // カメラの向きも保存

        // オシレータ1の設定
        osc1: {
            enabled: document.getElementById('osc1-enabled').checked,
            volume: document.getElementById('volume1').value,
            cameraControl: document.getElementById('osc1-camera-control').checked,
            waveType: oscillator1?.currentWaveType || 'sine',
            minFreq: document.getElementById('minFreq1').value,
            maxFreq: document.getElementById('maxFreq1').value,
            sensitivity: document.getElementById('sensitivity1').value,
            minThreshold: document.getElementById('minThreshold1').value,
            maxThreshold: document.getElementById('maxThreshold1').value
        },

        // オシレータ2の設定
        osc2: {
            enabled: document.getElementById('osc2-enabled').checked,
            volume: document.getElementById('volume2').value,
            cameraControl: document.getElementById('osc2-camera-control').checked,
            waveType: oscillator2?.currentWaveType || 'sine',
            minFreq: document.getElementById('minFreq2').value,
            maxFreq: document.getElementById('maxFreq2').value,
            sensitivity: document.getElementById('sensitivity2').value,
            minThreshold: document.getElementById('minThreshold2').value,
            maxThreshold: document.getElementById('maxThreshold2').value
        },

        // エフェクト設定
        effects: {
            lfo: {
                osc1: document.getElementById('lfo-osc1').checked,
                osc2: document.getElementById('lfo-osc2').checked,
                rate: document.getElementById('lfoRate').value,
                depth: document.getElementById('lfoDepth').value
            },
            filter: {
                osc1: document.getElementById('filter-osc1').checked,
                osc2: document.getElementById('filter-osc2').checked,
                freq: document.getElementById('filterFreq').value,
                q: document.getElementById('filterQ').value
            },
            am: {
                osc1: {
                    enabled: document.getElementById('am-osc1').checked,
                    rate: document.getElementById('amRate1').value,
                    depth: document.getElementById('amDepth1').value
                },
                osc2: {
                    enabled: document.getElementById('am-osc2').checked,
                    rate: document.getElementById('amRate2').value,
                    depth: document.getElementById('amDepth2').value
                }
            },
            delay: {
                osc1: {
                    enabled: document.getElementById('delay-osc1').checked,
                    time: document.getElementById('delayTime1').value,
                    feedback: document.getElementById('delayFeedback1').value
                },
                osc2: {
                    enabled: document.getElementById('delay-osc2').checked,
                    time: document.getElementById('delayTime2').value,
                    feedback: document.getElementById('delayFeedback2').value
                }
            }
        },

        // 最後の保存日時
        lastSaved: new Date().toISOString()
    };
    
    localStorage.setItem('thereminSettings', JSON.stringify(settings));
    console.log('Settings saved:', settings);
}


// loadSettings関数も対応して修正
function loadSettings() {
    const savedSettings = localStorage.getItem('thereminSettings');
    if (!savedSettings) return;
    
    const settings = JSON.parse(savedSettings);
    
    // カメラの向きを復元（initVideo関数内で使用）
    currentFacingMode = settings.lastFacingMode || 'user';

    // オシレータ1の設定を適用
    document.getElementById('osc1-enabled').checked = settings.osc1.enabled;
    document.getElementById('volume1').value = settings.osc1.volume;
    document.getElementById('osc1-camera-control').checked = settings.osc1.cameraControl;
    document.getElementById('minFreq1').value = settings.osc1.minFreq;
    document.getElementById('maxFreq1').value = settings.osc1.maxFreq;
    document.getElementById('sensitivity1').value = settings.osc1.sensitivity;
    document.getElementById('minThreshold1').value = settings.osc1.minThreshold;
    document.getElementById('maxThreshold1').value = settings.osc1.maxThreshold;
    
    // オシレータ2の設定を適用
    document.getElementById('osc2-enabled').checked = settings.osc2.enabled;
    document.getElementById('volume2').value = settings.osc2.volume;
    document.getElementById('osc2-camera-control').checked = settings.osc2.cameraControl;
    document.getElementById('minFreq2').value = settings.osc2.minFreq;
    document.getElementById('maxFreq2').value = settings.osc2.maxFreq;
    document.getElementById('sensitivity2').value = settings.osc2.sensitivity;
    document.getElementById('minThreshold2').value = settings.osc2.minThreshold;
    document.getElementById('maxThreshold2').value = settings.osc2.maxThreshold;
    
    // エフェクト設定を適用
    document.getElementById('lfo-osc1').checked = settings.effects.lfo.osc1;
    document.getElementById('lfo-osc2').checked = settings.effects.lfo.osc2;
    document.getElementById('lfoRate').value = settings.effects.lfo.rate;
    document.getElementById('lfoDepth').value = settings.effects.lfo.depth;
    
    document.getElementById('filter-osc1').checked = settings.effects.filter.osc1;
    document.getElementById('filter-osc2').checked = settings.effects.filter.osc2;
    document.getElementById('filterFreq').value = settings.effects.filter.freq;
    document.getElementById('filterQ').value = settings.effects.filter.q;
    
    document.getElementById('am-osc1').checked = settings.effects.am.osc1.enabled;
    document.getElementById('amRate1').value = settings.effects.am.osc1.rate;
    document.getElementById('amDepth1').value = settings.effects.am.osc1.depth;

    document.getElementById('am-osc2').checked = settings.effects.am.osc2.enabled;
    document.getElementById('amRate2').value = settings.effects.am.osc2.rate;
    document.getElementById('amDepth2').value = settings.effects.am.osc2.depth;

    document.getElementById('delay-osc1').checked = settings.effects.delay.osc1.enabled;
    document.getElementById('delayTime1').value = settings.effects.delay.osc1.time;
    document.getElementById('delayFeedback1').value = settings.effects.delay.osc1.feedback;

    document.getElementById('delay-osc2').checked = settings.effects.delay.osc2.enabled;
    document.getElementById('delayTime2').value = settings.effects.delay.osc2.time;
    document.getElementById('delayFeedback2').value = settings.effects.delay.osc2.feedback;
    
    // 波形の設定を適用
    if (oscillator1) {
        setWaveType(oscillator1, settings.osc1.waveType, document.getElementById('osc1-waves'));
    }
    if (oscillator2) {
        setWaveType(oscillator2, settings.osc2.waveType, document.getElementById('osc2-waves'));
    }
    
    // 表示値の更新
    updateAllDisplayValues();
    
    // エフェクト設定を反映
    if (audioCtx) {
        updateEffectRouting();
    }

    console.log('Settings loaded from:', settings.lastSaved);
}

// すべての表示値を更新
function updateAllDisplayValues() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        const valueElement = document.getElementById(slider.id + 'Value');
        if (valueElement) {
            valueElement.textContent = slider.value;
        }
    });
}

// 波形選択のセットアップ関数
function setWaveType(oscillator, type, buttonGroup) {
    if (oscillator) {
        oscillator.type = type;
        oscillator.currentWaveType = type;
        
        buttonGroup.querySelectorAll('.wave-button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.wave === type) {
                btn.classList.add('active');
            }
        });
    }
}

// ビデオ初期化
async function initVideo() {
    video = document.getElementById('video');
    canvas = document.getElementById('overlay');
    ctx = canvas.getContext('2d');

    canvas.width = 320;
    canvas.height = 240;

    // カメラ切り替えボタンを追加
    const cameraButton = document.createElement('button');
    cameraButton.textContent = 'カメラ切り替え';
    cameraButton.id = 'switchCamera';
    document.querySelector('.basic-controls').appendChild(cameraButton);

    let currentFacingMode = 'user';
    
    async function startCamera(facingMode) {
        try {
            if (video.srcObject) {
                const tracks = video.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: facingMode,
                    width: { ideal: 320 },
                    height: { ideal: 240 }
                } 
            });
            video.srcObject = stream;
            await video.play();
            console.log('Video initialized successfully with facing mode:', facingMode);
        } catch (err) {
            console.error('Video initialization failed:', err);
            alert('カメラの初期化に失敗しました。カメラへのアクセスを許可してください。');
        }
    }

    // カメラ切り替えボタンのイベントリスナー
    cameraButton.addEventListener('click', async () => {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        await startCamera(currentFacingMode);
    });

    // 初期カメラ起動
    await startCamera(currentFacingMode);
}

// オーディオ初期化
function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // オシレータ1のセットアップ
        oscillator1 = audioCtx.createOscillator();
        oscillator1.type = 'sine';
        oscillator1.currentWaveType = 'sine';
        gainNode1 = audioCtx.createGain();
        filter1 = audioCtx.createBiquadFilter();
        delay1 = audioCtx.createDelay(1.0);
        delayGain1 = audioCtx.createGain();
        lfoGain1 = audioCtx.createGain();
        amGain1 = audioCtx.createGain();
        
        // オシレータ2のセットアップ
        oscillator2 = audioCtx.createOscillator();
        oscillator2.type = 'sine';
        oscillator2.currentWaveType = 'sine';
        gainNode2 = audioCtx.createGain();
        filter2 = audioCtx.createBiquadFilter();
        delay2 = audioCtx.createDelay(1.0);
        delayGain2 = audioCtx.createGain();
        lfoGain2 = audioCtx.createGain();
        amGain2 = audioCtx.createGain();

        // LFOセットアップ
        lfo = audioCtx.createOscillator();
        lfo.frequency.value = 1;
        
        // AMセットアップ
        am1 = audioCtx.createOscillator();
        am2 = audioCtx.createOscillator();
        am1.frequency.value = 2;
        am2.frequency.value = 2;
        amGain1.gain.value = 1;
        amGain2.gain.value = 1;

        // 初期値設定
        gainNode1.gain.value = 0;
        gainNode2.gain.value = 0;
        filter1.type = 'lowpass';
        filter2.type = 'lowpass';
        filter1.frequency.value = 1000;
        filter2.frequency.value = 1000;
        delay1.delayTime.value = 0.3;
        delay2.delayTime.value = 0.3;
        delayGain1.gain.value = 0.3;
        delayGain2.gain.value = 0.3;
        lfoGain1.gain.value = 0;
        lfoGain2.gain.value = 0;

        // オシレータ1の接続
        oscillator1.connect(filter1);
        filter1.connect(amGain1);
        amGain1.connect(gainNode1);
        gainNode1.connect(delay1);
        gainNode1.connect(audioCtx.destination);
        delay1.connect(delayGain1);
        delayGain1.connect(delay1);
        delayGain1.connect(audioCtx.destination);

        // オシレータ2の接続
        oscillator2.connect(filter2);
        filter2.connect(amGain2);
        amGain2.connect(gainNode2);
        gainNode2.connect(delay2);
        gainNode2.connect(audioCtx.destination);
        delay2.connect(delayGain2);
        delayGain2.connect(delay2);
        delayGain2.connect(audioCtx.destination);

        // LFO接続
        lfo.connect(lfoGain1);
        lfo.connect(lfoGain2);
        lfoGain1.connect(oscillator1.frequency);
        lfoGain2.connect(oscillator2.frequency);

        // AMチェックボックスの状態を確認して初期接続
        if (document.getElementById('am-osc1').checked) {
            am1.connect(amGain1.gain);
        }
        if (document.getElementById('am-osc2').checked) {
            am2.connect(amGain2.gain);
        }

        // オシレータ開始
        oscillator1.start();
        oscillator2.start();
        lfo.start();
        am1.start();
        am2.start();

        // 設定を反映
        updateEffectRouting();

        console.log('Audio initialized successfully');
    } catch (e) {
        console.error('Audio initialization failed:', e);
    }
}

// 閾値コントロールの追加
function addThresholdControls() {
    const controlGroups = document.querySelectorAll('.control-group');
    
    // オシレータ1の閾値コントロール
    const thresholdControls1 = createThresholdControls('1');
    controlGroups[0].insertBefore(thresholdControls1, controlGroups[0].querySelector('.wave-selector'));
    
    // オシレータ2の閾値コントロール
    const thresholdControls2 = createThresholdControls('2');
    controlGroups[1].insertBefore(thresholdControls2, controlGroups[1].querySelector('.wave-selector'));
    
    // 初期値の設定
    document.getElementById('minThreshold1').value = 0;
    document.getElementById('maxThreshold1').value = 255;
    document.getElementById('minThreshold2').value = 0;
    document.getElementById('maxThreshold2').value = 255;
    
    // 値表示の更新
    updateAllDisplayValues();
}

// 閾値コントロールのHTML生成
function createThresholdControls(oscillatorNum) {
    const div = document.createElement('div');
    div.innerHTML = `
        <div class="slider-container">
            <label>最小輝度閾値: <span id="minThreshold${oscillatorNum}Value">0</span></label>
            <input type="range" id="minThreshold${oscillatorNum}" min="0" max="255" value="0">
        </div>
        <div class="slider-container">
            <label>最大輝度閾値: <span id="maxThreshold${oscillatorNum}Value">255</span></label>
            <input type="range" id="maxThreshold${oscillatorNum}" min="0" max="255" value="255">
        </div>
    `;
    return div;
}




// キャンバスのリサイズ関数
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height); // キャンバスをクリア
}

// 初期化時と画面サイズが変わったときにリサイズ
window.addEventListener('load', resizeCanvas);
window.addEventListener('resize', resizeCanvas);
// フレーム処理
let lastNoiseUpdate = 0; // 最後にノイズを更新した時間
const defaultSpeed = 50; // デフォルトのノイズスピード（ミリ秒）

function processFrame() {
    if (!isPlaying) return;

    const currentTime = Date.now();

    // カメラ映像の表示
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const leftData = ctx.getImageData(0, 0, canvas.width / 2, canvas.height);
    const rightData = ctx.getImageData(canvas.width / 2, 0, canvas.width / 2, canvas.height);

    const leftBrightness = calculateAverageBrightness(leftData.data);
    const rightBrightness = calculateAverageBrightness(rightData.data);

    // オーディオパラメータの更新
    updateAudioParams(leftBrightness, rightBrightness);

    // オシレータ1と2の周波数を取得
    const osc1Freq = oscillator1.frequency.value;
    const osc2Freq = oscillator2.frequency.value;

    // ノイズのスピードとドットサイズをオシレータの周波数で調整
    const noiseSpeed = defaultSpeed * (1000 / osc1Freq); // オシレータ1でスピード調整
    const dotSize = 1 + Math.floor((osc2Freq / 2000) * 4); // オシレータ2でドットサイズ調整

    // デフォルトのノイズを細かく設定（音に反応がないとき）
    const defaultDotSize = 1;

    // 一定の間隔ごとにノイズエフェクトを描画
    if (currentTime - lastNoiseUpdate > noiseSpeed) {
        for (let y = 0; y < canvas.height; y += dotSize) {
            for (let x = 0; x < canvas.width; x += dotSize) {
                // 各ドットにランダムな輝度を設定
                const noise = Math.random() * 255;
                ctx.fillStyle = `rgba(${noise}, ${noise}, ${noise}, 0.9)`; // ノイズを半透明に
                ctx.fillRect(x, y, dotSize, dotSize);
            }
        }
        lastNoiseUpdate = currentTime; // ノイズ更新時間をリセット
    }

    // デフォルトの細かいノイズ（最小のドットサイズ）を表示
    for (let y = 0; y < canvas.height; y += defaultDotSize) {
        for (let x = 0; x < canvas.width; x += defaultDotSize) {
            const noise = Math.random() * 300;
            ctx.fillStyle = `rgba(${noise}, ${noise}, ${noise}, 0.05)`;
            ctx.fillRect(x, y, defaultDotSize, defaultDotSize);
        }
    }

    // 次のフレームをリクエスト
    animationId = requestAnimationFrame(processFrame);
}




// 明るさの計算
function calculateAverageBrightness(data) {
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
        total += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return total / (data.length / 4);
}

// 閾値内の明るさを正規化
function normalizeBrightness(brightness, minThreshold, maxThreshold) {
    brightness = Math.max(minThreshold, Math.min(maxThreshold, brightness));
    return (brightness - minThreshold) / (maxThreshold - minThreshold);
}

// 周波数計算（反転）
function calculateFrequency(brightness, minFreq, maxFreq, sensitivity, minThreshold, maxThreshold) {
    const normalized = normalizeBrightness(brightness, minThreshold, maxThreshold);
    const invertedNormalized = Math.pow(1 - normalized, sensitivity / 50);
    return minFreq + (maxFreq - minFreq) * invertedNormalized;
}

// 音量計算
function calculateVolume(brightness, sensitivity, minThreshold, maxThreshold) {
    const normalized = normalizeBrightness(brightness, minThreshold, maxThreshold);
    const volume = Math.pow(normalized, sensitivity / 50);
    return Math.min(volume * 0.5, 0.5);
}

// オーディオパラメータの更新
function updateAudioParams(leftBrightness, rightBrightness) {
    if (!audioCtx) return;

    try {
        // オシレータ1の更新
        if (document.getElementById('osc1-enabled').checked) {
            let freq1, vol1;
            const baseVol1 = parseFloat(document.getElementById('volume1').value) / 100;
            const minThreshold1 = parseFloat(document.getElementById('minThreshold1').value);
            const maxThreshold1 = parseFloat(document.getElementById('maxThreshold1').value);

            if (document.getElementById('osc1-camera-control').checked) {
                freq1 = calculateFrequency(
                    leftBrightness,
                    parseFloat(document.getElementById('minFreq1').value),
                    parseFloat(document.getElementById('maxFreq1').value),
                    parseFloat(document.getElementById('sensitivity1').value),
                    minThreshold1,
                    maxThreshold1
                );
                vol1 = calculateVolume(rightBrightness, document.getElementById('sensitivity1').value, minThreshold1, maxThreshold1) * baseVol1;
            } else {
                freq1 = parseFloat(document.getElementById('minFreq1').value);
                vol1 = 0.5 * baseVol1;
            }

            oscillator1.frequency.setValueAtTime(freq1, audioCtx.currentTime);
            gainNode1.gain.setValueAtTime(vol1, audioCtx.currentTime);
            
            document.getElementById('freq1').textContent = Math.round(freq1);
            document.getElementById('vol1').textContent = Math.round(vol1 * 100);
        } else {
            gainNode1.gain.setValueAtTime(0, audioCtx.currentTime);
            document.getElementById('freq1').textContent = '0';
            document.getElementById('vol1').textContent = '0';
        }

        // オシレータ2の更新
        if (document.getElementById('osc2-enabled').checked) {
            let freq2, vol2;
            const baseVol2 = parseFloat(document.getElementById('volume2').value) / 100;
            const minThreshold2 = parseFloat(document.getElementById('minThreshold2').value);
            const maxThreshold2 = parseFloat(document.getElementById('maxThreshold2').value);

            if (document.getElementById('osc2-camera-control').checked) {
                freq2 = calculateFrequency(
                    leftBrightness,
                    parseFloat(document.getElementById('minFreq2').value),
                    parseFloat(document.getElementById('maxFreq2').value),
                    parseFloat(document.getElementById('sensitivity2').value),
                    minThreshold2,
                    maxThreshold2
                );
                vol2 = calculateVolume(rightBrightness, document.getElementById('sensitivity2').value, minThreshold2, maxThreshold2) * baseVol2;
            } else {
                freq2 = parseFloat(document.getElementById('minFreq2').value);
                vol2 = 0.5 * baseVol2;
            }

            oscillator2.frequency.setValueAtTime(freq2, audioCtx.currentTime);
            gainNode2.gain.setValueAtTime(vol2, audioCtx.currentTime);
            
            document.getElementById('freq2').textContent = Math.round(freq2);
            document.getElementById('vol2').textContent = Math.round(vol2 * 100);
        } else {
            gainNode2.gain.setValueAtTime(0, audioCtx.currentTime);
            document.getElementById('freq2').textContent = '0';
            document.getElementById('vol2').textContent = '0';
        }

        updateEffectRouting();
    } catch (e) {
        console.error('Parameter update failed:', e);
    }
}

// エフェクトルーティング更新
function updateEffectRouting() {
    if (!audioCtx) return;

    try {
        // LFOルーティング
        const lfoRate = parseFloat(document.getElementById('lfoRate').value);
        const lfoDepth = parseFloat(document.getElementById('lfoDepth').value);
        
        lfo.frequency.setValueAtTime(lfoRate, audioCtx.currentTime);
        
        if (document.getElementById('lfo-osc1').checked) {
            lfoGain1.gain.setValueAtTime(lfoDepth, audioCtx.currentTime);
        } else {
            lfoGain1.gain.setValueAtTime(0, audioCtx.currentTime);
        }
        
        if (document.getElementById('lfo-osc2').checked) {
            lfoGain2.gain.setValueAtTime(lfoDepth, audioCtx.currentTime);
        } else {
            lfoGain2.gain.setValueAtTime(0, audioCtx.currentTime);
        }

        // フィルタールーティング
        const filterFreq = parseFloat(document.getElementById('filterFreq').value);
        const filterQ = parseFloat(document.getElementById('filterQ').value);
        
        if (document.getElementById('filter-osc1').checked) {
            filter1.frequency.setValueAtTime(filterFreq, audioCtx.currentTime);
            filter1.Q.setValueAtTime(filterQ, audioCtx.currentTime);
        }
        if (document.getElementById('filter-osc2').checked) {
            filter2.frequency.setValueAtTime(filterFreq, audioCtx.currentTime);
            filter2.Q.setValueAtTime(filterQ, audioCtx.currentTime);
        }

        // AMルーティング
        const amRate1 = parseFloat(document.getElementById('amRate1').value);
        const amDepth1 = parseFloat(document.getElementById('amDepth1').value) / 100;
        const amRate2 = parseFloat(document.getElementById('amRate2').value);
        const amDepth2 = parseFloat(document.getElementById('amDepth2').value) / 100;

        am1.frequency.setValueAtTime(amRate1, audioCtx.currentTime);
        am2.frequency.setValueAtTime(amRate2, audioCtx.currentTime);

        if (document.getElementById('am-osc1').checked) {
            am1.connect(amGain1.gain);
            amGain1.gain.setValueAtTime(amDepth1, audioCtx.currentTime);
        } else {
            am1.disconnect();
            amGain1.gain.setValueAtTime(1, audioCtx.currentTime);
        }

        if (document.getElementById('am-osc2').checked) {
            am2.connect(amGain2.gain);
            amGain2.gain.setValueAtTime(amDepth2, audioCtx.currentTime);
        } else {
            am2.disconnect();
            amGain2.gain.setValueAtTime(1, audioCtx.currentTime);
        }

        // ディレイルーティング
        const delayTime1 = parseFloat(document.getElementById('delayTime1').value);
        const delayFeedback1 = parseFloat(document.getElementById('delayFeedback1').value);
        const delayTime2 = parseFloat(document.getElementById('delayTime2').value);
        const delayFeedback2 = parseFloat(document.getElementById('delayFeedback2').value);

        if (document.getElementById('delay-osc1').checked) {
            delay1.delayTime.setValueAtTime(delayTime1, audioCtx.currentTime);
            delayGain1.gain.setValueAtTime(delayFeedback1, audioCtx.currentTime);
        } else {
            delayGain1.gain.setValueAtTime(0, audioCtx.currentTime);
        }

        if (document.getElementById('delay-osc2').checked) {
            delay2.delayTime.setValueAtTime(delayTime2, audioCtx.currentTime);
            delayGain2.gain.setValueAtTime(delayFeedback2, audioCtx.currentTime);
        } else {
            delayGain2.gain.setValueAtTime(0, audioCtx.currentTime);
        }
    } catch (e) {
        console.error('Effect routing update failed:', e);
    }
}

function setupSliderListeners() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        ['input', 'change'].forEach(eventType => {
            slider.addEventListener(eventType, (e) => {
                const valueElement = document.getElementById(e.target.id + 'Value');
                if (valueElement) {
                    valueElement.textContent = e.target.value;
                }
                if (audioCtx) {
                    updateEffectRouting();
                }
                saveSettings();
            });
        });
    });
}
// イベントリスナーのセットアップ
function setupEventListeners() {
    // 開始ボタン
    document.getElementById('startButton').addEventListener('click', async () => {
        if (isPlaying) return;
        
        if (!audioCtx) {
            initAudio();
        }

        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        isPlaying = true;
        processFrame();
        console.log('Started');
    });

    // 停止ボタン
    document.getElementById('stopButton').addEventListener('click', () => {
        if (!isPlaying) return;
        
        isPlaying = false;
        cancelAnimationFrame(animationId);
        
        if (gainNode1) gainNode1.gain.setValueAtTime(0, audioCtx.currentTime);
        if (gainNode2) gainNode2.gain.setValueAtTime(0, audioCtx.currentTime);
        
        console.log('Stopped');
    });

    // 波形選択ボタン
    document.querySelectorAll('.wave-button').forEach(button => {
        button.addEventListener('click', (e) => {
            if (!audioCtx) return;

            const isOsc1 = e.target.classList.contains('osc1-wave');
            const oscillator = isOsc1 ? oscillator1 : oscillator2;
            const waveType = e.target.dataset.wave;
            const buttonGroup = e.target.closest('.wave-selector');
            
            setWaveType(oscillator, waveType, buttonGroup);
            saveSettings();
        });
    });

   // エフェクト切り替え
    document.querySelectorAll('.effect-toggle input').forEach(toggle => {
        toggle.addEventListener('change', () => {
            updateEffectRouting();
            saveSettings();
        });
    });

	
    // その他の設定変更時の保存
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', saveSettings);
    });

    // Safari対応
    document.addEventListener('touchstart', function() {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
	});
	
    // ページ終了時の設定保存
    window.addEventListener('beforeunload', saveBeforeClose);
    window.addEventListener('pagehide', saveBeforeClose);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            saveBeforeClose();
        }
    });
}


// 終了時保存用の関数を追加
function saveBeforeClose() {
    if (isPlaying) {
        // 再生中なら停止
        isPlaying = false;
        cancelAnimationFrame(animationId);
        if (gainNode1) gainNode1.gain.setValueAtTime(0, audioCtx.currentTime);
        if (gainNode2) gainNode2.gain.setValueAtTime(0, audioCtx.currentTime);
    }
    // 設定を保存
    saveSettings();
}

// 初期化順序を修正
document.addEventListener('DOMContentLoaded', function() {
    initVideo();
    addThresholdControls();
    setupSliderListeners();
    setupEventListeners();
    loadSettings();
});