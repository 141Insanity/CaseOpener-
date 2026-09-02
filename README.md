# CaseLab v0.6.0 — Stage 6 Flat Build

This build stays **flat** for easier mobile GitHub uploads: no nested runtime folders.

## Upload
Upload every file in this ZIP directly to the repository root.

## Stage 6 focus
- Keeps the Stage 5.2 flat-file repair structure.
- Changes inspect lighting to a **camera-space / viewer-relative setup** so rotating the weapon should not make the back side collapse into near-black.
- Adds a small **reference finish** image inside inspect mode so unsupported local recipes still show what the intended finish is.
- Replaces the Kukri hard-fail with a simple local inspect proxy so knife inspection is no longer just a broken placeholder.
- Exact Source-2 finish parity is **still not claimed** for unsupported recipes.

## What to test
1. Open a few cases and inspect both a gun and a Kukri.
2. Rotate the item front to back and check whether brightness stays much more consistent.
3. Confirm the top of the weapon stays in frame and zooming no longer clips as aggressively.
4. Confirm the reference-finish thumbnail appears in inspect mode.
5. Tell me which skins still need true local recipes next so the following stage can target them directly.
