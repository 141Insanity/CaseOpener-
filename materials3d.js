// CaseLab v0.6 Stage 4 material boundary.
// Stage 5 replaces this preview provider with the real Kilowatt finish compositor.
// Keeping this isolated means the renderer/camera/model lifecycle no longer needs to change
// when accurate paint-kit materials arrive.

function cloneReadableMaterial(THREE, source){
  const m = new THREE.MeshStandardMaterial({
    color: 0xb8c3d2,
    metalness: 0.34,
    roughness: 0.50,
    side: THREE.DoubleSide,
    emissive: 0x111820,
    emissiveIntensity: 0.18
  });
  if(source && source.color) m.color.copy(source.color).lerp(new THREE.Color(0xb8c3d2), 0.55);
  return m;
}

/**
 * Stage-4 preview material provider.
 * It intentionally does NOT pretend a panorama inventory image is a Source 2 skin texture.
 * Stage 5 will replace materials mesh-by-mesh using proper finish assets/rules.
 */
export async function applyPreviewMaterials({THREE, root}){
  const oldMaterials=new Set(), oldTextures=new Set();
  root.traverse(node=>{
    if(!node.isMesh) return;
    const sources=Array.isArray(node.material)?node.material:[node.material];
    sources.filter(Boolean).forEach(m=>oldMaterials.add(m));
    const src=sources.find(Boolean)||null;
    node.material = cloneReadableMaterial(THREE, src);
    node.castShadow = false;
    node.receiveShadow = false;
  });
  // GLTF materials are replaced by the Stage-4 preview; release their GPU resources now.
  for(const m of oldMaterials){
    for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','bumpMap','displacementMap']){
      const t=m[key]; if(t&&!oldTextures.has(t)){oldTextures.add(t);t.dispose()}
    }
    m.dispose?.();
  }
  return {mode:'foundation-neutral'};
}
