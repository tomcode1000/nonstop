"""Read-side of Nonstop: predictions, route explanations and lookups shared by the API and the agent."""
import json
from functools import lru_cache

import numpy as np
import pandas as pd

from . import data, matchmaker, predict

YEAR = 2026

# Features that only make sense together (distance and distance squared; the three Qloo views) are
# reported as one driver, otherwise their large opposite pushes cancel and mislead.
DRIVER_GROUPS = {
    "Distance": ["log_km", "log_km2"],
    "Airport sizes": ["log_seats_o", "log_seats_d"],
    "Leisure airlines already there": ["leisure_carriers_o", "leisure_carriers_d"],
    "Existing ticket demand": ["log_pax", "connect_share", "log_fare", "log_metro_pax"],
    "Nearby airport already served": ["metro_served"],
    "Qloo taste": ["qloo_aff", "qloo_pct_dest", "qloo_rel_orig"],
}


@lru_cache
def predictions():
    path = predict.OUT.format(YEAR)
    try:
        df = pd.read_parquet(path)
    except FileNotFoundError:
        df = predict.run(YEAR)
    # Launch score 0-100: percentile of the model score across all candidates (scores are not calibrated
    # probabilities, because training reweights the rare launches).
    df["launch_score"] = (df.score.rank(pct=True) * 100).round(1)
    return df


@lru_cache
def model_meta():
    return json.loads((data.DERIVED / f"model_{YEAR}.json").read_text())


@lru_cache
def matcher():
    return matchmaker.Matchmaker()


@lru_cache
def stations():
    return matchmaker.stations_by_carrier(YEAR - 1)


def city(code):
    ap = data.airports()
    return f"{ap.at[code, 'city']}, {ap.at[code, 'state']}" if code in ap.index else code


def drivers(r):
    meta = model_meta()
    coef, mu, sd = np.array(list(meta["coef"].values())), np.array(meta["mu"]), np.array(meta["sd"])
    push = dict(zip(meta["cols"], coef * ((r[meta["cols"]].to_numpy(float) - mu) / sd)))
    grouped = {name: sum(push[f] for f in cols if f in push) for name, cols in DRIVER_GROUPS.items()
               if any(f in push for f in cols)}
    return [{"driver": name, "push": round(float(v), 3)} for name, v in sorted(grouped.items(), key=lambda kv: -abs(kv[1]))]


def _own_pct(origin, r):
    df = predictions()
    mine = df.loc[df.origin == origin, "qloo_aff"]
    return float((mine < r.qloo_aff).mean())


def _new_market_rank(origin, r):
    """Rank among the origin's candidates that are genuinely new markets (what the app lists)."""
    df = predictions()
    fresh = df[(df.origin == origin) & (df.metro_served == 0)]
    return int((fresh.score > r.score).sum()) + 1 if not r.metro_served else None


def route_payload(origin, r, rank=None):
    """Everything Nonstop knows about one candidate route, as plain JSON-ready values."""
    ap = data.airports()
    return {
        "origin": origin, "origin_city": city(origin),
        "dest": r.dest, "dest_city": city(r.dest), "qloo_destination": r.dest_name,
        "lat": ap.at[r.dest, "lat"], "lon": ap.at[r.dest, "lon"], "km": round(r.km),
        # rank = position in the airport's list of new markets (as shown in the app);
        # overall_rank also counts second-airport options.
        "rank": rank if rank is not None else _new_market_rank(origin, r), "overall_rank": int(r.rank_at_origin),
        "launch_score": float(r.launch_score),
        "second_airport_via": r.metro_via.split(",")[0] if r.metro_served else None,
        "qloo_origin_list_rank": None if r.qloo_origin_rank <= 0 else int(round(51 - r.qloo_origin_rank * 50)),
        "already_launched_2026": bool(r.already_launched),
        "qloo": {"affinity": round(float(r.qloo_aff), 3),
                 # share of all US towns that could fly to this destination whose taste for it is lower
                 "rank_among_towns": round(float(r.qloo_pct_dest), 3),
                 # share of this origin's other candidate destinations it likes less than this one
                 "rank_among_own_options": round(float(_own_pct(origin, r)), 3),
                 "vs_own_options": round(float(r.qloo_rel_orig), 3)},
        "demand": {"passengers_per_year": round(float(r.pax)), "metro_passengers_per_year": round(float(r.metro_pax)),
                   "connect_share": round(float(r.connect_share), 3),
                   "avg_fare": None if pd.isna(r.avg_fare) else round(float(r.avg_fare), 2),
                   "annual_spend_usd": None if pd.isna(r.avg_fare) else round(float(max(r.pax, r.metro_pax) * r.avg_fare))},
        "drivers": drivers(r),
        "airlines": matcher().rank(origin, r.dest, r.km, stations())[:3],
    }


def opportunities(code, limit=15, second_airports=False):
    """Top missing leisure routes for an airport (raises LookupError if Nonstop has none)."""
    code = code.upper()
    df = predictions()
    g = df[df.origin == code]
    if not second_airports:
        g = g[g.metro_served == 0]
    g = g.sort_values("rank_at_origin").head(limit)
    if g.empty:
        raise LookupError(f"No candidate routes for {code}")
    ap = data.airports()
    return {"airport": code, "city": city(code), "lat": ap.at[code, "lat"], "lon": ap.at[code, "lon"],
            "opportunities": [route_payload(code, r, i + 1) for i, (_, r) in enumerate(g.iterrows())]}


def route(origin, dest):
    """One specific candidate route (raises LookupError if it is not a candidate, e.g. already flown)."""
    origin, dest = origin.upper(), dest.upper()
    df = predictions()
    hit = df[(df.origin == origin) & (df.dest == dest)]
    if hit.empty:
        served = data._pair(origin, dest) in data.served(YEAR - 1)
        raise LookupError(f"{origin}-{dest} is {'already flown nonstop' if served else 'not a candidate leisure route'}")
    return route_payload(origin, hit.iloc[0])


def find_airports(query, limit=8):
    """Airports Nonstop covers whose code, city, state or name matches the query."""
    q = query.strip().lower()
    ap = data.airports()
    covered = set(predictions().origin.unique())
    hits = [c for c in sorted(covered)
            if q == c.lower() or q in ap.at[c, "city"].lower() or q == ap.at[c, "state"].lower() or q in ap.at[c, "name"].lower()]
    return [{"code": c, "city": city(c), "name": ap.at[c, "name"]} for c in hits[:limit]]


def search_routes(origin_states=None, dest_states=None, dest_codes=None, exclude_second_airports=True,
                  top_per_origin=10, limit=15):
    """Best candidate routes nationally, filtered by origin/destination state or destination airports.

    Ranked by launch score, keeping only routes that are within their origin airport's top
    `top_per_origin` (the per-airport view is what the model is validated on)."""
    df = predictions()
    ap = data.airports()
    g = df[df.rank_at_origin <= top_per_origin]
    if exclude_second_airports:
        g = g[g.metro_served == 0]
    if origin_states:
        g = g[g.origin.map(lambda c: ap.at[c, "state"]).isin([s.upper() for s in origin_states])]
    if dest_states:
        g = g[g.dest.map(lambda c: ap.at[c, "state"]).isin([s.upper() for s in dest_states])]
    if dest_codes:
        g = g[g.dest.isin([c.upper() for c in dest_codes])]
    g = g.sort_values("score", ascending=False).head(limit)
    return [{"origin": r.origin, "origin_city": city(r.origin), "dest": r.dest, "dest_city": city(r.dest),
             "launch_score": float(r.launch_score), "rank_at_origin": int(r.rank_at_origin),
             "qloo_affinity": round(float(r.qloo_aff), 3), "already_launched_2026": bool(r.already_launched)}
            for _, r in g.iterrows()]


def backtest_summary():
    out = json.loads((data.DERIVED / "backtest.json").read_text())
    df = predictions()
    seen = df[df.already_launched]
    t100, _ = data.t100()
    out["forward"] = {"year": YEAR, "through_month": int(t100[t100.year == YEAR].month.max()),
                      "launches_seen": int(len(seen)), "in_top10": int((seen.rank_at_origin <= 10).sum())}
    rp = predict.replay(2025)
    launched = rp[rp.label == 1]
    out["replay"] = {"year": 2025, "launches": int(len(launched)), "in_top10": int((launched.rank_at_origin <= 10).sum())}
    return out
