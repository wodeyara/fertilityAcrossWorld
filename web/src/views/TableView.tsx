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
            <th key={c.key} style={{ textAlign: c.numeric ? "right" : "left", borderBottom: "1px solid #8884", padding: "4px 8px" }} aria-sort={sortKey === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
              <button onClick={() => toggle(c.key)} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit" }}>
                {c.label}{sortKey === c.key ? <span aria-hidden="true">{dir === "asc" ? " ▲" : " ▼"}</span> : ""}
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
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") onSelect(r.iso3); }}
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
