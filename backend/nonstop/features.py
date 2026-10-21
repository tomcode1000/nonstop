"""Candidate routes and their features.

A candidate is an (origin O, destination D) airport pair with no service in year Y-1, where D is a
leisure destination (a leisure airline served it in Y-1) and O is a real airport (>= 50k departing
seats in Y-1), 300-4,000 km apart. Every feature is measured in Y-1, before any Y launch; the label
is whether a leisure airline launched the pair in year Y.

Qloo features come from one US-wide heatmap per destination (signal = D's Qloo destination entity):
  qloo_aff      mean affinity of the heatmap cells within 100 km of O (O's appetite for D)
  qloo_pct_dest O's affinity percentile among all candidate origins for D (who wants D most?)
  qloo_rel_orig O's affinity for D minus O's mean affinity over all destinations (what O wants most)
Caveat: Qloo data is a 2026 snapshot, so the backtest can be flattered by taste that formed after
the launches it is scoring. The pre-registered forward test is the clean check.
"""
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from . import data, qloo

FEATURE_CACHE = data.ROOT / ".cache" / "features"
FEATURE_CACHE.mkdir(parents=True, exist_ok=True)
MIN_SEATS = 50_000

BASELINE = ["log_km", "log_km2", "log_seats_o", "log_seats_d", "leisure_carriers_o", "leisure_carriers_d",
            "log_pax", "connect_share", "log_fare", "metro_served", "log_metro_pax"]
METRO_KM = 70   # airports this close share a market (Everett and Seattle, St. Pete and Tampa)
QLOO = ["qloo_aff", "qloo_pct_dest", "qloo_rel_orig"]


def universe(year):
    ap, seats = data.airports(), data.airport_seats(year)
    return sorted(i for i in seats.index[seats >= MIN_SEATS] if i in ap.index and ap.at[i, "lower48"])


def leisure_destinations(year):
    s = data.service(year)
    served = {x for p in s.index[s.leisure & (s.months >= 1)] for x in p}
    return sorted(served & set(universe(year)))


def destination_heatmaps(dests):
    """{airport: (qloo destination dict, heatmap cells)}; cached on disk (git-ignored)."""
    path = FEATURE_CACHE / "dest_heatmaps.pkl"
    store = pickle.loads(path.read_bytes()) if path.exists() else {}
    ap = data.airports()
    for d in dests:
        if d in store and store[d][0] is not None:
            continue
        # Candidate names: the airport's town, plus the place names in its official name
        # ("Jackson Hole Airport" -> "Jackson Hole", "Akron Canton Regional Airport" -> "Akron", "Canton").
        name = ap.at[d, "name"]
        for word in ("International", "Regional", "Municipal", "County", "Airport", "Field", "Air Terminal"):
            name = name.replace(word, " ")
        names = [ap.at[d, "city"]] + [n.strip() for n in name.replace("/", "-").split("-") if n.strip()]
        dest = qloo.destination_near(ap.at[d, "lat"], ap.at[d, "lon"], names=list(dict.fromkeys(names)))
        cells = qloo.heatmap(dest["id"]) if dest else np.empty((0, 4))
        store[d] = (dest, cells)
        path.write_bytes(pickle.dumps(store))
    return {d: store[d] for d in dests}


def origin_tastes(origins):
    """{origin airport: {qloo destination id: rank}}: the destinations Qloo says the area around each
    airport loves most (top 50, nearby places excluded by the caller). Cached on disk (git-ignored)."""
    path = FEATURE_CACHE / "origin_tastes.pkl"
    store = pickle.loads(path.read_bytes()) if path.exists() else {}
    ap = data.airports()
    for o in origins:
        if o in store:
            continue
        lat, lon = ap.at[o, "lat"], ap.at[o, "lon"]
        _, body = qloo.get("/v2/insights", {"filter.type": "urn:entity:destination",
                                            "signal.location": f"POINT({lon} {lat})", "take": 50})
        store[o] = {e["entity_id"]: i + 1 for i, e in enumerate(qloo.entities(body))}
        path.write_bytes(pickle.dumps(store))
    return {o: store[o] for o in origins}


def leisure_presence(year):
    """Number of distinct leisure airlines serving each airport in `year` (a proxy for nearby bases)."""
    s = data.service(year)
    out = {}
    for (a, b), row in s[s.months >= 1].iterrows():
        for x in (a, b):
            out.setdefault(x, set()).update(row.carriers & data.LEISURE.keys())
    return {k: len(v) for k, v in out.items()}


def metro_neighbours(codes):
    """{airport: [other airports within METRO_KM]} for the given airports."""
    ap = data.airports().loc[list(codes)]
    lat, lon = np.radians(ap.lat.to_numpy()), np.radians(ap.lon.to_numpy())
    out = {}
    for i, code in enumerate(ap.index):
        h = np.sin((lat - lat[i]) / 2) ** 2 + np.cos(lat[i]) * np.cos(lat) * np.sin((lon - lon[i]) / 2) ** 2
        km = 6371 * 2 * np.arcsin(np.sqrt(h))
        out[code] = [c for c, k in zip(ap.index, km) if c != code and k <= METRO_KM]
    return out


def build(year):
    """Feature frame for launches in `year`, using only year-1 information (plus the Qloo snapshot)."""
    prev = year - 1
    ap = data.airports()
    origins, dests = universe(prev), leisure_destinations(prev)
    served_prev = data.served(prev)
    seats = data.airport_seats(prev)
    lp = leisure_presence(prev)
    demand = data.db1b(prev)
    heat = destination_heatmaps(dests)
    launched = data.launches(year)
    leisure_launch = set(launched.index[launched.leisure])
    other_launch = set(launched.index[~launched.leisure])
    # Metro view: airports within METRO_KM of each end, using every airport in the T-100 data.
    all_codes = sorted({x for p in data.service(prev).index for x in p} & set(ap.index))
    near = metro_neighbours(all_codes)
    pax = demand.pax.to_dict() if not demand.empty else {}
    tastes = origin_tastes(origins)

    def metro(code):
        return [code] + near.get(code, [])

    rows = []
    for d in dests:
        dest, cells = heat[d]
        if dest is None or len(cells) < 500:
            continue
        for o in origins:
            pair = data._pair(o, d)
            if o == d or pair in served_prev or pair in other_launch:
                continue
            km = data.distance_km(o, d)
            if not data.MIN_KM <= km <= data.MAX_KM:
                continue
            dm = demand.loc[pair] if pair in demand.index else None
            # Is the destination's metro already reachable nonstop from the origin's metro?
            via = [f"{x}-{z}" for x in metro(o) for z in metro(d)
                   if (x, z) != (o, d) and data._pair(x, z) in served_prev]
            metro_pax = sum(pax.get(data._pair(x, z), 0.0) for x in metro(o) for z in metro(d) if x != z)
            rows.append({
                "metro_served": int(bool(via)), "metro_via": ",".join(via[:3]),
                "log_metro_pax": np.log1p(metro_pax), "metro_pax": metro_pax,
                "origin": o, "dest": d, "dest_name": dest["name"], "km": km,
                "log_km": np.log(km), "log_km2": np.log(km) ** 2,
                "log_seats_o": np.log(max(seats.get(o, 1), 1)), "log_seats_d": np.log(max(seats.get(d, 1), 1)),
                "leisure_carriers_o": lp.get(o, 0), "leisure_carriers_d": lp.get(d, 0),
                "pax": float(dm.pax) if dm is not None else 0.0,
                "log_pax": np.log1p(float(dm.pax)) if dm is not None else 0.0,
                "connect_share": float(dm.connect_share) if dm is not None and pd.notna(dm.connect_share) else 0.0,
                "avg_fare": float(dm.avg_fare) if dm is not None and pd.notna(dm.avg_fare) else np.nan,
                "qloo_aff": qloo.catchment_mean(cells, ap.at[o, "lat"], ap.at[o, "lon"]),
                # Where D sits in the origin area's own Qloo top-50 destinations (1 = top, 0 = absent).
                "qloo_origin_rank": (51 - tastes[o][dest["id"]]) / 50 if dest["id"] in tastes.get(o, {}) else 0.0,
                "label": int(pair in leisure_launch),
            })
    df = pd.DataFrame(rows)
    fare = df.avg_fare.where(df.avg_fare > 0)
    df["log_fare"] = np.log(fare.fillna(fare.median() if fare.notna().any() else 1.0))
    df = df[df.qloo_aff.notna()].copy()
    df["qloo_pct_dest"] = df.groupby("dest").qloo_aff.rank(pct=True)
    df["qloo_rel_orig"] = df.qloo_aff - df.groupby("origin").qloo_aff.transform("mean")
    df["year"] = year
    return df.reset_index(drop=True)
