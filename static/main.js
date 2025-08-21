import * as THREE from 'three'; 
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
//import { CSG } from 'three-csg-ts';
import * as ThreeCSG from 'three-csg-ts';
import { createRecognizer } from './recognizer.js';
import TWEEN from '@tweenjs/tween.js';

const CSG = ThreeCSG.CSG ?? ThreeCSG.default ?? ThreeCSG;
const LIB_KEY = 'recognizedLibrary';

const TETROMINO_TYPES = new Set(['tI','tT','tZ','tL']);
function typeLabel(t) {
  switch (t) {
    case 'tI': return 'I 形方塊';
    case 'tT': return 'T 形方塊';
    case 'tZ': return 'Z 形方塊';
    case 'tL': return 'L 形方塊';
    case 'cube': return '立方體';
    case 'circle': return '球體';
    case 'lshape': return '不規則';
    default: return t;
  }
}

function getLibrarySafe() {
    let arr;
    try { arr = JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); }
    catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    return arr;
}
const library = getLibrarySafe();

function saveLibrary() {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(library)); }
    catch (e) { console.warn('localStorage 寫入失敗:', e); }
}

function summarize(item) {
    const { type, width, height, depth, color, hasHole, holeWidth, holeHeight } = item;
    const typeName = typeLabel(type);
    const size = (type === 'circle') ? `${width}` :
                 (TETROMINO_TYPES.has(type) ? `單位=${width}` :
                 `${width}×${height}×${depth}`);
    const hole = hasHole ? `孔 ${holeWidth ?? 0}×${holeHeight ?? 0}` : '無孔';
    return { title: `${typeName} / ${size}`, hole, color };
}

function renderLibrary() {
    const list = document.getElementById('libraryList');
    if (!list) return;

    if (!Array.isArray(library) || library.length === 0) {
        list.innerHTML = `<div style="color:#666;font-size:12px;line-height:1.6;">
        （清單目前沒有項目）<br>
        ・按「辨識參數」後會自動加入<br>
        ・或用上方表單產生後也會加入
        </div>`;
        return;
    }

    list.innerHTML = library.map((p, i) => {
    const { title, hole, color } = summarize(p);
    return `<div class="item" data-index="${i}">
      <div><strong>${title}</strong></div>
      <div class="row"><span class="chip" style="background:${color}"></span><span>${hole}</span></div>
      <button class="btn use-item" data-index="${i}">放到場景</button>
    </div>`;
  }).join('');
}

function addToLibrary(params) {
    const n = (v,d)=> (Number.isFinite(+v)? +v : d);
    const clean = {
        type: params.type || 'cube',
        width:  n(params.width, 20),
        height: n(params.height, TETROMINO_TYPES.has(params.type) ? params.width : (params.type === 'circle' ? params.width : 20)),
        depth:  n(params.depth,  TETROMINO_TYPES.has(params.type) ? params.width : (params.type === 'circle' ? params.width : 20)),
        color:  params.color || '#00ff00',
        hasHole: TETROMINO_TYPES.has(params.type) ? false : !!params.hasHole,
        holeWidth:  n(params.holeWidth, 10),
        holeHeight: n(params.holeHeight, 10),
    };
    console.log('[Library] add', clean);
    library.unshift(clean);
    library.splice(60);
    saveLibrary();
    renderLibrary();
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.use-item');
    if (!btn) return;
    const idx = +btn.dataset.index;
    const item = library[idx];
    if (!item) return;
    createCube(item.type, item.width, item.height, item.depth, item.color, item.hasHole, item.holeWidth, item.holeHeight);
});

function normalizeColor(input) {
    const map = {
        "紅色": "#ff0000",
        "綠色": "#00ff00",
        "藍色": "#0000ff",
        "黃色": "#ffff00",
        "紫色": "#800080",
        "黑色": "#000000",
        "白色": "#ffffff",
        "橘色": "#ffa500",
        "灰色": "#808080",
        "粉紅色": "#ffc0cb"
    };
    if (!input) return '#00ff00';
    if (input.startsWith('#')) return input;
    const hex = map[input.trim()];
    return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#00ff00';
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.set(150, 150, 150);
camera.lookAt(0, 45, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.RIGHT = null;

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50, 50, 100);
scene.add(light);

const palletGeometry = new THREE.BoxGeometry(110, 10, 110);
const palletMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
const pallet = new THREE.Mesh(palletGeometry, palletMaterial);
pallet.position.y = -5;
scene.add(pallet);

const containerGeometry = new THREE.BoxGeometry(110, 110, 110);
const containerMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide
});
const container = new THREE.Mesh(containerGeometry, containerMaterial);
container.position.y = 45;
const containerEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(containerGeometry),
    new THREE.LineBasicMaterial({ color: 0x00ffff })
);
container.add(containerEdges);
scene.add(container);

const objects = [];
let selectedObj = null;
let selectionHelper = null;

function showSelection(obj) {
    if (selectionHelper) { scene.remove(selectionHelper); selectionHelper = null; }
    if (obj) {
        selectionHelper = new THREE.BoxHelper(obj, 0xffaa00);
        scene.add(selectionHelper);
    }
}

function deleteSelected() {
    if (!selectedObj) return;
    const i = objects.indexOf(selectedObj);
    if (i >= 0) objects.splice(i, 1);
    scene.remove(selectedObj);
    selectedObj = null;
    if (selectionHelper) { scene.remove(selectionHelper); selectionHelper = null; }
}

function clearAllObjects() {
    objects.forEach(o => scene.remove(o));
    objects.length = 0;
    selectedObj = null;
    if (selectionHelper) { scene.remove(selectionHelper); selectionHelper = null; }
}

function ensureSceneButtons() {
    const ui = document.getElementById('ui');
    if (!ui) return;

    if (!document.getElementById('deleteSelectedBtn')) {
        const b1 = document.createElement('button');
        b1.id = 'deleteSelectedBtn';
        b1.textContent = '刪除選取';
        b1.style.marginLeft = '8px';
        ui.appendChild(b1);
        b1.addEventListener('click', deleteSelected);
    }
    if (!document.getElementById('clearAllBtn')) {
        const b2 = document.createElement('button');
        b2.id = 'clearAllBtn';
        b2.textContent = '清空容器';
        b2.style.marginLeft = '8px';
        ui.appendChild(b2);
        b2.addEventListener('click', clearAllObjects);
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
});

function buildTetrominoMesh(kind, unit, material) {
  const group = new THREE.Group();
  const g = new THREE.BoxGeometry(unit, unit, unit);
  let layout = [];
  switch (kind) {
    case 'tI': layout = [[-1.5,0],[ -0.5,0],[ 0.5,0],[ 1.5,0]]; break;
    case 'tT': layout = [[-1,0],[0,0],[1,0],[0,1]]; break;
    case 'tZ': layout = [[-1,0],[0,0],[0,1],[1,1]]; break;
    case 'tL': layout = [[-1,0],[0,0],[1,0],[-1,1]]; break;
    default:   layout = [[-1,0],[0,0],[1,0],[0,1]];
  }
  for (const [gx,gz] of layout) {
    const cube = new THREE.Mesh(g, material);
    cube.position.set(gx * unit, 0, gz * unit);
    group.add(cube);
  }
  // 中心歸零
  const box = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3();
  box.getCenter(center);
  group.children.forEach(c => {
    c.position.sub(center);
  });
  group.userData.unit = unit;
  return group;
}

function updateParamVisibility(type = document.getElementById('shapeType')?.value) {
    const box    = document.getElementById('boxParams');
    const sphere = document.getElementById('sphereParams');
    const custom = document.getElementById('customParams');
    const hole   = document.getElementById('holeInput');
    if (!box || !sphere || !custom || !hole) return;

    const isTet = TETROMINO_TYPES.has(type);

    if (isTet) {
        box.style.display    = 'block';
        sphere.style.display = 'none';
        custom.style.display = 'none';
        hole.style.display = 'none';
        const w = document.getElementById('boxWidth');
        const h = document.getElementById('boxHeight');
        const d = document.getElementById('boxDepth');
        if (w) { w.placeholder = '單位邊長'; w.style.display = 'block'; }
        if (h) { h.value = ''; h.style.display = 'none'; }
        if (d) { d.value = ''; d.style.display = 'none'; }

        const chk = document.getElementById('hasHole');
        if (chk) chk.checked = false;
        hole.style.display = 'none';
        return;
    }
    box.style.display = (type === 'cube') ? 'block' : 'none';
    sphere.style.display = (type === 'circle') ? 'block' : 'none';
    custom.style.display = (type === 'lshape') ? 'block' : 'none';

    if (type === 'cube') {
        ['boxWidth','boxHeight','boxDepth'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
        hole.style.display = (document.getElementById('hasHole').checked ? 'block' : 'none');
    } else {
        hole.style.display = 'none';
    }
}

function clearFormFields() {
    [
        'boxWidth','boxHeight','boxDepth',
        'sphereWidth',
        'customWidth','customHeight','customDepth',
        'holeWidth','holeHeight'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    updateParamVisibility();
}

function _collectAABBs(root) {
  const boxes = [];
  root.updateMatrixWorld(true);
  root.traverse(n => {
    if (n.isMesh) {
      const b = new THREE.Box3().setFromObject(n);
      boxes.push(b);
    }
  });
  return boxes;
}
    
function isOverlapping(ncandidate, ignore = null, eps = 1e-3) {
    const cand = _collectAABBs(ncandidate);
    for (const obj of objects) {
        if (obj === ignore) continue;
        const obs = _collectAABBs(obj);
        for (const c of cand) {
            for (const o of obs) {
                // 加上一點點間隙（-eps 代表稍微放寬）
                if (c.max.x - eps > o.min.x && c.min.x + eps < o.max.x &&
                    c.max.y - eps > o.min.y && c.min.y + eps < o.max.y &&
                    c.max.z - eps > o.min.z && c.min.z + eps < o.max.z) {
                    // 若只是上下堆疊（不算側向碰撞），直接當作無重疊
                    const vertical = c.max.y <= o.min.y + eps || c.min.y >= o.max.y - eps;
                    if (!vertical) return true;
                }
            }
        }
    }
    return false;
}

function findRestingY(object) {
    const clone = object.clone();
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    let y = pallet.position.y + pallet.geometry.parameters.height / 2 + size.y / 2;
    const maxY = container.position.y + container.geometry.parameters.height / 2 - size.y / 2;
    while (y <= maxY) {
        clone.position.y = y;
        if (!isOverlapping(clone, object)) {
            return y;
        }
        y += 0.5;
    }
    return object.position.y;
}

function applyColorToMaterial(color) {
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(normalizeColor(color)) });
}

function placeInsideContainer(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3(); box.getSize(size);
  const containerBox = new THREE.Box3().setFromObject(container);
  const padding = 0.03;      // 盡量貼齊但避免相交
  //const step = Math.max(0.25, Math.min(size.x, size.z) / 4); // 隨尺寸調整步距
  const grid = mesh.userData?.unit || null;
  const step = grid ? grid : Math.max(0.25, Math.min(size.x, size.z) / 4);
  const snap = (v, g) => g ? Math.round(v / g) * g : v;
  const leftX = containerBox.min.x + size.x / 2 + padding;
  const rightX = containerBox.max.x - size.x / 2 - padding;
  const backZ = containerBox.min.z + size.z / 2 + padding;
  const frontZ = containerBox.max.z - size.z / 2 - padding;

  // 先靠最左後角開始掃描，盡量靠邊放置
  for (let x = leftX; x <= rightX; x += step) {
    for (let z = backZ; z <= frontZ; z += step) {
      let y = pallet.position.y + pallet.geometry.parameters.height / 2 + size.y / 2 + padding;
      const maxY = containerBox.max.y - size.y / 2 - padding;
      while (y <= maxY) {
        //mesh.position.set(x, y, z);
        mesh.position.set(snap(x, grid), y, snap(z, grid));
        mesh.position.y = findRestingY(mesh);
        if (!isOverlapping(mesh)) {
          scene.add(mesh);
          objects.push(mesh);
          return true;
        }
        y += 0.5;
      }
    }
  }
  return false;
}

function createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight) {
    const material = applyColorToMaterial(color);
    let mesh;
    if (TETROMINO_TYPES.has(type)) {
        const unit = Number.isFinite(+width) ? +width : 20;
        mesh = buildTetrominoMesh(type, unit, material);
    } else if (type === 'cube') {
        const outer = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        if (hasHole) {
            const inner = new THREE.Mesh(new THREE.BoxGeometry(holeWidth, holeHeight, depth + 2), material);
            outer.updateMatrix();
            inner.updateMatrix();
            try{
                const result = CSG.subtract(outer, inner);
                result.geometry.computeVertexNormals();
                result.material = material;
                mesh = result;
            }catch(err){
                console.error('CSG subtraction failed:',err);
                mesh = outer;
            } 
        } else {
            mesh = outer;
        }
    }else if (type === 'circle') {
        const outer = new THREE.Mesh(new THREE.SphereGeometry(width / 2, 32, 32), material);
        if (hasHole) {
            const inner = new THREE.Mesh(new THREE.SphereGeometry(holeWidth / 2, 32, 32),material);
            outer.updateMatrix();
            inner.updateMatrix();
            try{
                const result = CSG.subtract(outer, inner);
                result.geometry.computeVertexNormals();
                result.material = material;
                mesh = result;
            }catch(err){
                console.error('CSG subtraction failed:',err);
                mesh = outer;
            }  
        } else {
            mesh = outer;
        }
    } else if (type === 'lshape') {
        const EPS = 0.02;
        const seatT   = Math.max(2, height * 0.22);       // 座面厚度
        const longLen = Math.max(6, width  * 0.95);       // 往右的長座長度 (X+)
        const longD   = Math.max(6, depth  * 0.30);       // 長座的前後厚度 (Z)
        const shortW  = Math.max(6, width  * 0.50);       // 往前的短座寬度 (X)
        const shortLen= Math.max(6, depth  * 0.55);       // 短座長度 (Z+)

        const colW = Math.max(6, width  * 0.34);          // 椅背寬 (X)
        const colD = Math.max(6, depth  * 0.42);          // 椅背厚 (Z)
        const colH = Math.max(8, height - seatT);         // 椅背高 (由座面向上)

        // 以群組中心為幾何中心，底面位於 y = -height/2
        const y0 = -height / 2;

        // 椅背：放在座面交會處左側一點，視覺更像圖片
        const back = new THREE.Mesh(new THREE.BoxGeometry(colW, colH, colD), material);
        back.position.set(0, y0 + seatT + colH / 2, 0);

        // 往右的「長座」：從椅背右側向 +X 伸出
        const seatRight = new THREE.Mesh(new THREE.BoxGeometry(longLen, seatT, longD), material);
        seatRight.position.set(back.position.x + colW / 2 + longLen / 2 - EPS, y0 + seatT / 2, 0);

        // 往前的「短座」：從椅背前側向 +Z 伸出（略窄）
        const seatFront = new THREE.Mesh(new THREE.BoxGeometry(shortW, seatT, shortLen), material);
        seatFront.position.set(back.position.x, y0 + seatT / 2, back.position.z + colD / 2 + shortLen / 2 - EPS);

        try {
            let combined = CSG.union(back, seatRight);
            combined = CSG.union(combined, seatFront);
            combined.geometry.computeVertexNormals();
            combined.material = material;

            // （選用）在座面挖孔
            if (hasHole) {
                const holeBox = new THREE.Mesh(
                    new THREE.BoxGeometry(
                        Math.min(holeWidth  || shortW * 0.6, shortW * 0.9),
                        Math.min(holeHeight || seatT  * 0.8, seatT  * 0.95),
                        Math.min(longD * 0.85, longD - 1)
                    ),
                    material
                );
                // 孔放在右側長座中央偏靠立柱
                holeBox.position.set(
                    seatRight.position.x - longLen * 0.25,
                    seatRight.position.y,
                    seatRight.position.z
                );
                combined = CSG.subtract(combined, holeBox);
                combined.geometry.computeVertexNormals();
                combined.material = material;
            }
                mesh = combined;
        } catch (err) {
            console.warn('CSG 合併失敗，退回群組（仍含 EPS 重疊防縫）：', err);
            const group = new THREE.Group();
            group.add(back, seatRight, seatFront);
            mesh = group;
        }
    } else {
        // fallback
        mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    }
    if (!placeInsideContainer(mesh)) {
        console.warn('⚠️ 容器已滿或放置失敗');
    }
    mesh.userData.type = 'custom';
    mesh.userData.originalY = mesh.position.y;
}
/*     const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const containerBox = new THREE.Box3().setFromObject(container);
    const padding = 0.0; 
    const step = 0.25;
    const leftX = containerBox.min.x + size.x / 2;
    const backZ = containerBox.min.z + size.z / 2;
    mesh.position.set(leftX, 0, backZ);
    const deltaY = pallet.position.y + pallet.geometry.parameters.height / 2 - box.min.y;
    mesh.position.y += deltaY;

    mesh.userData.type = 'custom';
    mesh.userData.originalY = mesh.position.y;
    let placed = false;

    for (let x = containerBox.min.x + size.x / 2 + padding; x <= containerBox.max.x - size.x / 2 - padding; x += step) {
        for (let z = containerBox.min.z + size.z / 2 + padding; z <= containerBox.max.z - size.z / 2 - padding; z += step) {
            let y = pallet.position.y + pallet.geometry.parameters.height / 2 + size.y / 2;
            const maxY = containerBox.max.y - size.y / 2 - padding;
            while (y <= maxY) {
                mesh.position.set(x, y, z);
                mesh.position.y = findRestingY(mesh);
                if (!isOverlapping(mesh)) {
                    mesh.userData.type = 'custom';
                    mesh.userData.originalY = y;
                    scene.add(mesh);
                    objects.push(mesh);
                    placed = true;
                    break;
                }
                y += 0.5;
            }
            if (placed) break;
        }
        if (placed) break;
    }
} */

let isDragging = false;
let currentTarget = null;
let offset = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const planeIntersect = new THREE.Vector3();
let spaceDown = false;
let lastMouseY = 0;
let isRotating = false;
const rotateStart = new THREE.Vector2();
const initialRot = new THREE.Euler();

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(objects, true);
    if (intersects.length === 0 ) {
        if (event.button === 0 && !event.shiftKey) {
            selectedObj = null;
            showSelection(null);
        }
        return;
    }
    currentTarget = intersects[0].object;
    while (currentTarget.parent && !currentTarget.userData.type) {
        currentTarget = currentTarget.parent;
    }
    selectedObj = currentTarget;
    showSelection(selectedObj);

    if (event.button === 0 && event.shiftKey && selectedObj) {
        isRotating = true;
        rotateStart.set(event.clientX, event.clientY);
        initialRot.copy(selectedObj.rotation);
        controls.enabled = false;
        return;
    } 

    if (event.button === 0) {
        const jumpHeight = 10;
        const originalY = findRestingY(currentTarget);
        const jumpUp = new TWEEN.Tween(currentTarget.position)
            .to({ y: originalY + jumpHeight }, 150)
            .easing(TWEEN.Easing.Quadratic.Out);

        const fallDown = new TWEEN.Tween(currentTarget.position)
            .to({ y: originalY }, 300)
            .easing(TWEEN.Easing.Bounce.Out);
        jumpUp.chain(fallDown).start();
    }

    if (event.button === 2) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        raycaster.ray.intersectPlane(plane, planeIntersect);
        offset.copy(planeIntersect).sub(currentTarget.position);
        isDragging = true;
        lastMouseY = event.clientY;        
    }
});

renderer.domElement.addEventListener('mouseup', () => {
    isDragging = false;
    currentTarget = null;
    if (isRotating) {
        isRotating = false;
        controls.enabled = true;
    }
});

renderer.domElement.addEventListener('mousemove',(event) =>{
    if (isRotating && selectedObj) {
        const dx = event.clientX - rotateStart.x;
        const dy = event.clientY - rotateStart.y;
        selectedObj.rotation.y = initialRot.y + dx * 0.01;
        selectedObj.rotation.x = THREE.MathUtils.clamp(initialRot.x + dy * 0.01, -Math.PI/2, Math.PI/2);
        if (selectionHelper) selectionHelper.update();
        return;
    }
    if (!isDragging || !currentTarget) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const containerBox = new THREE.Box3().setFromObject(container);
    const targetBox = new THREE.Box3().setFromObject(currentTarget);
    const targetSize = new THREE.Vector3();
    targetBox.getSize(targetSize);
    const halfSize = targetSize.clone().multiplyScalar(0.5);
    const minX = containerBox.min.x + halfSize.x;
    const maxX = containerBox.max.x - halfSize.x;
    const minZ = containerBox.min.z + halfSize.z;
    const maxZ = containerBox.max.z - halfSize.z;
    const palletTop = pallet.position.y + pallet.geometry.parameters.height / 2;
    const minY = Math.max(containerBox.min.y + halfSize.y, palletTop + halfSize.y - halfSize.y);
    const maxY = containerBox.max.y - halfSize.y;

    if (!spaceDown) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        if (raycaster.ray.intersectPlane(plane, planeIntersect)) {
            const newPos = planeIntersect.clone().sub(offset);
            newPos.x = THREE.MathUtils.clamp(newPos.x, minX, maxX);
            newPos.z = THREE.MathUtils.clamp(newPos.z, minZ, maxZ);
            const testBox = currentTarget.clone();
            testBox.position.set(newPos.x, currentTarget.position.y, newPos.z);
            if (!isOverlapping(testBox, currentTarget)) {
                currentTarget.position.set(newPos.x, currentTarget.position.y, newPos.z);
            }
        }
    } else {
        const dy = (lastMouseY - event.clientY) * 0.1; 
        let newY = THREE.MathUtils.clamp(currentTarget.position.y + dy, minY, maxY);
        const testBox = currentTarget.clone();
        testBox.position.set(currentTarget.position.x, newY, currentTarget.position.z);
        if (!isOverlapping(testBox, currentTarget)) {
            currentTarget.position.y = newY;
        }
        lastMouseY = event.clientY;
    }
});

function nudgeSelectedByArrow(code) {
    if (!isDragging || !selectedObj) return;
    const step = 0.5;
    const containerBox = new THREE.Box3().setFromObject(container);
    const sb = new THREE.Box3().setFromObject(selectedObj);
    const size = new THREE.Vector3(); sb.getSize(size);
    const half = size.clone().multiplyScalar(0.5);
    const palletTop = pallet.position.y + pallet.geometry.parameters.height / 2;
    const minX = containerBox.min.x + half.x;
    const maxX = containerBox.max.x - half.x;
    const minZ = containerBox.min.z + half.z;
    const maxZ = containerBox.max.z - half.z;
    const minY = Math.max(containerBox.min.y + half.y, palletTop + half.y - half.y);
    const maxY = containerBox.max.y - half.y;
    let nx = selectedObj.position.x;
    let ny = selectedObj.position.y;
    let nz = selectedObj.position.z;
    if (spaceDown) {
        if (code === 'ArrowUp') ny += step;
        if (code === 'ArrowDown') ny -= step;
    } else {
        if (code === 'ArrowLeft') nx -= step;
        if (code === 'ArrowRight') nx += step;
        if (code === 'ArrowUp') nz -= step;
        if (code === 'ArrowDown') nz += step;
    }
    nx = THREE.MathUtils.clamp(nx, minX, maxX);
    ny = THREE.MathUtils.clamp(ny, minY, maxY);
    nz = THREE.MathUtils.clamp(nz, minZ, maxZ);
    const test = selectedObj.clone();
    test.position.set(nx, ny, nz);
    if (!isOverlapping(test, selectedObj)) {
        selectedObj.position.set(nx, ny, nz);
    }
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { spaceDown = true; e.preventDefault(); }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) {
        nudgeSelectedByArrow(e.code);
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

renderer.domElement.addEventListener('wheel', (event) => {
    const zoomSpeed = 1.1;
    if (event.deltaY < 0) {
        camera.position.multiplyScalar(1 / zoomSpeed);
    } else {
        camera.position.multiplyScalar(zoomSpeed);
    }
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, 20, 300);
});

document.getElementById('shapeType').addEventListener('change', (e) => {
    const value = e.target.value;
    updateParamVisibility(value);
});

document.getElementById('hasHole').addEventListener('change', (e) => {
    document.getElementById('holeInput').style.display = e.target.checked ? 'block' : 'none';
});

document.getElementById('generate').addEventListener('click', () => {
    const type = document.getElementById('shapeType').value;
    const color = normalizeColor(document.getElementById('color').value);
    const hasHole = document.getElementById('hasHole').checked;
    const holeWidth = parseFloat(document.getElementById('holeWidth').value || 0);
    const holeHeight = parseFloat(document.getElementById('holeHeight').value || 0);

    let width = 20, height = 20, depth = 20;
    if (type === 'cube') {
        width = parseFloat(document.getElementById('boxWidth').value || 20);
        height = parseFloat(document.getElementById('boxHeight').value || 20);
        depth = parseFloat(document.getElementById('boxDepth').value || 20);
    } else if (type === 'circle') {
        width = parseFloat(document.getElementById('sphereWidth').value || 20);
        height = width;
        depth = width;
    } else if (type === 'lshape') {
        width = parseFloat(document.getElementById('customWidth').value || 20);
        height = parseFloat(document.getElementById('customHeight').value || 20);
        depth = parseFloat(document.getElementById('customDepth').value || 20);
    } else if (TETROMINO_TYPES.has(type)) {
        width = parseFloat(document.getElementById('boxWidth').value || 20); // 單位邊長
        height = depth = width;
    }
    createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight);
    addToLibrary({ type, width, height, depth, color, hasHole, holeWidth, holeHeight });
    clearFormFields();
});

function animate(time) {
    requestAnimationFrame( animate );
    controls.update();
    TWEEN.update(time);
    if (selectionHelper && selectedObj) selectionHelper.update();
    renderer.render( scene, camera );
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('DOMContentLoaded', () => {
    updateParamVisibility();
    ensureSceneButtons();
});

(async () => {
    const video = document.createElement('video');
    video.autoplay = true;
    video.width = 640;
    video.height = 480;
    video.style.display = 'none';
    document.body.appendChild(video);
    const recognize = await createRecognizer(video);
    document.getElementById('recognizeBtn').addEventListener('click', () => {
        recognize((result) => {
            addToLibrary(result);
            const set = (id, val) => {
                const el = document.getElementById(id);
                if (el && val !== undefined && val !== null && val !== '') {
                    el.value = val;
                    if (id === 'color') {
                        el.dispatchEvent(new Event('input'));
                    }
                }
            };
            document.getElementById('shapeType').value = result.type;
            document.getElementById('shapeType').dispatchEvent(new Event('change'));
            set("color", result.color); 
            if (TETROMINO_TYPES.has(result.type)) {
                set("boxWidth", result.width);
            } else if (result.type === "cube") {
                set("boxWidth", result.width);
                set("boxHeight", result.height);
                set("boxDepth", result.depth);
            } else if (result.type === "circle") {
                set("sphereWidth", result.width);
            } else if (result.type === "lshape") {
                set("customWidth", result.width);
                set("customHeight", result.height);
                set("customDepth", result.depth);
            }
            document.getElementById("hasHole").checked = !!result.hasHole && !TETROMINO_TYPES.has(result.type);
            if (result.hasHole && !TETROMINO_TYPES.has(result.type)) {
                set("holeWidth", result.holeWidth);
                set("holeHeight", result.holeHeight);
            } else {
                document.getElementById('holeInput').style.display = 'none';
            }
            setTimeout(() => {
                document.getElementById("generate").click();
                setTimeout(clearFormFields, 500);
            }, 100);
        });
    });
})();
renderLibrary();