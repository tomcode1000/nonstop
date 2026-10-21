"""Train and backtest the leisure-route launch model.

Temporal split, no peeking: train on candidates for 2024 launches (features from 2023), test on
2025 launches (features from 2024). Every result is reported with and without the Qloo features,
so the lift Qloo adds is measured rather than assumed.

Usage: python -m nonstop.model   (from backend/)
"""
import json

import lightgbm as lgb
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score

from . import data, features

RESULTS = data.DERIVED / "backtest.json"


def has_demand(year):
    return not data.db1b(year).empty


def feature_sets(train_year):
    """Baseline features available for both years, with and without the Qloo features."""
    base = list(features.BASELINE)
    if not (has_demand(train_year - 1) and has_demand(train_year)):
        base = [f for f in base if f not in ("log_pax", "connect_share", "log_fare")]
    return {"baseline": base, "baseline + Qloo": base + features.QLOO}


def fit_predict(kind, train, test, cols):
    X, Xt, y = train[cols].to_numpy(float), test[cols].to_numpy(float), train.label.to_numpy()
    if kind == "logistic":
        mu, sd = X.mean(0), X.std(0) + 1e-9
        m = LogisticRegression(max_iter=3000, class_weight="balanced").fit((X - mu) / sd, y)
        return m.predict_proba((Xt - mu) / sd)[:, 1], dict(zip(cols, m.coef_[0].round(3)))
    m = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=30,
                           subsample=0.8, subsample_freq=1, colsample_bytree=0.8, scale_pos_weight=(y == 0).sum() / max(1, y.sum()),
                           random_state=7, verbose=-1).fit(X, y)
    return m.predict_proba(Xt)[:, 1], dict(zip(cols, m.feature_importances_.tolist()))


def recall_at_k(df, score, group, k=10):
    """Share of real launches that appear in their group's top-k candidates (per destination or origin)."""
    hits = total = 0
    for _, g in df.assign(s=score).groupby(group):
        if g.label.sum():
            hits += g.nlargest(k, "s").label.sum()
            total += g.label.sum()
    return hits / total if total else float("nan")


def bootstrap_lift(test, p_base, p_full, n=500, seed=7):
    rng = np.random.default_rng(seed)
    dests = test.dest.unique()
    idx_by = {d: np.where(test.dest.to_numpy() == d)[0] for d in dests}
    y = test.label.to_numpy()
    lifts = []
    for _ in range(n):
        idx = np.concatenate([idx_by[d] for d in rng.choice(dests, len(dests))])
        if 0 < y[idx].sum() < len(idx):
            lifts.append(roc_auc_score(y[idx], p_full[idx]) - roc_auc_score(y[idx], p_base[idx]))
    return [round(float(v), 4) for v in np.percentile(lifts, [5, 50, 95])]


def run(train_year=2024, test_year=2025):
    train, test = features.build(train_year), features.build(test_year)
    sets = feature_sets(train_year)
    out = {"train_year": train_year, "test_year": test_year,
           "train": {"candidates": len(train), "launches": int(train.label.sum())},
           "test": {"candidates": len(test), "launches": int(test.label.sum()), "destinations": int(test.dest.nunique())},
           "demand_data": sets["baseline"].count("log_pax") == 1, "models": {}}
    for kind in ("logistic", "lightgbm"):
        preds = {}
        for name, cols in sets.items():
            p, weights = fit_predict(kind, train, test, cols)
            preds[name] = p
            out["models"][f"{kind} | {name}"] = {
                "auc": round(roc_auc_score(test.label, p), 4),
                "avg_precision": round(average_precision_score(test.label, p), 4),
                "recall@10 per destination": round(recall_at_k(test, p, "dest"), 4),
                "recall@10 per origin": round(recall_at_k(test, p, "origin"), 4),
                "weights": weights,
            }
        out["models"][f"{kind} | Qloo AUC lift 90% CI"] = bootstrap_lift(test, preds["baseline"], preds["baseline + Qloo"])
    RESULTS.write_text(json.dumps(out, indent=2, default=str))
    return out


if __name__ == "__main__":
    r = run()
    print(f"train {r['train']} | test {r['test']} | demand data used: {r['demand_data']}")
    for name, m in r["models"].items():
        if isinstance(m, dict):
            print(f"{name:32s} AUC {m['auc']:.3f}  AP {m['avg_precision']:.3f}  "
                  f"R@10/dest {m['recall@10 per destination']:.0%}  R@10/origin {m['recall@10 per origin']:.0%}")
        else:
            print(f"{name:32s} {m}")
