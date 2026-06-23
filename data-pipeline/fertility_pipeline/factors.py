from dataclasses import dataclass


@dataclass(frozen=True)
class Factor:
    id: str
    label: str
    group: str
    source: str   # "worldbank" or "static"
    code: str     # World Bank indicator code, or static CSV column name
    direction: str  # "positive" | "negative" | "mixed" (expected effect on fertility)
    unit: str


GROUPS = [
    "Economic",
    "Education",
    "Women's work & agency",
    "Health & access",
    "Structure",
    "Community",
]

# Mirrors the World Bank's current region taxonomy (Afghanistan & Pakistan were
# moved from South Asia into the renamed MENAAP region in the 2024-25 update).
REGIONS = [
    "East Asia & Pacific",
    "Europe & Central Asia",
    "Latin America & Caribbean",
    "Middle East, North Africa, Afghanistan & Pakistan",
    "North America",
    "South Asia",
    "Sub-Saharan Africa",
]

TARGET = Factor(
    id="tfr",
    label="Total fertility rate",
    group="Target",
    source="worldbank",
    code="SP.DYN.TFRT.IN",
    direction="mixed",
    unit="births per woman",
)

FACTORS = [
    Factor(id="gdp_pc", label="GDP per capita (PPP)", group="Economic", source="worldbank",
           code="NY.GDP.PCAP.PP.KD", direction="negative", unit="constant int'l $"),
    Factor(id="gini", label="Income inequality (Gini)", group="Economic", source="worldbank",
           code="SI.POV.GINI", direction="mixed", unit="index 0-100"),
    Factor(id="fem_sec_enroll", label="Female secondary enrolment", group="Education", source="worldbank",
           code="SE.SEC.ENRR.FE", direction="negative", unit="% gross"),
    Factor(id="fem_years_schooling", label="Female mean years of schooling", group="Education", source="static",
           code="fem_years_schooling", direction="negative", unit="years"),
    Factor(id="flfp", label="Female labour-force participation", group="Women's work & agency", source="worldbank",
           code="SL.TLF.CACT.FE.ZS", direction="negative", unit="% of women 15+"),
    Factor(id="gii", label="Gender Inequality Index", group="Women's work & agency", source="static",
           code="gii", direction="positive", unit="index 0-1"),
    Factor(id="contraceptive", label="Contraceptive prevalence", group="Health & access", source="worldbank",
           code="SP.DYN.CONU.ZS", direction="negative", unit="% of women 15-49"),
    Factor(id="child_mortality", label="Child mortality (under-5)", group="Health & access", source="worldbank",
           code="SH.DYN.MORT", direction="positive", unit="per 1,000 live births"),
    Factor(id="adolescent_fertility", label="Adolescent birth rate", group="Health & access", source="worldbank",
           code="SP.ADO.TFRT", direction="positive", unit="births per 1,000 women 15-19"),
    Factor(id="urbanisation", label="Urbanisation", group="Structure", source="worldbank",
           code="SP.URB.TOTL.IN.ZS", direction="negative", unit="% urban"),
    Factor(id="social_cohesion", label="Social cohesion / support", group="Community", source="static",
           code="social_cohesion", direction="mixed", unit="index 0-100"),
]


def factor_ids() -> list[str]:
    return [f.id for f in FACTORS]


def worldbank_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "worldbank"]


def static_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "static"]
