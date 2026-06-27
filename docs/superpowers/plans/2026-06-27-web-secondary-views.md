# Web Secondary Views (Plan 1C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tab navigation and three new views to the existing map app — a Gapminder-style scatter, a sortable data table, and a methodology/about page — plus an "experimental" badge for the Possibility Index, so the data is explorable beyond the choropleth.

**Architecture:** Frontend-only, building on the existing app. `App` gains a `view` state and a tab bar; the current map layout becomes the "map" view. Scatter and table are new view components that consume the same in-memory `Bundle` + `FitResult`; selecting a country in any view syncs the shared `selectedIso3`. The scatter is plain SVG using the already-present `d3-scale` (no new deps). No pipeline, data, or contract changes.

**Tech Stack:** Existing — React 18 + TypeScript + Vite, d3-scale, Vitest + @testing-library/react. No new dependencies.

## Global Constraints

- **Frontend-only.** No changes to `data-pipeline/`, the JSON bundle, or the data contract. The bundle already carries everything needed (`tfr`, per-factor values, and `fit` is computed in-browser).
- **No new runtime dependencies.** Use the existing `d3-scale` for the scatter; build axes from `scale.ticks()`. No chart library, no `d3-axis`.
- **Selection is shared across views.** Clicking a country in the map, scatter, or table updates the single `selectedIso3` in `App`; the detail panel reflects it.
- **Reuse existing modules**: `fitModel`/`FitResult` (`lib/regression`), color scales (`lib/scales`), `Bundle`/`Country`/`FactorMeta` (`types`). Do not duplicate the regression or scales.
- **Respect no-silent-imputation**: scatter/table only plot/show countries with the needed values present; missing values render as "—" (table) or are omitted (scatter), never imputed.
- **Colorblind-safe + dark-mode**: reuse `residualColor`/`rawColor` for any color encoding; read `dark` as the app already does.
- **The Possibility Index is flagged experimental** in the UI (the factor's group is `"Possibility"`).
- Node 18+, run from `web/`: `cd web && npm test` / `npm run build`. `npm run build` (tsc strict + vite) must stay green.

---

## File Structure

```
web/src/
  App.tsx                      # MODIFY: view state + tab bar; render map/scatter/table/about
  lib/scatter.ts               # CREATE: computeScatterPoints (pure)
  lib/table.ts                 # CREATE: buildTableRows + sortRows (pure)
  views/ScatterView.tsx        # CREATE: SVG scatter (factor on X, residual/TFR on Y)
  views/TableView.tsx          # CREATE: sortable data table
  views/AboutView.tsx          # CREATE: methodology / sources / limitations
  components/ControlPanel.tsx  # MODIFY: "exp" badge for Possibility-group factors
```
Tests co-located as `*.test.ts(x)`.

---

### Task 1: Scatter view (pure points + component)

**Files:**
- Create: `web/src/lib/scatter.ts`, `web/src/views/ScatterView.tsx`
- Test: `web/src/lib/scatter.test.ts`, `web/src/views/ScatterView.test.tsx`

**Interfaces:**
- Produces:
  - `ScatterPoint = { iso3: string; name: string; x: number; y: number }`
  - `computeScatterPoints(countries: Country[], fit: FitResult, mode: "raw"|"residual", xFactorId: string): ScatterPoint[]` — y is `residualTfr` (residual mode, from `fit.fits`) or `tfr` (raw mode); x is `factors[xFactorId]`; points with a null x or y are skipped.
  - `ScatterView(props: { bundle: Bundle; fit: FitResult; mode: "raw"|"residual"; xFactorId: string; onSetXFactor: (id: string) => void; selectedIso3: string | null; onSelect: (iso3: string) => void; dark: boolean })` — renders a factor `<select>` for the X axis and an SVG scatter; clicking a point calls `onSelect`.

- [ ] **Step 1: Write the failing test for scatter.ts**

`web/src/lib/scatter.test.ts`:
```typescript
import { computeScatterPoints } from "./scatter";
import type { Country } from "../types";
import type { FitResult } from "./regression";

const countries: Country[] = [
  { iso3: "USA", iso_num: 840, name: "United States", region: "NA", tfr: 1.6, tfr_year: 2022, factors: { possibility: 0.3 } },
  { iso3: "NER", iso_num: 562, name: "Niger", region: "SSA", tfr: 6.8, tfr_year: 2021, factors: { possibility: -0.8 } },
  { iso3: "XXX", iso_num: 1, name: "NoFactor", region: "NA", tfr: 2.0, tfr_year: 2022, factors: { possibility: null } },
];
const fit: FitResult = {
  factorIds: ["gdp_pc"], transform: "log", n: 2, r2: 0.5, intercept: 0, coefficients: { gdp_pc: -1 },
  fits: new Map([["USA", { predictedTfr: 1.4, residualTfr: 0.2, contributions: {} }]]),
};

test("residual mode: x=factor, y=residual; skips missing", () => {
  const pts = computeScatterPoints(countries, fit, "residual", "possibility");
  expect(pts).toHaveLength(1); // only USA has both a possibility value and a fit residual
  expect(pts[0]).toMatchObject({ iso3: "USA", x: 0.3, y: 0.2 });
});

test("raw mode: y=tfr; skips null factor", () => {
  const pts = computeScatterPoints(countries, fit, "raw", "possibility");
  expect(pts.map((p) => p.iso3).sort()).toEqual(["NER", "USA"]); // XXX has null possibility
  expect(pts.find((p) => p.iso3 === "NER")!.y).toBe(6.8);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd web && npm test -- scatter`
Expected: FAIL (module not found).

- [ ] **Step 3: Write scatter.ts**

`web/src/lib/scatter.ts`:
```typescript
import type { Country } from "../types";
import type { FitResult } from "./regression";

export interface ScatterPoint {
  iso3: string;
  name: string;
  x: number;
  y: number;
}

export function computeScatterPoints(
  countries: Country[],
  fit: FitResult,
  mode: "raw" | "residual",
  xFactorId: string,
): ScatterPoint[] {
  const points: ScatterPoint[] = [];
  for (const c of countries) {
    const x = c.factors[xFactorId];
    if (x == null) continue;
    let y: number | null;
    if (mode === "residual") {
      const f = fit.fits.get(c.iso3);
      y = f ? f.residualTfr : null;
    } else {
      y = c.tfr;
    }
    if (y == null) continue;
    points.push({ iso3: c.iso3, name: c.name, x, y });
  }
  return points;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd web && npm test -- scatter`
Expected: 2 tests pass.

- [ ] **Step 5: Write the failing test for ScatterView**

`web/src/views/ScatterView.test.tsx`:
```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { ScatterView } from "./ScatterView";
import type { Bundle } from "../types";
import type { FitResult } from "../lib/regression";

const bundle: Bundle = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "Total fertility rate", transform: "log", unit: "births", source: "WB" },
  factors: [
    { id: "possibility", label: "Possibility index", group: "Possibility", unit: "z", direction: "negative", source: "computed" },
    { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "worldbank" },
  ],
  coverage: {},
  countries: [
    { iso3: "USA", iso_num: 840, name: "United States", region: "NA", tfr: 1.6, tfr_year: 2022, factors: { possibility: 0.3, gdp_pc: 60000 } },
    { iso3: "NER", iso_num: 562, name: "Niger", region: "SSA", tfr: 6.8, tfr_year: 2021, factors: { possibility: -0.8, gdp_pc: 1200 } },
  ],
};
const fit: FitResult = {
  factorIds: ["gdp_pc"], transform: "log", n: 2, r2: 0.5, intercept: 0, coefficients: { gdp_pc: -1 },
  fits: new Map([
    ["USA", { predictedTfr: 1.4, residualTfr: 0.2, contributions: {} }],
    ["NER", { predictedTfr: 6.5, residualTfr: 0.3, contributions: {} }],
  ]),
};

test("renders one circle per plottable country and reports clicks", () => {
  const onSelect = vi.fn();
  const { container } = render(
    <ScatterView bundle={bundle} fit={fit} mode="residual" xFactorId="possibility"
      onSetXFactor={() => {}} selectedIso3={null} onSelect={onSelect} dark={false} />,
  );
  const circles = container.querySelectorAll("circle");
  expect(circles.length).toBe(2);
  fireEvent.click(circles[0]);
  expect(onSelect).toHaveBeenCalled();
});

test("changing the X-axis factor select reports it", () => {
  const onSetXFactor = vi.fn();
  render(
    <ScatterView bundle={bundle} fit={fit} mode="residual" xFactorId="possibility"
      onSetXFactor={onSetXFactor} selectedIso3={null} onSelect={() => {}} dark={false} />,
  );
  fireEvent.change(screen.getByLabelText(/x-axis/i), { target: { value: "gdp_pc" } });
  expect(onSetXFactor).toHaveBeenCalledWith("gdp_pc");
});
```

- [ ] **Step 6: Run, verify fail**

Run: `cd web && npm test -- ScatterView`
Expected: FAIL (module not found).

- [ ] **Step 7: Write ScatterView.tsx**

`web/src/views/ScatterView.tsx`:
```typescript
import { useMemo } from "react";
import { scaleLinear } from "d3-scale";
import { computeScatterPoints } from "../lib/scatter";
import type { Bundle } from "../types";
import type { FitResult } from "../lib/regression";

export interface ScatterViewProps {
  bundle: Bundle;
  fit: FitResult;
  mode: "raw" | "residual";
  xFactorId: string;
  onSetXFactor: (id: string) => void;
  selectedIso3: string | null;
  onSelect: (iso3: string) => void;
  dark: boolean;
}

const W = 720;
const H = 440;
const M = { top: 16, right: 16, bottom: 48, left: 56 };

export function ScatterView(props: ScatterViewProps) {
  const { bundle, fit, mode, xFactorId, onSetXFactor, selectedIso3, onSelect, dark } = props;
  const points = useMemo(
    () => computeScatterPoints(bundle.countries, fit, mode, xFactorId),
    [bundle, fit, mode, xFactorId],
  );
  const xLabel = bundle.factors.find((f) => f.id === xFactorId)?.label ?? xFactorId;
  const yLabel = mode === "residual" ? "Unexplained fertility (residual)" : "Total fertility rate";
  const axis = dark ? "#888" : "#555";

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = scaleLinear()
    .domain([Math.min(0, ...xs), Math.max(0, ...xs)])
    .range([M.left, W - M.right])
    .nice();
  const y = scaleLinear()
    .domain([Math.min(...ys, 0), Math.max(...ys, 0)])
    .range([H - M.bottom, M.top])
    .nice();

  return (
    <div>
      <label style={{ fontSize: 13 }}>
        X-axis:{" "}
        <select value={xFactorId} onChange={(e) => onSetXFactor(e.target.value)} aria-label="X-axis factor">
          {bundle.factors.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </label>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Scatter of ${yLabel} versus ${xLabel}`}>
        {y.ticks(5).map((t) => (
          <g key={`y${t}`}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={axis} strokeOpacity={0.15} />
            <text x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={axis}>{t}</text>
          </g>
        ))}
        {x.ticks(6).map((t) => (
          <text key={`x${t}`} x={x(t)} y={H - M.bottom + 16} textAnchor="middle" fontSize={10} fill={axis}>{t}</text>
        ))}
        {points.map((p) => {
          const selected = p.iso3 === selectedIso3;
          return (
            <circle
              key={p.iso3}
              cx={x(p.x)}
              cy={y(p.y)}
              r={selected ? 6 : 3.5}
              fill={selected ? (dark ? "#fff" : "#111") : dark ? "#5ba3d0" : "#378add"}
              fillOpacity={0.75}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(p.iso3)}
            >
              <title>{p.name}</title>
            </circle>
          );
        })}
        <text x={(W) / 2} y={H - 6} textAnchor="middle" fontSize={12} fill={axis}>{xLabel}</text>
        <text x={-(H / 2)} y={14} transform="rotate(-90)" textAnchor="middle" fontSize={12} fill={axis}>{yLabel}</text>
      </svg>
    </div>
  );
}
```

- [ ] **Step 8: Run both, verify pass**

Run: `cd web && npm test -- scatter ScatterView`
Expected: scatter (2) + ScatterView (2) pass.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/scatter.ts web/src/lib/scatter.test.ts \
        web/src/views/ScatterView.tsx web/src/views/ScatterView.test.tsx
git commit -m "feat(web): Gapminder-style scatter view (factor vs residual/TFR)"
```

---

### Task 2: Table view (pure rows + sortable component)

**Files:**
- Create: `web/src/lib/table.ts`, `web/src/views/TableView.tsx`
- Test: `web/src/lib/table.test.ts`, `web/src/views/TableView.test.tsx`

**Interfaces:**
- Produces:
  - `TableRow = { iso3: string; name: string; region: string; tfr: number | null; predicted: number | null; residual: number | null }`
  - `buildTableRows(countries: Country[], fit: FitResult): TableRow[]` — predicted/residual from `fit.fits` (null when the country has no fit).
  - `sortRows(rows: TableRow[], key: keyof TableRow, dir: "asc" | "desc"): TableRow[]` — stable; nulls always sort last regardless of dir.
  - `TableView(props: { bundle: Bundle; fit: FitResult; selectedIso3: string | null; onSelect: (iso3: string) => void })` — renders a sortable table; clicking a header toggles sort; clicking a row calls `onSelect`.

- [ ] **Step 1: Write the failing test for table.ts**

`web/src/lib/table.test.ts`:
```typescript
import { buildTableRows, sortRows } from "./table";
import type { Country } from "../types";
import type { FitResult } from "./regression";

const countries: Country[] = [
  { iso3: "USA", iso_num: 840, name: "United States", region: "NA", tfr: 1.6, tfr_year: 2022, factors: {} },
  { iso3: "NER", iso_num: 562, name: "Niger", region: "SSA", tfr: 6.8, tfr_year: 2021, factors: {} },
  { iso3: "XXX", iso_num: 1, name: "NoFit", region: "NA", tfr: 2.0, tfr_year: 2022, factors: {} },
];
const fit: FitResult = {
  factorIds: [], transform: "log", n: 2, r2: 0.5, intercept: 0, coefficients: {},
  fits: new Map([
    ["USA", { predictedTfr: 1.4, residualTfr: 0.2, contributions: {} }],
    ["NER", { predictedTfr: 6.5, residualTfr: 0.3, contributions: {} }],
  ]),
};

test("buildTableRows pulls predicted/residual, null when no fit", () => {
  const rows = buildTableRows(countries, fit);
  const xxx = rows.find((r) => r.iso3 === "XXX")!;
  expect(xxx.predicted).toBeNull();
  expect(rows.find((r) => r.iso3 === "USA")!.residual).toBe(0.2);
});

test("sortRows sorts by key with nulls last", () => {
  const rows = buildTableRows(countries, fit);
  const asc = sortRows(rows, "residual", "asc");
  expect(asc[0].iso3).toBe("USA"); // 0.2 < 0.3
  expect(asc[asc.length - 1].iso3).toBe("XXX"); // null last
  const desc = sortRows(rows, "residual", "desc");
  expect(desc[0].iso3).toBe("NER"); // 0.3 first
  expect(desc[desc.length - 1].iso3).toBe("XXX"); // null still last
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd web && npm test -- "lib/table"`
Expected: FAIL (module not found).

- [ ] **Step 3: Write table.ts**

`web/src/lib/table.ts`:
```typescript
import type { Country } from "../types";
import type { FitResult } from "./regression";

export interface TableRow {
  iso3: string;
  name: string;
  region: string;
  tfr: number | null;
  predicted: number | null;
  residual: number | null;
}

export function buildTableRows(countries: Country[], fit: FitResult): TableRow[] {
  return countries.map((c) => {
    const f = fit.fits.get(c.iso3);
    return {
      iso3: c.iso3,
      name: c.name,
      region: c.region,
      tfr: c.tfr,
      predicted: f ? f.predictedTfr : null,
      residual: f ? f.residualTfr : null,
    };
  });
}

export function sortRows(rows: TableRow[], key: keyof TableRow, dir: "asc" | "desc"): TableRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls last regardless of dir
    if (bv == null) return -1;
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd web && npm test -- "lib/table"`
Expected: 2 tests pass.

- [ ] **Step 5: Write the failing test for TableView**

`web/src/views/TableView.test.tsx`:
```typescript
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TableView } from "./TableView";
import type { Bundle } from "../types";
import type { FitResult } from "../lib/regression";

const bundle: Bundle = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "TFR", transform: "log", unit: "births", source: "WB" },
  factors: [],
  coverage: {},
  countries: [
    { iso3: "USA", iso_num: 840, name: "United States", region: "NA", tfr: 1.6, tfr_year: 2022, factors: {} },
    { iso3: "NER", iso_num: 562, name: "Niger", region: "SSA", tfr: 6.8, tfr_year: 2021, factors: {} },
  ],
};
const fit: FitResult = {
  factorIds: [], transform: "log", n: 2, r2: 0.5, intercept: 0, coefficients: {},
  fits: new Map([
    ["USA", { predictedTfr: 1.4, residualTfr: 0.2, contributions: {} }],
    ["NER", { predictedTfr: 6.5, residualTfr: 0.3, contributions: {} }],
  ]),
};

test("renders a row per country and reports row clicks", () => {
  const onSelect = vi.fn();
  render(<TableView bundle={bundle} fit={fit} selectedIso3={null} onSelect={onSelect} />);
  expect(screen.getByText("United States")).toBeInTheDocument();
  expect(screen.getByText("Niger")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Niger"));
  expect(onSelect).toHaveBeenCalledWith("NER");
});

test("clicking the residual header sorts the rows", () => {
  render(<TableView bundle={bundle} fit={fit} selectedIso3={null} onSelect={() => {}} />);
  const header = screen.getByRole("button", { name: /residual/i });
  fireEvent.click(header); // asc -> USA (0.2) before NER (0.3)
  let rows = screen.getAllByRole("row").slice(1); // skip header row
  expect(within(rows[0]).getByText("United States")).toBeInTheDocument();
  fireEvent.click(header); // desc -> NER first
  rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText("Niger")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run, verify fail**

Run: `cd web && npm test -- TableView`
Expected: FAIL (module not found).

- [ ] **Step 7: Write TableView.tsx**

`web/src/views/TableView.tsx`:
```typescript
import { useMemo, useState } from "react";
import { buildTableRows, sortRows, type TableRow } from "../lib/table";
import type { Bundle } from "../types";
import type { FitResult } from "../lib/regression";

export interface TableViewProps {
  bundle: Bundle;
  fit: FitResult;
  selectedIso3: string | null;
  onSelect: (iso3: string) => void;
}

const COLUMNS: { key: keyof TableRow; label: string; numeric: boolean }[] = [
  { key: "name", label: "Country", numeric: false },
  { key: "region", label: "Region", numeric: false },
  { key: "tfr", label: "TFR", numeric: true },
  { key: "predicted", label: "Predicted", numeric: true },
  { key: "residual", label: "Residual", numeric: true },
];

function fmt(v: number | null): string {
  return v == null ? "—" : v.toFixed(2);
}

export function TableView({ bundle, fit, selectedIso3, onSelect }: TableViewProps) {
  const [sortKey, setSortKey] = useState<keyof TableRow>("residual");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const rows = useMemo(() => sortRows(buildTableRows(bundle.countries, fit), sortKey, dir), [bundle, fit, sortKey, dir]);

  const toggle = (key: keyof TableRow) => {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir("asc");
    }
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c.key} style={{ textAlign: c.numeric ? "right" : "left", borderBottom: "1px solid #8884", padding: "4px 8px" }}>
              <button onClick={() => toggle(c.key)} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit" }}>
                {c.label}{sortKey === c.key ? (dir === "asc" ? " ▲" : " ▼") : ""}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.iso3}
            onClick={() => onSelect(r.iso3)}
            style={{ cursor: "pointer", background: r.iso3 === selectedIso3 ? "#8882" : undefined }}
          >
            <td style={{ padding: "4px 8px" }}>{r.name}</td>
            <td style={{ padding: "4px 8px" }}>{r.region}</td>
            <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmt(r.tfr)}</td>
            <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmt(r.predicted)}</td>
            <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmt(r.residual)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 8: Run both, verify pass**

Run: `cd web && npm test -- "lib/table" TableView`
Expected: table (2) + TableView (2) pass.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/table.ts web/src/lib/table.test.ts \
        web/src/views/TableView.tsx web/src/views/TableView.test.tsx
git commit -m "feat(web): sortable data table view"
```

---

### Task 3: Methodology / About view

**Files:**
- Create: `web/src/views/AboutView.tsx`
- Test: `web/src/views/AboutView.test.tsx`

**Interfaces:**
- Produces: `AboutView(props: { bundle: Bundle })` — static methodology content: the model (OLS on the bundle's `target.transform` of TFR, standardized predictors, residual = actual − predicted), the factor list with sources (from `bundle.factors`), the Possibility Index explanation, and limitations (partial OSM coverage, partial static-factor coverage, association-not-causation).

- [ ] **Step 1: Write the failing test**

`web/src/views/AboutView.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { AboutView } from "./AboutView";
import type { Bundle } from "../types";

const bundle: Bundle = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "Total fertility rate", transform: "log", unit: "births", source: "World Bank" },
  factors: [
    { id: "possibility", label: "Possibility index", group: "Possibility", unit: "z", direction: "negative", source: "computed" },
    { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "World Bank" },
  ],
  coverage: {},
  countries: [],
};

test("renders methodology sections and the transform", () => {
  render(<AboutView bundle={bundle} />);
  expect(screen.getByRole("heading", { name: /methodology/i })).toBeInTheDocument();
  expect(screen.getByText(/log/i)).toBeInTheDocument(); // transform surfaced
  expect(screen.getByText(/limitations/i)).toBeInTheDocument();
  expect(screen.getByText("Possibility index")).toBeInTheDocument(); // factor listed
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd web && npm test -- AboutView`
Expected: FAIL (module not found).

- [ ] **Step 3: Write AboutView.tsx**

`web/src/views/AboutView.tsx`:
```typescript
import type { Bundle } from "../types";

export function AboutView({ bundle }: { bundle: Bundle }) {
  return (
    <div style={{ maxWidth: 720, fontSize: 14, lineHeight: 1.6 }}>
      <h2>Methodology</h2>
      <p>
        For the {bundle.snapshotYear} snapshot we fit an ordinary least-squares regression of{" "}
        <strong>{bundle.target.transform === "log" ? "log " : ""}total fertility rate</strong> on the
        factors you select, standardized so their effects are comparable. Each country's{" "}
        <strong>residual</strong> — actual minus model-predicted fertility — is the part the chosen
        factors do not explain. Red means higher than predicted, blue lower.
      </p>

      <h3>Factors &amp; sources</h3>
      <ul>
        {bundle.factors.map((f) => (
          <li key={f.id}>
            <strong>{f.label}</strong> <span style={{ opacity: 0.7 }}>({f.group}; {f.source})</span>
          </li>
        ))}
      </ul>

      <h3>The Possibility Index (experimental)</h3>
      <p>
        A composite of the “sense of opportunity” a place offers: density of social/leisure amenities
        (OpenStreetMap), internet and mobile penetration, population density, and net migration —
        z-scored and averaged. It is the project's most novel and most experimental factor; OSM amenity
        coverage is partial for large countries (their national queries time out), which fall back to the
        other components.
      </p>

      <h3>Limitations</h3>
      <ul>
        <li>Coverage is uneven — countries missing a selected factor are shown as “insufficient data,” never imputed.</li>
        <li>Residuals describe association, not causation.</li>
        <li>Social-cohesion, gender-inequality, and schooling coverage is partial (UNDP / World Happiness Report).</li>
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd web && npm test -- AboutView`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/AboutView.tsx web/src/views/AboutView.test.tsx
git commit -m "feat(web): methodology / about view"
```

---

### Task 4: Tab navigation + Possibility badge (integration)

**Files:**
- Modify: `web/src/App.tsx`, `web/src/components/ControlPanel.tsx`
- Test: `web/src/App.integration.test.tsx` (extend), `web/src/components/ControlPanel.test.tsx` (extend)

**Interfaces:**
- `App` gains `view: "map" | "scatter" | "table" | "about"` state (default `"map"`) and `xFactorId` state (default `"possibility"`); a tab bar switches views. The shared `ControlPanel` shows for `map` and `scatter`; `TableView`/`AboutView` render full-width. `selectedIso3` and the `DetailPanel` are shown for `map` and `scatter`.
- `ControlPanel` shows a small "exp" badge next to any factor whose `group === "Possibility"`.

- [ ] **Step 1: Extend ControlPanel test (badge)**

Append to `web/src/components/ControlPanel.test.tsx`:
```typescript
test("shows an experimental badge for Possibility-group factors", () => {
  const withPoss: FactorMeta[] = [
    ...factors,
    { id: "possibility", label: "Possibility index", group: "Possibility", unit: "z", direction: "negative", source: "computed" },
  ];
  render(
    <ControlPanel factors={withPoss} selected={new Set()} onToggleFactor={() => {}}
      mode="residual" onSetMode={() => {}} r2={null} n={0} />,
  );
  expect(screen.getByText(/^exp$/i)).toBeInTheDocument(); // anchored: avoid matching "Unexplained"
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd web && npm test -- ControlPanel`
Expected: FAIL (no badge yet).

- [ ] **Step 3: Add the badge to ControlPanel**

In `web/src/components/ControlPanel.tsx`, inside the factor `<label>` map, after the factor label text, render a badge when `f.group === "Possibility"`:
```tsx
              {f.label}
              {f.group === "Possibility" && (
                <span style={{ marginLeft: 4, fontSize: 10, padding: "0 4px", borderRadius: 4, background: "#f0c98044", color: "inherit" }}>exp</span>
              )}
```
(Insert this in place of the existing `{f.label}` text node, keeping the checkbox and label wrapper intact.)

- [ ] **Step 4: Run, verify pass**

Run: `cd web && npm test -- ControlPanel`
Expected: all ControlPanel tests pass (existing + badge).

- [ ] **Step 5: Extend the App integration test (tabs)**

Append to `web/src/App.integration.test.tsx` (reuses the existing mock fetch — copy its setup into this test):
```typescript
test("tab bar switches to the table and about views", async () => {
  vi.stubGlobal("fetch", mockFetch({
    "factors.json": FACTORS, "countries.json": COUNTRIES, "meta.json": META, "countries-110m.json": TOPO,
  }));
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("r2-readout")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /^table$/i }));
  expect(screen.getByRole("table")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^about$/i }));
  expect(screen.getByRole("heading", { name: /methodology/i })).toBeInTheDocument();
});
```
(If `FACTORS`/`COUNTRIES`/`META`/`TOPO`/`mockFetch` are not already module-scoped in this file, hoist them so both tests share them. Ensure `fireEvent` is imported.)

- [ ] **Step 6: Run, verify fail**

Run: `cd web && npm test -- App.integration`
Expected: FAIL (no tab bar yet).

- [ ] **Step 7: Refactor App.tsx for tabs**

In `web/src/App.tsx`:
- Add state: `const [view, setView] = useState<"map" | "scatter" | "table" | "about">("map");` and `const [xFactorId, setXFactorId] = useState("possibility");`
- Import `ScatterView`, `TableView`, `AboutView`.
- After the `<h1>`, render a tab bar:
```tsx
      <nav style={{ display: "flex", gap: 4, margin: "8px 0 16px" }}>
        {(["map", "scatter", "table", "about"] as const).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
            style={{ textTransform: "capitalize", fontWeight: view === v ? 500 : 400 }}>
            {v}
          </button>
        ))}
      </nav>
```
- Replace the single content block with per-view rendering. For `map` keep the existing two-column (ControlPanel + map + legend + detail). For `scatter`, render `ControlPanel` + `ScatterView` (passing `xFactorId`/`setXFactorId`) + the `DetailPanel`. For `table`, render `TableView` full-width. For `about`, render `AboutView`. Example structure:
```tsx
      {(view === "map" || view === "scatter") && (
        <div style={{ display: "flex", gap: 16 }}>
          <ControlPanel factors={bundle.factors} selected={selected} onToggleFactor={toggle}
            mode={mode} onSetMode={setMode} r2={fit.r2} n={fit.n} />
          <div style={{ flex: 1 }}>
            {view === "map" ? (
              <>
                {topo && (
                  <MapView topo={topo} byIsoNum={byIsoNum} fit={fit} mode={mode}
                    selectedIso3={selectedIso3} onSelect={setSelectedIso3} dark={!!dark} />
                )}
                <Legend mode={mode} />
              </>
            ) : (
              <ScatterView bundle={bundle} fit={fit} mode={mode} xFactorId={xFactorId}
                onSetXFactor={setXFactorId} selectedIso3={selectedIso3} onSelect={setSelectedIso3} dark={!!dark} />
            )}
            <div style={{ marginTop: 12 }}>
              <DetailPanel country={selectedCountry} fit={fit} factors={bundle.factors} />
            </div>
          </div>
        </div>
      )}
      {view === "table" && <TableView bundle={bundle} fit={fit} selectedIso3={selectedIso3} onSelect={setSelectedIso3} />}
      {view === "about" && <AboutView bundle={bundle} />}
```

- [ ] **Step 8: Run integration + full suite + build**

Run: `cd web && npm test -- App.integration`
Expected: PASS (existing + new tab test).
Run: `cd web && npm test`
Expected: ALL pass.
Run: `cd web && npm run build`
Expected: tsc strict + vite build green.

- [ ] **Step 9: Commit**

```bash
git add web/src/App.tsx web/src/App.integration.test.tsx web/src/components/ControlPanel.tsx web/src/components/ControlPanel.test.tsx
git commit -m "feat(web): tab navigation across map/scatter/table/about + Possibility badge"
```

---

## Self-Review

**1. Spec coverage (Plan 1C scope):**
- Scatter view (residual/TFR vs. a factor, default Possibility) → Task 1. ✅
- Sortable table → Task 2. ✅
- Methodology/about page → Task 3. ✅
- Tab navigation across all views → Task 4. ✅
- Possibility "experimental" badge → Task 4. ✅
- Selection synced across views (shared `selectedIso3`) → Tasks 1, 2, 4. ✅
- Per-component Possibility breakdown is intentionally deferred (needs the pipeline to emit per-country components — a data-contract change; out of scope for this frontend-only plan).

**2. Placeholder scan:** No TBD/placeholders; every step has complete code. Task 4 Steps 5/7 reference the existing App.integration mock setup — the step instructs hoisting it so both tests share it (not a placeholder, an explicit instruction).

**3. Type/interface consistency:** `ScatterPoint`/`computeScatterPoints` (Task 1) consumed by `ScatterView`; `TableRow`/`buildTableRows`/`sortRows` (Task 2) consumed by `TableView`; all views consume `Bundle`/`FitResult` with the same shapes as Plan 1B. `view` union and `xFactorId` live in `App` (Task 4) and thread into `ScatterView`. `mode: "raw"|"residual"` consistent throughout. Selection callback `(iso3: string) => void` consistent across Map/Scatter/Table.

## Out of scope (later)
- Per-component Possibility breakdown in the detail panel (requires the pipeline to emit possibility sub-components per country).
- Reactive dark-mode (subscribe to `prefers-color-scheme` changes).
- Responsive/mobile layout, richer styling, country search.
- Phase 3 (generational snapshot), Phase 4 (sub-national), Phase 5 (policy overlay).
