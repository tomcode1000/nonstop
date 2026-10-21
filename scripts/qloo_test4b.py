"""Pre-declared follow-ups to kill test 4 (declared Oct 20 before running):

(A) Survival: among brand-new 2024 markets, does Qloo affinity predict still being served in 2025,
    beyond distance and airport size (2023 seats)?
(B) Leisure carriers: for 2025 launches flown by Allegiant, Breeze, Avelo, Sun Country, Frontier or
    Spirit, is Qloo's lift over the baseline larger than for all launches (test 4: +0.011 AUC)?

Usage: .venv/Scripts/python scripts/qloo_test4b.py
"""
import csv
import io
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
import qloo_client  # noqa: E402

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
LEISURE = {"G4", "MX", "XP", "SY", "F9", "NK"}
MIN_KM, MAX_KM, CATCHMENT_KM = 300, 4000, 100

airports = {}
for r in csv.DictReader(open(RAW / "airports.csv", encoding="utf8")):
    if r["iso_country"] == "US" and r["iata_code"]:
        lat, lon = float(r["latitude_deg"]), float(r["longitude_deg"])
        if 24 <= lat <= 50 and -125 <= lon <= -66:
            airports[r["iata_code"]] = (lat, lon, r["municipality"])


def load(year):
    months, seats, carriers = defaultdict(set), Counter(), defaultdict(set)
    with zipfile.ZipFile(RAW / f"t100_{year}.zip") as z:
        for r in csv.DictReader(io.TextIOWrapper(z.open("T_T100D_SEGMENT_US_CARRIER_ONLY.csv"), encoding="latin-1")):
            s, d = float(r["SEATS"] or 0), float(r["DEPARTURES_SCHEDULED"] or 0)
            if s <= 0:
                continue
            seats[r["ORIGIN"]] += s
            if d >= 4:
                p = tuple(sorted((r["ORIGIN"], r["DEST"])))
                months[p].add(int(r["MONTH"]))
                carriers[p].add(r["UNIQUE_CARRIER"])
    return months, seats, carriers


Y = {y: load(y) for y in (2023, 2024, 2025)}
dist = lambda a, b: km(airports[a][:2], airports[b][:2])
heat_cache = {}


def affinity_rows(dest_list, candidates):
    """candidates(d) -> list of (origin, label). Returns rows (d, o, label, affinity)."""
    rows = []
    for d in dest_list:
        lat, lon, city = airports[d]
        if d not in heat_cache:
            heat_cache[d] = None
            _, body = get("/search", {"query": city, "types": "urn:entity:destination", "take": 5})
            hit = next((h for h in entities(body) if "lat" in (h.get("location") or {})
                        and km((h["location"]["lat"], h["location"]["lon"]), (lat, lon)) <= 80), None)
            if hit:
                _, hb = get("/v2/insights", {"filter.type": "urn:heatmap", "signal.interests.entities": hit["entity_id"], "filter.location": US})
                cells = (hb.get("results") or {}).get("heatmap", []) if isinstance(hb, dict) else []
                if len(cells) >= 500:
                    heat_cache[d] = np.array([[c["location"]["latitude"], c["location"]["longitude"], c["query"]["affinity"]] for c in cells])
        pts = heat_cache[d]
        if pts is None:
            continue
        for o, label in candidates(d):
            olat, olon = airports[o][:2]
            dlat = np.radians(pts[:, 0] - olat); dlon = np.radians(pts[:, 1] - olon)
            h = np.sin(dlat / 2) ** 2 + np.cos(np.radians(olat)) * np.cos(np.radians(pts[:, 0])) * np.sin(dlon / 2) ** 2
            near = pts[6371 * 2 * np.arcsin(np.sqrt(h)) <= CATCHMENT_KM, 2]
            if len(near):
                rows.append((d, o, label, float(near.mean())))
    return rows


def evaluate(rows, seats, title, pct_pool=None):
    d_idx = np.array([r[0] for r in rows]); y = np.array([r[2] for r in rows]); aff = np.array([r[3] for r in rows])
    pct = np.zeros_like(aff)
    for d in set(d_idx):
        m = d_idx == d
        pool = aff[m] if pct_pool is None else pct_pool[d]
        pct[m] = np.searchsorted(np.sort(pool), aff[m]) / max(1, len(pool) - 1)
    Xb = np.column_stack([np.log([dist(r[0], r[1]) for r in rows]), np.log([dist(r[0], r[1]) for r in rows]) ** 2,
                          np.log([max(seats[r[1]], 1) for r in rows]), np.log([max(seats[r[0]], 1) for r in rows])])
    Xf = np.column_stack([Xb, pct])

    def cv(X):
        p = np.zeros(len(y))
        for tr, te in GroupKFold(n_splits=5).split(X, y, groups=d_idx):
            mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-9
            p[te] = LogisticRegression(max_iter=2000, class_weight="balanced").fit((X[tr] - mu) / sd, y[tr]).predict_proba((X[te] - mu) / sd)[:, 1]
        return p

    pb, pf = cv(Xb), cv(Xf)
    rng = np.random.default_rng(7); ds = np.array(sorted(set(d_idx))); lifts = []
    for _ in range(300):
        idx = np.concatenate([np.where(d_idx == d)[0] for d in rng.choice(ds, len(ds))])
        if 0 < y[idx].sum() < len(idx):
            lifts.append(roc_auc_score(y[idx], pf[idx]) - roc_auc_score(y[idx], pb[idx]))
    lo, hi = np.percentile(lifts, [5, 95])
    print(f"\n== {title} ==")
    print(f"rows {len(rows)} | positives {y.sum()} | destinations {len(ds)}")
    print(f"mean affinity percentile: positive {pct[y == 1].mean():.2f} vs negative {pct[y == 0].mean():.2f} | Qloo-only AUC {roc_auc_score(y, pct):.3f}")
    print(f"CV AUC baseline {roc_auc_score(y, pb):.3f} -> +Qloo {roc_auc_score(y, pf):.3f} | lift {roc_auc_score(y, pf) - roc_auc_score(y, pb):+.3f}, 90% CI [{lo:+.3f}, {hi:+.3f}]")


# ---------------------------------------------------------------- (A) survival of 2024 launches
m23, s23, _ = Y[2023]; m24, s24, _ = Y[2024]; m25, s25, c25 = Y[2025]
uni23 = {a for a in airports if s23[a] >= 50_000}
new24 = {p for p, ms in m24.items() if len(ms) >= 2 and p not in m23 and p[0] in uni23 and p[1] in uni23
         and MIN_KM <= dist(*p) <= MAX_KM}
surv = {p: int(len(m25.get(p, ())) >= 2) for p in new24}
ends = Counter(a for p in new24 for a in p)
destsA = [a for a, n in ends.most_common() if n >= 3][:50]
print(f"(A) brand-new 2024 markets: {len(new24)}, survived into 2025 (>=2 months): {sum(surv.values())}")
rowsA = affinity_rows(destsA, lambda d: [(p[0] if p[1] == d else p[1], surv[p]) for p in new24 if d in p])
# Percentile of each launched origin's affinity among ALL candidate origins for that destination.
pool = {}
for d in destsA:
    if heat_cache.get(d) is None:
        continue
    cand = [o for o in uni23 if o != d and MIN_KM <= dist(o, d) <= MAX_KM]
    pool[d] = np.array([r[3] for r in affinity_rows([d], lambda _d, c=cand: [(o, 0) for o in c])])
evaluate(rowsA, s23, "(A) survival of brand-new 2024 markets (label = still served in 2025)", pct_pool=pool)

# ---------------------------------------------------------------- (B) leisure-carrier launches 2025
uni24 = {a for a in airports if s24[a] >= 50_000}
new25 = {p for p, ms in m25.items() if len(ms) >= 2 and p not in m24 and p[0] in uni24 and p[1] in uni24
         and MIN_KM <= dist(*p) <= MAX_KM}
leis = {p for p in new25 if c25[p] & LEISURE}
other = new25 - leis
ends = Counter(a for p in leis for a in p)
destsB = [a for a, n in ends.most_common() if n >= 2][:50]
print(f"\n(B) brand-new 2025 markets: {len(new25)}, flown by a leisure carrier: {len(leis)}")


def candB(d):
    out = []
    for o in uni24:
        p = tuple(sorted((o, d)))
        if o == d or p in m24 or p in other or not MIN_KM <= dist(o, d) <= MAX_KM:
            continue
        out.append((o, int(p in leis)))
    return out


evaluate(affinity_rows(destsB, candB), s24, "(B) 2025 launches by leisure carriers (other launches excluded)")
print(f"\nLive Qloo calls this run: {qloo_client.calls}")
