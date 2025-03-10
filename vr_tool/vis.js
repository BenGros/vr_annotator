import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { Mask, Ann, quickFetch, SceneManager, Controls} from "./mask.js"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// For loading files
let mask_data_path = '';
let image_data_path = '';
let savePath = '';

let shrinkSize = 0.1
let sceneManager = new SceneManager();
let mask = new Mask(sceneManager.scene);
let controls = new Controls(sceneManager, mask, merge, markCellCentre, checkIntersection, getAntColour, loadBoundBoxGltf, separateCells);

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
    document.body.appendChild( VRButton.createButton( sceneManager.renderer ) );
})

/**
 * Initializes the scene including creating the camera, controls, gui and adding the masks and the image to the scene
 * @returns Promise to allow await to be used for timing of adding the vr button and image loaded notice
 */
async function init(){
    return new Promise((resolve, reject)=>{

        sceneManager.scene.background = new THREE.Color(0x0000ff);

        sceneManager.setupRenderer(document);

        sceneManager.addLighting();
        
        controls.createGrips();

        // set starting position in scene
        sceneManager.cameraControls.user.position.set(1.6,0.4,4);

        controls.addEventListeners(mask, merge, markCellCentre, checkIntersection, getAntColour, loadBoundBoxGltf, separateCells);


        sceneManager.setupGUI(mask, save, loadGltf, loadBoundBoxGltf, controls.controller1, controls.controller2);

        // Load in cells
        cellLoader(mask_data_path, image_data_path).then(()=>{
            resolve();
        });

        // set render loop
        sceneManager.renderer.setAnimationLoop(animate);

        // for window resizing
        window.addEventListener( 'resize', onWindowResize );
    })
}

/**
 * Used to find the first object that the VRLine intersects with based on the given list of mesh
 * @param {Array} meshList - Contains all mesh objects that are to be checked if the vrLine intersects with 
 * @returns The mesh if sopmething is intersected or null if nothing is intersected
 */
function checkIntersection(meshList){
    /* Used to find the first mesh that the 
    VRcontroller helper line intersects with */

    let positionAttribute = controls.controlLine.geometry.getAttribute('position');
    let startPoint = new THREE.Vector3();
    startPoint.fromBufferAttribute(positionAttribute, 0);
    startPoint.applyMatrix4(controls.controlLine.matrixWorld);

    let endPoint = new THREE.Vector3();
    endPoint.fromBufferAttribute(positionAttribute, 1);
    endPoint.applyMatrix4(controls.controlLine.matrixWorld);

    let raycaster = new THREE.Raycaster();
    raycaster.set(startPoint, endPoint.sub(startPoint).normalize());
    const intersects = raycaster.intersectObjects(meshList);
    if(intersects.length > 0){
        let meshItem = intersects[0].object
        return {mItem: meshItem};
    }
    return null;
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

/**
 *  Used to create and load in all cell objects based on the path provided by the
    backend which generates the objects
    Then applies the colouring to the cell and shrinks it by 10 to make them easier to maneuver around

    Returns a promise that is resolved when all the loads are finished. This ensures the user does not have access
    to the vr mode until the cells are loaded.
 * @param {String} mask_link - relative or absolute path to the mask json file
 * @param {String} image_link - relative or absolute path to the image json file 
 * @returns Promise to be used to ensure that the vr button is not added to the display until after all the cells have loaded
 */
function cellLoader(mask_link, image_link){
   return new Promise((resolve, reject)=>{
   
    function loading(data) {
        let loader = new OBJLoader();
        let pendingloads = data.objPaths.length;
        loadGltf(false);
        for(let object of data.objPaths){
            loader.load(object.path, (obj)=>{
                obj.traverse(function (child) {
                    if (child.isMesh) {
                        child.material.color.set(getAntColour((object.cell_num)%15).code);
                        child.material.side = THREE.DoubleSide
                        child.material.opacity = sceneManager.volconfig.maskOpacity;
                        child.material.transparent = true;
                        child.scale.set(shrinkSize,shrinkSize,shrinkSize)
                        
                        child.position.set(object.min_coords.x*shrinkSize, object.min_coords.y*shrinkSize, object.min_coords.z*shrinkSize);
                        let ann = new Ann(child, object.cell_num, object.min_coords, object.max_coords);
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

    sceneManager.renderer.setSize( window.innerWidth, window.innerHeight );

    const aspect = window.innerWidth / window.innerHeight;

    const frustumHeight = sceneManager.cameraControls.camera.top - sceneManager.cameraControls.camera.bottom;

    sceneManager.cameraControls.camera.left = - frustumHeight * aspect / 2;
    sceneManager.cameraControls.camera.right = frustumHeight * aspect / 2;

    sceneManager.cameraControls.camera.updateProjectionMatrix();

    render();

}

function render() {
    sceneManager.renderer.render( sceneManager.scene, sceneManager.cameraControls.camera );
}

function animate(){
    /*
    Calls renderer to ensure everything updates

    Watches for the left controller as if it is squeezed 
    it has to move the user 

    Monitors the right controller position and if it moves
    will update the image planes as needed
    */
    sceneManager.renderer.render(sceneManager.scene, sceneManager.cameraControls.camera);

    const dt = sceneManager.clock.getDelta();
    if (controls.controller2 ) {
        controls.handleMovement(dt)};
    sceneManager.renderer.render( sceneManager.scene, sceneManager.cameraControls.camera );

}

/**
 * Used to mark parts of an existing cell for segmenting. Each cube will become a new cell.
 * The cubes are placed atthe end of the right-handed controller.
 * @param {boolean} remove - Whether the marked cell is to be removed (true) or added (false)
 */
function markCellCentre(remove){
    let pos = new THREE.Vector3();
    pos.copy(controls.controller1.position);
    pos.add(sceneManager.cameraControls.user.position);
    pos.multiplyScalar(1/shrinkSize);
    pos.remove = remove;
    sceneManager.markedCell.push(pos);

    let cube = new THREE.Mesh(new THREE.BoxGeometry(shrinkSize,shrinkSize,shrinkSize), new THREE.MeshBasicMaterial({color:0xffffff}));

    // make cube black iof it is going to be removed
    remove && cube.material.color.set(0x000000); 
    cube.position.set(pos.x*shrinkSize,pos.y*shrinkSize,pos.z*shrinkSize);
    sceneManager.scene.add(cube);
    mask.segHelpers.push(cube)

}

function separateCells(markedCell, mask){
    // Make call to backend to update the array and make new objects
    quickFetch({action: "split", markers: markedCell, curr_cell: mask.currentCell, next_cell: mask.getNextCellNum()}, updateAnns);
}

/**
 * Is used to show the newly segmented cells. Will remove the old cell and add the new cells to the scene.
 * Will storethe old cell in case the user does not like the segmentation.
 * @param {Object} data - Received from the backend after segemnetation occurs. Contains information abo the new cells. 
 */
function updateAnns(data){
    let objs = data.objects
    if(objs == null){
        mask.removeSegHelpers();
        mask.unHighlight();
        sceneManager.volconfig.isothreshold = 0.5;
        sceneManager.guiControls.slider.updateDisplay()
        sceneManager.scene.remove(mask.imageGroup.tempGroup);
        sceneManager.scene.add(mask.imageGroup.group);
        sceneManager.zoomed = false;
        sceneManager.markedCell = [];
        mask.currentSegmentCell.meshObj.material.opacity = sceneManager.volconfig.maskOpacity;

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
                            child.material.side = THREE.DoubleSide;
                            child.position.set(0,0,0);
                            child.scale.set(shrinkSize,shrinkSize,shrinkSize);
                            child.material.opacity = sceneManager.volconfig.maskOpacity;
                            child.material.transparent = true;
                            
                            child.position.set(object.min_coords.x*shrinkSize, object.min_coords.y*shrinkSize, object.min_coords.z*shrinkSize);
                            
                            let ann = new Ann(child, object.cell_num, object.min_coords, object.max_coords);
                            mask.addAnn(ann)
                            mask.newCells.push(ann);
                        }
                    });
                })
            }
        }
        mask.removeSegHelpers();
        sceneManager.verify = true;
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
        for(let num of cellNums){
            mask.removeAnn(num);
        }
        let loader = new OBJLoader();
        loader.load(object.path, (obj)=>{
            obj.traverse(function (child) {
                if (child.isMesh) {
                    child.material.color.set(getAntColour((object.cell_num)%15).code);
                    child.material.side = THREE.DoubleSide
                    child.position.set(0,0,0);
                    child.scale.set(shrinkSize,shrinkSize,shrinkSize);                 
                    child.position.set(object.min_coords.x*shrinkSize, object.min_coords.y*shrinkSize, object.min_coords.z*shrinkSize);
                    child.material.opacity = sceneManager.volconfig.maskOpacity;
                    child.material.transparent = true;

                    
                    let ann = new Ann(child, object.cell_num, object.min_coords, object.max_coords);
                    mask.addAnn(ann)
                }
            });
        })
        mask.removedAnns = [];
    }
}

function save(){
    /*
    This method is used to save the changes to the mask to the new file or the 
    original mask file depending on the user selection

    The quickfetch does the saving the rest of the function is creating a pop up to tell the user they saved
    it successfully
    */
    quickFetch({action: "save", link: savePath})
    const canvas = document.createElement('canvas');
    canvas.width = 256;  // Width of the canvas
    canvas.height = 128; // Height of the canvas

    const context = canvas.getContext('2d');
    context.font = '30px Arial'; // Font style and size
    context.fillStyle = 'white'; // Text color
    context.textAlign = 'center'; // Center the text
    context.fillText('Saved!', canvas.width / 2, canvas.height / 2); // Draw text

    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    const planeMaterial = new THREE.MeshBasicMaterial({
        map: texture,      // Apply the texture
        side: THREE.DoubleSide // Make sure both sides are visible
    });
    const saveText = new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.25), planeMaterial);
    sceneManager.cameraControls.camera.add(saveText);
    saveText.position.set(0,0,-0.5);
    saveText.renderOrder = 99999;
    setTimeout(()=>{sceneManager.cameraControls.camera.remove(saveText)}, 2000)
}

/**
 * Used to create and load a 3d rendering of the entire lightsheet image provided
 * @param {boolean} refresh - whether or not there is already an image
 * @param {number} iso - Used to set the isothrehold level for the 3d rendering of the lightsheet data 
 */
function loadGltf(refresh, iso){
    if(refresh){
        quickFetch({action: "newImageCells", isothreshold: iso});
        sceneManager.scene.remove(mask.imageGroup.group);
        sceneManager.scene.remove(mask.imageGroup.tempGroup);
    }
    const loader = new GLTFLoader();
    loader.load("objects/image.gltf", (gltf)=>{
        const model = gltf.scene;
        mask.imageGroup.group = model;
        sceneManager.scene.add(model);
        model.traverse((child)=>{
            if(child.isMesh){
                child.scale.set(shrinkSize,shrinkSize,shrinkSize);
                child.material.side = THREE.DoubleSide;
                child.material.opacity = sceneManager.volconfig.imageOpacity;
                child.material.transparent=false;
                mask.imageGroup.mesh = child;
                child.renderOrder = 2;
            }
        })
    })
}

/**
 * Used to create and load the lightsheet image only around the area of the current cell being looked at
 * @param {Ann} ann - Annotation variable holding cell number, the mesh and the bound box coordinates 
 */
function loadBoundBoxGltf(ann){
    // Remove the old images from scene
    sceneManager.scene.remove(mask.imageGroup.group);
    sceneManager.scene.remove(mask.imageGroup.tempGroup);
    // use pyvista to create the image using the bound box coordinates for the annotation
    quickFetch({action: "customImageCell", min_coords: ann.minCoords, max_coords: ann.maxCoords, iso: sceneManager.volconfig.isothreshold}, newGltfLoad);

    // callback function to process the object created
    function newGltfLoad(data){
        // load in the new gltf object
        const loader = new GLTFLoader();
        loader.load("objects/image.gltf", (gltf)=>{
            // add the object to the scene
            const model = gltf.scene;
            mask.imageGroup.tempGroup = model;
            sceneManager.scene.add(model);
            model.traverse((child)=>{
                if(child.isMesh){
                    // change mesh to fit into the scene
                    child.scale.set(shrinkSize,shrinkSize,shrinkSize);
                    child.material.side = THREE.DoubleSide;
                    child.material.opacity = sceneManager.volconfig.imageOpacity;
                    child.position.set(ann.minCoords.x*shrinkSize, ann.minCoords.y*shrinkSize, ann.minCoords.z*shrinkSize);
                    mask.imageGroup.mesh = child;
                }
            });
        });
    }
}
