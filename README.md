# CaseLab v0.6.0 — Stage 5

Stage 5 activates the native Kilowatt visual compositor on top of the Stage-4 renderer foundation.

## Upload
Upload every file in this folder directly to the GitHub Pages repository root. Keep `index.html` at the root.

## Stage-5 test targets
- Inspect several Kilowatt guns and confirm their finish artwork is visible on the native 3D mesh.
- Compare a low-float and high-float item: the higher float should expose substantially more substrate/wear.
- Items with different pattern seeds should have different deterministic wear placement.
- Rotate 180 degrees: the reverse side should remain readable rather than going nearly black.
- Pinch zoom must stop before the camera clips through the mesh.
- Kukri Knife items now open a native 3D Kukri inspect instead of an unavailable-model message.
- RESET returns to the clean profile framing.

## Accuracy note
The native Stage-5 compositor is a browser-side approximation using the real item artwork as a continuous whole-model projection plus deterministic float/seed wear. `EXACT ↗` remains the Source-2 reference while finish-style/material parity is refined. No new case content has been added.
