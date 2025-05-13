// ローカルストレージに設定を保存する機能と情報パネルの透明度切り替え機能を追加

// 設定保存のためのキー
const SETTINGS_KEY = 'fiveElementsGameSettings';

// デフォルト設定
const defaultSettings = {
    // ゲーム設定
    speed: 5,
    cellSize: 5,
    
    // サウンド設定
    soundEnabled: true,
    soundVolume: 50,
    waveformType: 'pure',
    modulationEnabled: false,
    modulationIntensity: 50,
    modulationRate: 5,
    
    // 災害設定
    disasterFrequency: 2,
    disasterProbability: 0.8,
    disasterDuration: 300,
    
    // UI設定
    infoPanelOpacity: 0.7  // 情報パネルの透明度: 0.7 (70%)
};

// 設定をロードする関数
function loadSettings() {
    try {
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            console.log("Settings loaded from localStorage:", settings);
            return { ...defaultSettings, ...settings }; // デフォルト設定と保存された設定をマージ
        }
    } catch (e) {
        console.error("Error loading settings:", e);
    }
    return defaultSettings;
}

// 設定を保存する関数
function saveSettings() {
    try {
        const settings = {
            // ゲーム設定
            speed: parseInt(speedSlider.value),
            cellSize: parseInt(cellSizeSlider.value),
            
            // サウンド設定
            soundEnabled: isSoundEnabled,
            soundVolume: Math.round(soundVolume * 100),
            waveformType: getSelectedWaveformType(),
            modulationEnabled: useModulation,
            modulationIntensity: Math.round(modulationIntensity * 100),
            modulationRate: modulationRate,
            
            // 災害設定
            disasterFrequency: disasterFrequency,
            disasterProbability: disasterProbability,
            disasterDuration: disasterDuration,
            
            // UI設定
            infoPanelOpacity: parseFloat(getComputedStyle(document.getElementById('info-panel')).opacity)
        };
        
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        console.log("Settings saved:", settings);
    } catch (e) {
        console.error("Error saving settings:", e);
    }
}

// 現在選択されている波形タイプを取得
function getSelectedWaveformType() {
    const waveformSelect = document.getElementById('waveformSelect');
    return waveformSelect ? waveformSelect.value : 'pure';
}

// 設定を適用する関数
function applySettings(settings) {
    // ゲーム設定
    if (speedSlider) {
        speedSlider.value = settings.speed;
        speedValueDisplay.textContent = `x${settings.speed}`;
        updateInterval = baseInterval / settings.speed;
    }
    
    if (cellSizeSlider) {
        cellSizeSlider.value = settings.cellSize;
        cellSizeValueDisplay.textContent = `x${settings.cellSize}`;
        BASE_CELL_SIZE = settings.cellSize;
    }
    
    // サウンド設定
    isSoundEnabled = settings.soundEnabled;
    soundVolume = settings.soundVolume / 100;
    
    if (document.getElementById('soundToggle')) {
        document.getElementById('soundToggle').checked = settings.soundEnabled;
    }
    
    if (document.getElementById('soundVolumeSlider')) {
        document.getElementById('soundVolumeSlider').value = settings.soundVolume;
        document.getElementById('soundVolumeValue').textContent = `${settings.soundVolume}%`;
    }
    
    if (document.getElementById('waveformSelect')) {
        document.getElementById('waveformSelect').value = settings.waveformType;
        SOUND_PARAMS = WAVE_PRESETS[settings.waveformType] || WAVE_PRESETS.pure;
    }
    
    useModulation = settings.modulationEnabled;
    modulationIntensity = settings.modulationIntensity / 100;
    modulationRate = settings.modulationRate;
    
    if (document.getElementById('modulationToggle')) {
        document.getElementById('modulationToggle').checked = settings.modulationEnabled;
    }
    
    if (document.getElementById('modulationIntensitySlider')) {
        document.getElementById('modulationIntensitySlider').value = settings.modulationIntensity;
        document.getElementById('modulationIntensitySlider').disabled = !settings.modulationEnabled;
        document.getElementById('modulationIntensityValue').textContent = `${settings.modulationIntensity}%`;
    }
    
    if (document.getElementById('modulationRateSlider')) {
        document.getElementById('modulationRateSlider').value = settings.modulationRate;
        document.getElementById('modulationRateSlider').disabled = !settings.modulationEnabled;
        document.getElementById('modulationRateValue').textContent = `${settings.modulationRate} Hz`;
    }
    
    // 災害設定
    disasterFrequency = settings.disasterFrequency;
    disasterProbability = settings.disasterProbability;
    disasterDuration = settings.disasterDuration;
    
    if (document.getElementById('disasterFrequencySlider')) {
        document.getElementById('disasterFrequencySlider').value = settings.disasterFrequency;
        document.getElementById('disasterFrequencyValue').textContent = settings.disasterFrequency;
    }
    
    if (document.getElementById('disasterProbabilitySlider')) {
        document.getElementById('disasterProbabilitySlider').value = settings.disasterProbability;
        document.getElementById('disasterProbabilityValue').textContent = settings.disasterProbability.toFixed(1);
    }
    
    if (document.getElementById('disasterDurationSlider')) {
        document.getElementById('disasterDurationSlider').value = settings.disasterDuration;
        document.getElementById('disasterDurationValue').textContent = settings.disasterDuration;
    }
    
    // UI設定 - 情報パネルの透明度
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel) {
        infoPanel.style.opacity = settings.infoPanelOpacity;
    }
}

// 情報パネルの透明度切り替えボタンを追加
function addInfoPanelOpacityControl() {
    // 既存の情報パネルを取得
    const infoPanel = document.getElementById('info-panel');
    if (!infoPanel) return;
    
    // 情報パネルに透明度切り替えボタンを追加
    const opacityToggle = document.createElement('div');
    opacityToggle.id = 'opacity-toggle';
    opacityToggle.className = 'opacity-toggle';
    opacityToggle.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        </svg>
    `;
    
    opacityToggle.style.position = 'absolute';
    opacityToggle.style.top = '5px';
    opacityToggle.style.right = '5px';
    opacityToggle.style.width = '20px';
    opacityToggle.style.height = '20px';
    opacityToggle.style.display = 'flex';
    opacityToggle.style.alignItems = 'center';
    opacityToggle.style.justifyContent = 'center';
    opacityToggle.style.backgroundColor = 'rgba(60, 60, 60, 0.5)';
    opacityToggle.style.borderRadius = '50%';
    opacityToggle.style.cursor = 'pointer';
    opacityToggle.style.pointerEvents = 'auto';
    
    // 情報パネルのスタイルを調整
    infoPanel.style.position = 'relative';
    
    // クリックでトグル処理
    let opacityState = 0; // 0: 標準表示, 1: 半透明, 2: 非表示
    opacityToggle.addEventListener('click', function() {
        opacityState = (opacityState + 1) % 3;
        
        switch (opacityState) {
            case 0: // 標準表示
                infoPanel.style.opacity = '0.7';
                break;
            case 1: // 半透明
                infoPanel.style.opacity = '0.3';
                break;
            case 2: // 非表示
                infoPanel.style.opacity = '0';
                break;
        }
        
        // 設定保存
        saveSettings();
    });
    
    infoPanel.appendChild(opacityToggle);
}

// 設定保存ボタンを追加
function addSaveSettingsButton() {
    const controlsPanel = document.getElementById('controls-panel');
    if (!controlsPanel) return;
    
    // 既存のボタンがあれば削除
    const existingButton = document.getElementById('saveSettingsBtn');
    if (existingButton) {
        existingButton.remove();
    }
    
    // 設定保存セクションの追加
    const saveSection = document.createElement('div');
    saveSection.className = 'section-header';
    saveSection.innerHTML = 'Settings';
    
    const saveButtonRow = document.createElement('div');
    saveButtonRow.className = 'buttons-row';
    
    const saveButton = document.createElement('button');
    saveButton.id = 'saveSettingsBtn';
    saveButton.textContent = 'Save Settings';
    
    saveButtonRow.appendChild(saveButton);
    
    // 最後に追加
    controlsPanel.appendChild(saveSection);
    controlsPanel.appendChild(saveButtonRow);
    
    // イベントリスナーを設定
    saveButton.addEventListener('click', function() {
        saveSettings();
        // 保存完了メッセージ
        const savedMsg = document.createElement('div');
        savedMsg.textContent = 'Settings saved!';
        savedMsg.style.textAlign = 'center';
        savedMsg.style.marginTop = '5px';
        savedMsg.style.color = '#4CAF50';
        
        saveButtonRow.appendChild(savedMsg);
        
        // 3秒後にメッセージを削除
        setTimeout(() => {
            savedMsg.remove();
        }, 3000);
    });
}

// 起動時に設定を読み込む
document.addEventListener('DOMContentLoaded', function() {
    console.log("Loading settings and initializing UI improvements...");
    
    // 設定をロード
    const settings = loadSettings();
    
    // ゲームの初期化後に設定を適用
    window.addEventListener('load', function() {
        setTimeout(function() {
            applySettings(settings);
            
            // 情報パネルの透明度切り替えボタンを追加
            addInfoPanelOpacityControl();
            
            // 設定保存ボタンを追加
            addSaveSettingsButton();
            
            console.log("UI improvements initialized");
        }, 500); // 少し遅延させてゲームの初期化が完了するのを待つ
    });
});

// イベントリスナーを追加して設定の変更を監視
function setupSettingsListeners() {
    // 既存のリスナーを再利用するため、新しいイベントリスナーは追加しない
    // 代わりに、既存のリスナー内で設定保存関数を呼び出すようにする
    
    // スピードスライダー
    const originalSpeedListener = speedSlider.oninput;
    speedSlider.oninput = function() {
        if (originalSpeedListener) originalSpeedListener.call(this);
        // 速度変更時に設定を保存
        setTimeout(saveSettings, 300);
    };
    
    // セルサイズスライダー
    const originalCellSizeListener = cellSizeSlider.oninput;
    cellSizeSlider.oninput = function() {
        if (originalCellSizeListener) originalCellSizeListener.call(this);
        // セルサイズ変更時に設定を保存
        setTimeout(saveSettings, 300);
    };
    
    // サウンドトグル
    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
        const originalSoundToggleListener = soundToggle.onchange;
        soundToggle.onchange = function() {
            if (originalSoundToggleListener) originalSoundToggleListener.call(this);
            saveSettings();
        };
    }
    
    // その他の設定リスナーも同様に追加
    setupAdditionalListeners('soundVolumeSlider', 'input');
    setupAdditionalListeners('waveformSelect', 'change');
    setupAdditionalListeners('modulationToggle', 'change');
    setupAdditionalListeners('modulationIntensitySlider', 'input');
    setupAdditionalListeners('modulationRateSlider', 'input');
    setupAdditionalListeners('disasterFrequencySlider', 'input');
    setupAdditionalListeners('disasterProbabilitySlider', 'input');
    setupAdditionalListeners('disasterDurationSlider', 'input');
}

// 追加のリスナーを設定するヘルパー関数
function setupAdditionalListeners(elementId, eventType) {
    const element = document.getElementById(elementId);
    if (element) {
        const originalListener = element['on' + eventType];
        element['on' + eventType] = function() {
            if (originalListener) originalListener.call(this);
            setTimeout(saveSettings, 300);
        };
    }
}

// ウィンドウロード時にリスナー設定
window.addEventListener('load', function() {
    setTimeout(setupSettingsListeners, 1000); // ゲームの初期化完了を待つ
});


// 日本語の重複を削除し、設定保存機能を追加した災害コントロール関数

function addDisasterControls() {
    // 既存のコントロールパネルを取得
    const controlsPanel = document.getElementById('controls-panel');
    
    // 既存の災害設定セクションを削除（もし存在すれば）
    const existingSection = document.getElementById('disaster-settings-section');
    if (existingSection) {
        existingSection.remove();
    }
    
    // 以下の addDisasterControls 関数は既に index.html に実装済みのため、
    // JavaScript で再度作成せずに HTMLの方を優先して使用します。
    // この関数は現在のスクリプトから削除し、新しい設定保存機能だけを追加します。
    
    // 災害発生ボタンのイベントリスナーを設定
    const triggerDisasterBtn = document.getElementById('triggerDisasterBtn');
    if (triggerDisasterBtn) {
        // 既存のイベントリスナーを保持しながら新しいリスナーを追加
        const originalClickHandler = triggerDisasterBtn.onclick;
        triggerDisasterBtn.onclick = function() {
            if (typeof originalClickHandler === 'function') {
                originalClickHandler.call(this);
            }
            // 災害発生時にデフォルトの動作（startDisaster関数の呼び出し）
            startDisaster();
        };
    }
    
    // スライダーのイベントリスナーを設定
    setupDisasterSliderListeners();
}

// 災害設定スライダーのイベントリスナーを設定する関数
function setupDisasterSliderListeners() {
    const disasterFrequencySlider = document.getElementById('disasterFrequencySlider');
    const disasterFrequencyValue = document.getElementById('disasterFrequencyValue');
    const disasterProbabilitySlider = document.getElementById('disasterProbabilitySlider');
    const disasterProbabilityValue = document.getElementById('disasterProbabilityValue');
    const disasterDurationSlider = document.getElementById('disasterDurationSlider');
    const disasterDurationValue = document.getElementById('disasterDurationValue');
    
    // 災害頻度スライダー
    if (disasterFrequencySlider && disasterFrequencyValue) {
        disasterFrequencySlider.value = disasterFrequency;
        disasterFrequencyValue.textContent = disasterFrequency;
        
        disasterFrequencySlider.addEventListener('input', function() {
            disasterFrequency = parseInt(this.value);
            disasterFrequencyValue.textContent = disasterFrequency;
            console.log("Disaster frequency set to: " + disasterFrequency + " years");
        });
    }
    
    // 災害確率スライダー
    if (disasterProbabilitySlider && disasterProbabilityValue) {
        disasterProbabilitySlider.value = disasterProbability;
        disasterProbabilityValue.textContent = disasterProbability.toFixed(1);
        
        disasterProbabilitySlider.addEventListener('input', function() {
            disasterProbability = parseFloat(this.value);
            disasterProbabilityValue.textContent = disasterProbability.toFixed(1);
            console.log("Disaster probability set to: " + disasterProbability);
        });
    }
    
    // 災害期間スライダー
    if (disasterDurationSlider && disasterDurationValue) {
        disasterDurationSlider.value = disasterDuration;
        disasterDurationValue.textContent = disasterDuration;
        
        disasterDurationSlider.addEventListener('input', function() {
            disasterDuration = parseInt(this.value);
            disasterDurationValue.textContent = disasterDuration;
            console.log("Disaster duration set to: " + disasterDuration);
        });
    }
}

// サウンド設定コントロールを設定 - 重複の削除と英語表示に統一
function setupSoundControls() {
    console.log("Setting up sound controls");
    
    const soundToggle = document.getElementById('soundToggle');
    const soundVolumeSlider = document.getElementById('soundVolumeSlider');
    const soundVolumeValue = document.getElementById('soundVolumeValue');
    const waveformSelect = document.getElementById('waveformSelect');
    const modulationToggle = document.getElementById('modulationToggle');
    const modulationIntensitySlider = document.getElementById('modulationIntensitySlider');
    const modulationIntensityValue = document.getElementById('modulationIntensityValue');
    const modulationRateSlider = document.getElementById('modulationRateSlider');
    const modulationRateValue = document.getElementById('modulationRateValue');
    const testSoundButton = document.getElementById('testSoundButton');
    
    // サウンドトグル
    if (soundToggle) {
        soundToggle.checked = isSoundEnabled;
        soundToggle.addEventListener('change', function() {
            isSoundEnabled = this.checked;
            console.log("Sound enabled: " + isSoundEnabled);
            
            // 初めてサウンドを有効にした場合はオーディオコンテキストを初期化
            if (isSoundEnabled && !isAudioInitialized) {
                initAudio();
            }
            
            // 設定を保存
            if (typeof saveSettings === 'function') {
                saveSettings();
            }
        });
    }
    
    // 音量スライダー
    if (soundVolumeSlider && soundVolumeValue) {
        soundVolumeSlider.value = soundVolume * 100;
        soundVolumeValue.textContent = Math.round(soundVolume * 100) + '%';
        
        soundVolumeSlider.addEventListener('input', function() {
            soundVolume = parseInt(this.value) / 100;
            soundVolumeValue.textContent = this.value + '%';
            console.log("Volume set to: " + soundVolume);
            
            // 設定を保存
            if (typeof saveSettings === 'function') {
                setTimeout(saveSettings, 300);
            }
        });
    }
    
    // 波形選択
    if (waveformSelect) {
        // 現在の設定と一致するオプションを選択
        for (const [key, value] of Object.entries(WAVE_PRESETS)) {
            if (SOUND_PARAMS === value) {
                waveformSelect.value = key;
                break;
            }
        }
        
        waveformSelect.addEventListener('change', function() {
            const selected = this.value;
            if (WAVE_PRESETS[selected]) {
                SOUND_PARAMS = WAVE_PRESETS[selected];
                console.log("Waveform preset changed to: " + selected);
                
                // 変更を確認するための音のテストをオプションで自動実行
                if (isSoundEnabled) {
                    playDeathSound('wood');
                }
                
                // 設定を保存
                if (typeof saveSettings === 'function') {
                    saveSettings();
                }
            }
        });
    }
    
    // モジュレーションのオンオフ切り替え
    if (modulationToggle) {
        modulationToggle.checked = useModulation;
        
        modulationToggle.addEventListener('change', function() {
            useModulation = this.checked;
            
            // モジュレーション関連スライダーの有効/無効を切り替え
            if (modulationIntensitySlider) modulationIntensitySlider.disabled = !useModulation;
            if (modulationRateSlider) modulationRateSlider.disabled = !useModulation;
            
            console.log("Modulation: " + (useModulation ? "ON" : "OFF"));
            
            // 変更を確認するための音のテストをオプションで自動実行
            if (isSoundEnabled) {
                playDeathSound('fire');
            }
            
            // 設定を保存
            if (typeof saveSettings === 'function') {
                saveSettings();
            }
        });
    }
    
    // モジュレーション強度スライダー
    if (modulationIntensitySlider && modulationIntensityValue) {
        modulationIntensitySlider.value = modulationIntensity * 100;
        modulationIntensityValue.textContent = Math.round(modulationIntensity * 100) + '%';
        
        modulationIntensitySlider.addEventListener('input', function() {
            modulationIntensity = parseInt(this.value) / 100;
            modulationIntensityValue.textContent = this.value + '%';
            console.log("Modulation intensity: " + modulationIntensity);
            
            // 設定を保存
            if (typeof saveSettings === 'function') {
                setTimeout(saveSettings, 300);
            }
        });
    }
    
    // モジュレーション速度スライダー
    if (modulationRateSlider && modulationRateValue) {
        modulationRateSlider.value = modulationRate;
        modulationRateValue.textContent = modulationRate + ' Hz';
        
        modulationRateSlider.addEventListener('input', function() {
            modulationRate = parseInt(this.value);
            modulationRateValue.textContent = modulationRate + ' Hz';
            console.log("Modulation rate: " + modulationRate + " Hz");
            
            // 設定を保存
            if (typeof saveSettings === 'function') {
                setTimeout(saveSettings, 300);
            }
        });
    }
    
    // 音のテストボタン
    if (testSoundButton) {
        testSoundButton.addEventListener('click', function() {
            console.log("Testing sounds...");
            if (!isAudioInitialized && isSoundEnabled) {
                initAudio();
            }
            testAllSounds();
        });
    }
}

// 災害メッセージの日英表示を統一
function updateDisasterMessages() {
    // 災害発生メッセージを英語に統一
    if (disasterActive && disasterMessage === '！ 災害発生中 ！') {
        disasterMessage = '! Disaster Active !';
    } else if (disasterMessage === '災害終了') {
        disasterMessage = 'Disaster Ended';
    }
}

// 更新された災害状態の更新関数
function updateDisaster() {
    if (disasterActive) {
        disasterTimer--;
        
        // 英語メッセージに統一
        updateDisasterMessages();
        
        // 長引く災害の場合、追加のウイルス発生
        if (disasterTimer % 50 === 0 && disasterTimer > 0) {
            // 追加の致死性ウイルスを5つ生成
            for (let i = 0; i < 5; i++) {
                const x = Math.floor(Math.random() * GRID_SIZE_X);
                const y = Math.floor(Math.random() * GRID_SIZE_Y);
                
                if (grid[y][x] === null) {
                    const newVirus = new Virus(x, y, 'lethal');
                    grid[y][x] = newVirus;
                    entities.push(newVirus);
                    viruses.push(newVirus);
                }
            }
        }
        
        if (disasterTimer <= 0) {
            disasterActive = false;
            // 災害メッセージを英語に統一
            disasterMessage = 'Disaster Ended';
            /*
            // 災害終了時に音を鳴らす
            if (isAudioInitialized && isSoundEnabled) {
                // 全ての要素の音を同時に鳴らす（災害終了の合図）
                CELL_TYPES.forEach(type => {
                    playDeathSound(type);
                });
            }
            */
            // 5秒後にメッセージを消去
            setTimeout(() => {
                disasterMessage = '';
                // 情報パネルを更新
                updateInfoPanel();
            }, 5000);
            
            console.log("Disaster ended");
            
            // 致死性ウイルスを大幅に削減し、残ったものも弱体化
            let deletedCount = 0;
            const lethalViruses = viruses.filter(v => v.type === 'lethal');
            const maxDeleteCount = Math.floor(lethalViruses.length * 0.9); // 90%を削除に増加
            
            for (let i = viruses.length - 1; i >= 0; i--) {
                if (viruses[i].type === 'lethal') {
                    if (deletedCount < maxDeleteCount) {
                        // 大部分は完全に削除
                        grid[viruses[i].y][viruses[i].x] = null;
                        
                        // entitiesから削除
                        const indexInEntities = entities.indexOf(viruses[i]);
                        if (indexInEntities > -1) {
                            entities.splice(indexInEntities, 1);
                        }
                        
                        // virusesから削除
                        viruses.splice(i, 1);
                        deletedCount++;
                    } else {
                        // 残りは弱体化
                        viruses[i].lifespan *= 0.3; // 寿命を半分に
                        viruses[i].infectionRate *= 0.1; // 感染力を大幅に低下
                        viruses[i].lethalityRate *= 0.1; // 致死率も大幅に低下
                        viruses[i].hostDependency = 0.1; // 宿主依存をさらに強化
                    }
                }
            }
            
            // 免疫を持つ細胞の数を増やす（災害後の免疫強化）
            for (const cell of cells) {
                if (Math.random() < 0.5) { // 50%の確率で免疫を獲得
                    cell.immunity = true;
                    cell.immunityTimer = 200; // 長めの免疫期間
                }
            }
            
            // 災害後の細胞増殖をブーストするために、既存の細胞のエネルギーを増加
            for (const cell of cells) {
                cell.energy = Math.min(100, cell.energy + 30); // 30ポイントのエネルギーブースト（最大100まで）
            }
        }
    }
}

// 災害発生関数も英語メッセージに更新
function startDisaster() {
    if (!disasterActive) {
        disasterActive = true;
        
        // 災害の期間を設定
        disasterTimer = disasterDuration;
        
        // 致死性ウイルスの追加 - 複数の場所から感染が始まるようにする
        const disasterVirusCount = disasterVirusInitialCount;
        
        // まず、細胞の密集地帯の近くにウイルスを配置
        let cellClusters = findCellClusters();
        let placedAroundClusters = 0;
        
        // 細胞クラスター周辺に少なくとも半分のウイルスを配置
        for (let i = 0; i < Math.min(cellClusters.length, Math.floor(disasterVirusCount / 2)); i++) {
            const cluster = cellClusters[i];
            
            // クラスター周辺のランダムな位置を選択
            const offset = 3; // クラスターからのオフセット距離
            const x = Math.max(0, Math.min(GRID_SIZE_X - 1, cluster.x + Math.floor(Math.random() * offset * 2) - offset));
            const y = Math.max(0, Math.min(GRID_SIZE_Y - 1, cluster.y + Math.floor(Math.random() * offset * 2) - offset));
            
            if (grid[y][x] === null) {
                const newVirus = new Virus(x, y, 'lethal');
                grid[y][x] = newVirus;
                entities.push(newVirus);
                viruses.push(newVirus);
                placedAroundClusters++;
            }
        }
        
        // 残りのウイルスはランダムな位置に配置
        for (let i = 0; i < disasterVirusCount - placedAroundClusters; i++) {
            const x = Math.floor(Math.random() * GRID_SIZE_X);
            const y = Math.floor(Math.random() * GRID_SIZE_Y);
            
            if (grid[y][x] === null) {
                const newVirus = new Virus(x, y, 'lethal');
                grid[y][x] = newVirus;
                entities.push(newVirus);
                viruses.push(newVirus);
            }
        }
        
        // 情報パネルに災害メッセージを設定（英語に統一）
        disasterMessage = '! Disaster Active !';
        /*
        // 災害発生時に特別な音を鳴らす
        if (isAudioInitialized && isSoundEnabled) {
            // 全ての要素の音を順番に鳴らす（災害の警告として）
            for (let i = 0; i < CELL_TYPES.length; i++) {
                setTimeout(() => {
                    playDeathSoundsCluster(CELL_TYPES[i], 5);
                }, i * 300);
            }
        }
        */
        console.log("Natural disaster occurred!");
    }
}

// 情報パネル更新関数も英語メッセージに対応
function updateInfoPanel() {
    // ウイルス数
    const yinCount = viruses.filter(virus => virus.type === 'yin').length;
    const yangCount = viruses.filter(virus => virus.type === 'yang').length;
    const lethalCount = viruses.filter(virus => virus.type === 'lethal').length;
    
    virusCountDisplay.textContent = `Viruses: ${viruses.length} (Yin: ${yinCount}, Yang: ${yangCount}, Lethal: ${lethalCount})`;
    
    // 季節表示
    seasonDisplay.textContent = `Season: ${ELEMENT_SEASONS[currentSeason]} (${Math.floor(seasonTimer)}s / ${seasonTime}s)`;
    seasonDisplay.style.color = CELL_COLORS[currentSeason];
     
    // 細胞タイプごとの個体数
    const population = {};
    CELL_TYPES.forEach(type => population[type] = cells.filter(cell => cell.type === type).length);
    
    // 感染状況
    const infectedCount = cells.filter(cell => cell.infected > 0).length;
    const immuneCount = cells.filter(cell => cell.immunity).length;
    const corpseCount = corpses.length;
    
    // 個体数グラフ
    let populationBarsHTML = '';
    const totalPopulation = cells.length;
    
    if (totalPopulation > 0) {
        populationBarsHTML += '<div class="population-bar">';
        
        for (const type of CELL_TYPES) {
            const percentage = (population[type] / totalPopulation) * 100;
            if (percentage > 0) {
                populationBarsHTML += `<div class="population-segment" style="width: ${percentage}%; background-color: ${CELL_COLORS[type]};"></div>`;
            }
        }
        
        populationBarsHTML += '</div>';
        
        // 詳細情報
        for (const type of CELL_TYPES) {
            populationBarsHTML += `<div style="display: flex; align-items: center; margin-top: 2px;">
                <div style="width: 10px; height: 10px; background-color: ${CELL_COLORS[type]}; margin-right: 5px;"></div>
                <span>${type}: ${population[type]}</span>
            </div>`;
        }
        
        // 感染・死骸情報の追加
        populationBarsHTML += `<div style="margin-top: 10px;">
            <div>Infected: ${infectedCount} cells (${Math.round(infectedCount / totalPopulation * 100)}%)</div>
            <div>Immune: ${immuneCount} cells (${Math.round(immuneCount / totalPopulation * 100)}%)</div>
            <div>Corpses: ${corpseCount}</div>
        </div>`;
        
        // 災害状態の表示 - 英語表示に統一
        if (disasterActive) {
            populationBarsHTML += `<div style="margin-top: 5px; color: red; font-weight: bold;">
                ${disasterMessage || '! Disaster Active !'}: ${disasterTimer} turns remaining
            </div>`;
        } else if (disasterMessage) {
            // 災害終了メッセージがある場合
            populationBarsHTML += `<div style="margin-top: 5px; color: green; font-weight: bold;">
                ${disasterMessage}
            </div>`;
        }
        
        // 年カウンター表示
        populationBarsHTML += `<div style="margin-top: 5px;">
            Year progress: ${Math.floor(yearTimer)}s / ${yearTotalTime}s
        </div>`;
        
        // サウンド状態表示
        populationBarsHTML += `<div style="margin-top: 5px;">
            Sound: ${isSoundEnabled ? 'ON' : 'OFF'} (Volume: ${Math.round(soundVolume * 100)}%)
        </div>`;
    } else {
        populationBarsHTML = '<div>No cells alive</div>';
    }
    
    populationBarsDisplay.innerHTML = populationBarsHTML;
}

// 元の関数をオーバーライドするために、init関数の最後に呼び出すようにする
function overrideOriginalFunctions() {
    console.log("Overriding original functions with improved versions");
    
    // 元の関数のバックアップを作成
    const originalUpdateDisaster = window.updateDisaster;
    const originalUpdateInfoPanel = window.updateInfoPanel;
	const originalStartDisaster = window.startDisaster;
	const originalSetupSoundControls = window.setupSoundControls; // 追加
    
    // 更新された関数で上書き
    window.updateDisaster = updateDisaster;
    window.updateInfoPanel = updateInfoPanel;
	window.startDisaster = startDisaster;
	window.setupSoundControls = setupSoundControls; // 追加：サウンドコントロール関数も上書き
    
    // UIの初期化時に英語表示のコントロールパネルを使用するように
    window.addDisasterControls = addDisasterControls;
	window.setupSoundControls = setupSoundControls;
	setupSoundControls(); // 追加：明示的に新しい関数を呼び出して再構築
}

// ページロード時に設定を読み込み、関数をオーバーライドする
document.addEventListener('DOMContentLoaded', function() {
    // ゲームの初期化完了後に関数をオーバーライドする
    window.addEventListener('load', function() {
        setTimeout(function() {
            overrideOriginalFunctions();
            console.log("Functions overridden with improved versions");
        }, 500); // ゲームの初期化が完了するのを待つ
    });
});