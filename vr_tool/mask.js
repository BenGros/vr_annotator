export class Mask{

    constructor(scene){
        this.totalMask = null;
        this.anns = [];
        this.removedAnns = [];
        this.hiddenAnns = [];
        this.scene = scene;
        this.currentCell = 0;
        this.segHelpers = []
    }

    addAnn(ann){
        console.log("add")
        this.anns.push(ann);
        this.scene.add(ann.meshObj);
    }

    removeAnn(cellNum){
        for(let a of this.anns){
            if(a.cellNum == cellNum){
                this.scene.remove(a.meshObj);
                this.removedAnns.push(a); 
            }
        }
        this.anns = this.anns.filter((a)=>{
            if(a.cellNum == cellNum){
                return false;
            }
            return true;
        })
    }

    hideAnn(ann){
        this.scene.remove(ann.meshObj);
        this.hiddenAnns.push(ann);
    }



    toggleMask(toggle){
        if(toggle){
            for(let a of this.anns){
                this.scene.add(a.meshObj)
            }
        } else {
            for(let a of this.anns){
                this.scene.remove(ant.meshObj);
            }
        }

    }

    updateMask(mask_data_path){
        // modify an existing mask based on the annotations added and removed to a chunk
        for (let r of this.removedAnns){
            let xCoord = Math.floor(r.position.x/0.1);
            let yCoord = Math.floor(r.position.y/0.1);
            let zCoord = Math.floor(r.position.z/0.1);
            totalMask[zCoord][yCoord][xCoord] = 0;
        }
        for(let a of this.anns){
            let xCoord = Math.floor(a.meshObj.position.x/0.1);
            let yCoord = Math.floor(a.meshObj.position.y/0.1);
            let zCoord = Math.floor(a.meshObj.position.z/0.1);
            totalMask[zCoord][yCoord][xCoord] = a.cellNum;
        }

        fetch("http://127.0.0.1:8080/", {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            },
            body: JSON.stringify({action: "save", data: totalMask, filename: mask_data_path }),
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
    
    highlightOne(cellNum){
        for(let ann of this.anns){
            if(ann.cellNum != cellNum){
                console.log("Here")
                this.hideAnn(ann);
            } else {
                //ann.meshObj.scale.set(1,1,1)

            }
        }
    }
    unhighlight(){
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
}

class meshHolder {
    constructor(all, hidden){
        this.all = all;
        this.hidden = hidden;
    }

    addMesh(scene, mesh){
        this.all.push(mesh);
        scene.add(mesh);
    }
}

export class Ann {
    constructor(meshObj, cellNum){
        this.meshObj = meshObj;
        this.cellNum = cellNum;
    }
}