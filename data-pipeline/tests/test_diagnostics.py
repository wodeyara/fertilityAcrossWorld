import math
import numpy as np

from fertility_pipeline import diagnostics


def _record(iso, tfr, x):
    return {"iso3": iso, "tfr": tfr, "factors": {"x": x}}


def test_log_chosen_for_multiplicative_data():
    # Construct tfr = exp(a + b*x + noise): log-linear, so log transform fits best.
    rng = np.random.default_rng(0)
    records = []
    for i in range(120):
        x = rng.normal()
        tfr = math.exp(0.6 + 0.4 * x + rng.normal(0, 0.05))
        records.append(_record(f"C{i}", tfr, x))
    choice, details = diagnostics.choose_tfr_transform(records, ["x"])
    assert choice == "log"
    assert details["log"]["n"] == 120
    assert abs(details["log"]["resid_skew"]) <= abs(details["raw"]["resid_skew"])


def test_drops_rows_with_missing_values():
    records = [
        {"iso3": "A", "tfr": 2.0, "factors": {"x": 1.0}},
        {"iso3": "B", "tfr": None, "factors": {"x": 1.0}},
        {"iso3": "C", "tfr": 3.0, "factors": {"x": None}},
        {"iso3": "D", "tfr": 4.0, "factors": {"x": 2.0}},
    ]
    _choice, details = diagnostics.choose_tfr_transform(records, ["x"])
    assert details["raw"]["n"] == 2  # only A and D are complete
