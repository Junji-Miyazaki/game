// Three.jsのセットアップ
let scene, camera, renderer;
let player, starsFar, starsNear;

// ゲーム状態
let life = 3;
let score = 0;
let startTime;
let objectCount = 2;
let currentObjectCount;
let lastObjectIncrease = 0;
let lastObjectCreationTime = 0;

// UI要素
let lifeElement, scoreElement, startMessage;

// オブジェクト
const objects = [];
let jetFlame1, jetFlame2;

// タッチ操作用の変数
let touchStartX, touchStartY;
const playerSpeed = 10; // プレイヤーのスピードを上げる

// 画面の向きチェック
function checkOrientation() {
    const rotateMessage = document.getElementById('rotateMessage');
    if (window.innerHeight > window.innerWidth) {
        rotateMessage.style.display = 'flex';
        return false;
    } else {
        rotateMessage.style.display = 'none';
        return true;
    }
}

// 画面のセットアップ
function setupScreen() {
    scene = new THREE.Scene();
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 300; // 画角を寄せる
    camera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2, 
        frustumSize * aspect / 2, 
        frustumSize / 2, 
        frustumSize / -2, 
        0.1, 
        1000
    );
    camera.position.z = 100;

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // UI要素の作成
    lifeElement = document.createElement('div');
    scoreElement = document.createElement('div');
    startMessage = document.createElement('div');
    const uiStyle = 'position: absolute; color: white; font-size: 18px; padding: 10px;';
    lifeElement.style.cssText = uiStyle + 'top: 10px; left: 10px;';
    scoreElement.style.cssText = uiStyle + 'top: 40px; left: 10px;';
    startMessage.style.cssText = 'position: absolute; color: white; font-size: 24px; top: 50%; left: 50%; transform: translate(-50%, -50%);';
    startMessage.textContent = 'Game Start!';
    document.body.appendChild(lifeElement);
    document.body.appendChild(scoreElement);
    document.body.appendChild(startMessage);
}

function updateLife() {
    lifeElement.textContent = `LIFE: ${life}`;
}

function updateScore() {
    const currentTime = new Date().getTime();
    score = Math.floor((currentTime - startTime) / 1000);
    scoreElement.textContent = `Time: ${score}`;
}

function createPlayerMesh() {
    const group = new THREE.Group();

    // 胴体（円筒）
    const bodyGeometry = new THREE.CylinderGeometry(15, 15, 25, 32);
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x3399ff });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.z = Math.PI / 2;
    group.add(body);

    // 頭部（円錐）
    const headGeometry = new THREE.ConeGeometry(15, 17, 32);
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0x3399ff });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.rotation.z = -Math.PI / 2;
    head.position.set(21, 0, 0);
    group.add(head);

    // コクピットの窓
    const windowGeometry = new THREE.SphereGeometry(6, 32, 32);
    const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xccffff });
    const window = new THREE.Mesh(windowGeometry, windowMaterial);
    window.scale.z = 0.5;
    window.position.set(18, 0, 8);
    group.add(window);

    // 縦のライン
    const lineGeometry = new THREE.BoxGeometry(23, 1, 1);
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.position.set(0, 0, 15);
    group.add(line);

    // 尾翼
    const finGeometry = new THREE.BufferGeometry();
    const finVertices = new Float32Array([
        -12, 0, 0,
        -21, 21, 0,
        -4, 0, 0
    ]);
    finGeometry.setAttribute('position', new THREE.BufferAttribute(finVertices, 3));
    const finMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600, side: THREE.DoubleSide });
    const fin = new THREE.Mesh(finGeometry, finMaterial);
    group.add(fin);

    // エンジン部分
    const engineGeometry = new THREE.CylinderGeometry(8, 7, 7, 32);
    const engineMaterial = new THREE.MeshBasicMaterial({ color: 0xcc6600 });
    const engine = new THREE.Mesh(engineGeometry, engineMaterial);
    engine.rotation.z = Math.PI / 2;
    engine.position.set(-16, 0, 0);
    group.add(engine);

    // ジェット噴射
    const jetFlameGroup = createJetFlame();
    jetFlameGroup.position.set(-19, 0, 0);
    group.add(jetFlameGroup);

    return group;
}

function createJetFlame() {
    const flameGroup = new THREE.Group();

    const flameGeometry1 = new THREE.ConeGeometry(4, 13, 32);
    const flameMaterial1 = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    jetFlame1 = new THREE.Mesh(flameGeometry1, flameMaterial1);
    jetFlame1.rotation.z = Math.PI / 2;
    flameGroup.add(jetFlame1);

    const flameGeometry2 = new THREE.ConeGeometry(3, 17, 32);
    const flameMaterial2 = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    jetFlame2 = new THREE.Mesh(flameGeometry2, flameMaterial2);
    jetFlame2.rotation.z = Math.PI / 2;
    jetFlame2.visible = false;
    flameGroup.add(jetFlame2);

    return flameGroup;
}

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
    const baseSize = Math.random() * 35 + 8; // 基本サイズを8〜43に拡大

    for (let i = 0; i < numVertices; i++) {
        const angle = (i / numVertices) * Math.PI * 2;
        const radius = (Math.random() * 0.5 + 0.5) * baseSize; // 基本サイズの50%〜100%のランダムな半径
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        vertices.push(new THREE.Vector2(x, y));
    }

    const shape = new THREE.Shape(vertices);
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: Math.random() * baseSize + 4,
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
    const scale = Math.random() * 1.3 + 0.4;
    object.scale.set(scale, scale, scale);
    object.position.set(
        camera.right + 50,
        Math.random() * (camera.top - camera.bottom) + camera.bottom,
        0
    );
    
    let velocity;
    switch(type) {
        case ObjectType.ZIGZAG:
            velocity = new THREE.Vector3(
                -(Math.random() * 1.0 + 0.5) * (1 / scale), // 隕石の速度を遅くする
                (Math.random() * 3 - 1.5) * 1.5,
                0
            );
            object.zigzagTime = 0;
            object.zigzagDirection = 1;
            break;
        case ObjectType.WAVY:
            velocity = new THREE.Vector3(
                -(Math.random() * 1.0 + 0.5) * (1 / scale), // 隕石の速度を遅くする
                0,
                0
            );
            object.wavyTime = 0;
            break;
        default:
            velocity = new THREE.Vector3(
                -(Math.random() * 1.0 + 0.5) * (1 / scale), // 隕石の速度を遅くする
                Math.random() * 3 - 1.5,
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

// 星の生成
function createStars() {
    const starGeometryFar = new THREE.BufferGeometry();
    const starGeometryNear = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({
        color: 0xFFFFFF,
        size: 2,
        sizeAttenuation: false
    });

    const starVerticesFar = [];
    const starVerticesNear = [];
    for (let i = 0; i < 250; i++) { // 遠い星
        const x = Math.random() * 1800 - 600; // -600から1200の範囲で生成
        const y = (Math.random() - 0.5) * 300;
        const z = Math.random() * 300 - 300;
        starVerticesFar.push(x, y, z);
    }
    for (let i = 0; i < 125; i++) { // 近い星
        const x = Math.random() * 1800 - 600; // -600から1200の範囲で生成
        const y = (Math.random() - 0.5) * 300;
        const z = Math.random() * 300 - 300;
        starVerticesNear.push(x, y, z);
    }

    starGeometryFar.setAttribute('position', new THREE.Float32BufferAttribute(starVerticesFar, 3));
    starGeometryNear.setAttribute('position', new THREE.Float32BufferAttribute(starVerticesNear, 3));

    starsFar = new THREE.Points(starGeometryFar, starMaterial);
    starsNear = new THREE.Points(starGeometryNear, starMaterial);

    scene.add(starsFar);
    scene.add(starsNear);
}

// ゲームオーバー処理
function gameOver() {
    cancelAnimationFrame(animationId);
    const playAgain = confirm(`Game Over! Your score: ${score} seconds\nDo you want to continue from this difficulty?`);
    if (playAgain) {
        continueGame();
        animate();
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
            object.zigzagTime += 0.04;
            if (object.zigzagTime > Math.PI) {
                object.zigzagTime = 0;
                object.zigzagDirection *= -1;
            }
            object.position.y += Math.sin(object.zigzagTime) * 1.5 * object.zigzagDirection;
            break;
        case ObjectType.WAVY:
            object.position.x += object.velocity.x;
            object.wavyTime += 0.04;
            object.position.y = Math.sin(object.wavyTime) * 20 + object.position.y; // 波の振幅を調整
            break;
        default:
            object.position.add(object.velocity);
    }

    // 画面端での反射（Y軸のみ）
    if (object.position.y > camera.top - 7.5 || object.position.y < camera.bottom + 7.5) {
        object.velocity.y *= -1;
    }
}

let animationId;

// アニメーションループ
function animate() {
    animationId = requestAnimationFrame(animate);

    if (!checkOrientation()) return;

    // プレイヤーの移動
    if (touchStartX !== undefined && touchStartY !== undefined) {
        const deltaX = (touchStartX - player.position.x) / 5; // 反応速度を上げる
        const deltaY = (touchStartY - player.position.y + 50) / 5; // 反応速度を上げると同時に位置を上にずらす
        player.position.x += Math.sign(deltaX) * Math.min(Math.abs(deltaX), playerSpeed);
        player.position.y += Math.sign(deltaY) * Math.min(Math.abs(deltaY), playerSpeed);
    }

    // プレイヤーの画面内制限
    player.position.x = Math.max(Math.min(player.position.x, camera.right - 15), camera.left + 15);
    player.position.y = Math.max(Math.min(player.position.y, camera.top - 12.5), camera.bottom + 12.5);

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
        if (object.position.x < camera.left - 20) {
            scene.remove(object);
            objects.splice(i, 1);
        }
    }

    // スコア更新
    updateScore();

    // 難易度の変更
    if (score >= 90 && score - lastObjectIncrease >= 10) {
        lastObjectIncrease = score;
        objectCount += 2;
        currentObjectCount = objectCount;
        
        // 新しいタイプのオブジェクトを追加
        const newType = Math.random() < 0.5 ? ObjectType.ZIGZAG : ObjectType.WAVY;
        createObject(newType);
    } else if (score < 180 && score - lastObjectIncrease >= 10) {
        lastObjectIncrease = score;
        objectCount++;
        currentObjectCount = objectCount;
    }

    // オブジェクトの生成
    const currentTime = new Date().getTime();
    if (currentTime - lastObjectCreationTime > 1000 && objects.length < objectCount) {
        createObject();
        lastObjectCreationTime = currentTime;
    }

    // 星のスクロール
    const starPositionsFar = starsFar.geometry.attributes.position.array;
    const starPositionsNear = starsNear.geometry.attributes.position.array;
    for (let i = 0; i < starPositionsFar.length; i += 3) {
        starPositionsFar[i] -= 0.2; // 遠い星のスクロール速度を遅くする
        if (starPositionsFar[i] < camera.left - 900) {
            starPositionsFar[i] += 1800; // スクロールの連続性を確保
        }
    }
    for (let i = 0; i < starPositionsNear.length; i += 3) {
        starPositionsNear[i] -= 0.4; // 近い星のスクロール速度を遅くする
        if (starPositionsNear[i] < camera.left - 900) {
            starPositionsNear[i] += 1800; // スクロールの連続性を確保
        }
    }
    starsFar.geometry.attributes.position.needsUpdate = true;
    starsNear.geometry.attributes.position.needsUpdate = true;

    // ジェット噴射のアニメーション
    animateJetFlame();

    renderer.render(scene, camera);
}

// タッチイベントの処理
function handleTouchStart(event) {
    const touch = event.touches[0];
    touchStartX = (touch.clientX / window.innerWidth) * (camera.right - camera.left) + camera.left;
    touchStartY = ((window.innerHeight - touch.clientY) / window.innerHeight) * (camera.top - camera.bottom) + camera.bottom;
}

function handleTouchMove(event) {
    event.preventDefault();
    const touch = event.touches[0];
    touchStartX = (touch.clientX / window.innerWidth) * (camera.right - camera.left) + camera.left;
    touchStartY = ((window.innerHeight - touch.clientY) / window.innerHeight) * (camera.top - camera.bottom) + camera.bottom;
}

function handleTouchEnd() {
    touchStartX = undefined;
    touchStartY = undefined;
}

// ゲーム開始
function startGame() {
    if (!checkOrientation()) return;

    setupScreen();
    player = createPlayerMesh();
    player.position.set(camera.left + 50, 0, 0);
    scene.add(player);

    createStars();

    resetGame();

    // 「Game Start!」メッセージを表示してからゲームを開始
    setTimeout(() => {
        startMessage.style.display = 'none';
        animate();
    }, 2000);

    // タッチイベントのリスナーを追加
    document.addEventListener('touchstart', handleTouchStart, false);
    document.addEventListener('touchmove', handleTouchMove, false);
    document.addEventListener('touchend', handleTouchEnd, false);
}

// ウィンドウサイズ変更時の処理
window.addEventListener('resize', () => {
    if (!checkOrientation()) return;

    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 300; // 画角を寄せる
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ゲームの初期化と開始
window.addEventListener('load', () => {
    if (checkOrientation()) {
        startGame();
    } else {
        const checkInterval = setInterval(() => {
            if (checkOrientation()) {
                clearInterval(checkInterval);
                startGame();
            }
        }, 500);
    }
});
