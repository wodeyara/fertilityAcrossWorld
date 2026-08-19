import math

from fertility_pipeline import possibility


def test_zscore_centers_and_scales():
    z = possibility.zscore({"A": 1.0, "B": 3.0, "C": 5.0})
    assert abs(z["A"] + z["C"]) < 1e-9  # symmetric around mean
    assert z["B"] == 0.0


def test_zscore_all_none_when_too_few():
    z = possibility.zscore({"A": 1.0, "B": None})
    assert z == {"A": None, "B": None}


def test_compute_requires_min_components():
    # A has 3 components, B has only 1 -> B is None
    components = {
        "amenity_density": {"A": 10.0, "B": 1.0, "C": 5.0, "D": 8.0},
        "internet": {"A": 80.0, "B": None, "C": 50.0, "D": 70.0},
        "pop_density": {"A": 300.0, "B": None, "C": 100.0, "D": 200.0},
        "net_migration": {"A": 5.0, "B": None, "C": -2.0, "D": 1.0},
    }
    out = possibility.compute_possibility(components)
    assert out["B"] is None          # only 1 component present
    assert out["A"] is not None
    assert out["A"] > out["C"]       # A is higher on every component than C


def test_compute_averages_available_zscores():
    components = {c: {"A": 1.0, "B": 2.0, "C": 3.0} for c in possibility.COMPONENTS}
    out = possibility.compute_possibility(components)
    # all components identical ordering => composite is the common z-score
    assert out["B"] == 0.0
    assert math.isclose(out["A"], -out["C"], abs_tol=1e-9)
