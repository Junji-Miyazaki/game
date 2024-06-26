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

function updateLife() {
    lifeElement.textContent = `LIFE: ${life}`;
}

function updateScore() {
    const currentTime = new Date().getTime();
    score = Math.floor((currentTime - startTime) / 1000);
    scoreElement.textContent = `Time: ${score}`;
}

let jetFlame1, jetFlame2;

function createPlayerMesh() {
    const group = new THREE.Group();

    // 胴体（円筒）- さらに短く、太めに
    const bodyGeometry = new THREE.CylinderGeometry(18, 18, 30, 32);
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x3399ff });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.z = Math.PI / 2;
    group.add(body);

    // 頭部（円錐）- より短く
    const headGeometry = new THREE.ConeGeometry(18, 20, 32);
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0x3399ff });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.rotation.z = -Math.PI / 2;
    head.position.set(25, 0, 0);
    group.add(head);

    // コクピットの窓
    const windowGeometry = new THREE.SphereGeometry(7, 32, 32);
    const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xccffff });
    const window = new THREE.Mesh(windowGeometry, windowMaterial);
    window.scale.z = 0.5;
    window.position.set(22, 0, 10);
    group.add(window);

    // 縦のライン
    const lineGeometry = new THREE.BoxGeometry(28, 1, 1);
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.position.set(0, 0, 18);
    group.add(line);

    // 尾翼 - より大きく
    const finGeometry = new THREE.BufferGeometry();
    const finVertices = new Float32Array([
        -15, 0, 0,
        -25, 25, 0,
        -5, 0, 0
    ]);
    finGeometry.setAttribute('position', new THREE.BufferAttribute(finVertices, 3));
    const finMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600, side: THREE.DoubleSide });
    const fin = new THREE.Mesh(finGeometry, finMaterial);
    group.add(fin);

    // エンジン部分
    const engineGeometry = new THREE.CylinderGeometry(10, 8, 8, 32);
    const engineMaterial = new THREE.MeshBasicMaterial({ color: 0xcc6600 });
    const engine = new THREE.Mesh(engineGeometry, engineMaterial);
    engine.rotation.z = Math.PI / 2;
    engine.position.set(-19, 0, 0);
    group.add(engine);

    // ジェット噴射
    const jetFlameGroup = createJetFlame();
    jetFlameGroup.position.set(-23, 0, 0);
    group.add(jetFlameGroup);

    return group;
}

function createJetFlame() {
    const flameGroup = new THREE.Group();

    const flameGeometry1 = new THREE.ConeGeometry(5, 15, 32);
    const flameMaterial1 = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    jetFlame1 = new THREE.Mesh(flameGeometry1, flameMaterial1);
    jetFlame1.rotation.z = Math.PI / 2;
    flameGroup.add(jetFlame1);

    const flameGeometry2 = new THREE.ConeGeometry(4, 20, 32);
    const flameMaterial2 = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    jetFlame2 = new THREE.Mesh(flameGeometry2, flameMaterial2);
    jetFlame2.rotation.z = Math.PI / 2;
    jetFlame2.visible = false;
    flameGroup.add(jetFlame2);

    return flameGroup;
}

const player = createPlayerMesh();
player.position.set(-400, 0, 0);
scene.add(player);

// オブジェクトの配列
const objects = [];

// オブジェクトの種類
const ObjectType = {
    NORMAL: 'normal',
    ZIGZAG: 'zigzag',
    WAVY: 'wavy'
};

// ランダムな多角形の岩の生成（サイズの多様性を増加）
function createRockGeometry() {
    const vertices = [];
    const numVertices = Math.floor(Math.random() * 5) + 5; // 5〜9頂点
    const baseSize = Math.random() * 40 + 10; // 基本サイズを10〜50に拡大

    for (let i = 0; i < numVertices; i++) {
        const angle = (i / numVertices) * Math.PI * 2;
        const radius = (Math.random() * 0.5 + 0.5) * baseSize; // 基本サイズの50%〜100%のランダムな半径
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        vertices.push(new THREE.Vector2(x, y));
    }

    const shape = new THREE.Shape(vertices);
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: Math.random() * baseSize + 5,
        bevelEnabled: false
    });

    return geometry;
}

// オブジェクトの生成
function createObject(type = ObjectType.NORMAL) {
    const geometry = createRockGeometry();
    
    const hue = Math.random();
    const saturation = 0.5 + Math.random() * 0.5;
    const lightness = 0.6 + Math.random() * 0.4;
    const color = new THREE.Color().setHSL(hue, saturation, lightness);
    
    const material = new THREE.MeshBasicMaterial({ color: color, wireframe: true });
    const object = new THREE.Mesh(geometry, material);
    const scale = Math.random() * 1.5 + 0.5;
    object.scale.set(scale, scale, scale);
    object.position.set(
        window.innerWidth / 2 + 50,
        Math.random() * window.innerHeight - window.innerHeight / 2,
        0
    );
    
    // createObject関数内のvelocity計算を修正
let velocity;
const speedFactor = 1/9;  // 速度を9分の1に
switch(type) {
    case ObjectType.ZIGZAG:
        velocity = new THREE.Vector3(
            -(Math.random() * 2 + 1) * (1 / scale) * speedFactor,
            (Math.random() * 4 - 2) * 2 * speedFactor,
            0
        );
        // ... 残りのコードは変更なし
    case ObjectType.WAVY:
        velocity = new THREE.Vector3(
            -(Math.random() * 2 + 1) * (1 / scale) * speedFactor,
            0,
            0
        );
        // ... 残りのコードは変更なし
    default:
        velocity = new THREE.Vector3(
            -(Math.random() * 2 + 1) * (1 / scale) * speedFactor,
            (Math.random() * 4 - 2) * speedFactor,
            0
        );
}
    
    object.velocity = velocity;
    object.type = type;
    scene.add(object);
    objects.push(object);
}

// 衝突判定（簡易版）
function checkCollision(obj1, obj2) {
    const box1 = new THREE.Box3().setFromObject(obj1);
    const box2 = new THREE.Box3().setFromObject(obj2);
    return box1.intersectsBox(box2);
}

// カメラの位置設定
camera.position.z = 100;

let animationId;

// 星の生成
const starGeometry = new THREE.BufferGeometry();
const starMaterial = new THREE.PointsMaterial({
    color: 0xFFFFFF,
    size: 2,
    sizeAttenuation: false
});

const starVertices = [];
for (let i = 0; i < 1000; i++) {
    const x = (Math.random() - 0.5) * 2000;
    const y = (Math.random() - 0.5) * 1000;
    const z = Math.random() * 1000 - 1000;
    starVertices.push(x, y, z);
}

starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// ゲームオーバー処理
function gameOver() {
    cancelAnimationFrame(animationId);
    const playAgain = confirm(`Game Over! Your score: ${score} seconds\nDo you want to continue from this difficulty?`);
    if (playAgain) {
        continueGame();
        checkOrientation();
    } else {
        // ゲーム終了処理
        renderer.domElement.remove();
        lifeElement.remove();
        scoreElement.remove();
    }
}

// ゲームリセット（最初から開始）
function resetGame() {
    life = 3;
    updateLife();
    objects.forEach(object => scene.remove(object));
    objects.length = 0;
    startTime = new Date().getTime();
    objectCount = 2;
    currentObjectCount = objectCount;
    lastObjectIncrease = 0;
    lastObjectCreationTime = 0;
    createObject(); // 最初のオブジェクトを作成
}

// 現在の難易度から再開
function continueGame() {
    life = 3;
    updateLife();
    objects.forEach(object => scene.remove(object));
    objects.length = 0;
    startTime = new Date().getTime();
    objectCount = currentObjectCount;
    lastObjectIncrease = 0;
    lastObjectCreationTime = 0;
    createObject(); // 最初のオブジェクトを作成
}

// 画面のフラッシュ効果
function flashScreen() {
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.backgroundColor = 'white';
    flash.style.opacity = '0.5';
    flash.style.pointerEvents = 'none';
    document.body.appendChild(flash);

    setTimeout(() => {
        flash.remove();
    }, 100);
}

// ジェット噴射のアニメーション
let flameAnimationFrame = 0;
function animateJetFlame() {
    flameAnimationFrame++;
    if (flameAnimationFrame % 10 === 0) {
        jetFlame1.visible = !jetFlame1.visible;
        jetFlame2.visible = !jetFlame2.visible;
    }
}

// オブジェクトの移動更新
function updateObjectMovement(object) {
    switch(object.type) {
        case ObjectType.ZIGZAG:
            object.position.add(object.velocity);
            object.zigzagTime += 0.05;
            if (object.zigzagTime > Math.PI) {
                object.zigzagTime = 0;
                object.zigzagDirection *= -1;
            }
            object.position.y += Math.sin(object.zigzagTime) * 2 * object.zigzagDirection;
            break;
        case ObjectType.WAVY:
            object.position.x += object.velocity.x;
            object.wavyTime += 0.05;
            object.position.y = Math.sin(object.wavyTime) * 50 + object.position.y;
            break;
        default:
            object.position.add(object.velocity);
    }

    // 画面端での反射（Y軸のみ）
    if (object.position.y > window.innerHeight / 2 - 20 || 
        object.position.y < -window.innerHeight / 2 + 20) {
        object.velocity.y *= -1;
    }
}

// タッチ操作のための変数
let touchStartX, touchStartY;

// タッチイベントリスナーの追加
renderer.domElement.addEventListener('touchstart', handleTouchStart, false);
renderer.domElement.addEventListener('touchmove', handleTouchMove, false);
renderer.domElement.addEventListener('touchend', handleTouchEnd, false);

function handleTouchStart(event) {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
}

let targetX = 0, targetY = 0;

// handleTouchMove関数を修正
function handleTouchMove(event) {
    event.preventDefault();
    if (!touchStartX || !touchStartY) {
        return;
    }

    let touchEndX = event.touches[0].clientX;
    let touchEndY = event.touches[0].clientY;

    // 画面の中心を原点とした座標に変換
    targetX = touchEndX - window.innerWidth / 2;
    targetY = window.innerHeight / 2 - touchEndY;

    // 目標位置を画面内に制限
    targetX = Math.max(Math.min(targetX, window.innerWidth / 2 - 40), -window.innerWidth / 2 + 40);
    targetY = Math.max(Math.min(targetY, window.innerHeight / 2 - 30), -window.innerHeight / 2 + 30);

    touchStartX = touchEndX;
    touchStartY = touchEndY;
}


function handleTouchEnd() {
    touchStartX = null;
    touchStartY = null;
}

// アニメーションループ
function animate() {
    animationId = requestAnimationFrame(animate);
	
	// プレイヤーの位置を目標位置に近づける
player.position.x += (targetX - player.position.x) * 0.2;
player.position.y += (targetY - player.position.y) * 0.2;
	
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

window.addEventListener('orientationchange', function() {
    setTimeout(checkOrientation, 100);  // 100ミリ秒の遅延
});

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

// ゲーム開始
function startGame() {
    resetGame();
    checkOrientation();
}

startGame();