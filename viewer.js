import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export class CaseLabViewer{
  constructor({host,loading,materials,defsById,onStatus}){
    this.host=host;this.loading=loading;this.materials=materials;this.defsById=defsById;this.onStatus=onStatus;
    this.renderer=null;this.scene=null;this.camera=null;this.controls=null;this.root=null;this.raf=0;this.active=false;this.home=null;
    this.modelCache=new Map();this.loader=new GLTFLoader();this.resizeObs=null;this.lastSize={w:0,h:0};
  }
  ensure(){
    if(this.renderer)return;
    const r=this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    r.setPixelRatio(Math.min(devicePixelRatio||1,2));r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=.9;
    this.host.appendChild(r.domElement);
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(34,1,.015,100);
    this.controls=new OrbitControls(this.camera,r.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.enablePan=false;this.controls.screenSpacePanning=false;
    this.controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE};
    // Keep one dominant fixed key light so the weapon feels like it lives under
    // a single studio source, but add subtle static fill so the reverse side
    // does not collapse into near-black when the user rotates the gun.
    const hemi=new THREE.HemisphereLight(0xffffff,0x0a1220,.78);this.scene.add(hemi);
    const ambient=new THREE.AmbientLight(0xffffff,.2);this.scene.add(ambient);
    const key=new THREE.DirectionalLight(0xffffff,2.05);key.position.set(3.6,4.0,6.0);key.target.position.set(0,0,0);this.scene.add(key,key.target);
    this.resizeObs=new ResizeObserver(()=>this.resize(false));this.resizeObs.observe(this.host);
  }
  resize(refit=false){
    if(!this.renderer)return;
    const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
    if(w===this.lastSize.w&&h===this.lastSize.h)return;
    this.lastSize={w,h};this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    if(refit&&this.root)this.frame(true);
  }
  start(){if(this.active)return;this.active=true;const tick=()=>{if(!this.active)return;this.raf=requestAnimationFrame(tick);this.controls?.update();this.renderer?.render(this.scene,this.camera)};tick()}
  stop(){this.active=false;if(this.raf)cancelAnimationFrame(this.raf);this.raf=0}
  cloneForInstance(source){
    const root=source.clone(true);
    // THREE.Object3D.clone() shares BufferGeometry/material references. We dispose
    // inspect instances on close, so each instance must own its geometry/materials
    // or closing one viewer can invalidate the cached source for later inspections.
    root.traverse(o=>{
      if(!o.isMesh)return;
      if(o.geometry)o.geometry=o.geometry.clone();
      if(Array.isArray(o.material))o.material=o.material.map(m=>m?.clone?.()||m);
      else if(o.material)o.material=o.material.clone?.()||o.material;
    });
    return root;
  }
  async loadModel(def){
    const url=(this.materials.modelBase||'')+(def.model||'');
    if(!def.model)throw new Error('No native model manifest yet');
    if(this.modelCache.has(url))return this.cloneForInstance(this.modelCache.get(url));
    const gltf=await this.loader.loadAsync(url);
    this.modelCache.set(url,gltf.scene);
    return this.cloneForInstance(gltf.scene);
  }
  disposeRoot(){
    if(!this.root)return;
    this.scene.remove(this.root);
    this.root.traverse(o=>{
      if(o.isMesh){
        // Geometry belongs to cloned model instances; dispose clone-side resources only.
        o.geometry?.dispose?.();
        const mats=Array.isArray(o.material)?o.material:[o.material];
        for(const m of mats){if(!m)continue;for(const k of ['map','normalMap','roughnessMap','aoMap','metalnessMap','alphaMap','emissiveMap'])m[k]?.dispose?.();m.dispose?.()}
      }
    });
    this.root=null;this.home=null;
  }
  normalizeProfile(obj){
    const base=obj.quaternion.clone(),angles=[0,Math.PI/2,Math.PI,Math.PI*1.5];let best=null;
    for(const ax of angles)for(const ay of angles)for(const az of angles){
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(ax,ay,az,'XYZ'));
      obj.quaternion.copy(base).multiply(q);obj.updateMatrixWorld(true);
      const sz=new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());const longest=Math.max(sz.x,sz.y,sz.z)||1;
      const score=(sz.x/longest)*6+(sz.y/longest)*1.2-(sz.z/longest)*5-Math.max(0,(sz.y-sz.x)/longest)*3;
      if(!best||score>best.score)best={score,q:obj.quaternion.clone()};
    }
    obj.quaternion.copy(best?.q||base);obj.updateMatrixWorld(true);
  }
  async tex(url,{srgb=false}={}){
    if(!url)return null;const t=await new THREE.TextureLoader().loadAsync(url);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());return t;
  }
  async materialFor(item,def){
    const a=this.materials.skins?.[def.id];
    if(a){
      try{
        const [base,pattern,normal,rough,ao]=await Promise.all([
          this.tex(a.albedo||a.pattern,{srgb:true}),
          a.albedo?this.tex(a.pattern,{srgb:true}).catch(()=>null):Promise.resolve(null),
          this.tex(a.normal),
          this.tex(a.roughness),
          this.tex(a.ao)
        ]);
        // PREVIEW ONLY: authored maps stay on the weapon's native UVs. We still do
        // not claim Source-2-exact finish + wear parity until masks, finish recipes,
        // and float-driven compositing are fully verified.
        const m=new THREE.MeshStandardMaterial({map:base,normalMap:normal||null,roughnessMap:rough||null,aoMap:ao||null,color:0xffffff,metalness:.08,roughness:.56,side:THREE.DoubleSide});
        if(pattern){
          m.emissive=new THREE.Color(0x111111);
          m.emissiveMap=pattern;
          m.emissiveIntensity=.08;
        }
        return {material:m,status:'Authored Kilowatt preview maps loaded on native UVs · exact wear compositor still pending'};
      }catch(e){console.warn('raw material load failed',def.name,e)}
    }
    const m=new THREE.MeshStandardMaterial({color:0x3a414c,metalness:.16,roughness:.62,side:THREE.DoubleSide});
    return {material:m,status:'Native model only · no verified local finish recipe for this skin yet'};
  }
  frame(store=true){
    if(!this.root)return;
    const box=new THREE.Box3().setFromObject(this.root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const viewCenter=center.clone();
    viewCenter.y-=size.y*.035;
    const vFov=THREE.MathUtils.degToRad(this.camera.fov),hFov=2*Math.atan(Math.tan(vFov/2)*Math.max(.2,this.camera.aspect));
    const fitH=(size.y*.5)/Math.tan(vFov/2),fitW=(size.x*.5)/Math.tan(hFov/2),distance=Math.max(.6,Math.max(fitH,fitW)*1.16+size.z*.54);
    this.camera.position.set(viewCenter.x,viewCenter.y,distance);this.controls.target.copy(viewCenter);
    const radius=Math.max(.15,box.getBoundingSphere(new THREE.Sphere()).radius);
    this.controls.minDistance=Math.max(distance*.76,radius*1.35,.65);this.controls.maxDistance=Math.max(distance*4,3);
    this.camera.near=Math.max(.02,Math.min(distance*.05,.08));this.camera.far=Math.max(25,distance+radius*8);this.camera.updateProjectionMatrix();this.camera.lookAt(viewCenter);this.controls.update();
    if(store)this.home={position:this.camera.position.clone(),target:this.controls.target.clone(),min:this.controls.minDistance,max:this.controls.maxDistance};
  }
  async open(item){
    this.ensure();this.resize(false);this.start();this.disposeRoot();
    const def=this.defsById.get(item.skinId);this.loading.hidden=false;this.loading.textContent='Loading native CS2 weapon mesh…';
    if(!def){this.loading.textContent='Unknown item definition.';return}
    if(def.rarity==='Special'){
      this.loading.textContent='Kukri native model/material bundle is not yet verified in this v0.6 PREVIEW.';this.onStatus?.('Kukri native inspect is a final-v0.6 blocker, not being faked.');return;
    }
    try{
      const obj=await this.loadModel(def);this.root=obj;this.scene.add(obj);this.normalizeProfile(obj);
      let box=new THREE.Box3().setFromObject(obj),size=box.getSize(new THREE.Vector3()),mx=Math.max(size.x,size.y,size.z)||1;obj.scale.setScalar(2.7/mx);obj.updateMatrixWorld(true);
      box=new THREE.Box3().setFromObject(obj);const c=box.getCenter(new THREE.Vector3());obj.position.sub(c);obj.updateMatrixWorld(true);
      const {material,status}=await this.materialFor(item,def);
      obj.traverse(o=>{if(o.isMesh){o.material=material.clone();o.castShadow=false;o.receiveShadow=false}});
      material.dispose();this.frame(true);this.loading.hidden=true;this.onStatus?.(status);
    }catch(e){console.error(e);this.loading.hidden=false;this.loading.textContent='Native 3D asset failed to load.';this.onStatus?.(`3D load failed: ${e?.message||e}`)}
  }
  reset(){if(!this.home)return;this.camera.position.copy(this.home.position);this.controls.target.copy(this.home.target);this.controls.minDistance=this.home.min;this.controls.maxDistance=this.home.max;this.controls.update()}
  close(){this.stop();this.disposeRoot()}
}
