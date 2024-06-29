const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// スマートフォン向けに画面サイズを設定
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
    bulletSpeed: 7,
    bulletCount: 1,
    spread: 0,
    bulletColor: 'yellow',
    color: 'blue'
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

// タッチイベントの追加
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

    // 画面外に出ないように制限
    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));

    // 移動方向を更新
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
    if (currentTime - player.lastShot < 100) return; // 連射速度の制限

    player.lastShot = currentTime;
    const speed = player.bulletSpeed || 7;
    const angle = Math.atan2(player.direction.y, player.direction.x);
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;

    for (let i = 0; i < player.bulletCount; i++) {
        const spreadAngle = angle + (Math.random() - 0.5) * player.spread;
        const spreadDx = Math.cos(spreadAngle) * speed;
        const spreadDy = Math.sin(spreadAngle) * speed;

        player.bullets.push({ 
            x: player.x + player.width / 2, 
            y: player.y + player.height / 2, 
            dx: spreadDx, 
            dy: spreadDy 
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

        // アイテムゾンビの確率を設定（頻度を低下）
        if (Math.random() < 0.05) { // 確率を0.05に変更
            isItemZombie = true;
        }

        zombies.push({ 
            x: Math.random() * canvas.width, 
            y: -60, 
            width: 30,
            height: 50, 
            health: zombieHealth,
            isItemZombie: isItemZombie, // アイテムゾンビのフラグを追加
            animationFrame: 0 
        });
    }
    zombieSpawnCount = Math.min(zombieSpawnCount + 1, 10);
}

function applyItemEffect() {
    const effects = [
        () => { player.life = Math.min(player.life + 1, 5); }, // ライフ増加
        () => { player.bulletSpeed = player.bulletSpeed ? player.bulletSpeed + 1 : 8; player.bulletColor = 'red'; }, // ライフルの威力増加
        () => { player.bulletCount = player.bulletCount ? player.bulletCount + 1 : 2; }, // ライフルの球数増加
        () => { player.spread = player.spread ? player.spread + 1 : 1; }, // ライフルの球の方向広がる
        () => { 
            player.invincible = true;
            player.invincibleTime = 180; 
            player.color = 'rgba(0, 0, 255, 0.5)'; // 無敵状態の色変更
            setTimeout(() => {
                player.invincible = false;
                player.color = 'blue'; // 無敵状態終了後に元の色に戻す
            }, 5000); // 一定期間無敵
        }
    ];

    const randomEffect = effects[Math.floor(Math.random() * effects.length)];
    randomEffect();
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
    time++;
    timeSinceLastBoss++;
    zombieAnimationFrame = (zombieAnimationFrame + 1) % 60;
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
    ctx.fillStyle = player.color || 'blue'; // プレイヤーの色を動的に変更
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, player.y - 10, 10, 0, Math.PI * 2);
    ctx.fill();
    const legOffset = Math.sin(player.animationFrame * 0.2) * 5;
    ctx.fillRect(player.x, player.y + player.height, 10, 10 + legOffset);
    ctx.fillRect(player.x + player.width - 10, player.y + player.height, 10, 10 - legOffset);
}

function drawBullets() {
    ctx.fillStyle = player.bulletColor || 'yellow'; // 弾の色を動的に変更
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
            ctx.fillStyle = 'orange'; // アイテムゾンビは目立つ色
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
        zombie.y += 0.25; // ゾンビの速度を半分に設定
        zombie.animationFrame = (zombie.animationFrame + 1) % 60;
    });
}

function drawBoss() {
    ctx.fillStyle = 'darkred';
    ctx.fillRect(boss.x, boss.y, boss.width, boss.height);
    ctx.beginPath();
    ctx.arc(boss.x + boss.width / 2, boss.y - 30, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.moveTo(boss.x + boss.width / 2 - 30, boss.y - 60);
    ctx.lineTo(boss.x + boss.width / 2 - 10, boss.y - 90);
    ctx.lineTo(boss.x + boss.width / 2 + 10, boss.y - 60);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(boss.x + boss.width / 2 + 30, boss.y - 60);
    ctx.lineTo(boss.x + boss.width / 2 + 10, boss.y - 90);
    ctx.lineTo(boss.x + boss.width / 2 - 10, boss.y - 60);
    ctx.fill();
    ctx.fillStyle = 'yellow';
    ctx.beginPath();
    ctx.arc(boss.x + boss.width / 2 - 20, boss.y - 40, 10, 0, Math.PI * 2);
    ctx.arc(boss.x + boss.width / 2 + 20, boss.y - 40, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'darkred';
    const armOffset = Math.sin(boss.animationFrame * 0.1) * 20;
    ctx.fillRect(boss.x - 30, boss.y + 60 + armOffset, 30, 120);
    ctx.fillRect(boss.x + boss.width, boss.y + 60 - armOffset, 30, 120);
    const legOffset = Math.sin(boss.animationFrame * 0.2) * 10;
    ctx.fillRect(boss.x + 30, boss.y + boss.height, 40, 30 + legOffset);
    ctx.fillRect(boss.x + boss.width - 70, boss.y + boss.height, 40, 30 - legOffset);
    
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.fillText(boss.health, boss.x + boss.width / 2 - 20, boss.y + boss.height / 2);
    
    boss.animationFrame = (boss.animationFrame + 1) % 60;
}

function moveBoss() {
    boss.x += boss.dx;
    boss.y += boss.dy;

    if (boss.x <= 0 || boss.x + boss.width >= canvas.width) {
        boss.dx = -boss.dx;
    }
    if (boss.y <= canvas.height / 8 || boss.y + boss.height >= canvas.height) {
        boss.dy = -boss.dy;
    }

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

function checkCollisions() {
    player.bullets.forEach((bullet, bulletIndex) => {
        zombies.forEach((zombie, zombieIndex) => {
            if (bullet.x > zombie.x && bullet.x < zombie.x + zombie.width &&
                bullet.y > zombie.y && bullet.y < zombie.y + zombie.height) {
                zombie.health--;
                if (zombie.health <= 0) {
                    score += 10;
                    if (zombie.isItemZombie) {
                        applyItemEffect(); // アイテム効果を適用
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
                setTimeout(() => player.invincible = false, 3000); // 無敵時間を3秒に設定
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
                setTimeout(() => player.invincible = false, 3000); // 無敵時間を3秒に設定
                if (player.life <= 0) {
                    gameOver();
                }
            }
        }
    }
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
    clearInterval(bossMoveInterval);
    isExploding = true;
    const fragments = [];
    for (let i = 0; i < 20; i++) {
        fragments.push({ x: boss.x, y: boss.y, dx: (Math.random() - 0.5) * 10, dy: (Math.random() - 0.5) * 10 });
    }
    const explodeInterval = setInterval(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPlayer();
        drawBullets();
        drawScore();
        drawLife();
        drawTime();
        fragments.forEach(fragment => {
            fragment.x += fragment.dx;
            fragment.y += fragment.dy;
            ctx.fillStyle = 'red';
            ctx.fillRect(fragment.x, fragment.y, boss.width / 10, boss.height / 10);
        });
        
        ctx.fillStyle = 'white';
        ctx.font = '36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`おめでとう！ スコア: ${score}`, canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
    }, 50);
    setTimeout(() => {
        clearInterval(explodeInterval);
        isExploding = false;
        boss = null;
        bossMode = false;
        zombies.length = 0;
        timeSinceLastBoss = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPlayer();
        drawScore();
        ctx.fillStyle = 'white';
        ctx.font = '36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`おめでとう！ スコア: ${score}`, canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
        setTimeout(() => {
            if (confirm(`おめでとう！スコア: ${score}\n次のゲームを始めますか？`)) {
                restartGame(true);
            }
        }, 5000);
    }, 5000);
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
    bossMode = false;
    boss = null;
    zombieSpawnCount = 1;
    zombies.length = 0;
    timeSinceLastBoss = 0;

    clearInterval(gameInterval);
    clearInterval(zombieSpawnInterval);
    if (bossMoveInterval) clearInterval(bossMoveInterval);

    if (success) {
        player.life = player.life;
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
