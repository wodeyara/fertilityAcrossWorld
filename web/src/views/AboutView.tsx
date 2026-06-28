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
        A composite of the "sense of opportunity" a place offers: density of social/leisure amenities
        (OpenStreetMap), internet and mobile penetration, population density, and net migration —
        z-scored and averaged. It is the project's most novel and most experimental factor; OSM amenity
        coverage is partial for large countries (their national queries time out), which fall back to the
        other components.
      </p>

      <h3>Limitations</h3>
      <ul>
        <li>Coverage is uneven — countries missing a selected factor are shown as "insufficient data," never imputed.</li>
        <li>Residuals describe association, not causation.</li>
        <li>Social-cohesion, gender-inequality, and schooling coverage is partial (UNDP / World Happiness Report).</li>
      </ul>
    </div>
  );
}
