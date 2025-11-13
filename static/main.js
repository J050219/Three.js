import * as THREE from 'three'; 
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as ThreeCSG from 'three-csg-ts';
import { createRecognizer } from './recognizer.js';
import * as TWEEN from '@tweenjs/tween.js';
// 亮色/暗色主題倉庫背景
function createWarehouseBackground(scene, renderer, opts = {}) {
  const W = opts.width  ?? 1400;
  const D = opts.depth  ?? 1000;
  const H = opts.height ?? 420;
  const theme = (opts.theme || 'light').toLowerCase(); // 'light' | 'dark'
  const baseY = Number.isFinite(opts.baseY) ? opts.baseY : 0;

  const nColsX = Math.max(0, opts.colsX ?? 0);
  const nColsZ = Math.max(0, opts.colsZ ?? 0);
  const useTopBeam = opts.useTopBeam ?? false;

  const palette = (theme === 'light') ? {
    fog:        0xf5f7fb,
    floorTint:  0xdfe6ee,
    wallTint:   0xf2f4f7,
    beam:       0xb9c3cf,
    hemiSky:    0xffffff,
    hemiGround: 0xdfe6ee,
    spot:       0xffffff,
    gridAlpha:  0.10
  } : {
    fog:        0x0e0f12,
    floorTint:  0x9aa0a8,
    wallTint:   0x8f959c,
    beam:       0x3b4048,
    hemiSky:    0xcfe7ff,
    hemiGround: 0x0b0c10,
    spot:       0xffffff,
    gridAlpha:  0.07
  };

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 霧＆背景
  scene.fog = new THREE.Fog(new THREE.Color(palette.fog), H*0.9, H*2.6);
  scene.background = new THREE.Color(palette.fog);

  // 程式化水泥材質（淺色底）
  function makeConcreteTex(scale=1024, spots=260){
    const c = document.createElement('canvas'); c.width=c.height=scale;
    const ctx = c.getContext('2d');
    // 亮色底
    ctx.fillStyle = '#e9edf3';
    ctx.fillRect(0,0,scale,scale);
    // 微雜訊
    for(let i=0;i<spots;i++){
      const x=Math.random()*scale,y=Math.random()*scale, r=Math.random()*10+2;
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,`rgba(0,0,0,${(Math.random()*0.05+0.015).toFixed(3)})`);
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    // 超淡掃刷紋
    ctx.globalAlpha=0.05; ctx.fillStyle='#ffffff';
    for(let y=0;y<scale;y+=8) ctx.fillRect(0,y,scale,1);
    const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.anisotropy=8;
    return tex;
  }

  const texFloor = makeConcreteTex(1024, 220); texFloor.repeat.set(W/200, D/200);
  const texWall  = makeConcreteTex(1024, 180); texWall.repeat.set(W/600, H/400);

  // 地板
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: texFloor, roughness: 0.95, metalness: 0.05, color: palette.floorTint })
  );
  floor.rotation.x = -Math.PI/2;
  floor.position.y = baseY + 0.001;
  floor.receiveShadow = true;
  scene.add(floor);

  // 四壁（內面）
  const wallMat = new THREE.MeshStandardMaterial({
    map: texWall, roughness: 0.95, metalness: 0.02, color: palette.wallTint, side: THREE.BackSide
  });
  const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
  room.position.y = baseY + H/2;
  room.receiveShadow = true;
  scene.add(room);

  // 可選柱子（預設 0）
  if (nColsX > 0 && nColsZ > 0) {
    const beamMat = new THREE.MeshStandardMaterial({ color: palette.beam, metalness: 0.25, roughness: 0.6 });
    const beams = new THREE.Group();
    const colGeo = new THREE.BoxGeometry(18, H, 18);
    for (let ix=0; ix<nColsX; ix++){
      for (let iz=0; iz<nColsZ; iz++){
        const col = new THREE.Mesh(colGeo, beamMat);
        const x = -W/2 + (ix+1)*(W/(nColsX+1));
        const z = -D/2 + (iz+1)*(D/(nColsZ+1));
        col.position.set(x, baseY + H/2, z);
        col.castShadow = true; col.receiveShadow = true;
        beams.add(col);
      }
    }
    if (useTopBeam){
      const topBeam = new THREE.Mesh(new THREE.BoxGeometry(W-60, 10, 20), beamMat);
      topBeam.position.set(0, baseY + H - 46, 0);
      topBeam.castShadow = true; topBeam.receiveShadow = true;
      beams.add(topBeam);
    }
    scene.add(beams);
  }

  // 光線（亮色系提高整體照度）
  const hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, 0.8);
  scene.add(hemi);

  const spot = new THREE.SpotLight(palette.spot, 1.2, Math.max(W,D), Math.PI/5, 0.35, 1.1);
  spot.position.set(W*0.18, baseY + H-40, D*0.18);
  spot.target.position.set(0, baseY, 0);
  spot.castShadow = true; spot.shadow.mapSize.set(1024,1024);
  scene.add(spot, spot.target);

  const spot2 = spot.clone(); spot2.position.set(-W*0.22, baseY + H-60, -D*0.15);
  scene.add(spot2);

  // 側窗亮暈
  const windowGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(D*0.28, H*0.34),
    new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.2 })
  );
  windowGlow.position.set(-W/2+1, baseY + H*0.55, 0);
  windowGlow.rotation.y = Math.PI/2;
  scene.add(windowGlow);

  // 地坪淡格線（亮一點）
  const lineTex = (()=> {
    const c = document.createElement('canvas'); c.width=256; c.height=256;
    const ctx = c.getContext('2d');
    ctx.fillStyle='#0000'; ctx.fillRect(0,0,256,256);
    ctx.strokeStyle=`rgba(0,0,0,${palette.gridAlpha})`;
    ctx.lineWidth=2;
    for(let x=0;x<=256;x+=32){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,256); ctx.stroke(); }
    for(let y=0;y<=256;y+=32){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(256,y); ctx.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(W/160, D/160);
    return t;
  })();
  const floorLines = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshBasicMaterial({ map: lineTex, transparent:true, opacity: 1.0 })
  );
  floorLines.rotation.x = -Math.PI/2;
  floorLines.position.set(0, baseY + 0.012, 0);
  scene.add(floorLines);

  // 環境反照
  const envRT = new THREE.WebGLCubeRenderTarget(64);
  const cubeCam = new THREE.CubeCamera(1, 2000, envRT);
  cubeCam.update(renderer, scene);
  scene.environment = envRT.texture;

  return { refreshEnvironment(){ cubeCam.update(renderer, scene); } };
}


/* =========================================================
   全域旗標 & 常數
========================================================= */
let placementTimeline = [];
let playingTimeline = false;

let LIGHTWEIGHT_METRICS = false;
let HUD_LIGHTWEIGHT = false;
const HUD_THROTTLE_MS = 500;
let _hudNext = 0;

let annealRunning = false;

const TIMELINE_SAMPLE_EVERY = 10;
const TIMELINE_MAX_FRAMES = 1200;

let OBBClass = null;
const HAS_OBB = () => !!OBBClass;
const CSG = ThreeCSG.CSG ?? ThreeCSG.default ?? ThreeCSG;
const LIB_KEY = 'recognizedLibrary';
const UNDER_AUTOMATION = (typeof navigator !== 'undefined') && navigator.webdriver === true;

const EPS = 0.5;
const TETROMINO_TYPES = new Set(['tI','tT','tZ','tL']);
const RIGHT_ANGLES = [0, Math.PI/2, Math.PI, 3*Math.PI/2];

// 能量權重
const ENERGY_W_EMPTY    = 1.0;
const ENERGY_W_FRAGMENT = 0.6;

// 量測解析度
const VOID_VOXEL_RES = 20;
const VOID_MC_SAMPLES = 0;
const CSG_MAX_BATCH = 12;
const USE_ONLY_CONTAINER = true;

// 佈局體素解析度（能量計算）
const VOXEL_RES = 10;
let PACK_VOXEL_RES = VOXEL_RES;

// 效能策略旗標
const PERF = {
  USE_CSG_COLLISION: false,
  USE_CSG_VOID: false,
};

const _collideRaycaster = new THREE.Raycaster();
_collideRaycaster.firstHitOnly = false;

const STAGING_PADDING = 2.0;
const COLLISION_EPS   = 0.25;

/* =========================================================
   UI：提示/面板/曲線
========================================================= */
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
(function fixTopUI(){
  const ui = document.getElementById('ui');
  if (!ui) return;
  Object.assign(ui.style, {
    position: 'fixed',
    top: '12px',
    left: '12px',
    zIndex: 10000,
    width: '520px',
    pointerEvents: 'auto'
  });
})();
// ...（中略：其餘 UI/最佳化面板/圖表等保持不變）

/* =========================================================
   場景初始化
========================================================= */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ❌（刪除）原本這行：const warehouse = createWarehouseBackground(scene, renderer);

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

/* ------- 托盤（先建立，供背景對齊） ------- */
const palletGeometry = new THREE.BoxGeometry(110, 10, 110);
const palletMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
const pallet = new THREE.Mesh(palletGeometry, palletMaterial);
pallet.position.y = -5;
scene.add(pallet);

/* ✅ 在托盤建立後，計算托盤下緣 → 建立倉庫背景（關閉柱子） */
{
  const palletBottomY = pallet.position.y - pallet.geometry.parameters.height / 2;
createWarehouseBackground(scene, renderer, {
  width: 1400,
  depth: 1000,
  height: 420,
  baseY: palletBottomY,
  colsX: 0,
  colsZ: 0,
  useTopBeam: false,
  theme: 'light' // ← 亮色系
});
}

/* ------- 藍色容器（置中於托盤上） ------- */
const containerGeometry = new THREE.BoxGeometry(110, 110, 110);
const containerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
const container = new THREE.Mesh(containerGeometry, containerMaterial);
function centerContainerOnPallet() {
  const palletTop = pallet.position.y + pallet.geometry.parameters.height / 2;
  const ch = containerGeometry.parameters.height;
  container.position.set(0, palletTop + ch / 2, 0);
}
centerContainerOnPallet();
const containerEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(containerGeometry),
  new THREE.LineBasicMaterial({ color: 0x00ffff })
);
container.add(containerEdges);
scene.add(container);

/* ------- 紅色暫存區 ------- */
const stagingSize = 220;
const stagingPad = new THREE.Mesh(
  new THREE.BoxGeometry(stagingSize, 8, stagingSize),
  new THREE.MeshBasicMaterial({ color: 0x777777 })
);
const containerWidth = containerGeometry.parameters.width;
stagingPad.position.set(container.position.x + containerWidth / 2 + stagingSize / 2 + 20, -5, container.position.z);
scene.add(stagingPad);

const stageFrameGeo = new THREE.BoxGeometry(stagingSize, 220, stagingSize);
const stageFrameMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent : true, opacity : 0.15, side : THREE.DoubleSide });
const stagingFrame = new THREE.Mesh(stageFrameGeo, stageFrameMat);
stagingFrame.position.set(
  stagingPad.position.x,
  stagingPad.position.y + stagingPad.geometry.parameters.height/2 + stageFrameGeo.parameters.height/2,
  stagingPad.position.z
);
stagingFrame.add(new THREE.LineSegments(
  new THREE.EdgesGeometry(stageFrameGeo),
  new THREE.LineBasicMaterial({ color: 0x00ffff })
));
scene.add(stagingFrame);

/* ======= 後續所有函式/事件監聽/最佳化/碰撞/產生幾何/拖曳交互 =======
   👇 全部保留你原本的實作不變（從 Library 與工具開始到最後）
   下面直接貼回你的原始程式（未更動部分） —— 為了篇幅這裡不再重複；
   你可以把「上面改動到 stagingFrame 這段」替換到你的檔案，
   其餘從 Library 起的內容照舊放在後面即可。
*/

// ……（把你後面原本的程式從「Library 與工具」一路到檔尾完整保留）……



/* =========================================================
   Library 與工具
========================================================= */
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
  try { arr = JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); return Array.isArray(arr)?arr:[]; }
  catch { return []; }
}
const library = getLibrarySafe();
function saveLibrary(){ try{ localStorage.setItem(LIB_KEY, JSON.stringify(library)); }catch(e){ console.warn('localStorage 寫入失敗:', e);} }
function summarize(item){
  const { type, width, height, depth, color, hasHole, holeWidth, holeHeight } = item;
  const typeName = typeLabel(type);
  const size = (type === 'circle') ? `${width}` :
               (TETROMINO_TYPES.has(type) ? `單位=${width}` :
               `${width}×${height}×${depth}`);
  const hole = hasHole ? `孔 ${holeWidth ?? 0}×${holeHeight ?? 0}` : '無孔';
  return { title: `${typeName} / ${size}`, hole, color };
}
function renderLibrary() {
  const list = document.getElementById('libraryList'); if (!list) return;
  if (!Array.isArray(library) || library.length === 0) {
    list.innerHTML = `<div style="color:#666;font-size:12px;line-height:1.6;">
    （清單目前沒有項目）<br>・按「辨識參數」後會自動加入<br>・或用上方表單產生後也會加入</div>`;
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
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('.use-item');
  if (!btn) return;
  const idx = +btn.dataset.index;
  const item = library[idx];
  if (!item) return;
  createCube(item.type, item.width, item.height, item.depth, item.color, item.hasHole, item.holeWidth, item.holeHeight, item.holeType, item.holeAxis);
});
function addToLibrary(params) {
  const n=(v,d)=> (Number.isFinite(+v)? +v : d);
  const t=params.type||'cube';
  const isTet=TETROMINO_TYPES.has(t);
  const hasHoleClean = isTet?false:!!params.hasHole;
  const clean = {
    type:t,
    width:n(params.width,20),
    height:n(params.height, isTet?params.width:(t==='circle'?params.width:20)),
    depth:n(params.depth, isTet?params.width:(t==='circle'?params.width:20)),
    color:params.color||'#00ff00',
    hasHole:hasHoleClean,
    holeWidth:n(params.holeWidth,10),
    holeHeight:n(params.holeHeight,10),
    holeType:params.holeType || defaultHoleTypeByShape(t, hasHoleClean),
    holeAxis:(params.holeAxis||'z').toLowerCase()
  };
  library.unshift(clean); library.splice(60); saveLibrary(); renderLibrary();
}
function normalizeColor(input) {
  const map = {"紅色":"#ff0000","綠色":"#00ff00","藍色":"#0000ff","黃色":"#ffff00","紫色":"#800080","黑色":"#000000","白色":"#ffffff","橘色":"#ffa500","灰色":"#808080","粉紅色":"#ffc0cb"};
  if (!input) return '#00ff00'; if (input.startsWith('#')) return input;
  const hex = map[input.trim()]; return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#00ff00';
}

function toCSGReady(mesh){
  mesh.updateMatrixWorld(true);
  const g=mesh.geometry; const gi=g.index?g.toNonIndexed():g.clone();
  gi.computeVertexNormals();
  const m=new THREE.Mesh(gi, mesh.material);
  m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale); m.updateMatrix();
  return m;
}
function _meshWorldVolume(mesh){
  const g=mesh.geometry; if (!g||!g.attributes?.position) return 0;
  mesh.updateMatrixWorld(true);
  const m4=mesh.matrixWorld,pos=g.attributes.position,idx=g.index?g.index.array:null;
  const v0=new THREE.Vector3(), v1=new THREE.Vector3(), v2=new THREE.Vector3();
  const t1=new THREE.Vector3(), t2=new THREE.Vector3(); let vol=0;
  const add=()=>{ t1.copy(v1).sub(v0); t2.copy(v2).sub(v0); vol+=v0.dot(t1.cross(t2))/6; };
  if (idx) for (let i=0;i<idx.length;i+=3){ v0.fromBufferAttribute(pos,idx[i]).applyMatrix4(m4);
    v1.fromBufferAttribute(pos,idx[i+1]).applyMatrix4(m4);
    v2.fromBufferAttribute(pos,idx[i+2]).applyMatrix4(m4); add(); }
  else for (let i=0;i<pos.count;i+=3){ v0.fromBufferAttribute(pos,i).applyMatrix4(m4);
    v1.fromBufferAttribute(pos,i+1).applyMatrix4(m4);
    v2.fromBufferAttribute(pos,i+2).applyMatrix4(m4); add(); }
  return Math.abs(vol);
}
function worldVolumeOfObject(root){ let sum=0; root.updateMatrixWorld(true); root.traverse(n=>{ if(n.isMesh) sum+=_meshWorldVolume(n); }); return sum; }

/* =========================================================
   容器內部體積 & 空隙估算（優先體素法）
========================================================= */
function _interiorMeshSolid() {
  const cb = new THREE.Box3().setFromObject(container);
  const palletTop = pallet.position.y + pallet.geometry.parameters.height / 2;
  const w = cb.max.x - cb.min.x, h = cb.max.y - palletTop, d = cb.max.z - cb.min.z;
  if (h <= 0) return null;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  m.position.set((cb.min.x + cb.max.x)/2, palletTop + h/2, (cb.min.z + cb.max.z)/2);
  m.updateMatrixWorld(true);
  return m;
}
function _clipToInteriorCSG(obj, interiorMesh) {
  try {
    const a = new THREE.Box3().setFromObject(obj);
    const b = new THREE.Box3().setFromObject(interiorMesh);
    if (!a.intersectsBox(b)) return null;

    const parts = [];
    obj.updateMatrixWorld(true);
    obj.traverse(n => { if (n.isMesh && n.geometry) parts.push(toCSGReady(n)); });
    if (!parts.length) return null;

    let acc = parts[0];
    for (let i = 1; i < parts.length; i++) {
      try { acc = CSG.union(acc, parts[i]); } catch {}
    }
    const clipped = CSG.intersect(acc, toCSGReady(interiorMesh));
    clipped.updateMatrixWorld(true);
    return clipped;
  } catch { return null; }
}
function _batchUnion(meshes) {
  if (!meshes.length) return null;
  let current = meshes[0];
  for (let i = 1; i < meshes.length; i++) {
    try { current = CSG.union(current, meshes[i]); }
    catch {
      const batch = [];
      for (let k = i; k < Math.min(meshes.length, i + CSG_MAX_BATCH); k++) batch.push(meshes[k]);
      try {
        let bacc = batch[0];
        for (let t = 1; t < batch.length; t++) bacc = CSG.union(bacc, batch[t]);
        current = CSG.union(current, bacc);
        i += (batch.length - 1);
      } catch {}
    }
  }
  current.updateMatrixWorld(true);
  return current;
}
function _solidVolumeViaCSG() {
  const interior = _interiorMeshSolid();
  if (!interior) return null;

  const inside = [];
  for (const o of objects) {
    if (USE_ONLY_CONTAINER && areaOf(o) !== 'container') continue;
    const clipped = _clipToInteriorCSG(o, interior);
    if (clipped) inside.push(clipped);
  }
  const containerVol = _meshWorldVolume(toCSGReady(interior));
  if (!inside.length) return { containerVolume: containerVol, solidVolume: 0 };

  const merged = _batchUnion(inside);
  if (!merged) return null;

  const solid = _meshWorldVolume(merged);
  return { containerVolume: containerVol, solidVolume: Math.max(0, Math.min(solid, containerVol)) };
}
function _pointInsideAnyObject(p, rayDir = new THREE.Vector3(1,0,0)) {
  const candidates = USE_ONLY_CONTAINER ? objects.filter(o => areaOf(o) === 'container') : objects;
  for (const o of candidates) {
    if (o.userData?.isSphere) {
      const { center, r } = getWorldSphereFromMesh(o);
      if (center.distanceToSquared(p) <= r*r) return true;
    }
  }
  _collideRaycaster.set(p, rayDir);
  let hitCount = 0;
  for (const o of candidates) {
    const hits = _collideRaycaster.intersectObject(o, true);
    if (hits.length) {
      const n = hits.filter(h => h.distance > 1e-6).length;
      hitCount += n;
    }
  }
  return (hitCount % 2) === 1;
}
function _solidVolumeViaVoxel() {
  const interior = _interiorMeshSolid(); if (!interior) return null;
  const ibox = new THREE.Box3().setFromObject(interior);
  const volContainer = (ibox.max.x-ibox.min.x)*(ibox.max.y-ibox.min.y)*(ibox.max.z-ibox.min.z);

  const nx=VOID_VOXEL_RES, ny=VOID_VOXEL_RES, nz=VOID_VOXEL_RES;
  const dx=(ibox.max.x-ibox.min.x)/nx, dy=(ibox.max.y-ibox.min.y)/ny, dz=(ibox.max.z-ibox.min.z)/nz;

  let insideCount=0, total=nx*ny*nz;
  const p=new THREE.Vector3(); const ray=new THREE.Vector3(1,0,0);

  if (VOID_MC_SAMPLES>0){
    total=VOID_MC_SAMPLES;
    for (let s=0;s<VOID_MC_SAMPLES;s++){
      p.set(
        THREE.MathUtils.lerp(ibox.min.x, ibox.max.x, Math.random()),
        THREE.MathUtils.lerp(ibox.min.y, ibox.max.y, Math.random()),
        THREE.MathUtils.lerp(ibox.min.z, ibox.max.z, Math.random())
      );
      if (_pointInsideAnyObject(p, ray)) insideCount++;
    }
  } else {
    for (let j=0;j<ny;j++){
      const y=ibox.min.y+(j+0.5)*dy;
      for (let k=0;k<nz;k++){
        const z=ibox.min.z+(k+0.5)*dz;
        for (let i=0;i<nx;i++){
          const x=ibox.min.x+(i+0.5)*dx; p.set(x,y,z);
          if (_pointInsideAnyObject(p, ray)) insideCount++;
        }
      }
    }
  }
  const solidRatio=insideCount/total; const solidVol=volContainer*solidRatio;
  return { containerVolume:volContainer, solidVolume:solidVol };
}
// ✅ 預設使用體素版（顯著省時）；必要時可把 PERF.USE_CSG_VOID=true 再呼叫一次
function measureBlueVoid() {
  if (PERF.USE_CSG_VOID) {
    const r = _solidVolumeViaCSG();
    if (r) {
      const emptyRatio = Math.max(0, 1 - r.solidVolume / r.containerVolume);
      return { emptyRatio, containerVolume: r.containerVolume, solidVolume: r.solidVolume };
    }
  }
  const r2 = _solidVolumeViaVoxel();
  if (!r2) return { emptyRatio: 1, containerVolume: 1, solidVolume: 0 };
  const emptyRatio = Math.max(0, 1 - r2.solidVolume / r2.containerVolume);
  return { emptyRatio, containerVolume: r2.containerVolume, solidVolume: r2.solidVolume };
}
function ensureVoidHUD() {
  let el = document.getElementById('voidHud');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'voidHud';
  Object.assign(el.style, {
    position: 'fixed', right: '12px', bottom: '12px',
    background: 'rgba(0,0,0,.65)', color: '#fff',
    padding: '8px 10px', borderRadius: '8px',
    fontFamily: 'system-ui, sans-serif', fontSize: '12px',
    zIndex: 9999
  });
  document.body.appendChild(el);
  return el;
}
function renderVoidHUD() {
  const now = performance.now();
  if (now < _hudNext) return;
  _hudNext = now + HUD_THROTTLE_MS;

  const prev = LIGHTWEIGHT_METRICS;
  if (HUD_LIGHTWEIGHT) LIGHTWEIGHT_METRICS = true;
  const r = measureBlueVoid();
  LIGHTWEIGHT_METRICS = prev;

  const hud = ensureVoidHUD();
  hud.textContent = `空隙 ${ (r.emptyRatio*100).toFixed(1) }%`;
}
function showVoidStats() {
  const prev = LIGHTWEIGHT_METRICS;
  LIGHTWEIGHT_METRICS = false;
  const r = measureBlueVoid();
  LIGHTWEIGHT_METRICS = prev;
  const msg = `空隙 ${(r.emptyRatio*100).toFixed(1)}%`;
  console.log('[Blue-Container Void]', r, msg);
  uiToast(msg, 2200);
  renderVoidHUD();
}

/* =========================================================
   幾何檢測：OBB/球體/回退（關閉預設 CSG 碰撞）
========================================================= */
function isPointInsideMesh(p, mesh) {
  _collideRaycaster.set(p, new THREE.Vector3(1,0,0));
  const hits = _collideRaycaster.intersectObject(mesh, true);
  const n = hits.filter(h => h.distance > 1e-6).length;
  return (n % 2) === 1;
}
function getWorldAABBCorners(mesh){
  const b=new THREE.Box3().setFromObject(mesh);
  return [
    new THREE.Vector3(b.min.x,b.min.y,b.min.z),
    new THREE.Vector3(b.max.x,b.min.y,b.min.z),
    new THREE.Vector3(b.min.x,b.max.y,b.min.z),
    new THREE.Vector3(b.max.x,b.max.y,b.min.z),
    new THREE.Vector3(b.min.x,b.min.y,b.max.z),
    new THREE.Vector3(b.max.x,b.min.y,b.max.z),
    new THREE.Vector3(b.min.x,b.max.y,b.max.z),
    new THREE.Vector3(b.max.x,b.max.y,b.max.z),
  ];
}
function buildMeshOBB(mesh) {
  const geo=mesh.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
  const bb=geo.boundingBox; const center=new THREE.Vector3(); const halfSize=new THREE.Vector3();
  bb.getCenter(center); bb.getSize(halfSize).multiplyScalar(0.5);
  const obb=new OBBClass(center.clone(), halfSize.clone());
  mesh.updateMatrixWorld(true); obb.applyMatrix4(mesh.matrixWorld); obb.halfSize.subScalar(1e-4);
  return obb;
}
function meshesReallyIntersect_OBB(a,b){
  if (!HAS_OBB()) return null;
  const ba=new THREE.Box3().setFromObject(a); const bb=new THREE.Box3().setFromObject(b);
  if (!ba.intersectsBox(bb)) return false;
  const aMeshes=[], bMeshes=[]; a.updateMatrixWorld(true); b.updateMatrixWorld(true);
  a.traverse(n=>{ if(n.isMesh) aMeshes.push(n); }); b.traverse(n=>{ if(n.isMesh) bMeshes.push(n); });
  for (const am of aMeshes){ const obbA=buildMeshOBB(am);
    for (const bm of bMeshes){ const obbB=buildMeshOBB(bm); if (obbA.intersectsOBB(obbB)) return true; }
  }
  return false;
}
function meshesReallyIntersect_Fallback(a,b){
  const ba=new THREE.Box3().setFromObject(a); const bb=new THREE.Box3().setFromObject(b);
  if (!ba.intersectsBox(bb)) return false;
  const ac=getWorldAABBCorners(a); for (const p of ac) if (isPointInsideMesh(p, b)) return true;
  const bc=getWorldAABBCorners(b); for (const p of bc) if (isPointInsideMesh(p, a)) return true;
  return false;
}
function meshesReallyIntersect_CSG(a,b){
  const ba=new THREE.Box3().setFromObject(a); const bb=new THREE.Box3().setFromObject(b);
  if (!ba.intersectsBox(bb)) return false;
  let hit=false; const aMeshes=[], bMeshes=[];
  a.updateMatrixWorld(true); b.updateMatrixWorld(true);
  a.traverse(n=>{ if(n.isMesh) aMeshes.push(n); });
  b.traverse(n=>{ if(n.isMesh) bMeshes.push(n); });
  const EPS_VOL=1e-3;
  for (const am of aMeshes){
    for (const bm of bMeshes){
      const ab=new THREE.Box3().setFromObject(am);
      const bb2=new THREE.Box3().setFromObject(bm);
      if (!ab.intersectsBox(bb2)) continue;
      try{
        const inter=CSG.intersect(toCSGReady(am), toCSGReady(bm)); inter.updateMatrixWorld(true);
        const vol=_meshWorldVolume(inter); if (vol>EPS_VOL){ hit=true; break; }
      }catch(e){}
    }
    if (hit) break;
  }
  return hit;
}
function getWorldSphereFromMesh(sphereMesh) {
  const center=new THREE.Vector3().setFromMatrixPosition(sphereMesh.matrixWorld);
  const s=new THREE.Vector3(); sphereMesh.updateMatrixWorld(true);
  sphereMesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  const rWorld=(sphereMesh.userData?.sphereR||1)*Math.max(s.x,s.y,s.z);
  return { center, r:rWorld };
}
function sphereIntersectsMeshTriangles(sphereMesh, otherMesh) {
  const { center, r } = getWorldSphereFromMesh(sphereMesh);
  const rEff=Math.max(0, r-1e-3); const r2=rEff*rEff;
  let hit=false; const tri=new THREE.Triangle(); const closest=new THREE.Vector3();
  const vA=new THREE.Vector3(), vB=new THREE.Vector3(), vC=new THREE.Vector3();
  otherMesh.updateMatrixWorld(true);
  const testOne=(m)=>{
    const g=m.geometry; if (!g||!g.attributes?.position) return;
    const pos=g.attributes.position; const idx=g.index?g.index.array:null;
    if (idx){
      for (let i=0;i<idx.length;i+=3){
        vA.fromBufferAttribute(pos, idx[i+0]).applyMatrix4(m.matrixWorld);
        vB.fromBufferAttribute(pos, idx[i+1]).applyMatrix4(m.matrixWorld);
        vC.fromBufferAttribute(pos, idx[i+2]).applyMatrix4(m.matrixWorld);
        tri.set(vA,vB,vC); tri.closestPointToPoint(center, closest);
        if (closest.distanceToSquared(center)<=r2){ hit=true; return true; }
      }
    } else {
      for (let i=0;i<pos.count;i+=3){
        vA.fromBufferAttribute(pos, i+0).applyMatrix4(m.matrixWorld);
        vB.fromBufferAttribute(pos, i+1).applyMatrix4(m.matrixWorld);
        vC.fromBufferAttribute(pos, i+2).applyMatrix4(m.matrixWorld);
        tri.set(vA,vB,vC); tri.closestPointToPoint(center, closest);
        if (closest.distanceToSquared(center)<=r2){ hit=true; return true; }
      }
    }
  };
  const bb=new THREE.Box3().setFromObject(otherMesh);
  if (!bb.expandByScalar(r).containsPoint(center)) {
    const sph=new THREE.Sphere(center, r);
    if (!bb.intersectsSphere || !bb.intersectsSphere(sph)) return false;
  }
  otherMesh.traverse(n=>{ if (!hit && n.isMesh) testOne(n); });
  if (hit) return true;
  if (isPointInsideMesh(center, otherMesh)) return true;
  return false;
}
function sphereVsSphereIntersect(a,b){
  const A=getWorldSphereFromMesh(a); const B=getWorldSphereFromMesh(b); const r=A.r+B.r;
  return A.center.distanceToSquared(B.center) <= r*r;
}

/* ===== 強化版 isOverlapping：微縮 AABB + 同區域判定 + 球體精細測 ===== */
function isOverlapping(ncandidate, ignore = null) {
  const sameArea = areaOf(ncandidate);

  const candMeshes = [];
  ncandidate.updateMatrixWorld(true);
  ncandidate.traverse(n => { if (n.isMesh) candMeshes.push(n); });

  const shrunkAABB = (objOrMesh) => {
    const b = new THREE.Box3().setFromObject(objOrMesh);
    b.min.addScalar(COLLISION_EPS);
    b.max.addScalar(-COLLISION_EPS);
    return b;
  };

  for (const obj of objects) {
    if (obj === ignore) continue;
    if (areaOf(obj) !== sameArea) continue;

    const otherMeshes = [];
    obj.updateMatrixWorld(true);
    obj.traverse(n => { if (n.isMesh) otherMeshes.push(n); });

    for (const cm of candMeshes) {
      const a = shrunkAABB(cm);
      for (const om of otherMeshes) {
        const b = shrunkAABB(om);
        if (!a.intersectsBox(b)) continue;

        const aIsS = !!ncandidate.userData?.isSphere;
        const bIsS = !!obj.userData?.isSphere;

        if (aIsS && bIsS) { if (sphereVsSphereIntersect(ncandidate, obj)) return true; continue; }
        if (aIsS) { if (sphereIntersectsMeshTriangles(ncandidate, om)) return true; continue; }
        if (bIsS) { if (sphereIntersectsMeshTriangles(obj, cm)) return true; continue; }

        const hitOBB = HAS_OBB() ? meshesReallyIntersect_OBB(cm, om) : null;
        if (hitOBB === true) return true;
        if (meshesReallyIntersect_Fallback(cm, om)) return true;
        if (PERF.USE_CSG_COLLISION && meshesReallyIntersect_CSG(cm, om)) return true;
      }
    }
  }
  return false;
}

/* =========================================================
   ★ AABB 最小位移分離（MTV） & 解穿透（新增全域保險）
========================================================= */
function _aabb(mesh){ return new THREE.Box3().setFromObject(mesh); }
// 回傳讓 a 與 b 分離的最小位移向量（軸對齊、只推 a）
function _mtvAABB(aBox, bBox){
  if (!aBox.intersectsBox(bBox)) return null;
  const pushLeft   = bBox.max.x - aBox.min.x; // +x
  const pushRight  = aBox.max.x - bBox.min.x; // -x
  const pushBack   = bBox.max.z - aBox.min.z; // +z
  const pushFront  = aBox.max.z - bBox.min.z; // -z
  const pushUp     = bBox.max.y - aBox.min.y; // +y
  const pushDown   = aBox.max.y - bBox.min.y; // -y

  const candidates = [
    new THREE.Vector3( +pushLeft, 0, 0 ),
    new THREE.Vector3( -pushRight, 0, 0 ),
    new THREE.Vector3( 0, 0, +pushBack ),
    new THREE.Vector3( 0, 0, -pushFront ),
    new THREE.Vector3( 0, +pushUp, 0 ),
    new THREE.Vector3( 0, -pushDown, 0 ),
  ].filter(v => (Math.abs(v.x)+Math.abs(v.y)+Math.abs(v.z)) > 1e-9)
   .map(v => ({ v, m: Math.abs(v.x)+Math.abs(v.y)+Math.abs(v.z) }));

  if (!candidates.length) return null;
  candidates.sort((a,b)=> a.m - b.m);
  return candidates[0].v;
}
// 嘗試把 obj 從同區域其他物體中「最小位移」推出去，最多迭代 N 次
function resolvePenetrations(obj, maxIter = 20){
  let changed = false;
  for (let it=0; it<maxIter; it++){
    let moved = false;
    const area = areaOf(obj);
    const aBox = _aabb(obj);

    for (const other of objects){
      if (other === obj) continue;
      if (areaOf(other) !== area) continue;

      const bBox = _aabb(other);
      const mtv = _mtvAABB(aBox, bBox);
      if (!mtv) continue;

      obj.position.add(mtv.multiplyScalar(1.001));
      clampIntoAreaBounds(obj);

      // y 軸維持落點（不會把物體卡在半空中）
      const sb = new THREE.Box3().setFromObject(obj);
      const half = sb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const areaNow = areaOf(obj);
      obj.position.y = findRestingYForArea(obj, areaNow, half);

      aBox.copy(_aabb(obj));
      moved = true;
      changed = true;
    }
    if (!moved) break;
  }
  return changed;
}

/* =========================================================
   場景操作/放置/最佳化輔助
========================================================= */
const objects = [];
let selectedObj = null;
let selectionHelper = null;
let FAST_PACKING = true;

function showSelection(obj) {
  if (selectionHelper) { scene.remove(selectionHelper); selectionHelper = null; }
  if (obj) { selectionHelper = new THREE.BoxHelper(obj, 0xffaa00); scene.add(selectionHelper); }
}
function deleteSelected() {
  if (!selectedObj) return;
  const i = objects.indexOf(selectedObj);
  if (i >= 0) objects.splice(i, 1);
  scene.remove(selectedObj);
  selectedObj = null;
  if (selectionHelper) { scene.remove(selectionHelper); selectionHelper = null; }
  renderVoidHUD();
}
function clearAllObjects() {
  objects.forEach(o => scene.remove(o));
  objects.length = 0;
  selectedObj = null;
  if (selectionHelper) { scene.remove(selectionHelper); selectionHelper = null; }
  renderVoidHUD();
}
function ensureSceneButtons() {
  const ui = document.getElementById('ui'); if (!ui) return;
  if (!document.getElementById('deleteSelectedBtn')) {
    const b1 = document.createElement('button'); b1.id='deleteSelectedBtn'; b1.textContent='刪除選取'; b1.style.marginLeft='8px'; ui.appendChild(b1);
    b1.addEventListener('click', deleteSelected);
  }
  if (!document.getElementById('clearAllBtn')) {
    const b2 = document.createElement('button'); b2.id='clearAllBtn'; b2.textContent='清空容器'; b2.style.marginLeft='8px'; ui.appendChild(b2);
    b2.addEventListener('click', clearAllObjects);
  }
  if (!document.getElementById('voidBtn')) {
    const b3=document.createElement('button'); b3.id='voidBtn'; b3.textContent='估算空隙'; b3.style.marginLeft='8px'; ui.appendChild(b3);
    b3.addEventListener('click', showVoidStats);
  }
}
addEventListener('keydown', (e) => { if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected(); });

function buildTetrominoMesh(kind, unit, material) {
  const group=new THREE.Group(); const g=new THREE.BoxGeometry(unit,unit,unit);
  let layout=[];
  switch(kind){
    case 'tI': layout=[[-1.5,0],[-0.5,0],[0.5,0],[1.5,0]]; break;
    case 'tT': layout=[[-1,0],[0,0],[1,0],[0,1]]; break;
    case 'tZ': layout=[[-1,0],[0,0],[0,1],[1,1]]; break;
    case 'tL': layout=[[-1,0],[0,0],[1,0],[-1,1]]; break;
    default:   layout=[[-1,0],[0,0],[1,0],[0,1]];
  }
  for (const [gx,gz] of layout){
    const cube=new THREE.Mesh(g, material);
    cube.position.set(gx*unit, 0, gz*unit); group.add(cube);
  }
  const box=new THREE.Box3().setFromObject(group); const center=new THREE.Vector3(); box.getCenter(center);
  group.children.forEach(c=>{ c.position.sub(center); });
  group.userData.unit=unit; return group;
}
function updateParamVisibility(type = document.getElementById('shapeType')?.value) {
  const box=document.getElementById('boxParams');
  const sphere=document.getElementById('sphereParams');
  const custom=document.getElementById('customParams');
  const hole=document.getElementById('holeInput');
  const chk=document.getElementById('hasHole'); if (!box || !sphere || !custom || !hole) return;
  const isTet=TETROMINO_TYPES.has(type);
  box.style.display=(type==='cube'||isTet)?'block':'none';
  sphere.style.display=(type==='circle')?'block':'none';
  custom.style.display=(type==='lshape')?'block':'none';
  const w=document.getElementById('boxWidth');
  const h=document.getElementById('boxHeight');
  const d=document.getElementById('boxDepth');
  if (isTet) {
    if (w){ w.placeholder='單位邊長'; w.style.display='block'; }
    if (h){ h.value=''; h.style.display='none'; }
    if (d){ d.value=''; d.style.display='none'; }
  } else if (type==='cube') {
    if (w) w.style.display='block'; if (h) h.style.display='block'; if (d) d.style.display='block';
  }
  const canHole=!isTet; if (chk) chk.disabled=!canHole;
  hole.style.display=(!isTet && chk?.checked)?'block':'none';
}
function clearFormFields() {
  ['boxWidth','boxHeight','boxDepth','sphereWidth','customWidth','holeWidth','holeHeight'].forEach(id => {
    const el=document.getElementById(id); if (el) el.value='';
  });
  updateParamVisibility();
}

// 區域：container / staging
function getAreaByXZ(x,z){
  const cbox=new THREE.Box3().setFromObject(container);
  if (x>=cbox.min.x && x<=cbox.max.x && z>=cbox.min.z && z<=cbox.max.z) return 'container';
  const halfW=stagingPad.geometry.parameters.width/2;
  const halfD=stagingPad.geometry.parameters.depth/2;
  const sxmin=stagingPad.position.x-halfW, sxmax=stagingPad.position.x+halfW;
  const szmin=stagingPad.position.z-halfD, szmax=stagingPad.position.z+halfD;
  if (x>=sxmin && x<=sxmax && z>=szmin && z<=szmax) return 'staging';
  return null;
}
function areaOf(o){ return getAreaByXZ(o.position.x, o.position.z) || 'container'; }
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
      maxY: baseY + stageFrameGeo.parameters.height - half.y,
      baseY
    };
  }
  const baseY = pallet.position.y + pallet.geometry.parameters.height / 2;
  return { minX:-Infinity,maxX:Infinity,minZ:-Infinity,maxZ:Infinity,minY:baseY+half.y,maxY:baseY+200-half.y,baseY };
}

// 扣邊 + 找落點
function clampIntoAreaBounds(obj){
  const sb = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); sb.getSize(size);
  const half = size.clone().multiplyScalar(0.5);
  const area = getAreaByXZ(obj.position.x, obj.position.z) || 'container';
  const bd = getBoundsForArea(area, half);

  obj.position.x = THREE.MathUtils.clamp(obj.position.x, bd.minX, bd.maxX);
  obj.position.z = THREE.MathUtils.clamp(obj.position.z, bd.minZ, bd.maxZ);
  obj.position.y = THREE.MathUtils.clamp(obj.position.y, bd.minY, bd.maxY);
  obj.position.y = findRestingYForArea(obj, area, half);
}

function _cloneForTest(o){ const c=o.clone(true); c.userData={...o.userData}; return c; }
function findRestingY(object) {
  const clone=_cloneForTest(object);
  const box=new THREE.Box3().setFromObject(object);
  const size=new THREE.Vector3(); box.getSize(size);
  let y=pallet.position.y+pallet.geometry.parameters.height/2+size.y/2;
  const maxY=container.position.y+container.geometry.parameters.height/2-size.y/2;
  while (y<=maxY){ clone.position.y=y; if (!isOverlapping(clone, object)) return y; y+=0.5; }
  return object.position.y;
}
function findRestingYForArea(object, area, half) {
  const { baseY, maxY } = getBoundsForArea(area, half);
  const clone=_cloneForTest(object);
  let y = baseY + half.y;
  while (y <= maxY) {
    clone.position.set(object.position.x, y, object.position.z);
    if (!isOverlapping(clone, object)) return y;
    y += 0.5;
  }
  return object.position.y;
}
function boundsForObjectXZ(obj){
  const cb=new THREE.Box3().setFromObject(container);
  const b=new THREE.Box3().setFromObject(obj); const sz=new THREE.Vector3(); b.getSize(sz);
  const halfX=sz.x*0.5, halfZ=sz.z*0.5;
  return { minX:cb.min.x+halfX, maxX:cb.max.x-halfX, minZ:cb.min.z+halfZ, maxZ:cb.max.z-halfZ };
}
function anchorScore(obj) {
  const cb = new THREE.Box3().setFromObject(container);
  const b  = new THREE.Box3().setFromObject(obj);
  return (b.min.x - cb.min.x) + (b.min.z - cb.min.z) + 0.25 * Math.max(0, b.min.y - (pallet.position.y + pallet.geometry.parameters.height / 2));
}
function ensureInScene(o){ if (!o.parent) scene.add(o); if (!objects.includes(o)) objects.push(o); }
function resetPose(mesh){ mesh.rotation.set(0,0,0); mesh.position.set(0,0,0); mesh.updateMatrixWorld(true); }
function dedupeObjects(){ const seen=new Set(); for (let i=objects.length-1;i>=0;i--){ const o=objects[i]; if (seen.has(o)) objects.splice(i,1); else seen.add(o);} }

/* =========================================================
   能量評分（體素）
========================================================= */
function packingEnergy() {
  if (objects.length === 0) return 0;
  const cb=new THREE.Box3().setFromObject(container);
  const palletTop = pallet.position.y + pallet.geometry.parameters.height / 2;
  const min=new THREE.Vector3(cb.min.x, palletTop, cb.min.z);
  const max=new THREE.Vector3(cb.max.x, cb.max.y, cb.max.z);
  const nx=PACK_VOXEL_RES, ny=PACK_VOXEL_RES, nz=PACK_VOXEL_RES;
  const dx=(max.x-min.x)/nx, dy=(max.y-min.y)/ny, dz=(max.z-min.z)/nz;
  const total=nx*ny*nz; if (total<=0) return 0;
  const boxes=objects.map(o=>new THREE.Box3().setFromObject(o));
  const grid=new Uint8Array(total); let emptyCount=0; const p=new THREE.Vector3();
  const toIndex=(i,j,k)=> (j*nz + k)*nx + i;

  for (let j=0;j<ny;j++){
    const y=min.y+(j+0.5)*dy;
    for (let k=0;k<nz;k++){
      const z=min.z+(k+0.5)*dz;
      for (let i=0;i<nx;i++){
        const x=min.x+(i+0.5)*dx; p.set(x,y,z);
        let occ=false; for (let b=0; b<boxes.length && !occ; b++){ if (boxes[b].containsPoint(p)) occ=true; }
        const id=toIndex(i,j,k); grid[id]=occ?1:0; if (!occ) emptyCount++;
      }
    }
  }
  if (emptyCount===0) return 0;
  const visited=new Uint8Array(total); const q=new Uint32Array(total); let largest=0;
  for (let j=0;j<ny;j++) for (let k=0;k<nz;k++) for (let i=0;i<nx;i++){
    const start=toIndex(i,j,k); if (grid[start]!==0 || visited[start]) continue;
    let head=0, tail=0, size=0; visited[start]=1; q[tail++]=start;
    while (head<tail){
      const cur=q[head++]; size++; const ii=cur%nx; const jk=(cur-ii)/nx; const kk=jk%nz; const jj=(jk-kk)/nz;
      if (ii>0){ const nid=cur-1; if (!visited[nid] && grid[nid]===0){ visited[nid]=1; q[tail++]=nid; } }
      if (ii<nx-1){ const nid=cur+1; if (!visited[nid] && grid[nid]===0){ visited[nid]=1; q[tail++]=nid; } }
      if (kk>0){ const nid=cur-nx; if (!visited[nid] && grid[nid]===0){ visited[nid]=1; q[tail++]=nid; } }
      if (kk<nz-1){ const nid=cur+nx; if (!visited[nid] && grid[nid]===0){ visited[nid]=1; q[tail++]=nid; } }
      if (jj>0){ const nid=cur-nx*nz; if (!visited[nid] && grid[nid]===0){ visited[nid]=1; q[tail++]=nid; } }
      if (jj<ny-1){ const nid=cur+nx*nz; if (!visited[nid] && grid[nid]===0){ visited[nid]=1; q[tail++]=nid; } }
    }
    if (size>largest) largest=size;
  }
  const emptyRatio=emptyCount/total;
  const largestVoidRatio=largest/emptyCount;
  return ENERGY_W_EMPTY*emptyRatio + ENERGY_W_FRAGMENT*(1-largestVoidRatio);
}
function snapshotState(){ return objects.map(o=>({ obj:o, pos:o.position.clone(), rot:o.rotation.clone() })); }
function restoreState(snap){ snap.forEach(s=>{ s.obj.position.copy(s.pos); s.obj.rotation.copy(s.rot); }); }

/* =========================================================
   擺放/退火（核心邏輯與節流）
========================================================= */
function tryBestAxisOrientation_Y(obj){
  const beforePos=obj.position.clone(), beforeRot=obj.rotation.clone();
  let best={ energy:Infinity, rot:beforeRot.clone(), pos:beforePos.clone() };
  const eBase=packingEnergy();
  for (const ay of RIGHT_ANGLES){
    obj.rotation.set(0, ay, 0);
    const b=boundsForObjectXZ(obj);
    obj.position.x = THREE.MathUtils.clamp(obj.position.x, b.minX, b.maxX);
    obj.position.z = THREE.MathUtils.clamp(obj.position.z, b.minZ, b.maxZ);
    obj.position.y = findRestingY(obj);
    if (isOverlapping(obj, obj)) continue;
    const e = packingEnergy();
    if (e < best.energy) best={ energy:e, rot:obj.rotation.clone(), pos:obj.position.clone() };
  }
  // 採用更好姿勢 → 仍須檢查/解穿透；解不掉才回退
  if (best.energy + 1e-9 < eBase) {
    obj.rotation.copy(best.rot);
    obj.position.copy(best.pos);
    clampIntoAreaBounds(obj);
    if (isOverlapping(obj, obj)) {
      resolvePenetrations(obj);
      if (isOverlapping(obj, obj)) { obj.rotation.copy(beforeRot); obj.position.copy(beforePos); clampIntoAreaBounds(obj); }
    }
    return true;
  }
  obj.rotation.copy(beforeRot); obj.position.copy(beforePos); return false;
}
function globalCompaction(passes = 3) {
  const stepFor = (o) => Math.max(0.5, o.userData?.unit || 2);
  for (let t = 0; t < passes; t++) {
    const order = objects.slice().sort(() => Math.random() - 0.5);
    for (const o of order) {
      o.position.y = findRestingY(o);
      clampIntoAreaBounds(o);
      let improved = true;
      while (improved) {
        improved = false;
        const e0 = packingEnergy();
        const s  = stepFor(o);
        const b  = boundsForObjectXZ(o);
        const tryMove = (dx, dz) => {
          const oldPos = o.position.clone();
          const oldScore = anchorScore(o);
          o.position.x = THREE.MathUtils.clamp(o.position.x + dx * s, b.minX, b.maxX);
          o.position.z = THREE.MathUtils.clamp(o.position.z + dz * s, b.minZ, b.maxZ);
          o.position.y = findRestingY(o);
          clampIntoAreaBounds(o);

          if (!isOverlapping(o, o)) {
            const e1 = packingEnergy();
            if (e1 < e0 - 1e-6) { improved = true; return true; }
            if (Math.abs(e1 - e0) < 1e-6) {
              const newScore = anchorScore(o);
              if (newScore < oldScore - 1e-6) { improved = true; return true; }
            }
          }
          o.position.copy(oldPos);
          clampIntoAreaBounds(o);
          return false;
        };
        tryMove( 1, 0) || tryMove(-1, 0) || tryMove(0,  1) || tryMove(0, -1);
      }
    }
  }
}
function shakeAndSettle(iter=2) {
  const step = 0.6;
  for (let t=0; t<iter; t++) {
    const order = objects.slice().sort((a,b)=> anchorScore(a)-anchorScore(b));
    for (const o of order) {
      const b = boundsForObjectXZ(o);
      let moved = true;
      while (moved) {
        moved = false;
        const old = o.position.clone();
        o.position.x = THREE.MathUtils.clamp(o.position.x - step, b.minX, b.maxX);
        o.position.z = THREE.MathUtils.clamp(o.position.z - step, b.minZ, b.maxZ);
        o.position.y = findRestingY(o);
        clampIntoAreaBounds(o);
        if (isOverlapping(o,o)) o.position.copy(old);
        else if (o.position.distanceTo(old) > 1e-6) moved = true;

        const keep = o.position.clone();
        const rx = (Math.random()-0.5)*step, rz = (Math.random()-0.5)*step;
        o.position.x = THREE.MathUtils.clamp(o.position.x + rx, b.minX, b.maxX);
        o.position.z = THREE.MathUtils.clamp(o.position.z + rz, b.minZ, b.maxZ);
        o.position.y = findRestingY(o);
        clampIntoAreaBounds(o);
        if (isOverlapping(o,o)) o.position.copy(keep);
      }
    }
  }
}
function isInsideContainerAABB(obj, eps = 1e-3) {
  const cb = new THREE.Box3().setFromObject(container);
  const b  = new THREE.Box3().setFromObject(obj);
  const palletTop = pallet.position.y + pallet.geometry.parameters.height / 2;
  return (
    b.min.x >= cb.min.x - eps &&
    b.max.x <= cb.max.x + eps &&
    b.min.z >= cb.min.z - eps &&
    b.max.z <= cb.max.z + eps &&
    b.min.y >= palletTop - eps &&
    b.max.y <= cb.max.y + eps
  );
}
function packingEnergyWithCandidate(candidate) {
  candidate.updateMatrixWorld(true);
  objects.push(candidate);
  const e = packingEnergy();
  objects.pop();
  return e;
}
function placeInsideContainer(mesh, opts = {}) {
  const containerBox = new THREE.Box3().setFromObject(container);
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3(); box.getSize(size);

  const padding = (opts.padding ?? 0.03);
  const angles  = opts.angles  ?? RIGHT_ANGLES;

  const grid = mesh.userData?.unit || null;
  const stepBase = grid ? Math.max(grid/2, 0.35) : Math.max(0.35, Math.min(size.x, size.z)/8);
  const step = Math.max(0.15, stepBase * (opts.stepScale ?? 1.0));
  const snap = (v, g) => g ? Math.round(v / g) * g : v;

  const leftX  = containerBox.min.x + size.x/2 + padding;
  const rightX = containerBox.max.x - size.x/2 - padding;
  const backZ  = containerBox.min.z + size.z/2 + padding;
  const frontZ = containerBox.max.z - size.z/2 - padding;

  let best = null;
  for (let x = leftX; x <= rightX + 1e-6; x += step) {
    for (let z = backZ; z <= frontZ + 1e-6; z += step) {
      for (const ay of angles) {
        mesh.rotation.set(0, ay, 0);
        mesh.position.set(snap(x, grid), 0, snap(z, grid));
        mesh.position.y = findRestingY(mesh);

        if (!isInsideContainerAABB(mesh)) continue;
        if (isOverlapping(mesh, mesh)) continue;

        const e = FAST_PACKING ? 0 : packingEnergyWithCandidate(mesh);
        const b = new THREE.Box3().setFromObject(mesh);
        const tie = best && Math.abs(e - best.energy) < 1e-9;

        if (!best || e < best.energy - 1e-9 ||
           (tie && (b.min.y < best.boxMinY - 1e-6 ||
                   (Math.abs(b.min.y - best.boxMinY) < 1e-6 &&
                    (b.min.x + b.min.z) < (best.boxMinX + best.boxMinZ) - 1e-6)))) {
          best = { energy:e, pos:mesh.position.clone(), rot:mesh.rotation.clone(),
                   boxMinY:b.min.y, boxMinX:b.min.x, boxMinZ:b.min.z };
        }
      }
    }
  }
  if (!best) return false;

  mesh.position.copy(best.pos);
  mesh.rotation.copy(best.rot);
  clampIntoAreaBounds(mesh);
  if (isOverlapping(mesh)) return false;

  ensureInScene(mesh);
  tryBestAxisOrientation_Y(mesh);
  mesh.position.y = findRestingY(mesh);
  clampIntoAreaBounds(mesh);
  globalCompaction(3);
  shakeAndSettle();

  // ★ 放定點後做一次解穿透（保險）
  resolvePenetrations(mesh);

  renderVoidHUD();
  return true;
}

/* ===== 強化版 placeInStaging：格點+間隙+螺旋搜尋（避免重疊） ===== */
function placeInStaging(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3(); box.getSize(size);
  const half = size.clone().multiplyScalar(0.5);

  const bounds = getBoundsForArea('staging', half);

  const stepX = Math.max(half.x*2 + STAGING_PADDING, 4);
  const stepZ = Math.max(half.z*2 + STAGING_PADDING, 4);

  const originX = bounds.minX + stepX * 0.5;
  const originZ = bounds.minZ + stepZ * 0.5;

  mesh.updateMatrixWorld(true);

  let ring = 0;
  const MAX_RING = 300;
  while (ring <= MAX_RING) {
    const lenX = ring * stepX;
    const lenZ = ring * stepZ;

    const candidates = [];
    for (let x = -lenX; x <= lenX; x += stepX) {
      candidates.push([originX + x, originZ - lenZ]); // 下邊
      candidates.push([originX + x, originZ + lenZ]); // 上邊
    }
    for (let z = -lenZ + stepZ; z <= lenZ - stepZ; z += stepZ) {
      candidates.push([originX - lenX, originZ + z]); // 左邊
      candidates.push([originX + lenX, originZ + z]); // 右邊
    }

    for (const [cx, cz] of candidates) {
      if (cx < bounds.minX || cx > bounds.maxX || cz < bounds.minZ || cz > bounds.maxZ) continue;

      mesh.position.set(cx, bounds.minY + half.y, cz);
      mesh.position.y = findRestingYForArea(mesh, 'staging', half);
      clampIntoAreaBounds(mesh);

      if (!isOverlapping(mesh)) {
        ensureInScene(mesh);
        // ★ 放上去就解穿透（避免邊界窄縫）
        resolvePenetrations(mesh);
        renderVoidHUD();
        return true;
      }
    }
    ring++;
  }

  console.warn('暫存區已滿或放置失敗（找不到不重疊位置）');
  return false;
}
function rescueToStaging(mesh){
  try{
    if (!placeInStaging(mesh)) {
      const b=getBoundsForArea('staging', new THREE.Vector3(1,1,1));
      mesh.position.set(stagingPad.position.x, b.minY, stagingPad.position.z);
      ensureInScene(mesh);
    }
  } catch(e){ console.warn('rescueToStaging 失敗', e); ensureInScene(mesh); }
}

/* === 退火（含錄影、面板、折線圖） === */
function makeTimeSlicer(budgetMs = 12) {
  let last = performance.now();
  return async function slice(){ const now=performance.now(); if (now-last>=budgetMs){ await new Promise(r=>setTimeout(r,0)); last=performance.now(); } };
}
async function playPlacementTimeline() {
  if (placementTimeline.length === 0 || playingTimeline) return;
  playingTimeline = true;
  uiToast('正在播放擺放過程...');
  for (const frame of placementTimeline) {
    for (const f of frame) {
      const obj = objects.find(o => o === f.obj || o.uuid === f.obj?.uuid || o.uuid === f.id);
      if (obj) { obj.position.copy(f.pos); obj.rotation.copy(f.rot); }
    }
      // ===== 更新 Smart Diffusion 背景 =====
  const mx = ((window._lastMouseX ?? (window.innerWidth*0.5)) / window.innerWidth);
  const my = ((window._lastMouseY ?? (window.innerHeight*0.5)) / window.innerHeight);
  const bgTex = _bg.update(time*0.001, new THREE.Vector2(mx, 1.0 - my));
  scene.background = bgTex;

    renderer.render(scene, camera);
    await new Promise(r => setTimeout(r, 25));
  }
  uiToast('播放完成');
  playingTimeline = false;
  for (const frame of placementTimeline) for (const f of frame){ f.pos=null; f.rot=null; }
  placementTimeline.length = 0;
}
async function runAnnealing(opts = {}) {
  if (objects.length === 0) { uiToast('目前沒有物體可最佳化'); return; }
  if (annealRunning) { uiToast('最佳化已在進行中'); return; }

  annealRunning = true;
  placementTimeline = [];
  let acceptedCount = 0;

  showLoadingSpinner(true);
  showOptimizePanel(true);
  updateOptimizePanel({ subtitle:'計算初始能量…' });
  ConvergenceChart.start();

  const steps    = opts.steps    ?? 10000;
  const initTemp = opts.initTemp ?? 120;
  const cooling  = opts.cooling  ?? 0.997;
  const baseStep = opts.baseStep ?? 4;

  const slice = makeTimeSlicer(12);
  const prevLight = LIGHTWEIGHT_METRICS;
  LIGHTWEIGHT_METRICS = true;

  uiToast('開始最佳化擺放');
  let bestSnap   = snapshotState();
  let bestEnergy = packingEnergy();
  let T = initTemp;

  for (let s = 0; s < steps && annealRunning; s++) {
    await slice();
    if ((s & 63) === 0) {
      const r = measureBlueVoid();
      updateOptimizePanel({ step:s, total:steps, subtitle:`退火中（T=${T.toFixed(1)}）`, emptyPct:r.emptyRatio*100 });
    }

    const obj  = objects[Math.floor(Math.random() * objects.length)];
    const step = obj.userData?.unit || baseStep;
    const e0   = packingEnergy();

    let applied = false;
    const backupPos = obj.position.clone();
    const backupRot = obj.rotation.clone();

    for (let k = 0; k < 40 && !applied; k++) {
      obj.position.x += (Math.random() - 0.5) * step;
      obj.position.y += (Math.random() - 0.5) * step;
      obj.position.z += (Math.random() - 0.5) * step;
      obj.rotation.y += (Math.random() - 0.5) * 0.12;

      obj.position.y = findRestingY(obj);
      clampIntoAreaBounds(obj);

      if (isOverlapping(obj, obj)) {
        obj.position.copy(backupPos);
        obj.rotation.copy(backupRot);
        clampIntoAreaBounds(obj);
        continue;
      }
      applied = true;
    }
    if (!applied) { T *= cooling; continue; }

    const e1 = packingEnergy();
    const dE = e1 - e0;
    const accept = (dE <= 0) || (Math.random() < Math.exp(-dE / T));

    if (accept) {
      if (e1 < bestEnergy) { bestEnergy = e1; bestSnap = snapshotState(); }
      if ((++acceptedCount % TIMELINE_SAMPLE_EVERY) === 0) {
        const snap = snapshotState();
        placementTimeline.push(snap);
        if (placementTimeline.length > TIMELINE_MAX_FRAMES) placementTimeline.shift();
      }
    } else {
      obj.position.copy(backupPos);
      obj.rotation.copy(backupRot);
      clampIntoAreaBounds(obj);
    }
    T *= cooling;
  }

  showLoadingSpinner(false);
  ConvergenceChart.stop();
  updateOptimizePanel({ step: steps, total: steps, subtitle:'回放中…' });

  await playPlacementTimeline();

  restoreState(bestSnap);
  objects.forEach(clampIntoAreaBounds);
  globalCompaction(2);

  // ★ 全域保險：逐件解穿透
  for (const o of objects) resolvePenetrations(o);

  renderVoidHUD();

  const r = measureBlueVoid();
  uiToast(`最佳化完成，容積利用率 ${(100 - r.emptyRatio*100).toFixed(1)}%`);
  updateOptimizePanel({ subtitle:`完成！容積利用率 ${(100 - r.emptyRatio*100).toFixed(1)}%` });

  setTimeout(() => showOptimizePanel(false), 900);
  annealRunning = false;
  LIGHTWEIGHT_METRICS = prevLight;
}
function stopAnnealing() {
  annealRunning = false;
  uiToast('已停止最佳化');
  showLoadingSpinner(false);
}

/* =========================================================
   自動擺放流程（先大後小 + 暫存）
========================================================= */
async function uiYield(){ return new Promise(r => requestAnimationFrame(()=>r())); }

async function stageFirstLargest(options = {}) {
  const staged = objects.filter(o => areaOf(o) === 'staging');
  if (!staged.length) return;
  const ranked = staged.map(o=>({o, vol:worldVolumeOfObject(o)})).sort((a,b)=>b.vol-a.vol).map(x=>x.o);
  uiToast(`暫存區 ${ranked.length} 件：由大到小嘗試入箱`);
  for (const m of ranked) {
    resetPose(m);
    let ok =
      placeInsideContainer(m, { stepScale: 1.0,  padding: 0.04, angles: RIGHT_ANGLES }) ||
      placeInsideContainer(m, { stepScale: 0.55, padding: 0.02, angles: RIGHT_ANGLES }) ||
      placeInsideContainer(m, { stepScale: 0.33, padding: 0.02, angles: RIGHT_ANGLES });
    if (!ok) placeInStaging(m);
    clampIntoAreaBounds(m);
    await uiYield();
  }
  renderVoidHUD();
}
async function autoPackMaxUtilization(options = {}) {
  if (annealRunning) { uiToast('請先停止正在進行的最佳化'); return; }
  for (const o of objects){ o.visible=true; ensureInScene(o); }
  const bigRatio = options.bigRatio ?? 0.6;
  const fineFactor = options.fineFactor ?? 0.5;
  const ultraFactor = options.ultraFactor ?? 0.33;

  const ranked = objects.slice().map(o=>({o,vol:worldVolumeOfObject(o)})).sort((a,b)=>b.vol-a.vol).map(x=>x.o);
  const cut = Math.max(1, Math.round(ranked.length * bigRatio));
  const big = ranked.slice(0, cut);
  const small = ranked.slice(cut);

  FAST_PACKING = true;
  for (const m of big) {
    resetPose(m);
    const ok = placeInsideContainer(m, { stepScale: 1.0, padding: 0.05, angles: RIGHT_ANGLES });
    if (!ok) rescueToStaging(m);
    clampIntoAreaBounds(m);
    await uiYield();
  }

  FAST_PACKING = false;
  for (const m of small) {
    resetPose(m);
    let ok = placeInsideContainer(m, { stepScale: fineFactor,  padding: 0.02, angles: RIGHT_ANGLES });
    if (!ok) ok = placeInsideContainer(m, { stepScale: ultraFactor, padding: 0.02, angles: RIGHT_ANGLES });
    if (!ok) rescueToStaging(m);
    clampIntoAreaBounds(m);
    await uiYield();
  }

  globalCompaction(2);
  await runAnnealing({ steps: options.steps ?? 9000, initTemp: 90, cooling: 0.997, baseStep: 3, baseAngle: Math.PI/18 });

  const r = measureBlueVoid();
  uiToast(`完成：利用率 ${(100 - r.emptyRatio * 100).toFixed(1)}%`);
  renderVoidHUD();
}
async function packToTheMax() {
  if (annealRunning) { uiToast('請先停止正在進行的最佳化'); return; }
  if (!objects.length) { uiToast('目前沒有物體'); return; }

  LIGHTWEIGHT_METRICS = true;
  await stageFirstLargest();

  const _oldPACK = PACK_VOXEL_RES;
  PACK_VOXEL_RES = 18;

  await autoPackMaxUtilization({ bigRatio: 0.6, fineFactor: 0.45, ultraFactor: 0.28, steps: 11000 });

  const staged = objects.filter(o => (getAreaByXZ(o.position.x, o.position.z) === 'staging'));
  if (staged.length) uiToast(`再嘗試塞入剩餘 ${staged.length} 件`);
  for (const m of staged) {
    resetPose(m);
    let ok = placeInsideContainer(m, { stepScale: 0.55, padding: 0.02 })
          || placeInsideContainer(m, { stepScale: 0.33, padding: 0.02 })
          || placeInsideContainer(m, { stepScale: 0.22, padding: 0.015 });
    if (!ok) placeInStaging(m);
    clampIntoAreaBounds(m);
    await uiYield();
  }

  globalCompaction(3);
  shakeAndSettle(3);
  for (const o of objects) { tryBestAxisOrientation_Y(o); o.position.y = findRestingY(o); clampIntoAreaBounds(o); }

  await runAnnealing({ steps: 6000, initTemp: 80, cooling: 0.998, baseStep: 2, baseAngle: Math.PI/18 });
  globalCompaction(2);

  // ★ 全域保險：逐件解穿透
  for (const o of objects) resolvePenetrations(o);

  const r = measureBlueVoid();
  uiToast(`完成：容積利用率 ${(100 - r.emptyRatio*100).toFixed(1)}%`);
  renderVoidHUD();

  PACK_VOXEL_RES = _oldPACK;
  LIGHTWEIGHT_METRICS = false;
}

/* =========================================================
   產生幾何（cube/circle/tetromino/L-shape）
========================================================= */
function defaultHoleTypeByShape(type, hasHole) { if (!hasHole) return 'none'; if (type==='circle') return 'cyl'; return 'box'; }
function axisThickness(w,h,d,axis='y'){ axis=axis.toLowerCase(); return axis==='x'?w:axis==='y'?h:d; }
function makeHoleMesh(opts={}) {
  const holeType=(opts.holeType||'box').toLowerCase();
  const axis=(opts.holeAxis||'y').toLowerCase();
  const width=Math.max(1,(opts.holeWidth||10));
  const height=Math.max(1,(opts.holeHeight||10));
  const depth=Math.max(1,(opts.holeDepth||10));
  if (holeType==='sphere'){
    const r=Math.max(1, width*0.5)-EPS;
    const g=new THREE.SphereGeometry(r,24,16);
    return toCSGReady(new THREE.Mesh(g,new THREE.MeshBasicMaterial()));
  }
  if (holeType==='cyl'){
    const r=Math.max(1,width*0.5);
    const h=depth+2*EPS;
    const g=new THREE.CylinderGeometry(r,r,h,24);
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial());
    if (axis==='x') m.rotation.z=Math.PI/2;
    if (axis==='z') m.rotation.x=Math.PI/2;
    return toCSGReady(m);
  }
  let bx=width+2*EPS, by=height+2*EPS, bz=depth+2*EPS;
  if (axis==='x') { bx=depth+2*EPS; } else if (axis==='y'){ by=depth+2*EPS; } else { bz=depth+2*EPS; }
  const g=new THREE.BoxGeometry(bx,by,bz);
  return toCSGReady(new THREE.Mesh(g,new THREE.MeshBasicMaterial()));
}
function applyColorToMaterial(color){ return new THREE.MeshStandardMaterial({ color:new THREE.Color(normalizeColor(color)) }); }

function createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight, holeType='auto', holeAxis='y') {
  const material = applyColorToMaterial(color);
  let mesh;
  if (TETROMINO_TYPES.has(type)) {
    const unit=Number.isFinite(+width)?+width:20;
    mesh = buildTetrominoMesh(type, unit, material);
  } else if (type==='cube') {
    const outer0=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth), material);
    const outer=toCSGReady(outer0);
    if (hasHole){
      const full=axisThickness(width,height,depth,holeAxis);
      const hole=makeHoleMesh({ holeType:(holeType&&holeType!=='auto')?holeType:'box', holeAxis, holeWidth, holeHeight, holeDepth:full+2*EPS });
      hole.position.copy(outer.position);
      try{ const result=CSG.subtract(outer, hole); result.geometry.computeVertexNormals(); result.material=material; mesh=result; }
      catch(err){ console.error('CSG subtraction failed:', err); mesh=outer; }
    } else mesh=outer;
  } else if (type==='circle') {
    const R=Math.max(1, width*0.5);
    let outer=new THREE.Mesh(new THREE.SphereGeometry(R,48,48), material);
    outer=toCSGReady(outer);
    if (hasHole){
      const r=Math.max(0.5,(holeWidth||R*0.5)*0.5); const h=width+4;
      let hole=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,48), material);
      hole.position.copy(outer.position); hole=toCSGReady(hole);
      try{ const result=CSG.subtract(outer, hole); result.geometry.computeVertexNormals(); result.material=material; mesh=result; }
      catch(err){ console.error('CSG subtraction failed:', err); mesh=outer; }
    } else mesh=outer;
    mesh.userData.isSphere=true; mesh.userData.sphereR=Math.max(1, width*0.5); mesh.userData.type='custom';
  } else if (type==='lshape') {
    const edge=Math.max(1, width);
    const unitGeo=new THREE.BoxGeometry(edge,edge,edge);
    const coords=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
    const make=(ix,iy,iz)=>{ const m=new THREE.Mesh(unitGeo.clone(), material); m.position.set(ix*edge,iy*edge,iz*edge); return toCSGReady(m); };
    let combined=make(...coords[0]); for (let i=1;i<coords.length;i++) combined=CSG.union(combined, make(...coords[i]));
    combined.geometry.computeVertexNormals(); combined.material=material; combined.geometry.computeBoundingBox();
    const c=combined.geometry.boundingBox.getCenter(new THREE.Vector3()); combined.geometry.translate(-c.x,-c.y,-c.z);
    if (hasHole){
      const size=new THREE.Vector3(); combined.geometry.boundingBox.getSize(size);
      const hw=Math.min(holeWidth||edge*0.8, edge*2.2);
      const hh=Math.min(holeHeight||edge*0.8, edge*1.8);
      const hd=size.z+2;
      const hole=new THREE.Mesh(new THREE.BoxGeometry(hw,hh,hd), new THREE.MeshBasicMaterial());
      hole.position.set(-edge*0.25,-edge*0.25,0);
      try{ const sub=CSG.subtract(toCSGReady(combined), toCSGReady(hole)); sub.geometry.computeVertexNormals(); sub.material=material; combined=sub; }
      catch(err){ console.warn('CSG 挖孔失敗，退回未挖孔圖形：', err); }
    }
    mesh=combined;
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(width,height,depth), material);
  }

  // 一律先放到紅色暫存區；禁止直接出現在藍箱
  mesh.rotation.set(0, 0, 0);
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);

  if (!placeInStaging(mesh)) {
    const b=getBoundsForArea('staging', new THREE.Vector3(1,1,1));
    mesh.position.set(stagingPad.position.x, b.minY, stagingPad.position.z);
    ensureInScene(mesh);
    mesh.position.y = findRestingYForArea(mesh, 'staging', new THREE.Vector3(0.5,0.5,0.5));
    clampIntoAreaBounds(mesh);
  }

  // 若誤入藍箱 AABB，立刻救回紅區
  const cbox = new THREE.Box3().setFromObject(container);
  const mbox = new THREE.Box3().setFromObject(mesh);
  if (mbox.intersectsBox(cbox)) rescueToStaging(mesh);

  // ★ 放定點後，做一次解穿透（保險）
  resolvePenetrations(mesh);

  mesh.userData.type = 'custom';
  mesh.userData.originalY = mesh.position.y;
  renderVoidHUD();
}

/* =========================================================
   滑鼠互動（拖曳/旋轉/抬升；全程不重疊 + 邊界約束）
========================================================= */
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

// 拖曳安全回退（新增）
let lastSafePos = null;

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

function liftOutOfOverlap(obj) {
  const sb=new THREE.Box3().setFromObject(obj);
  const s=new THREE.Vector3(); sb.getSize(s);
  const half=s.clone().multiplyScalar(0.5);
  const area=getAreaByXZ(obj.position.x, obj.position.z) || 'container';
  const b=getBoundsForArea(area, half);
  const probe=obj.clone();
  let y=THREE.MathUtils.clamp(obj.position.y, b.minY, b.maxY);
  probe.position.set(obj.position.x, y, obj.position.z);
  let guard=0;
  while (isOverlapping(probe, obj) && y<=b.maxY){ y+=0.5; probe.position.y=y; if (++guard>2000) break; }
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
  while (currentTarget.parent && !currentTarget.userData.type) currentTarget = currentTarget.parent;
  selectedObj = currentTarget; showSelection(selectedObj);

  // 記住安全座標
  lastSafePos = selectedObj.position.clone();

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

    const jumpUp = new TWEEN.Tween(currentTarget.position).to({ y: originalY + jumpHeight }, 150).easing(TWEEN.Easing.Quadratic.Out);
    const fallDown = new TWEEN.Tween(currentTarget.position).to({ y: originalY }, 300).easing(TWEEN.Easing.Bounce.Out);
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
  if (isRotating) { isRotating = false; controls.enabled = true; }
  if (selectedObj) clampIntoAreaBounds(selectedObj);

  if (selectedObj) {
    // ★ 解穿透；若還是重疊就退回最後安全位置
    resolvePenetrations(selectedObj);
    if (isOverlapping(selectedObj, selectedObj) && lastSafePos) {
      selectedObj.position.copy(lastSafePos);
      clampIntoAreaBounds(selectedObj);
      resolvePenetrations(selectedObj);
    }
  }

  renderVoidHUD();
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

  const targetBox=new THREE.Box3().setFromObject(currentTarget);
  const targetSize=new THREE.Vector3(); targetBox.getSize(targetSize);
  const halfSize=targetSize.clone().multiplyScalar(0.5);

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
        clampIntoAreaBounds(currentTarget);
      }

      // 拖曳安全回退（若造成重疊 → 回到 lastSafePos）
      const afterMove = currentTarget.position.clone();
      if (isOverlapping(currentTarget, currentTarget)) {
        currentTarget.position.copy(lastSafePos);
      } else {
        lastSafePos = afterMove.clone();
      }
    }
  } else {
    const area = getAreaByXZ(currentTarget.position.x, currentTarget.position.z) || 'container';
    const b = getBoundsForArea(area, halfSize);
    const dy = (lastMouseY - event.clientY) * 0.1;
    let tryY = THREE.MathUtils.clamp(currentTarget.position.y + dy, b.minY, b.maxY);

    const probe=currentTarget.clone();
    probe.position.set(currentTarget.position.x, tryY, currentTarget.position.z);
    if (!isOverlapping(probe, currentTarget)) currentTarget.position.y = tryY;
    else currentTarget.position.y = liftOutOfOverlap(currentTarget);
    clampIntoAreaBounds(currentTarget);

    // 垂直拖曳也做安全回退
    const afterMove = currentTarget.position.clone();
    if (isOverlapping(currentTarget, currentTarget)) {
      currentTarget.position.copy(lastSafePos);
    } else {
      lastSafePos = afterMove.clone();
    }
    lastMouseY = event.clientY;
  }
});

function nudgeSelectedByArrow(code) {
  if (!isDragging || !selectedObj) return;
  const step = 0.5;
  const sb = new THREE.Box3().setFromObject(selectedObj);
  const size = new THREE.Vector3(); sb.getSize(size);
  const half = size.clone().multiplyScalar(0.5);
  const area = getAreaByXZ(selectedObj.position.x, selectedObj.position.z) || 'container';
  const b = getBoundsForArea(area, half);
  let nx = selectedObj.position.x, ny = selectedObj.position.y, nz = selectedObj.position.z;
  if (spaceDown) { if (code==='ArrowUp') ny+=step; if (code==='ArrowDown') ny-=step; }
  else { if (code==='ArrowLeft') nx-=step; if (code==='ArrowRight') nx+=step; if (code==='ArrowUp') nz-=step; if (code==='ArrowDown') nz+=step; }
  nx = THREE.MathUtils.clamp(nx, b.minX, b.maxX);
  ny = THREE.MathUtils.clamp(ny, b.minY, b.maxY);
  nz = THREE.MathUtils.clamp(nz, b.minZ, b.maxZ);
  const test=selectedObj.clone(); test.position.set(nx,ny,nz);
  if (!isOverlapping(test, selectedObj)) { selectedObj.position.set(nx,ny,nz); clampIntoAreaBounds(selectedObj); }
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { spaceDown = true; e.preventDefault(); }
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) { nudgeSelectedByArrow(e.code); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

renderer.domElement.addEventListener('wheel', (event) => {
  const zoomSpeed = 1.1;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const step = (event.deltaY < 0 ? -1 : 1) * 5; camera.position.addScaledVector(dir, step * zoomSpeed);
});

/* =========================================================
   表單/按鈕事件
========================================================= */
document.getElementById('shapeType').addEventListener('change', (e) => { updateParamVisibility(e.target.value); });
document.getElementById('hasHole').addEventListener('change', () => { updateParamVisibility(); });
document.getElementById('generate').addEventListener('click', () => {
  const type=document.getElementById('shapeType').value;
  const color=normalizeColor(document.getElementById('color').value);
  const hasHole=document.getElementById('hasHole').checked;
  const holeWidth=parseFloat(document.getElementById('holeWidth').value || 0);
  const holeHeight=parseFloat(document.getElementById('holeHeight').value || 0);
  const holeTypeUI=document.getElementById('holeType')?.value;
  const holeAxisUI=document.getElementById('holeAxis')?.value;
  const holeType=(holeTypeUI || defaultHoleTypeByShape(type, hasHole));
  const holeAxis=(holeAxisUI || 'z').toLowerCase();

  let width=20, height=20, depth=20;
  if (type==='cube'){ width=parseFloat(document.getElementById('boxWidth').value || 20); height=parseFloat(document.getElementById('boxHeight').value || 20); depth=parseFloat(document.getElementById('boxDepth').value || 20); }
  else if (type==='circle'){ width=parseFloat(document.getElementById('sphereWidth').value || 20); height=width; depth=width; }
  else if (type==='lshape'){ const unit=parseFloat(document.getElementById('customWidth').value || 20); width=unit; height=unit; depth=unit; }
  else if (TETROMINO_TYPES.has(type)){ width=parseFloat(document.getElementById('boxWidth').value || 20); height=depth=width; }

  addToLibrary({ type, width, height, depth, color, hasHole, holeWidth, holeHeight, holeType, holeAxis });
  createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight, holeType, holeAxis);
  clearFormFields();
});

/* =========================================================
   動畫/Resize
========================================================= */
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
  placeOptimizePanelBelowChart();
});

/* =========================================================
   啟動/載入 OBB & 辨識器
========================================================= */
window.addEventListener('DOMContentLoaded', async () => {
  updateParamVisibility();
  ensureSceneButtons();
  renderVoidHUD();
  try { const mod = await import('three/examples/jsm/math/OBB.js'); OBBClass = mod.OBB; console.log('[OBB] loaded'); }
  catch (e) { console.warn('[OBB] not available, using fallback', e); }
  if ( UNDER_AUTOMATION ) { renderLibrary(); return; }

  const recognize = await createRecognizer();
  document.getElementById('recognizeBtn').addEventListener('click', () => {
    recognize((result) => {
      addToLibrary(result);
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null && val !== '') {
          el.value = val;
          if (id === 'color') el.dispatchEvent(new Event('input'));
        }
      };
      document.getElementById('shapeType').value = result.type;
      document.getElementById('shapeType').dispatchEvent(new Event('change'));
      set("color", result.color);
      if (TETROMINO_TYPES.has(result.type)) set("boxWidth", result.width);
      else if (result.type === "cube") { set("boxWidth", result.width); set("boxHeight", result.height); set("boxDepth", result.depth); }
      else if (result.type === "circle") set("sphereWidth", result.width);
      else if (result.type === "lshape") { document.getElementById('customWidth').value = result.width || 20; set("boxWidth", result.width); }

      const canHole = !TETROMINO_TYPES.has(result.type);
      const holeChk = document.getElementById('hasHole');
      if (holeChk) { holeChk.checked = canHole && !!result.hasHole; holeChk.dispatchEvent(new Event('change')); }
      if (canHole && result.hasHole) { set('holeWidth',  result.holeWidth); set('holeHeight', result.holeHeight); }

      setTimeout(() => { document.getElementById("generate").click(); setTimeout(clearFormFields, 500); }, 100);
    });
  });
  renderLibrary();
});
window.packToTheMax = packToTheMax;
window.stopAnnealing = stopAnnealing;
