import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize( window.innerWidth, window.innerHeight );
//renderer.setAnimationLoop( animate );
//document.body.style.margin = 0;
document.body.appendChild( renderer.domElement );

camera.position.set(0, 0, 100);

let cube = null;

function createCube(type, width, height, depth, color) {
    if (cube) {
        scene.remove(cube);
        cube.geometry.dispose();
        cube.material.dispose();
    }

    let geometry;
    if (type === 'box') {
        geometry = new THREE.BoxGeometry(width, height, depth);
    }
    else if (type === 'circle') {
        const radius = Math.max(1 ,width / 2);
        geometry = new THREE.SphereGeometry(radius, 32, 32);
    }
    else if (type === 'lshape') {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, height);
        shape.lineTo(width/2, height);
        shape.lineTo(width/2, height/2);
        shape.lineTo(width, height/2);
        shape.lineTo(width, 0);
        shape.lineTo(0, 0);

        const hole = new THREE.Path();
        hole.moveTo(width/4, height/4);
        hole.lineTo(width * 0.75, height/4);
        hole.lineTo(width * 0.75, height/4 + 5);
        hole.lineTo(width/4, height/4 + 5);
        hole.lineTo(width/4, height/4);
        shape.holes.push(hole);
        geometry = new THREE.ExtrudeGeometry(shape, {depth: depth, bevelEnabled: false});
    }

    const material = new THREE.MeshBasicMaterial({ color });
    cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
}

document.getElementById('generate').addEventListener('click', () => {
    const type = document.getElementById('shapeType').value;
    const width = parseFloat(document.getElementById('width').value);
    const height = parseFloat(document.getElementById('height').value);
    const depth = parseFloat(document.getElementById('depth').value);
    const color = document.getElementById('color').value;

    createCube(type, width, height, depth, color);
});

createCube('box', 20, 20, 20, '#00ff00');

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
        cube.rotation.x += 0.005;
        cube.rotation.y += 0.01;
        cube.rotation.z += 0.01;
    }
    renderer.render( scene, camera );
}
animate();