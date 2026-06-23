# Unexplained Fertility Explorer — Design Spec

Date: 2026-06-23
Status: Approved design, pre-implementation

## 1. Purpose

An interactive website to explore total fertility rate (TFR) across the world at
multiple geographic scales, with a specific focus on surfacing the part of
fertility that **is not explained** by standard demographic, economic, and
cultural factors. The headline question is not "where is fertility high or low?"
but "where is fertility *surprising* — higher or lower than the known drivers
predict — and why?"

The defining mechanic is an **interactive control-for model**: the user chooses
which factors to account for, and the map recomputes and recolors by the
**residual** (actual minus model-predicted fertility). Red means fertility is
higher than the chosen factors predict; blue means lower; near-neutral means well
explained.

## 2. Audience

Curious public **and** researchers, served by a single layered interface:

- Clear and intuitive by default — plain-language framing, sensible preset factor
  selection, readable legend and tooltips.
- Depth on demand — headline R², per-factor standardized coefficients, per-region
  contribution breakdowns, data provenance, and a methodology page.

## 3. Scope: geographic scales

- **Country-level, global** — the complete, robust core (~200 countries) with the
  full factor set. Always available.
- **Sub-national, where reliable data exists** — the user can drill into:
  - United States (states, and counties where supported) — CDC NCHS + Census ACS
  - European Union (NUTS-2 regions) — Eurostat
  - India (states) — SRS / Census / NFHS
  - ~90 developing countries (sub-national survey regions) — DHS Program
- Sub-national coverage is uneven by design and is always clearly labeled. The
  present-day snapshot is richest; sub-national history is limited.

## 4. Analytical model — the "unexplained fertility" engine

### 4.1 Target variable and transformation

- Target: total fertility rate (TFR), expected births per woman.
- TFR is bounded at 0 and right-skewed (a long tail of high-fertility countries),
  so untransformed OLS risks heteroskedastic, non-normal residuals.
- The **data-prep stage decides the target transform once**, using residual
  diagnostics (QQ plot / Shapiro-Wilk for normality, Breusch-Pagan for
  heteroskedasticity) comparing raw TFR, `log(TFR)`, and a Box-Cox check. The
  chosen transform is fixed for the application.
- If `log(TFR)` wins, residuals are naturally proportional, enabling an intuitive
  reading for the public tier ("fertility ~25% higher than expected"). Residuals
  are back-transformed to TFR units for the map regardless of the chosen target.

### 4.2 Model

- When the user selects a factor set, the app fits a **multiple linear regression
  (OLS)** in the browser: `target ~ selected factors`, with all predictors
  **standardized** (z-scored) so coefficients are comparable and toggling is
  meaningful.
- Per region it computes: model-predicted TFR, and **residual = actual −
  predicted** (the "unexplained" part), back-transformed to TFR units.
- The regression refits live on every factor-selection change (cheap: thousands
  of rows, ~12 predictors).

### 4.3 Map display modes

- **Raw mode** — actual TFR on a sequential color scale (baseline view).
- **Residual mode** (default, the core view) — residual on a diverging scale:
  - Red = fertility higher than predicted ("unexplained surplus")
  - Blue = fertility lower than predicted ("unexplained deficit")
  - Neutral = well explained by the chosen factors

### 4.4 Layered depth

- Headline R² — "these factors explain N% of fertility variation."
- Per-factor standardized coefficients (magnitude + direction).
- Click a region → actual vs. predicted TFR, the residual, and a per-factor
  contribution breakdown (coefficient × that region's standardized value),
  with the leftover unexplained residual highlighted.

### 4.5 Honesty rules

1. **Separate models per scale.** The country map uses a model fit on countries;
   each sub-national layer uses a model fit on its own units. Covariates are not
   comparable across scales, so models are never mixed. Drilling in refits
   against the appropriate unit set.
2. **No silent imputation.** A region missing a selected factor is shown as
   "insufficient data," not guessed. An optional, clearly-flagged advanced toggle
   enables simple imputation for users who want full coverage.

## 5. Factors (covariates)

Default factor set (~12), all toggleable, grouped. All standardized before
modeling.

| Group | Factors |
|---|---|
| Economic | GDP per capita (PPP), income inequality (Gini) |
| Education | Female mean years of schooling, female secondary enrolment |
| Women's work & agency | Female labour-force participation, Gender Inequality Index |
| Health & access | Contraceptive prevalence, child mortality, adolescent birth rate |
| Structure | Urbanisation % |
| Community | Social cohesion / collectivism |
| Possibility | Constructed "Possibility Index" (experimental) |

### 5.1 Community / social cohesion (replaces religiosity)

A measure of community-mindedness rather than religiosity. Operationalized via
the best-coverage available source: Gallup World Poll / World Values Survey
social-support, interpersonal-trust, and civic-participation items, with Hofstede
collectivism (individualism reversed) as a fallback/cross-check. US sub-national:
the Social Capital Project index (state/county).

### 5.2 Possibility Index ("FOMO") — constructed, experimental

No off-the-shelf measure exists; the project constructs a transparent composite
capturing the "sense of possibility" / opportunity cost of children — the
hypothesis being that fertility falls when there is more competing life to be
lived, independent of income. Components (globally consistent, sub-national
capable):

- "Things to do": OpenStreetMap amenity density (bars, cafés, cinemas, theatres,
  restaurants, venues) per capita — the key signal, works at any scale.
- Urban agglomeration / population density.
- Digital exposure: internet + social-media penetration (the literal FOMO
  channel — exposure to others' lives).
- Youth out-migration pull (people leaving low-opportunity areas).

Combined as z-scored components, equal-weight in v1 with a PCA option. Always
labeled experimental; components always inspectable. This is intentionally the
project's most original contribution and a candidate *explainer* of residual
fertility that income alone cannot account for (e.g., high-GDP but low-amenity
rural areas).

### 5.3 "Cost of raising a child" caveat

There is no clean global dataset for child-rearing cost. It is proxied via GDP
per capita, urbanisation, and OECD-only housing/childcare-cost indices where
available. The interface prominently flags that rich cost data exists only for
wealthy countries — itself one of the interesting "unexplained" stories.

## 6. Pronatalist policy — overlay, not covariate

- Source: UN World Population Policies Database (per-country stance — raise /
  maintain / lower / none — plus specific measures: baby bonuses, parental leave,
  childcare subsidies, tax incentives), enriched by the OECD Family Database
  (quantitative spend / leave / childcare) for rich countries.
- Policy is treated as a **toggleable overlay** (outline/hatch on countries with
  active pronatalist policy, details on click), **not** a regression covariate.
  Rationale: policy is typically a *reaction* to low fertility, so as a predictor
  it would show misleading reverse-causality associations. The overlay lets users
  ask the right question — "where are the big unexplained deficits, who is
  intervening, and does it appear to work?"
- An advanced opt-in allows including policy as a covariate, with an explicit
  reverse-causality warning.

## 7. Temporal design — three generational snapshots

Three discrete snapshots roughly one generation (~20 years) apart: **~1982,
~2004, ~now (latest reliable harmonized year, ~2023)**. No continuous time
slider. Each year uses a ±2-year window to fill gaps.

### 7.1 Per-era factor availability

| Factor | ~Now | 2004 | 1982 |
|---|:--:|:--:|:--:|
| TFR (target) | yes | yes | yes |
| GDP per capita, urbanisation | yes | yes | yes |
| Female schooling (Barro-Lee) | yes | yes | yes (1980) |
| Child mortality, adolescent fertility | yes | yes | yes |
| Female labour-force participation | yes | yes | partial |
| Contraceptive prevalence, Gini | yes | partial | sparse |
| Gender Inequality Index | yes | yes | unavailable |
| Community / social cohesion | yes | partial | thin |
| Possibility Index | yes | weak | unavailable |

### 7.2 Handling uneven coverage

- Factors with no reliable data for the selected era are **disabled/greyed with a
  tooltip** explaining why; the model fits on whatever is available and selected.
- The **Possibility Index is a present-day lens**: full strength now, a degraded
  version (density + early internet) for 2004, unavailable in 1982. No historical
  proxies are fabricated.
- A **"lock to common factors" toggle** restricts all three snapshots to the
  factor set present in every era, so cross-time residual comparison is
  apples-to-apples. Off by default (richer per-era insight); on for fair time
  comparison.
- The **pronatalist-policy overlay reaches back** — the UN has tracked population
  policies since 1976 — so policy stances can be compared across all three
  snapshots.
- **Sub-national history is patchier** (US: 1980 census / 2000 census / modern
  ACS; Eurostat thin pre-2000; DHS from mid-1980s). Earlier sub-national coverage
  is limited and labeled.

## 8. Data sources

### 8.1 Country
World Bank Open Data (TFR, GDP per-capita PPP, urbanisation, contraceptive
prevalence, female labour-force participation, mortality, schooling), UN World
Population Prospects (authoritative TFR, age structure, median age), UNDP
(education & gender-inequality indices), Gallup/WVS/Hofstede (social cohesion),
Pew (supplementary), Our World in Data as a harmonized convenience mirror.

### 8.2 Sub-national
US — CDC NCHS + Census ACS; EU — Eurostat (NUTS-2); India — SRS/Census + NFHS;
~90 countries — DHS Program. Geometry: topojson per scale.

### 8.3 Possibility Index inputs
OpenStreetMap (amenity POI extraction + aggregation to units), population/density
grids (e.g., WorldPop/GHSL), ITU/World Bank internet penetration, social-media
penetration estimates, migration data.

## 9. Architecture (Approach A: static site + in-browser regression)

A static single-page app. No runtime backend. An **offline Python data pipeline**
prepares and bundles all data; the **browser** does all modeling and rendering.

### 9.1 Components

- **Data pipeline (Python, offline):** fetch → clean → align → merge → emit
  bundled data + run transform diagnostics. Reproducible scripts, documented
  sources, tested.
- **Regression engine (TypeScript, pure module):** standardize predictors, fit
  OLS (normal equations / QR via a small matrix library), return coefficients,
  fitted values, residuals, R². Independently unit-tested against known results.
- **Color scales module:** ColorBrewer schemes — diverging **RdBu (reversed)** for
  residuals (red = above prediction, blue = below), sequential **YlGnBu** for raw
  TFR. Both colorblind-safe and dark-mode-aware.
- **Map view:** D3-geo choropleth (geoNaturalEarth1) + topojson, with zoom-to-
  sub-national behavior. Hover readout, click-to-inspect.
- **Control panel:** mode toggle (raw/residual), grouped factor toggles,
  Possibility Index (experimental), policy overlay toggle, "lock common factors"
  toggle, advanced options (imputation).
- **Era toggle:** 1982 / 2004 / now, driving per-era factor availability.
- **Detail panel:** selected-region actual vs. predicted, residual, per-factor
  contribution bars, policy note.
- **Scatter view:** Gapminder-style (e.g., residual vs. Possibility Index, or any
  factor vs. TFR), with country labels.
- **Table view:** sortable data table per scale/era.
- **Methodology / About page:** model, transforms, sources, limitations.

### 9.2 Data flow

Pipeline emits per-scale, per-era JSON (region id, name, actual TFR, all factor
values) plus topojson geometries into `public/data/`. The app loads the relevant
bundle, and on any factor/era/scale change the regression engine refits and the
map/scatter/table/detail views recompute from the in-memory result.

### 9.3 Tech stack

- React + TypeScript + Vite.
- D3 (geo, scale, scale-chromatic) + topojson-client for mapping.
- A small matrix library (e.g., ml-matrix) for OLS.
- Vitest for unit/component tests.
- Python (pandas, requests) for the pipeline; pytest for pipeline tests.
- Hosting: static (GitHub Pages / Netlify / Vercel).

### 9.4 Project structure

```
data-pipeline/        Python: fetch/, build/, tests/, README
  fetch/              source-specific downloaders
  build/              clean, merge, transform diagnostics, possibility index
  out/                generated bundles (copied to web app public/data)
src/
  lib/regression/     OLS engine (pure, tested)
  lib/scales/         color scales
  data/               loaders + TypeScript types
  components/         ControlPanel, FactorToggles, ModeToggle, EraToggle,
                      Legend, DetailPanel, MapView, etc.
  views/              MapView, ScatterView, TableView
  pages/              Methodology, About
public/data/          bundled JSON + topojson
docs/superpowers/specs/
```

## 10. Non-goals (YAGNI)

- No continuous year slider (three discrete generational snapshots only).
- No runtime backend / live API (static site; pipeline is offline).
- No fabricated historical data for the Possibility Index.
- No globally-uniform sub-national coverage (data-driven, labeled gaps).
- No advanced spatial / mixed-effects models in v1 (OLS is sufficient for the
  residual framing; revisit only if needed).

## 11. Known limitations (surfaced in the UI)

- "Cost of raising a child" is proxied and rich only for OECD countries.
- The Possibility Index is experimental and present-day-centric.
- Sub-national coverage and history are uneven.
- OLS residuals describe association, not causation; cross-time residuals are
  only comparable under the "lock common factors" option.

## 12. Phasing

1. **Phase 1 — Country core (present snapshot):** pipeline for country factors +
   TFR; OLS engine; raw + residual map; control panel; detail panel; scatter +
   table; methodology page.
2. **Phase 2 — Generations:** add 1982 + 2004 snapshots; per-era availability;
   "lock common factors" toggle.
3. **Phase 3 — Possibility Index:** OSM extraction + composite construction
   pipeline; integrate as a factor (present-day, degraded 2004).
4. **Phase 4 — Sub-national:** US, EU NUTS, India, DHS layers + zoom; per-scale
   models.
5. **Phase 5 — Policy overlay:** UN/OECD policy data; overlay rendering + detail;
   optional covariate mode with warning.

## 13. Testing & verification

- Regression engine validated against reference OLS results (known datasets).
- Color-scale and per-era availability logic unit-tested.
- Pipeline outputs validated (schema, coverage, no silent NaNs).
- Manual verification of map/scatter/table behavior across modes, eras, scales.
