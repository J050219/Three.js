import * as THREE from 'three'; 
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSG } from 'three-csg-ts';
import TWEEN from '@tweenjs/tween.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.set(0, 150, 150);
camera.lookAt(0, 0, 0);

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

const palletGeometry = new THREE.BoxGeometry(100, 10, 100);
const palletMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
const pallet = new THREE.Mesh(palletGeometry, palletMaterial);
pallet.position.y = -5;
//pallet.rotation.set(0, 0, 0);
//pallet.userData.type = 'pallet';
scene.add(pallet);

const containerGeometry = new THREE.BoxGeometry(100, 100, 100);
const containerMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide
});
const container = new THREE.Mesh(containerGeometry, containerMaterial);
container.position.y = 45;
scene.add(container);

const objects = [];

function createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight) {
  
    const material = new THREE.MeshStandardMaterial({ color });
    let mesh;

    if (type === 'cube') {
        const outer = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        
        if (hasHole) {
            const inner = new THREE.Mesh(new THREE.BoxGeometry(holeWidth, holeHeight, depth + 2), material);
            
            outer.updateMatrix();
            inner.updateMatrix();
        
            try{
                const result = CSG.subtract(outer, inner);
                result.geometry.computeVertexNormals();
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
                result.geometry,computeVertexNormals();
                mesh = result;
            }catch(err){
                console.error('CSG subtraction failed:',err);
                mesh = outer;
            }  
        } else {
            mesh = outer;
        }
    } else if (type === 'lshape') {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, height);
        shape.lineTo(width * 0.4, height);
        shape.lineTo(width * 0.6, height * 0.6);
        shape.lineTo(width, height * 0.6);
        shape.lineTo(width, 0);
        shape.lineTo(0, 0);

        if (hasHole) {
            const hole = new THREE.Path();
            hole.moveTo(width / 2 - holeWidth / 2, height / 2 - holeHeight / 2);
            hole.lineTo(width / 2 + holeWidth / 2, height / 2 - holeHeight / 2);
            hole.lineTo(width / 2 + holeWidth / 2, height / 2 + holeHeight / 2);
            hole.lineTo(width / 2 - holeWidth / 2, height / 2 + holeHeight / 2);
            hole.lineTo(width / 2 - holeWidth / 2, height / 2 - holeHeight / 2);
            shape.holes.push(hole);
        }

        const geometry = new THREE.ExtrudeGeometry(shape,{depth, bevelEnabled: false});
        mesh = new THREE.Mesh(geometry, material);
    }

    mesh.userData.type = 'custom';
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const palletTopY = pallet.position.y + pallet.geometry.parameters.height / 2;
    mesh.position.set(0, palletTopY + size.y / 2, 0);
    scene.add(mesh);
    objects.push(mesh);
    mesh.userData.originalY = mesh.position.y;
}

let isDragging = false;
//let isMoving = false;
let currentTarget = null;
let offset = new THREE.Vector3();
//let previousMousePosition = { x: 0, y: 0 };

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
//const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeIntersect = new THREE.Vector3();

//let isRightMouse = false;

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('mousedown', (event) => {
    //if (event.button === 2) {
        //isDragging = true;
        //isRightMouse = event.button === 2;
        //previousMousePosition = {
            //x: event.clientX,
            //y: event.clientY
        //};    
        //if (isRightMouse) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(objects.filter(obj => obj.userData.type === 'custom'), true);
    if (intersects.length === 0) return;

    currentTarget = intersects[0].object;
    while (currentTarget.parent && !currentTarget.userData.type) {
        currentTarget = currentTarget.parent;
    }

    if (event.button === 0) {
        const jumpHeight = 10;
        const jumpUp = new TWEEN.Tween(currentTarget.position)
            .to({ y: currentTarget.userData.originalY + jumpHeight }, 150)
            .easing(TWEEN.Easing.Quadratic.Out);

        const fallDown = new TWEEN.Tween(currentTarget.position)
            .to({ y: currentTarget.userData.originalY }, 300)
            .easing(TWEEN.Easing.Bounce.Out);

        jumpUp.chain(fallDown).start();
    }

    if (event.button === 2) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        raycaster.ray.intersectPlane(plane, planeIntersect);
        offset.copy(planeIntersect).sub(currentTarget.position);
        isDragging = true;        
    }
});

renderer.domElement.addEventListener('mouseup', () => {
    isDragging = false;
    currentTarget = null;
});

renderer.domElement.addEventListener('mousemove',(event) =>{
    if (!isDragging || !currentTarget) return;
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (raycaster.ray.intersectPlane(plane, planeIntersect)) {
        const newPos = planeIntersect.clone().sub(offset);
        const containerBox = new THREE.Box3().setFromObject(container);
        const targetBox = new THREE.Box3().setFromObject(currentTarget);
        const targetSize = new THREE.Vector3();
        targetBox.getSize(targetSize);
        const halfSize = targetSize.clone().multiplyScalar(0.5);

        // 限制在 container 內
        const min = containerBox.min.clone().add(halfSize);
        const max = containerBox.max.clone().sub(halfSize);
        newPos.x = THREE.MathUtils.clamp(newPos.x, min.x, max.x);
        newPos.z = THREE.MathUtils.clamp(newPos.z, min.z, max.z);
        currentTarget.position.set(newPos.x, pallet.position.y + pallet.geometry.parameters.height / 2 + targetSize.y / 2, newPos.z);
    }
});


renderer.domElement.addEventListener('wheel', (event) => {
    const zoomSpeed = 1.1;
    if (event.deltaY < 0) {
        camera.position.multiplyScalar(1 / zoomSpeed);
    } else {
        camera.position.multiplyScalar(zoomSpeed);
    }
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, 20, 300);
});

function animate(time) {
    requestAnimationFrame( animate );
    controls.update();
    TWEEN.update(time);
    renderer.render( scene, camera );
}
animate();

document.getElementById('shapeType').addEventListener('change', (e) => {
    const value = e.target.value;
    document.getElementById('boxParams').style.display = (value === 'cube') ? 'block' : 'none';
    document.getElementById('sphereParams').style.display = (value === 'circle') ? 'block' : 'none';
    document.getElementById('customParams').style.display = (value === 'lshape') ? 'block' : 'none';
});

document.getElementById('hasHole').addEventListener('change', (e) => {
    document.getElementById('holeInput').style.display = e.target.checked ? 'block' : 'none';
});

document.getElementById('generate').addEventListener('click', () => {
    const type = document.getElementById('shapeType').value;
    const color = document.getElementById('color').value;
    const hasHole = document.getElementById('hasHole').checked;
    const holeWidth = parseFloat(document.getElementById('holeWidth').value);
    const holeHeight = parseFloat(document.getElementById('holeHeight').value);

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
    }
    createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight);
});

createCube('cube', 20, 20, 20, '#00ff00', false, 0, 0);
