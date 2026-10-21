"""Kill test 4: did 2025's new nonstop markets have higher Qloo affinity than markets that did not launch?

For each of the most common 2025 launch endpoints D, one nationwide Qloo heatmap (signal = D's
destination entity) gives the affinity of every other airport's catchment for D. Within each D,
airports that gained a brand-new nonstop to D in 2025 are compared with airports that did not,
using only pre-period (2024) information for the controls (distance, airport seats).

Usage: .venv/Scripts/python scripts/qloo_test4.py
"""
import csv
import io
import json
import math
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qloo_client import US, entities, get, km  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
N_DEST = 50
CATCHMENT_KM = 100
MIN_KM, MAX_KM = 300, 4000


def lower48(lat, lon):
    return 24 <= lat <= 50 and -125 <= lon <= -66


# ---------------------------------------------------------------- airports
airports = {}
for r in csv.DictReader(open(RAW / "airports.csv", encoding="utf8")):
    if r["iso_country"] == "US" and r["iata_code"] and r["type"] in ("large_airport", "medium_airport", "small_airport"):
        lat, lon = float(r["latitude_deg"]), float(r["longitude_deg"])
        if lower48(lat, lon):
            airports[r["iata_code"]] = (lat, lon, r["municipality"], r["iso_region"][3:])


# ---------------------------------------------------------------- service by year (T-100)
def load(year):
    months, seats = defaultdict(set), Counter()
    with zipfile.ZipFile(RAW / f"t100_{year}.zip") as z:
        for r in csv.DictReader(io.TextIOWrapper(z.open("T_T100D_SEGMENT_US_CARRIER_ONLY.csv"), encoding="latin-1")):
            s, d = float(r["SEATS"] or 0), float(r["DEPARTURES_SCHEDULED"] or 0)
            if s <= 0:
                continue
            seats[r["ORIGIN"]] += s
            if d >= 4:
                months[tuple(sorted((r["ORIGIN"], r["DEST"])))].add(int(r["MONTH"]))
    return months, seats


m24, seats24 = load(2024)
m25, _ = load(2025)
universe = {a for a in airports if seats24[a] >= 50_000}          # real scheduled airports in 2024
dist = lambda a, b: km(airports[a][:2], airports[b][:2])
new25 = {p for p, ms in m25.items() if len(ms) >= 2 and p not in m24
         and p[0] in universe and p[1] in universe and MIN_KM <= dist(*p) <= MAX_KM}
print(f"Airports in universe: {len(universe)} | brand-new 2025 markets (both ends in universe, {MIN_KM}-{MAX_KM} km): {len(new25)}")

# ---------------------------------------------------------------- destinations to test
ends = Counter(a for p in new25 for a in p)
dests = [a for a, n in ends.most_common() if n >= 3][:N_DEST]
print(f"Testing {len(dests)} destinations (airports with >=3 new 2025 markets): {dests}")

resolved = {}
for a in dests:
    lat, lon, city, state = airports[a]
    status, body = get("/search", {"query": city, "types": "urn:entity:destination", "take": 5})
    best = None
    for h in entities(body):
        loc = h.get("location") or {}
        if "lat" in loc and km((loc["lat"], loc["lon"]), (lat, lon)) <= 80:
            best = h
            break
    if best:
        resolved[a] = best["entity_id"]
    else:
        print(f"   {a} ({city}, {state}): no Qloo destination within 80 km, skipped")
print(f"Resolved {len(resolved)}/{len(dests)} destinations to Qloo entities")

# ---------------------------------------------------------------- affinity per (origin, destination)
rows = []   # (dest, origin, label, affinity, distance, origin_seats, dest_seats)
for d, eid in resolved.items():
    status, body = get("/v2/insights", {"filter.type": "urn:heatmap", "signal.interests.entities": eid, "filter.location": US})
    cells = (body.get("results") or {}).get("heatmap", []) if isinstance(body, dict) else []
    if len(cells) < 500:
        print(f"   {d}: heatmap too thin ({len(cells)} cells), skipped")
        continue
    pts = np.array([[c["location"]["latitude"], c["location"]["longitude"], c["query"]["affinity"]] for c in cells])
    for o in universe:
        if o == d:
            continue
        pair = tuple(sorted((o, d)))
        if pair in m24:                      # already served before 2025: not a candidate
            continue
        dd = dist(o, d)
        if not MIN_KM <= dd <= MAX_KM:
            continue
        lat, lon = airports[o][:2]
        dlat = np.radians(pts[:, 0] - lat); dlon = np.radians(pts[:, 1] - lon)
        h = np.sin(dlat / 2) ** 2 + np.cos(np.radians(lat)) * np.cos(np.radians(pts[:, 0])) * np.sin(dlon / 2) ** 2
        near = pts[6371 * 2 * np.arcsin(np.sqrt(h)) <= CATCHMENT_KM, 2]
        if len(near) == 0:
            continue
        rows.append((d, o, int(pair in new25), float(near.mean()), dd, seats24[o], seats24[d]))

dest_idx = np.array([r[0] for r in rows])
y = np.array([r[2] for r in rows])
aff = np.array([r[3] for r in rows])
# Percentile of affinity among all candidate origins for the same destination.
pct = np.zeros_like(aff)
for d in set(dest_idx):
    m = dest_idx == d
    pct[m] = aff[m].argsort().argsort() / max(1, m.sum() - 1)
print(f"\nCandidate pairs: {len(rows)} | launched in 2025: {y.sum()}")

# ---------------------------------------------------------------- results
print(f"Mean affinity percentile: launched {pct[y == 1].mean():.2f} vs not launched {pct[y == 0].mean():.2f}")
print(f"AUC, Qloo affinity percentile alone: {roc_auc_score(y, pct):.3f}  (0.5 = no signal)")

X_base = np.column_stack([np.log([r[4] for r in rows]), np.log([r[4] for r in rows]) ** 2,
                          np.log([r[5] for r in rows]), np.log([r[6] for r in rows])])
X_full = np.column_stack([X_base, pct])


def cv_auc(X):
    p = np.zeros(len(y))
    for tr, te in GroupKFold(n_splits=5).split(X, y, groups=dest_idx):   # held-out destinations
        mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-9
        model = LogisticRegression(max_iter=2000, class_weight="balanced").fit((X[tr] - mu) / sd, y[tr])
        p[te] = model.predict_proba((X[te] - mu) / sd)[:, 1]
    return roc_auc_score(y, p), p


auc_base, p_base = cv_auc(X_base)
auc_full, p_full = cv_auc(X_full)
print(f"Cross-validated AUC (held-out destinations):")
print(f"   baseline (distance, airport sizes):        {auc_base:.3f}")
print(f"   baseline + Qloo affinity:                  {auc_full:.3f}   lift {auc_full - auc_base:+.3f}")


def hit_rate(p, k=10):
    hits = tot = 0
    for d in set(dest_idx):
        m = np.where(dest_idx == d)[0]
        if y[m].sum() == 0:
            continue
        top = m[np.argsort(-p[m])[:k]]
        hits += y[top].sum(); tot += y[m].sum()
    return hits / tot


print(f"Share of real 2025 launches found in each destination's top 10 origins:")
print(f"   baseline {hit_rate(p_base):.0%} | baseline + Qloo {hit_rate(p_full):.0%}")

# bootstrap over destinations for the lift
rng = np.random.default_rng(7)
ds = np.array(sorted(set(dest_idx)))
lifts = []
for _ in range(300):
    pick = rng.choice(ds, len(ds))
    idx = np.concatenate([np.where(dest_idx == d)[0] for d in pick])
    if 0 < y[idx].sum() < len(idx):
        lifts.append(roc_auc_score(y[idx], p_full[idx]) - roc_auc_score(y[idx], p_base[idx]))
lo, hi = np.percentile(lifts, [5, 95])
print(f"AUC lift 90% bootstrap interval (resampling destinations): [{lo:+.3f}, {hi:+.3f}]")
