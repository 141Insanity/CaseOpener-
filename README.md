# CaseLab v0.6.0 — Stage 5.1 Repair Build

This is a repair build focused on the issues found in Stage 5.

## What changed
- Corrected the top version label so the app clearly shows **v0.6.0 · Stage 5.1 Preview**.
- Swapped the Stage-5 fake projected-skin viewer approach for the v0.6 multi-file preview viewer.
- Added a stable fixed studio lighting setup with one dominant key light plus subtle static fill so the back side of weapons stays readable without lighting popping around when the gun rotates.
- Adjusted initial framing so inspected weapons start lower and slightly farther back, reducing top-edge clipping.
- Kept inventory/trade-up filters, highest-rarity sorting, StatTrak filtering, IndexedDB save migration, and bulk sell by rarity/StatTrak.
- For the subset of Kilowatt skins that currently have authored preview material maps in the manifest, the native viewer now prefers those native-UV maps instead of the broken full-image projection method.
- For skins without a verified finish recipe yet, the viewer intentionally shows neutral geometry and states that the exact local finish recipe is still missing, instead of falsely pretending the skin is correct.

## Still blocked before final v0.6.0
- All 17 Kilowatt gun finishes need verified local finish recipes.
- Exact float-driven wear and pattern transforms still need a real finish compositor.
- Kukri still needs a verified native mesh + finish set.

## Upload to GitHub Pages
Upload the **contents** of this folder so `index.html` sits at the repo root, alongside the `css`, `js`, `data`, and `assets` folders.
