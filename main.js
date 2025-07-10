import * as THREE from 'three';
import { CSG } from 'three-csg-ts';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

camera.position.set(0, 200, 0);
camera.lookAt(0, 0, 0);
camera.up.set(0, 0, -1);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50, 50, 100);
scene.add(light);

const palletGeometry = new THREE.BoxGeometry(100, 10, 100);
const palletMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
const pallet = new THREE.Mesh(palletGeometry, palletMaterial);
pallet.position.y = -5;
scene.add(pallet);

let cube = null;



function createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight) {
    if (cube) {
        pallet.remove(cube);
        cube.geometry.dispose();
        cube.material.dispose();
    }

    const material = new THREE.MeshStandardMaterial({ color });
    let mesh;

    if (type === 'cube') {
        const outer = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        
        if (hasHole) {
            const inner = new THREE.Mesh(new THREE.BoxGeometry(holeWidth, holeHeight, depth + 2), material);
            //inner.position.z = 0
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
            //inner.position.z = 0;
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
    }else if (type === 'lshape') {
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
    
    const box = new THREE.Box3().setFromObject(mesh);
    const objectHeight = box.max.y - box.min.y;

    const palletTopY = pallet.position.y + pallet.geometry.parameters.height / 2;
    const cubeBottomY = objectHeight / 2;

    mesh.position.set(0, palletTopY + cubeBottomY, 0);
    cube = mesh;
    pallet.add(cube);
}

let isDragging = false;
let isMoving = false;
let currentTarget = null;
let offset = new THREE.Vector3();
let previousMousePosition = { x: 0, y: 0 };
let mouseDownTime = 0;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeIntersect = new THREE.Vector3();


renderer.domElement.addEventListener('mousedown', (event) => {
    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
    mouseDownTime = performance.now();
    isDragging = true;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const targets = [pallet];
    if (cube) targets.push(cube);

    const intersects = raycaster.intersectObjects(targets, true);
    if (intersects.length > 0) {
        currentTarget = intersects[0].object;
        if (currentTarget === cube) {
            raycaster.ray.intersectPlane(plane, planeIntersect);
            offset.copy(planeIntersect).sub(cube.getWorldPosition(new THREE.Vector3()));
        }
    }
});

renderer.domElement.addEventListener('mouseup', () => {
    isDragging = false;
    isMoving = false;
    //selectedObject = null;
    currentTarget = null;

});
renderer.domElement.addEventListener('mousemove',(event) =>{
    if(!isDragging || !currentTarget) return;

    const heldTime = performance.now() - mouseDownTime;

    const deltaMove = {
        x : event.clientX - previousMousePosition.x,
        y : event.clientY - previousMousePosition.y
    };

    if(heldTime > 200 && currentTarget === cube){
        isMoving = true;
    }

    if(isMoving && currentTarget === cube){
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        if (raycaster.ray.intersectPlane(plane, planeIntersect)) {
            //selectedObject.position.copy(planeIntersect.sub(offset));
            //selectedObject.position.y = 10;
            const local = pallet.worldToLocal(planeIntersect.clone().sub(offset));
            cube.position.set(local.x, 10, local.z);
        }
    } else{
        //const deltaRotationQuaternion = new THREE.Quaternion()
            //.setFromEuler(new THREE.Euler(
                //toRadians(deltaMove.y * 0.5),
                //toRadians(deltaMove.x * 0.5),
                //0,
                //'XYZ'
            //));
        //cube.quaternion.multiplyQuaternions(deltaRotationQuaternion, cube.quaternion);
        const target = currentTarget === pallet ? pallet : cube;
        const rotationSpeed = 0.005;
        target.rotation.y += deltaMove.x * rotationSpeed;
        target.rotation.x += deltaMove.y * rotationSpeed;
    }

    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
});


renderer.domElement.addEventListener('wheel', (event)=>{
    const zoomSpeed = 1.1;
    if (event.deltaY < 0){
        camera.position.multiplyScalar(1 / zoomSpeed);
    }else{
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

