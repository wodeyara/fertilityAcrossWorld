# Fixed Residual Legend — Design Spec

Date: 2026-07-07
Status: Approved design, pre-implementation

## 1. Purpose

Make the residual color scale a **fixed, numbered** scale instead of a
model-dependent one. Today the map colors residuals on a dynamic domain
(±p95 of residuals, min 0.5) while the legend is hardcoded to ±1.5 with text
labels — so the legend never matched the map, and the colors shifted meaning as
the user toggled factors.

## 2. Change

- **Fixed domain −0.5 … +0.5** (residual = actual − predicted TFR, births/woman)
  for BOTH the map fill and the legend. A single constant `RESIDUAL_MAX = 0.5`.
- Residuals beyond ±0.5 **saturate** (clamp) to the deepest red/blue.
- `residualColor(residual, dark)` drops its `maxAbs` parameter and uses the fixed
  domain internally (dark-mode neutral band becomes `RESIDUAL_MAX * 0.08`).
- **Legend (residual mode):** replace the "lower/higher than expected" text with
  numeric labels under the gradient bar: `≤ −0.5`, `−0.25`, `0`, `+0.25`,
  `≥ +0.5` (the `≤`/`≥` on the ends signal saturation), plus a short caption
  ("residual vs. predicted, births/woman"). Raw mode is unchanged.
- **More grades:** `residualLegendStops()` returns **13** evenly-spaced stops from
  −0.5 to +0.5 (6 bands per side + neutral centre), up from 3 per side, for a
  smoother gradient.
- **MapView:** remove the `maxAbsResidual(fit)` computation; call
  `residualColor(residual, dark)`.

## 3. Files

- `web/src/lib/scales.ts` — `RESIDUAL_MAX`, fixed `residualColor`, 13-stop `residualLegendStops`.
- `web/src/components/Legend.tsx` — numeric residual ticks.
- `web/src/components/MapView.tsx` — drop dynamic maxAbs.
- Tests: `scales.test.ts` (fixed-domain clamp + 13 stops), `Legend.test.tsx`
  (numeric labels replace directional text). MapView tests unaffected (they only
  assert against the insufficient color).

## 4. Testing

- `residualColor(0.6, false) === residualColor(0.5, false)` (saturation at the
  fixed max); positive reddish vs negative bluish still holds.
- `residualLegendStops()` has 13 strictly-increasing stops spanning −0.5…+0.5.
- Legend residual mode renders `−0.5` and `+0.5` (with ≤/≥) and `0`; no
  "lower/higher than expected" text.

## 5. Out of scope

Raw legend, projections, factors, or any model logic. Only the residual color
scale + legend.
