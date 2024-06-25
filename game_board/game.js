const COLORS = ['red', 'blue', 'green', 'yellow'];
const TILE_TYPES = ['住宅地', '商業地', '工業地', '公園', '病院'];
const RESOURCE_TYPES = ['資金', '市民', '労働力', '健康', '環境'];

class Tile {
    constructor(type, number) {
        this.type = type;
        this.number = number;
        this.isBlinking = false;
        this.blinkCount = 0;
    }
}

class Player {
    constructor(name, color) {
        this.name = name;
        this.color = color;
        this.resources = Object.fromEntries(RESOURCE_TYPES.map(type => [type, 5]));
        this.facilities = {住宅: 0, オフィス: 0, 工場: 0, 公園: 0, 病院: 0};
        this.victoryPoints = 0;
        this.tradeCount = 0;
    }
}

class HealthyCityDevelopment {
    constructor(playerNames) {
        this.players = playerNames.map((name, index) => new Player(name, COLORS[index]));
        this.currentPlayerIndex = 0;
        this.phase = 'リソース生産';
        this.diceValue = 0;
        this.cityHealthTracker = 50;
        this.currentRound = 1;
        this.diceRolled = false;
        this.buildCount = 0;
        this.maxBuildsPerTurn = 2;
        this.board = this.generateBoard();
        this.eventCards = this.generateEventCards();
    }

    generateBoard() {
        const board = [];
        const layout = [3, 4, 5, 4, 3];
        const numbers = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
        const shuffledTypes = this.shuffle([...TILE_TYPES, ...TILE_TYPES, ...TILE_TYPES, ...TILE_TYPES].slice(0, 19));
        const shuffledNumbers = this.shuffle(numbers);
        
        let numberIndex = 0;
        layout.forEach((rowCount, rowIndex) => {
            const row = [];
            for (let i = 0; i < rowCount; i++) {
                if (rowIndex === 2 && i === 2) {
                    row.push(null);  // 中央の空きスペース
                } else {
                    row.push(new Tile(shuffledTypes.pop(), shuffledNumbers[numberIndex++]));
                }
            }
            board.push(row);
        });
        return board;
    }

    generateEventCards() {
        return [
            { name: "市民フェスティバル", effect: "全プレイヤーの市民+2" },
            { name: "経済ブーム", effect: "全プレイヤーの資金+3" },
            { name: "環境キャンペーン", effect: "全プレイヤーの環境+2" },
            { name: "健康増進プログラム", effect: "全プレイヤーの健康+2" },
            { name: "労働改革", effect: "全プレイヤーの労働力+2" },
            { name: "経済不況", effect: "全プレイヤーの資金-3" },
            { name: "人口流出", effect: "全プレイヤーの市民-2" },
            { name: "労働争議", effect: "全プレイヤーの労働力-2" },
            { name: "環境汚染", effect: "全プレイヤーの環境-3, 健康-1" },
            { name: "感染症流行", effect: "全プレイヤーの健康-3, 市民-1" },
            { name: "都市インフラの老朽化", effect: "全プレイヤーの資金-2, 環境-1" }
        ];
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    async rollDice() {
        if (this.diceRolled) {
            alert('このターンではすでにサイコロを振っています。');
            return;
        }
        this.diceValue = await rollDice();
        this.distributeResources();
        this.diceRolled = true;
    }

    distributeResources() {
        this.board.flat().forEach(tile => {
            if (tile && tile.number === this.diceValue) {
                tile.isBlinking = true;
                tile.blinkCount = 0;
                this.players.forEach(player => {
                    player.resources[this.getResourceForTileType(tile.type)] += 1;
                });
            }
        });
    }

    getResourceForTileType(type) {
        const resourceMap = {
            '住宅地': '市民',
            '商業地': '資金',
            '工業地': '労働力',
            '公園': '環境',
            '病院': '健康'
        };
        return resourceMap[type];
    }

    trade(player1, player2, offer, request) {
        if (this.phase !== '取引') {
            alert('取引フェーズでのみ取引が可能です。');
            return false;
        }
        
        if (player1.tradeCount >= 2) {
            alert('このターンの取引回数上限に達しました。');
            return false;
        }

        if (this.canTrade(player1, offer) && this.canTrade(player2, request)) {
            this.executeTradeTransaction(player1, player2, offer, request);
            player1.tradeCount++;
            return true;
        }
        return false;
    }

    canTrade(player, resources) {
        return Object.entries(resources).every(([resource, amount]) => player.resources[resource] >= amount);
    }

    executeTradeTransaction(player1, player2, offer, request) {
        Object.entries(offer).forEach(([resource, amount]) => {
            player1.resources[resource] -= amount;
            player2.resources[resource] += amount;
        });
        Object.entries(request).forEach(([resource, amount]) => {
            player2.resources[resource] -= amount;
            player1.resources[resource] += amount;
        });
    }

    buildFacility(player, facilityType) {
        if (this.phase !== '建設') {
            alert('建設フェーズでのみ建設が可能です。');
            return false;
        }
        if (this.buildCount >= this.maxBuildsPerTurn) {
            alert(`このターンの建設回数上限（${this.maxBuildsPerTurn}回）に達しました。`);
            return false;
        }

        const costs = {
            住宅: {資金: 2, 労働力: 1},
            オフィス: {資金: 3, 労働力: 2},
            工場: {資金: 4, 労働力: 3},
            公園: {資金: 2, 環境: 1},
            病院: {資金: 5, 健康: 2}
        };

        const cost = costs[facilityType];
        if (this.canBuild(player, cost)) {
            Object.entries(cost).forEach(([resource, amount]) => {
                player.resources[resource] -= amount;
            });
            player.facilities[facilityType]++;
            player.victoryPoints += (facilityType === '病院' || facilityType === '工場' ? 2 : 1);
            this.updateCityHealth(facilityType === '病院' || facilityType === '公園' ? 2 : 1);
            this.buildCount++;
            return true;
        }
        return false;
    }

    canBuild(player, cost) {
        return Object.entries(cost).every(([resource, amount]) => player.resources[resource] >= amount);
    }

    updateCityHealth(change) {
        this.cityHealthTracker = Math.max(0, Math.min(100, this.cityHealthTracker + change));
        if (this.cityHealthTracker <= 20) {
            alert("警告: 都市の健康度が危険な水準まで低下しています！");
        }
    }

    nextPhase() {
        const phases = ['リソース生産', '取引', '建設'];
        const currentIndex = phases.indexOf(this.phase);
        this.phase = phases[(currentIndex + 1) % phases.length];
        if (this.phase === 'リソース生産') {
            this.nextPlayer();
        }
        this.diceRolled = false;
        this.buildCount = 0;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        if (this.currentPlayerIndex === 0) {
            this.currentRound++;
        }
        this.players[this.currentPlayerIndex].tradeCount = 0;
    }

    drawEventCard() {
        if (this.eventCards.length > 0) {
            return this.eventCards[Math.floor(Math.random() * this.eventCards.length)];
        }
        return null;
    }

    applyEventCard(card) {
        this.players.forEach(player => {
            const effects = card.effect.split(', ');
            effects.forEach(effect => {
                const [, resource, change] = effect.match(/全プレイヤーの(\w+)([+-]\d+)/);
                player.resources[resource] = Math.max(0, player.resources[resource] + parseInt(change));
            });
        });
        this.updateCityHealth(card.effect.includes('健康-') ? -2 : 0);
    }

    checkVictory() {
        return this.players.find(player => player.victoryPoints >= 10);
    }
}

function rollDice() {
    return new Promise(resolve => {
        const diceContainer = document.createElement('div');
        diceContainer.style.position = 'fixed';
        diceContainer.style.left = '50%';
        diceContainer.style.top = '50%';
        diceContainer.style.transform = 'translate(-50%, -50%)';
        diceContainer.style.fontSize = '48px';
        document.body.appendChild(diceContainer);

        let count = 0;
        const interval = setInterval(() => {
            const dice1 = Math.floor(Math.random() * 6) + 1;
            const dice2 = Math.floor(Math.random() * 6) + 1;
            diceContainer.textContent = `${dice1} ${dice2}`;
            count++;
            if (count >= 20) {
                clearInterval(interval);
                const result = dice1 + dice2;
                setTimeout(() => {
                    document.body.removeChild(diceContainer);
                    resolve(result);
                }, 1000);
            }
        }, 100);
    });
}

function updateUI() {
    const game = window.game;
    const currentPlayer = game.players[game.currentPlayerIndex];

    document.getElementById('currentPlayer').innerHTML = `現在のプレイヤー: <span style="color: ${currentPlayer.color}">${currentPlayer.name}</span>`;
    document.getElementById('cityHealth').textContent = `都市の健康度: ${game.cityHealthTracker}`;
    document.getElementById('currentRound').textContent = `ラウンド: ${game.currentRound}`;

    const phases = ['リソース生産', '取引', '建設'];
    document.getElementById('phases').innerHTML = phases.map(phase => 
        `<div class="phase ${phase === game.phase ? 'active' : ''}">${phase}</div>`
    ).join('');

    const resourcesHTML = Object.entries(currentPlayer.resources).map(([resource, amount]) => 
        `<div>${resource}: ${amount}</div>`
    ).join('');
    const facilitiesHTML = Object.entries(currentPlayer.facilities).map(([facility, count]) => 
        `<div>${facility}: ${count}</div>`
    ).join('');
    document.getElementById('playerResources').innerHTML = `
        <h3 style="color: ${currentPlayer.color}">${currentPlayer.name}のリソースと施設</h3>
        <div>勝利ポイント: ${currentPlayer.victoryPoints}</div>
        <h4>リソース:</h4>
        ${resourcesHTML}
        <h4>施設:</h4>
        ${facilitiesHTML}
    `;

    document.getElementById('rollDice').disabled = game.phase !== 'リソース生産' || game.diceRolled;
    document.getElementById('openTradeModal').disabled = game.phase !== '取引' || currentPlayer.tradeCount >= 2;
    document.getElementById('buildFacility').disabled = game.phase !== '建設' || game.buildCount >= game.maxBuildsPerTurn;
    document.getElementById('endPhase').disabled = 
        (game.phase === 'リソース生産' && !game.diceRolled) ||
        (game.phase === '建設' && game.buildCount === 0);

    drawGameBoard(game);
}

function drawGameBoard(game) {
    const canvas = document.getElementById('gameBoard');
    const ctx = canvas.getContext('2d');
    const containerWidth = canvas.parentElement.clientWidth;
    const containerHeight = canvas.parentElement.clientHeight;
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const hexRadius = Math.min(containerWidth / 11, containerHeight / 11);
    const hexHeight = hexRadius * 2;
    const hexWidth = Math.sqrt(3) / 2 * hexHeight;

    const startX = containerWidth / 2 - hexWidth * 2;
    const startY = containerHeight / 2 - hexHeight * 2;

    game.board.forEach((row, rowIndex) => {
        row.forEach((tile, colIndex) => {
            if (tile) {
                const x = startX + (colIndex + (rowIndex % 2) * 0.5) * hexWidth;
                const y = startY + rowIndex * hexHeight * 0.75;

                drawHexagon(ctx, x, y, hexRadius, tile);
            }
        });
    });
}

function drawHexagon(ctx, x, y, radius, tile) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = 2 * Math.PI / 6 * i;
        ctx.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
    }
    ctx.closePath();

  if (tile.isBlinking && tile.blinkCount < 4) {
        ctx.fillStyle = tile.blinkCount % 2 === 0 ? 'yellow' : getTileColor(tile.type);
        tile.blinkCount++;
        if (tile.blinkCount >= 4) {
            tile.isBlinking = false;
        }
    } else {
        ctx.fillStyle = getTileColor(tile.type);
    }
    ctx.fill();

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'black';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(tile.type, x, y - 10);
    ctx.fillText(tile.number.toString(), x, y + 10);
}

function getTileColor(tileType) {
    const colorMap = {
        '住宅地': '#FFA07A',
        '商業地': '#98FB98',
        '工業地': '#B0C4DE',
        '公園': '#90EE90',
        '病院': '#FFB6C1'
    };
    return colorMap[tileType] || '#FFFFFF';
}

// イベントリスナーの設定
document.getElementById('startGame').addEventListener('click', () => {
    const playerCount = parseInt(document.getElementById('playerCount').value);
    const playerNames = [];
    for (let i = 1; i <= playerCount; i++) {
        const name = document.getElementById(`player${i}Name`).value || `プレイヤー${i}`;
        playerNames.push(name);
    }
    window.game = new HealthyCityDevelopment(playerNames);
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'flex';
    updateUI();
});

document.getElementById('rollDice').addEventListener('click', async () => {
    if (window.game.phase === 'リソース生産' && !window.game.diceRolled) {
        await window.game.rollDice();
        updateUI();
    } else {
        alert('リソース生産フェーズでのみサイコロを振れます。');
    }
});

document.getElementById('openTradeModal').addEventListener('click', () => {
    if (window.game.phase === '取引') {
        showTradeModal();
    } else {
        alert('取引フェーズでのみ取引が可能です。');
    }
});

document.getElementById('buildFacility').addEventListener('click', () => {
    if (window.game.phase === '建設') {
        showBuildModal();
    } else {
        alert('建設フェーズでのみ建設できます。');
    }
});

document.getElementById('endPhase').addEventListener('click', () => {
    window.game.nextPhase();
    if (window.game.phase === 'リソース生産') {
        const card = window.game.drawEventCard();
        if (card) {
            showEventCard(card);
        }
    }
    updateUI();
});

function showTradeModal() {
    const modal = document.getElementById('tradeModal');
    const content = document.getElementById('tradeContent');
    const currentPlayer = window.game.players[window.game.currentPlayerIndex];
    
    let html = `<h3>${currentPlayer.name}の取引 (残り${2 - currentPlayer.tradeCount}回)</h3>`;
    html += '<h4>提供するリソース:</h4>';
    RESOURCE_TYPES.forEach(resource => {
        html += `<label>${resource}: <input type="number" id="offer_${resource}" min="0" max="${currentPlayer.resources[resource]}" value="0"></label><br>`;
    });
    
    html += '<h4>要求するリソース:</h4>';
    RESOURCE_TYPES.forEach(resource => {
        html += `<label>${resource}: <input type="number" id="request_${resource}" min="0" value="0"></label><br>`;
    });
    
    html += '<label>取引相手: <select id="tradePartner">';
    window.game.players.forEach((player, index) => {
        if (index !== window.game.currentPlayerIndex) {
            html += `<option value="${index}">${player.name}</option>`;
        }
    });
    html += '</select></label>';
    
    content.innerHTML = html;
    modal.style.display = 'block';
}

document.getElementById('confirmTrade').addEventListener('click', () => {
    const currentPlayer = window.game.players[window.game.currentPlayerIndex];
    const partnerIndex = document.getElementById('tradePartner').value;
    const partner = window.game.players[partnerIndex];
    
    const offer = {};
    const request = {};
    RESOURCE_TYPES.forEach(resource => {
        const offerAmount = parseInt(document.getElementById(`offer_${resource}`).value) || 0;
        const requestAmount = parseInt(document.getElementById(`request_${resource}`).value) || 0;
        if (offerAmount > 0) offer[resource] = offerAmount;
        if (requestAmount > 0) request[resource] = requestAmount;
    });
    
    if (window.game.trade(currentPlayer, partner, offer, request)) {
        alert('取引が成功しました！');
        document.getElementById('tradeModal').style.display = 'none';
        updateUI();
    } else {
        alert('取引に失敗しました。リソースが足りないか、取引条件が不適切です。');
    }
});

document.getElementById('cancelTrade').addEventListener('click', () => {
    document.getElementById('tradeModal').style.display = 'none';
});

function showBuildModal() {
    const modal = document.getElementById('buildModal');
    const content = document.getElementById('buildContent');
    const currentPlayer = window.game.players[window.game.currentPlayerIndex];
    
    let html = `<h3>${currentPlayer.name}の建設 (残り${window.game.maxBuildsPerTurn - window.game.buildCount}回)</h3>`;
    html += '<select id="facilityType">';
    Object.keys(currentPlayer.facilities).forEach(facility => {
        html += `<option value="${facility}">${facility}</option>`;
    });
    html += '</select>';
    
    content.innerHTML = html;
    modal.style.display = 'block';
}

document.getElementById('confirmBuild').addEventListener('click', () => {
    const currentPlayer = window.game.players[window.game.currentPlayerIndex];
    const facilityType = document.getElementById('facilityType').value;
    
    if (window.game.buildFacility(currentPlayer, facilityType)) {
        alert(`${facilityType}を建設しました！`);
        document.getElementById('buildModal').style.display = 'none';
        updateUI();
    } else {
        alert(`${facilityType}を建設するためのリソースが足りません。`);
    }
});

document.getElementById('cancelBuild').addEventListener('click', () => {
    document.getElementById('buildModal').style.display = 'none';
});

function showEventCard(card) {
    const modal = document.getElementById('cardModal');
    const content = document.getElementById('cardContent');
    
    content.innerHTML = `
        <h3>${card.name}</h3>
        <p>${card.effect}</p>
    `;
    
    modal.style.display = 'block';
    window.game.applyEventCard(card);
}

document.getElementById('closeCard').addEventListener('click', () => {
    document.getElementById('cardModal').style.display = 'none';
    updateUI();
});

// プレイヤー数の変更に応じて名前入力欄を動的に生成
document.getElementById('playerCount').addEventListener('change', (e) => {
    const count = parseInt(e.target.value);
    const container = document.getElementById('playerNames');
    container.innerHTML = '';
    for (let i = 1; i <= count; i++) {
        container.innerHTML += `<label>プレイヤー${i}の名前: <input type="text" id="player${i}Name"></label><br>`;
    }
});

// ゲームの初期化と開始
window.onload = () => {
    document.getElementById('startScreen').style.display = 'block';
    document.getElementById('playerCount').dispatchEvent(new Event('change'));
};

// ウィンドウリサイズ時にゲームボードを再描画
window.addEventListener('resize', () => {
    if (window.game) {
        drawGameBoard(window.game);
    }
});