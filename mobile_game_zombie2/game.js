const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

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
    bulletSpeed: 3,  // 初期値を遅くした
    bulletCount: 1,
    spread: 0,
    effects: {
        speedBoost: 0,
        multiShot: 0,
        spreadShot: 0
    }
};

const zombies = [];
let score = 0;
let time = 0;
let bossTime = 90;
let timeSinceLastBoss = 0;
let gameInterval, bossMoveInterval, bossMode = false;
let boss = null;
let zombieSpawnInterval = null;
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
    if (currentTime - player.lastShot < 100) return;

    player.lastShot = currentTime;
    const speed = player.bulletSpeed;
    const bulletCount = player.bulletCount;
    const spread = player.spread;

    for (let i = 0; i < bulletCount; i++) {
        const angle = Math.atan2(player.direction.y, player.direction.x) + (Math.random() - 0.5) * spread * 0.1;
        const dx = Math.cos(angle) * speed;
        const dy = Math.sin(angle) * speed;

        player.bullets.push({ 
            x: player.x + player.width / 2, 
            y: player.y + player.height / 2, 
            dx: dx, 
            dy: dy 
        });
    }
}

function spawnZombies() {
    for (let i = 0; i < zombieSpawnCount; i++) {
        let zombieHealth;
        const currentTime = Math.floor(time / 60);
        const randomValue = Math.random();
        let isItemZombie = false;

        if (currentTime >= 60 && randomValue < 0.1) {
            zombieHealth = Math.floor(Math.random() * 10) + 21;
        } else if (currentTime >= 40 && randomValue < 0.2) {
            zombieHealth = Math.floor(Math.random() * 10) + 11;
        } else if (currentTime >= 20 && randomValue < 0.3) {
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

    if (!isExploding && !player.invincible) {
        zombies.forEach((zombie, index) => {
            if (zombie.x < player.x + player.width && zombie.x + zombie.width > player.x &&
                zombie.y < player.y + player.height && zombie.y + zombie.height > player.y) {
                player.life--;
                player.invincible = true;
                player.invincibleTime = 180;
                flashScreen();
                setTimeout(() => player.invincible = false, 3000);
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
                player.invincible = true;
                player.invincibleTime = 180;
                flashScreen();
                setTimeout(() => player.invincible = false, 3000);
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
            player.bulletSpeed += 0.5;
            player.effects.speedBoost++;
            announceEffect('弾の速度上昇！');
        },
        () => { 
            player.bulletCount++;
            player.effects.multiShot++;
            announceEffect('弾数増加！');
        },
        () => { 
            player.spread += 0.1;
            player.effects.spreadShot++;
            announceEffect('扇状照射！');
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

function announceEffect(text) {
    announceText = text;
    announceTime = 180;  // 3秒間表示
}

function drawEffects() {
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    let yOffset = 120;  // Timeの下から開始
    
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
    // ...既存のdrawBoss関数のコード...
}

function moveBoss() {
    // ...既存のmoveBoss関数のコード...
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
    // ...既存のexplodeBoss関数のコード...
}

function flashScreen() {
    const originalColor = canvas.style.backgroundColor;
    canvas.style.backgroundColor = 'white';
    setTimeout(() => {
        canvas.style.backgroundColor = originalColor;
    }, 100);
}

function restartGame(success) {
    isGameOver = false;
    player.x = canvas.width / 2;
    player.y = canvas.height - 100;
    player.bullets = [];
    player.invincible = false;
    player.invincibleTime = 0;
    player.direction = { x: 0, y: 0 };
    player.bulletSpeed = 3;  // 初期値に戻す
    player.bulletCount = 1;
    player.spread = 0;
    player.effects = {speedBoost: 0, multiShot: 0, spreadShot: 0};
    bossMode = false;
    boss = null;
    zombieSpawnCount = 1;
    zombies.length = 0;
    timeSinceLastBoss = 0;

    clearInterval(gameInterval);
    clearInterval(zombieSpawnInterval);
    if (bossMoveInterval) clearInterval(bossMoveInterval);

    if (success) {
        player.life = Math.min(player.life + 1, 5);
    } else {
        player.life = 5;
        score = 0;
        time = 0;
    }

    canvas.style.backgroundColor = 'black';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    gameInterval = setInterval(update, 1000 / 60);
    zombieSpawnInterval = setInterval(spawnZombies, 5000);
}

gameInterval = setInterval(update, 1000 / 60);
zombieSpawnInterval = setInterval(spawnZombies, 5000);