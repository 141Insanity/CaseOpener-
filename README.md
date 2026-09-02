# CaseLab v0.6.0 — Stage 4

Stage 4 rebuilds the native 3D renderer foundation while preserving the working Stage 3 case/inventory/economy systems.

## Upload
Upload every file in this ZIP to the root of the GitHub Pages repository.

## Stage 4 renderer changes
- one fixed world-space directional studio light (no moving fill/rim/hemisphere rig)
- neutral emissive baseline keeps the shadow side readable without adding another scene light
- reliable side-profile initial/reset camera
- stricter minimum zoom so the camera cannot enter the weapon mesh
- browser-chrome resizes no longer reset the user's camera
- viewer gestures are isolated from CaseLab's global Safari anti-page-zoom handlers
- render loop pauses when Inspect 3D closes or the page is backgrounded
- geometry/material/texture GPU resources are disposed on close/item change
- model GLBs are cached in Cache Storage and memory after first load
- async item changes are tokenized so a slow previous model cannot overwrite a newer inspect
- material application is isolated behind `materials3d.js` / `CaseLabFinishPipeline`

## Intentional Stage 4 limitation
Stage 4 uses a neutral readable weapon material. It intentionally removes the old panorama-image skin projection because that was not a valid CS2 material pipeline. Stage 5 is the Kilowatt finish pass: all 17 gun finishes, real wear/pattern behavior where applicable, and native Kukri models/finishes.

Steam live-price refresh may still report unavailable due to browser CORS; snapshot pricing remains the fallback.
