import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {applyPreviewMaterials} from "./materials3d.js";

const host=document.getElementById('native3d');
const loading=document.getElementById('viewerLoading');
const modelMap={
  'Dual Berettas':'elite.glb','MAC-10':'mac10.glb','Nova':'nova.glb','SSG 08':'ssg08.glb','Tec-9':'tec9.glb',
  'UMP-45':'ump45.glb','XM1014':'xm1014.glb','Glock-18':'glock18.glb','M4A4':'m4a4.glb','Five-SeveN':'fiveseven.glb',
  'MP7':'mp7.glb','Sawed-Off':'sawedoff.glb','M4A1-S':'m4a1_silencer.glb','Zeus x27':'taser.glb','USP-S':'usp_silencer.glb',
  'AWP':'awp.glb','AK-47':'ak47.glb'
};
const MODEL_BASE='https://raw.githubusercontent.com/Amansingh-afk/armoury/master/apps/web/public/models/';
const MODEL_CACHE='caselab-models-stage4-v1';
const memoryBuffers=new Map();

let renderer=null,scene=null,camera=null,controls=null,root=null,currentItem=null,homeView=null;
let resizeObs=null,raf=0,openToken=0,isOpen=false,userMovedCamera=false;

function weaponOf(name){return String(name||'').replace(/^★\s*/,'').split(' | ')[0]}

function startLoop(){
  if(raf || !renderer || !isOpen) return;
  const tick=()=>{
    if(!isOpen){raf=0;return;}
    controls?.update();
    renderer.render(scene,camera);
    raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
}
function stopLoop(){if(raf){cancelAnimationFrame(raf);raf=0}}

function ensure(){
  if(renderer) return;
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=0.95;
  host.appendChild(renderer.domElement);

  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(34,1,0.01,100);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;
  controls.dampingFactor=.075;
  controls.enablePan=false;
  controls.screenSpacePanning=false;
  controls.minDistance=.55;
  controls.maxDistance=8;
  controls.rotateSpeed=.72;
  controls.zoomSpeed=.82;
  controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
  controls.addEventListener('start',()=>{userMovedCamera=true});

  // One world-space key light only. It never follows the camera or weapon.
  // Readability on the shadow side comes from the material's very small emissive baseline,
  // not from extra fill/rim/hemisphere lights.
  const key=new THREE.DirectionalLight(0xffffff,2.25);
  key.position.set(4.2,5.1,6.4);
  key.target.position.set(0,0,0);
  scene.add(key,key.target);

  const canvas=renderer.domElement;
  canvas.style.touchAction='none';
  // The app shell globally blocks Safari pinch zoom. Stop viewer gestures before they reach it.
  for(const type of ['touchstart','touchmove','touchend','touchcancel','gesturestart','gesturechange','gestureend']){
    canvas.addEventListener(type,e=>e.stopPropagation(),{passive:false});
  }
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stopLoop();loading.classList.remove('hidden');loading.textContent='3D graphics context paused. Close and reopen Inspect 3D.'});

  resizeObs=new ResizeObserver(()=>resize());
  resizeObs.observe(host);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopLoop();else if(isOpen)startLoop()});
  resize();
}

function resize(){
  if(!renderer) return;
  const w=Math.max(1,host.clientWidth), h=Math.max(1,host.clientHeight);
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  // Deliberately do not re-frame here. Safari browser-chrome resizing must not reset the user's view.
}

function disposeMaterial(m,seenTextures){
  if(!m) return;
  for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','bumpMap','displacementMap']){
    const t=m[key];
    if(t && !seenTextures.has(t)){seenTextures.add(t);t.dispose()}
  }
  m.dispose?.();
}
function disposeObject(obj){
  if(!obj) return;
  const seenTextures=new Set(), seenGeometry=new Set(), seenMaterials=new Set();
  obj.traverse(node=>{
    if(node.geometry && !seenGeometry.has(node.geometry)){seenGeometry.add(node.geometry);node.geometry.dispose()}
    const mats=Array.isArray(node.material)?node.material:[node.material];
    mats.filter(Boolean).forEach(m=>{if(!seenMaterials.has(m)){seenMaterials.add(m);disposeMaterial(m,seenTextures)}});
  });
}
function clearRoot(){
  homeView=null;
  if(!root) return;
  scene.remove(root);
  disposeObject(root);
  root=null;
}

async function cachedArrayBuffer(url){
  if(memoryBuffers.has(url)) return memoryBuffers.get(url).slice(0);
  let response=null;
  if('caches' in window){
    try{
      const c=await caches.open(MODEL_CACHE);
      response=await c.match(url);
      if(!response){
        const net=await fetch(url,{mode:'cors',cache:'force-cache'});
        if(!net.ok) throw new Error(`HTTP ${net.status}`);
        response=net.clone();
        try{await c.put(url,net.clone())}catch(_e){}
      }
    }catch(e){console.warn('Persistent model cache unavailable; using network',e)}
  }
  if(!response){
    const net=await fetch(url,{mode:'cors',cache:'force-cache'});
    if(!net.ok) throw new Error(`HTTP ${net.status}`);
    response=net;
  }
  const buf=await response.arrayBuffer();
  memoryBuffers.set(url,buf.slice(0));
  return buf;
}

async function loadGLTF(file){
  const url=MODEL_BASE+file;
  const buf=await cachedArrayBuffer(url);
  const loader=new GLTFLoader();
  return await new Promise((resolve,reject)=>loader.parse(buf,MODEL_BASE,resolve,reject));
}

function normalizeProfileOrientation(obj){
  const baseQ=obj.quaternion.clone(), basePos=obj.position.clone();
  const angles=[0,Math.PI/2,Math.PI,Math.PI*1.5];
  let best=null;
  obj.position.set(0,0,0);
  for(const ax of angles) for(const ay of angles) for(const az of angles){
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(ax,ay,az,'XYZ'));
    obj.quaternion.copy(baseQ).multiply(q);
    obj.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(obj), s=b.getSize(new THREE.Vector3());
    const longest=Math.max(s.x,s.y,s.z)||1;
    const score=(s.x/longest)*5.5+(s.y/longest)*1.0-(s.z/longest)*5.0-Math.max(0,(s.y-s.x)/longest)*3;
    if(!best||score>best.score) best={score,q:obj.quaternion.clone()};
  }
  obj.quaternion.copy(best?.q||baseQ);
  obj.position.copy(basePos);
  obj.updateMatrixWorld(true);
}

function normalizeScaleAndCenter(obj){
  obj.updateMatrixWorld(true);
  let b=new THREE.Box3().setFromObject(obj), s=b.getSize(new THREE.Vector3());
  const longest=Math.max(s.x,s.y,s.z)||1;
  obj.scale.multiplyScalar(2.7/longest);
  obj.updateMatrixWorld(true);
  b=new THREE.Box3().setFromObject(obj);
  obj.position.sub(b.getCenter(new THREE.Vector3()));
  obj.updateMatrixWorld(true);
}

function frameObject(store=true){
  if(!root||!camera||!controls) return;
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root), size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
  const sphere=box.getBoundingSphere(new THREE.Sphere());
  const vFov=THREE.MathUtils.degToRad(camera.fov);
  const hFov=2*Math.atan(Math.tan(vFov/2)*Math.max(.2,camera.aspect));
  const fitH=(size.y*.5)/Math.tan(vFov/2), fitW=(size.x*.5)/Math.tan(hFov/2);
  const distance=Math.max(.7,Math.max(fitH,fitW)*1.12+size.z*.55);
  camera.position.set(center.x,center.y,distance);
  controls.target.copy(center);
  // Prevent the camera from physically entering the model, even at aggressive pinch zoom.
  controls.minDistance=Math.max(distance*.58,sphere.radius*1.34,.62);
  controls.maxDistance=Math.max(distance*4.5,4);
  camera.near=Math.max(.005,Math.min(controls.minDistance*.08,.06));
  camera.far=Math.max(30,distance+sphere.radius*12);
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  controls.update();
  if(store) homeView={position:camera.position.clone(),target:controls.target.clone(),min:controls.minDistance,max:controls.maxDistance,near:camera.near,far:camera.far};
}

async function applyMaterials(item,imgUrl){
  // Stage 5 can inject a Source-2-aware material compositor without touching renderer lifecycle.
  if(window.CaseLabFinishPipeline?.apply){
    const result=await window.CaseLabFinishPipeline.apply({THREE,root,item,imgUrl,renderer});
    if(result) return result;
  }
  return applyPreviewMaterials({THREE,root,item,imgUrl,renderer});
}

async function open(item,imgUrl){
  ensure();
  const token=++openToken;
  isOpen=true; currentItem=item; userMovedCamera=false;
  stopLoop(); clearRoot(); resize(); startLoop();
  loading.classList.remove('hidden');
  loading.textContent='Loading cached CS2 weapon mesh…';
  const weapon=weaponOf(item.name), file=modelMap[weapon];
  if(!file){
    loading.textContent='Native Stage-4 model not available for this item yet. Kukri models arrive in Stage 5.';
    return;
  }
  try{
    const gltf=await loadGLTF(file);
    if(token!==openToken){disposeObject(gltf.scene);return}
    root=gltf.scene;
    scene.add(root);
    normalizeProfileOrientation(root);
    normalizeScaleAndCenter(root);
    await applyMaterials(item,imgUrl);
    if(token!==openToken){clearRoot();return}
    frameObject(true);
    loading.classList.add('hidden');
  }catch(e){
    console.warn('Native 3D load failed',e);
    if(token===openToken){loading.classList.remove('hidden');loading.textContent='Native 3D asset failed to load. EXACT ↗ remains available.'}
  }
}

function reset(){
  if(!controls||!homeView) return;
  userMovedCamera=false;
  camera.position.copy(homeView.position);
  controls.target.copy(homeView.target);
  controls.minDistance=homeView.min; controls.maxDistance=homeView.max;
  camera.near=homeView.near; camera.far=homeView.far;
  camera.updateProjectionMatrix(); controls.update();
}
function close(){
  isOpen=false; currentItem=null; ++openToken; stopLoop(); clearRoot();
  if(renderer) renderer.clear();
}

window.CaseLab3D={open,reset,close,getStatus:()=>({open:isOpen,weapon:currentItem?.name||null,cachedModels:memoryBuffers.size})};
