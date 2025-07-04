import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize( window.innerWidth, window.innerHeight );
//renderer.setAnimationLoop( animate );
document.body.style.margin = 0;
document.body.appendChild( renderer.domElement );

camera.position.z = 100;

const shape = new THREE.Shape(); 
shape.moveTo(0, 0);
shape.lineTo(0, 40);
shape.lineTo(20, 40);
shape.lineTo(20, 20);
shape.lineTo(40, 20);
shape.lineTo(40, 0);
shape.lineTo(0, 0);

const hole = new THREE.Path();
hole.moveTo(8, 8);
hole.lineTo(8, 24);
hole.lineTo(16, 24);
hole.lineTo(16, 16);
hole.lineTo(24, 16);
hole.lineTo(24, 8);
hole.lineTo(8, 8);
shape.holes.push(hole);

const extrudeSettings = {
    depth: 30,
    bevelEnabled: false,
};

//const shape = new THREE.Shape();
//shape.add(hole);

const geometry = new THREE.ExtrudeGeometry( shape, extrudeSettings );
const material = new THREE.MeshBasicMaterial({ shape, extrudeSettings });
const cube = new THREE.Mesh( geometry, material );
scene.add( cube );

//camera.position.z = 50;

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const point = new THREE.Vector3();
const lastMouse = new THREE.Vector2();
const delta = new THREE.Vector2();


window.addEventListener('mousemove', (event) => {
    const newMouseX = (event.clientX / window.innerWidth) * 2 - 1;
    const newMouseY = -(event.clientY / window.innerHeight) * 2 + 1;

    delta.x = mouse.x - lastMouse.x;
    delta.y = mouse.y - lastMouse.y;

    mouse.x = newMouseX;
    mouse.y = newMouseY;

    lastMouse.set(newMouseX, newMouseY);
});

function animate() {

    requestAnimationFrame( animate );

    raycaster.setFromCamera(mouse, camera);
    const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    raycaster.ray.intersectPlane(planeZ, point);

    cube.position.copy(point, 0.9);
    
    //手動旋轉
    //cube.rotation.x += delta.x * 2;
    //cube.rotation.y += delta.y * 2;
    //delta.set(0, 0);
    
    //自動旋轉
    cube.rotation.x += 0.005;
    cube.rotation.y += 0.01;
    cube.rotation.z += 0.01;
    renderer.render( scene, camera );
}
animate();