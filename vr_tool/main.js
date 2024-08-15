function clearField(fieldId){
    let field = document.getElementById(fieldId);
    field.value = "";
}

function checkChanged(){
    if(!saveCheck.checked){
        savePath.style.display = 'none';
    } else {
        savePath.style.display = 'inline';
    }
}


const imButton = document.getElementById("imBtn");
const maskButton = document.getElementById("maskBtn");
const saveCheck = document.getElementById("saveLoc");
const savePath = document.getElementById("newSavePath");

saveCheck.addEventListener("change", checkChanged)
saveCheck.checked = true;

imButton.addEventListener("click", ()=>{clearField("imagePath")})
maskButton.addEventListener("click", ()=>{clearField("maskDP")})