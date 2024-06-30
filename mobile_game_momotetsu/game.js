document.addEventListener('DOMContentLoaded', () => {
    const boardSize = 5;
    const gameBoard = document.getElementById('game-board');
    const healthScoreElement = document.getElementById('health-score');
    const rollDiceButton = document.getElementById('roll-dice');

    let playerPosition = 0;
    let healthScore = 100;

    // Create the game board
    for (let i = 0; i < boardSize * boardSize; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.id = `cell-${i}`;
        gameBoard.appendChild(cell);
    }

    // Place the player on the board
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

    // Initialize player position
    placePlayer(playerPosition);

    // Roll the dice and move the player
    rollDiceButton.addEventListener('click', () => {
        const diceRoll = Math.floor(Math.random() * 6) + 1;
        playerPosition = (playerPosition + diceRoll) % (boardSize * boardSize);
        placePlayer(playerPosition);
        updateHealthScore();
    });

    // Update health score based on the current position
    const updateHealthScore = () => {
        // Example of health score changes
        const healthChanges = {
            0: +10,  // Start
            5: -15,  // Fatigue
            10: +20, // Yoga
            15: -20, // Sickness
            20: +15, // Sleep
        };
        if (healthChanges[playerPosition] !== undefined) {
            healthScore += healthChanges[playerPosition];
            healthScoreElement.textContent = healthScore;
        }
    };
});
