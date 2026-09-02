# CaseLab v0.6.0 — Stage 2

Upload **all files in this folder to the GitHub repository root**. There are no required css/js subfolders in Stage 2, specifically to make mobile GitHub uploads reliable.

## Stage 2 changes
- Restores the full CaseLab UI after the Stage 1 folder-path deployment problem.
- Runtime files are flat at repo root: `index.html`, `app.css`, `catalog.js`, `storage.js`, `app.js`, `viewer3d.js`.
- `index.html` also contains a CSS fallback, so a missed stylesheet upload will not turn the page into raw HTML again.
- IndexedDB schema v2; old v0.5.6/v0.6 Stage 1 data is migrated forward.
- Stable item/case/collection IDs are attached to inventory instances.
- Case-opening float generation uses observed CS unbox wear-bucket probabilities plus dead zones, remapped through each skin's float cap.
- Unbox paint seeds are 0–999; trade-up seeds may be 0–1000.
- Trade-up output float now uses normalized input positions inside each input skin's own float range.
- Trade-up pools are collection-aware and probability-weighted by the collections represented among inputs.

Pricing and the native 3D material renderer are intentionally unchanged in this stage.
