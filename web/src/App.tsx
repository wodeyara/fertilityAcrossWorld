import { useEffect, useMemo, useState } from "react";
import { loadBundle } from "./data/loadBundle";
import { fitModel } from "./lib/regression";
import { indexByIsoNum } from "./lib/geo";
import { ControlPanel } from "./components/ControlPanel";
import { MapView } from "./components/MapView";
import { Legend } from "./components/Legend";
import { DetailPanel } from "./components/DetailPanel";
import type { Bundle, Country } from "./types";

const DEFAULT_FACTORS = ["gdp_pc", "fem_sec_enroll", "flfp", "child_mortality", "urbanisation"];

export default function App() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [topo, setTopo] = useState<object | null>(null);
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
  const byIsoNum = useMemo(
    () => (bundle ? indexByIsoNum(bundle.countries) : new Map<number, Country>()),
    [bundle],
  );

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
