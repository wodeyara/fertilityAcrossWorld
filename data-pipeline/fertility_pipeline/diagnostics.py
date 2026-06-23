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
    Xz = _standardize(X)
    details = {}
    for name, target in (("raw", y), ("log", np.log(y))):
        resid = _fit_residuals(target, Xz)
        if len(resid) >= 3:
            normality_p = float(stats.normaltest(resid).pvalue)
        else:
            normality_p = float("nan")
        details[name] = {
            "resid_skew": float(stats.skew(resid)),
            "normality_p": normality_p,
            "n": int(len(resid)),
        }
    choice = min(details, key=lambda k: abs(details[k]["resid_skew"]))
    return choice, details
