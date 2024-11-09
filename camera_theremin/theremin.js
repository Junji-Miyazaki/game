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
        console.log(`Wave type set to ${type}`);
    }
}

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', function() {
    initVideo();
    setupEventListeners();
    addThresholdControls();
});

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
    document.getElementById('minThreshold1Value').textContent = '0';
    document.getElementById('maxThreshold1Value').textContent = '255';
    document.getElementById('minThreshold2Value').textContent = '0';
    document.getElementById('maxThreshold2Value').textContent = '255';
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

// ビデオ初期化
async function initVideo() {
    video = document.getElementById('video');
    canvas = document.getElementById('overlay');
    ctx = canvas.getContext('2d');

    canvas.width = 320;
    canvas.height = 240;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user',
                width: { ideal: 320 },
                height: { ideal: 240 }
            } 
        });
        video.srcObject = stream;
        await video.play();
        console.log('Video initialized successfully');
    } catch (err) {
        console.error('Video initialization failed:', err);
        alert('カメラの初期化に失敗しました。カメラへのアクセスを許可してください。');
    }
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

        console.log('Audio initialized successfully');
    } catch (e) {
        console.error('Audio initialization failed:', e);
    }
}

// フレーム処理
function processFrame() {
    if (!isPlaying) return;

    try {
        // ビデオをキャンバスに描画
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
        
        const rightData = ctx.getImageData(0, 0, canvas.width/2, canvas.height);
        const leftData = ctx.getImageData(canvas.width/2, 0, canvas.width/2, canvas.height);

        const leftBrightness = calculateAverageBrightness(leftData.data);
        const rightBrightness = calculateAverageBrightness(rightData.data);

        updateAudioParams(leftBrightness, rightBrightness);

        animationId = requestAnimationFrame(processFrame);
    } catch (e) {
        console.error('Frame processing error:', e);
        isPlaying = false;
    }
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
    // 閾値の範囲内に収める
    brightness = Math.max(minThreshold, Math.min(maxThreshold, brightness));
    
    // 閾値の範囲で正規化（0-1の範囲に変換）
    return (brightness - minThreshold) / (maxThreshold - minThreshold);
}

// 周波数計算（反転）
function calculateFrequency(brightness, minFreq, maxFreq, sensitivity, minThreshold, maxThreshold) {
    const normalized = normalizeBrightness(brightness, minThreshold, maxThreshold);
    // 1 - normalizedで明るさと周波数を反転させる
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
        const amRate = parseFloat(document.getElementById('amRate').value);
        const amDepth = parseFloat(document.getElementById('amDepth').value) / 100;
        
        am1.frequency.setValueAtTime(amRate, audioCtx.currentTime);
        am2.frequency.setValueAtTime(amRate, audioCtx.currentTime);
        
        if (document.getElementById('am-osc1').checked) {
            am1.connect(amGain1.gain);
            amGain1.gain.setValueAtTime(amDepth, audioCtx.currentTime);
        } else {
            am1.disconnect();
            amGain1.gain.setValueAtTime(1, audioCtx.currentTime);
        }
        
        if (document.getElementById('am-osc2').checked) {
            am2.connect(amGain2.gain);
            amGain2.gain.setValueAtTime(amDepth, audioCtx.currentTime);
        } else {
            am2.disconnect();
            amGain2.gain.setValueAtTime(1, audioCtx.currentTime);
        }

        // ディレイルーティング
        const delayTime = parseFloat(document.getElementById('delayTime').value);
        const delayFeedback = parseFloat(document.getElementById('delayFeedback').value);
        
        if (document.getElementById('delay-osc1').checked) {
            delay1.delayTime.setValueAtTime(delayTime, audioCtx.currentTime);
            delayGain1.gain.setValueAtTime(delayFeedback, audioCtx.currentTime);
        } else {
            delayGain1.gain.setValueAtTime(0, audioCtx.currentTime);
        }
        
        if (document.getElementById('delay-osc2').checked) {
            delay2.delayTime.setValueAtTime(delayTime, audioCtx.currentTime);
            delayGain2.gain.setValueAtTime(delayFeedback, audioCtx.currentTime);
        } else {
            delayGain2.gain.setValueAtTime(0, audioCtx.currentTime);
        }
    } catch (e) {
        console.error('Effect routing update failed:', e);
    }
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
        });
    });

    // エフェクト切り替え
    document.querySelectorAll('.effect-toggle input').forEach(toggle => {
        toggle.addEventListener('change', updateEffectRouting);
    });

    // スライダー値の表示更新とエフェクト更新
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const valueElement = document.getElementById(e.target.id + 'Value');
            if (valueElement) {
                valueElement.textContent = e.target.value;
            }
            if (audioCtx) {
                updateEffectRouting();
            }
        });
    });

    // オシレータのオン/オフ切り替え
    document.getElementById('osc1-enabled').addEventListener('change', function() {
        if (!this.checked && gainNode1) {
            gainNode1.gain.setValueAtTime(0, audioCtx.currentTime);
        }
    });

    document.getElementById('osc2-enabled').addEventListener('change', function() {
        if (!this.checked && gainNode2) {
            gainNode2.gain.setValueAtTime(0, audioCtx.currentTime);
        }
    });

    // オシレータのカメラ制御切り替え時の波形維持
    document.getElementById('osc1-camera-control').addEventListener('change', function() {
        if (oscillator1 && oscillator1.currentWaveType) {
            oscillator1.type = oscillator1.currentWaveType;
        }
    });

    document.getElementById('osc2-camera-control').addEventListener('change', function() {
        if (oscillator2 && oscillator2.currentWaveType) {
            oscillator2.type = oscillator2.currentWaveType;
        }
    });

    // 閾値スライダーのイベントリスナー
    ['minThreshold1', 'maxThreshold1', 'minThreshold2', 'maxThreshold2'].forEach(id => {
        const slider = document.getElementById(id);
        if (slider) {
            slider.addEventListener('input', function(e) {
                const valueElement = document.getElementById(e.target.id + 'Value');
                if (valueElement) {
                    valueElement.textContent = e.target.value;
                }
            });
        }
    });

    // Safari対応
    document.addEventListener('touchstart', function() {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    });
}