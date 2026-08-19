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

      <section>
        <h3>Pronatalist policy</h3>
        <p>
          The optional overlay hatches countries whose government policy is to <em>raise</em>
          fertility, using the UN World Population Policies database (stance and specific
          measures such as baby bonuses, parental leave, childcare subsidies, and tax
          incentives), enriched by the OECD Family Database. Click a country for its stance
          and measures.
        </p>
        <p>
          Policy is shown as an overlay and is deliberately not a covariate (predictor)
          in the model: pronatalist policy is usually a reaction to already-low
          fertility, so including it would produce misleading reverse-causality associations.
          Coverage is current and partial; a country with no reported policy shows "no data".
        </p>
      </section>

      <section>
        <h3>Sub-national: United States</h3>
        <p>
          Use the <strong>Scale</strong> selector to drill from the world into US states
          (50 states + DC). This is a <strong>present-day</strong> snapshot only; there is
          no historical view yet.
        </p>
        <p>
          Each scale is a <strong>separate model</strong>: the US map is fit only on US
          states with a state-specific factor set — per-capita income, median home value,
          women's bachelor's attainment, female labour-force participation, urbanisation,
          the Social Capital Project index, and a state Possibility index (per-capita
          cultural/social amenities from OpenStreetMap plus broadband access). Covariates
          are not comparable across scales, so the country and state models are never mixed.
        </p>
        <p>
          Sources: Census ACS (2022), CDC NCHS natality, the JEC Social Capital Project,
          OpenStreetMap, and (where available) the Pew Religious Landscape Study. Missing
          values are shown as "insufficient data," never imputed.
        </p>
      </section>

      <section>
        <p>
          Each scale includes a connectivity factor: for US states, the share of
          households with a smartphone (Census ACS); for countries, mobile-phone
          subscriptions per 100 people (World Bank). Because mobile subscriptions
          and the internet-use component of the Possibility index are correlated,
          selecting both the Possibility index and Mobile subscriptions together is
          collinear — the model still fits, but their individual coefficients
          become harder to interpret.
        </p>
      </section>

      <h3>Limitations</h3>
      <ul>
        <li>Coverage is uneven — countries missing a selected factor are shown as "insufficient data," never imputed.</li>
        <li>Residuals describe association, not causation.</li>
        <li>Social-cohesion, gender-inequality, and schooling coverage is partial (UNDP / World Happiness Report).</li>
      </ul>
    </div>
  );
}
