import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

export class Mask{
    /*
    This class is used to hold all the information relevant to the cell objects
    This includes the cells themselves, and other lists for removing and segmenting cells
    */

    constructor(scene){
        this.totalMask = null;
        this.anns = [];
        this.removedAnns = [];
        this.hiddenAnns = [];
        this.scene = scene;
        this.currentCell = 0;
        this.segHelpers = [];
        this.newCells = [];
        this.currentSegmentCell = null;
        this.imageGroup = {group: null, mesh: null, tempGroup: null};
    }

    addAnn(ann){
        // used to add ann to scene and list to be called for later
        this.anns.push(ann);
        this.scene.add(ann.meshObj);
    }

    markForRemove(ann){
        /* Users can mark cell for removal which signals 
        that they are going to be removed. By marking them and not
        instantly removing them the user has the oppurtunity to unmark them
        */
        this.removedAnns.push(ann);
        ann.meshObj.material.color.set(0x000000);
    }

    removeAnn(cellNum){
        /* 
        Remove a cell from the scene and the main array by the cell number
        */
        for(let a of this.anns){
            if(a.cellNum == cellNum){
                this.scene.remove(a.meshObj);
            }
        }
        this.anns = this.anns.filter((a)=>{ return a.cellNum != cellNum})
    }

    removeAllAnns(){
        /*
        Execute the removal of the marked cells
        Makes fetch to remove the cells from the mask on the backend
        */
        for(let ann of this.removedAnns){
            this.removeAnn(ann.cellNum)
        }

        quickFetch({action: "remove", remObjects: this.removedAnns});
        this.removedAnns = [];
    }
    

    hideAnn(ann){
        /* Will hide a cell when called but store in a list to be returned */
        this.scene.remove(ann.meshObj);
        this.hiddenAnns.push(ann);
    }

    updateMask(){
        // Make save fetch which will write to the original mask file
        quickFetch({action: "save"})
    }
    
    highlightOne(cellNum){
        /* Will hide every other cell
        Used to allow the user to easily annotate a cell without other cells getting
        in the way.
        */
        for(let ann of this.anns){
            if(ann.cellNum != cellNum){
                console.log("Here")
                this.hideAnn(ann);
            } else {
                ann.meshObj.scale.set(0.1,0.1,0.1)

            }
        }
    }

    unHighlight(){
        /* Will unhide the other cells to return to normal */
        while(this.hiddenAnns.length > 0){
            let ann = this.hiddenAnns.pop();
            this.scene.add(ann.meshObj);
        }
    }

    meshToAnn(mesh){
        /* Will return the ann from the mesh 
        Mostly used to get this cell number 
        */
        for(let ann of this.anns){
            if(mesh == ann.meshObj){
                return ann;
            }
        }
    }

    getNextCellNum(){
        // Return the next cell number to be used by fidning max and adding one
        let max = 0;
        for(let ann of this.anns){
            if(ann.cellNum > max){
                max = ann.cellNum;
            }
        }

        return max+1;

    }
    removeSegHelpers(){
        // Removes the cubes to mark the centre of the cells
        while(this.segHelpers.length > 0){
            let help = this.segHelpers.pop()
            this.scene.remove(help)
        }
    }

    removeNew(){
        /*
        This method is called when a user ends up not wanting to use
        the segmentation that occured.

        Removes the cell from the scene and records it cell number so it
        can be removed from the array and turned back into the original cell
        */
        let oldCellNums = [];
        while(this.newCells.length > 0){
            let ann = this.newCells.pop();
            oldCellNums.push(ann.cellNum);
            this.removeAnn(ann.cellNum);
        }
        oldCellNums.sort();
        quickFetch({action: "undo", cellNums: oldCellNums})
        this.currentSegmentCell.meshObj.material.opacity =1;
        this.addAnn(this.currentSegmentCell);
    }

    toggleMask(show){
        if(show==1){
            this.unHighlight();
        } else {
            for (let ann of this.anns){
                this.hideAnn(ann);
            }
        }
    }
}

export class Ann {
    // Used to hold cell identifier and the mesh
    constructor(meshObj, cellNum, min, max){
        this.meshObj = meshObj;
        this.cellNum = cellNum;
        this.minCoords = min;
        this.maxCoords = max;
    }
}

export function quickFetch(body, callFunc){
    /*
    Basic fetch function to simplify fetch calls in other methods
    Allows the user to send an object to the backend and then use 
    a callback function on the data received. Can also not use any function if not needed
    */
    console.log(body)
    fetch("http://127.0.0.1:8080/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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
            if(callFunc != null || callFunc != undefined){
                callFunc(data);
            }
            console.log("Server response:", data);
        })
        .catch(function (error) {
          console.error(
            "There has been a problem with your fetch operation:",
            error
          );
        });
}


export class SceneManager {
    constructor(){
        this.zoomed = false;
        this.verify = false;
        this.markedCell = [];
        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();
        this.renderer = new THREE.WebGLRenderer();
        this.cameraControls = {camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
            user: new THREE.Object3D()};
        this.guiControls = {gui: new GUI({width:300}), guiMesh: null, group: new InteractiveGroup(), slider: null};
        this.volconfig = {isothreshold: 0.5, showMask: 1};
        
        this.cameraControls.user.add(this.cameraControls.camera);
        this.scene.add(this.cameraControls.user); 
    }

    setupGUI(mask, save, loadGltf, controller1, controller2){
        this.guiControls.gui.add({save: save}, 'save');
        this.guiControls.slider = this.guiControls.gui.add(this.volconfig,"isothreshold", 0,1,0.01).onFinishChange((value)=>loadGltf(true, value));
        this.guiControls.gui.add(this.volconfig, "showMask", 0,1,1).name("Show Mask").onChange(()=>mask.toggleMask(this.volconfig.showMask));
        this.guiControls.gui.domElement.style.visibility = 'hidden';

        // make GUI interactive within VR
        this.guiControls.group.listenToPointerEvents( this.renderer, this.cameraControls.camera );
        this.guiControls.group.listenToXRControllerEvents( controller1 );
        this.guiControls.group.listenToXRControllerEvents( controller2 );
        this.scene.add( this.guiControls.group );
        this.guiControls.guiMesh = new HTMLMesh( this.guiControls.gui.domElement );
        this.guiControls.guiMesh.scale.setScalar( 20 );
        this.guiControls.guiMesh.position.set(2,2,-2);
        this.guiControls.group.add( this.guiControls.guiMesh );
    }
    
    setupRenderer(document){
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.renderer.xr.enabled = true;
        document.body.appendChild( this.renderer.domElement );
    }

    addLighting(){
        const ambientLight = new THREE.AmbientLight(0xffffff); // White light
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 1).normalize();
        this.scene.add(directionalLight);

        const oppositeLight = new THREE.DirectionalLight(0xffffff, 1);
        oppositeLight.position.set(-1, -1, -1).normalize();
        this.scene.add(oppositeLight);
    }
}

export class Controls {
    constructor(sceneManager){
        this.controller1 = sceneManager.renderer.xr.getController(1);
        this.controller2 = sceneManager.renderer.xr.getController(0);
        this.dummyController = new THREE.Object3D();
        this.rightTriggerHoldTime = null;

        this.leftTriggerHoldTime = 0;
        this.rightSqueezeHoldTime = 0;
        this.sceneManager = sceneManager;
        this.controlLine= null;

        this.controller2.add(this.dummyController);
        this.sceneManager.cameraControls.user.add(this.controller1);
        this.sceneManager.cameraControls.user.add(this.controller2);

    }

    onRightTriggerStart(){
        this.rightTriggerHoldTime = Date.now();
        console.log(this.rightTriggerHoldTime);
    }

    onRightTriggerStop(mask, checkIntersection, getAntColour, loadBoundBoxGltf, markCellCentre){
        /* Check if zoomed in on one cell
        If not use raycaster to detect the interacted cell and zoom in 
        on it.

        If it is zoomed mark the centre of the cell with a cube signalling it 
        is to be segmented and kept
        */

        // See how long the press was
        this.rightTriggerHoldTime = Date.now() - this.rightTriggerHoldTime;
        // save the mask if longer than 3 seconds
        if(this.rightTriggerHoldTime > 3000){
            //save();
        } else {
            // Make sure a cell is not highlighted
            if(!this.sceneManager.zoomed){
                // not trying to merge or remove any cells
                if(mask.removedAnns.length <1){
                    this.handleCellHighlight(mask, checkIntersection, loadBoundBoxGltf);
                } else {
                    // unmark a cell that was to be removed
                    this.cellUnmark(mask, checkIntersection, getAntColour);
                }
                
            } else {
                // if a cell is highlighted mark the centre for segmenting
                markCellCentre(false);
            }
        }

    }

    handleCellHighlight(mask, checkIntersection, loadBoundBoxGltf){
        let meshList = mask.anns.map(ann => ann.meshObj);
        let castedObjects = checkIntersection(meshList);
                    
        // make sure at least one object was intersected
        if(castedObjects != null){
            let ann = mask.meshToAnn(castedObjects.mItem);
            // treat as cell to be segmented
            if(ann != undefined && ann.meshObj.material.color != 0x000000){
                mask.highlightOne(ann.cellNum)
                mask.currentSegmentCell = ann;
                loadBoundBoxGltf(ann)
                ann.meshObj.material.opacity = 0.5
                ann.meshObj.material.transparent = true;
                this.sceneManager.zoomed = true;
                mask.currentCell = ann.cellNum
            } 
        }
    }

    cellUnmark(mask, checkIntersection, getAntColour){
        let meshList = mask.removedAnns.map(ann => ann.meshObj);
        let castedObjects = checkIntersection(meshList);

        if(castedObjects != null){
            let ann = mask.meshToAnn(castedObjects.mItem);
            if (ann != undefined){
                ann.meshObj.material.color.set(getAntColour(ann.cellNum%15).code);
                mask.removedAnns = mask.removedAnns.filter((a)=>{return a!=ann});
            }
        }
    }

    onRightSqueezeStart(){
        this.rightSqueezeHoldTime = Date.now();
        console.log(`Right sque: ${this.rightSqueezeHoldTime}`);
    }

    onRightSqueezeStop(merge, mask, markCellCentre, checkIntersection){
        console.log(`Right squ: ${this.rightSqueezeHoldTime}`);
        this.rightSqueezeHoldTime = parseInt(Date.now()) - parseInt(this.rightSqueezeHoldTime);
        console.log(`Right sq: ${this.rightSqueezeHoldTime}`);
        if(this.rightSqueezeHoldTime > 1900){
            console.log("Merge")
            merge();
        } else {
            if(!this.sceneManager.zoomed){
                let meshList = mask.anns.map(ann=>ann.meshObj);
        
                let castedObjects = checkIntersection(meshList);
                if(castedObjects != null){
                    let ann = mask.meshToAnn(castedObjects.mItem);
                    mask.markForRemove(ann);
                }
            } else {
                if(this.sceneManager.verify){
                    mask.unHighlight();
                    this.sceneManager.markedCell = [];
                    this.sceneManager.zoomed = false;
                    this.sceneManager.verify = false;
                    mask.removeNew();
                    this.sceneManager.scene.remove(mask.imageGroup.tempGroup);
                    this.sceneManager.scene.add(mask.imageGroup.group);
                } else {
                    markCellCentre(true);
                }
            }
        }
    }

    onLeftTriggerPress(mask, separateCells){
        if(this.sceneManager.markedCell.length > 1){
            if(!this.sceneManager.verify){
                separateCells(this.sceneManager.markedCell, mask);
            } else {
                mask.unHighlight();
                this.sceneManager.markedCell = [];
                this.sceneManager.zoomed = false;
                this.sceneManager.verify = false;
                mask.toRemove = [];
                mask.currentSegmentCell = null;
                mask.newCells = [];
                this.sceneManager.scene.remove(mask.imageGroup.tempGroup);
                this.sceneManager.scene.add(mask.imageGroup.group);
                quickFetch({action: "complete_segment"});
            }
        } else if(mask.removedAnns.length > 0){
            mask.removeAllAnns();
        }
    }

    onLeftTriggerSqueezeStart(){

        this.controller2.userData.squeezePressed = true;
    }
    
    onLeftTriggerSqueezeStop(){
        // stops motion
        this.controller2.userData.squeezePressed = false;
    }
    
    handleMovement(dt){
        /*  
        Well motion is wanted calculate the camera direction and move entire user object
        in that direction at a preset speed
        */
        if (this.controller2.userData.squeezePressed){
            const speed = 0.5;
            const quaternion = this.sceneManager.cameraControls.user.quaternion.clone();
            const quat = new THREE.Quaternion();
            this.dummyController.getWorldQuaternion(quat);
            this.sceneManager.cameraControls.user.quaternion.copy(quat);
            this.sceneManager.cameraControls.user.translateZ(-dt*speed);
            this.sceneManager.cameraControls.user.quaternion.copy(quaternion);
        }
    }

    createGrips(){
        const controllerModelFactory = new XRControllerModelFactory();
        const cgrip1 = this.sceneManager.renderer.xr.getControllerGrip(0);
        cgrip1.add(controllerModelFactory.createControllerModel( cgrip1 ));
        this.sceneManager.cameraControls.user.add(cgrip1);

        const cgrip2 = this.sceneManager.renderer.xr.getControllerGrip(1);
        cgrip2.add(controllerModelFactory.createControllerModel( cgrip2 ));
        this.sceneManager.cameraControls.user.add(cgrip2);

        // setup VR hand visuals
        const hand1 = this.sceneManager.renderer.xr.getHand(0);
        this.sceneManager.cameraControls.user.add(hand1);

        const hand2 = this.sceneManager.renderer.xr.getHand(1);
        this.sceneManager.cameraControls.user.add(hand2);

        const lineGeom = new THREE.BufferGeometry();
        lineGeom.setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 5 ) ] );
        this.controlLine = new THREE.Line(lineGeom)
        this.controller1.add(this.controlLine);
    }

    addEventListeners(mask, merge, markCellCentre, checkIntersection, getAntColour, loadBoundBoxGltf, separateCells){
        // Can highligh a single cell, once it does that it marks the centre of a cell for splitting
        this.controller1.addEventListener('selectstart', ()=>this.onRightTriggerStart());
        this.controller1.addEventListener('selectend', ()=>this.onRightTriggerStop(mask, checkIntersection, getAntColour, loadBoundBoxGltf, markCellCentre));
        // Will either mark the centre of a cell for removal or mark an entire cell for removal
        this.controller1.addEventListener('squeezestart', ()=>this.onRightSqueezeStart());
        this.controller1.addEventListener('squeezeend', ()=>{this.onRightSqueezeStop(merge, mask, markCellCentre, checkIntersection)});
        // Will send request back to backend for removals and segmentations
        this.controller2.addEventListener('selectstart', ()=>{this.onLeftTriggerPress(mask, separateCells)});
        // Start movement
        this.controller2.addEventListener('squeezestart', ()=>this.onLeftTriggerSqueezeStart());
        // End movement
        this.controller2.addEventListener('squeezeend', ()=>this.onLeftTriggerSqueezeStop());

    }
} 
