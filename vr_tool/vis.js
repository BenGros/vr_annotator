import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VolumeRenderShader1 } from 'three/addons/shaders/VolumeShader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const size = 32;

const effect = new MarchingCubes(32, new THREE.MeshBasicMaterial({color: 0xffffff}), true, true);

effect.position.set(0, 0, 0);
effect.scale.set(size, size, size);


let scene, renderer, volumeData, camera, volconfig, controls, gui, cgroup;
let refresh = false;
let allMesh = [];
let ants = [];
let removedMesh = [];
let cellNumbers = {currNum: 0, nextNum: 1, total: 0};
let cellColours = {currCol: 0, nextCol: 1};

let controller1, controller2, cgrip1, cgrip2, hand1, hand2;

let vrCube;
let vrLine;
let guiMesh;
let group;
let controlLine;
let raycaster;
let scoreRenderer;
init();

function init(){
    scene = new THREE.Scene();
    scene.up.set(0,0,1);

    scene.background = new THREE.Color(0x0000ff);
    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );

    document.body.appendChild( VRButton.createButton( renderer ) );

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    scene.add(camera);
    // camera.up.set(0,0,1);
    // camera.position.set(-1,-1,3);
    // camera.lookAt(1,1,1);
    //cgroup = new THREE.Group();

    renderer.xr.enabled = true;
    document.body.appendChild( renderer.domElement );

    scoreRenderer = new CSS2DRenderer();
    scoreRenderer.setSize(window.innerWidth, window.innerHeight);
    scoreRenderer.domElement.style.position = 'absolute';
    scoreRenderer.domElement.style.top = '0px'
    scoreRenderer.domElement.style.pointerEvents = 'none';
    document.body.appendChild(scoreRenderer.domElement);

    const p = document.createElement('p')
    p.textContent = "hello"
    const labelName = new CSS2DObject(p);
    labelName.position.set(0.1,0,0.1);
    labelName.scale.setScalar(100);



    controller1 = renderer.xr.getController(0);
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    scene.add(controller2);

    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    cgrip1 = renderer.xr.getControllerGrip(0);
    cgrip1.add(controllerModelFactory.createControllerModel( cgrip1 ));
    scene.add(cgrip1);
    cgrip2 = renderer.xr.getControllerGrip(1);
    cgrip2.add(controllerModelFactory.createControllerModel( cgrip2 ));
    scene.add(cgrip2);

    hand1 = renderer.xr.getHand(0);
    scene.add(hand1);

    hand2 = renderer.xr.getHand(1);
    scene.add(hand2);

    //cgroup.add(camera);
    //scene.add(cgroup);

    let box = new THREE.BoxGeometry(0.2,0.2,0.2);
    let wireBox = new THREE.WireframeGeometry(box);
    vrLine = new THREE.LineSegments(wireBox);
    vrLine.position.set(0,0.1,-0.1);
    vrLine.rotation.x += Math.PI/6;
    vrCube = new THREE.Box3().setFromObject(vrLine);
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 5 ) ] );
    controlLine = new THREE.Line(lineGeom)
    controller1.add(vrLine);
    controller1.add(controlLine);
    controller2.add(labelName);
    controller1.addEventListener('selectstart', onRighTriggerPress);
    controller1.addEventListener('squeezestart', colour);
    controller2.addEventListener('selectstart', onLeftTriggerPress);
    controller2.addEventListener('squeezestart', onLeftTriggerSqueeze);




    volconfig = {threshMin: 500, threshMax: 1000, channel: 0,
        chunkX: 32, chunkY: 32, chunkZ: 10, chunkNum: 0,
        colourMin: 500, colourMax: 1000, cubeSize: 1,
        removeAnnotations: 0
    };

    gui = new GUI({width: 300});
    gui.add(volconfig, 'threshMin', 0, 5000, 10).onFinishChange(load);
    gui.add(volconfig, 'threshMax', 0, 5000, 10).onFinishChange(load);
    gui.add(volconfig, 'colourMin', 0, 5000, 10).onFinishChange(load);
    gui.add(volconfig, 'colourMax', 0, 5000, 10).onFinishChange(load);
    gui.add(volconfig, 'cubeSize', 0, 10, 1).onFinishChange(()=>{
        vrLine.scale.setScalar(volconfig.cubeSize)
    });
    gui.add(volconfig, 'removeAnnotations', 0, 1, 1);
    gui.domElement.style.visibility = 'hidden';

    group = new InteractiveGroup();
    group.listenToPointerEvents( renderer, camera );
    group.listenToXRControllerEvents( controller1 );
    group.listenToXRControllerEvents( controller2 );
    scene.add( group );

    guiMesh = new HTMLMesh( gui.domElement );


    guiMesh.scale.setScalar( 0 );
    //controller2.add(guiMesh)
    group.add( guiMesh );
    //controller2.add(group);


    load();

    renderer.setAnimationLoop(animate);
    window.addEventListener( 'resize', onWindowResize );
}

function checkIntersection(){

    let positionAttribute = controlLine.geometry.getAttribute('position');
    let startPoint = new THREE.Vector3();
    startPoint.fromBufferAttribute(positionAttribute, 0);
    startPoint.applyMatrix4(controlLine.matrixWorld);

    let endPoint = new THREE.Vector3();
    endPoint.fromBufferAttribute(positionAttribute, 1);
    endPoint.applyMatrix4(controlLine.matrixWorld);

    raycaster = new THREE.Raycaster();
    raycaster.set(startPoint, endPoint.sub(startPoint).normalize());
    const intersects = raycaster.intersectObjects(allMesh);
    if(intersects.length > 0){
        let meshItem = intersects[0].object
        for(let ant of ants){
            if(equals(meshItem.position, ant.meshObj.position)){
                return {mItem: meshItem, antItem: ant};
            }
        };
        intersects[0].object.material.color.set(0xff0000);
        return {mItem: meshItem};
    }
    return null;
    

}

function equals(a, b){
    if(a.x == b.x && a.y == b.y && a.z == b.z){
        return true;
    }
    return false
}

function onRighTriggerPress(event) {
    let castedObjects = checkIntersection();
    console.log(castedObjects);
    if(castedObjects != null && castedObjects.antItem != null){
        cellColours.currCol = castedObjects.antItem.colourNum;
        cellNumbers.currNum = castedObjects.antItem.cellNum;
    }
    
}



function onLeftTriggerPress(event){
    cellNumbers.currNum = cellNumbers.nextNum;
    cellNumbers.nextNum += 1;
    cellColours.currCol = cellColours.nextCol;
    cellColours.nextCol +=1;
    if(cellColours.nextCol >7){
        cellColours.nextCol =0;
    }
}

function onLeftTriggerSqueeze(event){
    if(guiMesh.scale.x > 0){
        guiMesh.scale.setScalar(0)
    } else {
        guiMesh.scale.setScalar(4);
        group.remove(guiMesh);
        guiMesh.position.copy(controller2.position);
        group.add(guiMesh);
    }
}

function getAntColour(){
    switch(cellColours.currCol){
        case 0:
            return 0xff0000;
        case 1:
            return 0x00ff00;
        case 2:
            return 0xff00ff;
        case 3:
            return 0xffff00;
        case 4:
            return 0x8B4513;
        case 5:
            return 0x00FFFF;
        case 6:
            return 0xFFA500;
        case 7:
            return 0xFFC0CB;
    }
}

function colour(){
    vrCube = new THREE.Box3().setFromObject(vrLine);
    let lowPoints = vrCube.min;
    let highPoints = vrCube.max;
    if(volconfig.removeAnnotations == 0){
        
        let selectedMesh = allMesh.filter(m =>{
            if(m.position.x >= lowPoints.x && m.position.x <= highPoints.x){
                if(m.position.y >= lowPoints.y && m.position.y <= highPoints.y){
                    if(m.position.z >= lowPoints.z && m.position.z <= highPoints.z){
                        return true;
                    }
                }
            } 
            return false;
        });

        for(let m of selectedMesh){
            let currPos = m.position;
            removedMesh.push(m);
            scene.remove(m);
            m = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({color: getAntColour()}));
            scene.add(m)
            m.position.set(currPos.x, currPos.y, currPos.z);
            let newAnt = {meshObj: m, cellNum: cellNumbers.currNum, colourNum: cellColours.currCol};
            ants.push(newAnt);

        }

        render();
    } else {
        let selectedAnts = ants.filter(m => {
            if(m.meshObj.position.x >= lowPoints.x && m.meshObj.position.x <= highPoints.x){
                if(m.meshObj.position.y >= lowPoints.y && m.meshObj.position.y <= highPoints.y){
                    if(m.meshObj.position.z >= lowPoints.z && m.meshObj.position.z <= highPoints.z){
                        return true;
                    }
                }
            } 
            return false;
        });
        for (let m of selectedAnts){
            for(let oldM of removedMesh){
                if(m.meshObj.position.equals(oldM.position)){
                    scene.remove(m.meshObj);
                    scene.add(oldM);
                    ants.filter(item => item !=m);
                    removedMesh.filter(item => item != oldM);
                }
            }
        }
        render();

    }

}
let voxelSize = 0.1
function load(){
    return new Promise((resolve)=>{
        if(refresh){
            allMesh.forEach(mesh => scene.remove(mesh));
            allMesh = [];
            // ants.forEach(mesh => {scene.remove(mesh.meshObj)});
            // ants = [];
        }
        let vol;
        new THREE.FileLoader().load( 'new_data.json', function ( volume ) {
            volumeData = JSON.parse(volume);
            vol = volumeData;
            for(let z = volconfig.chunkZ*volconfig.chunkNum ; z< volconfig.chunkZ*volconfig.chunkNum + volconfig.chunkZ; z++){
                for(let y = volconfig.chunkY*volconfig.chunkNum ; y< volconfig.chunkY*volconfig.chunkNum + volconfig.chunkY; y++){
                    for(let x = volconfig.chunkX*volconfig.chunkNum ; x< volconfig.chunkX*volconfig.chunkNum + volconfig.chunkX; x++){
                        let intensity = vol[z][y][x];
                        
                        if(intensity> volconfig.threshMin && intensity < volconfig.threshMax){
                            let normal = (intensity-volconfig.colourMin) / (volconfig.colourMax - volconfig.colourMin)
                            let colour = new THREE.Color(intensityToHexGrayscale(normal));
                            let material = new THREE.MeshBasicMaterial({color: colour/* opacity: normal, transparent: true*/})
                            let geometry = new THREE.BoxGeometry(voxelSize,voxelSize,voxelSize);
                            let mesh = new THREE.Mesh(geometry, material);
                            mesh.position.set(x*voxelSize,y*voxelSize,z*voxelSize);
                            scene.add(mesh);
                            allMesh.push(mesh)
                        } 
                    }
                }
            }
            console.log("Done")
            refresh = true;
            render();
            resolve();
        });
    });
}

function intensityToHexGrayscale(intensity) {
    // Clamp the intensity to ensure it's between 0 and 1.
    if(intensity > 1) { intensity = 1};
    if(intensity < 0){intensity = 0};

    // Convert the normalized intensity to a value between 0 and 255.
    const value = Math.round(intensity * 255);
    
    // Convert the value to a two-digit hexadecimal string.
    const hex = value.toString(16).padStart(2, '0');
    
    // Return the grayscale color in hexadecimal format.
    return `#${hex}${hex}${hex}`;
}



function onWindowResize() {

    renderer.setSize( window.innerWidth, window.innerHeight );
    scoreRenderer.setSize(this.window.innerWidth, this.window.innerHeight);

    const aspect = window.innerWidth / window.innerHeight;

    const frustumHeight = camera.top - camera.bottom;

    camera.left = - frustumHeight * aspect / 2;
    camera.right = frustumHeight * aspect / 2;

    camera.updateProjectionMatrix();

    render();

}

function render() {
    renderer.render( scene, camera );
}

function animate(){
    renderer.render(scene, camera)
    scoreRenderer.render(scene, camera);
}


