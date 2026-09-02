import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export class CaseLabViewer{
  constructor({host,loading,materials,defsById,onStatus}){
    this.host=host;this.loading=loading;this.materials=materials;this.defsById=defsById;this.onStatus=onStatus;
    this.renderer=null;this.scene=null;this.camera=null;this.controls=null;this.root=null;this.raf=0;this.active=false;this.home=null;
    this.modelCache=new Map();this.loader=new GLTFLoader();this.resizeObs=null;this.lastSize={w:0,h:0};
    this.headKey=null;this.headFill=null;
  }
  ensure(){
    if(this.renderer)return;
    const r=this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    r.setPixelRatio(Math.min(devicePixelRatio||1,2));
    r.outputColorSpace=THREE.SRGBColorSpace;
    r.toneMapping=THREE.ACESFilmicToneMapping;
    r.toneMappingExposure=1.18;
    r.sortObjects=true;
    this.host.appendChild(r.domElement);

    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(34,1,.01,100);
    this.scene.add(this.camera);

    this.controls=new OrbitControls(this.camera,r.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.enablePan=false;this.controls.screenSpacePanning=false;
    this.controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE};

    // Static inspection lighting from the viewer's perspective: the light lives on
    // the camera so rotating the weapon does not throw one side into darkness.
    const hemi=new THREE.HemisphereLight(0xf1f5ff,0x0a1019,.45);this.scene.add(hemi);
    const ambient=new THREE.AmbientLight(0xffffff,.62);this.scene.add(ambient);
    this.headKey=new THREE.DirectionalLight(0xffffff,1.85);this.headKey.position.set(.45,.65,1.35);this.camera.add(this.headKey);
    this.headFill=new THREE.PointLight(0xdfe8ff,1.05,0,2);this.headFill.position.set(-.55,-.1,1.0);this.camera.add(this.headFill);
    const rim=new THREE.DirectionalLight(0xa8c1ff,.22);rim.position.set(-1.2,1.6,-1.1);this.scene.add(rim);

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
        o.geometry?.dispose?.();
        const mats=Array.isArray(o.material)?o.material:[o.material];
        for(const m of mats){
          if(!m)continue;
          for(const k of ['map','normalMap','roughnessMap','aoMap','metalnessMap','alphaMap','emissiveMap'])m[k]?.dispose?.();
          m.dispose?.();
        }
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
    if(!url)return null;
    const t=await new THREE.TextureLoader().loadAsync(url);
    t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  canvasTexture(draw){
    const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');draw(ctx,c.width,c.height);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;return t;
  }
  proxyFinishMap(item,def){
    const name=(def.name||'').toLowerCase();
    if(name.includes('fade'))return this.canvasTexture((ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#f4d03f');g.addColorStop(.24,'#f1c40f');g.addColorStop(.48,'#f39c12');g.addColorStop(.7,'#ff6fa0');g.addColorStop(1,'#9b59b6');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    if(name.includes('slaughter'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#a51520';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(255,210,210,.34)';ctx.lineWidth=10;for(let i=-h;i<w;i+=70){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+h,h);ctx.stroke();}});
    if(name.includes('blue steel'))return this.canvasTexture((ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#7e8899');g.addColorStop(.5,'#576476');g.addColorStop(1,'#2f3948');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    if(name.includes('scorched'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#2d2d2d';ctx.fillRect(0,0,w,h);ctx.fillStyle='rgba(90,90,90,.33)';for(let i=0;i<150;i++){ctx.fillRect(Math.random()*w,Math.random()*h,18+Math.random()*45,2+Math.random()*6)}});
    if(name.includes('forest ddpat'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#59664b';ctx.fillRect(0,0,w,h);['#48523b','#758861','#31392c'].forEach(col=>{ctx.fillStyle=col;for(let i=0;i<28;i++){ctx.fillRect(Math.random()*w,Math.random()*h,40+Math.random()*140,16+Math.random()*44)}})});
    if(name.includes('case hardened'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#826d4b';ctx.fillRect(0,0,w,h);const cols=['rgba(34,85,160,.82)','rgba(186,138,27,.8)','rgba(93,41,144,.72)'];for(const col of cols){ctx.fillStyle=col;for(let i=0;i<18;i++){ctx.beginPath();ctx.ellipse(Math.random()*w,Math.random()*h,30+Math.random()*90,12+Math.random()*38,Math.random()*Math.PI,0,Math.PI*2);ctx.fill();}}});
    return this.canvasTexture((ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#bfc6d0');g.addColorStop(.5,'#8d97a5');g.addColorStop(1,'#e5e9ef');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
  }
  makeKukriProxy(item,def){
    const g=new THREE.Group();
    const bladeShape=new THREE.Shape();
    bladeShape.moveTo(-1.05,0.02);bladeShape.quadraticCurveTo(-0.2,.18,.62,.12);bladeShape.quadraticCurveTo(.88,.10,1.16,-.01);bladeShape.quadraticCurveTo(.7,-.12,.18,-.1);bladeShape.quadraticCurveTo(-.28,-.09,-.88,-.18);bladeShape.quadraticCurveTo(-1.06,-.12,-1.05,.02);
    const guard=new THREE.Shape();
    guard.moveTo(-1.02,-.08);guard.lineTo(-.92,-.08);guard.lineTo(-.84,.14);guard.lineTo(-1.0,.14);guard.lineTo(-1.02,-.08);
    const bladeGeo=new THREE.ExtrudeGeometry(bladeShape,{depth:.045,bevelEnabled:false,steps:1});
    const guardGeo=new THREE.ExtrudeGeometry(guard,{depth:.075,bevelEnabled:false,steps:1});
    bladeGeo.center();guardGeo.center();
    const bladeTex=this.proxyFinishMap(item,def);
    const bladeMat=new THREE.MeshStandardMaterial({map:bladeTex,color:0xffffff,metalness:.55,roughness:.42,side:THREE.DoubleSide});
    const guardMat=new THREE.MeshStandardMaterial({color:0x9d7f36,metalness:.42,roughness:.55});
    const blade=new THREE.Mesh(bladeGeo,bladeMat);blade.rotation.x=Math.PI*.5;blade.position.x=.18;g.add(blade);
    const guardMesh=new THREE.Mesh(guardGeo,guardMat);guardMesh.rotation.x=Math.PI*.5;guardMesh.position.set(-.92,0,.02);g.add(guardMesh);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.18,.05,18,36),guardMat);ring.rotation.y=Math.PI*.5;ring.position.set(-1.28,0,.02);g.add(ring);
    const handle=new THREE.Mesh(new THREE.CapsuleGeometry(.07,.42,4,10),new THREE.MeshStandardMaterial({color:0x82603e,metalness:.12,roughness:.78}));handle.rotation.z=Math.PI*.5;handle.position.set(-1.1,0,.02);g.add(handle);
    return g;
  }
  async materialFor(item,def){
    const a=this.materials.skins?.[def.id];
    if(a){
      try{
        const [base,pattern,normal,rough,ao]=await Promise.all([
          this.tex(a.albedo||a.pattern,{srgb:true}),
          a.albedo?this.tex(a.pattern,{srgb:true}).catch(()=>null):Promise.resolve(null),
          this.tex(a.normal).catch(()=>null),
          this.tex(a.roughness).catch(()=>null),
          this.tex(a.ao).catch(()=>null)
        ]);
        const m=new THREE.MeshStandardMaterial({map:base,normalMap:normal||null,roughnessMap:rough||null,aoMap:ao||null,color:0xffffff,metalness:.12,roughness:.6,side:THREE.DoubleSide});
        if(pattern&&pattern!==base){m.emissive=new THREE.Color(0x141414);m.emissiveMap=pattern;m.emissiveIntensity=.05;}
        return {material:m,status:'Local finish recipe loaded · camera-space inspect lighting active',supported:true};
      }catch(e){console.warn('raw material load failed',def.name,e)}
    }
    const m=new THREE.MeshStandardMaterial({color:0xced5df,metalness:.24,roughness:.58,side:THREE.DoubleSide});
    return {material:m,status:'Camera-space inspect lighting active · no verified local finish recipe for this skin yet',supported:false};
  }
  frame(store=true){
    if(!this.root)return;
    const box=new THREE.Box3().setFromObject(this.root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const viewCenter=center.clone();viewCenter.y-=size.y*.01;
    const vFov=THREE.MathUtils.degToRad(this.camera.fov),hFov=2*Math.atan(Math.tan(vFov/2)*Math.max(.2,this.camera.aspect));
    const fitH=(size.y*.5)/Math.tan(vFov/2),fitW=(size.x*.5)/Math.tan(hFov/2),distance=Math.max(.6,Math.max(fitH,fitW)*1.08+size.z*.44);
    this.camera.position.set(viewCenter.x,viewCenter.y,distance);this.controls.target.copy(viewCenter);
    const radius=Math.max(.15,box.getBoundingSphere(new THREE.Sphere()).radius);
    this.controls.minDistance=Math.max(radius*.72,.2);this.controls.maxDistance=Math.max(distance*4,3);
    this.camera.near=.005;this.camera.far=Math.max(25,distance+radius*8);this.camera.updateProjectionMatrix();this.camera.lookAt(viewCenter);this.controls.update();
    if(store)this.home={position:this.camera.position.clone(),target:this.controls.target.clone(),min:this.controls.minDistance,max:this.controls.maxDistance};
  }
  async open(item){
    this.ensure();this.resize(false);this.start();this.disposeRoot();
    const def=this.defsById.get(item.skinId);this.loading.hidden=false;this.loading.textContent='Loading native inspect view…';
    if(!def){this.loading.textContent='Unknown item definition.';return}
    try{
      let obj;
      if(def.weapon==='Kukri Knife'||(!def.model&&/kukri/i.test(def.name||'')))obj=this.makeKukriProxy(item,def);
      else obj=await this.loadModel(def);
      this.root=obj;this.scene.add(obj);this.normalizeProfile(obj);
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
