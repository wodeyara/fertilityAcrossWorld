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


LOG_MIN_GAIN = 0.01
MIN_N = 30


def _r2(cols, y):
    """R^2 of an OLS of y on the given predictor columns (n x k), with intercept."""
    design = np.column_stack([np.ones(len(y)), cols])
    beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    resid = y - design @ beta
    ss_res = float((resid ** 2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum())
    return 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0


def choose_factor_transforms(records, factor_ids, target_transform, quad_min_gain):
    out = {}
    for fid in factor_ids:
        xs, ys = [], []
        for r in records:
            tfr = r.get("tfr")
            x = r["factors"].get(fid)
            if tfr is None or tfr <= 0 or x is None:
                continue
            xs.append(x)
            ys.append(tfr)
        x = np.asarray(xs, dtype=float)
        y = np.asarray(ys, dtype=float)
        yt = np.log(y) if target_transform == "log" else y

        transform, quadratic = "raw", False
        if len(x) >= MIN_N and x.std() > 0:
            if x.min() > 0:
                r2_raw = _r2(x[:, None], yt)
                r2_log = _r2(np.log(x)[:, None], yt)
                if r2_log - r2_raw >= LOG_MIN_GAIN:
                    transform = "log"
            v = np.log(x) if transform == "log" else x
            z = (v - v.mean()) / (v.std() or 1.0)
            r2_lin = _r2(z[:, None], yt)
            r2_quad = _r2(np.column_stack([z, z * z]), yt)
            if r2_quad - r2_lin >= quad_min_gain:
                quadratic = True
        out[fid] = {"transform": transform, "quadratic": quadratic}
    return out
