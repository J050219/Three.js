import * as THREE from 'three'; 
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSG } from 'three-csg-ts';
import { createRecognizer } from './recognizer.js';
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

function isOverlapping(newBox, ignore = null) {
    const newBoxBounds = [];
    newBox.updateMatrixWorld(true);
    newBox.traverse(child => {
        if (child.isMesh) {
            const box = new THREE.Box3().setFromObject(child);
            newBoxBounds.push(box);
        }
    });
    for (const obj of objects) {
        if (obj === ignore) continue;
        obj.updateMatrixWorld(true);
        const objBoxes = [];
        obj.traverse(child => {
            if (child.isMesh) {
                const box = new THREE.Box3().setFromObject(child);
                objBoxes.push(box);
            }
        });
        for (const newBound of newBoxBounds) {
            for (const box of objBoxes) {
                if (newBound.intersectsBox(box)) {
                    const minA = newBound.min;
                    const maxA = newBound.max;
                    const minB = box.min;
                    const maxB = box.max;
                    const vertical = maxA.y <= minB.y || minA.y >= maxB.y;
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
                result.geometry.computeVertexNormals();
                mesh = result;
            }catch(err){
                console.error('CSG subtraction failed:',err);
                mesh = outer;
            }  
        } else {
            mesh = outer;
        }
    } else if (type === 'lshape') {
        const mat = material;

        const verticalBox = new THREE.Mesh(
            new THREE.BoxGeometry(width * 0.4, height, depth), mat
        );
        verticalBox.position.set(-width * 0.3, 0, 0);

        const horizontalBox = new THREE.Mesh(
            new THREE.BoxGeometry(width, height * 0.4, depth), mat
        );
        horizontalBox.position.set(0, -height * 0.3, 0);

        const lGroup = new THREE.Group();
        lGroup.add(verticalBox);
        lGroup.add(horizontalBox);
        mesh = lGroup;

        if (hasHole) {
            const holeBox = new THREE.Mesh(
                new THREE.BoxGeometry(holeWidth, holeHeight, depth + 2), mat
            );
            holeBox.position.set(0, 0, 0);
            try {
                lGroup.updateMatrixWorld(true);
                holeBox.updateMatrix();
                mesh = CSG.subtract(lGroup, holeBox);
                mesh.geometry.computeVertexNormals();
            } catch (err) {
                console.error("CSG subtraction failed:", err);
                mesh = lGroup;
            }
        }
    }
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const containerBox = new THREE.Box3().setFromObject(container);
    const padding = 0.1; 
    const step = 0.5;
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
}

let isDragging = false;
let currentTarget = null;
let offset = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const planeIntersect = new THREE.Vector3();

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (event) => {
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
        const min = containerBox.min.clone().add(halfSize);
        const max = containerBox.max.clone().sub(halfSize);
        newPos.x = THREE.MathUtils.clamp(newPos.x, min.x, max.x);
        newPos.z = THREE.MathUtils.clamp(newPos.z, min.z, max.z);
        const testBox = currentTarget.clone();
        testBox.position.set(newPos.x, currentTarget.position.y, newPos.z);
        if (!isOverlapping(testBox, currentTarget)) {
            currentTarget.position.set(newPos.x, currentTarget.position.y, newPos.z);
        }
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

const video = document.createElement('video');
video.autoplay = true;
video.width = 640;
video.height = 480;
video.style.display = 'none';
document.body.appendChild(video);

const recognize = await createRecognizer(video);