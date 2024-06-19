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

const size = 32;

const effect = new MarchingCubes(32, new THREE.MeshBasicMaterial({color: 0xffffff}), true, true);

effect.position.set(0, 0, 0);
effect.scale.set(size, size, size);


let scene, renderer, volumeData, camera, volconfig, controls, gui, cgroup;
let refresh = false;
let allMesh = [];
let ants = [];

let controller1, controller2, cgrip1, cgrip2, hand1, hand2;

let vrCube;
let vrLine;

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
    cgroup = new THREE.Group();
    cgroup.add(camera);

    camera.up.set(0, 0, 1); // Set the up vector of the camera to the z-axis
    cgroup.up.set(0, 0, 1); // Set the up vector of the camera group to the z-axis
    cgroup.rotation.x = Math.PI / 2;


    scene.add(cgroup);

    renderer.xr.enabled = true;
    document.body.appendChild( renderer.domElement );
    renderer.setAnimationLoop(function () {
        renderer.render( scene, camera);
    });

    


    controller1 = renderer.xr.getController(0);
    scene.add(controller1);
    controller2 = renderer.xr.getController(1);
    scene.add(controller2);

    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    cgrip1 = renderer.xr.getControllerGrip(0);
    cgrip1.add(controllerModelFactory.createControllerModel( cgrip1));
    scene.add(cgrip1);

    cgrip2 = renderer.xr.getControllerGrip(1);
    cgrip2.add(controllerModelFactory.createControllerModel(cgrip2));
    scene.add(cgrip2);

    hand1 = renderer.xr.getHand(0);
    scene.add(hand1);

    hand2 = renderer.xr.getHand(1);
    scene.add(hand2);


    let box = new THREE.BoxGeometry(0.2,0.2,0.2);
    let wireBox = new THREE.WireframeGeometry(box);
    vrLine = new THREE.LineSegments(wireBox);
    vrLine.position.set(0,0.1,-0.1);

    controller1.add(vrLine);
    controller1.addEventListener('selectstart', onRighTriggerPress);
    controller2.addEventListener('selectstart', onLeftTriggerPress);

    let light = new THREE.AmbientLight(0xffffff);
    scene.add(light);


    volconfig = {threshMin: 500, threshMax: 1000, channel: 0,
        chunkX: 32, chunkY: 32, chunkZ: 10, chunkNum: 0,
        colourMin: 500, colourMax: 1000
    };

    gui = new GUI({width: 300});
    gui.add(volconfig, 'threshMin', 0, 5000, 10).onFinishChange(load);
    gui.add(volconfig, 'threshMax', 0, 5000, 10).onFinishChange(load);
    gui.add(volconfig, 'colourMin', 0, 5000, 10).onFinishChange(load);
    gui.add(volconfig, 'colourMax', 0, 5000, 10).onFinishChange(load);
    gui.domElement.style.visibility = 'hidden';

    // const group = new InteractiveGroup();
    // group.listenToPointerEvents( renderer, camera );
    // group.listenToXRControllerEvents( controller1 );
    // group.listenToXRControllerEvents( controller2 );
    // scene.add( group );

    // const guiMesh = new HTMLMesh( gui.domElement );
    // guiMesh.position.x = 0;
    // guiMesh.position.y = 0;
    // guiMesh.position.z = 0;
    // guiMesh.scale.setScalar( 100 );
    // group.add( guiMesh );

    load();

    let box2 = new THREE.BoxGeometry(10,10,10);
    let wireBox2 = new THREE.WireframeGeometry(box2);
    const line = new THREE.LineSegments(wireBox2);
    scene.add(line);

    vrCube = new THREE.Box3().setFromObject(line);

    window.addEventListener( 'resize', onWindowResize );
}


function onRighTriggerPress(event) {
    const controller = event.target;
    let scale_factor = vrLine.scale.x;
    scale_factor +=1;
    vrLine.scale.set(scale_factor, scale_factor, scale_factor);    
    console.log(controller.position)
}


function onLeftTriggerPress(event){
    let scale_factor = vrLine.scale.x;
    scale_factor -=1;
    vrLine.scale.set(scale_factor, scale_factor, scale_factor);
}


function colour(){

    let lowPoints = vrCube.min;
    let highPoints = vrCube.max;
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
        scene.remove(m);
        m = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({color: 0xff0000}));
        scene.add(m)
        m.position.set(currPos.x, currPos.y, currPos.z);
        ants.push(m);
    }

    render();

}

function load(){
    return new Promise((resolve)=>{
        if(refresh){
            allMesh.forEach(mesh => scene.remove(mesh));
            allMesh = [];
            ants.forEach(mesh => {scene.remove(mesh)});
            ants = [];
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
                            let geometry = new THREE.BoxGeometry(1,1,1);
                            let mesh = new THREE.Mesh(geometry, material);
                            mesh.position.set(x,y,z);
                            scene.add(mesh);
                            allMesh.push(mesh)
                        } 
                    }
                }
            }
            console.log("Done")
            refresh = true;
            render();
            colour();
            resolve();
        });

    })
    
    
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
