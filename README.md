CaseLab v0.6.0 – Stage 7

What this stage targets
- Fix the inspect viewer so Kilowatt skins visibly render on the native 3D models.
- Keep the camera-space static lighting from Stage 6.
- Accept that wear degradation is still pending; the priority here is skin visibility and stability.

What changed
- Replaced the failing white/fallback finish path with deterministic local finish-preview recipes for the Kilowatt case skins.
- Added local preview recipes for the Kukri finishes so gold pulls no longer display as a blank white blade.
- Kept the inspect lighting tied to camera space so front/back rotation stays readable.
- Updated the inspect status copy to make it clear this is a local finish preview and that wear is still pending.

Notes
- This stage is focused on "make the skins show up" first.
- EXACT still exists as the external reference renderer.
- Wear/pattern accuracy can be improved in a later stage after the finish layer is visibly working.
