import * as THREE from 'three';

export class Mask{

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
        this.anns.push(ann);
        this.scene.add(ann.meshObj);
    }

    markForRemove(ann){
            this.removedAnns.push(ann);
            ann.meshObj.material.color.set(0x000000);
    }

    removeAnn(cellNum){
        for(let a of this.anns){
            if(a.cellNum == cellNum){
                this.scene.remove(a.meshObj);
            }
        }
        this.anns = this.anns.filter((a)=>{
            if(a.cellNum == cellNum){
                return false;
            }
            return true;
        })
    }

    removeAllAnns(){
        for(let ann of this.removedAnns){
            this.removeAnn(ann.cellNum)
        }

        quickFetch({action: "remove", remObjects: this.removedAnns});
        this.removedAnns = [];
    }
    

    hideAnn(ann){
        this.scene.remove(ann.meshObj);
        this.hiddenAnns.push(ann);
    }

    updateMask(){
        quickFetch({action: "save"})
    }
    
    highlightOne(cellNum){
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
        while(this.hiddenAnns.length > 0){
            let ann = this.hiddenAnns.pop();
            this.scene.add(ann.meshObj);
        }
    }

    meshToAnn(mesh){
        for(let ann of this.anns){
            if(mesh == ann.meshObj){
                return ann;
            }
        }
    }

    getNextCellNum(){
        let max = 0;
        for(let ann of this.anns){
            if(ann.cellNum > max){
                max = ann.cellNum;
            }
        }

        return max+1;

    }
    removeSegHelpers(){
        while(this.segHelpers.length > 0){
            let help = this.segHelpers.pop()
            this.scene.remove(help)
        }
    }

    removeNew(){
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
    constructor(meshObj, cellNum){
        this.meshObj = meshObj;
        this.cellNum = cellNum;
    }
}

export function quickFetch(body, callFunc){
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
    constructor(camera){
        this.xPlane = {mesh: new THREE.Mesh(new THREE.PlaneGeometry(0.25,0.25), new THREE.MeshBasicMaterial({depthTest: false, color: 0xff0000})), axis: "x", texture: null} ;
        this.yPlane = {mesh: new THREE.Mesh(new THREE.PlaneGeometry(0.25,0.25), new THREE.MeshBasicMaterial({depthTest: false})), axis: "y", texture: null};
        this.zPlane = {mesh: new THREE.Mesh(new THREE.PlaneGeometry(0.25,0.25), new THREE.MeshBasicMaterial({depthTest: false})), axis: "z", texture: null};
        this.oldPos = new THREE.Vector3(0,0,0);
        this.image = null;
        this.camera = camera

        this.camera.add(this.xPlane.mesh);
        this.xPlane.mesh.position.set(-1.25, 0, -0.5)
        this.camera.add(this.yPlane.mesh);
        this.yPlane.mesh.position.set(-0.9, 0, -0.5);
        this.camera.add(this.zPlane.mesh);
        this.zPlane.mesh.position.set(-0.55, 0, -0.5);

        this.xPlane.mesh.renderOrder = 99999;
        this.yPlane.mesh.renderOrder = 99999;
        this.zPlane.mesh.renderOrder = 99999;
    }

    updatePlane(plane, pos){
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
        let material = plane.mesh.material;
        let max = 0;
        let min = 100000;
        for(let z = 0; z<64; z++){
            for (let y = 0; y < 64; y++) {
                for (let x = 0; x < 64; x++) {
                    if(this.image[z][y][x] > max){
                        max = this.image[z][y][x]
                    }
                    if(this.image[z][y][x] < min){
                        min = this.image[z][y][x]
                    }
                }
            }
        }
        console.log(`max: ${max} min: ${min}`)

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
                if(dp < 200){dp = min}
                dataText[index] = (dp-min)/(max-min)*255 // Red
                dataText[index + 1] = (dp-min)/(max-min)*255; // Green
                dataText[index + 2] = (dp-min)/(max-min)*255; // Blue (0 for no blue component)
                dataText[index + 3] =255;
            }
        }
        console.log(dataText)

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

