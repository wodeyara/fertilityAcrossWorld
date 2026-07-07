# Pronatalist-Policy Overlay — Design Spec

Date: 2026-07-07
Status: Approved design, pre-implementation

## 1. Purpose

Add a toggleable **pronatalist-policy overlay** to the world map of the
Unexplained Fertility Explorer. It lets users see *where governments are actively
trying to raise fertility* laid on top of the residual/raw choropleth — so they
can ask whether policy coincides with unexplained surplus or deficit, without
mistaking policy for a cause.

This realizes Phase 5 of the parent design
(`2026-06-23-unexplained-fertility-explorer-design.md` §6), scoped to the world
(country) scale. It does not change the residual engine or any existing view.

## 2. Core principle — overlay, not covariate

Pronatalist policy is treated as a **visual overlay, never a regression
covariate** (parent spec §6). Rationale: policy is typically a *reaction* to low
fertility, so as a predictor it would show misleading reverse-causality
associations. Policy data is therefore emitted in a **separate channel** from
`factors.json` and can never be selected in the control-for model. The advanced
"policy-as-covariate opt-in" the parent spec floated is **deferred** (YAGNI).

## 3. Scope

**In scope**
- World (country) scale only. The overlay toggle is hidden at the US-states scale
  (no policy data sourced for states this phase).
- UN top-level fertility-policy **stance** (raise / maintain / lower / none) plus
  **specific measures** (baby bonus, parental/family leave, childcare subsidy, tax
  incentives) per country.
- Present-day snapshot only.

**Out of scope (future specs)**
- US-state pronatalist measures.
- Historical policy time-series / era comparison.
- Policy-as-covariate opt-in.

## 4. Data source and acquisition

- **Primary:** UN World Population Policies Database — the "government policy on
  fertility level" classification (raise / maintain / lower / no intervention) and
  the fertility-related policy *measures* module.
- **Enrichment:** OECD Family Database for concrete measures (paid leave, child
  benefits, childcare support) across OECD countries.
- **Acquisition:** `data-pipeline/scripts/build_policies.py` (occasional run,
  mirrors `build_static_factors.py`). Writes the committed artifact
  `data-pipeline/data/policies.csv`.
- **Availability risk (implementation note):** at spec time the UN datasets page
  (`esa.un.org/PopPolicy/wpp_datasets.aspx`) redirects to `maintenance.un.org`.
  The UI is decoupled from acquisition via the committed CSV: the app ships
  against the CSV/emitted JSON contract, and the CSV is populated from the UN/OECD
  sources when they are reachable. **No values are guessed or hand-invented** — a
  country with no sourced policy data is emitted as `null`/`"—"`.

### 4.1 CSV contract — `data/policies.csv`

Columns:
- `iso3` — ISO3 country code (join key to the country reference).
- `stance` — one of `raise`, `maintain`, `lower`, `none`, or empty (unknown).
- `baby_bonus` — `yes` / `no` / empty.
- `parental_leave` — `yes` / `no` / empty.
- `childcare_subsidy` — `yes` / `no` / empty.
- `tax_incentive` — `yes` / `no` / empty.
- `notes` — optional short free-text (source-attributed), or empty.

Empty means "not reported by the source," rendered as "—" / "no data" — never
imputed.

## 5. Data contract to the web app

- The pipeline emits a **separate** `web/public/data/policies.json` for the world
  scale: an array of `{ iso_num, iso3, stance, measures: { baby_bonus,
  parental_leave, childcare_subsidy, tax_incentive }, notes }`, where each measure
  is `true | false | null` and `stance` is the string or `null`.
- Keyed by `iso_num` so it joins the topojson the same way `countries.json` does.
- It is **not** merged into `factors.json`; the regression never sees it.
- `meta.json` gains a `policyCoverage` count (# countries with a non-null stance)
  for the About/coverage readout.

## 6. Web rendering

### 6.1 Toggle
- A **"Pronatalist policy"** checkbox/toggle in the `ControlPanel`, shown **only
  when `scale === "world"`**. Off by default.
- State (`policyOn`) lives in `App`; passed to `MapView` and `DetailPanel`.

### 6.2 Map overlay (`MapView`)
- When `policyOn`, countries whose `stance === "raise"` are drawn with a
  **diagonal-hatch SVG pattern** on top of their existing residual/raw fill (the
  underlying color remains visible through the hatch). Implemented as an SVG
  `<pattern>` referenced by `fill` on a second overlay `<path>` per raise-country,
  or a `mask`/`fill` layer — chosen to keep the base choropleth intact.
- Works identically in raw and residual color modes.
- Countries with other stances are not specially drawn (avoids clutter).
- A new policy data map (`byIsoNum → policy`) is passed to `MapView`; absence of a
  policy record simply means no hatch.

### 6.3 Legend
- When `policyOn`, the `Legend` shows an extra swatch: a hatch sample labeled
  "Pronatalist policy (raising fertility)."

### 6.4 Detail panel
- `DetailPanel` gains a **Policy** section (world scale only) for the selected
  country: the stance in plain language (e.g., "Government policy: raise
  fertility") and the measures present (baby bonus, parental leave, childcare
  subsidy, tax incentives). Missing stance/measures render as "no data" / "—".

### 6.5 About view
- A "Pronatalist policy" section: what the overlay shows, the overlay-not-covariate
  rationale (reverse causality), sources (UN WPP + OECD), and the present-day-only
  + partial-coverage caveats.

## 7. Testing

**Pipeline (pytest)**
- `build_policies` CSV parse: valid rows → records; empty cells → `null`; unknown
  stance strings rejected or coerced to `null` (explicit).
- Emitted `policies.json` shape (iso_num/iso3/stance/measures/notes) and schema.
- Join keys align with the country reference (iso_num present).

**Web (vitest + testing-library)**
- Policy loader maps JSON → typed records; missing measures stay `null`.
- Overlay renders a hatch path only for `raise` countries when `policyOn`, none
  when off.
- The policy toggle is absent at US scale, present at world scale.
- `DetailPanel` shows stance + measures for a country with data, and "no data"
  for one without.
- No policy id appears in the factor list or the regression `factorIds`.

## 8. Deliverables

1. `build_policies.py` + committed `data/policies.csv` + pipeline emit of
   `policies.json` + `policyCoverage` in meta; pipeline tests.
2. Web: policy types + loader; `policyOn` state + world-only toggle; `MapView`
   hatch overlay + legend swatch; `DetailPanel` policy section; About section;
   web tests.
3. Merged to `main`, all tests green, build green.
