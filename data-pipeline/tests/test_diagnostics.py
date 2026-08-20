import math

import pytest
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


def test_raises_on_no_complete_records():
    records = [{"iso3": "A", "tfr": None, "factors": {"x": 1.0}}]
    with pytest.raises(ValueError, match="no complete records"):
        diagnostics.choose_tfr_transform(records, ["x"])


def _recs(xs, ys, fid="f"):
    return [{"tfr": y, "factors": {fid: x}} for x, y in zip(xs, ys)]


def test_chooses_log_for_log_linear_factor():
    # y = 2 - 0.3*log(x); x spans a wide positive range -> log wins
    xs = [math.exp(i / 5) for i in range(60)]           # 1 .. ~e^11
    ys = [2.0 - 0.3 * math.log(x) for x in xs]
    out = diagnostics.choose_factor_transforms(_recs(xs, ys), ["f"], "raw", 0.02)
    assert out["f"]["transform"] == "log"


def test_chooses_raw_for_linear_factor():
    xs = [float(i) for i in range(60)]
    ys = [3.0 - 0.02 * x for x in xs]
    out = diagnostics.choose_factor_transforms(_recs(xs, ys), ["f"], "raw", 0.02)
    assert out["f"]["transform"] == "raw"
    assert out["f"]["quadratic"] is False


def test_no_log_when_a_value_is_non_positive():
    xs = [float(i) for i in range(-5, 55)]               # includes 0 and negatives
    ys = [2.0 - 0.01 * x for x in xs]
    out = diagnostics.choose_factor_transforms(_recs(xs, ys), ["f"], "raw", 0.02)
    assert out["f"]["transform"] == "raw"


def test_flags_quadratic_for_curved_factor():
    xs = [float(i) for i in range(-30, 30)]
    ys = [2.0 + 0.002 * x * x for x in xs]               # pure parabola
    out = diagnostics.choose_factor_transforms(_recs(xs, ys), ["f"], "raw", 0.02)
    assert out["f"]["quadratic"] is True


def test_small_n_is_raw_and_linear():
    xs = [math.exp(i / 3) for i in range(10)]            # n < MIN_N
    ys = [2.0 - 0.3 * math.log(x) for x in xs]
    out = diagnostics.choose_factor_transforms(_recs(xs, ys), ["f"], "raw", 0.02)
    assert out["f"] == {"transform": "raw", "quadratic": False}
