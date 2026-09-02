// CaseLab v0.6 Stage 5 material compositor.
// This pass is intentionally deterministic: item image -> whole-model planar UV projection,
// rolled float -> wear amount, rolled paint seed -> wear placement. It avoids the old per-mesh
// screenshot stretching bug by calculating UVs from the COMPLETE weapon bounds.

function seeded(seed){
  let x=(seed|0)^0x9e3779b9;
  return ()=>{x|=0;x=x+0x6D2B79F5|0;let t=Math.imul(x^x>>>15,1|x);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296};
}

function fallbackMaterial(THREE,item){
  const rar=item?.rarity==='Special'?0xd5b45a:0xaeb8c6;
  return new THREE.MeshStandardMaterial({color:rar,metalness:.34,roughness:.48,side:THREE.DoubleSide});
}

async function loadImageTexture(THREE,url){
  if(!url) throw new Error('No skin artwork URL');
  return await new Promise((resolve,reject)=>{
    const loader=new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url,t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;resolve(t)},undefined,reject);
  });
}

function projectionBounds(THREE,root){
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

function installProjectedUVs(THREE,root,bounds){
  const size=bounds.getSize(new THREE.Vector3());
  const sx=Math.max(size.x,1e-5), sy=Math.max(size.y,1e-5);
  const invRoot=new THREE.Matrix4().copy(root.matrixWorld).invert();
  const tmp=new THREE.Vector3();
  root.traverse(node=>{
    if(!node.isMesh||!node.geometry?.attributes?.position)return;
    // Geometry can be shared by cloned GLTF nodes. Clone before writing UVs.
    node.geometry=node.geometry.clone();
    const pos=node.geometry.attributes.position;
    const uv=new Float32Array(pos.count*2);
    const localToRoot=new THREE.Matrix4().multiplyMatrices(invRoot,node.matrixWorld);
    for(let i=0;i<pos.count;i++){
      tmp.fromBufferAttribute(pos,i).applyMatrix4(localToRoot).applyMatrix4(root.matrixWorld);
      uv[i*2]=(tmp.x-bounds.min.x)/sx;
      uv[i*2+1]=1-(tmp.y-bounds.min.y)/sy;
    }
    node.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  });
}

function patchWear(material,item){
  const wear=Math.max(0,Math.min(1,Number(item?.float)||0));
  const seed=(Number(item?.pattern)||0)%1001;
  material.customProgramCacheKey=()=>`caselab-wear-v2-${wear.toFixed(5)}-${seed}`;
  material.onBeforeCompile=(shader)=>{
    shader.uniforms.clWear={value:wear};
    shader.uniforms.clSeed={value:seed};
    shader.fragmentShader=shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\nuniform float clWear;\nuniform float clSeed;\nfloat clHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\nfloat clNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(clHash(i),clHash(i+vec2(1.,0.)),f.x),mix(clHash(i+vec2(0.,1.)),clHash(i+vec2(1.,1.)),f.x),f.y);}`
    );
    shader.fragmentShader=shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\n#ifdef USE_MAP\nvec2 clP=vMapUv*vec2(38.0,24.0)+vec2(mod(clSeed,37.0)*0.173,mod(clSeed,53.0)*0.119);\nfloat clN=0.55*clNoise(clP)+0.28*clNoise(clP*2.13)+0.17*clNoise(clP*5.71);\nfloat clScratch=pow(abs(sin((vMapUv.x*93.0+vMapUv.y*17.0+clSeed*0.013)*3.14159)),30.0);\nfloat clEdge=max(smoothstep(0.0,0.10,vMapUv.x)*smoothstep(0.0,0.10,1.0-vMapUv.x),smoothstep(0.0,0.10,vMapUv.y)*smoothstep(0.0,0.10,1.0-vMapUv.y));\nfloat clThreshold=mix(0.97,0.31,pow(clWear,0.72));\nfloat clWearMask=smoothstep(clThreshold-0.10,clThreshold+0.08,clN+clScratch*0.30);\nclWearMask*=mix(0.30,1.0,clWear);\nvec3 clSubstrate=vec3(0.20,0.215,0.23);\ndiffuseColor.rgb=mix(diffuseColor.rgb,clSubstrate,clWearMask);\n#endif`
    );
  };
  material.needsUpdate=true;
}

function disposeOld(root){
  const mats=new Set(),tex=new Set();
  root.traverse(n=>{if(!n.isMesh)return;(Array.isArray(n.material)?n.material:[n.material]).filter(Boolean).forEach(m=>mats.add(m))});
  for(const m of mats){for(const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap']){const t=m[k];if(t&&!tex.has(t)){tex.add(t);t.dispose?.()}}m.dispose?.()}
}

export async function applyPreviewMaterials({THREE,root,item,imgUrl}){
  const old=[];root.traverse(n=>{if(n.isMesh)old.push(...(Array.isArray(n.material)?n.material:[n.material]).filter(Boolean))});
  const bounds=projectionBounds(THREE,root);
  installProjectedUVs(THREE,root,bounds);
  let texture=null,mode='projected-fallback';
  try{texture=await loadImageTexture(THREE,imgUrl);mode='kilowatt-projected'}catch(e){console.warn('Skin artwork texture unavailable',e)}
  root.traverse(node=>{
    if(!node.isMesh)return;
    const m=texture?new THREE.MeshStandardMaterial({map:texture,color:0xffffff,metalness:.24,roughness:.46,side:THREE.DoubleSide}):fallbackMaterial(THREE,item);
    if(texture)patchWear(m,item);
    node.material=m;node.castShadow=false;node.receiveShadow=false;
  });
  // shared texture belongs to all materials; leave disposal to viewer's root cleanup.
  const seen=new Set();for(const m of old){if(!m||seen.has(m))continue;seen.add(m);for(const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap'])m[k]?.dispose?.();m.dispose?.()}
  return {mode,wear:item?.float,pattern:item?.pattern};
}
