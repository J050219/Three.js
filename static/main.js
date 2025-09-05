import * as THREE from 'three'; 
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as ThreeCSG from 'three-csg-ts';
import { createRecognizer } from './recognizer.js';
import * as TWEEN from '@tweenjs/tween.js';

const CSG = ThreeCSG.CSG ?? ThreeCSG.default ?? ThreeCSG;
const LIB_KEY = 'recognizedLibrary';
const UNDER_AUTOMATION = (typeof navigator !== 'undefined') && navigator.webdriver === true;
const EPS = 0.5;

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
    try { 
        arr = JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); 
        return Array.isArray(arr)?arr:[];
    } catch { 
        return [];
    }
}

const library = getLibrarySafe();

function saveLibrary() {
    try { 
        localStorage.setItem(LIB_KEY, JSON.stringify(library)); 
    }catch (e) { 
        console.warn('localStorage 寫入失敗:', e); 
    }
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

function toCSGReady(mesh) {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry;
    const gi = g.index ? g.toNonIndexed() : g.clone();
    gi.computeVertexNormals();
    const m = new THREE.Mesh(gi, mesh.material);
    m.position.copy(mesh.position);
    m.quaternion.copy(mesh.quaternion);
    m.scale.copy(mesh.scale);
    m.updateMatrix();
    return m;
}

function defaultHoleTypeByShape(type, hasHole) {
    if (!hasHole) return 'none';
    if (type === 'circle') return 'cyl'; 
    return 'box';
}

function makeHoleMesh(opts = {}) {
    const holeType = (opts.holeType || 'box').toLowerCase();
    const axis = (opts.holeAxis || 'y').toLowerCase();
    const width = Math.max(1, (opts.holeWidth || 10));
    const height = Math.max(1, (opts.holeHeight || 10));
    const depth = Math.max(1, (opts.holeDepth || 10));

    if (holeType === 'sphere') {
        const r = Math.max(1, width * 0.5) - EPS;
        const g = new THREE.SphereGeometry(r, 32, 32);
        return toCSGReady(new THREE.Mesh(g, new THREE.MeshBasicMaterial()));
    }
    if (holeType === 'cyl') {
        const r = Math.max(1, width * 0.5);
        const h = depth + 2 * EPS;
        const g = new THREE.CylinderGeometry(r, r, h, 32);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
        if (axis === 'x') m.rotation.z = Math.PI / 2;
        if (axis === 'z') m.rotation.x = Math.PI / 2;
        return toCSGReady(m);
    }
    let w = width  + 2 * EPS,
        h = height + 2 * EPS,
        d = depth  + 2 * EPS;
    if (axis === 'x') { w = depth + 2 * EPS; }
    else if (axis === 'y') { h = depth + 2 * EPS; }
    else { d = depth + 2 * EPS; }
    const g = new THREE.BoxGeometry(w, h, d);
    return toCSGReady(new THREE.Mesh(g, new THREE.MeshBasicMaterial()));
}

function addToLibrary(params) {
    const n = (v,d)=> (Number.isFinite(+v)? +v : d);
    const t = params.type || 'cube';
    const isTet = TETROMINO_TYPES.has(t);
    const hasHoleClean = isTet ? false : !!params.hasHole;
    const clean = {
        type: t,
        width:  n(params.width, 20),
        height: n(params.height, isTet ? params.width : (t === 'circle' ? params.width : 20)),
        depth:  n(params.depth,  isTet ? params.width : (t === 'circle' ? params.width : 20)),
        color:  params.color || '#00ff00',
        hasHole: hasHoleClean,
        holeWidth:  n(params.holeWidth, 10),
        holeHeight: n(params.holeHeight, 10),
        holeType: params.holeType || defaultHoleTypeByShape(t, hasHoleClean),
        holeAxis: (params.holeAxis || 'y').toLowerCase()
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
    createCube(item.type, item.width, item.height, item.depth, item.color, item.hasHole, item.holeWidth, item.holeHeight, item.holeType, item.holeAxis);
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

const stagingSize = 110;
const stagingPad = new THREE.Mesh(new THREE.BoxGeometry(stagingSize, 8, stagingSize), new THREE.MeshBasicMaterial({ color: 0x777777 }));
const containerWidth = containerGeometry.parameters.width;
stagingPad.position.set(container.position.x + containerWidth / 2 + stagingSize / 2 + 20, -5, container.position.z);
scene.add(stagingPad);

const stageFrameGeo = new THREE.BoxGeometry(stagingSize, 130, stagingSize);
const stageFrameMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent : true, opacity : 0.15, side : THREE.DoubleSide });
const stagingFrame = new THREE.Mesh(stageFrameGeo, stageFrameMat);
stagingFrame.position.set(stagingPad.position.x, stagingPad.position.y + 60, stagingPad.position.z);
stagingFrame.add(new THREE.LineSegments(
  new THREE.EdgesGeometry(stageFrameGeo),
  new THREE.LineBasicMaterial({ color: 0x00ffff })
));
scene.add(stagingFrame);

const objects = [];
let selectedObj = null;
let selectionHelper = null;
let FAST_PACKING = false;

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
    // ★ 新增「估算空隙」按鈕
if (!document.getElementById('voidBtn')) {
  const b3 = document.createElement('button');
  b3.id = 'voidBtn';
  b3.textContent = '估算空隙';
  b3.style.marginLeft = '8px';
  document.getElementById('ui')?.appendChild(b3);
  b3.addEventListener('click', showVoidStats);
}

}

addEventListener('keydown', (e) => { if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected(); });

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
    const chk = document.getElementById('hasHole');
    if (!box || !sphere || !custom || !hole) return;

    const isTet = TETROMINO_TYPES.has(type);

    box.style.display    = (type === 'cube' || isTet) ? 'block' : 'none';
    sphere.style.display = (type === 'circle') ? 'block' : 'none';
    custom.style.display = (type === 'lshape') ? 'block' : 'none';
    
    const w = document.getElementById('boxWidth');
    const h = document.getElementById('boxHeight');
    const d = document.getElementById('boxDepth');
    if (isTet) {
        if (w) { w.placeholder = '單位邊長'; w.style.display = 'block'; }
        if (h) { h.value = ''; h.style.display = 'none'; }
        if (d) { d.value = ''; d.style.display = 'none'; }
    } else if (type === 'cube') {
        if (w) w.style.display = 'block';
        if (h) h.style.display = 'block';
        if (d) d.style.display = 'block';
    }
    const canHole = !isTet;
    if (chk) chk.disabled = !canHole;
    hole.style.display = (!isTet && chk?.checked) ? 'block' : 'none';
}

function clearFormFields() {
    [
        'boxWidth','boxHeight','boxDepth',
        'sphereWidth',
        'customWidth',
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
                if (c.max.x - eps > o.min.x && c.min.x + eps < o.max.x &&
                    c.max.y - eps > o.min.y && c.min.y + eps < o.max.y &&
                    c.max.z - eps > o.min.z && c.min.z + eps < o.max.z) {
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

function getAreaByXZ(x, z) {
    const cbox = new THREE.Box3().setFromObject(container);
    if (x >= cbox.min.x && x <= cbox.max.x && z >= cbox.min.z && z <= cbox.max.z) return 'container';

    const halfW = stagingPad.geometry.parameters.width / 2;
    const halfD = stagingPad.geometry.parameters.depth / 2;
    const sxmin = stagingPad.position.x - halfW, sxmax = stagingPad.position.x + halfW;
    const szmin = stagingPad.position.z - halfD, szmax = stagingPad.position.z + halfD;
    if (x >= sxmin && x <= sxmax && z >= szmin && z <= szmax) return 'staging';

    return null;
}

function getBoundsForArea(area, half) {
    if (area === 'container') {
        const cb = new THREE.Box3().setFromObject(container);
        const palletTop = pallet.position.y + pallet.geometry.parameters.height / 2;
        return {
        minX: cb.min.x + half.x, maxX: cb.max.x - half.x,
        minZ: cb.min.z + half.z, maxZ: cb.max.z - half.z,
        minY: palletTop + half.y, maxY: cb.max.y - half.y,
        baseY: palletTop
        };
    } else if (area === 'staging') {
        const halfW = stagingPad.geometry.parameters.width / 2;
        const halfD = stagingPad.geometry.parameters.depth / 2;
        const baseY = stagingPad.position.y + stagingPad.geometry.parameters.height / 2;
        return {
        minX: stagingPad.position.x - halfW + half.x,
        maxX: stagingPad.position.x + halfW - half.x,
        minZ: stagingPad.position.z - halfD + half.z,
        maxZ: stagingPad.position.z + halfD - half.z,
        minY: baseY + half.y,
        maxY: baseY + 200 - half.y, 
        baseY
        };
    }
    const baseY = pallet.position.y + pallet.geometry.parameters.height / 2;
    return { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity, minY: baseY + half.y, maxY: baseY + 200 - half.y, baseY };
}

function findRestingYForArea(object, area, half) {
    const { baseY, maxY } = getBoundsForArea(area, half);
    const clone = object.clone();
    let y = baseY + half.y;
    while (y <= maxY) {
        clone.position.set(object.position.x, y, object.position.z);
        if (!isOverlapping(clone, object)) return y;
        y += 0.5;
    }
    return object.position.y;
}

/* =====================  模擬退火擺放最佳化  ===================== */

// 估算精度：每軸的體素數（越大越準但越慢）
const VOXEL_RES = 16;

// 能量權重：可自行調整
const ENERGY_W_EMPTY     = 1.0;  // 空隙比例
const ENERGY_W_FRAGMENT  = 0.35; // 空隙破碎度（1 - 最大連通空隙比例）

function uiToast(msg, ms = 1400) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div'); el.id = 'toast';
        Object.assign(el.style, {
        position:'fixed', left:'12px', bottom:'12px', padding:'8px 12px',
        background:'rgba(0,0,0,.75)', color:'#fff', borderRadius:'8px',
        zIndex:9999, fontFamily:'system-ui, sans-serif'
        });
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._h); el._h = setTimeout(()=> el.style.display='none', ms);
}
// ★ 空隙估算（以體素化 + 物體 AABB 近似）
function measureVoidInContainer() {
  const cb = new THREE.Box3().setFromObject(container);
  const palletTop = pallet.position.y + pallet.geometry.parameters.height / 2;

  // 容器有效空間：棧板上表面 → 容器頂
  const min = new THREE.Vector3(cb.min.x, palletTop, cb.min.z);
  const max = new THREE.Vector3(cb.max.x, cb.max.y, cb.max.z);

  const nx = VOXEL_RES, ny = VOXEL_RES, nz = VOXEL_RES;
  const dx = (max.x - min.x) / nx;
  const dy = (max.y - min.y) / ny;
  const dz = (max.z - min.z) / nz;
  const total = nx * ny * nz;
  const voxelVolume = dx * dy * dz;

  // 先用每個物體的 AABB（Box3）近似是否佔用
  const boxes = objects.map(o => new THREE.Box3().setFromObject(o));

  const p = new THREE.Vector3();
  let emptyCount = 0, occCount = 0;

  for (let j = 0; j < ny; j++) {
    const y = min.y + (j + 0.5) * dy;
    for (let k = 0; k < nz; k++) {
      const z = min.z + (k + 0.5) * dz;
      for (let i = 0; i < nx; i++) {
        const x = min.x + (i + 0.5) * dx;
        p.set(x, y, z);

        let occ = false;
        for (let b = 0; b < boxes.length && !occ; b++) {
          if (boxes[b].containsPoint(p)) occ = true;
        }
        if (occ) occCount++; else emptyCount++;
      }
    }
  }

  const emptyVolume  = emptyCount * voxelVolume;
  const containerVolume = (max.x - min.x) * (max.y - min.y) * (max.z - min.z);
  const emptyRatio   = emptyVolume / containerVolume;

  return { emptyVolume, emptyRatio, containerVolume, voxelsEmpty: emptyCount, voxelsTotal: total };
}

function packingEnergy() {
    if (objects.length === 0) return 0;

    const cb = new THREE.Box3().setFromObject(container);
    const palletTop = pallet.position.y + pallet.geometry.parameters.height / 2;

    const min = new THREE.Vector3(cb.min.x, palletTop, cb.min.z);
  const max = new THREE.Vector3(cb.max.x, cb.max.y, cb.max.z);

  // 體素網格大小
  const nx = VOXEL_RES, ny = VOXEL_RES, nz = VOXEL_RES;
  const dx = (max.x - min.x) / nx;
  const dy = (max.y - min.y) / ny;
  const dz = (max.z - min.z) / nz;
  const total = nx * ny * nz;

  if (total <= 0) return 0;

  // 以物體的 AABB 近似佔用（速度快；若要更準可改成射線/點內測試）
  const boxes = objects.map(o => new THREE.Box3().setFromObject(o));

  const grid = new Uint8Array(total);   // 1 = 佔用；0 = 空
  const p = new THREE.Vector3();
  let emptyCount = 0;

  // 取 index 對應
  const toIndex = (i, j, k) => (j * nz + k) * nx + i;

  // 掃描體素
  for (let j = 0; j < ny; j++) {
    const y = min.y + (j + 0.5) * dy;
    for (let k = 0; k < nz; k++) {
      const z = min.z + (k + 0.5) * dz;
      for (let i = 0; i < nx; i++) {
        const x = min.x + (i + 0.5) * dx;
        p.set(x, y, z);

        let occ = false;
        // 任何一個物體的包圍盒含住該點就視為佔用（快速近似）
        for (let b = 0; b < boxes.length && !occ; b++) {
          if (boxes[b].containsPoint(p)) occ = true;
        }
        const id = toIndex(i, j, k);
        grid[id] = occ ? 1 : 0;
        if (!occ) emptyCount++;
      }
    }
  }

  if (emptyCount === 0) return 0; // 沒空隙 = 最佳

  // ---- 找最大連通空隙（6-鄰接）----
  const visited = new Uint8Array(total);
  const q = new Uint32Array(total);
  let largest = 0;

  for (let j = 0; j < ny; j++) {
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const start = toIndex(i, j, k);
        if (grid[start] !== 0 || visited[start]) continue;

        // BFS
        let head = 0, tail = 0, size = 0;
        visited[start] = 1;
        q[tail++] = start;

        while (head < tail) {
          const cur = q[head++]; size++;

          const ii = cur % nx;
          const jk = (cur - ii) / nx;
          const kk = jk % nz;
          const jj = (jk - kk) / nz;

          // 6-neighbors
          // x-1
          if (ii > 0) {
            const nid = cur - 1;
            if (!visited[nid] && grid[nid] === 0) { visited[nid] = 1; q[tail++] = nid; }
          }
          // x+1
          if (ii < nx - 1) {
            const nid = cur + 1;
            if (!visited[nid] && grid[nid] === 0) { visited[nid] = 1; q[tail++] = nid; }
          }
          // z-1
          if (kk > 0) {
            const nid = cur - nx;
            if (!visited[nid] && grid[nid] === 0) { visited[nid] = 1; q[tail++] = nid; }
          }
          // z+1
          if (kk < nz - 1) {
            const nid = cur + nx;
            if (!visited[nid] && grid[nid] === 0) { visited[nid] = 1; q[tail++] = nid; }
          }
          // y-1
          if (jj > 0) {
            const nid = cur - nx * nz;
            if (!visited[nid] && grid[nid] === 0) { visited[nid] = 1; q[tail++] = nid; }
          }
          // y+1
          if (jj < ny - 1) {
            const nid = cur + nx * nz;
            if (!visited[nid] && grid[nid] === 0) { visited[nid] = 1; q[tail++] = nid; }
          }
        }
        if (size > largest) largest = size;
      }
    }
  }

  const emptyRatio = emptyCount / total;           // 空隙比例（越小越好）
  const largestVoidRatio = largest / emptyCount;   // 最大連通空隙占比（越大越好）

  // 綜合能量（越小越佳）
  return ENERGY_W_EMPTY * emptyRatio +
         ENERGY_W_FRAGMENT * (1 - largestVoidRatio);
    /* // 場景中所有物體的包圍盒
    const unionBox = new THREE.Box3();
    for (const o of objects) unionBox.expandByObject(o);

    const usedH  = Math.max(0, unionBox.max.y - palletTop);
    const totalH = cb.max.y - palletTop;

    const spanX  = Math.max(0, unionBox.max.x - unionBox.min.x);
    const spanZ  = Math.max(0, unionBox.max.z - unionBox.min.z);
    const totalX = cb.max.x - cb.min.x;
    const totalZ = cb.max.z - cb.min.z;

    const hTerm = totalH > 0 ? (usedH / totalH) : 0;
    const xTerm = totalX > 0 ? (spanX / totalX) : 0;
    const zTerm = totalZ > 0 ? (spanZ / totalZ) : 0;

    // 權重可依需求微調
    return 2.0 * hTerm + 1.0 * xTerm + 1.0 * zTerm; */
}

// ★ 用 toast/console 輸出空隙資訊
function showVoidStats() {
  const s = measureVoidInContainer();
  const msg = `空隙體積 ≈ ${s.emptyVolume.toFixed(2)}（約 ${(s.emptyRatio*100).toFixed(1)}%）`;
  console.log('[空隙統計]', s, msg);
  if (typeof uiToast === 'function') uiToast(msg, 2000);
}

function snapshotState() {
    return objects.map(o => ({
        obj: o,
        pos: o.position.clone(),
        rot: o.rotation.clone(),
    }));
}
function restoreState(snap) {
    snap.forEach(s => { s.obj.position.copy(s.pos); s.obj.rotation.copy(s.rot); });
}

function boundsForObjectXZ(obj) {
    const cb = new THREE.Box3().setFromObject(container);
    const b  = new THREE.Box3().setFromObject(obj);
    const sz = new THREE.Vector3(); b.getSize(sz);
    const halfX = sz.x * 0.5, halfZ = sz.z * 0.5;

    return {
        minX: cb.min.x + halfX,
        maxX: cb.max.x - halfX,
        minZ: cb.min.z + halfZ,
        maxZ: cb.max.z - halfZ,
    };
}

function tryPerturbOne(obj, linStep, angStep) {
    const before = { pos: obj.position.clone(), rot: obj.rotation.clone() };
    const mode = Math.random();
    
    //const jitter = (v) => v + (Math.random() < 0.5 ? -1 : 1) * linStep;
    // ===== A. 平移擾動 =====
  if (mode < 0.45) {
    const jitter = (v) => v + (Math.random() < 0.5 ? -1 : 1) * linStep;

    const bounds0 = boundsForObjectXZ(obj);
    let nx = THREE.MathUtils.clamp(jitter(obj.position.x), bounds0.minX, bounds0.maxX);
    let nz = THREE.MathUtils.clamp(jitter(obj.position.z), bounds0.minZ, bounds0.maxZ);

    // 真的沒動就再給一次隨機
    if (Math.abs(nx - obj.position.x) < 1e-6 && Math.abs(nz - obj.position.z) < 1e-6) {
      nx = THREE.MathUtils.clamp(obj.position.x + (Math.random()<0.5?-1:1)*linStep, bounds0.minX, bounds0.maxX);
      nz = THREE.MathUtils.clamp(obj.position.z + (Math.random()<0.5?-1:1)*linStep, bounds0.minZ, bounds0.maxZ);
    }
    obj.position.x = nx;
    obj.position.z = nz;

  // ===== B. 旋轉擾動 =====
  } else {
    // 50% 用 90° 快速轉向；50% 用小角度微調（更精細）
    const snap = Math.random() < 0.5;

    if (snap) {
      const axis = Math.floor(Math.random() * 3);            // 0:x, 1:y, 2:z
      const delta = (Math.random() < 0.5 ? 1 : -1) * Math.PI/2;
      if (axis === 0) obj.rotation.x += delta;
      if (axis === 1) obj.rotation.y += delta;
      if (axis === 2) obj.rotation.z += delta;
    } else {
      // 小角度三軸同時微調（±angStep）
      const r = () => (Math.random() * 2 - 1) * angStep;
      obj.rotation.x += r();
      obj.rotation.y += r();
      obj.rotation.z += r();
    }

    // 旋轉後幾何外接盒改變，x/z 位置可能需要夾回容器
    const b = boundsForObjectXZ(obj);
    obj.position.x = THREE.MathUtils.clamp(obj.position.x, b.minX, b.maxX);
    obj.position.z = THREE.MathUtils.clamp(obj.position.z, b.minZ, b.maxZ);
  }

  // 每次變動後都讓物體落在當前可安置的最低點
  obj.position.y = findRestingY(obj);

  // 邊界/碰撞檢查，不合法就復原
  const bounds1 = boundsForObjectXZ(obj);
  const inside =
    obj.position.x >= bounds1.minX - 1e-3 && obj.position.x <= bounds1.maxX + 1e-3 &&
    obj.position.z >= bounds1.minZ - 1e-3 && obj.position.z <= bounds1.maxZ + 1e-3;

  if (!inside || isOverlapping(obj, obj)) {
    obj.position.copy(before.pos);
    obj.rotation.copy(before.rot);
    return { applied: false };
  }

  // 可被退回的 undo
  return {
    applied: true,
    undo: () => {
      obj.position.copy(before.pos);
      obj.rotation.copy(before.rot);
    }
  };
}    

// 在 0, 90, 180, 270 三軸離散角度中找最緊密的朝向
function tryBestAxisOrientation(obj) {
  const beforePos = obj.position.clone();
  const beforeRot = obj.rotation.clone();

  const angles = [0, Math.PI/2, Math.PI, 3*Math.PI/2];
  let best = { energy: Infinity, rot: beforeRot.clone(), pos: beforePos.clone() };

  // 先算基準能量
  const eBase = packingEnergy();

  for (const ax of angles) {
    for (const ay of angles) {
      for (const az of angles) {
        obj.rotation.set(ax, ay, az);

        // 旋轉後 AABB 變了，夾回容器 + 重新落地
        const b = boundsForObjectXZ(obj);
        obj.position.x = THREE.MathUtils.clamp(obj.position.x, b.minX, b.maxX);
        obj.position.z = THREE.MathUtils.clamp(obj.position.z, b.minZ, b.maxZ);
        obj.position.y = findRestingY(obj);

        if (isOverlapping(obj, obj)) continue;

        const e = packingEnergy();
        if (e < best.energy) {
          best.energy = e;
          best.rot.copy(obj.rotation);
          best.pos.copy(obj.position);
        }
      }
    }
  }

  // 有更好就採用；否則復原
  if (best.energy + 1e-9 < eBase) {
    obj.rotation.copy(best.rot);
    obj.position.copy(best.pos);
    return true;
  } else {
    obj.rotation.copy(beforeRot);
    obj.position.copy(beforePos);
    return false;
  }
}

// 讓所有物體依序下墜，並沿 ±X/±Z 小步搜，找到更小能量就前進
function globalCompaction(passes = 2) {
  const stepFor = (o) => Math.max(0.5, o.userData?.unit || 2);

  for (let t = 0; t < passes; t++) {
    // 隨機順序比較不容易卡住
    const order = objects.slice().sort(() => Math.random() - 0.5);

    for (const o of order) {
      // 先確實落地
      o.position.y = findRestingY(o);

      let improved = true;
      while (improved) {
        improved = false;
        const e0 = packingEnergy();
        const s  = stepFor(o);
        const b  = boundsForObjectXZ(o);

        const tryMove = (dx, dz) => {
          const old = o.position.clone();
          o.position.x = THREE.MathUtils.clamp(o.position.x + dx * s, b.minX, b.maxX);
          o.position.z = THREE.MathUtils.clamp(o.position.z + dz * s, b.minZ, b.maxZ);
          o.position.y = findRestingY(o);

          if (!isOverlapping(o, o)) {
            const e1 = packingEnergy();
            if (e1 < e0 - 1e-6) { improved = true; return true; }
          }
          o.position.copy(old);
          return false;
        };

        // 4 方向各試一次；一旦成功就再進下一輪 while
        tryMove( 1, 0) || tryMove(-1, 0) || tryMove(0,  1) || tryMove(0, -1);
      }
    }
  }
}

let annealRunning = false;

async function runAnnealing(opts = {}) {
    if (objects.length === 0) { uiToast('目前沒有物體可最佳化'); return; }
    if (annealRunning) { uiToast('最佳化已在進行中'); return; }

    const steps    = opts.steps    ?? 10000;
    const initTemp = opts.initTemp ?? 2.2;
    const cooling  = opts.cooling  ?? 0.997;
    const baseStep = opts.baseStep ?? 4; 
    const baseAngle = opts.baseAngle ?? (Math.PI / 18);   // 角度步長（預設 10°）

    annealRunning = true;
    uiToast('開始最佳化擺放');
    let bestSnap   = snapshotState();
    let bestEnergy = packingEnergy();
    let T = initTemp;
    for (let s = 0; s < steps && annealRunning; s++) {
        const obj = objects[Math.floor(Math.random() * objects.length)];
        const step = obj.userData?.unit || baseStep;

        const e0 = packingEnergy();
        let trial = { applied:false };

        for (let k = 0; k < 60 && !trial.applied; k++) trial = tryPerturbOne(obj, step, baseAngle);
        if (!trial.applied) { T *= cooling; if (s % 50 === 0) await new Promise(r=>requestAnimationFrame(r)); continue; }

        const e1 = packingEnergy();
        const dE = e1 - e0;
        const accept = (dE <= 0) || (Math.random() < Math.exp(-dE / T));
        if (accept) {
            if (e1 < bestEnergy) { bestEnergy = e1; bestSnap = snapshotState(); }
            if (Math.random() < 0.25) {
                tryBestAxisOrientation(obj);
            }
            // 週期性全域壓實（讓物體持續下沉、靠牆）
            if (s % 300 === 0) {
                globalCompaction(1);
            }
        } else {
            trial.undo && trial.undo();
        }
        T *= cooling;
        if (s % 50 === 0) await new Promise(r=>requestAnimationFrame(r));
    }

    if (annealRunning) {
        restoreState(bestSnap);
        globalCompaction(2);     // 最後收斂一下
        showVoidStats && showVoidStats(); // 顯示剩餘空隙
        uiToast('最佳化完成！');
    } else {
        uiToast('已停止最佳化');
    }
    annealRunning = false;
}

document.getElementById('optimizeBtn')?.addEventListener('click', () => {
    runAnnealing({ steps: 8000, initTemp: 2.2, cooling: 0.996, baseStep: 5, baseAngle: Math.PI/12 });
});

document.getElementById('stopOptimizeBtn')?.addEventListener('click', () => {
    annealRunning = false;
});

function applyColorToMaterial(color) {
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(normalizeColor(color)) });
}

function placeInsideContainer(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3(); box.getSize(size);
    const containerBox = new THREE.Box3().setFromObject(container);
    const padding = 0.03;    
    const grid = mesh.userData?.unit || null;
    const step = grid ? grid : Math.max(0.25, Math.min(size.x, size.z) / 4);
    const snap = (v, g) => g ? Math.round(v / g) * g : v;
    const leftX = containerBox.min.x + size.x / 2 + padding;
    const rightX = containerBox.max.x - size.x / 2 - padding;
    const backZ = containerBox.min.z + size.z / 2 + padding;
    const frontZ = containerBox.max.z - size.z / 2 - padding;

    for (let x = leftX; x <= rightX; x += step) {
        for (let z = backZ; z <= frontZ; z += step) {
        let y = pallet.position.y + pallet.geometry.parameters.height / 2 + size.y / 2 + padding;
        const maxY = containerBox.max.y - size.y / 2 - padding;
        while (y <= maxY) {
            mesh.position.set(snap(x, grid), y, snap(z, grid));
            mesh.position.y = findRestingY(mesh);
            if (!isOverlapping(mesh)) {
            scene.add(mesh);
            objects.push(mesh);
            tryBestAxisOrientation(mesh);
            globalCompaction(1);
            return true;
            }
            y += 0.5;
        }
        }
    }
    return false;
}

function createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight, holeType = 'auto', holeAxis = 'y') {
    const material = applyColorToMaterial(color);
    let mesh;
    if (TETROMINO_TYPES.has(type)) {
        const unit = Number.isFinite(+width) ? +width : 20;
        mesh = buildTetrominoMesh(type, unit, material);
    } else if (type === 'cube') {
        const outer0 = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        const outer  = toCSGReady(outer0);
        if (hasHole) {
            const hole = makeHoleMesh ({
                holeType : (holeType && holeType !== 'auto') ? holeType : 'box',
                holeAxis, 
                holeWidth, 
                holeHeight, 
                holeDepth: Math.max(width, height, depth) + 20
            });
            hole.position.copy(outer.position);
            try{
                const result = CSG.subtract(outer, hole);
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
        const R = Math.max(1, width * 0.5);
        let outer = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 48), material);
        outer = toCSGReady(outer);
        if (hasHole) {
            const r = Math.max(0.5, (holeWidth || R * 0.5) * 0.5);
            const h = width + 4; 
            let hole = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), material);
            hole.position.copy(outer.position);
            hole = toCSGReady(hole);
            try{
                const result = CSG.subtract(outer, hole);
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
        const edge = Math.max(1, width); 
        const unitGeo = new THREE.BoxGeometry(edge, edge, edge); 
        const coords = [ [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], ]; 
        const make = (ix, iy, iz) => { 
            const m = new THREE.Mesh(unitGeo.clone(), material); 
            m.position.set(ix * edge, iy * edge, iz * edge); 
            return toCSGReady(m); 
        }; 
        let combined = make(...coords[0]); 
        for (let i = 1; i < coords.length; i++) { 
            combined = CSG.union(combined, make(...coords[i])); 
        } 
        combined.geometry.computeVertexNormals(); 
        combined.material = material; 
        combined.geometry.computeBoundingBox(); 
        const c = combined.geometry.boundingBox.getCenter(new THREE.Vector3()); 
        combined.geometry.translate(-c.x, -c.y, -c.z); 
        if (hasHole) { 
            const size = new THREE.Vector3(); 
            combined.geometry.boundingBox.getSize(size); 
            const hw = Math.min(holeWidth || edge * 0.8, edge * 2.2); 
            const hh = Math.min(holeHeight || edge * 0.8, edge * 1.8); 
            const hd = size.z + 2; 
            const hole = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hd), new THREE.MeshBasicMaterial()); 
            hole.position.set(-edge * 0.25, -edge * 0.25, 0); 
            try { 
                const sub = CSG.subtract(toCSGReady(combined), toCSGReady(hole)); 
                sub.geometry.computeVertexNormals(); 
                sub.material = material; 
                combined = sub; 
            } catch (err) { 
                console.warn('CSG 挖孔失敗，退回未挖孔圖形：', err); 
            } 
        } 
        mesh = combined;
    } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    }
    if (!placeInsideContainer(mesh)) {
        console.warn('⚠️ 容器已滿或放置失敗');
    }
    mesh.userData.type = 'custom';
    mesh.userData.originalY = mesh.position.y;
}

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

function liftOutOfOverlap(obj) {
    const sb = new THREE.Box3().setFromObject(obj);
    const s  = new THREE.Vector3(); sb.getSize(s);
    const half = s.clone().multiplyScalar(0.5);

    const area = getAreaByXZ(obj.position.x, obj.position.z) || 'container';
    const b = getBoundsForArea(area, half);

    const probe = obj.clone();
    let y = THREE.MathUtils.clamp(obj.position.y, b.minY, b.maxY);
    probe.position.set(obj.position.x, y, obj.position.z);

    let guard = 0;
    while (isOverlapping(probe, obj) && y <= b.maxY) {
        y += 0.5;
        probe.position.y = y;
        if (++guard > 2000) break;
    }
    return y;
}

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
        const targBox = new THREE.Box3().setFromObject(currentTarget);
        const tsize = new THREE.Vector3(); targBox.getSize(tsize);
        const half = tsize.clone().multiplyScalar(0.5);
        const areaNow = getAreaByXZ(currentTarget.position.x, currentTarget.position.z) || 'container';
        const originalY = findRestingYForArea(currentTarget, areaNow, half);

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
    if (selectedObj) {
        const sb = new THREE.Box3().setFromObject(selectedObj);
        const s = new THREE.Vector3();
        sb.getSize(s);
        const half = s.clone().multiplyScalar(0.5);
        const area = getAreaByXZ(selectedObj.position.x, selectedObj.position.z) || 'container';
        if (!spaceDown) {
            selectedObj.position.y = findRestingYForArea(selectedObj, area, half);
        } else {
            selectedObj.position.y = liftOutOfOverlap(selectedObj);
        }
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
    const targetBox = new THREE.Box3().setFromObject(currentTarget);
    const targetSize = new THREE.Vector3();
    targetBox.getSize(targetSize);
    const halfSize = targetSize.clone().multiplyScalar(0.5);
    if (!spaceDown) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        if (raycaster.ray.intersectPlane(plane, planeIntersect)) {
            const newPos = planeIntersect.clone().sub(offset);
            const area = getAreaByXZ(newPos.x, newPos.z) || getAreaByXZ(currentTarget.position.x, currentTarget.position.z) || 'container';
            const b = getBoundsForArea(area, halfSize);
            newPos.x = THREE.MathUtils.clamp(newPos.x, b.minX, b.maxX);
            newPos.z = THREE.MathUtils.clamp(newPos.z, b.minZ, b.maxZ);
            const testBox = currentTarget.clone();
            testBox.position.set(newPos.x, currentTarget.position.y, newPos.z);
            if (!isOverlapping(testBox, currentTarget)) {
                currentTarget.position.set(newPos.x, currentTarget.position.y, newPos.z);
            }
        }
    } else {
        const area = getAreaByXZ(currentTarget.position.x, currentTarget.position.z) || 'container';
        const targetBox = new THREE.Box3().setFromObject(currentTarget);
        const targetSize = new THREE.Vector3(); targetBox.getSize(targetSize);
        const halfSize = targetSize.clone().multiplyScalar(0.5);
        const b = getBoundsForArea(area, halfSize);
        const dy = (lastMouseY - event.clientY) * 0.1;
        let newY = THREE.MathUtils.clamp(currentTarget.position.y + dy, b.minY, b.maxY);
        currentTarget.position.y = newY;
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
    const area = getAreaByXZ(selectedObj.position.x, selectedObj.position.z) || 'container';
    const b = getBoundsForArea(area, half);
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
    nx = THREE.MathUtils.clamp(nx, b.minX, b.maxX);
    ny = THREE.MathUtils.clamp(ny, b.minY, b.maxY);
    nz = THREE.MathUtils.clamp(nz, b.minZ, b.maxZ);
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
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const step = (event.deltaY < 0 ? -1 : 1) * 5;
    camera.position.addScaledVector(dir, step * zoomSpeed);
});

document.getElementById('shapeType').addEventListener('change', (e) => {
    const value = e.target.value;
    updateParamVisibility(value);
});

document.getElementById('hasHole').addEventListener('change', (e) => {
    updateParamVisibility();
});

document.getElementById('generate').addEventListener('click', () => {
    const type = document.getElementById('shapeType').value;
    const color = normalizeColor(document.getElementById('color').value);
    const hasHole = document.getElementById('hasHole').checked;
    const holeWidth = parseFloat(document.getElementById('holeWidth').value || 0);
    const holeHeight = parseFloat(document.getElementById('holeHeight').value || 0);

    const holeTypeUI = document.getElementById('holeType')?.value;
    const holeAxisUI = document.getElementById('holeAxis')?.value;
    const holeType = (holeTypeUI || defaultHoleTypeByShape(type, hasHole));
    const holeAxis = (holeAxisUI || 'y').toLowerCase();

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
        const unit = parseFloat(document.getElementById('customWidth').value || 20);
        width  = unit;
        height = unit;
        depth  = unit;
    } else if (TETROMINO_TYPES.has(type)) {
        width = parseFloat(document.getElementById('boxWidth').value || 20);
        height = depth = width;
    }
    addToLibrary({ type, width, height, depth, color, hasHole, holeWidth, holeHeight, holeType, holeAxis });
    createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight, holeType, holeAxis);
    clearFormFields();
});

function animate(time) {
    requestAnimationFrame( animate );
    controls.update();
    if (TWEEN && typeof TWEEN.update === 'function') TWEEN.update(time);
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
    if (UNDER_AUTOMATION) { renderLibrary(); return; } 
    const recognize = await createRecognizer();
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
                document.getElementById('customWidth').value = result.width || 20;
                set("boxWidth", result.width);
            }
            const canHole = !TETROMINO_TYPES.has(result.type);
            const holeChk = document.getElementById('hasHole');
            if (holeChk) {
                holeChk.checked = canHole && !!result.hasHole;
                holeChk.dispatchEvent(new Event('change')); 
            }
            if (canHole && result.hasHole) {
                set('holeWidth',  result.holeWidth);
                set('holeHeight', result.holeHeight);
            }
            setTimeout(() => {
                document.getElementById("generate").click();
                setTimeout(clearFormFields, 500);
            }, 100);
        });
    });
    renderLibrary();
})();
