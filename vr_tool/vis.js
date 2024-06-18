import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VolumeRenderShader1 } from 'three/addons/shaders/VolumeShader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

const size = 32;

const effect = new MarchingCubes(32, new THREE.MeshBasicMaterial({color: 0xffffff}), true, true);

effect.position.set(0, 0, 0);
effect.scale.set(size, size, size);


let scene, renderer, volumeData, camera, volconfig, controls, gui;
let refresh = false;
let allMesh = [];

init();

function init(){
    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    //renderer.xr.enabled = true;
    document.body.appendChild( renderer.domElement );
    //document.body.appendChild(VRButton.createButton(renderer))

    const h = 512; // frustum height
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera( - h * aspect / 2, h * aspect / 2, h / 2, - h / 2, 1, 1000 );
    camera.position.set( - 32, - 32, 32 );
    camera.up.set( 0, 0, 1 ); // In our data, z is up

    let light = new THREE.AmbientLight(0xffffff);
    scene.add(light);

    // Create controls
    controls = new OrbitControls( camera, renderer.domElement );
    controls.addEventListener( 'change', render );
    controls.target.set( 32, 32, 32 );			
    controls.minZoom = 0.5;
    controls.maxZoom = 100;
    controls.enablePan = false;
    controls.update();

    volconfig = {threshMin: 500, threshMax: 1000, channel: 0,
        chunkX: 32, chunkY: 32, chunkZ: 10, chunkNum: 0,
        colourMin: 500, colourMax: 1000
    };

    gui = new GUI();
    gui.add(volconfig, 'threshMin', 0, 20000, 10).onFinishChange(load);
    gui.add(volconfig, 'threshMax', 0, 20000, 10).onFinishChange(load);
    gui.add(volconfig, 'colourMin', 0, 20000, 10).onFinishChange(load);
    gui.add(volconfig, 'colourMax', 0, 20000, 10).onFinishChange(load);
    load();

    let box = new THREE.BoxGeometry(10,10,10);
    let wireBox = new THREE.WireframeGeometry(box);
    const line = new THREE.LineSegments(wireBox);
    scene.add(line);

    window.addEventListener( 'resize', onWindowResize );
}


function load(){
    if(refresh){
        allMesh.forEach(mesh => scene.remove(mesh));
    }
    let vol;
    new THREE.FileLoader().load( 'new_data.json', function ( volume ) {
        volumeData = JSON.parse(volume);
        vol = volumeData;
        for(let z = volconfig.chunkZ*volconfig.chunkNum ; z< volconfig.chunkZ*volconfig.chunkNum + volconfig.chunkZ; z++){
            for(let y = volconfig.chunkY*volconfig.chunkNum ; y< volconfig.chunkY*volconfig.chunkNum + volconfig.chunkY; y++){
                for(let x = volconfig.chunkX*volconfig.chunkNum ; x< volconfig.chunkX*volconfig.chunkNum + volconfig.chunkX; x++){
                    let intensity = vol[z][y][x];
                    
                    if(intensity> volconfig.threshMin && intensity < volconfig.threshMax){
                        let normal = (intensity-volconfig.colourMin) / (volconfig.colourMax - volconfig.colourMin)
                        let colour = new THREE.Color(intensityToHexGrayscale(normal));
                        let material = new THREE.MeshBasicMaterial({color: colour/* opacity: normal, transparent: true*/})
                        let geometry = new THREE.BoxGeometry(1,1,1);
                        let mesh = new THREE.Mesh(geometry, material);
                        mesh.position.set(x,y,z);
                        scene.add(mesh);
                        allMesh.push(mesh)
                    } 
                }
            }
        }
        console.log("Done")
        scene.add(effect)
        refresh = true;
        render();
    });
    
}

function intensityToHexGrayscale(intensity) {
    // Clamp the intensity to ensure it's between 0 and 1.
    if(intensity > 1) { intensity = 1};
    if(intensity < 0){intensity = 0};


    
    // Convert the normalized intensity to a value between 0 and 255.
    const value = Math.round(intensity * 255);
    
    // Convert the value to a two-digit hexadecimal string.
    const hex = value.toString(16).padStart(2, '0');
    
    // Return the grayscale color in hexadecimal format.
    return `#${hex}${hex}${hex}`;
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