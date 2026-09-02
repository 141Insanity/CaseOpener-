# CaseLab v0.6.0 — Stage 3

Stage 3 preserves the working flat GitHub Pages deployment from Stage 2 and adds the inventory/economy layer.

## Included
- IndexedDB save migration remains active.
- Permanent historical Best Pull.
- Bulk sell by rarity with All / StatTrak / Non-StatTrak filters and double confirmation for Covert/Gold.
- Steam fee calculation uses cent-based Steam + CS2 fee behavior rather than a flat 15% multiplier.
- Gross realized ROI and Steam-net liquidation ROI remain separate.
- Theoretical current gross RTP + expected loss/open are shown from the baked wear-specific snapshot.
- Removed invented within-wear float price multipliers.
- Limited automatic Steam Market refresh attempt with visible timestamp/status and snapshot fallback. Browser CORS/rate limiting may prevent live refresh; fallback is intentional.

## Upload
Upload every file in this ZIP directly to the GitHub repository root. Keep `index.html` at the root.

## Stage 4
Native 3D renderer/material architecture cleanup and local asset handling.
