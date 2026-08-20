# Non-linear Factor Transforms — Design Spec

Date: 2026-07-07
Status: Approved design, pre-implementation

## 1. Purpose

Several predictors relate non-linearly to fertility, so a straight-line OLS
mis-fits them (visible curvature/heteroscedasticity in the scatter plots). GDP
per capita is the classic case (steep decline then flattening). Correct this by
giving each factor a data-chosen **transform** and, where genuinely curved, a
**quadratic term** — improving the fit and cleaning the residuals, while keeping
the model interpretable and the "control-for" toggle UX intact.

## 2. Mechanism (automatic, data-driven — like the target transform)

Each factor gains two metadata fields, decided empirically by the pipeline
**per scale** against the (transformed) target:

- `transform: "raw" | "log"` — `log` if it improves that factor's linear fit and
  every value is > 0; else `raw`.
- `quadratic: boolean` — `true` if adding a squared term meaningfully improves
  the fit.

### 2.1 Decision rules (pipeline)

For each factor, over complete `(target, x)` rows with `y = target-transform(tfr)`:
- **transform:** if `min(x) > 0` and `R²_lin(log x, y) − R²_lin(x, y) ≥ 0.01`,
  choose `log`; else `raw`.
- **quadratic:** on the chosen transform's standardized `z`, compare
  `R²(y ~ z)` to `R²(y ~ z + z²)`; `quadratic = ΔR² ≥ quad_min_gain`.
- **Thresholds / guards:** `quad_min_gain` is passed per scale — **0.02 (world)**,
  **0.05 (US, n≈51)** to avoid overfitting. If fewer than `MIN_N = 30` complete
  rows, force `raw` / `quadratic = false`.

### 2.2 Empirical outcome (validates the design)

- **World:** log → `gdp_pc` (R² 0.45→0.70), `child_mortality`, `mobile_use`,
  `gini`, `flfp`; quadratic → `possibility` (+0.112), `fem_sec_enroll` (+0.057),
  `flfp` (+0.047), `child_mortality` (+0.027), `gii` (+0.026).
- **US (n=51, stricter):** no logs; quadratic → `urbanisation` (+0.108),
  `flfp` (+0.058). Conservative, as intended.

## 3. Browser model (`fitModel`)

For the selected factors (each carrying `transform`/`quadratic`):

1. **Complete cases:** rows with `tfr > 0`, every selected factor non-null, and
   `x > 0` for any `log` factor.
2. For each factor `f`: transform `t = (f.transform === "log") ? ln(x) : x`;
   standardize `t` over complete cases → `z_f`.
3. For each `quadratic` factor: `zq_f = standardize(z_f²)` (centring the squared
   term for stability/comparability).
4. Design matrix `X = [1] + [z_f for all f] + [zq_f for curved f]`; solve OLS
   (least-squares, as today) for intercept, linear `β_f`, and quadratic `γ_f`.
5. **Predicted** (transform space) `= intercept + Σ β_f z_f + Σ γ_f zq_f`,
   back-transformed to TFR (`exp` when the target is log). **Residual = actual −
   predicted TFR** — unchanged meaning.
6. **Per-factor contribution** (detail panel) `= β_f z_f + (curved ? γ_f zq_f : 0)`
   — one combined number per factor, so the UI stays one row per factor.
7. `R²` computed in transform space as today.

`fitModel`'s signature changes from `(units, factorIds: string[], targetTransform)`
to `(units, factors: {id, transform, quadratic}[], targetTransform)`. The
solver already uses a least-squares (pseudo-inverse) solve, so the extra columns
never make it throw on collinear selections.

## 4. Data contract

- `factors.json` factor objects gain `transform` (`"raw"|"log"`) and `quadratic`
  (`boolean`); `factors.schema.json` updated. Older bundles / factors missing the
  fields default to `raw` / `false` (identical to today's behaviour).
- `emit.write_bundle` gains an optional `factor_transforms` map
  (`{factor_id: {transform, quadratic}}`); when absent, all factors emit
  `raw`/`false` (keeps existing tests and the backward-compat path).
- `run.py` (world, `quad_min_gain=0.02`) and `us_states.py` (US,
  `quad_min_gain=0.05`) compute the decisions and pass them to `write_bundle`.

## 5. Web UX

- **One checkbox per factor still** — selecting a curved factor automatically
  includes its linear + quadratic terms.
- **Label annotations** in the control panel: a `"(log)"` suffix for logged
  factors and a small **`curve`** badge for quadratic factors (styled like the
  existing `exp` badge).
- **Detail panel** unchanged structurally — it renders the combined per-factor
  contribution.
- **About view** gains a short note: predictors are transformed (log where it
  linearizes) and curved predictors carry a quadratic term, both chosen
  empirically per scale; with a caveat that quadratic terms add parameters
  (kept conservative, especially for US states).
- **Scatter view** is unchanged for now — it still plots raw factor values on the
  x-axis; only the residual it plots reflects the improved model. (A
  transform-aware scatter axis is possible later; out of scope here.)

## 6. Testing

**Pipeline (pytest)**
- `choose_factor_transforms`: picks `log` for a synthetic log-linear factor,
  `raw` for a linear one, `raw` for a factor with a non-positive value; flags
  `quadratic` for a synthetic curved factor and not for a linear one; respects
  `quad_min_gain` and the `MIN_N` guard.
- `emit`: factor objects carry `transform`/`quadratic`; schema validates; absent
  `factor_transforms` → all `raw`/`false`.

**Web (vitest)**
- `fitModel` applies `log` (a log-distributed factor yields a higher R² than
  raw) and includes a quadratic column for a curved factor; the combined
  contribution equals `β z + γ zq`.
- Backward compatibility: factors without `transform`/`quadratic` behave exactly
  as before (raw, linear).
- ControlPanel shows `(log)` and the `curve` badge for the right factors.

## 7. Out of scope

- User-controllable per-factor transforms (kept automatic).
- Splines / higher-order polynomials (quadratic only).
- Transform-aware scatter axes.
- Any change to the residual definition, projections, scales, or overlays.

## 8. Deliverables

1. Pipeline: `choose_factor_transforms` (diagnostics), `emit`/schema fields,
   `run.py`/`us_states.py` wiring, tests.
2. Web: `FactorMeta` fields, `fitModel` transform+quadratic+combined
   contributions, ControlPanel annotations, About note, tests.
3. Re-emitted world + US bundles carrying the per-factor decisions.
4. Merged to `main`, all tests green, build green.
