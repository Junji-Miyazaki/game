// 重複している変数宣言の修正と必要な初期化を行います

// 1. baseInterval変数の重複宣言を修正
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

// アニメーション関連の変数 - baseIntervalの重複は削除
let lastUpdateTime = 0;
let updateInterval = 50; // デフォルトの更新間隔
let animationFrameId = null;
let infoPanelUpdateCounter = 0; // 情報パネル更新カウンターを追加

// ここから残りのコードは同じ...


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
const VIRUS_COUNT = 100; // ウイルスの初期数40→60

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

class Corpse extends Entity {
    constructor(x, y, cellType, virusType) {
        super(x, y, cellType);
        this.color = 'rgba(50, 50, 50, 0.7)'; // 灰色の死骸
        this.virusType = virusType; // 死因となったウイルスタイプ
        this.decayTime = 60; // 60ターンで消滅（少し早く消えるように調整）
        // 死骸の感染力は弱める
        this.infectiousness = virusType === 'lethal' ? 0.2 : 
                              virusType === 'mutant' ? 0.25 : 0.1;
    }
    
 // Corpseクラス内のupdate()メソッド内の抵抗力調整部分
update() {
    this.decayTime--;
    
    // 周囲の細胞に感染の可能性（低確率）
    const neighborCells = getNeighboringCells(this.x, this.y);
    for (const neighbor of neighborCells) {
        if (neighbor instanceof Cell && !neighbor.immunity) {
            // 死骸からの感染確率
            if (Math.random() < this.infectiousness * 0.5) { // 半分の確率に低減
                // 抵抗力チェック - バランス調整（木と水を極端に弱く）
                let resistanceChance = 0;
                switch(neighbor.type) {
                    case 'metal': resistanceChance = 0.8; break; // 金属は最も高い抵抗力
                    case 'wood': resistanceChance = 0.1; break; // 木は極めて低い抵抗力
                    case 'water': resistanceChance = 0.08; break; // 水は極めて低い抵抗力
                    case 'fire': resistanceChance = 0.5; break; // 火は中程度の抵抗力
                    case 'earth': resistanceChance = 0.6; break; // 土は高めの抵抗力
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
                            // 同種間の感染拡大（40%の確率）
                            if (Math.random() < 0.4) {
                                secNeighbor.infected = 20;
                                secNeighbor.infectedBy = this.virusType;
                            }
                        }
                    }
                }
            }
        }
    }
    
    return this.decayTime > 0;
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

class Virus extends Entity {
    constructor(x, y, type) {
    super(x, y, type);
    this.color = VIRUS_COLORS[type];
    this.size = VIRUS_SIZE;
    
    // 寿命を延長
    this.baseLifespan = 80; // 40→80に増加
    
    // ホスト依存性を緩和
    this.requiresHost = true;
    this.hostDepletionRate = 0.2; // 0.5→0.2に減少
    
    // タイプ別の特性
    if (type === 'yin') {
        this.infectionRate = 0.2;
        this.groupingFactor = 0.5;
        this.energyDrainFactor = 0.3;
        this.activitySuppression = 0.7;
        this.lethalityRate = 0.01;
        this.lifespan = this.baseLifespan + Math.floor(Math.random() * 20); // ランダム要素増加
    } else if (type === 'yang') {
        this.infectionRate = 0.1;
        this.groupingFactor = 0.1;
        this.energyDrainFactor = 1.0;
        this.activityBoost = 1.0;
        this.lethalityRate = 0.005;
        this.lifespan = this.baseLifespan + Math.floor(Math.random() * 15); // ランダム要素増加
    } else if (type === 'mutant') {
            // 突然変異ウイルス - 高感染性（調整）
            this.infectionRate = 0.6;      // 高い感染率（0.5→0.35に調整）
            this.groupingFactor = 0.3;      // 中程度の集団行動
            this.energyDrainFactor = 0.5;   // 中程度のエネルギー吸収
            this.activitySuppression = 0.5; // 強い活動抑制
            this.lethalityRate = 0.03;      // 中程度の致死率（0.05→0.03に調整）
            this.lifespan = this.baseLifespan * 1.4; // やや長い寿命
            this.requiresHost = true;       // ホストがいないと生存できない
        } else if (type === 'lethal') {
            // 致死性ウイルス（調整）
            this.infectionRate = 0.8;      // 感染率（0.3→0.25に調整）
            this.groupingFactor = 0.4;      // やや集団的
            this.energyDrainFactor = 0.8;   // 強いエネルギー吸収（1.0→0.8に調整）
            this.activitySuppression = 0.5; // 中程度の活動抑制
            this.lethalityRate = 0.8;      // 高い致死率（0.2→0.15に調整）
            this.lifespan = this.baseLifespan * 0.5; // やや短い寿命
            this.requiresHost = true;       // ホストがいないと生存できない
        }
        
        // 突然変異確率を大幅に下げる
        this.mutationChance = 0.000005; // 0.0005%の確率（0.0001→0.000005に調整）
    }

    move() {
        // ホスト依存性の処理：周囲に細胞がいるかチェック
        // ホスト依存性の処理
    if (this.requiresHost) {
        const hasNearbyHost = getNeighboringCells(this.x, this.y).some(entity => entity instanceof Cell);
        
        if (!hasNearbyHost) {
            // ホストがいない場合、寿命が減少する速度を緩和
            this.lifespan -= this.hostDepletionRate;
        } else {
            // ホストがいる場合、わずかに寿命回復
            this.lifespan += 0.05;
        }
    }
        
        // ウイルスの移動ロジック - 修正
    let dx = 0;
    let dy = 0;
    const random = Math.random();
    
    // パンデミック時はより早く移動（やや控えめに）
    const moveFactor = isPandemic ? 1.3 : 1.0;
    
    if (this.type === 'yin' || this.type === 'lethal') {
        // 中心方向への移動傾向を削除し、よりランダムな動きに
        if (this.type === 'yin') {
            // 陰ウイルスはランダムに動く
            dx = Math.floor(Math.random() * 3) - 1;
            dy = Math.floor(Math.random() * 3) - 1;
        } else { // lethal
            // 致死性ウイルスは少し規則性を残す（より活発に動く）
            dx = Math.sign(GRID_SIZE_X / 2 - this.x);
            dy = Math.sign(GRID_SIZE_Y / 2 - this.y);
        }
        
        // 他のウイルスの方向へも引き寄せられる（集団形成傾向）
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
        } else if (random < 0.5) { // 0.3→0.5に増加
            // ランダム要素を増加
            dx += Math.floor(Math.random() * 3) - 1;
            dy += Math.floor(Math.random() * 3) - 1;
        }
    } else { // yang または mutant
        // 外側方向への移動傾向を削除し、よりランダムな動きに
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
        if (random < 0.7) { // 0.6→0.7に増加
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
        
        // 感染ロジックの実装
        this.tryInfection();
        
        // 突然変異イベントチェック（大幅に確率を下げる）
        if (!isPandemic && this.type !== 'mutant' && this.type !== 'lethal') {
            // 通常の低確率の自然突然変異
            if (Math.random() < this.mutationChance) {
                this.mutate();
            }
            
            // 突然変異イベント（別の仕組み）
            if (mutationEventCounter > 0 && Math.random() < 0.01) {
                this.mutate();
                mutationEventCounter--;
            }
        }
        
        // ライフスパンの減少
        this.lifespan -= 0.2;
        
        // 繁殖確率を調整
        let reproductionChance = 0.004; // 基本繁殖率を下げる0.001->0.004
        
        // ウイルスタイプ別の繁殖率
    switch(this.type) {
        case 'yin': reproductionChance = 0.006; break; // 増加
        case 'yang': reproductionChance = 0.006; break; // 増加
        case 'mutant': reproductionChance = 0.004; break;
        case 'lethal': reproductionChance = 0.1; break;
    }
        
        // パンデミック中は繁殖率上昇
        if (isPandemic) {
            reproductionChance *= 1.3;
        }
        
        // 宿主依存性：近くに細胞がいないと繁殖できない
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
        const newType = Math.random() < 0.7 ? 'mutant' : 'lethal';
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
        }
        
        // パンデミック開始
        startPandemic();
    }
    
    // 感染メソッド
    // Virusクラス内のtryInfection()メソッド内の抵抗力調整部分
// Virusクラス内のtryInfection()メソッド内の抵抗力調整部分
tryInfection() {
    const neighborCells = getNeighboringCells(this.x, this.y);
    for (const neighbor of neighborCells) {
        if (neighbor instanceof Cell && !neighbor.immunity) {
            // 感染の可能性
            let infectionChance = this.infectionRate;
            
            // パンデミック中は感染率上昇（控えめに）
            if (isPandemic) {
                infectionChance *= 1.2;
            }
            
            // 細胞タイプごとの抵抗力 - バランス調整（木と水を極端に弱く）
            let resistanceChance = 0;
            switch(neighbor.type) {
                case 'metal': resistanceChance = 0.8; break; // 金属は最も高い抵抗力（強化）
                case 'wood': resistanceChance = 0.05; break; // 木は極めて低い抵抗力
                case 'water': resistanceChance = 0.04; break; // 水は極めて低い抵抗力
                case 'fire': resistanceChance = 0.5; break; // 火は中程度の抵抗力
                case 'earth': resistanceChance = 0.6; break; // 土は高めの抵抗力（強化）
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
                                // 同種間の感染拡大（60%の確率）
                                if (Math.random() < 0.6) {
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
        
        // パンデミック中は点滅効果（より控えめに）
        if (isPandemic && this.type !== 'yin' && this.type !== 'yang' && Math.random() < 0.3) {
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
}

class Cell extends Entity {
    constructor(x, y, type) {
        super(x, y, type);
        this.color = CELL_COLORS[type];
        this.shape = CELL_SHAPES[type];
        this.size = CELL_SIZES[type]; // タイプごとのサイズ
        this.energy = 100;
        this.maxLifespan = Math.floor(Math.random() * (300 - 100 + 1) + 100);
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
        
        // タイプごとの特性
        switch(type) {
            case 'wood':
                this.activity = 0.7;            // 柔軟・積極的に動く
                this.energyToReproduce = 75;    // 成長力があり繁殖しやすい
                this.reproductionRate = 0.008;  // 高い繁殖率
                this.maxLifespan = this.maxLifespan * 1.1; // やや長い寿命
                this.growthFactor = 0.01;       // 新特性：成長によるエネルギー回復
                break;
            case 'fire':
                this.activity = 0.9;            // 最も活発
                this.energyToReproduce = 70;    // 繁殖にそこそこエネルギーが必要
                this.reproductionRate = 0.006;  // 中程度の繁殖率
                this.maxLifespan = this.maxLifespan * 0.7; // 短い寿命
                this.energyBurnRate = 0.02;     // 新特性：高いエネルギー消費
                break;
            case 'earth':
                this.activity = 0.4;            // 安定して動きが遅い
                this.energyToReproduce = 75;    // 中程度の繁殖コスト
                this.reproductionRate = 0.007;  // 中高の繁殖率（土は生成の性質）
                this.maxLifespan = this.maxLifespan * 1.3; // 長い寿命
                this.recoveryRate = 0.008;      // 新特性：安定した回復力
                break;
            case 'metal':
                this.activity = 0.5;            // あまり活発でない
                this.energyToReproduce = 85;    // 繁殖が難しい
                this.reproductionRate = 0.004;  // 低い繁殖率
                this.maxLifespan = this.maxLifespan * 1.6; // 最も長い寿命
                this.resistance = 0.3;          // 新特性：外部の影響への耐性
                break;
            case 'water':
                this.activity = 0.8;            // 流動的で活発
                this.energyToReproduce = 80;    // 中程度の繁殖コスト
                this.reproductionRate = 0.004;  // 中程度の繁殖率
                this.maxLifespan = this.maxLifespan * 0.9; // 標準的な寿命
                this.adaptability = 0.01;       // 新特性：環境適応力
                break;
        }
        
        this.lifespan = this.maxLifespan;
    }

    move() {
        // 感染の影響を処理
        if (this.infected > 0) {
            // 感染タイプに応じた効果
            if (this.infectedBy === 'yin') {
                // 陰ウイルスの効果：抑制的
                this.activity *= 0.7;  // 活動性低下
                this.energy -= 0.5;    // エネルギー消費増加
            } else if (this.infectedBy === 'yang') {
                // 陽ウイルスの効果：亢進的
                this.activity *= 1.5;  // 活動性増加
                this.energy -= 0.8;    // 大きなエネルギー消費
            } else if (this.infectedBy === 'mutant') {
                // 突然変異ウイルスの効果：非常に消耗
                this.activity *= 0.6;  // 大きな活動性低下
                this.energy -= 1.0;    // 大きなエネルギー消費
                this.lifespan -= 0.3;  // 寿命も減少
            } else if (this.infectedBy === 'lethal') {
                // 致死性ウイルスの効果：致命的
                this.activity *= 0.4;  // 極端な活動性低下
                this.energy -= 1.5;    // 極端なエネルギー消費
                this.lifespan -= 0.5;  // 寿命も大きく減少
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
            
            // 陰ウイルスは相剋（上書き）関係を強化
            if (this.infectedBy === 'yin' && relation === 'overrides') {
                this.energy += 0.2; // 追加エネルギー獲得
                cell.energy -= 0.3; // 相手のエネルギーを余分に奪う
                cell.lifespan -= 0.1; // 相手の寿命も減少
            }
            
            // 陽ウイルスは相生（生成）関係を強化
            if (this.infectedBy === 'yang' && relation === 'generates') {
                this.energy += 0.2; // 追加エネルギー獲得
                cell.lifespan += 0.05; // 追加寿命獲得this->cell
                cell.energy += 0.1; // 相手にもエネルギーを少し与える
            }
        }
    }
}
			
// Cellクラス内のmove()メソッド内の回復率調整部分
// 回復のチャンス
let recoveryChance = 0.07; // 基本回復率

// ウイルスタイプによる回復率調整
if (this.infectedBy === 'mutant') {
    recoveryChance = 0.04; // 突然変異は回復しにくい
} else if (this.infectedBy === 'lethal') {
    recoveryChance = 0.02; // 致死性は非常に回復しにくい
}

// 細胞タイプによる回復率調整 - バランス調整（木と水の回復率を大幅に下げる）
switch(this.type) {
    case 'metal': recoveryChance *= 1.5; break; // 金属は回復しやすい（強化）
    case 'wood': recoveryChance *= 0.7; break;  // 木は回復しにくい（下方修正）
    case 'water': recoveryChance *= 0.5; break; // 水は回復しにくい（下方修正）
    case 'fire': recoveryChance *= 1.0; break;  // 火は回復しやすい
    case 'earth': recoveryChance *= 1.3; break; // 土は回復しやすい（強化）
}
            
            if (Math.random() < recoveryChance) {
                this.infected = 0;
                this.immunity = true;     // 免疫獲得
                this.immunityTimer = 100; // 100ターンの免疫期間
            }
            
            // 感染による色の変化（視覚効果）
            let alpha = this.infected / 20;
            
            // 致死性や突然変異の場合は強い効果
            if (this.infectedBy === 'lethal' || this.infectedBy === 'mutant') {
                alpha *= 1.5;
            }
            
            this.infectedColor = VIRUS_COLORS[this.infectedBy] || 'rgba(147, 112, 219, 0.5)';
            
            // 致死判定の部分 - 木と水の死亡確率を大幅に上昇
// 致死判定 - 回復しなかった場合の致死率
let deathChance = 0;
if (this.infected <= 1) { // 感染最終段階
    if (this.infectedBy === 'yin') deathChance = 0.08;     
    else if (this.infectedBy === 'yang') deathChance = 0.04;
    else if (this.infectedBy === 'mutant') deathChance = 0.2;
    else if (this.infectedBy === 'lethal') deathChance = 0.8;
    
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
            this.immunityTimer--;
            if (this.immunityTimer === 0) {
                this.immunity = false;
            }
        }
        
        if (Math.random() < this.activity) {
            const dx = Math.floor(Math.random() * 3) - 1;
            const dy = Math.floor(Math.random() * 3) - 1;
            const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, this.x + dx));
            const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, this.y + dy));

            // 隣接するセルを検査して、五行相生相剋の関係を調べる
            const neighborCells = getNeighboringCells(this.x, this.y);
            for (const cell of neighborCells) {
                if (cell instanceof Cell) {
                    // 金属の免疫特性を考慮
                    const relation = getFiveElementsRelation(this.type, cell.type, cell.immuneToOverride);
                    if (relation === 'generates') {
                        this.energy += 0.3;          // 0.5→0.3に減少
                        this.lifespan += 0.1;        // 0.2→0.1に減少
                    } else if (relation === 'overrides') {
                        this.energy -= 0.2;          // 0.3→0.2に減少
                        this.lifespan -= 0.05;       // 0.1→0.05に減少
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
        
        // ★★★ タイプごとの特殊能力 ★★★
        switch(this.type) {
            case 'wood':
                // 成長の性質：近くに空きスペースがあると成長してエネルギー回復
                if (getNeighboringEmptyCells(this.x, this.y).length > 3) {
                    this.energy += this.growthFactor;
                }
                break;
            case 'fire':
                // 熱の性質：エネルギーを速く消費するが、活動的
                this.energy -= this.energyBurnRate;
                // 明るさで周囲に影響
                const nearbyEntities = getNeighboringCells(this.x, this.y);
                for (const entity of nearbyEntities) {
                    if (entity instanceof Cell && entity.type === 'wood') {
                        entity.energy -= 0.01; // 木に燃え移る
                    }
                }
                break;
            case 'earth':
                // 安定の性質：定期的にエネルギー回復
                if (Math.random() < 0.1) {
                    this.energy += this.recoveryRate;
                }
                break;
            case 'metal':
                // 堅固の性質：外部からの影響を受けにくい
                if (Math.random() < this.resistance) {
                    // 相剋関係の影響を一定確率で無効化
                    this.immuneToOverride = true;
                } else {
                    this.immuneToOverride = false;
                }
                break;
            case 'water':
                // 適応力：環境に応じてエネルギー消費調整
                const surroundingCount = getNeighboringCells(this.x, this.y).length;
                if (surroundingCount > 4) {
                    this.energy -= 0.01; // 混雑した場所ではエネルギー消費
                } else {
                    this.energy += this.adaptability * (4 - surroundingCount); // 空いた場所では回復
                }
                break;
        }
        
        // エネルギーと寿命の減少
        this.energy -= Math.floor(Math.random() * 2 + 1) / 100;
        this.lifespan -= 0.05;
        
        // 脈動を更新
        this.pulsePhase += 0.1;
        if (this.pulsePhase > Math.PI * 2) {
            this.pulsePhase = 0;
        }
        
        // 死亡判定
        if (this.energy < 0 || this.lifespan < 0) {
            grid[this.y][this.x] = null;
            return false;
        }

        // 繁殖
        if (this.energy > this.energyToReproduce && Math.random() < this.reproductionRate) {
            this.reproduce();
        }
        
        return true;
    }
    
    reproduce() {
        const neighbors = getNeighboringEmptyCells(this.x, this.y);
        if (neighbors.length > 0) {
            const [nx, ny] = neighbors[Math.floor(Math.random() * neighbors.length)];
            // 突然変異のチャンス (20%)
            const childType = Math.random() < 0.8 ? this.type : CELL_TYPES[Math.floor(Math.random() * CELL_TYPES.length)];
            const newCell = new Cell(nx, ny, childType);
            newCell.generation = this.generation + 1;
            
            // 免疫を子に伝える可能性
            if (this.immunity && Math.random() < 0.3) {
                newCell.immunity = true;
                newCell.immunityTimer = 50; // 子の免疫は短め
            }
            
            grid[ny][nx] = newCell;
            entities.push(newCell);
            cells.push(newCell);
            this.energy -= 30;
        }
    }

    draw() {
        const drawX = this.x * CELL_SIZE;
        const drawY = this.y * CELL_SIZE;
        
        // サイズに基づくスケーリング
        const size = (this.size / 10) * CELL_SIZE;
        const pulseFactor = 1 + 0.1 * Math.sin(this.pulsePhase); // 脈動効果
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
    }
}

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

// 指定範囲内の同種ウイルスを探す（陰ウイルスの集団形成用）
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
        pandemicTimer = 200; // 200ターンのパンデミック期間（調整：300→200）
        
        // パンデミック開始通知（オプション）
        console.log("PANDEMIC STARTED!");
    }
}

// パンデミック状態の更新
function updatePandemic() {
    if (isPandemic) {
        pandemicTimer--;
        
        if (pandemicTimer <= 0) {
            isPandemic = false;
            console.log("Pandemic ended");
        }
    }
}

// 突然変異イベントのトリガー関数
function triggerMutationEvent() {
    if (!isPandemic && Math.random() < 0.0005) { // 0.05%の確率でイベント発生
        console.log("Mutation Event triggered!");
        mutationEventCounter = 5; // 5回の突然変異チャンス
    }
}

function init() {
    resizeCanvas();
    entities = [];
    viruses = [];
    cells = [];
    corpses = [];
    isPandemic = false;
    pandemicTimer = 0;
    mutationEventCounter = 0;
    infoPanelUpdateCounter = 0; // カウンターを初期化

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

function update() {
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

    // 新しいウイルスを生成（低確率）
    const baseVirusGenerationChance = 0.02; // 基本生成確率を下げる（0.03→0.015）
    
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
    const maxViruses = Math.max(VIRUS_COUNT, cells.length * 1.5);
    
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
            // パンデミック中は危険なウイルス出現率上昇（調整）
            let typeOptions;
            if (isPandemic) {
                typeOptions = Math.random() < 0.2 ? 
                    ['mutant', 'lethal'] : ['yin', 'yang', 'mutant', 'lethal'];
            } else {
                typeOptions = Math.random() < 0.005 ? // 大幅に下げる（0.01→0.005）
                    ['mutant', 'lethal'] : ['yin', 'yang'];
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

// 1. draw関数を最適化
function draw() {
    // 描画処理の最適化
    // 変更がある部分だけを再描画するか、キャンバスをダブルバッファリングする
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

function drawBackground() {
    // 暗い背景グラデーション
    const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
    );
    
    // パンデミック中は僅かに赤みがかった背景
 //   if (isPandemic) {
        gradient.addColorStop(0, '#1e1a20');
        gradient.addColorStop(1, '#140f15');
 //   } else {
 //       gradient.addColorStop(0, '#1a1a2e');
 //       gradient.addColorStop(1, '#0f0f1a');
  //  }
    
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
}

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
        
        // パンデミック状態の表示（情報パネル内のみに修正）
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
    } else {
        populationBarsHTML = '<div>No cells alive</div>';
    }
    
    populationBarsDisplay.innerHTML = populationBarsHTML;
}

// startGame()関数の変更
function startGame() {
    if (!isRunning) {
        isRunning = true;
        startButton.classList.add('active');
        pauseButton.classList.remove('active');
        lastUpdateTime = performance.now();
        updateInterval = baseInterval / parseInt(speedSlider.value);
        animationLoop();
    }
}

// pauseGame()関数の変更
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

// 新しいアニメーションループ関数
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

// speedSliderのイベントリスナーの変更
speedSlider.addEventListener('input', () => {
    const speed = parseInt(speedSlider.value);
    speedValueDisplay.textContent = `x${speed}`;
    updateInterval = baseInterval / speed;
    
    // 変更時にもアニメーションを継続
    if (isRunning) {
        lastUpdateTime = performance.now();
    }
});

// index.htmlのspeedSliderの変更（最大値と初期値）
// <input type="range" id="speedSlider" min="1" max="1000" value="5">

cellSizeSlider.addEventListener('input', () => {
    cellSizeValueDisplay.textContent = `x${cellSizeSlider.value}`;
    BASE_CELL_SIZE = parseInt(cellSizeSlider.value);
    
    // グリッドサイズの再計算
    pauseGame();
    resizeCanvas();
    init();
    draw();
});

window.addEventListener('resize', () => {
    pauseGame();
    resizeCanvas();
    init();
    draw();
});

// 初期化と最初の描画
init();
draw();