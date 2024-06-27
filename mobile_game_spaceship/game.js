// Three.jsのセットアップ
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(window.innerWidth / -2, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight / -2, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ライフとスコア
let life = 3;
let score = 0;
let startTime;
let objectCount = 2;
let currentObjectCount;
let lastObjectIncrease = 0;
let lastObjectCreationTime = 0;

const lifeElement = document.createElement('div');
lifeElement.style.position = 'absolute';
lifeElement.style.top = '10px';
lifeElement.style.left = '10px';
lifeElement.style.color = 'white';
lifeElement.style.fontSize = '24px';
document.body.appendChild(lifeElement);

const scoreElement = document.createElement('div');
scoreElement.style.position = 'absolute';
scoreElement.style.top = '40px';
scoreElement.style.left = '10px';
scoreElement.style.color = 'white';
scoreElement.style.fontSize = '24px';
document.body.appendChild(scoreElement);

let lastTouchX, lastTouchY;

function updateLife() {
    lifeElement.textContent = `LIFE: ${life}`;
}

function updateScore() {
    const currentTime = new Date().getTime();
    score = Math.floor((currentTime - startTime) / 1000);
    scoreElement.textContent = `Time: ${score}`;
}

let jetFlame1, jetFlame2;

// ... (playerMesh, createJetFlame, createObject 関数は変更なし)

function handleTouchStart(event) {
    event.preventDefault();
    lastTouchX = event.touches[0].clientX;
    lastTouchY = event.touches[0].clientY;
}

function handleTouchMove(event) {
    event.preventDefault();
    
    const touch = event.touches[0];
    const deltaX = touch.clientX - lastTouchX;
    const deltaY = touch.clientY - lastTouchY;

    // 画面の中心を原点とした座標に変換（横向き画面に対応）
    player.position.y += deltaX;
    player.position.x -= deltaY;

    // プレイヤーの位置を画面内に制限
    player.position.x = Math.max(Math.min(player.position.x, window.innerWidth / 2 - 40), -window.innerWidth / 2 + 40);
    player.position.y = Math.max(Math.min(player.position.y, window.innerHeight / 2 - 30), -window.innerHeight / 2 + 30);

    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
}

// アニメーションループ
function animate() {
    animationId = requestAnimationFrame(animate);
	
    // オブジェクトの移動と衝突判定
    for (let i = objects.length - 1; i >= 0; i--) {
        const object = objects[i];
        updateObjectMovement(object);

        // オブジェクト同士の衝突
        for (let j = objects.length - 1; j > i; j--) {
            if (checkCollision(object, objects[j])) {
                const temp = object.velocity.clone();
                object.velocity.copy(objects[j].velocity);
                objects[j].velocity.copy(temp);
            }
        }

        // プレイヤーとの衝突判定
        if (checkCollision(player, object)) {
            flashScreen();
            life--;
            updateLife();
            if (life <= 0) {
                gameOver();
                return;
            } else {
                scene.remove(object);
                objects.splice(i, 1);
            }
        }

        // 画面外に出たオブジェクトの削除
        if (object.position.x < -window.innerWidth / 2 - 50) {
            scene.remove(object);
            objects.splice(i, 1);
        }
    }

    // スコア更新
    updateScore();

    // 難易度の変更
    if (score >= 90 && score - lastObjectIncrease >= 10) {
        lastObjectIncrease = score;
        objectCount += 3;
        currentObjectCount = objectCount;
        
        // 新しいタイプのオブジェクトを追加
        const newType = Math.random() < 0.5 ? ObjectType.ZIGZAG : ObjectType.WAVY;
        createObject(newType);
    } else if (score < 180 && score - lastObjectIncrease >= 10) {
        lastObjectIncrease = score;
        objectCount += 2;
        currentObjectCount = objectCount;
    }

    // オブジェクトの生成
    const currentTime = new Date().getTime();
    if (currentTime - lastObjectCreationTime > 1000 && objects.length < objectCount) {
        createObject();
        lastObjectCreationTime = currentTime;
    }

    // 星のスクロール
    const positions = stars.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
        positions[i] -= 1; // X軸方向にスクロール
        if (positions[i] < -1000) {
            positions[i] = 1000;
        }
    }
    stars.geometry.attributes.position.needsUpdate = true;

    // ジェット噴射のアニメーション
    animateJetFlame();

    renderer.render(scene, camera);
}

// 画面の向きを検出し、必要に応じてメッセージを表示
function checkOrientation() {
    let rotateMessage = document.getElementById('rotateMessage');
    if (window.innerHeight > window.innerWidth) {
        rotateMessage.style.display = 'block';
        cancelAnimationFrame(animationId);
    } else {
        rotateMessage.style.display = 'none';
        requestAnimationFrame(animate);
    }
}

function setupEventListeners() {
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
}

// ウィンドウサイズ変更時の処理
window.addEventListener('resize', () => {
    camera.left = window.innerWidth / -2;
    camera.right = window.innerWidth / 2;
    camera.top = window.innerHeight / 2;
    camera.bottom = window.innerHeight / -2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    checkOrientation();
});

window.addEventListener('orientationchange', function() {
    setTimeout(checkOrientation, 100);  // 100ミリ秒の遅延
});

// ゲーム開始
function startGame() {
    resetGame();
    setupEventListeners();
    checkOrientation();
    animate(); // アニメーションループを開始
}

startGame();