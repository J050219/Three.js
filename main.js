import * as THREE from 'three';
import { CSG } from 'three-js-csg';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize( window.innerWidth, window.innerHeight );
//renderer.setAnimationLoop( animate );
//document.body.style.margin = 0;
document.body.appendChild( renderer.domElement );

camera.position.set(0, 0, 100);

//const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50, 50, 100);
scene.add(light);

let cube = null;

function createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight) {
    if (cube) {
        scene.remove(cube);
        cube.geometry.dispose();
        cube.material.dispose();
    }

    const material = new THREE.MeshStandardMaterial({ color });
    let mesh;

    if (type === 'box' || type === 'cube') {
        const outer = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        if (hasHole) {
            const inner = new THREE.Mesh(new THREE.BoxGeometry(holeWidth, holeHeight, depth + 1));
            mesh = CSG.subtract(outer, inner);
        } else {
            mesh = outer;
        }
    }
    else if (type === 'sphere') {
        const outer = new THREE.Mesh(new THREE.SphereGeometry(width / 2, 32, 32), material);
        if (hasHole) {
            const inner = new THREE.Mesh(new THREE.SphereGeometry(holeWidth / 2, 32, 32));
            mesh = CSG.subtract(outer, inner);
        } else {
            mesh = outer;
        }
    }
    else if (type === 'custom') {
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
    cube = mesh;
    mesh.position.set(0, 0, 0);
    scene.add(mesh);
}

document.getElementById('hasHole').addEventListener('change', (e) => {
    document.getElementById('holeInput').style.display = e.target.checked ? 'block' : 'none';
});

document.getElementById('generate').addEventListener('click', () => {
    const type = document.getElementById('shapeType').value;
    const width = parseFloat(document.getElementById('width').value);
    const height = parseFloat(document.getElementById('height').value);
    const depth = parseFloat(document.getElementById('depth').value);
    const color = document.getElementById('color').value;
    const hasHole = document.getElementById('hasHole').checked;
    const holeWidth = parseFloat(document.getElementById('holeWidth').value);
    const holeHeight = parseFloat(document.getElementById('holeHeight').value);

    createCube(type, width, height, depth, color, hasHole, holeWidth, holeHeight);
});

createCube('box', 20, 20, 20, '#00ff00', false, 0, 0);

//const mouse = new THREE.Vector2();
//const raycaster = new THREE.Raycaster();
//const point = new THREE.Vector3();
//const lastMouse = new THREE.Vector2();
//const delta = new THREE.Vector2();


//window.addEventListener('mousemove', (event) => {
    //const newMouseX = (event.clientX / window.innerWidth) * 2 - 1;
    //const newMouseY = -(event.clientY / window.innerHeight) * 2 + 1;

    //delta.x = mouse.x - lastMouse.x;
    //delta.y = mouse.y - lastMouse.y;

    //mouse.x = newMouseX;
    //mouse.y = newMouseY;

    //lastMouse.set(newMouseX, newMouseY);
//});

function animate() {

    requestAnimationFrame( animate );

    //raycaster.setFromCamera(mouse, camera);
    //const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    //raycaster.ray.intersectPlane(planeZ, point);

    //cube.position.copy(point, 0.9);

    //手動旋轉
    //cube.rotation.x += delta.x * 2;
    //cube.rotation.y += delta.y * 2;
    //delta.set(0, 0);
    
    //自動旋轉
    if(cube){
        cube.rotation.y += 0.01;
    }
    renderer.render( scene, camera );
}
animate();