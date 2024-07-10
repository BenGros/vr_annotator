import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// General scene elements
let scene, renderer, volumeData, camera, volconfig, gui;

let refresh = false;

// for tracking all image voxels
let allMesh = [];
// all mask voxels
let ants = [];
// Any removed premade mask voxels
let removedAnts = [];
// any mesh replaced by an annotation
let removedMesh = [];

// Annotation Cell Tracking
let cellNumbers = {currNum: 0, nextNum: 1, total: 0};
let cellColours = {currCol: 0, nextCol: 1};

// VR Controls
let controller1, controller2, cgrip1, cgrip2, hand1, hand2;

// VR Annotation Guides
let vrCube;
let vrLine;
let controlLine;

// GUI setup
let guiMesh;
let group;

let raycaster;

// HUD elements
let scoreRenderer;
let sprite;

// For loading files
let imageDataPath = '';
let totalMask;
let mask_data_path = '';
let newMask;

// 'supervised_datasets_watershed_json/supervised_datasets_watershed_json/sz64_ch0_slice_common_im/1632_4096_2560.json'
// supervised_datasets_watershed_json/supervised_datasets_watershed_json/sz64_ch0_slice_common_cellseg3d/1632_4096_2560.json
// supervised_datasets_watershed_json/supervised_datasets_watershed_json/sz64_ch0_train_random_sample_cellseg3d/320_6144_2816.json

// supervised_datasets_watershed_json/supervised_datasets_watershed_json/sz64_ch1_test_random_sample_cellseg3d/384_6272_2048.json
init();

// Initialization
// TODO: Break into smaller parts
function init(){

    // Basic Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0000ff);
    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.xr.enabled = true;
    document.body.appendChild( renderer.domElement );

    // Camera Setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    scene.add(camera);

    // Setup HUD
    scoreRenderer = new CSS2DRenderer();
    scoreRenderer.setSize(window.innerWidth, window.innerHeight);
    scoreRenderer.domElement.style.position = 'absolute';
    scoreRenderer.domElement.style.top = '0px'
    scoreRenderer.domElement.style.pointerEvents = 'none';
    document.body.appendChild(scoreRenderer.domElement);

    // Create Text For HUD and Position it
    let canvas = document.createElement('canvas');
    let context = canvas.getContext('2d');
    context.font = '40px Arial';
    context.fillStyle = 'white';
    context.fillText(`Current Cell: ${cellNumbers.currNum}`, 0, 50, 300);
    let texture = new THREE.CanvasTexture(canvas);
    let material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(1);
    sprite.position.set(-6.5,1,-2);

    // Background for HUD
    const background = new THREE.Mesh(new THREE.PlaneGeometry(0.1,0.1), new THREE.MeshBasicMaterial({color: 0x000000, depthTest: true}));
    background.position.set(-0.33,0.04,-0.1);

    // Add HUD to scene
    camera.add(background);
    camera.add(sprite);

    // Repeat with colour
    canvas = document.createElement('canvas');
    context = canvas.getContext('2d');
    context.font = '40px Arial';
    context.fillStyle = 'white';
    context.fillText(`Current Colour: ${getAntColour(cellColours.currCol).name}`, 0, 50, 300);
    texture = new THREE.CanvasTexture(canvas);
    material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(1);
    sprite.position.set(-6.5,0.7,-2);
    camera.add(sprite);

    // setup VR controllers
    controller1 = renderer.xr.getController(0);
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    scene.add(controller2);

    // setup Controller grips
    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();
    cgrip1 = renderer.xr.getControllerGrip(0);
    cgrip1.add(controllerModelFactory.createControllerModel( cgrip1 ));
    scene.add(cgrip1);
    cgrip2 = renderer.xr.getControllerGrip(1);
    cgrip2.add(controllerModelFactory.createControllerModel( cgrip2 ));
    scene.add(cgrip2);

    // setup VR hand visuals
    hand1 = renderer.xr.getHand(0);
    scene.add(hand1);

    hand2 = renderer.xr.getHand(1);
    scene.add(hand2);

    // create annotating box for controller
    let box = new THREE.BoxGeometry(0.2,0.2,0.2);
    let wireBox = new THREE.WireframeGeometry(box);
    vrLine = new THREE.LineSegments(wireBox, new THREE.MeshBasicMaterial({color: getAntColour(cellColours.currCol).code}));
    console.log(vrLine.material.color)
    vrLine.position.set(0,0.1,-0.1);
    vrLine.rotation.x += Math.PI/6;
    vrCube = new THREE.Box3().setFromObject(vrLine);
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 5 ) ] );
    controlLine = new THREE.Line(lineGeom)
    controller1.add(vrLine);
    controller1.add(controlLine);

    // access gamepad for movement
    controller1.addEventListener( 'connected', (e) => {
        controller1.gamepad = e.data.gamepad
        console.log(controller1.gamepad)
    });

    // add selection with line on controller for right trigger
    controller1.addEventListener('selectstart', onRightTriggerPress);
    // make the annptating button attached to squeeze right
    controller1.addEventListener('squeezestart', colour);
    // Change to next cell for annotating
    controller2.addEventListener('selectstart', onLeftTriggerPress);
    // Open and close GUI
    controller2.addEventListener('squeezestart', onLeftTriggerSqueeze);

    // Gui setting the user can control
    volconfig = {threshMin: 500, threshMax: 800, channel: 0,
        chunkX: 32, chunkY: 32, chunkZ: 32, chunkNum: 0,
        colourMin: 500, colourMax: 1000, cubeSize: 1,
        removeAnnotations: 0
    };

    // Build out GUI
    gui = new GUI({width: 300});
    gui.add(volconfig, 'threshMin', 0, 5000, 10).onFinishChange(load);
    gui.add(volconfig, 'threshMax', 0, 5000, 10).onFinishChange(load);
    gui.add(volconfig, 'chunkNum', 0,7, 1).onFinishChange(fullReload);
    // gui.add(volconfig, 'colourMin', 0, 5000, 10).onFinishChange(load);
    // gui.add(volconfig, 'colourMax', 0, 5000, 10).onFinishChange(load);
    gui.add(volconfig, 'cubeSize', 0, 10, 1).onFinishChange(()=>{
        vrLine.scale.setScalar(volconfig.cubeSize)
    });
    gui.add(volconfig, 'removeAnnotations', 0, 1, 1);
    gui.add({save: ()=>{
        if(!newMask){
            annotationsToNewMask()
        } else {
            annotationsToModifyMask();
        }
    }}, 'save')
    gui.domElement.style.visibility = 'hidden';

    // make GUI interactive within VR
    group = new InteractiveGroup();
    group.listenToPointerEvents( renderer, camera );
    group.listenToXRControllerEvents( controller1 );
    group.listenToXRControllerEvents( controller2 );
    scene.add( group );
    guiMesh = new HTMLMesh( gui.domElement );
    guiMesh.scale.setScalar( 0 );
    group.add( guiMesh );


    const maskSelect = document.getElementById('maskType');
    const newMaskInp = document.getElementById('newMaskDP');
    const oldMaskInp = document.getElementById('maskDP');
    const subBtn = document.getElementById('subBtn');
    maskSelect.addEventListener('change', ()=>{
        if(maskSelect.value == 'new'){
            oldMaskInp.style.display = "none";
            newMaskInp.style.display = 'inline';
            
        } else {
            oldMaskInp.style.display = "inline";
            newMaskInp.style.display = 'none';
        }
    })
    // create form for user to use their own images and masks
    const form = document.getElementById('paths');
    form.addEventListener('submit', (event)=>{
        event.preventDefault()
        const imInp = document.getElementById('imageDP')
        imageDataPath = imInp.value;
        imInp.value = '';
        if(maskSelect.value == 'new'){
            mask_data_path = newMaskInp.value
            newMaskInp.value = ''
            newMask = true;
        } else {
            mask_data_path = oldMaskInp.value;
            oldMaskInp.value = '';
            newMask = false;
        }
        load();
        if(!newMask){
            console.log('mask')
            getAllMaskData();
            maskLoader();
        }
        document.getElementById('loaded').innerHTML = "Image Loaded"
        document.body.appendChild( VRButton.createButton( renderer ) );
    })

    // set render loop
    renderer.setAnimationLoop(animate);

    // for window resizing
    window.addEventListener( 'resize', onWindowResize );
}

function checkIntersection(){
    /* Used to find the first mesh that the 
    VRcontroller helper line intersects with */

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

// to check if positions are equal
// built in one was not working
function equals(a, b){
    if(a.x == b.x && a.y == b.y && a.z == b.z){
        return true;
    }
    return false
}

function onRightTriggerPress(event) {
    // used to set the cell annotator to the cell that it first intersects
    let castedObjects = checkIntersection();
    if(castedObjects != null && castedObjects.antItem != null){
        cellColours.currCol = castedObjects.antItem.colourNum;
        cellNumbers.currNum = castedObjects.antItem.cellNum;
    }
    vrLine.material.color.set(getAntColour(cellColours.currCol).code)
    
}

function onLeftTriggerPress(event){
    // for annotating a new cell
    cellNumbers.currNum = cellNumbers.nextNum;
    cellNumbers.nextNum += 1;
    cellColours.currCol = cellColours.nextCol;
    cellColours.nextCol +=1;
    if(cellColours.nextCol >7){
        cellColours.nextCol =0;
    }
    vrLine.material.color.set(getAntColour(cellColours.currCol).code)
}

function onLeftTriggerSqueeze(event){
    // for opening and closing gui
    if(guiMesh.scale.x > 0){
        guiMesh.scale.setScalar(0)
    } else {
        guiMesh.scale.setScalar(4);
        guiMesh.position.copy(controller2.position);
    }
}

function getAntColour(colour){
    // get hexadecimal coulour based on local code
    switch(colour){
        case 0:
            return { name: "red", code: 0xff0000 };
        case 1:
            return { name: "green", code: 0x00ff00 };
        case 2:
            return { name: "magenta", code: 0xff00ff };
        case 3:
            return { name: "yellow", code: 0xffff00 };
        case 4:
            return { name: "brown", code: 0x8B4513 };
        case 5:
            return { name: "cyan", code: 0x00FFFF };
        case 6:
            return { name: "orange", code: 0xFFA500 };
        case 7:
            return { name: "pink", code: 0xFFC0CB };
        case 8:
            return { name: "purple-blue", code: 0x7B68EE };  
        case 9:
            return { name: "teal", code: 0x20B2AA };  
        case 10:
            return { name: "crimson", code: 0xDC143C }; 
        case 11:
            return { name: "gold", code: 0xDAA520 };   
        case 12:
            return { name: "Dark Turquoise", code: 0x00CED1 };  
        case 13:
            return { name: "coral", code: 0xFF7F50 };   
        case 14:
            return { name: "dark green", code: 0x556B2F };   
        case 15:
            return { name: "purple", code: 0xBA55D3 };   
    }
}

function increaseCellColour(){
    // used to increment to the next cell colour max 15
    cellColours.currCol = cellColours.nextCol
    cellColours.nextCol +=1;
    if(cellColours.nextCol > 15){
        cellColours.nextCol = 0;
    }
}

function colour(){
    /* this function is used to annotate or de-annotate cells 
    based on the selection in the GUI*/

    vrCube = new THREE.Box3().setFromObject(vrLine);
    let lowPoints = vrCube.min;
    let highPoints = vrCube.max;
    if(volconfig.removeAnnotations == 0){
        // adding annotations
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
            m = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({color: getAntColour(cellColours.currCol).code, opacity: 0.5, transparent: true}));
            scene.add(m)
            m.position.set(currPos.x, currPos.y, currPos.z);
            let newAnt = {meshObj: m, cellNum: cellNumbers.currNum, colourNum: cellColours.currCol};
            ants.push(newAnt);
        }

        render();
    } else {
        // removing annotations
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
            scene.remove(m.meshObj);
            removedAnts.push(m.meshObj);
            for(let oldM of removedMesh){
                if(oldM != null && m.meshObj.position.equals(oldM.position)){
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
    /* this function is used to load in all voxels of the image data
    that are found within the predetermined chunk and fall within the user set intensity range */

    return new Promise((resolve)=>{
        if(refresh){
            allMesh.forEach(mesh => scene.remove(mesh));
            allMesh = [];
        }
        let vol;
        new THREE.FileLoader().load( 'supervised_datasets_watershed_json/supervised_datasets_watershed_json/sz64_ch0_slice_common_im/1632_4096_2560.json', function ( volume ) {
            volumeData = JSON.parse(volume);
            vol = volumeData;
            let chunkCoords = chunkToCoords(volconfig.chunkNum);
            for(let z = volconfig.chunkZ*chunkCoords.z ; z< volconfig.chunkZ*chunkCoords.z + volconfig.chunkZ; z++){
                for(let y = volconfig.chunkY*chunkCoords.y ; y< volconfig.chunkY*chunkCoords.y+ volconfig.chunkY; y++){
                    for(let x = volconfig.chunkX*chunkCoords.x ; x< volconfig.chunkX*chunkCoords.x+ volconfig.chunkX; x++){
                        let intensity = vol[z][y][x];
                        
                        if(intensity> volconfig.threshMin && intensity < volconfig.threshMax){
                            let normal = (intensity-volconfig.threshMin) / (volconfig.threshMax - volconfig.threshMin)
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
    // produces hexadecimal code for grayscale from a normalized intensity

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

let maskColours = []

function getAllMaskData(){
    // get the full mask data to make changes to (includes more than just the chunk)
    return new Promise((resolve)=>{
        new THREE.FileLoader().load( 'supervised_datasets_watershed_json/supervised_datasets_watershed_json/sz64_ch0_slice_common_cellseg3d/1632_4096_2560.json' , function ( volume ) {
        totalMask = JSON.parse(volume);
        resolve();
        });
    });
}

function maskLoader(){
    // loads and renders a specfic chunk of the mask data
    return new Promise((resolve)=>{
        if(refresh){
            ants.forEach(ant =>scene.remove(ant.meshObj));
            ants = [];
        }
        new THREE.FileLoader().load( mask_data_path, function ( volume ) {
            let maskData = JSON.parse(volume);
            let chunkCoords = chunkToCoords(volconfig.chunkNum);
            for(let z = volconfig.chunkZ*chunkCoords.z ; z< volconfig.chunkZ*chunkCoords.z + volconfig.chunkZ; z++){
                for(let y = volconfig.chunkY*chunkCoords.y ; y< volconfig.chunkY*chunkCoords.y+ volconfig.chunkY; y++){
                    for(let x = volconfig.chunkX*chunkCoords.x ; x< volconfig.chunkX*chunkCoords.x + volconfig.chunkX; x++){
                        let cellNum =maskData[z][y][x];
                        if(cellNum !=0){
                            let cellColourNum;
                            let e = checkCellNumExist(cellNum);
                            if(e != null){
                                cellColourNum = e.cellColour
                            } else {
                                cellColourNum = cellColours.currCol
                                increaseCellColour();
                                maskColours.push({cellNum: cellNum, cellColour: cellColourNum});
                            }
                            let material = new THREE.MeshBasicMaterial({color: getAntColour(cellColourNum).code, opacity: 0.5, transparent: true})
                            let geometry = new THREE.BoxGeometry(voxelSize,voxelSize,voxelSize);
                            let mesh = new THREE.Mesh(geometry, material);
                            mesh.position.set(x*voxelSize,y*voxelSize,z*voxelSize);
                            scene.add(mesh);
                            let ant = {meshObj: mesh, cellNum: cellNum, colourNum: cellColourNum};
                            let oldMesh = antToMesh(ant);
                            scene.remove(oldMesh);
                            removedMesh.push(oldMesh);
                            ants.push(ant);
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

function fullReload(){
    load();
    if(!newMask){
        maskLoader();
    }
}

function checkCellNumExist(cellNumber){
    // check if the mask already had this cell number
    // used to keep colouring consistent
    for(let e of maskColours){
        if(e.cellNum == cellNumber){
            return e;
        }
    }
    return null;
}

function antToMesh(ant){
    // find the mesh that exist at the same location as an annotation
    for(let m of allMesh){
        if(equals(m.position, ant.meshObj.position)){
            return m;
        }
    }
    return null;
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

function annotationsToNewMask(){
    // produce a new mask for a specfied chunk of image data
    let mask = []
    for(let z = volconfig.chunkZ*volconfig.chunkNum ; z< volconfig.chunkZ*volconfig.chunkNum + volconfig.chunkZ; z++){
        let yLayer = []
        for(let y = volconfig.chunkY*volconfig.chunkNum ; y< volconfig.chunkY*volconfig.chunkNum + volconfig.chunkY; y++){
            let xLayer = []
            for(let x = volconfig.chunkX*volconfig.chunkNum ; x< volconfig.chunkX*volconfig.chunkNum + volconfig.chunkX; x++){
                xLayer.push[0];
            }
            yLayer.push(xLayer);
        }
        mask.push(yLayer);
    }
    for(let ant of ants){
        let xCoord = Math.floor(ant.meshObj.position.x/0.1);
        let yCoord = Math.floor(ant.meshObj.position.y/0.1);
        let zCoord = Math.floor(ant.meshObj.position.z/0.1);

        mask[zCoord][yCoord][xCoord] = ant.cellNum;
    }
    console.log(mask)
    fetch("http://127.0.0.1:8080/home", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({newMask: newMask, data: mask, filename: mask_data_path }),
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error(
              "Network response was not ok " + response.statusText
            );
          }
          return response.json();
        })
        .then(function (data) {
          console.log("Server response:", data);
        })
        .catch(function (error) {
          console.error(
            "There has been a problem with your fetch operation:",
            error
          );
        });
    return mask;
}

function annotationsToModifyMask(){
    // modify an existing mask based on the annotations added and removed to a chunk
    for (rAnt of removedAnts){
        let xCoord = Math.floor(rAnt.position.x/0.1);
        let yCoord = Math.floor(rAnt.position.y/0.1);
        let zCoord = Math.floor(rAnt.position.z/0.1);
        totalMask[zCoord][yCoord][xCoord] = 0;
    }
    for(let ant of ants){
        let xCoord = Math.floor(ant.meshObj.position.x/0.1);
        let yCoord = Math.floor(ant.meshObj.position.y/0.1);
        let zCoord = Math.floor(ant.meshObj.position.z/0.1);
        totalMask[zCoord][yCoord][xCoord] = ant.cellNum;
    }

    fetch("http://127.0.0.1:8080/home", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({newMask: newMask, data: totalMask, filename: mask_data_path }),
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error(
              "Network response was not ok " + response.statusText
            );
          }
          return response.json();
        })
        .then(function (data) {
          console.log("Server response:", data);
        })
        .catch(function (error) {
          console.error(
            "There has been a problem with your fetch operation:",
            error
          );
        });
    

}

function chunkToCoords(chunkNum){
    switch(chunkNum){
        case 0:
            return {x: 0, y: 0, z: 0};
        case 1:
            return {x: 1, y: 0, z: 0};
        case 2:
            return {x: 0, y: 1, z: 0};
        case 3:
            return {x: 1, y: 1, z: 0};
        case 4:
            return {x: 0, y: 0, z: 1};
        case 5:
            return {x: 1, y: 0, z: 1};
        case 6:
            return {x: 0, y: 1, z: 1};
        case 7:
            return {x: 1, y: 1, z: 1};
        default:
            return null;
    }
}