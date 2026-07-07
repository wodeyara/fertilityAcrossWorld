import type { Country, FactorMeta } from "../types";
import type { FitResult } from "../lib/regression";
import type { Policy } from "../lib/policy";

export interface DetailPanelProps {
  country: Country | null;
  fit: FitResult;
  factors: FactorMeta[];
  policy?: Policy | null;
}

const STANCE_LABEL: Record<string, string> = {
  raise: "raise fertility",
  maintain: "maintain fertility",
  lower: "lower fertility",
  none: "no intervention",
};
const MEASURE_LABEL: Record<string, string> = {
  baby_bonus: "Baby bonus",
  parental_leave: "Parental leave",
  childcare_subsidy: "Childcare subsidy",
  tax_incentive: "Tax incentives",
};

export function DetailPanel({ country, fit, factors, policy }: DetailPanelProps) {
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
        <div>Actual TFR<br /><strong>{country.tfr?.toFixed(2) ?? "—"}</strong></div>
        <div>Model predicts<br /><strong>{cf.predictedTfr.toFixed(2)}</strong></div>
      </div>
      <div>
        {cf.residualTfr >= 0 ? "+" : ""}{cf.residualTfr.toFixed(2)} · ~{Math.abs(pct)}% {dir}
      </div>
      <div style={{ marginTop: 8, opacity: 0.7, fontSize: 11 }}>factor contributions (transform space)</div>
      {fit.factorIds.map((id) => {
        const v = cf.contributions[id] ?? 0;
        return (
          <div key={id} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{label(id)}</span>
            <span>{v >= 0 ? "+" : ""}{v.toFixed(2)}</span>
          </div>
        );
      })}
      {policy && (
        <div style={{ marginTop: 10, borderTop: "1px solid rgba(128,128,128,0.25)", paddingTop: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>pronatalist policy</div>
          <div>Government policy: <strong>{policy.stance ? STANCE_LABEL[policy.stance] : "no data"}</strong></div>
          {Object.entries(MEASURE_LABEL).map(([k, lbl]) => {
            const v = (policy.measures as unknown as Record<string, boolean | null>)[k];
            return (
              <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{lbl}</span>
                <span>{v == null ? "—" : v ? "yes" : "no"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
