import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

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
}


export class Ann {
    // Used to hold cell identifier and the mesh
    constructor(meshObj, cellNum){
        this.meshObj = meshObj;
        this.cellNum = cellNum;
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



export class Planes {
    /*
    This class is used to store the 3 axis planes and other relevant information for them
    Such as the array data and the last position of the controller
    */
    constructor(camera){
        this.xPlane = {mesh: new THREE.Mesh(new THREE.PlaneGeometry(0.1,0.1), new THREE.MeshBasicMaterial({depthTest: false, color: 0xff0000})), axis: "x", texture: null} ;
        this.yPlane = {mesh: new THREE.Mesh(new THREE.PlaneGeometry(0.1,0.1), new THREE.MeshBasicMaterial({depthTest: false})), axis: "y", texture: null};
        this.zPlane = {mesh: new THREE.Mesh(new THREE.PlaneGeometry(0.1,0.1), new THREE.MeshBasicMaterial({depthTest: false})), axis: "z", texture: null};
        this.planeGroup = new THREE.Group();
        this.oldPos = new THREE.Vector3(0,0,0);
        this.image = null;
        this.camera = camera

        let background = new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.2), new THREE.MeshBasicMaterial({color: 0x000000, depthTest: true}))
        background.renderOrder = 1

        this.planeGroup.add(background);
        this.planeGroup.add(this.xPlane.mesh);
        this.planeGroup.add(this.yPlane.mesh);
        this.planeGroup.add(this.zPlane.mesh);
        this.camera.add(this.planeGroup);
        camera.add(this.planeGroup);
        
        // this.camera.add(background)
        background.position.set(0,0,0)

        // Add the planes to the scene
        // this.camera.add(this.xPlane.mesh);
        this.xPlane.mesh.position.set(-0.2, 0, -0.0)
        // this.camera.add(this.yPlane.mesh);
        this.yPlane.mesh.position.set(-0.0, 0, -0.0);
        // this.camera.add(this.zPlane.mesh);
        this.zPlane.mesh.position.set(0.2, 0, -0.0);


        this.planeGroup.position.set(-0.25, 0.2,-0.5);

        // Ensure planes render on top of the cells so always visible
        this.xPlane.mesh.renderOrder = 99999;
        this.yPlane.mesh.renderOrder = 99999;
        this.zPlane.mesh.renderOrder = 99999;
    }

    updatePlane(plane, pos){
        /*
        Takes in one of the 3 axis planes and the current controller1 position
        It will then identify the slice for the plane 
        Once the slice is identified it will create a map for that plane
        This map is then applied to the plane mesh and updated.

        These maps help the user understand where they are located and what
        the true image looks like for their position
        The maps are updated any time the controller position moves
        */
        let slice = 0;
        let axis = plane.axis;
        if(axis == "z"){
            slice = pos.z;
        } else if (axis == "y"){
            slice = pos.y;
        } else {
            slice = pos.x;
        }
        if(slice > 63){
            slice = 63
        } else if (slice < 0){
            slice = 0;
        }

        let dataText = new Uint8Array(64*64 * 4);
        for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 64; x++) {
                let index = (y * 64 + x) * 4;
                let dp = 0;
                if(axis == "z"){
                    dp = this.image[Math.round(slice)][y][x];
                } else if (axis == "y"){
                    dp = this.image[y][Math.round(slice)][x];
                } else {
                    dp = this.image[y][x][Math.round(slice)];
                }
                dataText[index] = dp; // Red
                dataText[index + 1] = dp; // Green
                dataText[index + 2] = dp; // Blue (0 for no blue component)
                dataText[index + 3] =255;
            }
        }

        const texture = new THREE.DataTexture(
            dataText,
            64,
            64,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
            );
            texture.needsUpdate = true;
        
        if(axis == "z"){
            this.zPlane.mesh.material = new THREE.MeshBasicMaterial({map: texture, depthTest: false});
            this.zPlane.texture = texture;
        } else if (axis == "y"){
            this.yPlane.mesh.material = new THREE.MeshBasicMaterial({map:texture, depthTest: false});
            this.yPlane.texture = texture;
        } else {
            this.xPlane.mesh.material = new THREE.MeshBasicMaterial({map: texture, depthTest: false});
            this.xPlane.texture = texture;
        }
    }

    updatePlaneMarks(pos){
        /*
        Takes in the current controller1 position and finds the point in each axis for the array
        It then updates each of the planes to show a red mark where the user currently is
        This is to help the user identify what the real image looks like at their current position
        */

        let zTextureData = new Uint8Array(this.zPlane.texture.image.data);
        let zInd = (Math.round(pos.y) * 64 + Math.round(pos.x))*4
        zTextureData[zInd] = 255;
        zTextureData[zInd+1] = 0;
        zTextureData[zInd +2]=0;
        const zTexture = new THREE.DataTexture(
            zTextureData,
            64,
            64,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
            );
            zTexture.needsUpdate = true;
        this.zPlane.mesh.material = new THREE.MeshBasicMaterial({map: zTexture, depthTest: false});


        let yTextureData = new Uint8Array(this.yPlane.texture.image.data);
        let yInd = (Math.round(pos.z) * 64 + Math.round(pos.x))*4
        yTextureData[yInd] = 255;
        yTextureData[yInd+1] = 0;
        yTextureData[yInd +2]=0;
        const yTexture = new THREE.DataTexture(
            yTextureData,
            64,
            64,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
            );
            yTexture.needsUpdate = true;
        this.yPlane.mesh.material = new THREE.MeshBasicMaterial({map: yTexture, depthTest: false});


        let xTextureData = new Uint8Array(this.xPlane.texture.image.data);
        let xInd = (Math.round(pos.z) * 64 + Math.round(pos.y))*4
        xTextureData[xInd] = 255;
        xTextureData[xInd+1] = 0;
        xTextureData[xInd +2]=0;
        const xTexture = new THREE.DataTexture(
            xTextureData,
            64,
            64,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
            );
            xTexture.needsUpdate = true;
        this.xPlane.mesh.material = new THREE.MeshBasicMaterial({map: xTexture, depthTest: false});


    }
}

