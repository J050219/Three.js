import * as THREE from 'three';
import { CSG } from 'three-csg-ts';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

camera.position.set(0, 150, 150);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50, 50, 100);
scene.add(light);

const palletGeometry = new THREE.BoxGeometry(100, 10, 100);
const palletMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
const pallet = new THREE.Mesh(palletGeometry, palletMaterial);
pallet.position.y = -5;
pallet.rotation.set(0, 0, 0);
pallet.userData.type = 'pallet';
scene.add(pallet);

const objects = [pallet];

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
}

let isDragging = false;
//let isMoving = false;
let currentTarget = null;
let offset = new THREE.Vector3();
let previousMousePosition = { x: 0, y: 0 };

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeIntersect = new THREE.Vector3();

let isRightMouse = false;

renderer.domElement.addEventListener('mousedown', (event) => {
    isDragging = true;
    isRightMouse = event.button === 2;
    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };    
    if (isRightMouse) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(objects.filter(obj => obj.userData.type === 'custom'), true);
        if (intersects.length > 0) {
            currentTarget = intersects[0].object;
            while (currentTarget.parent && !currentTarget.userData.type) {
                currentTarget = currentTarget.parent;
            }
            raycaster.ray.intersectPlane(plane, planeIntersect);
            offset.copy(planeIntersect).sub(currentTarget.position);
        }
    }
});

renderer.domElement.addEventListener('mouseup', () => {
    isDragging = false;
    //isMoving = false;
    //if (currentTarget && currentTarget.userData.type === 'custom') {
        //currentTarget.rotation.x = 0;
        //currentTarget.rotation.z = 0;
        //const box = new THREE.Box3().setFromObject(currentTarget);
        //const size = new THREE.Vector3();
        //box.getSize(size);
        //const palletTopY = pallet.position.y + pallet.geometry.parameters.height / 2;
        //currentTarget.position.y = palletTopY + size.y / 2;
    //}
    currentTarget = null;
    //mouseButton = -1;
});

renderer.domElement.addEventListener('mousemove',(event) =>{
    if(!isDragging ) return;

    //const heldTime = performance.now() - mouseDownTime;

    const deltaMove = {
        x : event.clientX - previousMousePosition.x,
        y : event.clientY - previousMousePosition.y
    };

    if (isRightMouse && currentTarget) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(plane, planeIntersect)) {
            currentTarget.position.set(
                planeIntersect.x - offset.x,
                currentTarget.position.y,
                planeIntersect.z - offset.z
            );
        }
    } else if (!isRightMouse) {
        const angle = 0.005;
        scene.rotation.y += deltaMove.x * angle;
        scene.rotation.x += deltaMove.y * angle;
    }
    previousMousePosition = { x: event.clientX, y: event.clientY };
});

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('wheel', (event) => {
    const zoomSpeed = 1.1;
    if (event.deltaY < 0) {
        camera.position.multiplyScalar(1 / zoomSpeed);
    } else {
        camera.position.multiplyScalar(zoomSpeed);
    }
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, 20, 300);
});

function animate() {
    requestAnimationFrame( animate );
    //自動旋轉
    //if(cube){
        //cube.rotation.y += 0.01;
    //}
    renderer.render( scene, camera );
}
animate();

//function toRadians(angle){
    //return angle * (Math.PI /180)
//}

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
