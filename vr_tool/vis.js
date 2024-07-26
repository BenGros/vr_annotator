import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { Mask, Ann, quickFetch} from "./mask.js"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

let allMeshObj = {allMesh: [], hidden: [], removed: []};
let allAnts = {all: [], hidden: [], removed: []};

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

let markedCell = []
let currentMark = {line1: [], line2: [], remove: false};

let voxelSize = 0.1

let segIP = false;

let mask;
let zoomed = false;

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

    const ambientLight = new THREE.AmbientLight(0xffffff); // White light
    scene.add(ambientLight);

    // Add a directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    mask = new Mask(scene);

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

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 5 ) ] );
    controlLine = new THREE.Line(lineGeom)
    controller1.add(vrLine);
    controller1.add(controlLine);
    controller1.scale.set(0.1,0.1,0.1);

    // access gamepad for movement
    controller1.addEventListener( 'connected', (e) => {
        controller1.gamepad = e.data.gamepad
    });

    // add selection with line on controller for right trigger
    controller1.addEventListener('selectstart', onRightTriggerPress);
    // make the annptating button attached to squeeze right
    controller1.addEventListener('squeezestart', onRightSqueeze);
    // Change to next cell for annotating
    controller2.addEventListener('selectstart', onLeftTriggerPress);
    // Open and close GUI
    controller2.addEventListener('squeezestart', onLeftTriggerSqueeze);

    // Gui setting the user can control
    volconfig = {threshMin: 500, threshMax: 800, channel: 0,
        chunkX: 32, chunkY: 32, chunkZ: 32, chunkNum: 0,
        colourMin: 500, colourMax: 1000, cubeSize: 1,
        removeAnnotations: 0, showMask: 1
    };

    // Build out GUI
    gui = new GUI({width: 300});
    // gui.add(volconfig, 'threshMin', 0, 5000, 10).onFinishChange(load);
    // gui.add(volconfig, 'threshMax', 0, 5000, 10).onFinishChange(load);
    // gui.add(volconfig, 'chunkNum', 0,7, 1).onFinishChange(fullReload);
    // gui.add(volconfig, 'cubeSize', 0, 10, 1).onFinishChange(()=>{
    //     vrLine.scale.setScalar(volconfig.cubeSize)
    // });
    // gui.add(volconfig, 'removeAnnotations', 0, 1, 1);
    // gui.add(volconfig, 'showMask',0,1,1).onFinishChange(()=>{toggleMask(volconfig.showMask)})
    // gui.add({save: ()=>{
    //     if(!newMask){
    //         annotationsToNewMask()
    //     } else {
    //         annotationsToModifyMask();
    //     }
    // }}, 'save')
    // gui.domElement.style.visibility = 'hidden';

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
            newMaskInp.value = ''
            newMaskInp.style.display = 'inline';
            
        } else {
            oldMaskInp.value = ''
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

        newLoad(mask_data_path)
        document.getElementById('loaded').innerHTML = "Image Loaded"
        document.body.appendChild( VRButton.createButton( renderer ) );
        
        
    })

    // set render loop
    renderer.setAnimationLoop(animate);

    // for window resizing
    window.addEventListener( 'resize', onWindowResize );
}

function checkIntersection(meshList){
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
    const intersects = raycaster.intersectObjects(meshList);
    if(intersects.length > 0){
        let meshItem = intersects[0].object
        return {mItem: meshItem};
    }
    return null;
}


function onRightTriggerPress(event) {

    if(!zoomed){

        let meshList = []
        for(let ann of mask.anns){
            meshList.push(ann.meshObj)
        }

        let castedObjects = checkIntersection(meshList);

        if(castedObjects != null){
            let ann = mask.meshToAnn(castedObjects.mItem);
            if(ann != undefined){
                mask.highlightOne(ann.cellNum)
                ann.meshObj.material.opacity = 0.5
                ann.meshObj.material.transparent = true;
                zoomed = true;
                mask.currentCell = ann.cellNum
                    
            }
        }
    } else {
        markCellCentre(false);
    }
}

function onRightSqueeze(event){
    if(!zoomed){
        let meshList = []
        for(let ann of mask.anns){
            meshList.push(ann.meshObj);
        }

        let castedObjects = checkIntersection(meshList);
        if(castedObjects != null){
            let ann = mask.meshToAnn(castedObjects.mItem);
            mask.markForRemove(ann);
        }
    } else {
        markCellCentre(true);
    }

}

function onLeftTriggerPress(event){
    // for annotating a new cell

    if(markedCell.length > 0){
        separateCells(markedCell, mask);
        markedCell = [];
    } else {
        mask.removeAllAnns();
    }
    
}

function onLeftTriggerSqueeze(event){
    console.log(controller1.position)
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
            return { name: "indigo", code: 0x4B0082 };
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
            return { name: "coral", code: 0xFF7F50 };   
        case 13:
            return { name: "dark green", code: 0x556B2F };   
        case 14:
            return { name: "purple", code: 0xBA55D3 };   
    }
}


function newLoad(link){
    function loading(data) {
        let loader = new OBJLoader();
        for(let object of data.objPaths){
            loader.load(object.path, (obj)=>{
                obj.traverse(function (child) {
                    if (child.isMesh) {
                        child.material.color.set(getAntColour((object.cell_num)%15).code);
                        child.material.side = THREE.DoubleSide
                        let shrinkSize = 0.1
                        child.scale.set(shrinkSize,shrinkSize,shrinkSize)
                        
                        child.position.set(object.min_coords.x*shrinkSize, object.min_coords.y*shrinkSize, object.min_coords.z*shrinkSize);
                        
                        let ann = new Ann(child, object.cell_num);
                        mask.addAnn(ann)
                    }
                });

            })
        }
    }
    quickFetch({action: "load", mask_link: link }, loading);


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

function animate(){
    renderer.render(scene, camera)
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



function markCellCentre(remove){

    let pos = new THREE.Vector3();
    pos.copy(controller1.position);
    pos.multiplyScalar(10);
    pos.remove = remove;
    markedCell.push(pos);

    let cube = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.1), new THREE.MeshBasicMaterial({color:0xffffff}));
    cube.position.set(pos.x*0.1,pos.y*0.1,pos.z*0.1);
    scene.add(cube);
    mask.segHelpers.push(cube)

}


function separateCells(markedCell, mask, boundBox, cellNum){
    quickFetch({action: "split", markers: markedCell, curr_cell: mask.currentCell, next_cell: mask.getNextCellNum()}, updateAnns);
}

function updateAnns(data){
    let objs = data.objects
    let loader = new OBJLoader();
    for(let object of objs){
        mask.removeAnn(object.cell_num)
        loader.load(object.path, (obj)=>{
            obj.traverse(function (child) {
                if (child.isMesh) {
                    child.material.color.set(getAntColour((object.cell_num)%15).code);
                    child.material.side = THREE.DoubleSide
                    // to keep true to scale (Need to find out why its like this)
                    child.position.set(0,0,0)
                    child.scale.set(0.1,0.1,0.1)
                    
                    // child.rotation.y = Math.PI/2
                    child.position.set(object.min_coords.x*0.1, object.min_coords.y*0.1, object.min_coords.z*0.1);
                    
                    let ann = new Ann(child, object.cell_num);
                    mask.addAnn(ann)
                }
            });

        })
    }
    zoomed = false;
    mask.removeSegHelpers();
    mask.unhighlight();
        

}
