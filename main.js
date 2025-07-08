import * as THREE from 'three';
import { CSG } from 'three-csg-ts';

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

    if (type === 'cube') {
        const outer = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        //const outerBSP = CSG.fromMesh(outer);
        if (hasHole) {
            const inner = new THREE.Mesh(new THREE.BoxGeometry(holeWidth, holeHeight, depth + 2), material);
            inner.position.z = 0
            outer.updateMatrix();
            inner.updateMatrix();
            //const innerBSP = CSG.fromMesh(inner);
            //const subtracted = CSG.subtract(outerBSP, innerBSP);
            //mesh = CSG.toMesh(subtracted, outer.matrixWorld, material);
            try{
                const result = CSG.subtract(outer, inner);
                result.geometry.computeVertexNormals();
                mesh = result;
                //mesh = CSG.subtract(outer, inner);
                //mesh.material = material;
            }catch(err){
                console.error('CSG subtraction failed:',err);
                mesh = outer;
                //mesh.material = material;
            }            
            //if(!mesh){
                
                //console.warn('簍空失敗!');
            //}
        } else {
            mesh = outer;
            //mesh.material = material;
        }
    }
    else if (type === 'circle') {
        const outer = new THREE.Mesh(new THREE.SphereGeometry(width / 2, 32, 32), material);
        //const outerBSP = CSG.fromMesh(outer);
        if (hasHole) {
            const inner = new THREE.Mesh(new THREE.SphereGeometry(holeWidth / 2, 32, 32),material);
            inner.position.z = 0;
            outer.updateMatrix();
            inner.updateMatrix();
            //const innerBSP = CSG.fromMesh(inner);
            //const subtracted = CSG.subtract(outerBSP, innerBSP);

            //mesh = CSG.toMesh(subtracted, outer.matrixWorld, material);
            try{
                const result = CSG.subtract(outer, inner);
                result.geometry,computeVertexNormals();
                mesh = result;
                //mesh = CSG.subtract(outer, inner);
                //mesh.material = material;
            }catch(err){
                console.error('CSG subtraction failed:',err);
                mesh = outer;
                //mesh.material = material;
            }            
            
            //if(!mesh){
                
                //console.warn('簍空失敗!');
            //}
           
        } else {
            mesh = outer;
            //mesh.material = material;
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
    cube = mesh;
    mesh.position.set(0, 0, 0);
    //console.log(mesh);
    scene.add(mesh);
}

function animate() {

    requestAnimationFrame( animate );
    //自動旋轉
    //if(cube){
        //cube.rotation.y += 0.01;
    //}
    renderer.render( scene, camera );
}
animate();

let isDragging = false;
//let isRightClick = false;
let previousMousePosition = {x : 0, y : 0};

renderer.domElement.addEventListener('mousedown', (event) => {
    isDragging = true;
    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
});

renderer.domElement.addEventListener('mouseup', () => {
    isDragging = false;
});
renderer.domElement.addEventListener('mousemove',(event) =>{
    if(!isDragging || !cube) return;

    const deltaMove ={
        x : event.clientX - previousMousePosition.x,
        y : event.clientY - previousMousePosition.y
    };

    const deltaRotatiomQuaternion = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(
            toRadians(deltaMove.y * 0.5),
            toRadians(deltaMove.x * 0.5),
            0,
            'XYZ'
        ));
    
        cube.quaternion.multiplyQuaternions(deltaRotatiomQuaternion, cube.quaternion);

    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
});


renderer.domElement.addEventListener('wheel', (event)=>{
    const zoomSpeed = 1.1;
    if (event.deltaY < 0){
        camera.position.z /= zoomSpeed;
    }else{
        camera.position.z *= zoomSpeed;
    }

    camera.position.z = THREE.MathUtils.clamp(camera.position.z, 20, 300);
});

function toRadians(angle){
    return angle * (Math.PI /180)
}

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
    //const width = parseFloat(document.getElementById('width').value);
    //const height = parseFloat(document.getElementById('height').value);
    //const depth = parseFloat(document.getElementById('depth').value);
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

