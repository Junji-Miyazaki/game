const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.touchAction = 'none';
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let currentStage = 1;

const player = {
    x: canvas.width / 2,
    y: canvas.height - 100,
    width: 30,
    height: 50,
    speed: 5,
    life: 5,
    bullets: [],
    direction: { x: 0, y: 0 },
    animationFrame: 0,
    invincible: false,
    invincibleTime: 0,
    lastShot: 0,
    color: 'blue',
    bulletSpeed: 8,
    bulletCount: 1,
    spread: 0,
    fireRate: 200,
    effects: {
        speedBoost: 0,
        multiShot: 0,
        spreadShot: 0,
        fireRateBoost: 0
    }
};

const zombies = [];
let score = 0;
let time = 0;
let bossTime = 90;
let timeSinceLastBoss = 0;
let gameInterval, zombieSpawnInterval, bossMoveInterval;
let bossMode = false;
let boss = null;
let isExploding = false;
let zombieSpawnCount = 1;
let zombieAnimationFrame = 0;
let isGameOver = false;
let announceText = '';
let announceTime = 0;

canvas.addEventListener('touchstart', handleTouchStart, false);
canvas.addEventListener('touchmove', handleTouchMove, false);
canvas.addEventListener('touchend', handleTouchEnd, false);

let touch = null;

function handleTouchStart(event) {
    event.preventDefault();
    touch = event.touches[0];
}

function handleTouchMove(event) {
    event.preventDefault();
    if (!touch) return;

    const newTouch = event.touches[0];
    const dx = newTouch.clientX - touch.clientX;
    const dy = newTouch.clientY - touch.clientY;

    player.x += dx;
    player.y += dy;

    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));

    player.direction = { x: dx, y: dy };

    touch = newTouch;
}

function handleTouchEnd(event) {
    event.preventDefault();
    touch = null;
    player.direction = { x: 0, y: 0 };
}

function shootBullet() {
    const currentTime = Date.now();
    if (currentTime - player.lastShot < player.fireRate) return;

    player.lastShot = currentTime;
    const speed = player.bulletSpeed;
    const spreadLevel = player.effects.spreadShot;

    const baseAngle = Math.atan2(player.direction.y, player.direction.x);
    const angles = [0]; // 常に正面方向の弾を発射

    // 扇状効果レベルに応じて角度を追加
    for (let i = 1; i <= spreadLevel; i++) {
        angles.push(i * 10 * Math.PI / 180);  // 右側
        angles.push(-i * 10 * Math.PI / 180); // 左側
    }

    angles.forEach(angle => {
        const totalAngle = baseAngle + angle;
        const dx = Math.cos(totalAngle) * speed;
        const dy = Math.sin(totalAngle) * speed;

        player.bullets.push({ 
            x: player.x + player.width / 2, 
            y: player.y + player.height / 2, 
            dx: dx, 
            dy: dy 
        });
    });
}

function spawnZombies() {
    for (let i = 0; i < zombieSpawnCount; i++) {
        let zombieHealth;
        const currentTime = Math.floor(time / 60);
        const randomValue = Math.random();
        let isItemZombie = false;

        const toughZombieChance = Math.min(0.2 * (currentStage - 1), 0.8);

        if (randomValue < toughZombieChance) {
            zombieHealth = Math.floor(Math.random() * 11) + 20;
        } else if (currentTime >= 60 && randomValue < 0.1 + toughZombieChance) {
            zombieHealth = Math.floor(Math.random() * 10) + 21;
        } else if (currentTime >= 40 && randomValue < 0.2 + toughZombieChance) {
            zombieHealth = Math.floor(Math.random() * 10) + 11;
        } else if (currentTime >= 20 && randomValue < 0.3 + toughZombieChance) {
            zombieHealth = Math.floor(Math.random() * 6) + 5;
        } else {
            zombieHealth = Math.floor(Math.random() * 5) + 1;
        }

        if (Math.random() < 0.1) {
            isItemZombie = true;
        }

        zombies.push({ 
            x: Math.random() * canvas.width, 
            y: -60, 
            width: 30,
            height: 50, 
            health: zombieHealth,
            isItemZombie: isItemZombie,
            animationFrame: 0 
        });
    }
    zombieSpawnCount = Math.min(zombieSpawnCount + 1, 10);
}

function update() {
    if (isGameOver) return;
    if (isExploding) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPlayer();
    if (player.direction.x !== 0 || player.direction.y !== 0) {
        shootBullet();
    }
    drawBullets();
   if (bossMode && boss) {
        if (boss.y < canvas.height / 4) {
            boss.y += 2;
        } else {
            moveBoss();
        }
        drawBoss();
    } else if (!bossMode && timeSinceLastBoss >= bossTime * 60) {
        console.log("Starting boss mode");
        startBossMode();
    }
    drawZombies();
    checkCollisions();
    drawScore();
    drawLife();
    drawTime();
    drawEffects();
    drawAnnouncement();
    time++;
    timeSinceLastBoss++;
    zombieAnimationFrame = (zombieAnimationFrame + 1) % 60;
    if (announceTime > 0) announceTime--;
}

function startBossMode() {
    bossMode = true;
    boss = { 
        x: canvas.width / 2, 
        y: -250, 
        width: 120,
        height: 200,
        health: 200, 
        speed: 3,
        dx: 3,
        dy: 3,
        animationFrame: 0
    };
    clearInterval(zombieSpawnInterval);
}

function drawPlayer() {
    ctx.fillStyle = player.invincible ? player.color : 'blue';
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, player.y - 10, 10, 0, Math.PI * 2);
    ctx.fill();
    const legOffset = Math.sin(player.animationFrame * 0.2) * 5;
    ctx.fillRect(player.x, player.y + player.height, 10, 10 + legOffset);
    ctx.fillRect(player.x + player.width - 10, player.y + player.height, 10, 10 - legOffset);
}

function drawBullets() {
    ctx.fillStyle = 'yellow';
    player.bullets = player.bullets.filter(bullet => 
        bullet.x > 0 && bullet.x < canvas.width && bullet.y > 0 && bullet.y < canvas.height
    );
    player.bullets.forEach(bullet => {
        bullet.x += bullet.dx;
        bullet.y += bullet.dy;
        ctx.fillRect(bullet.x - 2.5, bullet.y - 2.5, 5, 5);
    });
}

function drawZombies() {
    zombies.forEach(zombie => {
        if (zombie.isItemZombie) {
            ctx.fillStyle = 'orange';
        } else if (zombie.health <= 5) {
            ctx.fillStyle = 'lightgreen';
        } else if (zombie.health <= 10) {
            ctx.fillStyle = 'green';
        } else if (zombie.health <= 20) {
            ctx.fillStyle = 'darkgreen';
        } else {
            ctx.fillStyle = 'navy';
        }
        ctx.fillRect(zombie.x, zombie.y, zombie.width, zombie.height);
        ctx.beginPath();
        ctx.arc(zombie.x + zombie.width / 2, zombie.y - 10, 15, 0, Math.PI * 2);
        ctx.fill();
        const armOffset = Math.sin(zombie.animationFrame * 0.1) * 10;
        ctx.fillRect(zombie.x - 10, zombie.y + 10, 10, 40 + armOffset);
        ctx.fillRect(zombie.x + zombie.width, zombie.y + 10, 10, 40 - armOffset);
        const legOffset = Math.sin(zombie.animationFrame * 0.2) * 5;
        ctx.fillRect(zombie.x, zombie.y + zombie.height, 15, 10 + legOffset);
        ctx.fillRect(zombie.x + zombie.width - 15, zombie.y + zombie.height, 15, 10 - legOffset);
        
        ctx.fillStyle = 'white';
        ctx.fillText(zombie.health, zombie.x + zombie.width / 4, zombie.y + zombie.height / 2);
        zombie.y += 0.25;
        zombie.animationFrame = (zombie.animationFrame + 1) % 60;
    });
}

function checkCollisions() {
    player.bullets.forEach((bullet, bulletIndex) => {
        zombies.forEach((zombie, zombieIndex) => {
            if (bullet.x > zombie.x && bullet.x < zombie.x + zombie.width &&
                bullet.y > zombie.y && bullet.y < zombie.y + zombie.height) {
                zombie.health--;
                if (zombie.health <= 0) {
                    score += 10;
                    if (zombie.isItemZombie) {
                        applyItemEffect();
                    }
                    zombies.splice(zombieIndex, 1);
                }
                player.bullets.splice(bulletIndex, 1);
                return;
            }
        });
        if (bossMode && boss && !isExploding) {
            if (bullet.x > boss.x && bullet.x < boss.x + boss.width &&
                bullet.y > boss.y && bullet.y < boss.y + boss.height) {
                boss.health--;
                if (boss.health <= 0) {
                    score += 200;
                    explodeBoss();
                }
                player.bullets.splice(bulletIndex, 1);
            }
        }
    });

    if (!player.invincible) {
        zombies.forEach((zombie, index) => {
            if (zombie.x < player.x + player.width && zombie.x + zombie.width > player.x &&
                zombie.y < player.y + player.height && zombie.y + zombie.height > player.y) {
                player.life--;
                decreaseRandomEffect();
                player.invincible = true;
                player.invincibleTime = 180;
                flashScreen();
                setTimeout(() => {
                    player.invincible = false;
                    player.color = 'blue';
                }, 3000);
                if (player.life <= 0) {
                    gameOver();
                }
                zombies.splice(index, 1);
            }
        });
        
        if (bossMode && boss) {
            if (boss.x < player.x + player.width && boss.x + boss.width > player.x &&
                boss.y < player.y + player.height && boss.y + boss.height > player.y) {
                player.life--;
                decreaseRandomEffect();
                player.invincible = true;
                player.invincibleTime = 180;
                flashScreen();
                setTimeout(() => {
                    player.invincible = false;
                    player.color = 'blue';
                }, 3000);
                if (player.life <= 0) {
                    gameOver();
                }
            }
        }
    }
}

function applyItemEffect() {
    const effects = [
        () => { 
            player.life = Math.min(player.life + 1, 5);
            announceEffect('Life増加！');
        },
        () => { 
            player.bulletSpeed += 2;
            player.effects.speedBoost++;
            announceEffect('弾の速度上昇！');
        },
        () => { 
            player.bulletCount++;
            player.effects.multiShot++;
            player.fireRate = Math.max(player.fireRate * 0.9, 50);
            announceEffect('弾数増加！');
        },
        () => { 
            player.effects.spreadShot++;
            announceEffect('扇状照射！');
        },
        () => { 
            player.fireRate = Math.max(player.fireRate * 0.8, 100);
            player.effects.fireRateBoost++;
            announceEffect('連射速度上昇！');
        },
        () => { 
            player.invincible = true;
            player.color = 'rgba(0, 0, 255, 0.5)';
            player.invincibleTime = 300; 
            setTimeout(() => {
                player.invincible = false;
                player.color = 'blue';
            }, 5000);
            announceEffect('無敵！');
        }
    ];

    const randomEffect = effects[Math.floor(Math.random() * effects.length)];
    randomEffect();
}

function decreaseRandomEffect() {
    const effects = ['speedBoost', 'multiShot', 'spreadShot', 'fireRateBoost'];
    const randomEffect = effects[Math.floor(Math.random() * effects.length)];
    if (player.effects[randomEffect] > 0) {
        player.effects[randomEffect]--;
        announceEffect(`${randomEffect}効果が減少！`);
    }
}

function announceEffect(text) {
    announceText = text;
    announceTime = 180;
}

function drawEffects() {
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    let yOffset = 120;
    
    if (player.effects.speedBoost > 0) {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(20, yOffset, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText(`弾速 +${player.effects.speedBoost}`, 30, yOffset + 5);
        yOffset += 20;
    }
    
    if (player.effects.multiShot > 0) {
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(20, yOffset, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText(`弾数 +${player.effects.multiShot}`, 30, yOffset + 5);
        yOffset += 20;
    }
    
    if (player.effects.spreadShot > 0) {
        ctx.fillStyle = 'green';
        ctx.beginPath();
        ctx.arc(20, yOffset, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText(`扇状 +${player.effects.spreadShot}`, 30, yOffset + 5);
        yOffset += 20;
    }

    if (player.effects.fireRateBoost > 0) {
        ctx.fillStyle = 'cyan';
        ctx.beginPath();
        ctx.arc(20, yOffset, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText(`連射 +${player.effects.fireRateBoost}`, 30, yOffset + 5);
    }
}

function drawAnnouncement() {
    if (announceTime > 0) {
        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(announceText, canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
    }
}

function drawBoss() {
    if (!boss) return;

    ctx.fillStyle = 'darkred';
    ctx.fillRect(boss.x, boss.y, boss.width, boss.height);
    
    // ボスの頭
    ctx.beginPath();
    ctx.arc(boss.x + boss.width / 2, boss.y - 30, 40, 0, Math.PI * 2);
    ctx.fill();
    
    // ボスの目
    ctx.fillStyle = 'yellow';
    ctx.beginPath();
    ctx.arc(boss.x + boss.width / 2 - 20, boss.y - 40, 10, 0, Math.PI * 2);
    ctx.arc(boss.x + boss.width / 2 + 20, boss.y - 40, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // ボスの腕
    const armOffset = Math.sin(boss.animationFrame * 0.1) * 20;
    ctx.fillStyle = 'darkred';
    ctx.fillRect(boss.x - 30, boss.y + 60 + armOffset, 30, 120);
    ctx.fillRect(boss.x + boss.width, boss.y + 60 - armOffset, 30, 120);
    
    // ボスの足
    const legOffset = Math.sin(boss.animationFrame * 0.2) * 10;
    ctx.fillRect(boss.x + 30, boss.y + boss.height, 40, 30 + legOffset);
    ctx.fillRect(boss.x + boss.width - 70, boss.y + boss.height, 40, 30 - legOffset);
    
    // ボスのHP
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.fillText(boss.health, boss.x + boss.width / 2 - 20, boss.y + boss.height / 2);
    
    boss.animationFrame = (boss.animationFrame + 1) % 60;
}

function moveBoss() {
    boss.x += boss.dx;
    boss.y += boss.dy;

    // 画面端での跳ね返り
    if (boss.x <= 0 || boss.x + boss.width >= canvas.width) {
        boss.dx = -boss.dx;
    }
    if (boss.y <= canvas.height / 8 || boss.y + boss.height >= canvas.height) {
        boss.dy = -boss.dy;
    }

    // ランダムな動きの追加
    if (Math.random() < 0.05) {
        boss.dx = (Math.random() - 0.5) * boss.speed * 2;
        boss.dy = (Math.random() - 0.5) * boss.speed * 2;
    }
}

function drawScore() {
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText(`Score: ${score}`, 10, 30);
}

function drawLife() {
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText(`Life: ${player.life}`, 10, 60);
}

function drawTime() {
    const displayTime = Math.floor(time / 60);
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText(`Time: ${displayTime}`, 10, 90);
}

function gameOver() {
    isGameOver = true;
    setTimeout(() => {
        alert(`Game Over! Score: ${score}`);
        clearInterval(gameInterval);
        clearInterval(zombieSpawnInterval);
        if (bossMoveInterval) clearInterval(bossMoveInterval);
        restartGame(false);
    }, 100);
}

function explodeBoss() {
    // ボス爆発のコード（省略）
}

function flashScreen() {
    const originalColor = canvas.style.backgroundColor;
    canvas.style.backgroundColor = 'white';
    setTimeout(() => {
        canvas.style.backgroundColor = originalColor;
    }, 100);
}

function restartGame(success) {
    // ゲーム再スタートのコード（省略）
}

function startNextStage(isRestart = false) {
    if (!isRestart) {
        currentStage++;
    }
    
    bossMode = false;
    boss = null;
    zombies.length = 0;
    timeSinceLastBoss = 0;
    
    clearInterval(gameInterval);
    clearInterval(zombieSpawnInterval);
    
    function displayStageText() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPlayer();
        drawScore();
        drawLife();
        drawTime();
        drawEffects();
        
        ctx.fillStyle = 'white';
        ctx.font = '36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Stage ${currentStage} Start!`, canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
    }
    
    displayStageText();
    
    setTimeout(() => {
        gameInterval = setInterval(update, 1000 / 60);
        zombieSpawnInterval = setInterval(spawnZombies, 5000);
    }, 3000);
}

function showGameInstructions() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    
    const instructions = [
        "ゾンビシューティングゲーム",
        "",
        "通常ゾンビ: 様々な体力を持つ敵",
        "アイテムゾンビ: 倒すと特殊能力を獲得",
        "ボスゾンビ: 定期的に出現する強敵",
        "",
        "画面をタッチして移動・攻撃",
        "ゾンビを倒してスコアを稼ごう！"
    ];
    
    instructions.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, 50 + index * 30);
    });
    
    // スタートボタンの描画
    ctx.fillStyle = 'green';
    ctx.fillRect(canvas.width / 2 - 100, canvas.height - 100, 200, 50);
    ctx.fillStyle = 'white';
    ctx.fillText("Game Start", canvas.width / 2, canvas.height - 70);
    
ctx.textAlign = 'left';
}

function startGame() {
    showGameInstructions();
    
    function handleStart(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        let x, y;

        if (e.type.startsWith('touch')) {
            if (e.touches.length > 0) {
                x = e.touches[0].clientX - rect.left;
                y = e.touches[0].clientY - rect.top;
            } else {
                return; // タッチが検出されない場合は何もしない
            }
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }
        
        if (x > canvas.width / 2 - 100 && x < canvas.width / 2 + 100 &&
            y > canvas.height - 100 && y < canvas.height - 50) {
            canvas.removeEventListener('click', handleStart);
            canvas.removeEventListener('touchstart', handleStart);
            canvas.removeEventListener('touchend', handleStart);
            gameInterval = setInterval(update, 1000 / 60);
            zombieSpawnInterval = setInterval(spawnZombies, 5000);
        }
    }
    
    canvas.addEventListener('click', handleStart);
    canvas.addEventListener('touchstart', handleStart);
    canvas.addEventListener('touchend', handleStart);
}

// ゲームの初期化
function initGame() {
    resizeCanvas();
    showGameInstructions();
    startGame();
}

// ゲームの初期化を呼び出す
window.onload = initGame;