import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
const host=document.getElementById('native3d'), loading=document.getElementById('viewerLoading');
const modelMap={
'Dual Berettas':'elite.glb','MAC-10':'mac10.glb','Nova':'nova.glb','SSG 08':'ssg08.glb','Tec-9':'tec9.glb','UMP-45':'ump45.glb','XM1014':'xm1014.glb','Glock-18':'glock18.glb','M4A4':'m4a4.glb','Five-SeveN':'fiveseven.glb','MP7':'mp7.glb','Sawed-Off':'sawedoff.glb','M4A1-S':'m4a1_silencer.glb','Zeus x27':'taser.glb','USP-S':'usp_silencer.glb','AWP':'awp.glb','AK-47':'ak47.glb'};
const base='https://raw.githubusercontent.com/Amansingh-afk/armoury/master/apps/web/public/models/';
let renderer,scene,camera,controls,root,currentItem,raf=0,resizeObs,homeView=null;
function ensure(){if(renderer)return;renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;host.appendChild(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(34,1,.01,100);camera.position.set(0,0.15,2.4);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.screenSpacePanning=false;controls.minDistance=.35;controls.maxDistance=6;controls.target.set(0,0,0);controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE};const ambient=new THREE.AmbientLight(0xffffff,.22);scene.add(ambient);const key=new THREE.DirectionalLight(0xffffff,2.0);key.position.set(3.4,4.6,5.8);key.target.position.set(0,0,0);scene.add(key);scene.add(key.target);resizeObs=new ResizeObserver(()=>{resize();if(root&&homeView)frameObject(false)});resizeObs.observe(host);animate()}
function resize(){if(!renderer)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
function clearRoot(){homeView=null;if(!root)return;scene.remove(root);root.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(m.map)m.map.dispose();m.dispose()})}});root=null}
function seeded(seed){let s=(seed|0)+1;return()=>((s=Math.imul(48271,s)%2147483647)&2147483647)/2147483647}
async function makeTexture(url,item){
  const size=1024,c=document.createElement('canvas');c.width=c.height=size;
  const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#232831';x.fillRect(0,0,size,size);
  let loaded=false;
  if(url){
    try{
      const img=await new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.decoding='async';i.onload=()=>res(i);i.onerror=rej;const sep=url.includes('?')?'&':'?';i.src=url+sep+'caselab3d=1'});
      const scan=document.createElement('canvas');scan.width=img.naturalWidth||img.width;scan.height=img.naturalHeight||img.height;
      const sx=scan.getContext('2d',{willReadFrequently:true});sx.drawImage(img,0,0);
      let minX=scan.width,minY=scan.height,maxX=-1,maxY=-1,rs=0,gs=0,bs=0,n=0;
      const d=sx.getImageData(0,0,scan.width,scan.height).data;
      for(let yy=0;yy<scan.height;yy+=2)for(let xx=0;xx<scan.width;xx+=2){const k=(yy*scan.width+xx)*4,a=d[k+3];if(a>18){if(xx<minX)minX=xx;if(xx>maxX)maxX=xx;if(yy<minY)minY=yy;if(yy>maxY)maxY=yy;rs+=d[k];gs+=d[k+1];bs+=d[k+2];n++}}
      if(n){x.fillStyle=`rgb(${Math.round(rs/n)},${Math.round(gs/n)},${Math.round(bs/n)})`;x.fillRect(0,0,size,size)}
      if(maxX>minX&&maxY>minY){
        const padX=(maxX-minX)*.035,padY=(maxY-minY)*.06;
        minX=Math.max(0,minX-padX);maxX=Math.min(scan.width,maxX+padX);minY=Math.max(0,minY-padY);maxY=Math.min(scan.height,maxY+padY);
        x.drawImage(img,minX,minY,maxX-minX,maxY-minY,0,0,size,size);
      }else x.drawImage(img,0,0,size,size);
      // Repeated mirrored projection greatly reduces transparent holes when a rendered
      // panorama icon is used as a temporary skin source on workshop geometry.
      x.globalAlpha=.38;x.save();x.scale(-1,1);x.drawImage(c,-size,0);x.restore();x.globalAlpha=1;
      loaded=true;
    }catch(e){console.warn('3D skin image load failed',url,e)}
  }
  if(!loaded){
    // Never silently turn failed skins into flat white geometry.
    x.fillStyle='#343b46';x.fillRect(0,0,size,size);
    x.fillStyle='#596273';for(let i=0;i<16;i++)x.fillRect((i%4)*256,Math.floor(i/4)*256,128,128);
  }
  const r=seeded(item.pattern||1),wear=Math.max(0,Math.min(1,item.float||0));
  const scratches=Math.floor(8+wear*90);x.lineCap='round';
  for(let i=0;i<scratches;i++){const xx=r()*size,yy=r()*size,len=(6+r()*42)*(0.25+wear),ang=r()*Math.PI*2;x.strokeStyle=`rgba(190,190,184,${0.012+wear*.075})`;x.lineWidth=.35+r()*(.5+wear*1.6);x.beginPath();x.moveTo(xx,yy);x.lineTo(xx+Math.cos(ang)*len,yy+Math.sin(ang)*len);x.stroke()}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;return t
}
function applyProfileUVs(obj){
  // The Valve panorama images are already side-view renders. Project them across the
  // visible X/Y profile so the actual Kilowatt finish is recognizable on the native mesh.
  obj.updateMatrixWorld(true);
  const overall=new THREE.Box3().setFromObject(obj), min=overall.min, max=overall.max;
  const w=Math.max(1e-5,max.x-min.x), h=Math.max(1e-5,max.y-min.y);
  obj.traverse(m=>{
    if(!m.isMesh||!m.geometry?.attributes?.position)return;
    const g=m.geometry=m.geometry.clone(), pos=g.attributes.position, uv=new Float32Array(pos.count*2),v=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).applyMatrix4(m.matrixWorld);
      uv[i*2]=THREE.MathUtils.clamp((v.x-min.x)/w,0,1);
      uv[i*2+1]=THREE.MathUtils.clamp((v.y-min.y)/h,0,1);
    }
    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  });
}

const rawSkinAssets={
 'Dual Berettas | Hideout':{map:'https://cdn.csskinlab.com/textures/526ebf4116e1d61332b64b92d23f7719b2fc32a3cbcbabf69f93f9a1e5c25517.png?v=3',normal:'https://cdn.csskinlab.com/textures/cbc5fd5b950824cff771bab49c0fc5b0ff4e6936ed4024d52177fb610c8de581.png?v=3',rough:'https://cdn.csskinlab.com/textures/7b8ce59ccb5f89491c8b09382c4b11efd84499b70cd1c0c58f2a26c50de84ea4.png?v=3'},
 'MAC-10 | Light Box':{map:'https://cdn.csskinlab.com/textures/9c63054b23160afbe46027c860975c4f31e0f129e1ab162d58d1a8276b89e2a7.png?v=3',normal:'https://cdn.csskinlab.com/textures/996746c1dfbd22b4dd3b83c675f1246ac145e8f2e3c3091c656c5f3af2f30c4f.png?v=3',rough:'https://cdn.csskinlab.com/textures/18892c3f6435b33130a0175b8a2c31a88b1f884499776dac0a01cfa877e09f66.png?v=3'},
 'Nova | Dark Sigil':{map:'https://cdn.csskinlab.com/textures/61f90149af29213b996f9cd180aaaa0dcdd8758eb50b41c1fb34b6d03dc78cb7.png?v=3',normal:'https://cdn.csskinlab.com/textures/62465a0b4d89833a5779faa5d767d60eb89834dc8e3f24629d6814a3bd1e63e2.png?v=3',rough:'https://cdn.csskinlab.com/textures/5208ed36f3e5898d0a063181c62d95437f0d22201c49dd9a37de0235c5a39fe5.png?v=3'},
 'MP7 | Just Smile':{map:'https://cdn.csskinlab.com/textures/3de3b9aca73e026472d8daf3c9e814fca45056515b92ba147254030de094e66e.png?v=3',normal:'https://cdn.csskinlab.com/textures/c02b142ed509c9aa94ff3b0259dac04eef3dcf932dc5e24f3bc6d692d119527e.png?v=3',rough:'https://cdn.csskinlab.com/textures/14e3abf0a27cf1c2e5067ebcad8c8388dc340a5db375e886e2eb2a122c602da6.png?v=3'},
 'XM1014 | Irezumi':{map:'https://cdn.csskinlab.com/textures/f4d479f7462cd3dc2f46148c683d850a3996f83447ab094f35b0a9432b1a2d4a.png?v=3',normal:'https://cdn.csskinlab.com/textures/ca17cf00963259130e29e8dd817df1a39e7128c3e97fcc09794c2dd001db9940.png?v=3',rough:'https://cdn.csskinlab.com/textures/c2acf0b68cdaa7a9f397908a47b2464430dc0dd3aa7c2a1a3299f43c467a5038.png?v=3'}
};
async function loadRawMaterial(item){
 const a=rawSkinAssets[item.name]; if(!a)return null;
 const loader=new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
 try{
  const [map,normal,rough]=await Promise.all([loader.loadAsync(a.map),loader.loadAsync(a.normal),loader.loadAsync(a.rough)]);
  map.colorSpace=THREE.SRGBColorSpace; map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  normal.colorSpace=THREE.NoColorSpace; rough.colorSpace=THREE.NoColorSpace;
  return new THREE.MeshStandardMaterial({map,normalMap:normal,roughnessMap:rough,metalness:.18,roughness:.62,color:0xffffff,side:THREE.DoubleSide});
 }catch(e){console.warn('Raw skin textures failed',item.name,e);return null}
}

function weaponOf(name){return String(name||'').replace(/^★\s*/,'').split(' | ')[0]}
function normalizeProfileOrientation(obj){
  // Armoury GLBs do not all share one authoring axis. Try axis-aligned rotations and
  // choose the orientation that reads most like a weapon profile: longest dimension
  // horizontal on screen, thinnest dimension facing the camera.
  const baseQ=obj.quaternion.clone(), basePos=obj.position.clone();
  const angles=[0,Math.PI/2,Math.PI,Math.PI*1.5];
  let best=null;
  obj.position.set(0,0,0);
  for(const ax of angles)for(const ay of angles)for(const az of angles){
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(ax,ay,az,'XYZ'));
    obj.quaternion.copy(baseQ).multiply(q);
    obj.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(obj), sz=b.getSize(new THREE.Vector3());
    const longest=Math.max(sz.x,sz.y,sz.z)||1;
    // Strongly prefer length on X, then a useful vertical silhouette on Y,
    // and especially a shallow Z depth (true side-on presentation).
    const score=(sz.x/longest)*5 + (sz.y/longest)*1.2 - (sz.z/longest)*4.5 - Math.max(0,(sz.y-sz.x)/longest)*3;
    if(!best||score>best.score)best={score,q:obj.quaternion.clone()};
  }
  obj.quaternion.copy(best?best.q:baseQ);
  obj.position.copy(basePos);
  obj.updateMatrixWorld(true);
}
async function open(item,img){ensure();currentItem=item;clearRoot();loading.classList.remove('hidden');loading.textContent='Loading native CS2 weapon mesh…';const weapon=weaponOf(item.name),file=modelMap[weapon];if(!file){loading.textContent='Native model not available for this item yet. Use EXACT ↗ for the true-to-game 3D view.';return}try{const gltf=await new GLTFLoader().loadAsync(base+file);root=gltf.scene;scene.add(root);normalizeProfileOrientation(root);root.updateMatrixWorld(true);let box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());const max=Math.max(size.x,size.y,size.z)||1;root.scale.setScalar(2.7/max);root.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(root);const center=box.getCenter(new THREE.Vector3());root.position.sub(center);root.updateMatrixWorld(true);let mat=await loadRawMaterial(item);if(!mat){const tex=await makeTexture(img,item);applyProfileUVs(root);mat=new THREE.MeshStandardMaterial({map:tex,metalness:.16,roughness:.62,color:0xffffff,side:THREE.DoubleSide})}root.traverse(o=>{if(o.isMesh){o.material=mat;o.castShadow=false;o.receiveShadow=false}});frameObject(true);loading.classList.add('hidden')}catch(e){console.warn('Native 3D load failed',e);loading.textContent='Native 3D asset failed to load. Use EXACT ↗ for the true-to-game renderer.'}}
function frameObject(store=true){if(!root||!camera||!controls)return;root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root);const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const vFov=THREE.MathUtils.degToRad(camera.fov);const hFov=2*Math.atan(Math.tan(vFov/2)*Math.max(.2,camera.aspect));const fitH=(size.y*.5)/Math.tan(vFov/2);const fitW=(size.x*.5)/Math.tan(hFov/2);const distance=Math.max(.55,Math.max(fitH,fitW)*1.13 + size.z*.5);camera.position.set(center.x,center.y,distance);controls.target.copy(center);const radius=Math.max(.15,box.getBoundingSphere(new THREE.Sphere()).radius);controls.minDistance=Math.max(distance*.68,radius*1.18,.55);controls.maxDistance=Math.max(distance*4,3);camera.near=Math.max(.025,Math.min(distance*.08,0.12));camera.far=Math.max(25,distance+radius*8);camera.updateProjectionMatrix();camera.lookAt(center);controls.update();if(store)homeView={position:camera.position.clone(),target:controls.target.clone(),min:controls.minDistance,max:controls.maxDistance}}
function reset(){if(!controls)return;if(homeView){camera.position.copy(homeView.position);controls.target.copy(homeView.target);controls.minDistance=homeView.min;controls.maxDistance=homeView.max;camera.updateProjectionMatrix();controls.update()}else{camera.position.set(0,.15,2.4);controls.target.set(0,0,0);controls.update()}}
function close(){currentItem=null}
function animate(){raf=requestAnimationFrame(animate);if(controls)controls.update();if(renderer)renderer.render(scene,camera)}
window.CaseLab3D={open,reset,close};