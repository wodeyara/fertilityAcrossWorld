import numpy as np

COMPONENTS = ["amenity_density", "internet", "pop_density", "net_migration"]
MIN_COMPONENTS = 3


def zscore(values: dict[str, float | None]) -> dict[str, float | None]:
    present = {k: v for k, v in values.items() if v is not None}
    if len(present) < 2:
        return {k: None for k in values}
    arr = np.array(list(present.values()), dtype=float)
    mean = float(arr.mean())
    std = float(arr.std())
    if std == 0:
        std = 1.0
    return {k: ((present[k] - mean) / std if k in present else None) for k in values}


def compute_possibility(components: dict[str, dict[str, float | None]]) -> dict[str, float | None]:
    iso3s: set[str] = set()
    for comp in components.values():
        iso3s.update(comp.keys())

    z_by_comp = {name: zscore(values) for name, values in components.items()}

    out: dict[str, float | None] = {}
    for iso3 in iso3s:
        zs = [z_by_comp[name].get(iso3) for name in components]
        present = [z for z in zs if z is not None]
        out[iso3] = float(sum(present) / len(present)) if len(present) >= MIN_COMPONENTS else None
    return out
