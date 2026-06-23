import math

import numpy as np
from scipy import stats


def _design(records, factor_ids):
    ys, rows = [], []
    for r in records:
        tfr = r.get("tfr")
        if tfr is None or tfr <= 0:
            continue
        vals = [r["factors"].get(fid) for fid in factor_ids]
        if any(v is None for v in vals):
            continue
        ys.append(tfr)
        rows.append(vals)
    y = np.asarray(ys, dtype=float)
    X = np.asarray(rows, dtype=float)
    return y, X


def _standardize(X):
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std[std == 0] = 1.0
    return (X - mean) / std


def _fit_residuals(y, Xz):
    design = np.column_stack([np.ones(len(y)), Xz])
    beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    return y - design @ beta


def choose_tfr_transform(records, factor_ids):
    y, X = _design(records, factor_ids)
    if len(y) == 0:
        raise ValueError("no complete records to choose a transform")

    Xz = _standardize(X)
    details = {}
    for name, target in (("raw", y), ("log", np.log(y))):
        resid = _fit_residuals(target, Xz)
        # skew needs >=3 points and meaningful residual variance;
        # normaltest (scipy) requires >=8 samples or it raises.
        resid_skew = float(stats.skew(resid)) if len(resid) >= 3 else float("nan")
        normality_p = float(stats.normaltest(resid).pvalue) if len(resid) >= 8 else float("nan")
        details[name] = {
            "resid_skew": resid_skew,
            "normality_p": normality_p,
            "n": int(len(resid)),
        }

    valid = {k: v for k, v in details.items() if not math.isnan(v["resid_skew"])}
    choice = min(valid, key=lambda k: abs(valid[k]["resid_skew"])) if valid else "raw"
    return choice, details
