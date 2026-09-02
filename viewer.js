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
    r.toneMappingExposure=1.28;
    r.sortObjects=true;
    this.host.appendChild(r.domElement);

    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(34,1,.01,100);
    this.scene.add(this.camera);

    this.controls=new OrbitControls(this.camera,r.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.enablePan=false;this.controls.screenSpacePanning=false;
    this.controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE};

    // Static inspect lighting: bright, camera-adjacent, and intentionally simple so
    // the model stays readable from front and back without dramatic falloff.
    const hemi=new THREE.HemisphereLight(0xf7faff,0x0b1220,.62);this.scene.add(hemi);
    const ambient=new THREE.AmbientLight(0xffffff,.92);this.scene.add(ambient);
    this.headKey=new THREE.DirectionalLight(0xffffff,2.15);this.headKey.position.set(.22,.18,1.45);this.camera.add(this.headKey);
    this.headFill=new THREE.PointLight(0xf3f7ff,1.45,0,2);this.headFill.position.set(-.18,.04,1.08);this.camera.add(this.headFill);
    const softBack=new THREE.DirectionalLight(0x9bb7ff,.18);softBack.position.set(-.42,.2,.92);this.camera.add(softBack);

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
  canvasTexture(draw,w=1024,h=1024){
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');draw(ctx,w,h);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1,1);t.anisotropy=Math.min(8,this.renderer?.capabilities?.getMaxAnisotropy?.()||1);return t;
  }
  rng(seed){
    let s=(Math.abs(Math.floor(seed||1))%2147483647)||1;
    return ()=>((s=s*16807%2147483647)-1)/2147483646;
  }
  seeded(item,def,salt=0){
    const a=String(def?.id||def?.name||'');
    let h=0;for(let i=0;i<a.length;i++)h=((h<<5)-h+a.charCodeAt(i))|0;
    return this.rng((item?.pattern||1)+(item?.wearIndex||0)*97+h+salt*131);
  }
  lineGrid(ctx,w,h,step,color,a=.2){ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=a;ctx.lineWidth=2;for(let x=0;x<=w;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<=h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}ctx.restore();}
  drawRects(ctx,w,h,rand,count,palette,minW=40,maxW=220,minH=20,maxH=120,alpha=.9){for(let i=0;i<count;i++){ctx.fillStyle=palette[Math.floor(rand()*palette.length)];ctx.globalAlpha=.35+rand()*alpha;ctx.fillRect(rand()*w,rand()*h,minW+rand()*(maxW-minW),minH+rand()*(maxH-minH));}ctx.globalAlpha=1;}
  drawStrokes(ctx,w,h,rand,count,palette,width=10){ctx.lineCap='round';for(let i=0;i<count;i++){ctx.strokeStyle=palette[Math.floor(rand()*palette.length)];ctx.globalAlpha=.4+rand()*.45;ctx.lineWidth=2+rand()*width;ctx.beginPath();const x0=rand()*w,y0=rand()*h;ctx.moveTo(x0,y0);for(let j=0;j<3;j++)ctx.quadraticCurveTo(rand()*w,rand()*h,rand()*w,rand()*h);ctx.stroke();}ctx.globalAlpha=1;}
  drawDots(ctx,w,h,rand,count,palette,rMin=4,rMax=24,alpha=.8){for(let i=0;i<count;i++){ctx.fillStyle=palette[Math.floor(rand()*palette.length)];ctx.globalAlpha=.25+rand()*alpha;ctx.beginPath();ctx.arc(rand()*w,rand()*h,rMin+rand()*(rMax-rMin),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}

  proceduralFinishMap(item,def){
    const name=(def?.name||def?.finish||'').toLowerCase();
    const rand=this.seeded(item,def,7);

    if(name.includes('chrome cannon'))return this.canvasTexture((ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#f4f6fb');g.addColorStop(.14,'#aab2bf');g.addColorStop(.32,'#f7fbff');g.addColorStop(.55,'#6d7480');g.addColorStop(.75,'#f2f6fb');g.addColorStop(1,'#9ba4b3');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      ctx.fillStyle='rgba(255,255,255,.24)';for(let i=0;i<11;i++)ctx.fillRect(i*w/10,0,w/48,h);
      ctx.fillStyle='rgba(25,28,33,.55)';ctx.fillRect(0,h*.5,w,h*.08);
      ctx.fillStyle='rgba(160,20,28,.92)';ctx.beginPath();ctx.moveTo(w*.3,h*.54);ctx.lineTo(w*.54,h*.36);ctx.lineTo(w*.7,h*.45);ctx.lineTo(w*.5,h*.63);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(240,115,58,.72)';ctx.fillRect(w*.42,h*.42,w*.11,h*.18);
      this.drawStrokes(ctx,w,h,rand,9,['rgba(255,255,255,.16)','rgba(30,35,45,.20)'],5);
    });

    if(name.includes('inheritance'))return this.canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#f0ede5';ctx.fillRect(0,0,w,h);
      this.drawStrokes(ctx,w,h,rand,14,['#2b4f92','#426ec0','#7ca8e8'],4);
      ctx.strokeStyle='rgba(39,62,116,.55)';ctx.lineWidth=2;for(let i=0;i<22;i++){const x=rand()*w,y=rand()*h;ctx.beginPath();ctx.arc(x,y,10+rand()*24,0,Math.PI*2);ctx.stroke();}
    });

    if(name.includes('black lotus'))return this.canvasTexture((ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#06080f');g.addColorStop(.55,'#1b1230');g.addColorStop(1,'#090b11');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      this.drawStrokes(ctx,w,h,rand,12,['rgba(118,77,211,.5)','rgba(195,127,255,.35)'],8);
      for(let i=0;i<14;i++){const x=rand()*w,y=rand()*h,s=22+rand()*58;ctx.strokeStyle='rgba(196,148,255,.45)';ctx.lineWidth=2;for(let p=0;p<6;p++){ctx.beginPath();ctx.ellipse(x,y,s*(.25+p*.08),s*(.65-p*.07),p*Math.PI/3,0,Math.PI);ctx.stroke();}}
    });

    if(name.includes('jawbreaker'))return this.canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#101722';ctx.fillRect(0,0,w,h);
      this.drawRects(ctx,w,h,rand,18,['#ff4fa7','#58d7ff','#ffe45c','#9f7bff'],40,170,30,120,.8);
      this.drawDots(ctx,w,h,rand,45,['#ff8dc8','#7be4ff','#fff1aa','#ffffff'],6,18,.55);
      for(let i=0;i<8;i++){const x=rand()*w,y=rand()*h,r=26+rand()*36;ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI);ctx.stroke();ctx.beginPath();ctx.arc(x-r*.3,y-r*.2,r*.12,0,Math.PI*2);ctx.arc(x+r*.3,y-r*.2,r*.12,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.7)';ctx.fill();}
    });

    if(name.includes('olympus'))return this.canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#ece8dc';ctx.fillRect(0,0,w,h);
      this.drawStrokes(ctx,w,h,rand,10,['rgba(204,186,129,.55)','rgba(112,163,255,.35)','rgba(255,255,255,.35)'],5);
      ctx.strokeStyle='rgba(185,150,73,.72)';ctx.lineWidth=6;for(let y=40;y<h;y+=170){for(let x=0;x<w;x+=120){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+30,y);ctx.lineTo(x+30,y+20);ctx.lineTo(x+60,y+20);ctx.lineTo(x+60,y);ctx.lineTo(x+90,y);ctx.stroke();}}
    });

    if(name.includes('analog input'))return this.canvasTexture((ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#22102e');g.addColorStop(1,'#061b31');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      this.lineGrid(ctx,w,h,64,'#4b5c93',.18);
      ctx.lineWidth=6;ctx.strokeStyle='rgba(78,236,255,.8)';ctx.beginPath();for(let x=0;x<=w;x+=32){const y=h*.58+Math.sin(x/90)*80+Math.cos(x/44)*25; x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();
      ctx.strokeStyle='rgba(244,98,255,.5)';ctx.beginPath();for(let x=0;x<=w;x+=20){const y=h*.42+Math.cos(x/70)*55; x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();
    });

    if(name.includes('just smile'))return this.canvasTexture((ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#171f2a');g.addColorStop(1,'#202937');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      for(let i=0;i<8;i++){
        const x=90+rand()*(w-180),y=90+rand()*(h-180),r=36+rand()*56;
        ctx.fillStyle='rgba(255,210,68,.92)';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(17,22,30,.96)';ctx.beginPath();ctx.arc(x-r*.28,y-r*.18,r*.11,0,Math.PI*2);ctx.arc(x+r*.28,y-r*.18,r*.11,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(17,22,30,.96)';ctx.lineWidth=Math.max(3,r*.11);ctx.beginPath();ctx.arc(x,y+r*.03,r*.46,.15*Math.PI,.85*Math.PI);ctx.stroke();
      }
      this.drawStrokes(ctx,w,h,rand,16,['rgba(81,197,255,.40)','rgba(255,108,168,.34)','rgba(255,255,255,.10)'],4);
      this.drawRects(ctx,w,h,rand,10,['rgba(255,210,68,.18)','rgba(87,210,255,.12)'],80,220,40,120,.25);
    });

    if(name.includes('hybrid'))return this.canvasTexture((ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#1f4fa2');g.addColorStop(.5,'#0f1622');g.addColorStop(1,'#a1292d');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      this.drawRects(ctx,w,h,rand,18,['rgba(103,168,255,.58)','rgba(255,92,92,.58)','rgba(255,255,255,.18)'],60,220,24,120,.55);
      this.drawStrokes(ctx,w,h,rand,10,['rgba(255,255,255,.25)','rgba(0,0,0,.25)'],6);
    });

    if(name.includes('etch lord'))return this.canvasTexture((ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#0f1217');g.addColorStop(.65,'#1e232b');g.addColorStop(1,'#343b46');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      for(let i=0;i<18;i++){
        ctx.strokeStyle='rgba(225,232,240,.54)';ctx.lineWidth=1.8+rand()*1.8;ctx.beginPath();
        let x=rand()*w,y=rand()*h;ctx.moveTo(x,y);
        for(let j=0;j<4;j++){x+=(rand()-.5)*180;y+=(rand()-.5)*180;ctx.lineTo(x,y);}ctx.stroke();
      }
      this.drawStrokes(ctx,w,h,rand,8,['rgba(255,255,255,.18)','rgba(145,155,172,.24)'],4);
    });

    if(name.includes('block-18'))return this.canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#1a2433';ctx.fillRect(0,0,w,h);
      this.drawRects(ctx,w,h,rand,28,['#4c7fdb','#5ed7ff','#f5b14c','#d9e5ff'],36,180,26,120,.75);
    });

    if(name.includes('motorized'))return this.canvasTexture((ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#5d6168');g.addColorStop(.4,'#252a2f');g.addColorStop(1,'#12161a');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      this.drawRects(ctx,w,h,rand,14,['rgba(224,234,245,.32)','rgba(255,58,58,.55)','rgba(10,12,15,.3)'],40,150,18,80,.55);
      ctx.strokeStyle='rgba(255,40,40,.55)';ctx.lineWidth=4;for(let i=0;i<12;i++){ctx.beginPath();ctx.moveTo(rand()*w,rand()*h);ctx.lineTo(rand()*w,rand()*h);ctx.stroke();}
    });

    if(name.includes('slag'))return this.canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#262a2f';ctx.fillRect(0,0,w,h);
      this.drawStrokes(ctx,w,h,rand,18,['rgba(255,137,32,.85)','rgba(255,197,92,.55)','rgba(77,77,77,.35)'],8);
      this.drawDots(ctx,w,h,rand,24,['rgba(255,118,0,.4)','rgba(255,214,88,.22)'],4,12,.35);
    });

    if(name.includes('dezastre'))return this.canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#12171b';ctx.fillRect(0,0,w,h);
      for(let i=-h;i<w+h;i+=120){ctx.fillStyle=i%240===0?'#eccb38':'#1c2228';ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+70,0);ctx.lineTo(i-h+70,h);ctx.lineTo(i-h,h);ctx.closePath();ctx.fill();}
      this.drawRects(ctx,w,h,rand,10,['rgba(86,214,255,.4)','rgba(255,255,255,.15)'],50,180,18,70,.4);
    });

    if(name.includes('dark sigil'))return this.canvasTexture((ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#080b10');g.addColorStop(1,'#28162e');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='rgba(181,118,255,.4)';ctx.lineWidth=3;for(let i=0;i<10;i++){const x=rand()*w,y=rand()*h,r=32+rand()*90;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);ctx.stroke();}
      this.drawStrokes(ctx,w,h,rand,8,['rgba(255,255,255,.15)','rgba(108,52,161,.25)'],5);
    });

    if(name.includes('light box'))return this.canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#111827';ctx.fillRect(0,0,w,h);
      this.drawRects(ctx,w,h,rand,24,['rgba(117,244,255,.75)','rgba(182,124,255,.72)','rgba(255,214,92,.4)','rgba(255,255,255,.2)'],30,140,20,110,.72);
      this.lineGrid(ctx,w,h,80,'#5a6c96',.08);
    });

    if(name.includes('hideout'))return this.canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#705f44';ctx.fillRect(0,0,w,h);
      this.drawRects(ctx,w,h,rand,30,['#8d7b59','#493f31','#aa976d','#5b4f3b'],60,220,26,110,.58);
    });

    if(name.includes('irezumi'))return this.canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#f1e4cc';ctx.fillRect(0,0,w,h);
      this.drawStrokes(ctx,w,h,rand,14,['rgba(25,25,25,.6)','rgba(186,35,37,.52)','rgba(61,94,147,.38)'],6);
      for(let i=0;i<18;i++){ctx.strokeStyle='rgba(35,35,35,.42)';ctx.lineWidth=2;const x=rand()*w,y=rand()*h;ctx.beginPath();ctx.arc(x,y,18+rand()*48,0,Math.PI);ctx.stroke();}
    });

    if(name.includes('forest ddpat'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#59664b';ctx.fillRect(0,0,w,h);this.drawRects(ctx,w,h,rand,26,['#48523b','#758861','#31392c'],40,150,20,70,.55);});
    if(name.includes('boreal forest'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#69755a';ctx.fillRect(0,0,w,h);this.drawRects(ctx,w,h,rand,26,['#38422e','#7b866a','#4b5740'],40,150,20,70,.55);});
    if(name.includes('safari mesh'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#c2b491';ctx.fillRect(0,0,w,h);this.lineGrid(ctx,w,h,48,'#8b7b59',.22);this.drawRects(ctx,w,h,rand,16,['rgba(122,108,78,.35)','rgba(215,199,163,.25)'],40,120,20,60,.25);});
    if(name.includes('urban masked'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#8d959c';ctx.fillRect(0,0,w,h);this.drawRects(ctx,w,h,rand,26,['#545c63','#9fa7ac','#6d747a'],40,140,20,70,.55);});
    if(name.includes('night stripe'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#14161b';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(70,73,82,.8)';ctx.lineWidth=12;for(let i=-h;i<w;i+=80){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+h,h);ctx.stroke();}});
    if(name.includes('crimson web'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#7a111c';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(255,255,255,.38)';ctx.lineWidth=2;for(let i=0;i<10;i++){const x=rand()*w,y=rand()*h,r=30+rand()*90;ctx.beginPath();for(let a=0;a<8;a++){const ang=a*Math.PI/4;ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(ang)*r,y+Math.sin(ang)*r);}ctx.stroke();ctx.beginPath();for(let k=1;k<=4;k++)ctx.arc(x,y,r*(k/4),0,Math.PI*2);ctx.stroke();}});
    if(name.includes('case hardened'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#7d6848';ctx.fillRect(0,0,w,h);this.drawDots(ctx,w,h,rand,34,['rgba(34,85,160,.82)','rgba(186,138,27,.8)','rgba(93,41,144,.72)','rgba(206,108,38,.52)'],18,66,.75);});
    if(name.includes('blue steel'))return this.canvasTexture((ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#7e8899');g.addColorStop(.5,'#576476');g.addColorStop(1,'#2f3948');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    if(name.includes('scorched'))return this.canvasTexture((ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#5f6266');g.addColorStop(.5,'#898d92');g.addColorStop(1,'#3b4046');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);this.drawRects(ctx,w,h,rand,42,['rgba(18,18,18,.32)','rgba(70,70,70,.18)','rgba(130,130,130,.10)'],24,110,4,18,.30);});
    if(name.includes('stained'))return this.canvasTexture((ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#b8bdc6');g.addColorStop(.5,'#8b929d');g.addColorStop(1,'#dfe5ef');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);this.drawDots(ctx,w,h,rand,24,['rgba(110,110,110,.22)','rgba(255,255,255,.15)'],6,18,.28);});
    if(name.includes('fade'))return this.canvasTexture((ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#f5df6d');g.addColorStop(.22,'#f2d454');g.addColorStop(.42,'#ff83ba');g.addColorStop(.68,'#f0a233');g.addColorStop(.86,'#d16cf1');g.addColorStop(1,'#8452cc');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    if(name.includes('slaughter'))return this.canvasTexture((ctx,w,h)=>{ctx.fillStyle='#a51520';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(255,210,210,.34)';ctx.lineWidth=10;for(let i=-h;i<w;i+=70){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+h,h);ctx.stroke();}});
    if(name.includes('vanilla'))return this.canvasTexture((ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#d8c38f');g.addColorStop(.5,'#9f8649');g.addColorStop(1,'#ead49a');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});

    return this.canvasTexture((ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#c8d1dd');g.addColorStop(.5,'#93a0b0');g.addColorStop(1,'#eef3f8');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
  }
  materialProfile(def){
    const name=(def?.name||def?.finish||'').toLowerCase();
    if(name.includes('chrome cannon'))return {metalness:.88,roughness:.2};
    if(name.includes('vanilla')||name.includes('fade')||name.includes('case hardened')||name.includes('stained')||name.includes('blue steel'))return {metalness:.76,roughness:.3};
    if(name.includes('scorched')||name.includes('night stripe')||name.includes('forest')||name.includes('urban')||name.includes('safari'))return {metalness:.52,roughness:.48};
    if(name.includes('black lotus')||name.includes('dark sigil'))return {metalness:.3,roughness:.52};
    return {metalness:.26,roughness:.56};
  }
  makeKukriProxy(item,def){
    const g=new THREE.Group();

    const bladeShape=new THREE.Shape();
    bladeShape.moveTo(-1.62,-.05);
    bladeShape.quadraticCurveTo(-1.28,.02,-.75,.08);
    bladeShape.quadraticCurveTo(-.05,.18,.78,.15);
    bladeShape.quadraticCurveTo(1.18,.13,1.52,-.02);
    bladeShape.quadraticCurveTo(1.18,-.18,.6,-.24);
    bladeShape.quadraticCurveTo(-.18,-.31,-.9,-.24);
    bladeShape.quadraticCurveTo(-1.36,-.18,-1.62,-.05);
    const bladeGeo=new THREE.ExtrudeGeometry(bladeShape,{depth:.05,bevelEnabled:true,bevelSize:.01,bevelThickness:.01,steps:1});
    bladeGeo.center();

    const fullerGeo=new THREE.BoxGeometry(1.15,.025,.012);
    const guardGeo=new THREE.BoxGeometry(.16,.17,.11);
    const handleGeo=new THREE.CylinderGeometry(.08,.095,.68,18);
    const pommelGeo=new THREE.CylinderGeometry(.11,.11,.08,18);
    const ringGeo=new THREE.TorusGeometry(.18,.038,16,30);

    const bladeMat=new THREE.MeshStandardMaterial({map:this.proceduralFinishMap(item,def),color:0xffffff,metalness:.72,roughness:.3,side:THREE.DoubleSide});
    const spineMat=new THREE.MeshStandardMaterial({color:0xc8ced8,metalness:.7,roughness:.22});
    const brassMat=new THREE.MeshStandardMaterial({color:0x9d7f48,metalness:.58,roughness:.36});
    const gripMat=new THREE.MeshStandardMaterial({color:0x6d5337,metalness:.12,roughness:.86});

    const blade=new THREE.Mesh(bladeGeo,bladeMat);blade.rotation.x=Math.PI*.5;blade.position.set(.42,0,.03);g.add(blade);
    const fuller=new THREE.Mesh(fullerGeo,new THREE.MeshStandardMaterial({color:0xe8edf6,metalness:.76,roughness:.18}));fuller.rotation.z=-.04;fuller.position.set(.28,.035,.058);g.add(fuller);
    const guard=new THREE.Mesh(guardGeo,brassMat);guard.rotation.z=Math.PI*.5;guard.position.set(-1.12,0,.03);g.add(guard);
    const grip=new THREE.Mesh(handleGeo,gripMat);grip.rotation.z=Math.PI*.5;grip.position.set(-1.47,0,.03);g.add(grip);
    const pommel=new THREE.Mesh(pommelGeo,brassMat);pommel.rotation.z=Math.PI*.5;pommel.position.set(-1.83,0,.03);g.add(pommel);
    const ring=new THREE.Mesh(ringGeo,brassMat);ring.rotation.y=Math.PI*.5;ring.position.set(-2.02,0,.03);g.add(ring);
    const spine=new THREE.Mesh(new THREE.BoxGeometry(.48,.028,.03),spineMat);spine.position.set(-1.23,.005,.05);g.add(spine);

    return g;
  }
  async materialFor(item,def){
    const profile=this.materialProfile(def);
    const map=this.proceduralFinishMap(item,def);
    const m=new THREE.MeshStandardMaterial({map,color:0xffffff,metalness:profile.metalness,roughness:profile.roughness,side:THREE.DoubleSide});
    return {material:m,status:'Stage 8 local finish preview active · static camera-adjacent lighting active · wear degradation still pending',supported:true};
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
      obj.traverse(o=>{if(o.isMesh){if(!o.userData?.keepMaterial)o.material=material.clone();o.castShadow=false;o.receiveShadow=false}});
      material.dispose();this.frame(true);this.loading.hidden=true;this.onStatus?.(status);
    }catch(e){console.error(e);this.loading.hidden=false;this.loading.textContent='Native 3D asset failed to load.';this.onStatus?.(`3D load failed: ${e?.message||e}`)}
  }
  reset(){if(!this.home)return;this.camera.position.copy(this.home.position);this.controls.target.copy(this.home.target);this.controls.minDistance=this.home.min;this.controls.maxDistance=this.home.max;this.controls.update()}
  close(){this.stop();this.disposeRoot()}
}
