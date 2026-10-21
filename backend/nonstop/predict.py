"""Forward predictions: score every candidate leisure route for the coming year.

The final model is trained on the 2024 and 2025 launch years (features from 2023 and 2024), then
scores candidates for 2026 using 2025 features. Launches already seen in Jan-Jul 2026 data are
flagged: the model never trained on them, so they are an out-of-sample check that updates as BTS
publishes new months.

Output: data/derived/predictions_2026.parquet (git-ignored: it contains Qloo-derived features).
Usage: python -m nonstop.predict   (from backend/)
"""
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from . import data, features, model

OUT = str(data.DERIVED / "predictions_{}.parquet")


def train_final(years=(2024, 2025)):
    frames = [features.build(y) for y in years]
    cols = model.feature_sets(years[0])["baseline + Qloo"]
    train = pd.concat(frames, ignore_index=True)
    X = train[cols].to_numpy(float)
    mu, sd = X.mean(0), X.std(0) + 1e-9
    clf = LogisticRegression(max_iter=3000, class_weight="balanced").fit((X - mu) / sd, train.label)
    return clf, cols, mu, sd


def contributions(row, clf, cols, mu, sd):
    """Each feature's push on the log-odds for this route, relative to an average candidate."""
    z = (row[cols].to_numpy(float) - mu) / sd
    return dict(zip(cols, (clf.coef_[0] * z).round(3)))


def run(year=2026):
    clf, cols, mu, sd = train_final()
    cand = features.build(year)
    X = cand[cols].to_numpy(float)
    cand["score"] = clf.predict_proba((X - mu) / sd)[:, 1]
    # Rank within each origin airport: "what is this airport missing?"
    cand["rank_at_origin"] = cand.groupby("origin").score.rank(ascending=False, method="first").astype(int)
    cand["already_launched"] = cand.label.astype(bool)
    cand.drop(columns=["label"]).to_parquet(OUT.format(year))
    meta = {"coef": dict(zip(cols, clf.coef_[0].round(4))), "mu": mu.tolist(), "sd": sd.tolist(), "cols": cols}
    pd.Series(meta).to_json(data.DERIVED / f"model_{year}.json")
    return cand


def replay(year=2025):
    """What the model would have said at the start of `year`: trained only on earlier launch years.

    Returns candidates for `year` with score, rank at origin, and the label (did it launch). Used by
    the time-machine replay, so nothing from `year` leaks into the predictions it shows.
    """
    path = data.DERIVED / f"replay_{year}.parquet"
    if path.exists():
        return pd.read_parquet(path)
    clf, cols, mu, sd = train_final(years=tuple(range(2024, year)))
    cand = features.build(year)
    cand["score"] = clf.predict_proba((cand[cols].to_numpy(float) - mu) / sd)[:, 1]
    cand["rank_at_origin"] = cand.groupby("origin").score.rank(ascending=False, method="first").astype(int)
    cand.to_parquet(path)
    return cand


if __name__ == "__main__":
    c = run()
    top = c[c.rank_at_origin <= 10]
    print(f"candidates {len(c)} | origins {c.origin.nunique()} | 2026 launches seen so far: {int(c.already_launched.sum())}")
    print(f"of those, in their origin's top 10: {int(top.already_launched.sum())} "
          f"({top.already_launched.sum() / max(1, c.already_launched.sum()):.0%})")
    print(c.sort_values("score", ascending=False).head(15)[["origin", "dest", "dest_name", "km", "score", "already_launched"]].to_string(index=False))
