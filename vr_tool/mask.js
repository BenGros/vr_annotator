

export class Mask{

    constructor(scene){
        this.totalMask = null;
        this.anns = [];
        this.removedAnns = [];
        this.hiddenAnns = [];
        this.scene = scene;
        this.currentCell = 0;
        this.segHelpers = [];

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

        // fetch("http://127.0.0.1:8080/", {
        //     method: "POST",
        //     headers: {
        //       "Content-Type": "application/json",
        //     },
        //     body: JSON.stringify({action: "remove", remObjects: this.removedAnns}),
        //   })
        //     .then(function (response) {
        //       if (!response.ok) {
        //         throw new Error(
        //           "Network response was not ok " + response.statusText
        //         );
        //       }
        //       return response.json();
        //     })
        //     .then(function (data) {
        //         console.log("Server response:", data);
        //     })
        //     .catch(function (error) {
        //       console.error(
        //         "There has been a problem with your fetch operation:",
        //         error
        //       );
        //     });

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


export class Ann {
    constructor(meshObj, cellNum){
        this.meshObj = meshObj;
        this.cellNum = cellNum;
    }
}

export function quickFetch(body, callFunc){
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
            if(callFunc != null | callFunc != undefined){
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