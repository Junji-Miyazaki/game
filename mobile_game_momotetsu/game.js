document.addEventListener('DOMContentLoaded', () => {
    const instructions = [
        "ようこそ！このゲームは、健康的な行動を取ることで健康度を上げ、最も健康的なプレイヤーを目指すボードゲームです。",
        "プレイヤーはサイコロを振ってボード上を移動し、様々な健康アクティビティを行います。",
        "目的地に到達するとボーナスが得られ、次の目的地が設定されます。",
        "ゲームを始める前に、プレイヤーの人数と名前を入力してください。"
    ];
    let instructionIndex = 0;

    const instructionsContainer = document.getElementById('instructions-container');
    const instructionText = document.getElementById('instructions');
    const nextInstructionButton = document.getElementById('next-instruction');
    const playerSetup = document.getElementById('player-setup');
    const playerCountInput = document.getElementById('player-count');
    const playerNamesContainer = document.getElementById('player-names');
    const startGameButton = document.getElementById('start-game');
    const gameContainer = document.getElementById('game-container');
    const gameBoard = document.getElementById('game-board');
    const healthScoreElement = document.getElementById('health-score');
    const rollDiceButton = document.getElementById('roll-dice');

    let playerPosition = 0;
    let healthScore = 100;
    let players = [];

    nextInstructionButton.addEventListener('click', () => {
        instructionIndex++;
        if (instructionIndex < instructions.length) {
            instructionText.textContent = instructions[instructionIndex];
        } else {
            instructionsContainer.style.display = 'none';
            playerSetup.style.display = 'flex';
        }
    });

    playerCountInput.addEventListener('input', () => {
        const playerCount = parseInt(playerCountInput.value, 10);
        playerNamesContainer.innerHTML = '';
        for (let i = 0; i < playerCount; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `プレイヤー${i + 1}の名前`;
            input.className = 'player-name';
            playerNamesContainer.appendChild(input);
        }
    });

    startGameButton.addEventListener('click', () => {
        const playerCount = parseInt(playerCountInput.value, 10);
        const playerNames = Array.from(document.getElementsByClassName('player-name')).map(input => input.value);

        if (playerNames.length === playerCount && playerNames.every(name => name.trim() !== '')) {
            players = playerNames;
            playerSetup.style.display = 'none';
            gameContainer.style.display = 'flex';
            initializeGame();
        } else {
            alert('すべてのプレイヤーの名前を入力してください。');
        }
    });

    const initializeGame = () => {
        for (let i = 0; i < 25; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.id = `cell-${i}`;
            gameBoard.appendChild(cell);
        }
        placePlayer(playerPosition);
    };

    const placePlayer = (position) => {
        const currentPlayerCell = document.querySelector('.player');
        if (currentPlayerCell) {
            currentPlayerCell.remove();
        }
        const newPlayerCell = document.getElementById(`cell-${position}`);
        const player = document.createElement('div');
        player.classList.add('player');
        newPlayerCell.appendChild(player);
    };

    rollDiceButton.addEventListener('click', () => {
        const diceRoll = Math.floor(Math.random() * 6) + 1;
        playerPosition = (playerPosition + diceRoll) % 25;
        placePlayer(playerPosition);
        updateHealthScore();
    });

    const updateHealthScore = () => {
        const healthChanges = {
            0: +10,
            5: -15,
 
