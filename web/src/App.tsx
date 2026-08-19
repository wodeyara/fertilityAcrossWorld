import { useEffect, useMemo, useState } from "react";
import { loadBundle } from "./data/loadBundle";
import { fitModel } from "./lib/regression";
import { indexByIsoNum } from "./lib/geo";
import { toggleButtonStyle } from "./lib/ui";
import { loadPolicies, indexPoliciesByIsoNum } from "./lib/policy";
import type { Policy } from "./lib/policy";
import { ControlPanel } from "./components/ControlPanel";
import { MapView } from "./components/MapView";
import { Legend } from "./components/Legend";
import { DetailPanel } from "./components/DetailPanel";
import { ScatterView } from "./views/ScatterView";
import { TableView } from "./views/TableView";
import { AboutView } from "./views/AboutView";
import type { Bundle, Country } from "./types";

// Base-relative data path so the app works both at the site root and under a
// GitHub Pages project subpath (/<repo>/). BASE_URL always ends with "/".
const DATA_BASE = `${import.meta.env.BASE_URL}data`;

const DEFAULT_FACTORS = ["gdp_pc", "fem_sec_enroll", "flfp", "child_mortality", "urbanisation"];
const DEFAULT_FACTORS_US = ["income_pc", "home_value", "fem_bachelors", "flfp", "urbanisation"];

export default function App() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [topo, setTopo] = useState<object | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_FACTORS));
  const [mode, setMode] = useState<"raw" | "residual">("residual");
  const [selectedIso3, setSelectedIso3] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "scatter" | "table" | "about">("map");
  const [xFactorId, setXFactorId] = useState("possibility");

  const [policyOn, setPolicyOn] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);

  // Scale selector state
  const [scale, setScale] = useState<"world" | "us">("world");
  const [usBundle, setUsBundle] = useState<Bundle | null>(null);
  const [usTopo, setUsTopo] = useState<object | null>(null);

  useEffect(() => {
    loadBundle(DATA_BASE).then(setBundle);
    fetch(`${DATA_BASE}/countries-110m.json`).then((r) => r.json()).then(setTopo);
    loadPolicies(DATA_BASE).then(setPolicies);
  }, []);

  // Lazy-load US assets on first switch
  useEffect(() => {
    if (scale === "us" && !usBundle) loadBundle(`${DATA_BASE}/us`).then(setUsBundle);
    if (scale === "us" && !usTopo) fetch(`${DATA_BASE}/us-states-10m.json`).then((r) => r.json()).then(setUsTopo);
  }, [scale, usBundle, usTopo]);

  const dark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  // Active bundle/topo/projection derived from scale
  const activeBundle = scale === "us" ? usBundle : bundle;
  const activeTopo = scale === "us" ? usTopo : topo;
  const projectionKind = scale === "us" ? "albersUsa" : "world";
  const objectName = scale === "us" ? "states" : "countries";

  const factorIds = useMemo(
    () => (activeBundle ? activeBundle.factors.filter((f) => selected.has(f.id)).map((f) => f.id) : []),
    [activeBundle, selected],
  );
  const fit = useMemo(
    () => (activeBundle ? fitModel(activeBundle.countries, factorIds, activeBundle.target.transform) : null),
    [activeBundle, factorIds],
  );
  const byIsoNum = useMemo(
    () => (activeBundle ? indexByIsoNum(activeBundle.countries) : new Map<number, Country>()),
    [activeBundle],
  );
  const policyByIsoNum = useMemo(() => indexPoliciesByIsoNum(policies), [policies]);

  if (!activeBundle || !fit) return <div>Loading…</div>;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const switchScale = (s: "world" | "us") => {
    setScale(s);
    setSelected(new Set(s === "us" ? DEFAULT_FACTORS_US : DEFAULT_FACTORS));
    setSelectedIso3(null);
  };

  const selectedCountry = selectedIso3 ? activeBundle.countries.find((c) => c.iso3 === selectedIso3) ?? null : null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>Where fertility defies the numbers</h1>
      <nav aria-label="Scale" style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {(["world", "us"] as const).map((s) => (
          <button key={s} aria-pressed={scale === s} onClick={() => switchScale(s)}
            style={toggleButtonStyle(scale === s)}>
            {s === "world" ? "World" : "United States"}
          </button>
        ))}
      </nav>
      <nav aria-label="Views" style={{ display: "flex", gap: 4, margin: "8px 0 16px" }}>
        {(["map", "scatter", "table", "about"] as const).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
            style={toggleButtonStyle(view === v, { textTransform: "capitalize" })}>
            {v}
          </button>
        ))}
      </nav>
      {(view === "map" || view === "scatter") && (
        <div style={{ display: "flex", gap: 16 }}>
          <ControlPanel
            factors={activeBundle.factors}
            selected={selected}
            onToggleFactor={toggle}
            mode={mode}
            onSetMode={setMode}
            r2={fit.r2}
            n={fit.n}
            {...(scale === "world" ? { policyOn, onSetPolicy: setPolicyOn } : {})}
          />
          <div style={{ flex: 1 }}>
            {view === "map" ? (
              <>
                {activeTopo && (
                  <MapView
                    topo={activeTopo}
                    byIsoNum={byIsoNum}
                    fit={fit}
                    mode={mode}
                    selectedIso3={selectedIso3}
                    onSelect={setSelectedIso3}
                    dark={!!dark}
                    projectionKind={projectionKind}
                    objectName={objectName}
                    {...(scale === "world" ? { policyByIsoNum, policyOn } : {})}
                  />
                )}
                <Legend mode={mode} {...(scale === "world" ? { policyOn } : {})} />
              </>
            ) : (
              <ScatterView bundle={activeBundle} fit={fit} mode={mode} xFactorId={xFactorId}
                onSetXFactor={setXFactorId} selectedIso3={selectedIso3} onSelect={setSelectedIso3} dark={!!dark} />
            )}
            <div style={{ marginTop: 12 }}>
              <DetailPanel
                country={selectedCountry}
                fit={fit}
                factors={activeBundle.factors}
                policy={scale === "world" && selectedCountry ? policyByIsoNum.get(selectedCountry.iso_num) ?? null : null}
              />
            </div>
          </div>
        </div>
      )}
      {view === "table" && <TableView bundle={activeBundle} fit={fit} selectedIso3={selectedIso3} onSelect={setSelectedIso3} />}
      {view === "about" && <AboutView bundle={activeBundle} />}
    </div>
  );
}
