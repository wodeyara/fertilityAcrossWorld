# Web App — Core Interactive Map (Plan 1B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static React app that loads the country data bundle, fits an OLS model in the browser over user-selected factors, and renders a world choropleth that toggles between raw fertility and the "unexplained" residual, with a factor control panel, a colorblind-safe legend, and a click-to-inspect detail panel.

**Architecture:** Vite + React + TypeScript single-page app. A pure, tested TypeScript module does the OLS (standardize predictors → least-squares via `ml-matrix` → residuals/R²/contributions), applying the empirically-chosen TFR transform recorded in `factors.json`. D3-geo + topojson render the choropleth; the data join is on the ISO-3166 numeric code (`iso_num`). All modeling is client-side; no backend. The data bundle (`countries.json`/`factors.json`/`meta.json`, produced by Plan 1A) plus a world TopoJSON are copied into `web/public/data/` and fetched at runtime.

**Tech Stack:** Vite, React 18, TypeScript, D3 (d3-geo, d3-selection, d3-scale, d3-scale-chromatic), topojson-client, ml-matrix, Vitest + @testing-library/react + jsdom.

## Global Constraints

- **No silent imputation.** A country missing any *selected* factor is excluded from the fit and shown as "insufficient data" (rendered neutral/hatched) in residual mode — never imputed.
- **The TFR transform is read from `factors.json` (`target.transform`, `"raw"` or `"log"`), never hard-coded.** Residuals are computed in transform space and shown back-transformed to TFR units (`actual − predicted`, where `predicted = exp(fitted)` when transform is `log`).
- **Predictors are standardized (z-scored) over the fitted (complete-case) countries** before fitting; coefficients are therefore standardized.
- **Colors are colorblind-safe ColorBrewer schemes:** diverging **RdBu reversed** for residuals (red = above prediction, blue = below, neutral = explained), sequential **YlGnBu** for raw TFR. Both must work in light and dark mode.
- **The choropleth↔data join key is `iso_num`** (TopoJSON `world-atlas` feature `id` is the ISO-3166 numeric code). Never join on country name.
- **Node 18+**, dependencies pinned in `web/package.json`. All commands run from `web/` unless stated.
- Data contract (from Plan 1A, do not change): `factors.json` = `{snapshotYear, target:{id,label,transform,unit,source}, factors:[{id,label,group,unit,direction,source}]}`; `countries.json` = `[{iso3, iso_num, name, region, tfr, tfr_year, factors:{<id>:number|null}}]`; `meta.json` = `{snapshotYear, countryCount, withTfr, coverage:{<id>:number}}`.

---

## File Structure

```
web/
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts            # includes Vitest config (test.environment = jsdom)
  index.html
  src/test-setup.ts         # @testing-library/jest-dom matchers
  scripts/copy-data.mjs     # copy bundle + fetch world topojson into public/data
  public/data/              # countries.json, factors.json, meta.json, countries-110m.json
  src/
    main.tsx
    App.tsx                 # state owner: selected factors, mode, selected country
    types.ts                # Bundle/Country/Factor/FitResult types
    data/loadBundle.ts      # fetch + validate the three JSON files
    lib/regression.ts       # OLS engine (pure, tested)
    lib/scales.ts           # residual + raw color scales (pure, tested)
    lib/geo.ts              # topojson feature extraction + iso_num join (pure, tested)
    components/
      MapView.tsx           # D3 choropleth
      ControlPanel.tsx      # grouped factor toggles + mode toggle + R² readout
      Legend.tsx            # discrete swatch legend reflecting mode
      DetailPanel.tsx       # selected-country actual/predicted/residual + contributions
```

Tests are co-located as `*.test.ts(x)` next to each module.

---

### Task 1: Scaffold the web app + data wiring

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/test-setup.ts`, `web/scripts/copy-data.mjs`
- Test: `web/src/App.test.tsx`

**Interfaces:**
- Produces: a runnable Vite app; `npm test` runs Vitest in jsdom; `npm run copy-data` populates `web/public/data/`.

- [ ] **Step 1: Create package.json**

`web/package.json`:
```json
{
  "name": "fertility-explorer-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "copy-data": "node scripts/copy-data.mjs"
  },
  "dependencies": {
    "d3-color": "3.1.0",
    "d3-geo": "3.1.0",
    "d3-scale": "4.0.2",
    "d3-scale-chromatic": "3.1.0",
    "d3-selection": "3.0.0",
    "ml-matrix": "6.11.1",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "topojson-client": "3.1.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.4.6",
    "@testing-library/react": "16.0.0",
    "@types/d3-color": "3.1.3",
    "@types/d3-geo": "3.1.0",
    "@types/d3-scale": "4.0.8",
    "@types/d3-scale-chromatic": "3.0.3",
    "@types/d3-selection": "3.0.10",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "@types/topojson-client": "3.1.4",
    "@vitejs/plugin-react": "4.3.1",
    "jsdom": "24.1.0",
    "typescript": "5.5.3",
    "vite": "5.3.3",
    "vitest": "2.0.2"
  }
}
```

- [ ] **Step 2: Create tsconfig files**

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`web/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Create vite.config.ts (with Vitest config)**

`web/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

`web/src/test-setup.ts`:
```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Create index.html, main.tsx, App.tsx**

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Unexplained fertility explorer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/main.tsx`:
```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`web/src/App.tsx` (placeholder shell — later tasks expand it):
```typescript
export default function App() {
  return <h1>Unexplained fertility explorer</h1>;
}
```

- [ ] **Step 5: Create the data-copy script**

`web/scripts/copy-data.mjs`:
```javascript
import { mkdir, copyFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const bundleDir = join(repoRoot, "data-pipeline", "out");
const outDir = join(here, "..", "public", "data");
const TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

await mkdir(outDir, { recursive: true });

for (const f of ["countries.json", "factors.json", "meta.json"]) {
  await copyFile(join(bundleDir, f), join(outDir, f));
  console.log("copied", f);
}

const topoPath = join(outDir, "countries-110m.json");
try {
  await access(topoPath);
  console.log("countries-110m.json already present");
} catch {
  const res = await fetch(TOPO_URL);
  if (!res.ok) throw new Error(`topojson fetch failed: ${res.status}`);
  await writeFile(topoPath, Buffer.from(await res.arrayBuffer()));
  console.log("downloaded countries-110m.json");
}
```

- [ ] **Step 6: Write the smoke test**

`web/src/App.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the app title", () => {
  render(<App />);
  expect(screen.getByText(/unexplained fertility explorer/i)).toBeInTheDocument();
});
```

- [ ] **Step 7: Install deps, run data-copy, run the smoke test**

Run: `cd web && npm install`
Run: `cd web && npm run copy-data`
Expected: copies 3 JSON files and downloads `countries-110m.json` into `web/public/data/`.
Run: `cd web && npm test`
Expected: 1 test passes.

- [ ] **Step 8: Add web/.gitignore and commit**

`web/.gitignore`:
```
node_modules/
dist/
```
(Note: `public/data/*.json` IS committed — it's the app's data.)

```bash
git add web/package.json web/tsconfig.json web/tsconfig.node.json web/vite.config.ts \
        web/index.html web/src/main.tsx web/src/App.tsx web/src/test-setup.ts \
        web/src/App.test.tsx web/scripts/copy-data.mjs web/.gitignore \
        web/public/data/countries.json web/public/data/factors.json \
        web/public/data/meta.json web/public/data/countries-110m.json
git commit -m "feat(web): scaffold Vite+React+TS app and wire data bundle"
```

---

### Task 2: Types + bundle loader

**Files:**
- Create: `web/src/types.ts`, `web/src/data/loadBundle.ts`
- Test: `web/src/data/loadBundle.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `FactorMeta = { id: string; label: string; group: string; unit: string; direction: "positive"|"negative"|"mixed"; source: string }`; `TargetMeta = { id: string; label: string; transform: "raw"|"log"; unit: string; source: string }`; `Country = { iso3: string; iso_num: number; name: string; region: string; tfr: number | null; tfr_year: number | null; factors: Record<string, number | null> }`; `Bundle = { snapshotYear: number; target: TargetMeta; factors: FactorMeta[]; countries: Country[]; coverage: Record<string, number> }`.
  - `loadBundle(baseUrl = "/data"): Promise<Bundle>` — fetches `factors.json`, `countries.json`, `meta.json`, throws if any factor id in `countries[].factors` is absent from `factors[]`, and returns a combined `Bundle`.

- [ ] **Step 1: Write the failing test**

`web/src/data/loadBundle.test.ts`:
```typescript
import { loadBundle } from "./loadBundle";

const FACTORS = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "Total fertility rate", transform: "log", unit: "births per woman", source: "WB" },
  factors: [{ id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB" }],
};
const COUNTRIES = [
  { iso3: "USA", iso_num: 840, name: "United States", region: "North America", tfr: 1.66, tfr_year: 2022, factors: { gdp_pc: 63000 } },
  { iso3: "NER", iso_num: 562, name: "Niger", region: "Sub-Saharan Africa", tfr: 6.8, tfr_year: 2021, factors: { gdp_pc: null } },
];
const META = { snapshotYear: 2023, countryCount: 2, withTfr: 2, coverage: { gdp_pc: 1 } };

function mockFetch(map: Record<string, unknown>) {
  return (url: string) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(map[url.split("/").pop()!]) } as Response);
}

test("combines the three files into a Bundle", async () => {
  vi.stubGlobal("fetch", mockFetch({ "factors.json": FACTORS, "countries.json": COUNTRIES, "meta.json": META }));
  const bundle = await loadBundle("/data");
  expect(bundle.snapshotYear).toBe(2023);
  expect(bundle.target.transform).toBe("log");
  expect(bundle.factors).toHaveLength(1);
  expect(bundle.countries[0].iso_num).toBe(840);
  expect(bundle.coverage.gdp_pc).toBe(1);
});

test("throws if a country factor id is unknown to factors.json", async () => {
  const badCountries = [{ ...COUNTRIES[0], factors: { gdp_pc: 1, mystery: 2 } }];
  vi.stubGlobal("fetch", mockFetch({ "factors.json": FACTORS, "countries.json": badCountries, "meta.json": META }));
  await expect(loadBundle("/data")).rejects.toThrow(/unknown factor/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- loadBundle`
Expected: FAIL (module not found).

- [ ] **Step 3: Write types.ts and loadBundle.ts**

`web/src/types.ts`:
```typescript
export type Direction = "positive" | "negative" | "mixed";

export interface FactorMeta {
  id: string;
  label: string;
  group: string;
  unit: string;
  direction: Direction;
  source: string;
}

export interface TargetMeta {
  id: string;
  label: string;
  transform: "raw" | "log";
  unit: string;
  source: string;
}

export interface Country {
  iso3: string;
  iso_num: number;
  name: string;
  region: string;
  tfr: number | null;
  tfr_year: number | null;
  factors: Record<string, number | null>;
}

export interface Bundle {
  snapshotYear: number;
  target: TargetMeta;
  factors: FactorMeta[];
  countries: Country[];
  coverage: Record<string, number>;
}
```

`web/src/data/loadBundle.ts`:
```typescript
import type { Bundle, Country, FactorMeta, TargetMeta } from "../types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  return (await res.json()) as T;
}

export async function loadBundle(baseUrl = "/data"): Promise<Bundle> {
  const [factorsDoc, countries, meta] = await Promise.all([
    getJson<{ snapshotYear: number; target: TargetMeta; factors: FactorMeta[] }>(`${baseUrl}/factors.json`),
    getJson<Country[]>(`${baseUrl}/countries.json`),
    getJson<{ snapshotYear: number; countryCount: number; withTfr: number; coverage: Record<string, number> }>(
      `${baseUrl}/meta.json`,
    ),
  ]);

  const known = new Set(factorsDoc.factors.map((f) => f.id));
  for (const c of countries) {
    for (const id of Object.keys(c.factors)) {
      if (!known.has(id)) throw new Error(`unknown factor id in countries.json: ${id}`);
    }
  }

  return {
    snapshotYear: factorsDoc.snapshotYear,
    target: factorsDoc.target,
    factors: factorsDoc.factors,
    countries,
    coverage: meta.coverage,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- loadBundle`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/types.ts web/src/data/loadBundle.ts web/src/data/loadBundle.test.ts
git commit -m "feat(web): bundle types and loader with factor-id validation"
```

---

### Task 3: OLS regression engine

**Files:**
- Create: `web/src/lib/regression.ts`
- Test: `web/src/lib/regression.test.ts`

**Interfaces:**
- Consumes: `Country` (Task 2).
- Produces:
  - `CountryFit = { predictedTfr: number; residualTfr: number; contributions: Record<string, number> }`
  - `FitResult = { factorIds: string[]; transform: "raw" | "log"; n: number; r2: number | null; intercept: number; coefficients: Record<string, number>; fits: Map<string, CountryFit> }` (keys of `fits` are iso3; only complete-case countries appear)
  - `fitModel(countries: Country[], factorIds: string[], transform: "raw" | "log"): FitResult`
  - Behavior: complete-case only (drop countries with null `tfr`, `tfr<=0`, or null on any selected factor); standardize each factor over complete cases; least-squares via `ml-matrix` `solve(X, y, true)` with an intercept column; `r2 = 1 - SSres/SStot`; `predictedTfr = transform==="log" ? exp(fitted) : fitted`; `residualTfr = actualTfr - predictedTfr`; `contributions[f] = coef[f] * z_f` (transform space). If `factorIds` is empty, or `complete.length < factorIds.length + 2`, return `{r2: null, n, ... , fits: empty}` (insufficient data).

- [ ] **Step 1: Write the failing test**

`web/src/lib/regression.test.ts`:
```typescript
import { fitModel } from "./regression";
import type { Country } from "../types";

function country(iso3: string, iso_num: number, tfr: number | null, x: number | null): Country {
  return { iso3, iso_num, name: iso3, region: "R", tfr, tfr_year: 2022, factors: { x } };
}

test("recovers a clean log-linear relationship (r2 ~ 1, residual ~ 0)", () => {
  // tfr = exp(0.6 + 0.4 * x), x = 0..19
  const countries: Country[] = [];
  for (let i = 0; i < 20; i++) {
    const x = i;
    countries.push(country(`C${i}`, i, Math.exp(0.6 + 0.4 * x), x));
  }
  const fit = fitModel(countries, ["x"], "log");
  expect(fit.n).toBe(20);
  expect(fit.r2).toBeGreaterThan(0.999);
  // residuals in TFR units are tiny relative to the values
  for (const [, f] of fit.fits) expect(Math.abs(f.residualTfr)).toBeLessThan(0.01 * f.predictedTfr + 0.01);
});

test("excludes countries missing the selected factor or tfr (no imputation)", () => {
  const countries = [
    country("A", 1, 2.0, 1),
    country("B", 2, null, 1), // no tfr
    country("C", 3, 3.0, null), // no factor
    country("D", 4, 4.0, 2),
    country("E", 5, 2.5, 1.5),
  ];
  const fit = fitModel(countries, ["x"], "raw");
  expect(fit.n).toBe(3); // A, D, E
  expect(fit.fits.has("B")).toBe(false);
  expect(fit.fits.has("C")).toBe(false);
});

test("returns r2=null when there are too few complete cases", () => {
  const fit = fitModel([country("A", 1, 2.0, 1)], ["x"], "raw");
  expect(fit.r2).toBeNull();
  expect(fit.fits.size).toBe(0);
});

test("returns r2=null when no factors are selected", () => {
  const fit = fitModel([country("A", 1, 2.0, 1), country("B", 2, 3.0, 2)], [], "raw");
  expect(fit.r2).toBeNull();
  expect(fit.fits.size).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- regression`
Expected: FAIL (module not found).

- [ ] **Step 3: Write regression.ts**

`web/src/lib/regression.ts`:
```typescript
import { Matrix, solve } from "ml-matrix";
import type { Country } from "../types";

export interface CountryFit {
  predictedTfr: number;
  residualTfr: number;
  contributions: Record<string, number>;
}

export interface FitResult {
  factorIds: string[];
  transform: "raw" | "log";
  n: number;
  r2: number | null;
  intercept: number;
  coefficients: Record<string, number>;
  fits: Map<string, CountryFit>;
}

function empty(factorIds: string[], transform: "raw" | "log", n: number): FitResult {
  return { factorIds, transform, n, r2: null, intercept: NaN, coefficients: {}, fits: new Map() };
}

export function fitModel(
  countries: Country[],
  factorIds: string[],
  transform: "raw" | "log",
): FitResult {
  const complete = countries.filter(
    (c) =>
      c.tfr != null &&
      c.tfr > 0 &&
      factorIds.every((f) => c.factors[f] != null),
  );
  const n = complete.length;
  // Zero selected factors => nothing to "control for" => insufficient (prompt the user).
  if (factorIds.length === 0 || n < factorIds.length + 2) return empty(factorIds, transform, n);

  // standardize each factor over complete cases
  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};
  for (const f of factorIds) {
    const vals = complete.map((c) => c.factors[f] as number);
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    means[f] = mean;
    stds[f] = variance === 0 ? 1 : Math.sqrt(variance);
  }

  const z = (c: Country, f: string) => ((c.factors[f] as number) - means[f]) / stds[f];

  const y = complete.map((c) => (transform === "log" ? Math.log(c.tfr as number) : (c.tfr as number)));
  const X = complete.map((c) => [1, ...factorIds.map((f) => z(c, f))]);

  const beta = solve(new Matrix(X), Matrix.columnVector(y), true).to1DArray();
  const intercept = beta[0];
  const coefficients: Record<string, number> = {};
  factorIds.forEach((f, j) => (coefficients[f] = beta[j + 1]));

  // R^2 in transform space
  const fittedT = X.map((row) => row.reduce((s, v, j) => s + v * beta[j], 0));
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const ssRes = y.reduce((s, yi, i) => s + (yi - fittedT[i]) ** 2, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const r2 = ssTot === 0 ? null : 1 - ssRes / ssTot;

  const fits = new Map<string, CountryFit>();
  complete.forEach((c, i) => {
    const predictedTfr = transform === "log" ? Math.exp(fittedT[i]) : fittedT[i];
    const contributions: Record<string, number> = {};
    for (const f of factorIds) contributions[f] = coefficients[f] * z(c, f);
    fits.set(c.iso3, {
      predictedTfr,
      residualTfr: (c.tfr as number) - predictedTfr,
      contributions,
    });
  });

  return { factorIds, transform, n, r2, intercept, coefficients, fits };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- regression`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/regression.ts web/src/lib/regression.test.ts
git commit -m "feat(web): in-browser OLS regression engine with residuals and R2"
```

---

### Task 4: Color scales

**Files:**
- Create: `web/src/lib/scales.ts`
- Test: `web/src/lib/scales.test.ts`

**Interfaces:**
- Produces:
  - `residualColor(residual: number, maxAbs: number, dark: boolean): string` — diverging RdBu reversed; clamps to `[-maxAbs, maxAbs]`; red for positive (above prediction), blue for negative; neutral at 0.
  - `rawColor(tfr: number, dark: boolean): string` — sequential YlGnBu over domain `[0.8, 7]` (clamped).
  - `INSUFFICIENT_COLOR(dark: boolean): string` — neutral grey for no-data/insufficient countries.
  - `residualLegendStops()` / `rawLegendStops()` — arrays of `{value, color}` for the Legend (computed with `dark=false`; the Legend re-derives per mode).

- [ ] **Step 1: Write the failing test**

`web/src/lib/scales.test.ts`:
```typescript
import { residualColor, rawColor, residualLegendStops, rawLegendStops } from "./scales";

test("residual: positive is reddish, negative is bluish, differ", () => {
  const pos = residualColor(1.0, 1.5, false);
  const neg = residualColor(-1.0, 1.5, false);
  expect(pos).not.toBe(neg);
  // red channel higher for positive residual than negative
  const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
  expect(red(pos)).toBeGreaterThan(red(neg));
});

test("residual clamps beyond maxAbs", () => {
  expect(residualColor(5, 1.5, false)).toBe(residualColor(1.5, 1.5, false));
});

test("raw color is a valid hex over the domain", () => {
  expect(rawColor(0.8, false)).toMatch(/^#[0-9a-f]{6}$/i);
  expect(rawColor(7, false)).toMatch(/^#[0-9a-f]{6}$/i);
});

test("legend stops are non-empty and ordered", () => {
  expect(residualLegendStops().length).toBeGreaterThanOrEqual(5);
  expect(rawLegendStops().length).toBeGreaterThanOrEqual(5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- scales`
Expected: FAIL (module not found).

- [ ] **Step 3: Write scales.ts**

`web/src/lib/scales.ts`:
```typescript
import { scaleSequential, scaleDiverging } from "d3-scale";
import { interpolateRdBu, interpolateYlGnBu } from "d3-scale-chromatic";
import { rgb } from "d3-color";

const toHex = (c: string) => rgb(c).formatHex();

// RdBu reversed: positive residual -> red (interpolateRdBu(0)), negative -> blue (interpolateRdBu(1)).
export function residualColor(residual: number, maxAbs: number, dark: boolean): string {
  if (dark && Math.abs(residual) < maxAbs * 0.08) return "#4a4c50"; // neutral grey center in dark mode
  const s = scaleDiverging<string>((t) => interpolateRdBu(1 - t)).domain([-maxAbs, 0, maxAbs]).clamp(true);
  return toHex(s(residual));
}

export function rawColor(tfr: number, _dark: boolean): string {
  const s = scaleSequential<string>(interpolateYlGnBu).domain([0.8, 7]).clamp(true);
  return toHex(s(tfr));
}

export function INSUFFICIENT_COLOR(dark: boolean): string {
  return dark ? "#2c2e31" : "#e4e7ea";
}

export function residualLegendStops(): { value: number; color: string }[] {
  const maxAbs = 1.5;
  return [-1.5, -0.9, -0.3, 0, 0.3, 0.9, 1.5].map((value) => ({
    value,
    color: residualColor(value, maxAbs, false),
  }));
}

export function rawLegendStops(): { value: number; color: string }[] {
  return [1, 1.8, 2.5, 3.3, 4.5, 6, 7].map((value) => ({ value, color: rawColor(value, false) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- scales`
Expected: 4 tests pass. Also confirm there are no `noUnusedLocals`/type errors (every symbol in `scales.ts` is exported and used), so the later `npm run build` will pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/scales.ts web/src/lib/scales.test.ts
git commit -m "feat(web): colorblind-safe residual (RdBu) and raw (YlGnBu) scales"
```

---

### Task 5: Geo join helpers + Map component

**Files:**
- Create: `web/src/lib/geo.ts`, `web/src/components/MapView.tsx`
- Test: `web/src/lib/geo.test.ts`, `web/src/components/MapView.test.tsx`

**Interfaces:**
- Consumes: `Country` (Task 2), `FitResult` (Task 3), scales (Task 4).
- Produces:
  - `geo.ts`: `featuresFromTopo(topo: unknown): GeoFeature[]` (returns `topojson.feature(topo, topo.objects.countries).features`, typed loosely as `{ id: string; properties: { name?: string } }[]`); `indexByIsoNum(countries: Country[]): Map<number, Country>`.
  - `MapView.tsx`: `MapView({ topo, byIsoNum, fit, mode, selectedIso3, onSelect, dark }: MapViewProps)` — renders an SVG choropleth. In `mode==="raw"`, fills by `rawColor(country.tfr)`; in `mode==="residual"`, fills by `residualColor(fit.fits.get(iso3).residualTfr, maxAbs)` or `INSUFFICIENT_COLOR` when the country has no fit. `maxAbs` is the 95th-percentile abs residual (min 0.5). Clicking a country calls `onSelect(iso3)`. Uses `geoNaturalEarth1` fitted to the features (Antarctica filtered out).

- [ ] **Step 1: Write the failing test for geo.ts**

`web/src/lib/geo.test.ts`:
```typescript
import { indexByIsoNum } from "./geo";
import type { Country } from "../types";

test("indexes countries by numeric iso code", () => {
  const countries = [
    { iso3: "USA", iso_num: 840, name: "US", region: "R", tfr: 1.6, tfr_year: 2022, factors: {} },
    { iso3: "NER", iso_num: 562, name: "Niger", region: "R", tfr: 6.8, tfr_year: 2021, factors: {} },
  ] as Country[];
  const idx = indexByIsoNum(countries);
  expect(idx.get(840)?.iso3).toBe("USA");
  expect(idx.get(562)?.iso3).toBe("NER");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd web && npm test -- geo`
Expected: FAIL (module not found).

- [ ] **Step 3: Write geo.ts**

`web/src/lib/geo.ts`:
```typescript
import { feature } from "topojson-client";
import type { Country } from "../types";

export interface GeoFeature {
  id: string;
  properties: { name?: string };
  // geometry passed through to d3.geoPath
  [k: string]: unknown;
}

export function featuresFromTopo(topo: any): GeoFeature[] {
  const fc = feature(topo, topo.objects.countries) as unknown as { features: GeoFeature[] };
  return fc.features.filter((f) => f.properties?.name !== "Antarctica");
}

export function indexByIsoNum(countries: Country[]): Map<number, Country> {
  const m = new Map<number, Country>();
  for (const c of countries) m.set(c.iso_num, c);
  return m;
}
```

- [ ] **Step 4: Write the failing test for MapView**

`web/src/components/MapView.test.tsx`:
```typescript
import { render } from "@testing-library/react";
import { MapView } from "./MapView";
import type { Country } from "../types";
import type { FitResult } from "../lib/regression";

// Minimal fake topo with two square "countries" keyed by numeric id.
const topo = {
  type: "Topology",
  arcs: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
  objects: {
    countries: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", id: "840", arcs: [[0]], properties: { name: "United States of America" } },
        { type: "Polygon", id: "562", arcs: [[0]], properties: { name: "Niger" } },
      ],
    },
  },
};

const countries = [
  { iso3: "USA", iso_num: 840, name: "US", region: "R", tfr: 1.6, tfr_year: 2022, factors: {} },
  { iso3: "NER", iso_num: 562, name: "Niger", region: "R", tfr: 6.8, tfr_year: 2021, factors: {} },
] as Country[];
const byIsoNum = new Map(countries.map((c) => [c.iso_num, c]));
const fit: FitResult = {
  factorIds: ["x"], transform: "log", n: 2, r2: 0.9, intercept: 0, coefficients: { x: 1 },
  fits: new Map([["USA", { predictedTfr: 1.4, residualTfr: 0.2, contributions: { x: 0.1 } }]]),
};

test("renders one path per non-Antarctica country", () => {
  const { container } = render(
    <MapView topo={topo} byIsoNum={byIsoNum} fit={fit} mode="residual" selectedIso3={null} onSelect={() => {}} dark={false} />,
  );
  expect(container.querySelectorAll("path").length).toBe(2);
});
```

- [ ] **Step 5: Run, verify fail**

Run: `cd web && npm test -- MapView`
Expected: FAIL (module not found).

- [ ] **Step 6: Write MapView.tsx**

`web/src/components/MapView.tsx`:
```typescript
import { useMemo } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { featuresFromTopo } from "../lib/geo";
import { rawColor, residualColor, INSUFFICIENT_COLOR } from "../lib/scales";
import type { Country } from "../types";
import type { FitResult } from "../lib/regression";

export interface MapViewProps {
  topo: unknown;
  byIsoNum: Map<number, Country>;
  fit: FitResult;
  mode: "raw" | "residual";
  selectedIso3: string | null;
  onSelect: (iso3: string) => void;
  dark: boolean;
}

const W = 880;
const H = 440;

function maxAbsResidual(fit: FitResult): number {
  const abs = [...fit.fits.values()].map((f) => Math.abs(f.residualTfr)).sort((a, b) => a - b);
  if (abs.length === 0) return 1.5;
  const p95 = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.95))];
  return Math.max(0.5, p95);
}

export function MapView(props: MapViewProps) {
  const { topo, byIsoNum, fit, mode, selectedIso3, onSelect, dark } = props;
  const features = useMemo(() => featuresFromTopo(topo), [topo]);
  const path = useMemo(() => {
    const projection = geoNaturalEarth1().fitSize([W, H], { type: "FeatureCollection", features } as any);
    return geoPath(projection);
  }, [features]);
  const maxAbs = useMemo(() => maxAbsResidual(fit), [fit]);

  const fillFor = (isoNum: number): string => {
    const c = byIsoNum.get(isoNum);
    if (!c) return INSUFFICIENT_COLOR(dark);
    if (mode === "raw") return c.tfr == null ? INSUFFICIENT_COLOR(dark) : rawColor(c.tfr, dark);
    const f = fit.fits.get(c.iso3);
    return f ? residualColor(f.residualTfr, maxAbs, dark) : INSUFFICIENT_COLOR(dark);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="World choropleth of fertility">
      {features.map((feat) => {
        const isoNum = Number(feat.id);
        const c = byIsoNum.get(isoNum);
        const selected = c != null && c.iso3 === selectedIso3;
        return (
          <path
            key={feat.id}
            d={path(feat as any) ?? undefined}
            fill={fillFor(isoNum)}
            stroke={selected ? (dark ? "#fff" : "#111") : dark ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.85)"}
            strokeWidth={selected ? 1.4 : 0.4}
            style={{ cursor: c ? "pointer" : "default" }}
            onClick={() => c && onSelect(c.iso3)}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 7: Run both tests, verify pass**

Run: `cd web && npm test -- geo MapView`
Expected: geo (1) + MapView (1) pass.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/geo.ts web/src/lib/geo.test.ts web/src/components/MapView.tsx web/src/components/MapView.test.tsx
git commit -m "feat(web): choropleth map with iso_num join and raw/residual fills"
```

---

### Task 6: Control panel (factor toggles + mode toggle)

**Files:**
- Create: `web/src/components/ControlPanel.tsx`
- Test: `web/src/components/ControlPanel.test.tsx`

**Interfaces:**
- Consumes: `FactorMeta` (Task 2).
- Produces:
  - `ControlPanel({ factors, selected, onToggleFactor, mode, onSetMode, r2, n }: ControlPanelProps)` — groups factor checkboxes by `factor.group`; each toggle calls `onToggleFactor(id)`; a segmented Raw/Residual control calls `onSetMode`; shows the R² readout (`r2==null ? "—" : Math.round(r2*100)+"%"`) and the fitted-country count `n`.

- [ ] **Step 1: Write the failing test**

`web/src/components/ControlPanel.test.tsx`:
```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlPanel } from "./ControlPanel";
import type { FactorMeta } from "../types";

const factors: FactorMeta[] = [
  { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB" },
  { id: "urbanisation", label: "Urbanisation", group: "Structure", unit: "%", direction: "negative", source: "WB" },
];

test("renders grouped factors and reports toggles", () => {
  const onToggle = vi.fn();
  render(
    <ControlPanel factors={factors} selected={new Set(["gdp_pc"])} onToggleFactor={onToggle}
      mode="residual" onSetMode={() => {}} r2={0.71} n={150} />,
  );
  expect(screen.getByText("Economic")).toBeInTheDocument();
  expect(screen.getByText("71%")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Urbanisation"));
  expect(onToggle).toHaveBeenCalledWith("urbanisation");
});

test("shows em dash when r2 is null", () => {
  render(
    <ControlPanel factors={factors} selected={new Set()} onToggleFactor={() => {}}
      mode="raw" onSetMode={() => {}} r2={null} n={0} />,
  );
  expect(screen.getByTestId("r2-readout")).toHaveTextContent("—");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd web && npm test -- ControlPanel`
Expected: FAIL (module not found).

- [ ] **Step 3: Write ControlPanel.tsx**

`web/src/components/ControlPanel.tsx`:
```typescript
import type { FactorMeta } from "../types";

export interface ControlPanelProps {
  factors: FactorMeta[];
  selected: Set<string>;
  onToggleFactor: (id: string) => void;
  mode: "raw" | "residual";
  onSetMode: (mode: "raw" | "residual") => void;
  r2: number | null;
  n: number;
}

export function ControlPanel(props: ControlPanelProps) {
  const { factors, selected, onToggleFactor, mode, onSetMode, r2, n } = props;
  const groups = [...new Set(factors.map((f) => f.group))];

  return (
    <aside style={{ width: 230, fontSize: 13 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        <button aria-pressed={mode === "residual"} onClick={() => onSetMode("residual")}>Unexplained</button>
        <button aria-pressed={mode === "raw"} onClick={() => onSetMode("raw")}>Raw fertility</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <span>explains </span>
        <strong data-testid="r2-readout">{r2 == null ? "—" : `${Math.round(r2 * 100)}%`}</strong>
        <span> of variation ({n} countries)</span>
      </div>
      <strong>Control for…</strong>
      {groups.map((group) => (
        <fieldset key={group} style={{ border: "none", padding: 0, margin: "8px 0" }}>
          <legend style={{ textTransform: "uppercase", fontSize: 11, opacity: 0.7 }}>{group}</legend>
          {factors.filter((f) => f.group === group).map((f) => (
            <label key={f.id} style={{ display: "block" }}>
              <input
                type="checkbox"
                aria-label={f.label}
                checked={selected.has(f.id)}
                onChange={() => onToggleFactor(f.id)}
              />{" "}
              {f.label}
            </label>
          ))}
        </fieldset>
      ))}
    </aside>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd web && npm test -- ControlPanel`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ControlPanel.tsx web/src/components/ControlPanel.test.tsx
git commit -m "feat(web): control panel with grouped factor toggles and mode switch"
```

---

### Task 7: Legend + Detail panel

**Files:**
- Create: `web/src/components/Legend.tsx`, `web/src/components/DetailPanel.tsx`
- Test: `web/src/components/Legend.test.tsx`, `web/src/components/DetailPanel.test.tsx`

**Interfaces:**
- Consumes: scales (Task 4), `Country`/`FactorMeta` (Task 2), `FitResult` (Task 3).
- Produces:
  - `Legend({ mode }: { mode: "raw"|"residual" })` — renders the discrete swatches from `residualLegendStops()`/`rawLegendStops()` with end labels ("lower than expected"/"higher than expected" or "0.8"/"7+").
  - `DetailPanel({ country, fit, factors }: DetailPanelProps)` — when `country` is null shows a hint; otherwise shows name, actual TFR, predicted TFR (`fit.fits.get(iso3)`), the residual with a "% higher/lower than predicted" line, and per-factor contribution rows. If the country has no fit (insufficient data) shows that message.

- [ ] **Step 1: Write the failing tests**

`web/src/components/Legend.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { Legend } from "./Legend";

test("residual legend shows directional labels", () => {
  render(<Legend mode="residual" />);
  expect(screen.getByText(/lower than expected/i)).toBeInTheDocument();
  expect(screen.getByText(/higher than expected/i)).toBeInTheDocument();
});

test("raw legend shows numeric bounds", () => {
  render(<Legend mode="raw" />);
  expect(screen.getByText("7+")).toBeInTheDocument();
});
```

`web/src/components/DetailPanel.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { DetailPanel } from "./DetailPanel";
import type { Country, FactorMeta } from "../types";
import type { FitResult } from "../lib/regression";

const factors: FactorMeta[] = [
  { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB" },
];
const israel: Country = {
  iso3: "ISR", iso_num: 376, name: "Israel", region: "MENA", tfr: 2.9, tfr_year: 2022, factors: { gdp_pc: 47000 },
};
const fit: FitResult = {
  factorIds: ["gdp_pc"], transform: "log", n: 100, r2: 0.7, intercept: 0, coefficients: { gdp_pc: -0.5 },
  fits: new Map([["ISR", { predictedTfr: 1.7, residualTfr: 1.2, contributions: { gdp_pc: -0.4 } }]]),
};

test("shows actual vs predicted and the residual", () => {
  render(<DetailPanel country={israel} fit={fit} factors={factors} />);
  expect(screen.getByText("Israel")).toBeInTheDocument();
  expect(screen.getByText(/2\.9/)).toBeInTheDocument(); // actual
  expect(screen.getByText(/1\.7/)).toBeInTheDocument(); // predicted
  expect(screen.getByText(/higher than predicted/i)).toBeInTheDocument();
});

test("shows insufficient-data message when no fit", () => {
  const noFit: FitResult = { ...fit, fits: new Map() };
  render(<DetailPanel country={israel} fit={noFit} factors={factors} />);
  expect(screen.getByText(/insufficient data/i)).toBeInTheDocument();
});

test("prompts when nothing selected", () => {
  render(<DetailPanel country={null} fit={fit} factors={factors} />);
  expect(screen.getByText(/click a country/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd web && npm test -- Legend DetailPanel`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write Legend.tsx**

`web/src/components/Legend.tsx`:
```typescript
import { residualLegendStops, rawLegendStops } from "../lib/scales";

export function Legend({ mode }: { mode: "raw" | "residual" }) {
  const stops = mode === "residual" ? residualLegendStops() : rawLegendStops();
  const left = mode === "residual" ? "lower than expected" : "0.8";
  const right = mode === "residual" ? "higher than expected" : "7+";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 6 }}>
      <span>{left}</span>
      <div style={{ display: "flex", flex: 1, borderRadius: 3, overflow: "hidden" }}>
        {stops.map((s) => (
          <div key={s.value} style={{ flex: 1, height: 12, background: s.color }} />
        ))}
      </div>
      <span>{right}</span>
    </div>
  );
}
```

- [ ] **Step 4: Write DetailPanel.tsx**

`web/src/components/DetailPanel.tsx`:
```typescript
import type { Country, FactorMeta } from "../types";
import type { FitResult } from "../lib/regression";

export interface DetailPanelProps {
  country: Country | null;
  fit: FitResult;
  factors: FactorMeta[];
}

export function DetailPanel({ country, fit, factors }: DetailPanelProps) {
  if (!country) return <div style={{ fontSize: 13 }}>Click a country to inspect it.</div>;
  const cf = fit.fits.get(country.iso3);
  if (!cf) {
    return (
      <div style={{ fontSize: 13 }}>
        <strong>{country.name}</strong>
        <div>Insufficient data for the selected factors.</div>
      </div>
    );
  }
  const pct = cf.predictedTfr > 0 ? Math.round((cf.residualTfr / cf.predictedTfr) * 100) : 0;
  const dir = cf.residualTfr >= 0 ? "higher than predicted" : "lower than predicted";
  const label = (id: string) => factors.find((f) => f.id === id)?.label ?? id;

  return (
    <div style={{ fontSize: 13 }}>
      <strong>{country.name}</strong> <span style={{ opacity: 0.6 }}>{country.region}</span>
      <div style={{ display: "flex", gap: 12, margin: "8px 0" }}>
        <div>Actual TFR<br /><strong>{country.tfr?.toFixed(2)}</strong></div>
        <div>Model predicts<br /><strong>{cf.predictedTfr.toFixed(2)}</strong></div>
      </div>
      <div>
        {cf.residualTfr >= 0 ? "+" : ""}{cf.residualTfr.toFixed(2)} · ~{Math.abs(pct)}% {dir}
      </div>
      <div style={{ marginTop: 8, opacity: 0.7, fontSize: 11 }}>factor contributions (transform space)</div>
      {fit.factorIds.map((id) => (
        <div key={id} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{label(id)}</span>
          <span>{cf.contributions[id] >= 0 ? "+" : ""}{cf.contributions[id].toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `cd web && npm test -- Legend DetailPanel`
Expected: Legend (2) + DetailPanel (3) pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Legend.tsx web/src/components/Legend.test.tsx \
        web/src/components/DetailPanel.tsx web/src/components/DetailPanel.test.tsx
git commit -m "feat(web): legend and detail panel"
```

---

### Task 8: App integration (wire it all together)

**Files:**
- Modify: `web/src/App.tsx`
- Test: `web/src/App.integration.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `App` owns state (`selected: Set<string>` of factor ids — default to the well-covered economic/education/health set; `mode`; `selectedIso3`), loads the bundle on mount, recomputes `fitModel` with `useMemo` whenever `selected`/`mode` change, and renders `ControlPanel` + `MapView` + `Legend` + `DetailPanel`. The topo is loaded from `/data/countries-110m.json`.

- [ ] **Step 1: Write the failing integration test**

`web/src/App.integration.test.tsx`:
```typescript
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

const FACTORS = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "Total fertility rate", transform: "log", unit: "births", source: "WB" },
  factors: [{ id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB" }],
};
const COUNTRIES = Array.from({ length: 10 }, (_, i) => ({
  iso3: `C${i}`, iso_num: 900 + i, name: `Country ${i}`, region: "R",
  tfr: Math.exp(0.6 + 0.4 * i), tfr_year: 2022, factors: { gdp_pc: i },
}));
const META = { snapshotYear: 2023, countryCount: 10, withTfr: 10, coverage: { gdp_pc: 10 } };
const TOPO = { type: "Topology", arcs: [[[0, 0], [0, 1], [1, 1], [0, 0]]], objects: { countries: { type: "GeometryCollection", geometries: [] } } };

function mockFetch(map: Record<string, unknown>) {
  return (url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve(map[url.split("/").pop()!]) } as Response);
}

test("loads bundle, fits a model, and shows an R² readout", async () => {
  vi.stubGlobal("fetch", mockFetch({
    "factors.json": FACTORS, "countries.json": COUNTRIES, "meta.json": META, "countries-110m.json": TOPO,
  }));
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("r2-readout")).toBeInTheDocument());
  // gdp_pc selected by default -> a model is fit -> R² is a percentage, not em dash
  expect(screen.getByTestId("r2-readout").textContent).toMatch(/%/);
});

test("toggling the only factor off drops the model to insufficient", async () => {
  vi.stubGlobal("fetch", mockFetch({
    "factors.json": FACTORS, "countries.json": COUNTRIES, "meta.json": META, "countries-110m.json": TOPO,
  }));
  render(<App />);
  await waitFor(() => expect(screen.getByLabelText("GDP per capita")).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText("GDP per capita")); // deselect
  await waitFor(() => expect(screen.getByTestId("r2-readout")).toHaveTextContent("—"));
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd web && npm test -- App.integration`
Expected: FAIL (App is still the placeholder).

- [ ] **Step 3: Rewrite App.tsx**

`web/src/App.tsx`:
```typescript
import { useEffect, useMemo, useState } from "react";
import { loadBundle } from "./data/loadBundle";
import { fitModel } from "./lib/regression";
import { ControlPanel } from "./components/ControlPanel";
import { MapView } from "./components/MapView";
import { Legend } from "./components/Legend";
import { DetailPanel } from "./components/DetailPanel";
import type { Bundle, Country } from "./types";

const DEFAULT_FACTORS = ["gdp_pc", "fem_sec_enroll", "flfp", "child_mortality", "urbanisation"];

export default function App() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [topo, setTopo] = useState<unknown | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_FACTORS));
  const [mode, setMode] = useState<"raw" | "residual">("residual");
  const [selectedIso3, setSelectedIso3] = useState<string | null>(null);

  useEffect(() => {
    loadBundle("/data").then(setBundle);
    fetch("/data/countries-110m.json").then((r) => r.json()).then(setTopo);
  }, []);

  const dark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  const factorIds = useMemo(
    () => (bundle ? bundle.factors.filter((f) => selected.has(f.id)).map((f) => f.id) : []),
    [bundle, selected],
  );
  const fit = useMemo(
    () => (bundle ? fitModel(bundle.countries, factorIds, bundle.target.transform) : null),
    [bundle, factorIds],
  );
  const byIsoNum = useMemo(() => {
    const m = new Map<number, Country>();
    bundle?.countries.forEach((c) => m.set(c.iso_num, c));
    return m;
  }, [bundle]);

  if (!bundle || !fit) return <div>Loading…</div>;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedCountry = selectedIso3 ? bundle.countries.find((c) => c.iso3 === selectedIso3) ?? null : null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>Where fertility defies the numbers</h1>
      <div style={{ display: "flex", gap: 16 }}>
        <ControlPanel
          factors={bundle.factors}
          selected={selected}
          onToggleFactor={toggle}
          mode={mode}
          onSetMode={setMode}
          r2={fit.r2}
          n={fit.n}
        />
        <div style={{ flex: 1 }}>
          {topo && (
            <MapView
              topo={topo}
              byIsoNum={byIsoNum}
              fit={fit}
              mode={mode}
              selectedIso3={selectedIso3}
              onSelect={setSelectedIso3}
              dark={!!dark}
            />
          )}
          <Legend mode={mode} />
          <div style={{ marginTop: 12 }}>
            <DetailPanel country={selectedCountry} fit={fit} factors={bundle.factors} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the integration test, then the full suite**

Run: `cd web && npm test -- App.integration`
Expected: 2 tests pass.
Run: `cd web && npm test`
Expected: ALL tests pass (Tasks 1–8).

- [ ] **Step 5: Verify a production build compiles**

Run: `cd web && npm run build`
Expected: `tsc -b` passes (strict, no unused) and Vite builds with no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/App.integration.test.tsx
git commit -m "feat(web): wire bundle + regression + map + controls + detail"
```

---

## Self-Review

**1. Spec coverage (this plan's scope — the core map):**
- Static React app, in-browser OLS → Tasks 1, 3, 8. ✅
- Transform read from `factors.json`, residual back-transformed → Task 3 (`fitModel` uses `bundle.target.transform`). ✅
- No silent imputation (complete-case fit; insufficient → neutral/message) → Tasks 3, 5, 7. ✅
- Standardized predictors → Task 3. ✅
- ColorBrewer RdBu/YlGnBu, dark-mode aware → Task 4. ✅
- iso_num join → Tasks 2, 5. ✅
- Raw/residual modes, factor toggles, legend, detail → Tasks 5, 6, 7, 8. ✅
- R² + contributions surfaced → Tasks 3, 6, 7. ✅

**2. Placeholder scan:** No "TBD"/"add styling later". Component styling is inline and minimal-but-complete. The one prose note (Task 4, removing the dead `residualScale` scaffold) is an explicit instruction, not a placeholder — the implementer must produce code that compiles under `strict`/`noUnusedLocals`. *Action for implementer: ensure `scales.ts` exports only the four tested functions and helpers; delete any scaffolding that fails `noUnusedLocals`.*

**3. Type consistency:** `FitResult`/`CountryFit` (Task 3) are consumed identically by `MapView` (Task 5), `DetailPanel` (Task 7), `ControlPanel` (r2/n, Task 6), and `App` (Task 8). `Country`/`FactorMeta`/`Bundle` (Task 2) flow everywhere. `mode: "raw"|"residual"` is consistent across components. Scales' signatures (`residualColor(residual, maxAbs, dark)`, `rawColor(tfr, dark)`) match their `MapView`/`Legend` call sites. ✅

## Out of scope (later)
- **Plan 1C:** Gapminder-style scatter view, sortable table view, methodology/about page, polished styling/responsive layout, hover tooltips.
- **Phase 2:** Possibility Index factor (OSM amenity composite) — drops into the existing factor registry + this app with no structural change.
- **Phase 3+:** 2004 snapshot & era toggle; sub-national zoom; pronatalist-policy overlay.
- **Sub-national zoom**, lock-common-factors, policy overlay — future phases per the spec.
