import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as ThreeCSG from 'three-csg-ts';
import { createRecognizer } from './recognizer.js';
import * as TWEEN from '@tweenjs/tween.js';

/* =========================================================
   新增/調整【全域旗標 & 小工具】
========================================================= */
// 播放擺放過程錄影
let placementTimeline = [];
let playingTimeline = false;

// 輕量估算旗標（最佳化或 HUD 使用）
let LIGHTWEIGHT_METRICS = false;

// HUD：永遠走輕量估算 + 節流
let HUD_LIGHTWEIGHT = false;
const HUD_THROTTLE_MS = 500;
let _hudNext = 0;

// 模擬退火執行中
let annealRunning = false;

// 退火錄影抽樣
const TIMELINE_SAMPLE_EVERY = 10;
const TIMELINE_MAX_FRAMES = 1200;

// 其他全域
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

// 取樣精度
const VOID_VOXEL_RES = 20;
const VOID_MC_SAMPLES = 0;
const CSG_MAX_BATCH = 12;
const USE_ONLY_CONTAINER = true;

// 佈局體素解析度（能量計算）
const VOXEL_RES = 12;
let PACK_VOXEL_RES = VOXEL_RES;

// 其他 util
const _collideRaycaster = new THREE.Raycaster();
_collideRaycaster.firstHitOnly = false;

/* =========================================================
   UI：裝置提示/按鈕固定/Spinner/小面板/折線圖
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

// 固定上方 UI 位置 & 寬度
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

// Loading 轉圈
function showLoadingSpinner(show = true) {
  let spinner = document.getElementById('loadingSpinner');
  if (!spinner) {
    spinner = document.createElement('div');
    spinner.id = 'loadingSpinner';
    Object.assign(spinner.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: '60px',
      height: '60px',
      border: '6px solid rgba(255,255,255,0.3)',
      borderTop: '6px solid #00ffff',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      zIndex: 9999
    });
    const style = document.createElement('style');
    style.innerHTML = `@keyframes spin {
      from { transform: translate(-50%,-50%) rotate(0deg); }
      to { transform: translate(-50%,-50%) rotate(360deg); }
    }`;
    document.head.appendChild(style);
    document.body.appendChild(spinner);
  }
  spinner.style.display = show ? 'block' : 'none';
}

// 最佳化小面板
function ensureOptimizePanel() {
  let p = document.getElementById('optimizePanel');
  if (p) return p;

  p = document.createElement('div');
  p.id = 'optimizePanel';
  Object.assign(p.style, {
    position: 'fixed', right: '12px', top: '12px',
    width: '260px', background: 'rgba(0,0,0,.65)',
    color: '#fff', padding: '10px 12px', borderRadius: '10px',
    fontFamily: 'system-ui, sans-serif', zIndex: 9999, display: 'none'
  });

  p.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <div id="optSpin" style="
        width:16px;height:16px;border:3px solid rgba(255,255,255,.25);
        border-top-color:#00ffff;border-radius:50%;
        animation: optspin 0.8s linear infinite;"></div>
      <div style="font-weight:600;">最佳化擺放中</div>
      <button id="optStopBtn" style="
        margin-left:auto;background:#ff5a5a;border:none;color:#fff;
        border-radius:6px;padding:4px 8px;cursor:pointer;">停止</button>
    </div>
    <div id="optSub" style="opacity:.85;font-size:12px;margin-top:6px;">初始化…</div>
    <div style="margin-top:8px;height:6px;background:rgba(255,255,255,.15);border-radius:4px;">
      <div id="optBar" style="height:6px;width:0%;background:#00ffff;border-radius:4px;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;opacity:.9;margin-top:6px;font-size:12px;">
      <span id="optStep">0 / 0</span>
      <span id="optVoid">空隙 0.0%</span>
    </div>
  `;
  const style = document.createElement('style');
  style.textContent = `@keyframes optspin {from{transform:rotate(0)}to{transform:rotate(360deg)}}`;
  document.head.appendChild(style);
  document.body.appendChild(p);

  document.getElementById('optStopBtn').addEventListener('click', () => stopAnnealing());
  return p;
}
function showOptimizePanel(show=true){ const p = ensureOptimizePanel(); p.style.display = show?'block':'none'; placeOptimizePanelBelowChart(); }
function updateOptimizePanel({step=0,total=0,subtitle='',emptyPct=null} = {}) {
  ensureOptimizePanel();
  if (subtitle) document.getElementById('optSub').textContent = subtitle;
  if (total > 0) {
    const pct = Math.max(0, Math.min(100, (step/total)*100));
    document.getElementById('optBar').style.width = pct + '%';
    document.getElementById('optStep').textContent = `${step} / ${total}`;
  }
  if (emptyPct != null) {
    document.getElementById('optVoid').textContent = `空隙 ${emptyPct.toFixed(1)}%`;
  }
}

// 收斂曲線（右上角）
const ConvergenceChart = (() => {
  const S = { el:null, cvs:null, ctx:null, data:[], start:0, raf:0, maxPts:600, running:false, w:280, h:140 };
  function ensureUI() {
    if (S.el) return;
    const el = document.createElement('div');
    el.id = 'convChart';
    Object.assign(el.style, {
      position:'fixed', right:'12px', top:'12px', zIndex:9998,
      background:'rgba(0,0,0,.55)', borderRadius:'10px',
      padding:'8px', color:'#fff', fontFamily:'system-ui,sans-serif',
      userSelect:'none', pointerEvents:'none'
    });
    const title = document.createElement('div');
    title.textContent = '收斂曲線（空隙 %）';
    Object.assign(title.style, { fontSize:'12px', opacity:.9, marginBottom:'4px' });

    const cvs = document.createElement('canvas');
    cvs.width = S.w; cvs.height = S.h; cvs.style.display = 'block';

    el.appendChild(title); el.appendChild(cvs); document.body.appendChild(el);
    S.el = el; S.cvs = cvs; S.ctx = cvs.getContext('2d'); fitDPR(); addEventListener('resize', fitDPR);
  }
  function fitDPR(){ if (!S.cvs) return; const dpr = Math.min(window.devicePixelRatio||1,2); S.cvs.width=Math.round(S.w*dpr); S.cvs.height=Math.round(S.h*dpr); S.cvs.style.width=S.w+'px'; S.cvs.style.height=S.h+'px'; }
  function pushPoint(){ const r = measureBlueVoid(); const y = Math.max(0, Math.min(100, r.emptyRatio*100)); const t=(performance.now()-S.start)/1000; S.data.push({t,y}); if (S.data.length>S.maxPts) S.data.shift(); }
  function yToPix(y){ const p=S.cvs.height/(Math.min(window.devicePixelRatio||1,2)); return Math.round((1 - y/100) * (p - 18) + 6); }
  function xToPix(i){ const dpr=Math.min(window.devicePixelRatio||1,2); const w=S.w; const n=Math.max(1,S.data.length-1); return Math.round((i/n)*(w-16)+8)*dpr; }
  function draw(){
    const dpr=Math.min(window.devicePixelRatio||1,2); const ctx=S.ctx; if (!ctx) return;
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,S.w,S.h);
    ctx.strokeStyle='rgba(255,255,255,.25)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(32,6); ctx.lineTo(32,S.h-14); ctx.lineTo(S.w-6,S.h-14); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.7)'; ctx.font='10px system-ui';
    [0,25,50,75,100].forEach(v=>{ const y=yToPix(v); ctx.fillText(String(v),6,y+3); ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo(32,y); ctx.lineTo(S.w-6,y); ctx.stroke(); });
    if (S.data.length<2) return;
    ctx.save(); ctx.beginPath();
    for (let i=0;i<S.data.length;i++){ const px=xToPix(i)/dpr; const py=yToPix(S.data[i].y); if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); }
    ctx.lineWidth=2; ctx.strokeStyle='#5ad3ff'; ctx.stroke(); ctx.restore();
    const latest=S.data[S.data.length-1].y; ctx.fillStyle='#fff'; ctx.font='11px system-ui'; ctx.fillText(`${latest.toFixed(1)}%`, S.w-52, S.h-22);
  }
  function loop(){ if (!S.running) return; if (!S._last || performance.now()-S._last>300){ S._last=performance.now(); pushPoint(); draw(); } S.raf=requestAnimationFrame(loop); }
  function start(){ ensureUI(); S.data=[]; S.start=performance.now(); S.running=true; S._last=0; cancelAnimationFrame(S.raf); loop(); }
  function stop(){ S.running=false; cancelAnimationFrame(S.raf); pushPoint(); draw(); }
  return { start, stop, draw };
})();

// 讓最佳化小面板放在折線圖之下
function placeOptimizePanelBelowChart(){
  const p = document.getElementById('optimizePanel');
  if (!p) return;
  const c = document.getElementById('convChart');
  Object.assign(p.style, { position:'fixed', right:'12px' });
  const topPx = c ? (c.getBoundingClientRect().bottom + 12) : 12;
  p.style.top = `${topPx}px`;
}
window.addEventListener('resize', placeOptimizePanelBelowChart);

/* =========================================================
   場景初始化
========================================================= */
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

// 托盤
const palletGeometry = new THREE.BoxGeometry(110, 10, 110);
const palletMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
const pallet = new THREE.Mesh(palletGeometry, palletMaterial);
pallet.position.y = -5;
scene.add(pallet);

// 藍色容器（置中於托盤上）
const containerGeometry = new THREE.BoxGeometry(110, 110, 110);
const containerMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide
});
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

// 紅色暫存區
const stagingSize = 220;
const stagingPad = new THREE.Mesh(new THREE.BoxGeometry(stagingSize, 8, stagingSize), new THREE.MeshBasicMaterial({ color: 0x777777 }));
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

/* =========================================================
   資料/工具：Library、Volume、CSG、OBB…
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
   藍箱內部空隙估算（CSG 優先，否則回退）
========================================================= */
function makeContainerInteriorMesh() {
  const cb = new THREE.Box3().setFromObject(container);
  const palletTop = pallet.position.y + pallet.geometry.parameters.height / 2;
  const w = cb.max.x - cb.min.x, h = cb.max.y - palletTop, d = cb.max.z - cb.min.z;
  if (h <= 0) return null;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshBasicMaterial());
  m.position.set((cb.min.x+cb.max.x)/2, palletTop + h/2, (cb.min.z+cb.max.z)/2);
  m.updateMatrixWorld(true);
  return m;
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
// ⭐ HUD：走輕量 + 節流
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
  LIGHTWEIGHT_METRICS = false; // 單次精準
  const r = measureBlueVoid();
  LIGHTWEIGHT_METRICS = prev;
  const msg = `空隙 ${(r.emptyRatio*100).toFixed(1)}%`;
  console.log('[Blue-Container Void]', r, msg);
  uiToast(msg, 2200);
  renderVoidHUD();
}

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
  // 球體快測
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
/* function measureBlueVoid() {
  const box = new THREE.Box3().setFromObject(container); // ✅ 只看藍色容器
  const containerVolume = (box.max.x - box.min.x) * (box.max.y - box.min.y) * (box.max.z - box.min.z);

  const objsInside = objects.filter(o => {
    const b = new THREE.Box3().setFromObject(o);
    return b.min.x >= box.min.x && b.max.x <= box.max.x &&
           b.min.y >= box.min.y && b.max.y <= box.max.y &&
           b.min.z >= box.min.z && b.max.z <= box.max.z;
  });

  let solidVolume = 0;
  for (const o of objsInside) {
    try {
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const mesh = new THREE.Mesh(g);
      const csg = ThreeCSG.fromMesh(mesh);
      solidVolume += Math.abs(csg.calcVolume());
    } catch {}
  }

  const emptyRatio = 1 - solidVolume / containerVolume;
  return { emptyRatio, containerVolume, solidVolume };
} */
function measureBlueVoid() {
  // ✅ 僅計算藍色容器內的體積與空隙
  const containerBox = new THREE.Box3().setFromObject(container);
  const containerVolume =
    (containerBox.max.x - containerBox.min.x) *
    (containerBox.max.y - containerBox.min.y) *
    (containerBox.max.z - containerBox.min.z);

  // 🟦 找出所有與藍色容器相交的物體
  const objsInside = objects.filter(o => {
    const b = new THREE.Box3().setFromObject(o);
    // 排除紅色暫存區及其他外部物體
    const stagingBox = new THREE.Box3().setFromObject(stagingFrame);
    if (b.intersectsBox(stagingBox)) return false;
    // 若物體與藍色容器相交則計算
    return b.intersectsBox(containerBox);
  });

  // 🧮 計算這些物體在藍色容器中所佔體積
  let solidVolume = 0;
  for (const o of objsInside) {
    try {
      // 取物體幾何形狀
      const geom = o.geometry.clone();
      geom.applyMatrix4(o.matrixWorld);
      const mesh = new THREE.Mesh(geom);

      // ✳️ 與容器內部做交集，避免算出超出部分
      const containerMesh = toCSGReady(container.clone());
      const objMesh = toCSGReady(mesh);
      const clipped = CSG.intersect(objMesh, containerMesh);
      solidVolume += Math.abs(_meshWorldVolume(clipped));
    } catch (err) {
      // 若 CSG 失敗則 fallback
      const b = new THREE.Box3().setFromObject(o);
      const vol =
        (b.max.x - b.min.x) *
        (b.max.y - b.min.y) *
        (b.max.z - b.min.z);
      solidVolume += vol * 0.8; // 假設 80% 位於內部
    }
  }

  const emptyRatio = Math.max(0, 1 - solidVolume / containerVolume);
  return { emptyRatio, containerVolume, solidVolume };
}

/* =========================================================
   幾何檢測：OBB/CSG/Sphere/Fallback
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
function meshesReallyIntersect(a,b){
  const ba=new THREE.Box3().setFromObject(a); const bb=new THREE.Box3().setFromObject(b);
  if (!ba.intersectsBox(bb)) return false;
  const aSphere=!!a.userData?.isSphere; const bSphere=!!b.userData?.isSphere;
  if (aSphere && bSphere) return sphereVsSphereIntersect(a,b);
  if (aSphere){ let hit=false; b.traverse(n=>{ if(!hit && n.isMesh) hit=sphereIntersectsMeshTriangles(a,n); }); if (hit) return true; }
  else if (bSphere){ let hit=false; a.traverse(n=>{ if(!hit && n.isMesh) hit=sphereIntersectsMeshTriangles(b,n); }); if (hit) return true; }
  const r=meshesReallyIntersect_OBB(a,b); if (r===true) return true;
  if (meshesReallyIntersect_Fallback(a,b)) return true;
  if (aSphere||bSphere) return false;
  return meshesReallyIntersect_CSG(a,b);
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

// ⭐ 關鍵：強制物體扣回區域邊界 & Y 找落點（防超出）
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
function isOverlapping(ncandidate, ignore = null) {
  const candMeshes=[]; ncandidate.updateMatrixWorld(true);
  ncandidate.traverse(n=>{ if (n.isMesh) candMeshes.push(n); });

  const sameArea = areaOf(ncandidate);
  for (const obj of objects) {
    if (obj === ignore) continue;
    if (areaOf(obj) !== sameArea) continue;

    const otherMeshes=[]; obj.updateMatrixWorld(true);
    obj.traverse(n=>{ if (n.isMesh) otherMeshes.push(n); });

    for (const cm of candMeshes) {
      for (const om of otherMeshes) {
        const a=new THREE.Box3().setFromObject(cm);
        const b=new THREE.Box3().setFromObject(om);
        if (!a.intersectsBox(b)) continue;
        if (meshesReallyIntersect(cm, om)) return true;
      }
    }
  }
  return false;
}
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
   擺放/暫存/壓實/退火
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
  if (best.energy + 1e-9 < eBase) { obj.rotation.copy(best.rot); obj.position.copy(best.pos); clampIntoAreaBounds(obj); return true; }
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
  renderVoidHUD();
  return true;
}
function placeInStaging(mesh) {
  const box=new THREE.Box3().setFromObject(mesh);
  const size=new THREE.Vector3(); box.getSize(size);
  const half=size.clone().multiplyScalar(0.5);

  const bounds=getBoundsForArea('staging', half);
  /* const grid=mesh.userData?.unit || null;
  const step=grid ? Math.max(grid/2, 0.35) : Math.max(0.35, Math.min(size.x, size.z)/8);
  const snap=(v,g)=> g?Math.round(v/g)*g:v; */
  let x = bounds.minX;
  let z = bounds.minZ;
  let y = bounds.minY + half.y;
  let layerHeight = size.y;

  const stepX = size.x + 2;
  const stepZ = size.z + 2;
  let placed=false;
  outer:
  for (let j = 0; j < 100 && !placed; j++) {
    for (let i = 0; i < 100 && !placed; i++) {
      mesh.position.set(x + i * stepX, y, z + j * stepZ);
      mesh.position.y = findRestingYForArea(mesh, 'staging', half);
      clampIntoAreaBounds(mesh);
      if (!isOverlapping(mesh)) {
        ensureInScene(mesh);
        placed = true;
        break outer;
      }
    }
  }
  if (!placed) {
    console.warn('暫存區已滿或放置失敗');
    return false;
  }
  renderVoidHUD();
  return true;
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

  // 初始放到暫存區（穩定）
  mesh.rotation.set(0,0,0);
  mesh.position.set(0,0,0);
  mesh.updateMatrixWorld(true);

  if (!placeInStaging(mesh)) {
    const b=getBoundsForArea('staging', new THREE.Vector3(1,1,1));
    mesh.position.set(stagingPad.position.x, b.minY, stagingPad.position.z);
    ensureInScene(mesh);
    mesh.position.y = findRestingYForArea(mesh, 'staging', new THREE.Vector3(0.5,0.5,0.5));
    clampIntoAreaBounds(mesh);
  }
  mesh.userData.type='custom'; mesh.userData.originalY=mesh.position.y;
  renderVoidHUD();
}

/* =========================================================
   滑鼠互動（拖曳/旋轉/抬升）
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
  if (selectedObj) clampIntoAreaBounds(selectedObj); // ⭐ 放手時強制扣邊 + 找落點
  renderVoidHUD(); // 放手才更新（避免拖曳卡頓）
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
      if (!isOverlapping(testBox, currentTarget)) currentTarget.position.set(newPos.x, currentTarget.position.y, newPos.z);
      clampIntoAreaBounds(currentTarget);
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
    lastMouseY = event.clientY;
  }
  // 🚫 拖曳中不更新 HUD，避免卡頓
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
  if (UNDER_AUTOMATION) { renderLibrary(); return; }
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