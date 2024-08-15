import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { Mask, Ann, quickFetch, Planes} from "./mask.js"

// General scene elements
let scene, renderer, camera, gui;

let oldpos;

// VR Controls
let controller1, controller2, cgrip1, cgrip2, hand1, hand2;

let dummyCam;
let dummyController;

// VR Annotation Guides
let vrLine;
let controlLine;

// GUI setup
let guiMesh;
let group, user, planes;

let raycaster;

let rightSquuezeHoldTime = 0;
let rightTriggerHoldTime = 0;

// For loading files
let mask_data_path = '';
let image_data_path = '';
let savePath = '';

let markedCell = [];

let mask;
let zoomed = false;
let verify = false;

let clock;

// html pieces for receiving path input
const oldMaskInp = document.getElementById('maskDP');
const form = document.getElementById('paths');
const newImageInp = document.getElementById('imagePath');
const newSavePath = document.getElementById("newSavePath");
const saveCheck = document.getElementById("saveLoc")
form.addEventListener('submit', async (event)=>{
    event.preventDefault()
    mask_data_path = oldMaskInp.value
    image_data_path = newImageInp.value;
    if(saveCheck.checked){
        savePath = newSavePath.value;
    } else{
        savePath = mask_data_path;
    }

    // initialize scene, which includes waiting for all cells to load in
    await init();

    
    // Allow user to enter vr
    document.getElementById('loaded').innerHTML = "Image Loaded"
    document.body.appendChild( VRButton.createButton( renderer ) );
})

// Initialization
// TODO: Break into smaller parts
async function init(){
    return new Promise((resolve, reject)=>{
        // Basic Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0000ff);
    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.xr.enabled = true;
    document.body.appendChild( renderer.domElement );

    // Camera Setup
    user = new THREE.Object3D();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    user.add(camera);
    scene.add(user);
    dummyCam = new THREE.Object3D();
    camera.add(dummyCam);

    clock = new THREE.Clock();


    // Add lighting to define shapes
    const ambientLight = new THREE.AmbientLight(0xffffff); // White light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    const oppositeLight = new THREE.DirectionalLight(0xffffff, 1);
    oppositeLight.position.set(-1, -1, -1).normalize();
    scene.add(oppositeLight);
    mask = new Mask(scene);

    // setup VR controllers and add to user object for movement
    controller1 = renderer.xr.getController(0);
    user.add(controller1);

    controller2 = renderer.xr.getController(1);
    user.add(controller2);

    dummyController = new THREE.Object3D();
    controller2.add(dummyController);

    // setup Controller grips
    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();
    cgrip1 = renderer.xr.getControllerGrip(0);
    cgrip1.add(controllerModelFactory.createControllerModel( cgrip1 ));
    user.add(cgrip1);

    cgrip2 = renderer.xr.getControllerGrip(1);
    cgrip2.add(controllerModelFactory.createControllerModel( cgrip2 ));
    user.add(cgrip2);

    // setup VR hand visuals
    hand1 = renderer.xr.getHand(0);
    user.add(hand1);

    hand2 = renderer.xr.getHand(1);
    user.add(hand2);
    
    // Add guide line to right handed controller
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 5 ) ] );
    controlLine = new THREE.Line(lineGeom)
    controller1.add(vrLine);
    controller1.add(controlLine);
    controller1.scale.set(0.1,0.1,0.1);

    // set starting position in scene
    user.position.set(1.6,0.4,4);

    // Can highligh a single cell, once it does that it marks the centre of a cell for splitting
    controller1.addEventListener('selectstart', onRightTriggerStart);
    controller1.addEventListener('selectend', onRightTriggerStop);
    // Will either mark the centre of a cell for removal or mark an entire cell for removal
    controller1.addEventListener('squeezestart', onRightSqueezeStart);
    controller1.addEventListener('squeezeend', onRightSqueezeStop);
    // Will send request back to backend for removals and segmentations
    controller2.addEventListener('selectstart', onLeftTriggerPress);
    // Start movement
    controller2.addEventListener('squeezestart', onLeftTriggerSqueezeStart);
    // End movement
    controller2.addEventListener('squeezeend', onLeftTriggerSqueezeStop);


    // Build out GUI
    gui = new GUI({width: 300});
    gui.add({save: ()=>{
        mask.updateMask();
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

    // Load in cells
    cellLoader(mask_data_path, image_data_path).then(()=>{
        resolve();
    });

    // set render loop
    renderer.setAnimationLoop(animate);

    // for window resizing
    window.addEventListener( 'resize', onWindowResize );
    oldpos = new THREE.Vector3();
    oldpos.copy(controller1.position);
    oldpos.add(user.position);
    oldpos.multiplyScalar(10);

    })
    
    
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
    /* Check if zoomed in on one cell
    If not use raycaster to detect the interacted cell and zoom in 
    on it.

    If it is zoomed mark the centre of the cell with a cube signalling it 
    is to be segmented and kept
    */

    if(!zoomed){
        if(mask.removedAnns.length <1){

            let meshList = []
            for(let ann of mask.anns){
                meshList.push(ann.meshObj)
            }

            let castedObjects = checkIntersection(meshList);

            if(castedObjects != null){
                let ann = mask.meshToAnn(castedObjects.mItem);
                if(ann != undefined && ann.meshObj.material.color != 0x000000){
                    console.log("HIghlight")
                    mask.highlightOne(ann.cellNum)
                    mask.currentSegmentCell = ann;
                    ann.meshObj.material.opacity = 0.5
                    ann.meshObj.material.transparent = true;
                    zoomed = true;
                    mask.currentCell = ann.cellNum
                } else if (ann != undefined){
                    ann.meshObj.material.color.set(getAntColour(ann.cellNum%15).code);
                    mask.removedAnns = mask.removedAnns.filter((a)=>{
                        if(a == ann){
                            return false;
                        }
                        return true;
                    })
                }
            }
        } else {
            let meshList = []
            for(let ann of mask.removedAnns){
                meshList.push(ann.meshObj)
            }

            let castedObjects = checkIntersection(meshList);
            if(castedObjects != null){
                let ann = mask.meshToAnn(castedObjects.mItem);
                if (ann != undefined){
                    ann.meshObj.material.color.set(getAntColour(ann.cellNum%15).code);
                    mask.removedAnns = mask.removedAnns.filter((a)=>{
                        if(a == ann){
                            return false;
                        }
                        return true;
                    })
                }

            }

        }
    } else {
        markCellCentre(false);
    }
}

function onRightTriggerStart(){
    rightTriggerHoldTime = Date.now();
}

function onRightTriggerStop(){
    rightTriggerHoldTime = Date.now() - rightTriggerHoldTime;
    if(rightTriggerHoldTime > 3000){
        quickFetch({action: "save", link: savePath})
    } else {
        if(!zoomed){
            if(mask.removedAnns.length <1){
    
                let meshList = []
                for(let ann of mask.anns){
                    meshList.push(ann.meshObj)
                }
    
                let castedObjects = checkIntersection(meshList);
    
                if(castedObjects != null){
                    let ann = mask.meshToAnn(castedObjects.mItem);
                    if(ann != undefined && ann.meshObj.material.color != 0x000000){
                        console.log("HIghlight")
                        mask.highlightOne(ann.cellNum)
                        mask.currentSegmentCell = ann;
                        ann.meshObj.material.opacity = 0.5
                        ann.meshObj.material.transparent = true;
                        zoomed = true;
                        mask.currentCell = ann.cellNum
                    } else if (ann != undefined){
                        ann.meshObj.material.color.set(getAntColour(ann.cellNum%15).code);
                        mask.removedAnns = mask.removedAnns.filter((a)=>{
                            if(a == ann){
                                return false;
                            }
                            return true;
                        })
                    }
                }
            } else {
                let meshList = []
                for(let ann of mask.removedAnns){
                    meshList.push(ann.meshObj)
                }
    
                let castedObjects = checkIntersection(meshList);
                if(castedObjects != null){
                    let ann = mask.meshToAnn(castedObjects.mItem);
                    if (ann != undefined){
                        ann.meshObj.material.color.set(getAntColour(ann.cellNum%15).code);
                        mask.removedAnns = mask.removedAnns.filter((a)=>{
                            if(a == ann){
                                return false;
                            }
                            return true;
                        })
                    }
    
                }
    
            }
        } else {
            markCellCentre(false);
        }

    }
}


function onRightSqueeze(event){
    /*
    Similar to trigger press except if not zoomed
    mark the entire cell for removal by turning it black
    If it is zoomed mark the cell centre for segmenting and removal
    (Used to remove parts of a cell that don't belong)
    */
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
        if(verify){
            mask.unHighlight();
            markedCell = [];
            zoomed = false;
            verify = false;
            mask.removeNew();

        } else {
            markCellCentre(true);
        }
    }

}

function onRightSqueezeStart(event){
    rightSquuezeHoldTime = Date.now();
}

function onRightSqueezeStop(event){
    rightSquuezeHoldTime = Date.now() - rightSquuezeHoldTime;
    if(rightSquuezeHoldTime > 1900){
        merge();
    } else {
        console.log("HERE")
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
            if(verify){
                mask.unHighlight();
                markedCell = [];
                zoomed = false;
                verify = false;
                mask.removeNew();
    
            } else {
                markCellCentre(true);
            }
        }

    }
}

function onLeftTriggerPress(event){
    /*
    If a centre is marked use the segmenting function
    If not remove all the cells marked for removal
    */

    if(markedCell.length > 1){
        if(!verify){
            separateCells(markedCell, mask);
        } else {
            mask.unHighlight();
            markedCell = [];
            zoomed = false;
            verify = false;
            mask.toRemove = [];
            mask.currentSegmentCell = null;
            mask.newCells = [];
            quickFetch({action: "complete_segment"});
        }
    } else if(mask.removedAnns.length > 0){
        mask.removeAllAnns();
    }
    
}

function onLeftTriggerSqueezeStart(event){

    controller2.userData.squeezePressed = true;
}

function onLeftTriggerSqueezeStop(event){
    // stops motion
    controller2.userData.squeezePressed = false;
}

function handleMovement(controller, dt){
    /*  
    Well motion is wanted calculate the camera direction and move entire user object
    in that direction at a preset speed
    */
    if (controller.userData.squeezePressed ){
        const speed = 0.5;
        const quaternion = user.quaternion.clone();
        const quat = new THREE.Quaternion();
        // dummyCam.getWorldQuaternion(quat);
        dummyController.getWorldQuaternion(quat);
        user.quaternion.copy(quat);
        user.translateZ(-dt*speed);
        user.quaternion.copy(quaternion);
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

function cellLoader(mask_link, image_link){
    /*
    Used to load in all cell objects based on the path provided by the
    backend which generates the objects
    Then applies the colouring to the cell and shrinks it by 10 to make them easier to maneuver around
    */
   return new Promise((resolve, reject)=>{

   
    function loading(data) {
        let loader = new OBJLoader();
        let pendingloads = data.objPaths.length;
        planes = new Planes(camera, controller1);
        planes.image = data.image;
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
            pendingloads -=1
            if(pendingloads == 0){
                resolve()
            }
        }
    }
    quickFetch({action: "load", mask_link: mask_link, image_link: image_link}, loading);

});
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
    /*
    Calls the renderer and also keeps track if camera should be moving
    */
    renderer.render(scene, camera);
    const dt = clock.getDelta();
    if (controller2 ) {
        handleMovement( controller2, dt )};
    renderer.render( scene, camera );

    let currPos = new THREE.Vector3();
    currPos.copy(controller1.position);
    currPos.add(user.position);
    currPos.multiplyScalar(10);

    if(planes){
        if(currPos.z !=planes.oldPos.z){
            planes.updatePlane(planes.zPlane, currPos);
        }
        if(currPos.y != planes.oldPos.y){
            planes.updatePlane(planes.yPlane, currPos);
        }
        if(currPos.x != planes.oldPos.x){
            planes.updatePlane(planes.xPlane, currPos);
        }
        planes.oldPos.copy(currPos);
        planes.updatePlaneMarks(currPos);
    }
}


function markCellCentre(remove){
    /*
    Adds controller position with user offset (due to movement) applied
    to keep position consistent to original array

    Creates a cube at the position and colours it white or black 
    based on whether the cell is being kept or not
    */

    let pos = new THREE.Vector3();
    pos.copy(controller1.position);
    pos.add(user.position);
    pos.multiplyScalar(10);
    pos.remove = remove;
    markedCell.push(pos);

    let cube = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.1), new THREE.MeshBasicMaterial({color:0xffffff}));
    remove && cube.material.color.set(0x000000); 
    cube.position.set(pos.x*0.1,pos.y*0.1,pos.z*0.1);
    scene.add(cube);
    mask.segHelpers.push(cube)

}


function separateCells(markedCell, mask){
    // Make call to backend to update the array and make new objects
    quickFetch({action: "split", markers: markedCell, curr_cell: mask.currentCell, next_cell: mask.getNextCellNum()}, updateAnns);
}

function updateAnns(data){
    /*
    Takes the new objects from the backend and removes the old object
    and adds the new ones
    Adds the other cells back to allow more annotating
    */
    let objs = data.objects
    if(objs == null){
        mask.removeSegHelpers();
        mask.unHighlight();
        zoomed = false;
        markedCell = [];
        mask.currentSegmentCell.meshObj.material.opacity = 1;

    } else{
        let loader = new OBJLoader();
        mask.scene.remove(mask.currentSegmentCell.meshObj);
        mask.anns = mask.anns.filter(a=>a!=mask.currentSegmentCell);
        for(let object of objs){
            if(!object.remove){
                loader.load(object.path, (obj)=>{
                    obj.traverse(function (child) {
                        if (child.isMesh) {
                            child.material.color.set(getAntColour((object.cell_num)%15).code);
                            child.material.side = THREE.DoubleSide
                            child.position.set(0,0,0)
                            child.scale.set(0.1,0.1,0.1)
                            
                            child.position.set(object.min_coords.x*0.1, object.min_coords.y*0.1, object.min_coords.z*0.1);
                            
                            let ann = new Ann(child, object.cell_num);
                            mask.addAnn(ann)
                            mask.newCells.push(ann);
                        }
                    });

                })
            }
        }
        mask.removeSegHelpers();
        verify = true;
    }

}

function merge(){
    /*
    This function is used to combine two or more cells into one cell
    Uses the same marking that the removal does meaning 
    marked cells can be rmeoved or merged

    */
    let cell_nums = []
    for (let ann of mask.removedAnns){
        cell_nums.push(ann.cellNum);
    }

    quickFetch({action: "merge", cell_nums: cell_nums}, loadCell);


    function loadCell(data){
        /*
        Similar function to update anns just a few less features since it is 
        only one object and it should never be removed
        */
        let object = data.object;
        let cellNums = data.cell_nums;
        mask.anns = mask.anns.filter(a=>!cellNums.includes(a.cellNum));
        for(let num of cellNums){
            mask.removeAnn(num);
        }
        let loader = new OBJLoader();
        loader.load(object.path, (obj)=>{
            obj.traverse(function (child) {
                if (child.isMesh) {
                    child.material.color.set(getAntColour((object.cell_num)%15).code);
                    child.material.side = THREE.DoubleSide
                    child.position.set(0,0,0)
                    child.scale.set(0.1,0.1,0.1)
                    
                    child.position.set(object.min_coords.x*0.1, object.min_coords.y*0.1, object.min_coords.z*0.1);
                    
                    let ann = new Ann(child, object.cell_num);
                    mask.addAnn(ann)
                }
            });

        })

        mask.removedAnns = [];


    }

}


