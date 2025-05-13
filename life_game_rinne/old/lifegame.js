
const canvas = document.getElementById('lifeCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('container');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const resetButton = document.getElementById('resetButton');
const speedSlider = document.getElementById('speedSlider');
const speedValueDisplay = document.getElementById('speedValue');
const turnCounterDisplay = document.getElementById('turnCounter');
const populationBarsDisplay = document.getElementById('populationBars');
const virusCountDisplay = document.getElementById('virusCount');
const uiToggle = document.getElementById('ui-toggle');
const controlsPanel = document.getElementById('controls-panel');
const cellSizeSlider = document.getElementById('cellSizeSlider');
const cellSizeValueDisplay = document.getElementById('cellSizeValue');

// UI toggle
uiToggle.addEventListener('click', () => {
    if (controlsPanel.style.display === 'flex') {
        controlsPanel.style.display = 'none';
    } else {
        controlsPanel.style.display = 'flex';
    }
});

// グローバル変数
let BASE_CELL_SIZE = 5; // スケーリングファクターの基本値
let GRID_SIZE_X;
let GRID_SIZE_Y;
let CELL_SIZE; // 実際のセルサイズ（BASE_CELL_SIZE に基づいて計算される）
let grid;
let turn = 0;
let isRunning = false;
let gameInterval;
let baseInterval = 50;
let isPandemic = false;
let pandemicTimer = 0;
let mutationEventCounter = 0; // 突然変異イベントのカウンター

// アニメーション関連の変数
let lastUpdateTime = 0;
let updateInterval = 50; // デフォルトの更新間隔
let animationFrameId = null;
let infoPanelUpdateCounter = 0; // 情報パネル更新カウンターを追加

// ライフサイクル・システム用の変数
let cyclePhase = 'growth';           // 'growth', 'peak', 'decline', 'recovery'
let cycleTimer = 0;                  // サイクルの現在の経過時間（秒）
let cycleTotalTime = 180;            // 合計サイクル時間（3分 = 180秒）
let growthPhaseTime = 60;            // 成長フェーズ時間（1分）
let peakPhaseTime = 60;              // ピークフェーズ時間（1分）
let declinePhaseTime = 30;           // 減少フェーズ時間（30秒）
let recoveryPhaseTime = 30;          // 回復フェーズ時間（30秒）
let lastCycleUpdateTime = 0;         // 最終サイクル更新時間

// パーティクルサイズの定義
const VIRUS_SIZE = 1; // ウイルスのドットサイズ
const CELL_SIZES = {
    wood: 7,   // 成長する性質を反映して中高サイズ
    fire: 4,   // 激しく燃える小さな炎
    earth: 8,  // 安定した大きさ
    metal: 6,  // 堅固な中サイズ
    water: 5   // 流動的な中サイズ
};

const VIRUS_TYPES = ['yin', 'yang', 'mutant', 'lethal'];
const VIRUS_COLORS = { 
    yin: '#9370DB', 
    yang: '#4682B4',
    mutant: '#FF00FF', // 突然変異ウイルス（マゼンタ）
    lethal: '#FF0000'  // 致死性ウイルス（赤）
};
const VIRUS_COUNT = 100; // ウイルスの初期数

const CELL_TYPES = ['wood', 'fire', 'earth', 'metal', 'water'];
// 色の調整
const CELL_COLORS = { 
    wood: '#66BB6A',  // より生き生きとした緑
    fire: '#FF5722',  // より明るい赤/オレンジ
    earth: '#FFC107', // 土の黄色
    metal: '#B0BEC5', // 金属的な銀/灰色
    water: '#29B6F6'  // 透明感のある青
};
const CELL_SHAPES = { wood: 'rect', fire: 'triangle', earth: 'rect', metal: 'circle', water: 'wave' };
const CELL_COUNT = 50; // 細胞の初期数

let entities = [];
let viruses = [];
let cells = [];
let corpses = []; // 死骸を追跡

// サイクル管理のための定数
const MIN_CELLS_FOR_GROWTH = 10;     // 成長フェーズに必要な最小細胞数
const CELLS_PEAK_THRESHOLD = 300;    // ピークフェーズへの移行に必要な細胞数
const CELLS_DECLINE_THRESHOLD = 100; // 減少フェーズの終わりの細胞数しきい値

// キャンバスのリサイズ
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // グリッドサイズの再計算
    CELL_SIZE = BASE_CELL_SIZE;
    GRID_SIZE_X = Math.floor(canvas.width / CELL_SIZE);
    GRID_SIZE_Y = Math.floor(canvas.height / CELL_SIZE);

    initGrid();
}

function initGrid() {
    grid = Array(GRID_SIZE_Y).fill(null).map(() => Array(GRID_SIZE_X).fill(null));
}

// 基本Entityクラス
class Entity {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
    }

    draw() {
        const drawX = this.x * CELL_SIZE;
        const drawY = this.y * CELL_SIZE;
        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
    }
}

// 死骸クラス
class Corpse extends Entity {
    constructor(x, y, cellType, virusType) {
        super(x, y, cellType);
        this.color = 'rgba(50, 50, 50, 0.7)'; // 灰色の死骸
        this.virusType = virusType; // 死因となったウイルスタイプ
        this.decayTime = 60; // 60ターンで消滅（少し早く消えるように調整）
        
        // サイクルフェーズに応じた感染力調整
        let infectiousnessModifier = 1.0;
        if (cyclePhase === 'decline') {
            infectiousnessModifier = 1.5; // 減少フェーズでは死骸の感染力が上昇
        } else if (cyclePhase === 'recovery') {
            infectiousnessModifier = 0.5; // 回復フェーズでは死骸の感染力が低下
        }
        
        // 死骸の感染力を調整（サイクルを考慮）
        this.infectiousness = virusType === 'lethal' ? 0.3 * infectiousnessModifier : 
                              virusType === 'mutant' ? 0.25 * infectiousnessModifier : 0.1 * infectiousnessModifier;
    }
    
    update() {
        this.decayTime--;
        
        // 周囲の細胞に感染の可能性
        const neighborCells = getNeighboringCells(this.x, this.y);
        for (const neighbor of neighborCells) {
            if (neighbor instanceof Cell && !neighbor.immunity) {
                // 死骸からの感染確率（サイクルフェーズに応じて調整）
                let infectionChance = this.infectiousness * 0.5;
                
                if (cyclePhase === 'decline') {
                    infectionChance *= 1.5; // 減少フェーズでは感染率上昇
                } else if (cyclePhase === 'recovery') {
                    infectionChance *= 0.3; // 回復フェーズでは感染率大幅減少
                }
                
                if (Math.random() < infectionChance) {
                    // 抵抗力チェック - バランス調整（木と水を極端に弱く）
                    let resistanceChance = 0;
                    switch(neighbor.type) {
                        case 'metal': resistanceChance = 0.9; break; // 金属は最も高い抵抗力
                        case 'wood': resistanceChance = 0.3; break;  // 木は極めて低い抵抗力
                        case 'water': resistanceChance = 0.1; break; // 水は極めて低い抵抗力
                        case 'fire': resistanceChance = 0.5; break;   // 火は中程度の抵抗力
                        case 'earth': resistanceChance = 0.6; break;  // 土は高めの抵抗力
                    }
                    
                    // サイクルによる調整
                    if (cyclePhase === 'growth') {
                        resistanceChance *= 1.2; // 成長フェーズでは抵抗力上昇
                    } else if (cyclePhase === 'decline') {
                        resistanceChance *= 0.7; // 減少フェーズでは抵抗力低下
                    }
                    
                    // 抵抗力チェック
                    if (Math.random() < resistanceChance) {
                        continue; // 感染を防いだ
                    }
                    
                    // 感染成功
                    neighbor.infected = 20;
                    neighbor.infectedBy = this.virusType;
                    
                    // 木や水の場合は感染が広がりやすい
                    if (neighbor.type === 'wood' || neighbor.type === 'water') {
                        const secondaryNeighbors = getNeighboringCells(neighbor.x, neighbor.y);
                        for (const secNeighbor of secondaryNeighbors) {
                            if (secNeighbor instanceof Cell && !secNeighbor.immunity && 
                                secNeighbor.type === neighbor.type && !secNeighbor.infected) {
                                // 同種間の感染拡大
                                let spreadChance = 0.4; // 基本40%の確率
                                
                                // サイクルによる調整
                                if (cyclePhase === 'decline') {
                                    spreadChance = 0.6; // 減少フェーズでは感染拡大確率上昇
                                } else if (cyclePhase === 'recovery') {
                                    spreadChance = 0.2; // 回復フェーズでは感染拡大確率低下
                                }
                                
                                if (Math.random() < spreadChance) {
                                    secNeighbor.infected = 20;
                                    secNeighbor.infectedBy = this.virusType;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // 減少フェーズでは死骸の寿命が長くなる
        if (cyclePhase === 'decline') {
            return this.decayTime > 0;
        } else if (cyclePhase === 'recovery') {
            // 回復フェーズでは死骸が早く消える
            return this.decayTime > 0 && Math.random() > 0.05;
        } else {
            return this.decayTime > 0;
        }
    }

    draw() {
        const drawX = this.x * CELL_SIZE;
        const drawY = this.y * CELL_SIZE;
        
        // サイズに基づくスケーリング
        const size = (CELL_SIZES[this.type] / 10) * CELL_SIZE * 0.8; // 少し小さめ
        
        // 中心からのオフセット計算
        const offsetX = (CELL_SIZE - size) / 2;
        const offsetY = (CELL_SIZE - size) / 2;
        
        ctx.fillStyle = this.color;
        ctx.beginPath();
        
        // タイプに基づく形状（元の細胞の形を維持）
        switch (CELL_SHAPES[this.type]) {
            case 'rect':
                ctx.fillRect(drawX + offsetX, drawY + offsetY, size, size);
                break;
            case 'circle':
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, size/2, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'triangle':
                ctx.moveTo(drawX + CELL_SIZE/2, drawY + offsetY);
                ctx.lineTo(drawX + CELL_SIZE/2 + size/2, drawY + offsetY + size);
                ctx.lineTo(drawX + CELL_SIZE/2 - size/2, drawY + offsetY + size);
                ctx.closePath();
                ctx.fill();
                break;
            case 'wave':
                ctx.beginPath();
                for (let i = 0; i < 2; i++) {
                    ctx.arc(
                        drawX + CELL_SIZE/2 + (i%2 === 0 ? size/4 : -size/4),
                        drawY + CELL_SIZE/2 + (i * size/4),
                        size/3,
                        i%2 === 0 ? Math.PI : 0,
                        i%2 === 0 ? 0 : Math.PI,
                        true
                    );
                }
                ctx.fill();
                break;
        }
        
        // ウイルスタイプに応じた色のオーバーレイ（弱めの効果）
        const virusColor = VIRUS_COLORS[this.virusType] || 'rgba(255, 0, 255, 0.3)';
        ctx.fillStyle = virusColor;
        ctx.globalAlpha = 0.2; // 弱い効果
        ctx.beginPath();
        ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, size * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// ウイルスクラス
class Virus extends Entity {
    constructor(x, y, type) {
        super(x, y, type);
        this.color = VIRUS_COLORS[type];
        this.size = VIRUS_SIZE;
        
        // 寿命の基本設定
        this.baseLifespan = 80;
        
        // サイクルフェーズに応じた調整
        let lifespanModifier = 1.0;
        let infectionRateModifier = 1.0;
        let lethalityRateModifier = 1.0;
        
        // サイクルフェーズによる特性調整
        if (cyclePhase === 'growth') {
            infectionRateModifier = 0.7;  // 成長フェーズでは感染率低め
            lethalityRateModifier = 0.5;  // 成長フェーズでは致死率低め
            lifespanModifier = 1.2;       // 寿命長め
        } else if (cyclePhase === 'peak') {
            infectionRateModifier = 1.0;  // 標準
            lethalityRateModifier = 1.0;  // 標準
            lifespanModifier = 1.0;       // 標準
        } else if (cyclePhase === 'decline') {
            infectionRateModifier = 1.5;  // 減少フェーズでは感染率高め
            lethalityRateModifier = 1.5;  // 減少フェーズでは致死率高め
            lifespanModifier = 0.8;       // 寿命短め
        } else if (cyclePhase === 'recovery') {
            infectionRateModifier = 0.5;  // 回復フェーズでは感染率低め
            lethalityRateModifier = 0.3;  // 回復フェーズでは致死率低め
            lifespanModifier = 0.7;       // 寿命短め（ウイルスが早く消える）
        }
        
        // ホスト依存性を緩和
        this.requiresHost = true;
        this.hostDepletionRate = 0.2;
        
        // タイプ別の特性（サイクルフェーズによる調整込み）
        if (type === 'yin') {
            this.infectionRate = 0.2 * infectionRateModifier;
            this.groupingFactor = 0.5;
            this.energyDrainFactor = 0.3;
            this.activitySuppression = 0.7;
            this.lethalityRate = 0.01 * lethalityRateModifier;
            this.lifespan = this.baseLifespan * lifespanModifier + Math.floor(Math.random() * 20);
        } else if (type === 'yang') {
            this.infectionRate = 0.1 * infectionRateModifier;
            this.groupingFactor = 0.1;
            this.energyDrainFactor = 1.0;
            this.activityBoost = 1.0;
            this.lethalityRate = 0.005 * lethalityRateModifier;
            this.lifespan = this.baseLifespan * lifespanModifier + Math.floor(Math.random() * 15);
        } else if (type === 'mutant') {
            // 突然変異ウイルス
            this.infectionRate = 0.6 * infectionRateModifier;
            this.groupingFactor = 0.3;
            this.energyDrainFactor = 0.5;
            this.activitySuppression = 0.5;
            this.lethalityRate = 0.03 * lethalityRateModifier;
            this.lifespan = this.baseLifespan * 1.4 * lifespanModifier;
            this.requiresHost = true;
        } else if (type === 'lethal') {
            // 致死性ウイルス
            this.infectionRate = 0.8 * infectionRateModifier;
            this.groupingFactor = 0.4;
            this.energyDrainFactor = 0.8;
            this.activitySuppression = 0.5;
            this.lethalityRate = 0.8 * lethalityRateModifier;
            this.lifespan = this.baseLifespan * 0.5 * lifespanModifier;
            this.requiresHost = true;
        }
        
        // 突然変異確率（サイクルに応じて調整）
        let mutationChanceBase = 0.000005;
        if (cyclePhase === 'peak') {
            mutationChanceBase = 0.0001; // ピーク時に突然変異確率大幅上昇
        } else if (cyclePhase === 'decline') {
            mutationChanceBase = 0.00005; // 減少フェーズでも突然変異はある程度発生
        }
        
        this.mutationChance = mutationChanceBase;
    }

    move() {
        // ホスト依存性の処理
        if (this.requiresHost) {
            const hasNearbyHost = getNeighboringCells(this.x, this.y).some(entity => entity instanceof Cell);
            
            if (!hasNearbyHost) {
                // ホストがいない場合、寿命が減少する速度
                this.lifespan -= this.hostDepletionRate;
            } else {
                // ホストがいる場合、わずかに寿命回復
                this.lifespan += 0.05;
            }
        }
        
        // ウイルスの移動ロジック
        let dx = 0;
        let dy = 0;
        const random = Math.random();
        
        // パンデミック時はより早く移動
        let moveFactor = isPandemic ? 1.3 : 1.0;
        
        // サイクルフェーズによる移動調整
        if (cyclePhase === 'decline') {
            moveFactor *= 1.5; // 減少フェーズでは動きが活発
        } else if (cyclePhase === 'recovery') {
            moveFactor *= 0.7; // 回復フェーズでは動きが鈍くなる
        }
        
        if (this.type === 'yin' || this.type === 'lethal') {
            // 陰ウイルスはランダムに動く
            if (this.type === 'yin') {
                dx = Math.floor(Math.random() * 3) - 1;
                dy = Math.floor(Math.random() * 3) - 1;
            } else { // lethal
                // 致死性ウイルスは少し規則性を残す
                dx = Math.sign(GRID_SIZE_X / 2 - this.x);
                dy = Math.sign(GRID_SIZE_Y / 2 - this.y);
            }
            
            // 他のウイルスの方向へも引き寄せられる
            const nearbyViruses = getNearbyViruses(this.x, this.y, 5);
            if (nearbyViruses.length > 0 && random < this.groupingFactor) {
                // 近くのウイルスの平均位置を計算
                let avgX = 0, avgY = 0;
                for (const virus of nearbyViruses) {
                    avgX += virus.x;
                    avgY += virus.y;
                }
                avgX /= nearbyViruses.length;
                avgY /= nearbyViruses.length;
                
                // その方向へ引き寄せられる
                dx = Math.sign(avgX - this.x);
                dy = Math.sign(avgY - this.y);
            } else if (random < 0.5) {
                // ランダム要素
                dx += Math.floor(Math.random() * 3) - 1;
                dy += Math.floor(Math.random() * 3) - 1;
            }
        } else { // yang または mutant
            if (this.type === 'yang') {
                // 陽ウイルスはランダムに動く
                dx = Math.floor(Math.random() * 3) - 1;
                dy = Math.floor(Math.random() * 3) - 1;
            } else { // mutant
                // 突然変異ウイルスはより広範囲に動く
                dx = Math.floor(Math.random() * 5) - 2;
                dy = Math.floor(Math.random() * 5) - 2;
            }
            
            // より大きなランダム性
            if (random < 0.7) {
                dx = Math.floor(Math.random() * 5) - 2;
                dy = Math.floor(Math.random() * 5) - 2;
            }
        }
        
        // 移動量を適用
        dx = Math.round(dx * moveFactor);
        dy = Math.round(dy * moveFactor);

        // 画面外に出ないように制限
        const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, this.x + dx));
        const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, this.y + dy));

        // 移動
        if (grid[newY][newX] === null) {
            grid[this.y][this.x] = null;
            this.x = newX;
            this.y = newY;
            grid[this.y][this.x] = this;
        }
        
        // 感染ロジック
        this.tryInfection();
        
        // 突然変異イベントチェック
        if (!isPandemic && this.type !== 'mutant' && this.type !== 'lethal') {
            // 通常の自然突然変異
            if (Math.random() < this.mutationChance) {
                this.mutate();
            }
            
            // ピークフェーズでは突然変異イベント確率上昇
            if (cyclePhase === 'peak' && Math.random() < 0.001) {
                mutationEventCounter += 5;
                console.log("Peak phase triggered mutation event!");
            }
            
            // 突然変異イベント
            if (mutationEventCounter > 0 && Math.random() < 0.01) {
                this.mutate();
                mutationEventCounter--;
            }
        }
        
        // ライフスパンの減少（サイクルに応じた調整）
        let lifespanDecreaseRate = 0.2;
        if (cyclePhase === 'decline') {
            lifespanDecreaseRate = 0.15; // 減少フェーズではウイルスの寿命が長くなる
        } else if (cyclePhase === 'recovery') {
            lifespanDecreaseRate = 0.3; // 回復フェーズではウイルスの寿命が短くなる
        }
        
        this.lifespan -= lifespanDecreaseRate;
        
        // 繁殖確率の調整
        let reproductionChance = 0.004;
        
        // サイクルによる繁殖率調整
        if (cyclePhase === 'growth') {
            reproductionChance *= 0.7; // 成長フェーズではウイルス繁殖を抑制
        } else if (cyclePhase === 'peak') {
            reproductionChance *= 1.0; // 標準
        } else if (cyclePhase === 'decline') {
            reproductionChance *= 1.5; // 減少フェーズではウイルス繁殖を促進
        } else if (cyclePhase === 'recovery') {
            reproductionChance *= 0.5; // 回復フェーズではウイルス繁殖を大幅抑制
        }
        
       // ウイルスタイプ別の繁殖率
        switch(this.type) {
            case 'yin': reproductionChance *= 1.5; break;
            case 'yang': reproductionChance *= 1.5; break;
            case 'mutant': reproductionChance *= 1.0; break;
            case 'lethal': 
                // 致死性ウイルスは減少フェーズで特に活発に
                reproductionChance *= cyclePhase === 'decline' ? 3.0 : 2.5;
                break;
        }
        
        // パンデミック中は繁殖率上昇
        if (isPandemic) {
            reproductionChance *= 1.3;
        }
        
        // 宿主依存性
        if (this.requiresHost) {
            const nearbyHosts = getNeighboringCells(this.x, this.y).filter(entity => entity instanceof Cell).length;
            if (nearbyHosts === 0) {
                reproductionChance = 0; // 宿主がいないと繁殖できない
            } else {
                // 宿主が多いほど繁殖率上昇
                reproductionChance *= Math.min(2, nearbyHosts / 3);
            }
        }
        
        if (Math.random() < reproductionChance) {
            this.reproduce();
        }
        
        return this.lifespan > 0;
    }
    
    // 突然変異メソッド
    mutate() {
        // 通常ウイルスが突然変異して高感染性または致死性になる
        let newType;
        
        // サイクルフェーズに応じた突然変異の調整
        if (cyclePhase === 'growth') {
            newType = Math.random() < 0.9 ? 'mutant' : 'lethal'; // 成長フェーズではmutantが主
        } else if (cyclePhase === 'peak') {
            newType = Math.random() < 0.5 ? 'mutant' : 'lethal'; // ピークでは半々
        } else if (cyclePhase === 'decline') {
            newType = Math.random() < 0.2 ? 'mutant' : 'lethal'; // 減少フェーズではlethalが主
        } else {
            newType = Math.random() < 0.8 ? 'mutant' : 'lethal'; // 回復フェーズではmutantが主
        }
        
        console.log(`Virus mutated to ${newType} type! Pandemic may occur!`);
        this.type = newType;
        this.color = VIRUS_COLORS[newType];
        
        // 特性を更新
        if (newType === 'mutant') {
            this.infectionRate = 0.35;
            this.lethalityRate = 0.03;
            this.lifespan += 20;
        } else { // lethal
            this.infectionRate = 0.25;
            this.lethalityRate = 0.15;
            
            // 減少フェーズでは致死性ウイルスの特性が強化される
            if (cyclePhase === 'decline') {
                this.infectionRate = 0.4;
                this.lethalityRate = 0.25;
            }
        }
        
        // パンデミック開始
        startPandemic();
    }
    
    // 感染メソッド
    tryInfection() {
        const neighborCells = getNeighboringCells(this.x, this.y);
        for (const neighbor of neighborCells) {
            if (neighbor instanceof Cell && !neighbor.immunity) {
                // 感染の可能性
                let infectionChance = this.infectionRate;
                
                // パンデミック中は感染率上昇
                if (isPandemic) {
                    infectionChance *= 1.2;
                }
                
                // サイクルフェーズによる感染率調整
                if (cyclePhase === 'growth') {
                    infectionChance *= 0.8; // 成長フェーズでは感染率やや抑制
                } else if (cyclePhase === 'peak') { 
                    infectionChance *= 1.1; // ピークフェーズではやや上昇
                } else if (cyclePhase === 'decline') {
                    infectionChance *= 1.5; // 減少フェーズでは感染率大幅上昇
                } else if (cyclePhase === 'recovery') {
                    infectionChance *= 0.5; // 回復フェーズでは感染率大幅低下
                }
                
                // 細胞タイプごとの抵抗力
                let resistanceChance = 0;
                switch(neighbor.type) {
                    case 'metal': resistanceChance = 0.8; break; // 金属は最も高い抵抗力
                    case 'wood': resistanceChance = 0.05; break; // 木は極めて低い抵抗力
                    case 'water': resistanceChance = 0.04; break; // 水は極めて低い抵抗力
                    case 'fire': resistanceChance = 0.5; break; // 火は中程度の抵抗力
                    case 'earth': resistanceChance = 0.6; break; // 土は高めの抵抗力
                }
                
                // サイクルフェーズによる抵抗力調整
                if (cyclePhase === 'growth') {
                    resistanceChance *= 1.2; // 成長フェーズでは抵抗力上昇
                } else if (cyclePhase === 'decline') {
                    resistanceChance *= 0.6; // 減少フェーズでは抵抗力大幅低下
                } else if (cyclePhase === 'recovery') {
                    resistanceChance *= 1.5; // 回復フェーズでは抵抗力大幅上昇
                }
                
                // 抵抗力チェック
                if (Math.random() < resistanceChance) {
                    continue; // 感染を防いだ
                }
                
                // 感染成功
                if (Math.random() < infectionChance) {
                    if (!neighbor.infected) {
                        neighbor.infected = 20; // 20ターンの感染
                        neighbor.infectedBy = this.type; // 感染源を記録
                        
                        // 感染した細胞が木や水の場合、周囲の同じ種類の細胞に高確率で感染が広がる
                        if (neighbor.type === 'wood' || neighbor.type === 'water') {
                            const secondaryNeighbors = getNeighboringCells(neighbor.x, neighbor.y);
                            for (const secNeighbor of secondaryNeighbors) {
                                if (secNeighbor instanceof Cell && !secNeighbor.immunity && 
                                    secNeighbor.type === neighbor.type && !secNeighbor.infected) {
                                    // 同種間の感染拡大
                                    let spreadChance = 0.6; // 基本60%の確率
                                    
                                    // サイクルによる調整
                                    if (cyclePhase === 'decline') {
                                        spreadChance = 0.8; // 減少フェーズでは感染拡大確率上昇
                                    } else if (cyclePhase === 'recovery') {
                                        spreadChance = 0.3; // 回復フェーズでは感染拡大確率低下
                                    }
                                    
                                    if (Math.random() < spreadChance) {
                                        secNeighbor.infected = 20;
                                        secNeighbor.infectedBy = this.type;
                                    }
                                }
                            }
                        }
                        
                        // ウイルスに少し利益を与える
                        this.lifespan += 8;
                    }
                }
            }
        }
    }
    
    reproduce() {
        const neighbors = getNeighboringEmptyCells(this.x, this.y);
        if (neighbors.length > 0) {
            const [nx, ny] = neighbors[Math.floor(Math.random() * neighbors.length)];
            const newVirus = new Virus(nx, ny, this.type);
            grid[ny][nx] = newVirus;
            entities.push(newVirus);
            viruses.push(newVirus);
            
            // 繁殖で少しエネルギーを消費
            this.lifespan -= 1;
        }
    }

    draw() {
        const drawX = this.x * CELL_SIZE;
        const drawY = this.y * CELL_SIZE;
        
        // サイズに基づいて描画
        const size = this.size * (CELL_SIZE / 5);
        let finalSize = size;
        
        // 突然変異ウイルスと致死性ウイルスは少し大きく
        if (this.type === 'mutant') {
            finalSize = size * 1.3;
        } else if (this.type === 'lethal') {
            finalSize = size * 1.4;
        }
        
        const offsetX = (CELL_SIZE - finalSize) / 2;
        const offsetY = (CELL_SIZE - finalSize) / 2;
        
        ctx.fillStyle = this.color;
        
        // ウイルスタイプ別の形状
        if (this.type === 'mutant') {
            // 星形の突然変異ウイルス
            const spikes = 5;
            const outerRadius = finalSize;
            const innerRadius = finalSize * 0.4;
            
            ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const angle = (Math.PI * 2 * i) / (spikes * 2);
                const x = drawX + CELL_SIZE / 2 + Math.cos(angle) * radius;
                const y = drawY + CELL_SIZE / 2 + Math.sin(angle) * radius;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'lethal') {
            // 刺々しい致死性ウイルス
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.8, 0, Math.PI * 2);
            ctx.fill();
            
            // トゲを追加
            const spikes = 8;
            for (let i = 0; i < spikes; i++) {
                const angle = (Math.PI * 2 * i) / spikes;
                const innerX = drawX + CELL_SIZE/2 + Math.cos(angle) * finalSize * 0.7;
                const innerY = drawY + CELL_SIZE/2 + Math.sin(angle) * finalSize * 0.7;
                const outerX = drawX + CELL_SIZE/2 + Math.cos(angle) * finalSize * 1.3;
                const outerY = drawY + CELL_SIZE/2 + Math.sin(angle) * finalSize * 1.3;
                
                ctx.beginPath();
                ctx.moveTo(innerX, innerY);
                ctx.lineTo(outerX, outerY);
                ctx.lineWidth = finalSize * 0.2;
                ctx.strokeStyle = this.color;
                ctx.stroke();
            }
        } else {
            // 通常のウイルス（円形）
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 発光効果
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        
        // パンデミック中は点滅効果
        if (isPandemic && this.type !== 'yin' && this.type !== 'yang' && Math.random() < 0.3) {
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
        
        // サイクルフェーズに基づく視覚効果
        if (cyclePhase === 'decline' && (this.type === 'mutant' || this.type === 'lethal')) {
            // 減少フェーズでは危険なウイルスに強調効果
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 2.0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
}

// 細胞クラス
class Cell extends Entity {
    constructor(x, y, type) {
        super(x, y, type);
        this.color = CELL_COLORS[type];
        this.shape = CELL_SHAPES[type];
        this.size = CELL_SIZES[type]; // タイプごとのサイズ
        this.energy = 100;
        
        // サイクルフェーズによる寿命調整
        let lifespanModifier = 1.0;
        if (cyclePhase === 'growth') {
            lifespanModifier = 1.3; // 成長フェーズでは寿命長め
        } else if (cyclePhase === 'peak') {
            lifespanModifier = 1.0; // 標準
        } else if (cyclePhase === 'decline') {
            lifespanModifier = 0.7; // 減少フェーズでは寿命短め
        } else if (cyclePhase === 'recovery') {
            lifespanModifier = 1.2; // 回復フェーズでは寿命やや長め
        }
        
        this.maxLifespan = Math.floor(Math.random() * (300 - 100 + 1) + 100) * lifespanModifier;
        this.pulsePhase = Math.random() * Math.PI * 2;
        
        // 感染・免疫関連の属性追加
        this.infected = 0;       // 感染状態（0=未感染、N=感染残りターン数）
        this.infectedBy = null;  // 感染源のウイルスタイプ
        this.immunity = false;   // 免疫状態
        this.immunityTimer = 0;  // 免疫の残りターン数
        
        // 特殊能力の初期化（全タイプ共通）
        this.growthFactor = 0;
        this.energyBurnRate = 0;
        this.recoveryRate = 0;
        this.resistance = 0;
        this.adaptability = 0;
        this.immuneToOverride = false;
        
        // タイプごとの特性（サイクルフェーズも考慮）
        let reproductionModifier = 1.0;
        let activityModifier = 1.0;
        
        // サイクルフェーズによる繁殖率と活動性の調整
        if (cyclePhase === 'growth') {
            reproductionModifier = 1.5; // 成長フェーズでは繁殖率上昇
            activityModifier = 1.2;     // 成長フェーズでは活動性やや上昇
        } else if (cyclePhase === 'peak') {
            reproductionModifier = 1.2; // ピークフェーズでもやや繁殖率上昇
            activityModifier = 1.0;     // 標準
        } else if (cyclePhase === 'decline') {
            reproductionModifier = 0.6; // 減少フェーズでは繁殖率低下
            activityModifier = 0.8;     // 減少フェーズでは活動性低下
        } else if (cyclePhase === 'recovery') {
            reproductionModifier = 0.8; // 回復フェーズでは繁殖率やや低下
            activityModifier = 0.9;     // 回復フェーズでは活動性やや低下
        }
        
        switch(type) {
            case 'wood':
                this.activity = 0.7 * activityModifier;            
                this.energyToReproduce = cyclePhase === 'growth' ? 65 : 75;  // 成長フェーズではエネルギー要件低下
                this.reproductionRate = 0.008 * reproductionModifier;  
                this.maxLifespan = this.maxLifespan * 1.1; 
                this.growthFactor = 0.01;       
                
                // 成長フェーズではさらに成長が促進される
                if (cyclePhase === 'growth') {
                    this.growthFactor = 0.02;
                }
                break;
                
            case 'fire':
                this.activity = 0.9 * activityModifier;            
                this.energyToReproduce = 70;    
                this.reproductionRate = 0.006 * reproductionModifier;  
                this.maxLifespan = this.maxLifespan * 0.7; 
                this.energyBurnRate = 0.02;     
                
                // 減少フェーズでは火のエネルギー消費が特に高まる
                if (cyclePhase === 'decline') {
                    this.energyBurnRate = 0.04;
                }
                break;
                
            case 'earth':
                this.activity = 0.4 * activityModifier;            
                this.energyToReproduce = 75;    
                this.reproductionRate = 0.007 * reproductionModifier;  
                this.maxLifespan = this.maxLifespan * 1.3; 
                this.recoveryRate = 0.008;      
                
                // 回復フェーズでは土の回復力が特に高まる
                if (cyclePhase === 'recovery') {
                    this.recoveryRate = 0.015;
                }
                break;
                
            case 'metal':
                this.activity = 0.5 * activityModifier;            
                this.energyToReproduce = 85;    
                this.reproductionRate = 0.004 * reproductionModifier;  
                this.maxLifespan = this.maxLifespan * 1.6; 
                this.resistance = 0.3;          
                
                // 減少フェーズでは金属の耐性が低下する
                if (cyclePhase === 'decline') {
                    this.resistance = 0.15;
                } else if (cyclePhase === 'recovery') {
                    // 回復フェーズでは金属の耐性が高まる
                    this.resistance = 0.4;
                }
                break;
                
            case 'water':
                this.activity = 0.8 * activityModifier;            
                this.energyToReproduce = 80;    
                this.reproductionRate = 0.004 * reproductionModifier;  
                this.maxLifespan = this.maxLifespan * 0.9; 
                this.adaptability = 0.01;       
                
                // 回復フェーズでは水の適応力が高まる
                if (cyclePhase === 'recovery') {
                    this.adaptability = 0.02;
                }
                break;
        }
        
        this.lifespan = this.maxLifespan;
    }

    move() {
        // 感染の影響を処理
        if (this.infected > 0) {
            // サイクルフェーズによる感染影響の調整
            let energyDrainModifier = 1.0;
            let lifespanDrainModifier = 1.0;
            
            if (cyclePhase === 'growth') {
                energyDrainModifier = 0.8;    // 成長フェーズではエネルギー消費低下
                lifespanDrainModifier = 0.7;  // 成長フェーズでは寿命減少が緩やか
            } else if (cyclePhase === 'peak') {
                energyDrainModifier = 1.0;    // 標準
                lifespanDrainModifier = 1.0;  // 標準
            } else if (cyclePhase === 'decline') {
                energyDrainModifier = 1.5;    // 減少フェーズではエネルギー消費上昇
                lifespanDrainModifier = 1.8;  // 減少フェーズでは寿命急減
            } else if (cyclePhase === 'recovery') {
                energyDrainModifier = 0.6;    // 回復フェーズではエネルギー消費大幅低下
                lifespanDrainModifier = 0.5;  // 回復フェーズでは寿命減少大幅低下
            }
            
            // 感染タイプに応じた効果（サイクル調整含む）
            if (this.infectedBy === 'yin') {
                // 陰ウイルスの効果：抑制的
                this.activity *= 0.7;  // 活動性低下
                this.energy -= 0.5 * energyDrainModifier;    // エネルギー消費
            } else if (this.infectedBy === 'yang') {
                // 陽ウイルスの効果：亢進的
                this.activity *= 1.5;  // 活動性増加
                this.energy -= 0.8 * energyDrainModifier;    // エネルギー消費
            } else if (this.infectedBy === 'mutant') {
                // 突然変異ウイルスの効果：非常に消耗
                this.activity *= 0.6;  // 大きな活動性低下
                this.energy -= 1.0 * energyDrainModifier;    // エネルギー消費
                this.lifespan -= 0.3 * lifespanDrainModifier;  // 寿命減少
            } else if (this.infectedBy === 'lethal') {
                // 致死性ウイルスの効果：致命的
                this.activity *= 0.4;  // 極端な活動性低下
                this.energy -= 1.5 * energyDrainModifier;    // エネルギー消費
                this.lifespan -= 0.5 * lifespanDrainModifier;  // 寿命減少
            }

            
            // 感染の進行
            this.infected--;
            
            // 五行関係への影響を追加
            // ウイルスタイプが陰陽の場合、五行関係に影響
            if (this.infectedBy === 'yin' || this.infectedBy === 'yang') {
                const neighborCells = getNeighboringCells(this.x, this.y);
                for (const cell of neighborCells) {
                    if (cell instanceof Cell) {
                        let relation = getFiveElementsRelation(this.type, cell.type, cell.immuneToOverride);
                        
                        // サイクルフェーズによる調整
                        let effectModifier = 1.0;
                        if (cyclePhase === 'decline') {
                            effectModifier = 1.5; // 減少フェーズでは効果増大
                        } else if (cyclePhase === 'recovery') {
                            effectModifier = 0.7; // 回復フェーズでは効果低下
                        }
                        
                        // 陰ウイルスは相剋（上書き）関係を強化
                        if (this.infectedBy === 'yin' && relation === 'overrides') {
                            this.energy += 0.2 * effectModifier; // 追加エネルギー獲得
                            cell.energy -= 0.3 * effectModifier; // 相手のエネルギーを余分に奪う
                            cell.lifespan -= 0.1 * effectModifier; // 相手の寿命も減少
                        }
                        
                        // 陽ウイルスは相生（生成）関係を強化
                        if (this.infectedBy === 'yang' && relation === 'generates') {
                            this.energy += 0.2 * effectModifier; // 追加エネルギー獲得
                            cell.lifespan += 0.05 * effectModifier; // 追加寿命獲得this->cell
                            cell.energy += 0.1 * effectModifier; // 相手にもエネルギーを少し与える
                        }
                    }
                }
            }
            
            // 回復のチャンス
            let recoveryChance = 0.07; // 基本回復率

            // ウイルスタイプによる回復率調整
            if (this.infectedBy === 'mutant') {
                recoveryChance = 0.04; // 突然変異は回復しにくい
            } else if (this.infectedBy === 'lethal') {
                recoveryChance = 0.02; // 致死性は非常に回復しにくい
            }
            
            // サイクルフェーズによる回復率調整
            if (cyclePhase === 'growth') {
                recoveryChance *= 1.3; // 成長フェーズでは回復率上昇
            } else if (cyclePhase === 'peak') {
                recoveryChance *= 1.1; // ピークフェーズでもやや回復率上昇
            } else if (cyclePhase === 'decline') {
                recoveryChance *= 0.5; // 減少フェーズでは回復率大幅低下
            } else if (cyclePhase === 'recovery') {
                recoveryChance *= 2.0; // 回復フェーズでは回復率大幅上昇
            }
            
            // 細胞タイプによる回復率調整 - バランス調整（木と水の回復率を大幅に下げる）
            switch(this.type) {
                case 'metal': recoveryChance *= 1.5; break; // 金属は回復しやすい（強化）
                case 'wood': 
                    recoveryChance *= cyclePhase === 'growth' ? 0.9 : 0.7; // 成長フェーズでは木の回復率がやや上昇
                    break;
                case 'water': 
                    recoveryChance *= cyclePhase === 'recovery' ? 0.7 : 0.5; // 回復フェーズでは水の回復率がやや上昇
                    break;
                case 'fire': 
                    recoveryChance *= cyclePhase === 'decline' ? 1.2 : 1.0; // 減少フェーズでは火の回復率上昇
                    break;
                case 'earth': 
                    recoveryChance *= cyclePhase === 'recovery' ? 1.8 : 1.3; // 回復フェーズでは土の回復率大幅上昇
                    break;
            }
            
            if (Math.random() < recoveryChance) {
                this.infected = 0;
                this.immunity = true;
                
                // サイクルフェーズによる免疫期間調整
                if (cyclePhase === 'growth' || cyclePhase === 'recovery') {
                    this.immunityTimer = 120; // 成長・回復フェーズでは免疫期間長め
                } else if (cyclePhase === 'decline') {
                    this.immunityTimer = 60;  // 減少フェーズでは免疫期間短め
                } else {
                    this.immunityTimer = 100; // 標準の免疫期間
                }
            }
            
            // 感染による色の変化（視覚効果）
            let alpha = this.infected / 20;
            
            // 致死性や突然変異の場合は強い効果
            if (this.infectedBy === 'lethal' || this.infectedBy === 'mutant') {
                alpha *= 1.5;
            }
            
			this.infectedColor = VIRUS_COLORS[this.infectedBy] || 'rgba(147, 112, 219, 0.5)';

			
			// 致死判定 - 回復しなかった場合の致死率
            let deathChance = 0;
            if (this.infected <= 1) { // 感染最終段階
                if (this.infectedBy === 'yin') deathChance = 0.08;     
                else if (this.infectedBy === 'yang') deathChance = 0.04;
                else if (this.infectedBy === 'mutant') deathChance = 0.2;
                else if (this.infectedBy === 'lethal') deathChance = 0.8;
                
                // サイクルフェーズによる死亡率調整
                if (cyclePhase === 'growth') {
                    deathChance *= 0.7; // 成長フェーズでは死亡率低下
                } else if (cyclePhase === 'peak') {
                    deathChance *= 1.0; // 標準
                } else if (cyclePhase === 'decline') {
                    deathChance *= 1.8; // 減少フェーズでは死亡率大幅上昇
                } else if (cyclePhase === 'recovery') {
                    deathChance *= 0.5; // 回復フェーズでは死亡率大幅低下
                }
                
                // 細胞タイプによる死亡率調整
                if (this.type === 'wood') deathChance *= 1.5; // 木は死亡率が極めて高い
                else if (this.type === 'water') deathChance *= 1.5; // 水は死亡率が極めて高い
                else if (this.type === 'metal') deathChance *= 0.5; // 金属は死亡率が低い
                else if (this.type === 'earth') deathChance *= 0.6; // 土は死亡率が低い
                else if (this.type === 'fire') deathChance *= 0.05; // 火は死亡率が極めて低い
                
                // 体力が低いとさらに死亡リスク上昇
                if (this.energy < 30) deathChance *= 1.5;
                
                if (Math.random() < deathChance) {
                    // 死亡（死骸を残す）
                    const corpse = new Corpse(this.x, this.y, this.type, this.infectedBy);
                    grid[this.y][this.x] = corpse;
                    entities.push(corpse);
                    corpses.push(corpse);
                    return false; // 細胞は死亡
                }
            }
        }
        
        // 免疫タイマーの更新
        if (this.immunityTimer > 0) {
            // サイクルフェーズによる免疫持続調整
            let immunityDecayRate = 1.0; // 標準の減少率
            
            if (cyclePhase === 'growth') {
                immunityDecayRate = 0.8; // 成長フェーズでは免疫が長持ち
            } else if (cyclePhase === 'peak') {
                immunityDecayRate = 1.0; // 標準
            } else if (cyclePhase === 'decline') {
                immunityDecayRate = 1.5; // 減少フェーズでは免疫が早く消える
            } else if (cyclePhase === 'recovery') {
                immunityDecayRate = 0.7; // 回復フェーズでは免疫が特に長持ち
            }
            
            // 型ごとの調整
            if (this.type === 'metal') {
                immunityDecayRate *= 0.8; // 金属は免疫が長持ち
            } else if (this.type === 'wood' || this.type === 'water') {
                immunityDecayRate *= 1.2; // 木と水は免疫が短い
            }
            
            // 少なくとも1は減少
            let decrease = Math.max(1, Math.floor(immunityDecayRate));
            this.immunityTimer -= decrease;
            
            if (this.immunityTimer <= 0) {
                this.immunity = false;
                this.immunityTimer = 0;
            }
        }
        
        // 活動性に基づく移動
        if (Math.random() < this.activity) {
            // サイクルフェーズによる動きの調整
            let moveRange = 1; // 標準の移動範囲
            if (cyclePhase === 'growth') {
                moveRange = Math.random() < 0.3 ? 2 : 1; // 成長フェーズではより活発に
            } else if (cyclePhase === 'decline') {
                moveRange = Math.random() < 0.7 ? 1 : 0; // 減少フェーズでは動きが鈍くなる
            }
            
            const dx = Math.floor(Math.random() * (moveRange * 2 + 1)) - moveRange;
            const dy = Math.floor(Math.random() * (moveRange * 2 + 1)) - moveRange;
            const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, this.x + dx));
            const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, this.y + dy));

            // 隣接するセルを検査して、五行相生相剋の関係を調べる
            const neighborCells = getNeighboringCells(this.x, this.y);
            for (const cell of neighborCells) {
                if (cell instanceof Cell) {
                    // 金属の免疫特性を考慮
                    const relation = getFiveElementsRelation(this.type, cell.type, cell.immuneToOverride);
                    
                    // サイクルフェーズによる相互作用の調整
                    let interactionModifier = 1.0;
                    if (cyclePhase === 'growth') {
                        interactionModifier = 1.2; // 成長フェーズでは相互作用強化
                    } else if (cyclePhase === 'peak') {
                        interactionModifier = 1.0; // 標準
                    } else if (cyclePhase === 'decline') {
                        interactionModifier = 0.8; // 減少フェーズでは相互作用低下
                    } else if (cyclePhase === 'recovery') {
                        interactionModifier = 1.1; // 回復フェーズではやや強化
                    }
                    
                    if (relation === 'generates') {
                        this.energy += 0.3 * interactionModifier;
                        this.lifespan += 0.1 * interactionModifier;
                    } else if (relation === 'overrides') {
                        this.energy -= 0.2 * interactionModifier;
                        this.lifespan -= 0.05 * interactionModifier;
                    }
                }
            }

            // 移動先チェック
            if (grid[newY][newX] === null) {
                grid[this.y][this.x] = null;
                this.x = newX;
                this.y = newY;
                grid[this.y][this.x] = this;
            } else if (grid[newY][newX] instanceof Corpse) {
                // 死骸の上に移動できるが感染リスクあり
                const corpse = grid[newY][newX];
                
                // 死骸からの感染確率
                if (!this.immunity && Math.random() < corpse.infectiousness) {
                    this.infected = 20;
                    this.infectedBy = corpse.virusType;
                }
                
                // 死骸を削除し、移動
                const corpseIndex = corpses.indexOf(corpse);
                if (corpseIndex > -1) {
                    corpses.splice(corpseIndex, 1);
                }
                
                const entityIndex = entities.indexOf(corpse);
                if (entityIndex > -1) {
                    entities.splice(entityIndex, 1);
                }
                
                grid[this.y][this.x] = null;
                this.x = newX;
                this.y = newY;
                grid[this.y][this.x] = this;
            }
        }
        
        // ★★★ タイプごとの特殊能力（サイクルフェーズによって調整） ★★★
        switch(this.type) {
            case 'wood':
                // 成長の性質：近くに空きスペースがあると成長してエネルギー回復
                let emptySpaces = getNeighboringEmptyCells(this.x, this.y).length;
                let growthModifier = 1.0;
                
                // 成長フェーズでは木の成長力が特に高まる
                if (cyclePhase === 'growth') {
                    growthModifier = 2.0;
                    // 成長フェーズでは少ない空きスペースでも成長できる
                    if (emptySpaces > 1) {
                        this.energy += this.growthFactor * growthModifier;
                    }
                } else if (cyclePhase === 'decline') {
                    growthModifier = 0.5; // 減少フェーズでは成長力低下
                } else if (cyclePhase === 'recovery') {
                    growthModifier = 1.5; // 回復フェーズでは成長力上昇
                }
                
                if (emptySpaces > 3) {
                    this.energy += this.growthFactor * growthModifier;
                }
                break;
                
            case 'fire':
                // 熱の性質：エネルギーを速く消費するが、活動的
                let burnModifier = 1.0;
                
                // サイクルに応じたエネルギー消費調整
                if (cyclePhase === 'growth') {
                    burnModifier = 0.8; // 成長フェーズではエネルギー消費低下
                } else if (cyclePhase === 'peak') {
                    burnModifier = 1.0; // 標準
                } else if (cyclePhase === 'decline') {
                    burnModifier = 1.5; // 減少フェーズではエネルギー消費上昇
                } else if (cyclePhase === 'recovery') {
                    burnModifier = 0.7; // 回復フェーズではエネルギー消費大幅低下
                }
                
                this.energy -= this.energyBurnRate * burnModifier;
                
                // 明るさで周囲に影響
                const nearbyEntities = getNeighboringCells(this.x, this.y);
                for (const entity of nearbyEntities) {
                    if (entity instanceof Cell && entity.type === 'wood') {
                        // 減少フェーズでは火が木に与える影響が強くなる
                        let effectStrength = cyclePhase === 'decline' ? 0.02 : 0.01;
                        entity.energy -= effectStrength; // 木に燃え移る
                    }
                }
                break;
                
            case 'earth':
                // 安定の性質：定期的にエネルギー回復
                let recoveryModifier = 1.0;
                let recoveryChance = 0.1;
                
                // サイクルに応じた回復力調整
                if (cyclePhase === 'growth') {
                    recoveryModifier = 1.2; // 成長フェーズでは回復力上昇
                } else if (cyclePhase === 'peak') {
                    recoveryModifier = 1.0; // 標準
                } else if (cyclePhase === 'decline') {
                    recoveryModifier = 0.7; // 減少フェーズでは回復力低下
                    recoveryChance = 0.08; // 回復確率も低下
                } else if (cyclePhase === 'recovery') {
                    recoveryModifier = 1.8; // 回復フェーズでは回復力大幅上昇
                    recoveryChance = 0.15; // 回復確率も上昇
                }
                
                if (Math.random() < recoveryChance) {
                    this.energy += this.recoveryRate * recoveryModifier;
                }
                break;
                
            case 'metal':
                // 堅固の性質：外部からの影響を受けにくい
                let resistanceModifier = 1.0;
                
                // サイクルに応じた耐性調整
                if (cyclePhase === 'growth') {
                    resistanceModifier = 1.1; // 成長フェーズでは耐性やや上昇
                } else if (cyclePhase === 'peak') {
                    resistanceModifier = 1.0; // 標準
                } else if (cyclePhase === 'decline') {
                    resistanceModifier = 0.6; // 減少フェーズでは耐性大幅低下
                } else if (cyclePhase === 'recovery') {
                    resistanceModifier = 1.3; // 回復フェーズでは耐性上昇
                }
                
                if (Math.random() < this.resistance * resistanceModifier) {
                    // 相剋関係の影響を一定確率で無効化
                    this.immuneToOverride = true;
                } else {
                    this.immuneToOverride = false;
                }
                break;
                
            case 'water':
                // 適応力：環境に応じてエネルギー消費調整
                let adaptabilityModifier = 1.0;
                
                // サイクルに応じた適応力調整
                if (cyclePhase === 'growth') {
                    adaptabilityModifier = 1.2; // 成長フェーズでは適応力上昇
                } else if (cyclePhase === 'peak') {
                    adaptabilityModifier = 1.0; // 標準
                } else if (cyclePhase === 'decline') {
                    adaptabilityModifier = 0.8; // 減少フェーズでは適応力低下
                } else if (cyclePhase === 'recovery') {
                    adaptabilityModifier = 1.5; // 回復フェーズでは適応力大幅上昇
                }
                
                const surroundingCount = getNeighboringCells(this.x, this.y).length;
                if (surroundingCount > 4) {
                    // 混雑した場所でのエネルギー消費（減少フェーズでは特に厳しい）
                    let consumptionRate = cyclePhase === 'decline' ? 0.02 : 0.01;
                    this.energy -= consumptionRate;
                } else {
                    // 空いた場所での回復
                    this.energy += this.adaptability * adaptabilityModifier * (4 - surroundingCount);
                }
                break;
        }
        
        // エネルギーと寿命の減少（サイクルフェーズに応じて調整）
        let energyDecayRate = Math.floor(Math.random() * 2 + 1) / 100;
        let lifespanDecayRate = 0.05;
        
        // サイクルフェーズによるエネルギーと寿命の減少率調整
        if (cyclePhase === 'growth') {
            energyDecayRate *= 0.7; // 成長フェーズではエネルギー消費低下
            lifespanDecayRate *= 0.8; // 成長フェーズでは寿命減少率低下
        } else if (cyclePhase === 'peak') {
            energyDecayRate *= 1.0; // 標準
            lifespanDecayRate *= 1.0; // 標準
        } else if (cyclePhase === 'decline') {
            energyDecayRate *= 1.5; // 減少フェーズではエネルギー消費上昇
            lifespanDecayRate *= 1.5; // 減少フェーズでは寿命減少率上昇
        } else if (cyclePhase === 'recovery') {
            energyDecayRate *= 0.8; // 回復フェーズではエネルギー消費やや低下
            lifespanDecayRate *= 0.7; // 回復フェーズでは寿命減少率大幅低下
        }
        
        this.energy -= energyDecayRate;
        this.lifespan -= lifespanDecayRate;
        
        // 脈動を更新（サイクルフェーズによって脈動速度を調整）
        let pulseSpeed = 0.1;
        if (cyclePhase === 'growth' || cyclePhase === 'peak') {
            pulseSpeed = 0.12; // 成長・ピークフェーズでは脈動速度上昇
        } else if (cyclePhase === 'decline') {
            pulseSpeed = 0.08; // 減少フェーズでは脈動速度低下
        }
        
        this.pulsePhase += pulseSpeed;
        if (this.pulsePhase > Math.PI * 2) {
            this.pulsePhase = 0;
        }
        
        // 死亡判定（サイクルフェーズによって調整）
        let deathThreshold = 0;
        
        if (cyclePhase === 'decline') {
            deathThreshold = 5; // 減少フェーズではエネルギーが少し残っていても死亡する可能性
        }
        
        if (this.energy < deathThreshold || this.lifespan < 0) {
            // 減少フェーズでは死亡時に死骸を残す確率が高い
            if (cyclePhase === 'decline' && Math.random() < 0.7) {
                const corpse = new Corpse(this.x, this.y, this.type, null);
                grid[this.y][this.x] = corpse;
                entities.push(corpse);
                corpses.push(corpse);
            } else {
                grid[this.y][this.x] = null;
            }
            return false;
        }

        // 繁殖（サイクルフェーズによって調整）
        let reproductionThreshold = this.energyToReproduce;
        let reproductionProbability = this.reproductionRate;
        
        // サイクルフェーズによる繁殖しやすさの調整
        if (cyclePhase === 'growth') {
            reproductionThreshold *= 0.9; // 成長フェーズでは繁殖に必要なエネルギー低下
            reproductionProbability *= 1.5; // 成長フェーズでは繁殖確率上昇
        } else if (cyclePhase === 'peak') {
            reproductionThreshold *= 0.95; // ピークフェーズでもやや繁殖しやすい
            reproductionProbability *= 1.2; // ピークフェーズでも繁殖確率やや上昇
        } else if (cyclePhase === 'decline') {
            reproductionThreshold *= 1.1; // 減少フェーズでは繁殖に必要なエネルギー上昇
            reproductionProbability *= 0.5; // 減少フェーズでは繁殖確率大幅低下
        } else if (cyclePhase === 'recovery') {
            reproductionThreshold *= 1.0; // 標準
            reproductionProbability *= 0.8; // 回復フェーズでは繁殖確率やや低下
        }
        
        if (this.energy > reproductionThreshold && Math.random() < reproductionProbability) {
            this.reproduce();
        }
        
        return true;
    }
    
    reproduce() {
        const neighbors = getNeighboringEmptyCells(this.x, this.y);
        if (neighbors.length > 0) {
            const [nx, ny] = neighbors[Math.floor(Math.random() * neighbors.length)];
            
            // 突然変異のチャンス（サイクルフェーズによって調整）
            let mutationChance = 0.2; // 基本20%の突然変異確率
            
            if (cyclePhase === 'growth') {
                mutationChance = 0.15; // 成長フェーズでは突然変異が少ない
            } else if (cyclePhase === 'peak') {
                mutationChance = 0.25; // ピークフェーズでは突然変異が多い
            } else if (cyclePhase === 'decline') {
                mutationChance = 0.3; // 減少フェーズでは突然変異が特に多い
            } else if (cyclePhase === 'recovery') {
                mutationChance = 0.1; // 回復フェーズでは突然変異が少ない
            }
            
            const childType = Math.random() < (1 - mutationChance) ? this.type : CELL_TYPES[Math.floor(Math.random() * CELL_TYPES.length)];
            const newCell = new Cell(nx, ny, childType);
            
            if (this.generation !== undefined) {
                newCell.generation = this.generation + 1;
            } else {
                newCell.generation = 1;
            }
            
            // 免疫を子に伝える可能性（サイクルフェーズによって調整）
            let immunityTransferChance = 0.3; // 基本30%の免疫継承確率
            
            if (cyclePhase === 'recovery') {
                immunityTransferChance = 0.5; // 回復フェーズでは免疫継承確率上昇
            } else if (cyclePhase === 'decline') {
                immunityTransferChance = 0.2; // 減少フェーズでは免疫継承確率低下
            }
            
            if (this.immunity && Math.random() < immunityTransferChance) {
                newCell.immunity = true;
                
                // サイクルフェーズによる免疫期間調整
                if (cyclePhase === 'growth' || cyclePhase === 'recovery') {
                    newCell.immunityTimer = 60; // 成長・回復フェーズでも子の免疫は短め
                } else {
                    newCell.immunityTimer = 50; // 標準の子の免疫期間
                }
            }
            
            grid[ny][nx] = newCell;
            entities.push(newCell);
            cells.push(newCell);
            
            // 繁殖によるエネルギー消費（サイクルフェーズによって調整）
            let reproductionCost = 30;
            
            if (cyclePhase === 'growth') {
                reproductionCost = 25; // 成長フェーズでは繁殖コスト低下
            } else if (cyclePhase === 'decline') {
                reproductionCost = 35; // 減少フェーズでは繁殖コスト上昇
            }
            
            this.energy -= reproductionCost;
        }
    }
    
    draw() {
        const drawX = this.x * CELL_SIZE;
        const drawY = this.y * CELL_SIZE;
        
        // サイズに基づくスケーリング
        const size = (this.size / 10) * CELL_SIZE;
        
        // サイクルフェーズによる脈動効果の調整
        let pulseAmplitude = 0.1; // 標準の脈動幅
        
        if (cyclePhase === 'growth') {
            pulseAmplitude = 0.15; // 成長フェーズでは脈動が大きい
        } else if (cyclePhase === 'peak') {
            pulseAmplitude = 0.12; // ピークフェーズでもやや大きい
        } else if (cyclePhase === 'decline') {
            pulseAmplitude = 0.05; // 減少フェーズでは脈動が小さい
        } else if (cyclePhase === 'recovery') {
            pulseAmplitude = 0.08; // 回復フェーズでは脈動が中程度
        }
        
        const pulseFactor = 1 + pulseAmplitude * Math.sin(this.pulsePhase);
        const finalSize = size * pulseFactor;
        
        // 中心からのオフセット計算
        const offsetX = (CELL_SIZE - finalSize) / 2;
        const offsetY = (CELL_SIZE - finalSize) / 2;
        
        ctx.fillStyle = this.color;
        ctx.beginPath();
        
        // タイプに基づく形状
        switch (this.shape) {
            case 'rect': // 木または土
                if (this.type === 'wood') {
                    // 縦長の四角形（成長を表現）
                    ctx.fillRect(drawX + offsetX, drawY + offsetY, finalSize * 0.7, finalSize * 1.2);
                } else { // 土
                    // しっかりした正方形
                    ctx.fillRect(drawX + offsetX, drawY + offsetY, finalSize, finalSize);
                }
                break;
            case 'circle': // 金
                // 堅固な円
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize/2, 0, Math.PI * 2);
                ctx.fill();
                // 金属光沢を表現
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize/2 * 0.8, 0, Math.PI * 0.5);
                ctx.stroke();
                break;
            case 'triangle': // 火
                // 上向きの三角形（炎を表現）
                ctx.moveTo(drawX + CELL_SIZE/2, drawY + offsetY);
                ctx.lineTo(drawX + CELL_SIZE/2 + finalSize/2, drawY + offsetY + finalSize);
                ctx.lineTo(drawX + CELL_SIZE/2 - finalSize/2, drawY + offsetY + finalSize);
                ctx.closePath();
                ctx.fill();
                break;
            case 'wave': // 水
                // より流動的な波形
                ctx.beginPath();
                for (let i = 0; i < 2; i++) {
                    ctx.arc(
                        drawX + CELL_SIZE/2 + (i%2 === 0 ? finalSize/4 : -finalSize/4),
                        drawY + CELL_SIZE/2 + (i * finalSize/4),
                        finalSize/3,
                        i%2 === 0 ? Math.PI : 0,
                        i%2 === 0 ? 0 : Math.PI,
                        true
                    );
                }
                ctx.fill();
                break;
        }
        
        // 感染状態の視覚効果を追加
        if (this.infected > 0) {
            ctx.globalAlpha = Math.min(0.7, this.infected / 15);
            ctx.fillStyle = this.infectedColor;
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
        
        // 免疫状態の視覚効果
        if (this.immunity) {
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
        
        // エネルギーレベルを示す発光効果
        const energyRatio = this.energy / 100;
        if (energyRatio > 0.7) {
            ctx.globalAlpha = 0.3 * energyRatio;
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
        
        // サイクルフェーズに基づく視覚効果
        if (cyclePhase === 'growth' && this.type === 'wood') {
            // 成長フェーズでは木が特に輝く
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = '#98FB98'; // 明るい緑
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
		} else if (cyclePhase === 'decline' && (this.type === 'wood' || this.type === 'water')) {
            // 減少フェーズでは木と水が弱っている
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#8B0000'; // 暗い赤
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        } else if (cyclePhase === 'recovery' && (this.type === 'earth' || this.type === 'metal')) {
            // 回復フェーズでは土と金属が特に輝く
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = '#FFD700'; // 金色
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 1.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
}

// サイクルフェーズの色を取得
function getCyclePhaseColor() {
    switch(cyclePhase) {
        case 'growth': return '#4CAF50'; // 緑
        case 'peak': return '#2196F3';    // 青
        case 'decline': return '#FF5722'; // 赤/オレンジ
        case 'recovery': return '#FFC107'; // 黄色
        default: return '#FFFFFF';
    }
}

// drawBackground関数の修正
function drawBackground() {
    // サイクルフェーズに応じた背景色
    let innerColor, outerColor;
    
    switch(cyclePhase) {
        case 'growth':
            innerColor = '#1e2a20'; // 緑がかった暗色
            outerColor = '#141a15'; // より暗い緑
            break;
        case 'peak':
            innerColor = '#1a2a2e'; // 青みがかった暗色
            outerColor = '#0f1a1e'; // より暗い青
            break;
        case 'decline':
            innerColor = '#2a1a1a'; // 赤みがかった暗色
            outerColor = '#1a0f0f'; // より暗い赤
            break;
        case 'recovery':
            innerColor = '#272720'; // 黄色みがかった暗色
            outerColor = '#1a1a14'; // より暗い黄
            break;
        default:
            innerColor = '#1a1a2e'; // デフォルト（暗い青）
            outerColor = '#0f0f1a';
    }
    
    // パンデミック中は色を微調整
    if (isPandemic) {
        innerColor = '#2a1a20'; // 赤みが増す
        outerColor = '#1a0f15';
    }
    
    // 背景グラデーション
    const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
    );
    
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(1, outerColor);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    
    // グリッドライン（オプション）
    if (BASE_CELL_SIZE >= 5) {
        ctx.strokeStyle = 'rgba(50, 50, 80, 0.1)';
        ctx.lineWidth = 0.5;
        
        for (let x = 0; x < canvas.width; x += CELL_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        
        for (let y = 0; y < canvas.height; y += CELL_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }
    
    // サイクルフェーズに応じたエフェクト追加
    if (cyclePhase === 'decline' && isPandemic) {
        // 減少フェーズ＋パンデミック時には赤い霧効果
        ctx.fillStyle = 'rgba(255, 0, 0, 0.03)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (cyclePhase === 'recovery') {
        // 回復フェーズには少し明るめの効果
        ctx.fillStyle = 'rgba(255, 255, 200, 0.01)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// 情報パネル更新関数
function updateInfoPanel() {
    // ウイルス数
    const yinCount = viruses.filter(virus => virus.type === 'yin').length;
    const yangCount = viruses.filter(virus => virus.type === 'yang').length;
    const mutantCount = viruses.filter(virus => virus.type === 'mutant').length;
    const lethalCount = viruses.filter(virus => virus.type === 'lethal').length;
    
    virusCountDisplay.textContent = `Viruses: ${viruses.length} (Yin: ${yinCount}, Yang: ${yangCount}, Mutant: ${mutantCount}, Lethal: ${lethalCount})`;
    
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
        
        // パンデミック状態の表示
        if (isPandemic) {
            populationBarsHTML += `<div style="margin-top: 5px; color: red; font-weight: bold;">
                ! PANDEMIC ACTIVE: ${pandemicTimer} turns remaining
            </div>`;
        }
        
        // 変異イベント情報
        if (mutationEventCounter > 0) {
            populationBarsHTML += `<div style="margin-top: 5px; color: magenta; font-weight: bold;">
                ! Mutation Event Active (${mutationEventCounter})
            </div>`;
        }
        
        // サイクルフェーズ情報
        populationBarsHTML += `<div style="margin-top: 5px; font-weight: bold; color: ${getCyclePhaseColor()};">
            Phase: ${cyclePhase} (${Math.floor(cycleTimer)}s / ${cycleTotalTime}s)
        </div>`;
    } else {
        populationBarsHTML = '<div>No cells alive</div>';
    }
    
    populationBarsDisplay.innerHTML = populationBarsHTML;
}

// 初期化関数
function init() {
    resizeCanvas();
    entities = [];
    viruses = [];
    cells = [];
    corpses = [];
    isPandemic = false;
    pandemicTimer = 0;
    mutationEventCounter = 0;
    infoPanelUpdateCounter = 0;
    
    // サイクル変数の初期化
    cyclePhase = 'growth';
    cycleTimer = 0;
    lastCycleUpdateTime = performance.now() / 1000;

    // ウイルスの初期配置
    for (let i = 0; i < VIRUS_COUNT; i++) {
        let x = Math.floor(Math.random() * GRID_SIZE_X);
        let y = Math.floor(Math.random() * GRID_SIZE_Y);
        const type = VIRUS_TYPES[Math.floor(Math.random() * 2)]; // 最初はyinとyangのみ
        const newVirus = new Virus(x, y, type);
        if (grid[y][x] === null) {
            grid[y][x] = newVirus;
            entities.push(newVirus);
            viruses.push(newVirus);
        }
    }

    // 単細胞生物の初期配置
    for (let i = 0; i < CELL_COUNT; i++) {
        // 中央付近により集中させる
        let x = Math.floor(GRID_SIZE_X/2 + (Math.random() - 0.5) * GRID_SIZE_X * 0.6);
        let y = Math.floor(GRID_SIZE_Y/2 + (Math.random() - 0.5) * GRID_SIZE_Y * 0.6);
        x = Math.max(0, Math.min(GRID_SIZE_X - 1, x));
        y = Math.max(0, Math.min(GRID_SIZE_Y - 1, y));
        
        const type = CELL_TYPES[Math.floor(Math.random() * CELL_TYPES.length)];
        const newCell = new Cell(x, y, type);
        if (grid[y][x] === null) {
            grid[y][x] = newCell;
            entities.push(newCell);
            cells.push(newCell);
        }
    }

    turn = 0;
    turnCounterDisplay.textContent = `Turn: ${turn}`;
    updateInfoPanel();
    isRunning = false;
}

// メインアップデート関数
function update() {
    // ライフサイクルの更新
    updateLifecycle();
    
    // パンデミック状態の更新
    updatePandemic();
    
    // 突然変異イベントのチェック
    triggerMutationEvent();
    
    // エンティティのリストの一時コピーを使用して、安全に削除できるようにする
    const entitiesCopy = [...entities];
    
    // ウイルスの処理
    for (let i = viruses.length - 1; i >= 0; i--) {
        const isAlive = viruses[i].move();
        if (!isAlive || viruses[i].lifespan <= 0) {
            grid[viruses[i].y][viruses[i].x] = null;
            
            // entitiesから削除
            const indexInEntities = entities.indexOf(viruses[i]);
            if (indexInEntities > -1) {
                entities.splice(indexInEntities, 1);
            }
            
            // virusesから削除
            viruses.splice(i, 1);
        }
    }

    // 細胞の処理
    for (let i = cells.length - 1; i >= 0; i--) {
        const isAlive = cells[i].move();
        if (!isAlive) {
            // cellsから削除
            const indexInEntities = entities.indexOf(cells[i]);
            if (indexInEntities > -1) {
                entities.splice(indexInEntities, 1);
            }
            cells.splice(i, 1);
        }
    }
    
    // 死骸の処理
    for (let i = corpses.length - 1; i >= 0; i--) {
        const isPresent = corpses[i].update();
        if (!isPresent) {
            grid[corpses[i].y][corpses[i].x] = null;
            
            // entitiesから削除
            const indexInEntities = entities.indexOf(corpses[i]);
            if (indexInEntities > -1) {
                entities.splice(indexInEntities, 1);
            }
            
            // corpseから削除
            corpses.splice(i, 1);
        }
    }

    // 新しいウイルスを生成（サイクルフェーズに応じて調整）
    let baseVirusGenerationChance = 0.02;
    
    // サイクルフェーズによる生成率調整
    if (cyclePhase === 'growth') {
        baseVirusGenerationChance = 0.015; // 成長フェーズではウイルス生成を抑制
    } else if (cyclePhase === 'peak') {
        baseVirusGenerationChance = 0.02; // 標準
    } else if (cyclePhase === 'decline') {
        baseVirusGenerationChance = 0.03; // 減少フェーズではウイルス生成率上昇
    } else if (cyclePhase === 'recovery') {
        baseVirusGenerationChance = 0.01; // 回復フェーズではウイルス生成を大幅抑制
    }
    
    // 細胞と現在のウイルスの比率に基づいて調整
    let adjustedChance = baseVirusGenerationChance;
    
    // 細胞が少ないかウイルスが多い場合は生成確率を下げる
    const cellToVirusRatio = cells.length / Math.max(1, viruses.length);
    if (cellToVirusRatio < 0.5) {
        adjustedChance *= 0.2; // 細胞が少なすぎる場合、ウイルス生成を大幅抑制
    } else if (cellToVirusRatio < 1) {
        adjustedChance *= 0.5; // 細胞がウイルスより少ない場合、生成を抑制
    } else if (cellToVirusRatio > 5) {
        adjustedChance *= 1.5; // 細胞が十分ある場合、生成を促進
    }
    
    // ウイルスの最大数を細胞数の2倍に制限
    const maxViruses = Math.max(VIRUS_COUNT, cells.length * 2);
    
    if (viruses.length < maxViruses && Math.random() < adjustedChance) {
        let x, y;
        if (Math.random() < 0.5) {
            // 画面の端から生成
            const side = Math.floor(Math.random() * 4); // 0: 上, 1: 右, 2: 下, 3: 左
            switch(side) {
                case 0: x = Math.floor(Math.random() * GRID_SIZE_X); y = 0; break;
                case 1: x = GRID_SIZE_X - 1; y = Math.floor(Math.random() * GRID_SIZE_Y); break;
                case 2: x = Math.floor(Math.random() * GRID_SIZE_X); y = GRID_SIZE_Y - 1; break;
                case 3: x = 0; y = Math.floor(Math.random() * GRID_SIZE_Y); break;
            }
        } else {
            // ランダムな位置から生成
            x = Math.floor(Math.random() * GRID_SIZE_X);
            y = Math.floor(Math.random() * GRID_SIZE_Y);
        }
        
        if (grid[y][x] === null) {
            // パンデミック中は危険なウイルス出現率上昇
            let typeOptions;
            if (isPandemic) {
                typeOptions = Math.random() < 0.2 ? 
                    ['mutant', 'lethal'] : ['yin', 'yang', 'mutant', 'lethal'];
            } else {
                typeOptions = Math.random() < 0.005 ? 
                    ['mutant', 'lethal'] : ['yin', 'yang'];
            }
            
            // サイクルフェーズによるウイルスタイプ調整
            if (cyclePhase === 'decline' && Math.random() < 0.3) {
                typeOptions = ['lethal']; // 減少フェーズでは致死性ウイルスが特に出やすい
            } else if (cyclePhase === 'peak' && Math.random() < 0.2) {
                typeOptions = ['mutant']; // ピークフェーズでは突然変異ウイルスが出やすい
            }
            
            const type = typeOptions[Math.floor(Math.random() * typeOptions.length)];
            const newVirus = new Virus(x, y, type);
            grid[y][x] = newVirus;
            entities.push(newVirus);
            viruses.push(newVirus);
        }
    }

    turn++;
    
    // 情報パネルの更新頻度を下げる
    infoPanelUpdateCounter++;
    if (infoPanelUpdateCounter >= 10) {
        updateInfoPanel();
        infoPanelUpdateCounter = 0;
    } else {
        // ターンカウンターだけは毎回更新
        turnCounterDisplay.textContent = `Turn: ${turn}`;
    }
}

// 描画関数
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 背景は高速モードでは省略可能
    const speed = parseInt(speedSlider.value);
    if (speed < 100) {
        drawBackground();
    }
    
    // 描画の最適化 - 画面上の要素のみを描画
    for (let entity of entities) {
        entity.draw();
    }
}

// ゲーム開始関数
function startGame() {
    if (!isRunning) {
        isRunning = true;
        startButton.classList.add('active');
        pauseButton.classList.remove('active');
        lastUpdateTime = performance.now();
        lastCycleUpdateTime = performance.now() / 1000; // サイクルタイマーも更新
        updateInterval = baseInterval / parseInt(speedSlider.value);
        animationLoop();
    }
}

// ゲーム一時停止関数
function pauseGame() {
    if (isRunning) {
        isRunning = false;
        startButton.classList.remove('active');
        pauseButton.classList.add('active');
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }
}

// アニメーションループ関数
function animationLoop(timestamp) {
    if (!isRunning) return;

    animationFrameId = requestAnimationFrame(animationLoop);
    
    const elapsed = timestamp - lastUpdateTime;
    
    // 更新間隔に達したら更新処理を実行
    if (elapsed >= updateInterval) {
        // 経過時間に応じて複数回のupdateを実行（高速シミュレーション時）
        const updateCount = Math.min(10, Math.floor(elapsed / updateInterval));
        
        for (let i = 0; i < updateCount; i++) {
            update();
        }
        
        draw();
        lastUpdateTime = timestamp - (elapsed % updateInterval);
    }
}

// イベントリスナー
startButton.addEventListener('click', startGame);
pauseButton.addEventListener('click', pauseGame);
resetButton.addEventListener('click', () => {
    pauseGame();
    init();
    draw();
});

// スピードスライダーのイベントリスナー
speedSlider.addEventListener('input', () => {
    const speed = parseInt(speedSlider.value);
    speedValueDisplay.textContent = `x${speed}`;
    updateInterval = baseInterval / speed;
    
    // 変更時にもアニメーションを継続
    if (isRunning) {
        lastUpdateTime = performance.now();
    }
});

// セルサイズスライダーのイベントリスナー
cellSizeSlider.addEventListener('input', () => {
    cellSizeValueDisplay.textContent = `x${cellSizeSlider.value}`;
    BASE_CELL_SIZE = parseInt(cellSizeSlider.value);
    
    // グリッドサイズの再計算
    pauseGame();
    resizeCanvas();
    init();
    draw();
});

// リサイズイベントリスナー
window.addEventListener('resize', () => {
    pauseGame();
    resizeCanvas();
    init();
    draw();
});

// 五行の相生相剋関係
function getFiveElementsRelation(type1, type2, immuneFlag = false) {
    const relations = {
        wood: { generates: 'fire', overrides: 'earth' },
        fire: { generates: 'earth', overrides: 'metal' },
        earth: { generates: 'metal', overrides: 'water' },
        metal: { generates: 'water', overrides: 'wood' },
        water: { generates: 'wood', overrides: 'fire' }
    };
    
    // 金属の免疫が発動している場合、上書き関係を無視
    if (immuneFlag && relations[type2].overrides === type1) {
        return 'neutral';
    }
    
    if (relations[type1].generates === type2) {
        return 'generates';
    } else if (relations[type1].overrides === type2) {
        return 'overrides';
    } else {
        return 'neutral';
    }
}

// 周辺セル取得関数
function getNeighboringCells(x, y) {
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < GRID_SIZE_X && ny >= 0 && ny < GRID_SIZE_Y && grid[ny][nx] !== null) {
                neighbors.push(grid[ny][nx]);
            }
        }
    }
    return neighbors;
}

// 周辺の空きセルを取得する関数
function getNeighboringEmptyCells(x, y) {
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < GRID_SIZE_X && ny >= 0 && ny < GRID_SIZE_Y && grid[ny][nx] === null) {
                neighbors.push([nx, ny]);
            }
        }
    }
    return neighbors;
}

// 指定範囲内の同種ウイルスを探す（集団形成用）
function getNearbyViruses(x, y, radius) {
    const nearbyViruses = [];
    
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < GRID_SIZE_X && ny >= 0 && ny < GRID_SIZE_Y && 
                grid[ny][nx] !== null && grid[ny][nx] instanceof Virus) {
                nearbyViruses.push(grid[ny][nx]);
            }
        }
    }
    
    return nearbyViruses;
}

// パンデミック開始関数
function startPandemic() {
    if (!isPandemic) {
        isPandemic = true;
        
        // サイクルフェーズによるパンデミック期間調整
        if (cyclePhase === 'growth') {
            pandemicTimer = 150; // 成長フェーズでは短めのパンデミック
        } else if (cyclePhase === 'peak') {
            pandemicTimer = 200; // 標準的なパンデミック期間
        } else if (cyclePhase === 'decline') {
            pandemicTimer = 300; // 減少フェーズでは長めのパンデミック
        } else if (cyclePhase === 'recovery') {
            pandemicTimer = 100; // 回復フェーズでは非常に短いパンデミック
        } else {
            pandemicTimer = 200; // デフォルト
        }
        
        // パンデミック開始通知
        console.log(`PANDEMIC STARTED! (${cyclePhase} phase)`);
    }
}

// パンデミック状態の更新
function updatePandemic() {
    if (isPandemic) {
        // サイクルフェーズによるパンデミック減少速度調整
        let decreaseRate = 1;
        
        if (cyclePhase === 'decline') {
            decreaseRate = 0.7; // 減少フェーズではパンデミックが長続き
        } else if (cyclePhase === 'recovery') {
            decreaseRate = 1.5; // 回復フェーズではパンデミックが早く終わる
        }
        
        pandemicTimer -= decreaseRate;
        
        if (pandemicTimer <= 0) {
            isPandemic = false;
            console.log("Pandemic ended");
        }
    }
}

// 突然変異イベントのトリガー関数
function triggerMutationEvent() {
    // サイクルフェーズによる突然変異イベント確率調整
    let mutationEventChance = 0.0005;
    
    if (cyclePhase === 'growth') {
        mutationEventChance = 0.0002; // 成長フェーズでは突然変異イベントが少ない
    } else if (cyclePhase === 'peak') {
        mutationEventChance = 0.001; // ピークフェーズでは突然変異イベントが多い
    } else if (cyclePhase === 'decline') {
        mutationEventChance = 0.002; // 減少フェーズでは突然変異イベントが非常に多い
    }
    
    if (!isPandemic && Math.random() < mutationEventChance) {
        console.log("Mutation Event triggered!");
        
        // サイクルフェーズによる突然変異数調整
        if (cyclePhase === 'peak') {
            mutationEventCounter = 8; // ピークフェーズでは多くの突然変異
        } else if (cyclePhase === 'decline') {
            mutationEventCounter = 12; // 減少フェーズでは非常に多くの突然変異
        } else {
            mutationEventCounter = 5; // 標準
        }
    }
}

// ライフサイクルの更新処理
function updateLifecycle() {
    // 現在時刻を取得
    const currentTime = performance.now() / 1000; // 秒単位
    const deltaTime = currentTime - lastCycleUpdateTime;
    lastCycleUpdateTime = currentTime;
    
    // サイクルタイマーを更新
    cycleTimer += deltaTime;
    
    // 3分サイクルで管理
    if (cycleTimer >= cycleTotalTime) {
        cycleTimer = 0;
        cyclePhase = 'growth';
        console.log("NEW CYCLE STARTED: Growth Phase");
        
        // 細胞数が極端に少ない場合、回復のためのブースト
        if (cells.length < MIN_CELLS_FOR_GROWTH) {
            boostRecovery();
        }
    } else {
        // サイクル内のフェーズ切り替え
        const growthEnd = growthPhaseTime;
        const peakEnd = growthEnd + peakPhaseTime;
        const declineEnd = peakEnd + declinePhaseTime;
        
        // 現在のフェーズを決定
        if (cycleTimer < growthEnd) {
            if (cyclePhase !== 'growth') {
                cyclePhase = 'growth';
                console.log("Entering Growth Phase");
            }
        } else if (cycleTimer < peakEnd) {
            if (cyclePhase !== 'peak') {
                cyclePhase = 'peak';
                console.log("Entering Peak Phase");
                
                // ピークフェーズでは突然変異イベントの可能性を上昇
                if (Math.random() < 0.3 && cells.length > CELLS_PEAK_THRESHOLD) {
                    mutationEventCounter += 10;
                    console.log("Peak phase triggered major mutation event!");
                }
            }
        } else if (cycleTimer < declineEnd) {
            if (cyclePhase !== 'decline') {
                cyclePhase = 'decline';
                console.log("Entering Decline Phase");
                
                // 減少フェーズでは致死性ウイルスが出やすくなる
                forceLethalMutation();
            }
        } else {
            if (cyclePhase !== 'recovery') {
                cyclePhase = 'recovery';
                console.log("Entering Recovery Phase");
                
                // 回復フェーズではウイルスの活動が低下
                suppressViruses();
            }
        }
    }
    
    // 細胞数に基づくフェーズ遷移調整
    adjustPhaseBasedOnPopulation();
}

// 細胞数に基づくフェーズ調整
function adjustPhaseBasedOnPopulation() {
    // 細胞数が極端に少ない場合、回復フェーズへの移行を促進
    if (cells.length < MIN_CELLS_FOR_GROWTH && cyclePhase === 'decline') {
        cyclePhase = 'recovery';
        console.log("Early Recovery Phase due to low cell count");
    }
    
    // 細胞数が非常に多い場合、ピークフェーズへの移行を促進
    if (cells.length > CELLS_PEAK_THRESHOLD && cyclePhase === 'growth') {
        cyclePhase = 'peak';
        console.log("Early Peak Phase due to high cell count");
    }
}

// 回復フェーズのブースト
function boostRecovery() {
    // 少量の細胞を追加して回復を促進
    const boostCount = Math.floor(Math.random() * 10) + 10; // 10-19個追加
    
    for (let i = 0; i < boostCount; i++) {
        const x = Math.floor(Math.random() * GRID_SIZE_X);
        const y = Math.floor(Math.random() * GRID_SIZE_Y);
        
        if (grid[y][x] === null) {
            // ランダムな種類の細胞を追加
            const type = CELL_TYPES[Math.floor(Math.random() * CELL_TYPES.length)];
            const newCell = new Cell(x, y, type);
            grid[y][x] = newCell;
            entities.push(newCell);
            cells.push(newCell);
        }
    }
    
    console.log(`Boosted recovery with ${boostCount} new cells`);
}

// 致死性ウイルスの促進
function forceLethalMutation() {
    // 既存のウイルスの一部を致死性ウイルスに変異
    const mutationCount = Math.min(3, Math.floor(viruses.length * 0.05)); // 最大5%、ただし最大3個に制限
    
    for (let i = 0; i < mutationCount; i++) {
        const index = Math.floor(Math.random() * viruses.length);
        if (viruses[index].type === 'yin' || viruses[index].type === 'yang') {
            viruses[index].type = 'lethal';
            viruses[index].color = VIRUS_COLORS['lethal'];
            viruses[index].infectionRate = 0.25;
            viruses[index].lethalityRate = 0.15;
        }
    }
    
    // パンデミック開始
    if (mutationCount > 0) {
        startPandemic();
        console.log(`Forced ${mutationCount} lethal mutations`);
    }
}

// ウイルス活動の抑制
function suppressViruses() {
    // ウイルスの寿命を短縮
    for (const virus of viruses) {
        virus.lifespan *= 0.8; // 20%短縮
    }
    
    // パンデミックを終了
    if (isPandemic) {
        pandemicTimer = 10; // すぐに終了
        console.log("Suppressed pandemic in recovery phase");
    }
}

// 初期化と開始
window.addEventListener('load', () => {
    init();
    draw();
});
			
			
			