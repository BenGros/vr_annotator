import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { Mask, Ann, quickFetch, SceneManager, Controls} from "./mask.js"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// For loading files
let mask_data_path = '';
let image_data_path = '';
let savePath = '';


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

// Initialization
// TODO: Break into smaller parts
async function init(){
    /*
    Make init an async function to ensure the vr button is not added until after the cells are loaded
    Init is wrapped in a promise that is resolved once the cell promise is resolved. Can now just use await
    when init is called to enforce this behaviour.
    */
    return new Promise((resolve, reject)=>{

        sceneManager.scene.background = new THREE.Color(0x0000ff);

        sceneManager.setupRenderer(document);

        sceneManager.addLighting();
        
        controls.createGrips();

        // set starting position in scene
        sceneManager.cameraControls.user.position.set(1.6,0.4,4);

        controls.addEventListeners(mask, merge, markCellCentre, checkIntersection, getAntColour, loadBoundBoxGltf, separateCells);


        sceneManager.setupGUI(mask, save, loadGltf, controls.controller1, controls.controller2);

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

function cellLoader(mask_link, image_link){
    /*
    Used to load in all cell objects based on the path provided by the
    backend which generates the objects
    Then applies the colouring to the cell and shrinks it by 10 to make them easier to maneuver around

    Returns a promise that is resolved when all the loads are finished. This ensures the user does not have access
    to the vr mode until the cells are loaded.
    */
   return new Promise((resolve, reject)=>{
   
    function loading(data) {
        let loader = new OBJLoader();
        let pendingloads = data.objPaths.length;
        loadGltf(false);
        // volumeRenderImage(planes.image);
        for(let object of data.objPaths){
            loader.load(object.path, (obj)=>{
                obj.traverse(function (child) {
                    if (child.isMesh) {
                        child.material.color.set(getAntColour((object.cell_num)%15).code);
                        child.material.side = THREE.DoubleSide
                        child.material.opacity = 0.8;
                        child.material.transparent = true;
                        let shrinkSize = 0.1
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

function markCellCentre(remove){
    /*
    Adds controller position with user offset (due to movement) applied
    to keep position consistent to original array

    Creates a cube at the position and colours it white or black 
    based on whether the cell is being kept or not
    */

    let pos = new THREE.Vector3();
    pos.copy(controls.controller1.position);
    pos.add(sceneManager.cameraControls.user.position);
    pos.multiplyScalar(10);
    pos.remove = remove;
    sceneManager.markedCell.push(pos);

    let cube = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.1), new THREE.MeshBasicMaterial({color:0xffffff}));
    remove && cube.material.color.set(0x000000); 
    cube.position.set(pos.x*0.1,pos.y*0.1,pos.z*0.1);
    sceneManager.scene.add(cube);
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
        sceneManager.scene.remove(mask.imageGroup.tempGroup);
        sceneManager.scene.add(mask.imageGroup.group);
        sceneManager.zoomed = false;
        sceneManager.markedCell = [];
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
                            child.material.side = THREE.DoubleSide;
                            child.position.set(0,0,0);
                            child.scale.set(0.1,0.1,0.1);
                            child.material.opacity = 0.5;
                            child.material.transparent = true;
                            
                            child.position.set(object.min_coords.x*0.1, object.min_coords.y*0.1, object.min_coords.z*0.1);
                            
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
                    child.scale.set(0.1,0.1,0.1);                 
                    child.position.set(object.min_coords.x*0.1, object.min_coords.y*0.1, object.min_coords.z*0.1);
                    child.material.opacity = 0.5;
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

function loadGltf(refresh, iso){
    if(sceneManager.zoomed){
    sceneManager.volconfig.isothreshold = 0.5;
    sceneManager.slider.updateDisplay();
    } else{
    if(refresh){
        quickFetch({action: "newImageCells", isothreshold: iso});
        sceneManager.scene.remove(mask.imageGroup.group);
    }
    const loader = new GLTFLoader();
    loader.load("objects/image.gltf", (gltf)=>{
        const model = gltf.scene;
        mask.imageGroup.group = model;
        sceneManager.scene.add(model);
        model.traverse((child)=>{
            if(child.isMesh){
                child.scale.set(0.1,0.1,0.1);
                child.material.side = THREE.DoubleSide;
                mask.imageGroup.mesh = child;
            }
        })
    })
}
}

function loadBoundBoxGltf(ann){
    sceneManager.scene.remove(mask.imageGroup.group);
    quickFetch({action: "customImageCell", min_coords: ann.minCoords, max_coords: ann.maxCoords, iso: sceneManager.volconfig.isothreshold}, newGltfLoad);
    function newGltfLoad(data){
        const loader = new GLTFLoader();
        loader.load("objects/image.gltf", (gltf)=>{
            const model = gltf.scene;
            mask.imageGroup.tempGroup = model;
            sceneManager.scene.add(model);
            model.traverse((child)=>{
                if(child.isMesh){
                    child.scale.set(0.1,0.1,0.1);
                    child.material.side = THREE.DoubleSide;
                    child.position.set(ann.minCoords.x*0.1, ann.minCoords.y*0.1, ann.minCoords.z*0.1);
                    mask.imageGroup.mesh = child;
                }
            });
        });
    }
}

