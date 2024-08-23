/*
Script is used to control the text input fields in the main.html file
*/

// Clears a text field
function clearField(fieldId){
    let field = document.getElementById(fieldId);
    field.value = "";
}

// Will either display or not display the last text field based on checkboc
function checkChanged(){
    if(!saveCheck.checked){
        savePath.style.display = 'none';
    } else {
        savePath.style.display = 'inline';
    }
}


const imButton = document.getElementById("imBtn");
const maskButton = document.getElementById("maskBtn");
const newSaveButton = document.getElementById("newSaveBtn")
const saveCheck = document.getElementById("saveLoc");
const savePath = document.getElementById("newSavePath");
saveCheck.addEventListener("change", checkChanged);
saveCheck.checked = true;

// Add clearing function to the clear buttons
imButton.addEventListener("click", ()=>{clearField("imagePath")});
maskButton.addEventListener("click", ()=>{clearField("maskDP")});
newSaveButton.addEventListener("click", ()=>clearField("newSavePath"))