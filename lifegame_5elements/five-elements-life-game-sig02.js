// Five Elements Life Game
// HTML部分は既に提供されているので、JavaScript部分のみを提供

// DOM要素の取得
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
const seasonDisplay = document.getElementById('seasonDisplay');

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
let disasterActive = false;
let disasterTimer = 0;
let yearTimer = 0;

// 災害関連のグローバル変数定義 (ファイル先頭の変数宣言部分に追加)
let disasterFrequency = 2; // 災害が発生するまでの年数 (元: 3)
let disasterProbability = 0.8; // 条件満たした時の発生確率 (元: 0.5)
let disasterDuration = 300; // 災害の持続ターン数 (元: 200)
let disasterVirusInitialCount = 30; // 災害発生時の致死性ウイルス初期数 (元: 20)
let disasterMessage = ''; // 災害メッセージを格納する変数

// アニメーション関連の変数
let lastUpdateTime = 0;
let updateInterval = 50; // デフォルトの更新間隔
let animationFrameId = null;
let infoPanelUpdateCounter = 0; // 情報パネル更新カウンターを追加

// 五行サイクル・システム用の変数
let currentSeason = 'wood'; // 'wood', 'fire', 'earth', 'metal', 'water'
let seasonTimer = 0;        // 季節の現在の経過時間（秒）
let yearTotalTime = 100;    // 1年の合計時間（3分 = 180秒）
let seasonTime = 20;        // 各季節の時間（36秒）
let lastSeasonUpdateTime = 0; // 最終季節更新時間
let disasterYearCounter = 0;  // 災害発生までの年カウンター


// パーティクルサイズの定義
const VIRUS_SIZE = 2; // ウイルスのドットサイズ
const CELL_SIZES = {
    wood: 7,   // 成長する性質を反映して中高サイズ
    fire: 4,   // 激しく燃える小さな炎
    earth: 8,  // 安定した大きさ
    metal: 6,  // 堅固な中サイズ
    water: 5   // 流動的な中サイズ
};

const VIRUS_TYPES = ['yin', 'yang', 'lethal'];
const VIRUS_COLORS = { 
    yin: '#9370DB', 
    yang: '#4682B4',
    lethal: '#FF0000'  // 致死性ウイルス（赤）
};
const VIRUS_COUNT = 100; // ウイルスの初期数

const CELL_TYPES = ['wood', 'fire', 'earth', 'metal', 'water'];

// 五行の対応する季節 (English)
const ELEMENT_SEASONS = {
    wood: 'Spring (Wood)',
    fire: 'Summer (Fire)',
    earth: 'Late Summer (Earth)',
    metal: 'Autumn (Metal)',
    water: 'Winter (Water)'
};

// 色の定義
const CELL_COLORS = { 
    wood: '#66BB6A',  // より生き生きとした緑
    fire: '#FF5722',  // より明るい赤/オレンジ
    earth: '#FFC107', // 土の黄色
    metal: '#B0BEC5', // 金属的な銀/灰色
    water: '#29B6F6'  // 透明感のある青
};

/*
// 季節ごとの背景色
const SEASON_COLORS = {
    wood: { inner: '#1e2a20', outer: '#141a15' }, // 春：緑がかった暗色
    fire: { inner: '#2a1a1a', outer: '#1a0f0f' }, // 夏：赤みがかった暗色
    earth: { inner: '#272720', outer: '#1a1a14' }, // 長夏：黄色みがかった暗色
    metal: { inner: '#202428', outer: '#141618' }, // 秋：銀/灰色がかった暗色
    water: { inner: '#1a2a2e', outer: '#0f1a1e' }  // 冬：青みがかった暗色
};
*/

const CELL_SHAPES = { wood: 'rect', fire: 'triangle', earth: 'rect', metal: 'circle', water: 'wave' };
const CELL_COUNT = 50; // 細胞の初期数

let entities = [];
let viruses = [];
let cells = [];
let corpses = []; // 死骸を追跡



const CARRYING_CAPACITY = 10000; // 環境が支えられる最大細胞数

function calculateCrowdingFactor() {
    // 現在の細胞数を取得
    const currentPopulation = cells.length;
    
    // シグモイド関数による制限係数の計算
    // 人口が少ないときは制限が小さく、収容能力に近づくと急速に制限が大きくなる
    const logisticFactor = 1 / (1 + Math.exp(0.02 * (currentPopulation - CARRYING_CAPACITY * 0.7)));
    
    return logisticFactor;
}




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
        this.decayTime = 60; // 60ターンで消滅
        
        // 季節による感染力調整
        let infectiousnessModifier = 1.0;
        if (currentSeason === cellType) {
            infectiousnessModifier = 0.5; // 対応する季節では死骸の感染力が低下
        } else if (getOverridingElement(cellType) === currentSeason) {
            infectiousnessModifier = 1.5; // 相剋する季節では死骸の感染力が上昇
        }
        
        // 死骸の感染力を調整
        this.infectiousness = virusType === 'lethal' ? 0.3 * infectiousnessModifier : 0.1 * infectiousnessModifier;
    }
    
    update() {
        this.decayTime--;
        
        // 周囲の細胞に感染の可能性
        const neighborCells = getNeighboringCells(this.x, this.y);
        for (const neighbor of neighborCells) {
            if (neighbor instanceof Cell && !neighbor.immunity) {
                // 死骸からの感染確率（季節に応じて調整）
                let infectionChance = this.infectiousness * 0.5;
                
                if (neighbor.type === currentSeason) {
                    infectionChance *= 0.5; // その季節の細胞は感染に強い
                } else if (getOverridingElement(neighbor.type) === currentSeason) {
                    infectionChance *= 1.5; // 相剋される細胞は感染に弱い
                }
                
                if (Math.random() < infectionChance) {
                    // 抵抗力チェック
                    let resistanceChance = getCellResistance(neighbor.type);
                    
                    // 季節による抵抗力調整
                    if (neighbor.type === currentSeason) {
                        resistanceChance *= 1.5; // その季節は抵抗力が高い
                    } else if (getOverridingElement(neighbor.type) === currentSeason) {
                        resistanceChance *= 0.5; // 相剋される要素は抵抗力が低い
                    }
                    
                    // 抵抗力チェック
                    if (Math.random() < resistanceChance) {
                        continue; // 感染を防いだ
                    }
                    
                    // 感染成功
                    neighbor.infected = 20;
                    neighbor.infectedBy = this.virusType;
                }
            }
        }
        
        // 対応する季節では死骸が早く消える
        if (this.type === currentSeason) {
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
        if (this.virusType) {
            const virusColor = VIRUS_COLORS[this.virusType] || 'rgba(255, 0, 255, 0.3)';
            ctx.fillStyle = virusColor;
            ctx.globalAlpha = 0.2; // 弱い効果
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, size * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
}

// ウイルスクラス
class Virus extends Entity {
    // Virusクラスのconstructor部分で感染率を上げる
constructor(x, y, type) {
    super(x, y, type);
    this.color = VIRUS_COLORS[type];
    this.size = VIRUS_SIZE;
    
    // 寿命の基本設定
    this.baseLifespan = 120; // 元: 80 → 120に増加
    
    // 季節に応じた調整
    let lifespanModifier = 1.0;
    let infectionRateModifier = 1.0;
    let lethalityRateModifier = 1.0;
    
    // 季節による特性調整
    if (type === 'lethal') {
        // 災害ウイルスは季節に関係なく強力
        infectionRateModifier = 1.5;
        lethalityRateModifier = 1.5;
        lifespanModifier = 1.0;
    } else if (type === 'yin') {
        // 陰ウイルスは水と金が強い季節に活発
        if (currentSeason === 'water' || currentSeason === 'metal') {
            infectionRateModifier = 1.5;
            lifespanModifier = 1.3;
        } else if (currentSeason === 'fire' || currentSeason === 'wood') {
            infectionRateModifier = 0.7;
            lifespanModifier = 0.8;
        }
    } else if (type === 'yang') {
        // 陽ウイルスは火と木が強い季節に活発
        if (currentSeason === 'fire' || currentSeason === 'wood') {
            infectionRateModifier = 1.5;
            lifespanModifier = 1.3;
        } else if (currentSeason === 'water' || currentSeason === 'metal') {
            infectionRateModifier = 0.7;
            lifespanModifier = 0.8;
        }
    }
    
    // ホスト依存性
    this.requiresHost = true;
    this.hostDepletionRate = 0.15; // 元: 0.2 → 0.15に減少（ホスト無しでの寿命減少を緩和）
    
    // タイプ別の特性（季節による調整込み）（感染率を全体的に上昇）
    if (type === 'yin') {
        this.infectionRate = 0.2 * infectionRateModifier; // 元: 0.2 → 0.35
        this.groupingFactor = 0.5;
        this.energyDrainFactor = 0.3;
        this.activitySuppression = 0.7;
        this.lethalityRate = 0.015 * lethalityRateModifier; // 元: 0.01 → 0.015
        this.lifespan = this.baseLifespan * lifespanModifier + Math.floor(Math.random() * 20);
    } else if (type === 'yang') {
        this.infectionRate = 0.18 * infectionRateModifier; // 元: 0.1 → 0.25
        this.groupingFactor = 0.1;
        this.energyDrainFactor = 1.0;
        this.activityBoost = 0.8;
        this.lethalityRate = 0.01 * lethalityRateModifier; // 元: 0.005 → 0.01
        this.lifespan = this.baseLifespan * lifespanModifier * 0.85 + Math.floor(Math.random() * 15);
    } else if (type === 'lethal') {
    // 致死性ウイルス（災害）
    this.infectionRate = 0.7 * infectionRateModifier;
    this.groupingFactor = 0.6;
    this.energyDrainFactor = 0.8;
    this.activitySuppression = 0.5;
    this.lethalityRate = 0.5 * lethalityRateModifier;
    this.lifespan = this.baseLifespan * 0.2 * lifespanModifier; // 寿命を0.5から0.3に短縮
    this.requiresHost = true;
    this.hostDependency = 0.7; // 宿主依存性を高める（ホストがないと急速に死滅）
}


        // 突然変異確率（季節に応じた調整）
        this.mutationChance = 0.00001;
        // 致死性ウイルスへの突然変異はここでは実装しない（天変地異として別途管理）
    }

    move() {
        // ホスト依存性の処理
        if (this.requiresHost) {
    const hasNearbyHost = getNeighboringCells(this.x, this.y).some(entity => entity instanceof Cell);
    
    if (!hasNearbyHost) {
        // ホストがいない場合、寿命が減少する速度
        let depletionRate = this.hostDepletionRate;
        
        // 致死性ウイルスはホストがないとより早く消滅
        if (this.type === 'lethal') {
            depletionRate = this.hostDependency || 0.5; // デフォルト値は0.5（速い減少）
            
            // 細胞の総数が少ない場合、さらに急速に死滅
            if (cells.length < 200) {
                depletionRate *= 4.0; // 細胞が少ないとさらに寿命が短くなる
					}
					// 災害が終了している場合、寿命減少をさらに加速
            if (!disasterActive) {
                depletionRate *= 2.0; // 災害終了後は2倍の速度で死滅
            }
        }
        
        this.lifespan -= depletionRate;
    } else {
        // ホストがいる場合のみわずかに寿命回復（致死性は回復量を制限）
        let recoveryAmount = 0.05;
        if (this.type === 'lethal') {
            recoveryAmount = 0.02; // 致死性ウイルスは回復量を少なくする
        }
        this.lifespan += recoveryAmount;
    }
}
        
        // ウイルスの移動ロジック
        let dx = 0;
        let dy = 0;
        const random = Math.random();
        
        // 災害時はより早く移動
        let moveFactor = disasterActive ? 1.3 : 1.0;
        
        // 季節による移動調整
        // 陰ウイルスは水/金の季節で活発、陽ウイルスは火/木の季節で活発
        if ((this.type === 'yin' && (currentSeason === 'water' || currentSeason === 'metal')) ||
            (this.type === 'yang' && (currentSeason === 'fire' || currentSeason === 'wood'))) {
            moveFactor *= 1.2;
        }
        
        if (this.type === 'yin') {
            // 陰ウイルスはランダムに動く
            dx = Math.floor(Math.random() * 3) - 1;
            dy = Math.floor(Math.random() * 3) - 1;
            
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
        } else if (this.type === 'yang') {
            // 陽ウイルスはより活発にランダムに動く
            dx = Math.floor(Math.random() * 3) - 1;
            dy = Math.floor(Math.random() * 3) - 1;
            
            // より大きなランダム性
            if (random < 0.7) {
                dx = Math.floor(Math.random() * 5) - 2;
                dy = Math.floor(Math.random() * 5) - 2;
            }
        } else if (this.type === 'lethal') {
    // 致死性ウイルスは近くの細胞を追いかける
    const nearbyRadius = 10; // 探索範囲を広げる
    let nearestCell = null;
    let minDistance = nearbyRadius * nearbyRadius;
    
    // 周囲の一定範囲を探索して最も近い細胞を見つける
    for (let searchY = Math.max(0, this.y - nearbyRadius); searchY < Math.min(GRID_SIZE_Y, this.y + nearbyRadius); searchY++) {
        for (let searchX = Math.max(0, this.x - nearbyRadius); searchX < Math.min(GRID_SIZE_X, this.x + nearbyRadius); searchX++) {
            if (grid[searchY][searchX] instanceof Cell) {
                const distance = (searchX - this.x) * (searchX - this.x) + (searchY - this.y) * (searchY - this.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestCell = {x: searchX, y: searchY};
                }
            }
        }
    }
            // 近くに細胞が見つかった場合、その方向へ移動
    if (nearestCell) {
        dx = Math.sign(nearestCell.x - this.x);
        dy = Math.sign(nearestCell.y - this.y);
        
        // 細胞に向かって直線的に動くが、少しのランダム性を加える
        if (random < 0.3) {
            dx += Math.floor(Math.random() * 3) - 1;
            dy += Math.floor(Math.random() * 3) - 1;
        }
    } else {
        // 近くに細胞がない場合、ランダムに移動して探索範囲を広げる
        dx = Math.floor(Math.random() * 5) - 2;
        dy = Math.floor(Math.random() * 5) - 2;
    }
    
    // 災害時は特に高速に移動
    moveFactor *= 1.8; // 移動速度をさらに上げる
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
        
        // ライフスパンの減少（季節に応じた調整）
        let lifespanDecreaseRate = 0.2;
        
        // 季節によるウイルス寿命の調整
        if ((this.type === 'yin' && (currentSeason === 'water' || currentSeason === 'metal')) ||
            (this.type === 'yang' && (currentSeason === 'fire' || currentSeason === 'wood'))) {
            lifespanDecreaseRate = 0.15; // 相性の良い季節では長生き
        } else if ((this.type === 'yin' && (currentSeason === 'fire' || currentSeason === 'wood')) ||
                  (this.type === 'yang' && (currentSeason === 'water' || currentSeason === 'metal'))) {
            lifespanDecreaseRate = 0.5; // 相性の悪い季節では短命
        }
        
        this.lifespan -= lifespanDecreaseRate;
        
        // 繁殖確率の調整
        let reproductionChance = 0.007;
        
        // 災害中は危険なウイルスの繁殖率上昇
        if (disasterActive && this.type === 'lethal') {
            reproductionChance *= 2.0;
        }
        
        // 季節による繁殖率調整
        if ((this.type === 'yin' && (currentSeason === 'water' || currentSeason === 'metal')) ||
            (this.type === 'yang' && (currentSeason === 'fire' || currentSeason === 'wood'))) {
            reproductionChance *= 1.5; // 相性の良い季節では繁殖率上昇
        } else if ((this.type === 'yin' && (currentSeason === 'fire' || currentSeason === 'wood')) ||
                  (this.type === 'yang' && (currentSeason === 'water' || currentSeason === 'metal'))) {
            reproductionChance *= 0.5; // 相性の悪い季節では繁殖率低下
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
    
    // tryInfectionメソッドの感染率調整部分
// 修正後のtryInfectionメソッド:
tryInfection() {
    const neighborCells = getNeighboringCells(this.x, this.y);
    
    // 致死性ウイルスはより広範囲に感染
    if (this.type === 'lethal') {
        // 追加の周辺セルも取得（広範囲）- 感染半径を拡大
        const extendedNeighbors = getExtendedNeighborCells(this.x, this.y, 2); // 半径を2から3に拡大
        for (const neighbor of extendedNeighbors) {
            if (neighbor instanceof Cell) {
                neighborCells.push(neighbor);
            }
        }
        
        // さらに、飛沫感染の効果を追加（離れた場所にもランダムに感染）
        if (Math.random() < 0.15) { // 15%の確率で飛沫感染を試みる
            const jumpRadius = 10; // 飛沫感染の最大距離
            const jumpX = this.x + Math.floor(Math.random() * jumpRadius * 2) - jumpRadius;
            const jumpY = this.y + Math.floor(Math.random() * jumpRadius * 2) - jumpRadius;
            
            // グリッド範囲内かチェック
            if (jumpX >= 0 && jumpX < GRID_SIZE_X && jumpY >= 0 && jumpY < GRID_SIZE_Y) {
                const targetCell = grid[jumpY][jumpX];
                if (targetCell instanceof Cell && !targetCell.immunity) {
                    // 飛沫感染を試みる
                    const jumpInfectionChance = 0.4; // 飛沫感染の基本確率
                    
                    if (Math.random() < jumpInfectionChance) {
                        targetCell.infected = 20;
                        targetCell.infectedBy = this.type;
                        // ウイルスに少し寿命を追加
                        this.lifespan += 5;
                    }
                }
            }
        }
    }
    
    for (const neighbor of neighborCells) {
        // 通常のウイルスは免疫を持つ細胞には感染しない
        // 致死性ウイルスは25%の確率で免疫を突破できる
        const canBypassImmunity = this.type === 'lethal' && Math.random() < 0.25;
        
        if (neighbor instanceof Cell && (!neighbor.immunity || canBypassImmunity)) {
            // 感染の可能性
            let infectionChance = this.infectionRate;
            
            // 免疫を貫通したなら感染率上昇
            if (neighbor.immunity && canBypassImmunity) {
                infectionChance *= 1.5; // 免疫突破ボーナス
            }
            
            // 災害中は感染率上昇
            if (disasterActive) {
                infectionChance *= 2.2; // 元: 1.8 → 2.2に増加
            }
            
            // 致死性ウイルスはさらに感染力を高める
            if (this.type === 'lethal') {
                infectionChance *= 1.5; // 追加の感染率ボーナス
            }
            
            // 季節による感染率調整
            if (neighbor.type === currentSeason) {
                infectionChance *= 0.6; // 元: 0.5 → 0.6 (季節の恩恵を弱める)
            } else if (getOverridingElement(neighbor.type) === currentSeason) {
                infectionChance *= 1.7; // 元: 1.5 → 1.7
            }
            
            // 細胞タイプごとの抵抗力
            let resistanceChance = getCellResistance(neighbor.type);
            
            // 季節による抵抗力調整
            if (neighbor.type === currentSeason) {
                resistanceChance *= 1.3; // 元: 1.5 → 1.3 (季節の恩恵を弱める)
            } else if (getOverridingElement(neighbor.type) === currentSeason) {
                resistanceChance *= 0.6; // 元: 0.5 → 0.6
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
                                let spreadChance = 0.7; // 元: 0.6 → 0.7
                                
                                // 季節による調整
                                if (neighbor.type === currentSeason) {
                                    spreadChance = 0.4; // 元: 0.3 → 0.4
                                } else if (getOverridingElement(neighbor.type) === currentSeason) {
                                    spreadChance = 0.9; // 元: 0.8 → 0.9
                                }
                                
                                if (Math.random() < spreadChance) {
                                    secNeighbor.infected = 20;
                                    secNeighbor.infectedBy = this.type;
                                }
                            }
                        }
                    }
                    
                    // ウイルスに少し利益を与える
                    this.lifespan += 10; // 元: 5 → 10 (感染成功時の寿命回復増加)
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
        
        // 致死性ウイルスは少し大きく
        if (this.type === 'lethal') {
            finalSize = size * 1.4;
        }
        
        ctx.fillStyle = this.color;
        
        // ウイルスタイプ別の形状
        if (this.type === 'lethal') {
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
        
        // 災害中は点滅効果
        if (disasterActive && this.type === 'lethal' && Math.random() < 0.3) {
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
}


	function findCellClusters() {
    const clusters = [];
    const gridSize = 10; // グリッドのサイズ
    
    // グリッドサイズの計算時にエラーチェックを追加
    const gridSizeY = Math.max(1, Math.ceil(GRID_SIZE_Y / gridSize));
    const gridSizeX = Math.max(1, Math.ceil(GRID_SIZE_X / gridSize));
    
    const cellCountGrid = Array(gridSizeY)
        .fill(0)
        .map(() => Array(gridSizeX).fill(0));
    
    // グリッドごとに細胞数をカウント
    for (const cell of cells) {
        const gridX = Math.min(gridSizeX - 1, Math.floor(cell.x / gridSize));
        const gridY = Math.min(gridSizeY - 1, Math.floor(cell.y / gridSize));
        cellCountGrid[gridY][gridX]++;
    }
    
    // 最も細胞が多いグリッドを見つける（最大5つまで）
    for (let i = 0; i < 5; i++) {
        let maxCount = 0;
        let maxX = 0;
        let maxY = 0;
        
        for (let y = 0; y < cellCountGrid.length; y++) {
            for (let x = 0; x < cellCountGrid[y].length; x++) {
                if (cellCountGrid[y][x] > maxCount) {
                    maxCount = cellCountGrid[y][x];
                    maxX = x;
                    maxY = y;
                }
            }
        }
        
        if (maxCount > 0) {
            // クラスターの中心座標を計算
            const centerX = maxX * gridSize + gridSize / 2;
            const centerY = maxY * gridSize + gridSize / 2;
            clusters.push({ x: centerX, y: centerY, count: maxCount });
            
            // 同じクラスターを2回カウントしないよう0にする
            cellCountGrid[maxY][maxX] = 0;
        }
    }
    
    // 少なくとも1つのクラスターを返す保証
    if (clusters.length === 0 && cells.length > 0) {
        // セルが存在するが、クラスターが見つからない場合はランダムなセルの位置をクラスターとして使用
        const randomCell = cells[Math.floor(Math.random() * cells.length)];
        clusters.push({ x: randomCell.x, y: randomCell.y, count: 1 });
    }
    
    return clusters;
}

// 細胞クラス
class Cell extends Entity {
    constructor(x, y, type) {
        super(x, y, type);
        this.color = CELL_COLORS[type];
        this.shape = CELL_SHAPES[type];
        this.size = CELL_SIZES[type]; // タイプごとのサイズ
        this.energy = 100;
        
        // 季節による寿命調整
        let lifespanModifier = 1.0;
        if (type === currentSeason) {
            lifespanModifier = 1.5; // 自分の季節では長寿命
        } else if (getGeneratedElement(currentSeason) === type) {
            lifespanModifier = 1.3; // 相生関係（自分が生成される側）でも長寿命
        } else if (getOverridingElement(currentSeason) === type) {
            lifespanModifier = 0.7; // 相剋関係（自分が抑制される側）では短命
        }
        
        this.maxLifespan = Math.floor(Math.random() * (300 - 100 + 1) + 100) * lifespanModifier;
        this.pulsePhase = Math.random() * Math.PI * 2;
        
        // 感染・免疫関連の属性追加
        this.infected = 0;       // 感染状態（0=未感染、N=感染残りターン数）
        this.infectedBy = null;  // 感染源のウイルスタイプ
        this.immunity = false;   // 免疫状態
        this.immunityTimer = 0;  // 免疫の残りターン数
        
        // タイプごとの特性
        this.activity = getActivityByType(type);        
        this.energyToReproduce = getEnergyToReproduceByType(type);    
        this.reproductionRate = getReproductionRateByType(type);  
        
        // 季節による繁殖率調整
        if (type === currentSeason) {
            this.reproductionRate *= 1.5; // 自分の季節では繁殖率上昇
        } else if (getGeneratedElement(currentSeason) === type) {
            this.reproductionRate *= 1.3; // 相生関係でも繁殖率上昇
        } else if (getOverridingElement(currentSeason) === type) {
            this.reproductionRate *= 0.7; // 相剋関係では繁殖率低下
        }
        
        this.lifespan = this.maxLifespan;
    }

    move() {
        // 感染の影響を処理
        if (this.infected > 0) {
            // 季節による感染影響の調整
            let energyDrainModifier = 1.0;
            let lifespanDrainModifier = 1.0;
            
           if (this.type === currentSeason) {
            energyDrainModifier = 0.8; // 元: 0.7 → 0.8 (季節の恩恵を弱める)
            lifespanDrainModifier = 0.7; // 元: 0.6 → 0.7 (季節の恩恵を弱める)
        } else if (getOverridingElement(currentSeason) === this.type) {
            energyDrainModifier = 1.8; // 元: 1.5 → 1.8
            lifespanDrainModifier = 1.8; // 元: 1.5 → 1.8
        }
            
            // 感染タイプに応じた効果（季節調整含む）
        if (this.infectedBy === 'yin') {
            // 陰ウイルスの効果：抑制的
            this.activity *= 0.6;  // 元: 0.7 → 0.6
            this.energy -= 0.7 * energyDrainModifier;  // 元: 0.5 → 0.7
        } else if (this.infectedBy === 'yang') {
            // 陽ウイルスの効果：亢進的
            this.activity *= 1.5;  // 元: 1.5 → 1.7
            this.energy -= 0.85 * energyDrainModifier;  // 元: 0.8 → 1.0
        } else if (this.infectedBy === 'lethal') {
            // 致死性ウイルスの効果：致命的
            this.activity *= 0.3;  // 元: 0.4 → 0.3
            this.energy -= 1.8 * energyDrainModifier;  // 元: 1.5 → 1.8
            this.lifespan -= 0.7 * lifespanDrainModifier;  // 元: 0.5 → 0.7
        }
            
            // 感染の進行
            this.infected--;
            
            // 周囲の同種セルへの二次感染（木と水は特に感染拡大しやすい）
            if (this.infected > 0 && (this.type === 'wood' || this.type === 'water')) {
                const secondaryNeighbors = getNeighboringCells(this.x, this.y);
                for (const neighbor of secondaryNeighbors) {
                    if (neighbor instanceof Cell && !neighbor.immunity && 
                        neighbor.type === this.type && !neighbor.infected) {
                        // 同種間の感染拡大確率
                        let spreadChance = 0.2;
                        
                        // 季節による調整
                        if (this.type === currentSeason) {
                            spreadChance = 0.1; // 自分の季節では感染拡大抑制
                        } else if (getOverridingElement(currentSeason) === this.type) {
                            spreadChance = 0.3; // 相剋関係では感染拡大促進
                        }
                        
                        if (Math.random() < spreadChance) {
                            neighbor.infected = 20;
                            neighbor.infectedBy = this.infectedBy;
                        }
                    }
                }
            }
            
            // 五行相互作用の追加
            if (this.infectedBy === 'yin' || this.infectedBy === 'yang') {
                const neighborCells = getNeighboringCells(this.x, this.y);
                for (const cell of neighborCells) {
                    if (cell instanceof Cell) {
                        const relation = getFiveElementsRelation(this.type, cell.type);
                        
                        // 季節による相互作用の調整
                        let effectModifier = 1.0;
                        if (this.type === currentSeason) {
                            effectModifier = 1.5; // 自分の季節では相互作用強化
                        } else if (getOverridingElement(currentSeason) === this.type) {
                            effectModifier = 0.7; // 相剋関係では相互作用弱化
                        }
                        
                        // 陰ウイルスは相剋（抑制）関係を強化
                        if (this.infectedBy === 'yin' && relation === 'overrides') {
                            this.energy += 0.2 * effectModifier; // 追加エネルギー獲得
                            cell.energy -= 0.3 * effectModifier; // 相手のエネルギーを余分に奪う
                        }
                        
                        // 陽ウイルスは相生（生成）関係を強化
                        if (this.infectedBy === 'yang' && relation === 'generates') {
                            this.energy += 0.2 * effectModifier; // 追加エネルギー獲得
                            cell.energy += 0.1 * effectModifier; // 相手にもエネルギーを少し与える
                        }
                    }
                }
            }
            
            // 回復のチャンス
           let recoveryChance = 0.04; // 元: 0.05 → 0.04 (基本回復率を下げる)
            
            // ウイルスタイプによる回復率調整
if (this.infectedBy === 'lethal') {
    recoveryChance = 0.01; // 元: 0.02 → 0.01
}
            
            // 季節による回復率調整
if (this.type === currentSeason) {
    recoveryChance *= 1.3; // 元: 1.5 → 1.3 (季節の恩恵を弱める)
} else if (getOverridingElement(currentSeason) === this.type) {
    recoveryChance *= 0.6; // 元: 0.7 → 0.6
}
			
			
            // 細胞タイプによる回復率調整
            recoveryChance *= getCellRecoveryMultiplier(this.type);
            
            if (Math.random() < recoveryChance) {
                this.infected = 0;
                this.immunity = true;
                
                // 免疫期間は季節によって調整
                if (this.type === currentSeason) {
                    this.immunityTimer = 150; // 自分の季節では免疫期間長め
                } else if (getOverridingElement(currentSeason) === this.type) {
                    this.immunityTimer = 60;  // 相剋関係では免疫期間短め
                } else {
                    this.immunityTimer = 100; // 標準の免疫期間
                }
            }
            
            // 致死判定 - 回復しなかった場合の致死率
            if (this.infected <= 1) { // 感染最終段階
                let deathChance = 0;
                
                if (this.infectedBy === 'yin') deathChance = 0.08;     
                else if (this.infectedBy === 'yang') deathChance = 0.04;
                else if (this.infectedBy === 'lethal') deathChance = 0.5;
                
                // 季節による死亡率調整
                if (this.type === currentSeason) {
                    deathChance *= 0.5; // 自分の季節では死亡率低下
                } else if (getOverridingElement(currentSeason) === this.type) {
                    deathChance *= 1.5; // 相剋関係では死亡率上昇
                }
                
                // 細胞タイプによる死亡率調整
                deathChance *= getCellDeathChanceMultiplier(this.type);
                
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
            // 季節による免疫持続調整
            let immunityDecayRate = 1.0; // 標準の減少率
            
            if (this.type === currentSeason) {
                immunityDecayRate = 0.7; // 自分の季節では免疫が長持ち
            } else if (getOverridingElement(currentSeason) === this.type) {
                immunityDecayRate = 1.5; // 相剋関係では免疫が早く消える
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
            // 季節による動きの調整
            let moveRange = 1; // 標準の移動範囲
            if (this.type === currentSeason) {
                moveRange = Math.random() < 0.3 ? 2 : 1; // 自分の季節ではより活発に
            } else if (getOverridingElement(currentSeason) === this.type) {
                moveRange = Math.random() < 0.7 ? 1 : 0; // 相剋関係では動きが鈍くなる
            }
            
            const dx = Math.floor(Math.random() * (moveRange * 2 + 1)) - moveRange;
            const dy = Math.floor(Math.random() * (moveRange * 2 + 1)) - moveRange;
            const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, this.x + dx));
            const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, this.y + dy));

            // 隣接するセルを検査して、五行相生相剋の関係を調べる
            const neighborCells = getNeighboringCells(this.x, this.y);
            for (const cell of neighborCells) {
                if (cell instanceof Cell) {
                    const relation = getFiveElementsRelation(this.type, cell.type);
                    
                    // 季節による相互作用の調整
                    let interactionModifier = 1.0;
                    if (this.type === currentSeason) {
                        interactionModifier = 1.5; // 自分の季節では相互作用強化
                    } else if (getGeneratedElement(currentSeason) === this.type) {
                        interactionModifier = 1.3; // 相生関係でも相互作用やや強化
                    } else if (getOverridingElement(currentSeason) === this.type) {
                        interactionModifier = 0.7; // 相剋関係では相互作用弱化
                    }
                    
                    if (relation === 'generates') {
                        this.energy += 0.3 * interactionModifier;
                        this.lifespan += 0.1 * interactionModifier;
                    } else if (relation === 'overrides') {
                        cell.energy -= 0.2 * interactionModifier;
                        cell.lifespan -= 0.05 * interactionModifier;
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
        
        // タイプ別の特殊能力
        applyElementSpecialAbility(this);
        
        // エネルギーと寿命の減少（季節に応じて調整）
        let energyDecayRate = Math.floor(Math.random() * 2 + 1) / 100;
        let lifespanDecayRate = 0.05;
        
        // 季節によるエネルギーと寿命の減少率調整
        if (this.type === currentSeason) {
            energyDecayRate *= 0.7; // 自分の季節ではエネルギー消費低下
            lifespanDecayRate *= 0.7; // 自分の季節では寿命減少率低下
        } else if (getOverridingElement(currentSeason) === this.type) {
            energyDecayRate *= 1.5; // 相剋関係ではエネルギー消費上昇
            lifespanDecayRate *= 1.5; // 相剋関係では寿命減少率上昇
        }
        
        this.energy -= energyDecayRate;
        this.lifespan -= lifespanDecayRate;
        
        // 脈動を更新（季節によって脈動速度を調整）
        let pulseSpeed = 0.1;
        if (this.type === currentSeason) {
            pulseSpeed = 0.15; // 自分の季節では脈動速度上昇
        } else if (getOverridingElement(currentSeason) === this.type) {
            pulseSpeed = 0.07; // 相剋関係では脈動速度低下
        }
        
        this.pulsePhase += pulseSpeed;
        if (this.pulsePhase > Math.PI * 2) {
            this.pulsePhase = 0;
        }
        
        // 死亡判定
        if (this.energy < 0 || this.lifespan < 0) {
            // 死亡時に死骸を残す確率
            if (Math.random() < 0.5) {
                const corpse = new Corpse(this.x, this.y, this.type, null);
                grid[this.y][this.x] = corpse;
                entities.push(corpse);
                corpses.push(corpse);
            } else {
                grid[this.y][this.x] = null;
            }
            return false;
        }

        // 繁殖
let reproductionThreshold = this.energyToReproduce;
let reproductionProbability = this.reproductionRate;

// 季節による繁殖しやすさの調整
if (this.type === currentSeason) {
    reproductionThreshold *= 0.85; // 元: 0.8
    reproductionProbability *= 1.3; // 元: 1.5
} else if (getOverridingElement(currentSeason) === this.type) {
    reproductionThreshold *= 1.2;
    reproductionProbability *= 0.7;
}

if (this.energy > reproductionThreshold) {
    // 混雑係数を計算
    const crowdingFactor = calculateCrowdingFactor();
    
    // 繁殖確率に混雑係数を適用
    const adjustedProbability = reproductionProbability * crowdingFactor;
    
    if (Math.random() < adjustedProbability) {
        this.reproduce();
    }
}
        
        return true;
    }
    
    reproduce() {
    const neighbors = getNeighboringEmptyCells(this.x, this.y);
    
    // 空きセルの数に基づいて繁殖確率を調整（密度依存）
    const emptyNeighborRatio = neighbors.length / 8; // 最大8つの隣接セル
    
    // 少なくとも1つの空きセルがあり、かつランダム値が調整された確率より小さい場合に繁殖する
    if (neighbors.length > 0 && Math.random() < emptyNeighborRatio * 0.8 + 0.2) {
        const [nx, ny] = neighbors[Math.floor(Math.random() * neighbors.length)];

        // 突然変異のチャンス（季節によって調整）
        let mutationChance = 0.1; // 基本10%の突然変異確率
        
        if (this.type === currentSeason) {
            mutationChance = 0.05; // 自分の季節では突然変異が少ない
        } else if (getOverridingElement(currentSeason) === this.type) {
            mutationChance = 0.15; // 相剋関係では突然変異が多い
        }
        
        // 型ごとの調整
        if (this.type === 'wood') {
            mutationChance *= 1.5; // 木は突然変異しやすい
        } else if (this.type === 'metal') {
            mutationChance *= 0.7; // 金属は突然変異しにくい
        }
        
        const childType = Math.random() < (1 - mutationChance) ? this.type : CELL_TYPES[Math.floor(Math.random() * CELL_TYPES.length)];
        const newCell = new Cell(nx, ny, childType);
        
        if (this.generation !== undefined) {
            newCell.generation = this.generation + 1;
        } else {
            newCell.generation = 1;
        }
        
        // 免疫を子に伝える可能性
        let immunityTransferChance = 0.3; // 基本30%の免疫継承確率
        
        if (this.type === currentSeason) {
            immunityTransferChance = 0.5; // 自分の季節では免疫継承確率上昇
        } else if (getOverridingElement(currentSeason) === this.type) {
            immunityTransferChance = 0.2; // 相剋関係では免疫継承確率低下
        }
        
        if (this.immunity && Math.random() < immunityTransferChance) {
            newCell.immunity = true;
            newCell.immunityTimer = 40; // 子の免疫期間は親より短め
        }
        
        grid[ny][nx] = newCell;
        entities.push(newCell);
        cells.push(newCell);
        
        // 繁殖によるエネルギー消費
        this.energy -= 30;
    }
}

    draw() {
        const drawX = this.x * CELL_SIZE;
        const drawY = this.y * CELL_SIZE;
        
        // サイズに基づくスケーリング
        const size = (this.size / 10) * CELL_SIZE;
        
        // 季節による脈動効果の調整
        let pulseAmplitude = 0.1; // 標準の脈動幅
        
        if (this.type === currentSeason) {
            pulseAmplitude = 0.2; // 自分の季節では脈動が大きい
        } else if (getOverridingElement(currentSeason) === this.type) {
            pulseAmplitude = 0.05; // 相剋関係では脈動が小さい
        }
        
        const pulseFactor = 1 + pulseAmplitude * Math.sin(this.pulsePhase);
        const finalSize = size * pulseFactor;
        
        // 中心からのオフセット計算
        const offsetX = (CELL_SIZE - finalSize) / 2;
        const offsetY = (CELL_SIZE - finalSize) / 2;
        
        ctx.fillStyle = this.color;
        ctx.beginPath();
        
        // タイプに基づく洗練された形状
        switch (this.type) {
            case 'wood':
                // 木は葉や枝のような有機的な形に
                ctx.beginPath();
                const woodSegments = 5;
                for (let i = 0; i < woodSegments; i++) {
                    const angle = (Math.PI * 2 * i) / woodSegments + this.pulsePhase * 0.1;
                    const innerRadius = finalSize * 0.4;
                    const outerRadius = finalSize * 0.7;
                    
                    const ix = drawX + CELL_SIZE/2 + Math.cos(angle) * innerRadius;
                    const iy = drawY + CELL_SIZE/2 + Math.sin(angle) * innerRadius;
                    const ox = drawX + CELL_SIZE/2 + Math.cos(angle) * outerRadius;
                    const oy = drawY + CELL_SIZE/2 + Math.sin(angle) * outerRadius;
                    
                    if (i === 0) {
                        ctx.moveTo(ix, iy);
                    } else {
                        ctx.lineTo(ix, iy);
                    }
                    ctx.lineTo(ox, oy);
                }
                ctx.closePath();
                ctx.fill();
                
                // 発光効果
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#A5D6A7'; // 明るい緑の発光
                ctx.beginPath();
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
                break;
                
            case 'fire':
                // 火の炎を表現
                ctx.beginPath();
                const flameSegments = 7;
                for (let i = 0; i < flameSegments; i++) {
                    const angle = (Math.PI * 2 * i) / flameSegments + this.pulsePhase * 0.3;
                    const flameHeight = finalSize * (0.6 + Math.random() * 0.4);
                    
                    const fx = drawX + CELL_SIZE/2 + Math.cos(angle) * flameHeight;
                    const fy = drawY + CELL_SIZE/2 + Math.sin(angle) * flameHeight;
                    
                    if (i === 0) {
                        ctx.moveTo(fx, fy);
                    } else {
                        ctx.bezierCurveTo(
                            drawX + CELL_SIZE/2 + Math.cos(angle - 0.2) * flameHeight * 0.7,
                            drawY + CELL_SIZE/2 + Math.sin(angle - 0.2) * flameHeight * 0.7,
                            drawX + CELL_SIZE/2 + Math.cos(angle + 0.2) * flameHeight * 0.7,
                            drawY + CELL_SIZE/2 + Math.sin(angle + 0.2) * flameHeight * 0.7,
                            fx, fy
                        );
                    }
                }
                ctx.closePath();
                ctx.fill();
                
                // 内側の発光
                ctx.globalAlpha = 0.7;
                const fireGradient = ctx.createRadialGradient(
                    drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, 0,
                    drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.8
                );
                fireGradient.addColorStop(0, '#FFEB3B'); // 黄色っぽい中心
                fireGradient.addColorStop(1, '#FF5722'); // オレンジの外側
                ctx.fillStyle = fireGradient;
                ctx.beginPath();
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize *0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
                break;
                
            case 'earth':
                // 土は六角形の結晶構造
                ctx.beginPath();
                const earthSegments = 6;
                for (let i = 0; i < earthSegments; i++) {
                    const angle = (Math.PI * 2 * i) / earthSegments;
                    const ex = drawX + CELL_SIZE/2 + Math.cos(angle) * finalSize * 0.7;
                    const ey = drawY + CELL_SIZE/2 + Math.sin(angle) * finalSize * 0.7;
                    
                    if (i === 0) {
                        ctx.moveTo(ex, ey);
                    } else {
                        ctx.lineTo(ex, ey);
                    }
                }
                ctx.closePath();
                ctx.fill();
                
                // テクスチャ表現
                ctx.strokeStyle = '#FFD54F'; // 明るい金色の線
                ctx.lineWidth = 1;
                ctx.stroke();
                
                // 中心部
                ctx.beginPath();
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = '#FFD54F';
                ctx.fill();
                break;
                
            case 'metal':
                // 金属は多面体
                ctx.beginPath();
                const metalSegments = 8;
                for (let i = 0; i < metalSegments; i++) {
                    const angle = (Math.PI * 2 * i) / metalSegments + Math.PI / metalSegments;
                    const mx = drawX + CELL_SIZE/2 + Math.cos(angle) * finalSize * 0.7;
                    const my = drawY + CELL_SIZE/2 + Math.sin(angle) * finalSize * 0.7;
                    
                    if (i === 0) {
                        ctx.moveTo(mx, my);
                    } else {
                        ctx.lineTo(mx, my);
                    }
                }
                ctx.closePath();
                ctx.fill();
                
                // 金属光沢
                const metalGradient = ctx.createLinearGradient(
                    drawX, drawY,
                    drawX + CELL_SIZE, drawY + CELL_SIZE
                );
                metalGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
                metalGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
                metalGradient.addColorStop(1, 'rgba(255, 255, 255, 0.5)');
                
                ctx.fillStyle = metalGradient;
                ctx.fill();
                break;
                
            case 'water':
                // 水は流動的な波形
                ctx.beginPath();
                const waterSegments = 12;
                for (let i = 0; i < waterSegments; i++) {
                    const angle = (Math.PI * 2 * i) / waterSegments + this.pulsePhase * 0.2;
                    const waveHeight = finalSize * (0.5 + Math.sin(angle * 3) * 0.2);
                    
                    const wx = drawX + CELL_SIZE/2 + Math.cos(angle) * waveHeight;
                    const wy = drawY + CELL_SIZE/2 + Math.sin(angle) * waveHeight;
                    
                    if (i === 0) {
                        ctx.moveTo(wx, wy);
                    } else {
                        ctx.bezierCurveTo(
                            drawX + CELL_SIZE/2 + Math.cos(angle - 0.2) * (waveHeight + Math.sin(angle * 5 + this.pulsePhase) * finalSize * 0.1),
                            drawY + CELL_SIZE/2 + Math.sin(angle - 0.2) * (waveHeight + Math.sin(angle * 5 + this.pulsePhase) * finalSize * 0.1),
                            drawX + CELL_SIZE/2 + Math.cos(angle + 0.2) * (waveHeight + Math.sin(angle * 5 + this.pulsePhase) * finalSize * 0.1),
                            drawY + CELL_SIZE/2 + Math.sin(angle + 0.2) * (waveHeight + Math.sin(angle * 5 + this.pulsePhase) * finalSize * 0.1),
                            wx, wy
                        );
                    }
                }
                ctx.closePath();
                ctx.fill();
                
                // 透明効果
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#81D4FA'; // 明るい水色
                ctx.beginPath();
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
                break;
        }
        
        // 感染状態の視覚効果を追加
        if (this.infected > 0) {
            ctx.globalAlpha = Math.min(0.7, this.infected / 15);
            ctx.fillStyle = VIRUS_COLORS[this.infectedBy] || 'rgba(255, 0, 255, 0.3)';
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
        
        // 現在の季節と一致するセルは特に輝く
        if (this.type === currentSeason) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = CELL_COLORS[this.type];
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
}

// 季節の色を取得
function getSeasonColor() {
    return CELL_COLORS[currentSeason];
}

// drawBackground関数
/*
function drawBackground() {
    // 現在の季節に応じた背景色
    const seasonColor = SEASON_COLORS[currentSeason];
    const innerColor = seasonColor.inner;
    const outerColor = seasonColor.outer;
    
    // 背景グラデーション
    const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
    );
    
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(1, outerColor);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 災害中は赤い霧効果
    if (disasterActive) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.03)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}
*/

function drawBackground() {
    // Create a subtle gradient that doesn't change with seasons
    const innerColor = '#1a1a1a';
    const outerColor = '#101010';
    
    const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
    );
    
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(1, outerColor);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}


// 情報パネル更新関数を修正して災害メッセージを表示
// updateInfoPanel関数内の該当部分を修正
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
        
        // 災害状態の表示 - シンプル化したバージョン
        if (disasterActive) {
            populationBarsHTML += `<div style="margin-top: 5px; color: red; font-weight: bold;">
                ${disasterMessage || '！ 災害発生中 ！'}： ${disasterTimer} ターン残り
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
    } else {
        populationBarsHTML = '<div>No cells alive</div>';
    }
    
    populationBarsDisplay.innerHTML = populationBarsHTML;
}


// addDisasterControls 関数を修正して、既存の災害設定要素を削除してから新しい要素を追加

function addDisasterControls() {
    // 既存のコントロールパネルを取得
    const controlsPanel = document.getElementById('controls-panel');
    
    // 既存の災害設定セクションを削除（もし存在すれば）
    const existingSection = document.getElementById('disaster-settings-section');
    if (existingSection) {
        existingSection.remove();
    }
    
    // 災害設定セクション
    const disasterSection = document.createElement('div');
    disasterSection.className = 'control-section';
    disasterSection.id = 'disaster-settings-section'; // IDを追加して後で見つけられるようにする
    disasterSection.innerHTML = `
        <h3>災害設定</h3>
        <div class="control-item">
            <label for="disasterFrequencySlider">発生間隔（年）:</label>
            <input type="range" id="disasterFrequencySlider" min="1" max="5" value="${disasterFrequency}" step="1">
            <span id="disasterFrequencyValue">${disasterFrequency}</span>
        </div>
        <div class="control-item">
            <label for="disasterProbabilitySlider">発生確率:</label>
            <input type="range" id="disasterProbabilitySlider" min="0.1" max="1" value="${disasterProbability}" step="0.1">
            <span id="disasterProbabilityValue">${disasterProbability.toFixed(1)}</span>
        </div>
        <div class="control-item">
            <label for="disasterDurationSlider">持続時間:</label>
            <input type="range" id="disasterDurationSlider" min="100" max="5000" value="${disasterDuration}" step="50">
            <span id="disasterDurationValue">${disasterDuration}</span>
        </div>
        <div class="control-item">
            <button id="triggerDisasterBtn">災害を発生させる</button>
        </div>
    `;
    
    // controlsPanelの最後に追加
    controlsPanel.appendChild(disasterSection);
    
    // スライダーのイベントリスナーを設定
    // 必ず要素が追加された後にイベントリスナーを設定すること
    document.getElementById('disasterFrequencySlider').addEventListener('input', function() {
        disasterFrequency = parseInt(this.value);
        document.getElementById('disasterFrequencyValue').textContent = disasterFrequency;
    });
    
    document.getElementById('disasterProbabilitySlider').addEventListener('input', function() {
        disasterProbability = parseFloat(this.value);
        document.getElementById('disasterProbabilityValue').textContent = disasterProbability.toFixed(1);
    });
    
    document.getElementById('disasterDurationSlider').addEventListener('input', function() {
        disasterDuration = parseInt(this.value);
        document.getElementById('disasterDurationValue').textContent = disasterDuration;
    });
    
    // 手動災害発生ボタンのイベントリスナー
    document.getElementById('triggerDisasterBtn').addEventListener('click', function() {
        startDisaster();
    });
}




// 五行の関係を取得する関数
function getFiveElementsRelation(type1, type2) {
    const relations = {
        wood: { generates: 'fire', overrides: 'earth' },
        fire: { generates: 'earth', overrides: 'metal' },
        earth: { generates: 'metal', overrides: 'water' },
        metal: { generates: 'water', overrides: 'wood' },
        water: { generates: 'wood', overrides: 'fire' }
    };
    
    if (relations[type1].generates === type2) {
        return 'generates';
    } else if (relations[type1].overrides === type2) {
        return 'overrides';
    } else {
        return 'neutral';
    }
}

// type1が生成するelement
function getGeneratedElement(type1) {
    const generatedElements = {
        wood: 'fire',
        fire: 'earth',
        earth: 'metal',
        metal: 'water',
        water: 'wood'
    };
    
    return generatedElements[type1];
}

// type1を抑制するelement
function getOverridingElement(type1) {
    const overridingElements = {
        wood: 'metal',
        fire: 'water',
        earth: 'wood',
        metal: 'fire',
        water: 'earth'
    };
    
    return overridingElements[type1];
}

// タイプごとの活動性を取得
function getActivityByType(type) {
    switch(type) {
        case 'wood': return 0.7;
        case 'fire': return 0.9;
        case 'earth': return 0.4;
        case 'metal': return 0.5;
        case 'water': return 0.8;
        default: return 0.6;
    }
}

// タイプごとの繁殖に必要なエネルギーを取得
function getEnergyToReproduceByType(type) {
    switch(type) {
        case 'wood': return 65;
        case 'fire': return 70;
        case 'earth': return 75;
        case 'metal': return 85;
        case 'water': return 80;
        default: return 75;
    }
}

// タイプごとの繁殖率を取得
function getReproductionRateByType(type) {
    switch(type) {
        case 'wood': return 0.008;
        case 'fire': return 0.006;
        case 'earth': return 0.005;
        case 'metal': return 0.004;
        case 'water': return 0.007;
        default: return 0.006;
    }
}

// Cell抵抗力関数の調整

// getCellResistance 関数の修正
function getCellResistance(type) {
    switch(type) {
        case 'metal': return 0.65; // 元: 0.6 → 0.65 (少し強化)
        case 'wood': return 0.2;   // 元: 0.15 → 0.2 
        case 'water': return 0.25; // 元: 0.2 → 0.25
        case 'fire': return 0.45;  // 元: 0.4 → 0.45
        case 'earth': return 0.55; // 元: 0.5 → 0.55
        default: return 0.35;      // 元: 0.3 → 0.35
    }
}

// タイプごとの回復率乗数を取得
function getCellRecoveryMultiplier(type) {
    switch(type) {
        case 'metal': return 1.5; // 金属は回復しやすい
        case 'wood': return 0.8;  // 木は回復しにくい
        case 'water': return 0.7; // 水は回復しにくい
        case 'fire': return 1.2;  // 火は回復しやすい
        case 'earth': return 1.0; // 土は標準
        default: return 1.0;
    }
}

// タイプごとの死亡率乗数を取得
function getCellDeathChanceMultiplier(type) {
    switch(type) {
        case 'metal': return 0.5; // 金属は死亡率が低い
        case 'wood': return 1.5;  // 木は死亡率が高い
        case 'water': return 1.5; // 水は死亡率が高い
        case 'fire': return 0.7;  // 火は死亡率が低い
        case 'earth': return 0.6; // 土は死亡率が低い
        default: return 1.0;
    }
}

// タイプ別の特殊能力を適用
function applyElementSpecialAbility(cell) {
    switch(cell.type) {
        case 'wood':
            // 成長の性質：近くに空きスペースがあると成長してエネルギー回復
            const emptySpaces = getNeighboringEmptyCells(cell.x, cell.y).length;
            let growthModifier = 1.0;
            
            // 季節による成長力の調整
            if (currentSeason === 'wood') {
                growthModifier = 2.0; // 木の季節では成長力が特に高まる
            } else if (currentSeason === 'metal') {
                growthModifier = 0.5; // 金属の季節では成長力が低下
            }
            
            if (emptySpaces > 3) {
                cell.energy += 0.01 * growthModifier;
            }
            break;
            
        case 'fire':
            // 熱の性質：エネルギーを速く消費するが、活動的
            let burnModifier = 1.0;
            
            // 季節によるエネルギー消費調整
            if (currentSeason === 'fire') {
                burnModifier = 0.7; // 火の季節ではエネルギー消費低下
            } else if (currentSeason === 'water') {
                burnModifier = 1.5; // 水の季節ではエネルギー消費上昇
            }
            
            cell.energy -= 0.01 * burnModifier;
            
            // 明るさで周囲に影響
            const nearbyEntities = getNeighboringCells(cell.x, cell.y);
            for (const entity of nearbyEntities) {
                if (entity instanceof Cell && entity.type === 'wood') {
                    // 火の季節では火が木に与える影響が強くなる
                    let effectStrength = currentSeason === 'fire' ? 0.02 : 0.01;
                    entity.energy -= effectStrength; // 木に燃え移る
                }
            }
            break;
            
        case 'earth':
            // 安定の性質：定期的にエネルギー回復
            let recoveryModifier = 1.0;
            let recoveryChance = 0.1;
            
            // 季節による回復力調整
            if (currentSeason === 'earth') {
                recoveryModifier = 1.5; // 土の季節では回復力上昇
            } else if (currentSeason === 'wood') {
                recoveryModifier = 0.7; // 木の季節では回復力低下
            }
            
            if (Math.random() < recoveryChance) {
                cell.energy += 0.008 * recoveryModifier;
            }
            break;
            
        case 'metal':
            // 堅固の性質：外部からの影響を受けにくい
            let resistanceModifier = 1.0;
            
            // 季節による耐性調整
            if (currentSeason === 'metal') {
                resistanceModifier = 1.5; // 金属の季節では耐性上昇
            } else if (currentSeason === 'fire') {
                resistanceModifier = 0.6; // 火の季節では耐性低下
            }
            
            if (Math.random() < 0.3 * resistanceModifier) {
                // 相剋関係の影響を一定確率で軽減
                cell.energy += 0.005 * resistanceModifier;
            }
            break;
            
        case 'water':
            // 適応力：環境に応じてエネルギー消費調整
            let adaptabilityModifier = 1.0;
            
            // 季節による適応力調整
            if (currentSeason === 'water') {
                adaptabilityModifier = 1.5; // 水の季節では適応力上昇
            } else if (currentSeason === 'earth') {
                adaptabilityModifier = 0.7; // 土の季節では適応力低下
            }
            
            const surroundingCount = getNeighboringCells(cell.x, cell.y).length;
            if (surroundingCount > 4) {
                // 混雑した場所でのエネルギー消費
                let consumptionRate = 0.01;
                cell.energy -= consumptionRate;
            } else {
                // 空いた場所での回復
                cell.energy += 0.01 * adaptabilityModifier * (4 - surroundingCount);
            }
            break;
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

// 広範囲の周辺セルを取得する関数
function getExtendedNeighborCells(x, y, radius) {
    const neighbors = [];
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            // 直接の隣接セルは除外（既に通常の関数で取得済み）
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < GRID_SIZE_X && ny >= 0 && ny < GRID_SIZE_Y && grid[ny][nx] !== null) {
                if (grid[ny][nx] instanceof Cell) {
                    neighbors.push(grid[ny][nx]);
                }
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

// 5. 致死性ウイルスの出現を確実にする
// startDisaster関数内で、致死性ウイルスの発生を確実にするコードを強化

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
        
        // 情報パネルに災害メッセージを設定
        disasterMessage = '！ 災害発生中 ！';
        
        console.log("Natural disaster occurred!");
    }
}

// 細胞の密集地帯を見つける補助関数
function findCellClusters() {
    const clusters = [];
    const gridSize = 10; // グリッドのサイズ
    const cellCountGrid = Array(Math.ceil(GRID_SIZE_Y / gridSize))
        .fill(0)
        .map(() => Array(Math.ceil(GRID_SIZE_X / gridSize)).fill(0));
    
    // グリッドごとに細胞数をカウント
    for (const cell of cells) {
        const gridX = Math.floor(cell.x / gridSize);
        const gridY = Math.floor(cell.y / gridSize);
        cellCountGrid[gridY][gridX]++;
    }
    
    // 最も細胞が多いグリッドを見つける（最大5つまで）
    for (let i = 0; i < 5; i++) {
        let maxCount = 0;
        let maxX = 0;
        let maxY = 0;
        
        for (let y = 0; y < cellCountGrid.length; y++) {
            for (let x = 0; x < cellCountGrid[y].length; x++) {
                if (cellCountGrid[y][x] > maxCount) {
                    maxCount = cellCountGrid[y][x];
                    maxX = x;
                    maxY = y;
                }
            }
        }
        
        if (maxCount > 0) {
            // クラスターの中心座標を計算
            const centerX = maxX * gridSize + gridSize / 2;
            const centerY = maxY * gridSize + gridSize / 2;
            clusters.push({ x: centerX, y: centerY, count: maxCount });
            
            // 同じクラスターを2回カウントしないよう0にする
            cellCountGrid[maxY][maxX] = 0;
        }
    }
    
    return clusters;
}

// 災害状態の更新関数も修正
function updateDisaster() {
    if (disasterActive) {
        disasterTimer--;
        
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
    // 災害メッセージをクリア
    disasterMessage = '災害終了';
    
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
        if (Math.random() < 0.5) { // 30%の確率で免疫を獲得
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

// 季節の更新処理
function updateSeason() {
    // 現在時刻を取得
    const currentTime = performance.now() / 1000; // 秒単位
    const deltaTime = currentTime - lastSeasonUpdateTime;
    lastSeasonUpdateTime = currentTime;
    
    // 季節タイマーを更新
    seasonTimer += deltaTime;
    yearTimer += deltaTime;
    
    // 1年のサイクルで管理
    if (yearTimer >= yearTotalTime) {
        yearTimer = 0;
        disasterYearCounter++;
        
        // 災害発生判定 - 頻度と確率を調整
        if (disasterYearCounter >= disasterFrequency && Math.random() < disasterProbability) {
            startDisaster();
            disasterYearCounter = 0;
        }
    }
    
    // 季節の切り替え
    if (seasonTimer >= seasonTime) {
        seasonTimer = 0;
        
        // 次の季節に移行
        const seasonOrder = ['wood', 'fire', 'earth', 'metal', 'water'];
        const currentIndex = seasonOrder.indexOf(currentSeason);
        const nextIndex = (currentIndex + 1) % seasonOrder.length;
        currentSeason = seasonOrder[nextIndex];
        
        console.log(`Season changed: ${ELEMENT_SEASONS[currentSeason]}`);
    }
}

function initDisasterControls() {
    // 既存のコントロールに災害設定を追加
    addDisasterControls();
    
    // 災害メッセージを初期化
    disasterMessage = '';
}

// 初期化関数
function init() {
    resizeCanvas();
    entities = [];
    viruses = [];
    cells = [];
    corpses = [];
    disasterActive = false;
    disasterTimer = 0;
    yearTimer = 0;
    disasterYearCounter = 0;
    infoPanelUpdateCounter = 0;
    
    // 季節変数の初期化
    currentSeason = 'wood'; // 春から始める
    seasonTimer = 0;
    lastSeasonUpdateTime = performance.now() / 1000;

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

    // 細胞の初期配置
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
    
    // ここに initDisasterControls() の呼び出しを追加
    initDisasterControls();
}

// メインアップデート関数
function update() {
    // 季節の更新
    updateSeason();
    
    // 災害状態の更新
    updateDisaster();
    
    // 環境収容能力に基づくストレス計算
    const currentPopulation = cells.length;
    // 収容能力の80%を超えると環境ストレスが発生
    if (currentPopulation > CARRYING_CAPACITY * 0.8) {
        // 収容能力を超えるほど、ストレスが増加
        const stressFactor = Math.pow((currentPopulation - CARRYING_CAPACITY * 0.8) / (CARRYING_CAPACITY * 0.2), 2) * 0.01;
        
        // ランダムな細胞にダメージを与える
        const stressCount = Math.floor(currentPopulation * stressFactor);
        for (let i = 0; i < stressCount; i++) {
            if (cells.length > 0) {
                const randomIndex = Math.floor(Math.random() * cells.length);
                cells[randomIndex].energy -= 0.5;
                cells[randomIndex].lifespan -= 0.2;
            }
        }
    }
    
    // エンティティのリストの一時コピーを使用して、安全に削除できるようにする
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

    // 新しいウイルスを生成（季節に応じて調整）
    let baseVirusGenerationChance = 0.03; // 元: 0.02

    // 季節による生成率調整
    const yinGeneration = (currentSeason === 'water' || currentSeason === 'metal') ? 1.5 : 0.8;
    const yangGeneration = (currentSeason === 'fire' || currentSeason === 'wood') ? 1.5 : 0.8;

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
    
    // 混雑係数を計算して、ウイルス生成確率を調整
    const crowdingFactor = calculateCrowdingFactor();
    
    if (viruses.length < maxViruses && Math.random() < adjustedChance * crowdingFactor) {
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
            // 季節によってyinとyangの生成率を調整
            let virusType = 'yin';
            const rand = Math.random();
            
            if ((currentSeason === 'water' || currentSeason === 'metal') && rand < 0.7) {
                virusType = 'yin'; // 水と金の季節では陰ウイルスが多い
            } else if ((currentSeason === 'fire' || currentSeason === 'wood') && rand < 0.7) {
                virusType = 'yang'; // 火と木の季節では陽ウイルスが多い
            } else if (rand < 0.5) {
                virusType = 'yin';
            } else {
                virusType = 'yang';
            }
            
            // 災害中は致死性ウイルスも生成
            if (disasterActive && Math.random() < 0.2) {
                virusType = 'lethal';
            }
            
            const newVirus = new Virus(x, y, virusType);
            grid[y][x] = newVirus;
            entities.push(newVirus);
            viruses.push(newVirus);
        }
    }

    turn++;
	
	
	
// update 関数の最後（turn++; の直前）に追加
// 細胞が非常に少なくなった場合の回復機能
if (cells.length < 100 && !disasterActive) {
    // 細胞数が臨界値以下で、かつ災害が終了している場合、ランダムな場所に新しい細胞を生成
    // 回復率は細胞が少ないほど高い
    const recoveryChance = 0.7 - cells.length * 0.05; // 0～9個の細胞で0.05～0.45の確率
    
    if (Math.random() < recoveryChance) {
        // ランダムな位置と種類で細胞を生成
        const x = Math.floor(Math.random() * GRID_SIZE_X);
        const y = Math.floor(Math.random() * GRID_SIZE_Y);
        
        if (grid[y][x] === null) {
            // 回復時に生成する細胞タイプは現在の季節に対応するものが多い
            let cellType;
            if (Math.random() < 0.6) {
                cellType = currentSeason; // 60%の確率で季節に対応する細胞
            } else {
                cellType = CELL_TYPES[Math.floor(Math.random() * CELL_TYPES.length)];
            }
            
            const newCell = new Cell(x, y, cellType);
            newCell.energy = 100; // 最大エネルギーで生成
            
            // 50%の確率で免疫を持つ
            if (Math.random() < 0.5) {
                newCell.immunity = true;
                newCell.immunityTimer = 150;
            }
            
            grid[y][x] = newCell;
            entities.push(newCell);
            cells.push(newCell);
        }
    }
}
	
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
        lastSeasonUpdateTime = performance.now() / 1000; // 季節タイマーも更新
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

// window.addEventListener('load'...) の中に以下を追加
// 正しい実装:
window.addEventListener('load', () => {
    init(); // init関数内ですでにinitDisasterControlsを呼び出している
    draw();
});