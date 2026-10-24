"""Live Qloo: questions answered by calling Qloo at request time, not from the saved model inputs.

The ranked routes come from a model trained on saved Qloo data (so a backtest is possible). These
functions ask Qloo again, now, and work for any place Qloo knows, including destinations outside
Nonstop's 158. Each result carries a `qloo_calls` log (endpoint, milliseconds, fresh or memo).
"""
from datetime import datetime, timezone

import numpy as np

from . import data, qloo, service
from .service import YEAR, city


def _origin(code):
    code = code.upper()
    ap = data.airports()
    if code not in ap.index:
        raise LookupError(f"Unknown airport {code}")
    return code, float(ap.at[code, "lat"]), float(ap.at[code, "lon"])


def _call(log, label, path, params):
    status, body, ms, fresh = qloo.live(path, params)
    log.append({"endpoint": label, "ms": ms, "fresh": fresh, "ok": status == 200})
    if status != 200:
        raise RuntimeError(f"Qloo {label} returned {status}")
    return body


def _meta(log):
    return {"source": "Qloo Insights API, called live", "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "qloo_calls": log}


def _nearest_airport(lat, lon, codes, limit_km=80):
    """The airport a place flies from: the busiest within 60 km (Seattle is SEA, not Boeing Field),
    else the nearest within `limit_km`."""
    ap = data.airports().loc[list(codes)]
    seats = data.airport_seats(YEAR - 1).reindex(ap.index).fillna(0).to_numpy()
    d = np.array([qloo.km((lat, lon), (a, b)) for a, b in zip(ap.lat, ap.lon)])
    close = np.where(d <= 60)[0]
    if len(close):
        i = int(close[seats[close].argmax()])
        return ap.index[i], float(d[i])
    i = int(d.argmin())
    return (ap.index[i], float(d[i])) if d[i] <= limit_km else (None, None)


def served_airports():
    """Airports with real airline service last year (so a beach town maps to its airport, not an airfield)."""
    seats = data.airport_seats(YEAR - 1)
    ap = data.airports()
    return [c for c in seats.index[seats > 50000] if c in ap.index and ap.at[c, "lower48"]]


def _place(e, loc):
    region = ((e.get("properties") or {}).get("geocode") or {}).get("admin1_region")
    return {"id": e["entity_id"], "name": e.get("name"), "region": region, "lat": loc["lat"], "lon": loc["lon"]}


def _near_point(lat, lon, log):
    """The top Qloo destination within 60 km of a point (the same anchor the saved data uses)."""
    body = _call(log, "places near the airport", "/v2/insights", {"filter.type": "urn:entity:destination",
                 "filter.location": f"POINT({lon} {lat})", "filter.location.radius": 80000, "take": 10})
    for e in qloo.entities(body):
        loc = e.get("location") or {}
        if "lat" in loc and qloo.km((loc["lat"], loc["lon"]), (lat, lon)) <= 80:
            return _place(e, loc)
    return None


def _resolve_place(place, log):
    """A Qloo destination for an IATA code or a place name.

    Qloo's name search is fuzzy ("Key West" returns West Hollywood, and Key West itself never comes
    back), so a name is accepted only on an exact match; otherwise the place is looked up around the
    airport of a town with that name.
    """
    ap = data.airports()
    code = place.strip().upper()
    if len(code) == 3 and code in ap.index:
        hit = _near_point(float(ap.at[code, "lat"]), float(ap.at[code, "lon"]), log)
        if hit:
            return hit
        raise LookupError(f"Qloo has no destination near {code}")
    name = place.split(",")[0].strip().lower()
    body = _call(log, "search", "/search", {"query": place, "types": "urn:entity:destination", "take": 8})
    for e in qloo.entities(body):
        loc = e.get("location") or {}
        if "lat" in loc and (e.get("name") or "").lower() == name:
            return _place(e, loc)
    towns = [c for c in served_airports() if str(ap.at[c, "city"]).lower() == name]
    if towns:
        hit = _near_point(float(ap.at[towns[0], "lat"]), float(ap.at[towns[0], "lon"]), log)
        if hit:
            return hit
    seen = ", ".join(e.get("name", "?") for e in qloo.entities(body)[:5])
    raise LookupError(f"Qloo has no destination named '{place}'" + (f" (closest names: {seen})" if seen else ""))


def taste(origin, place):
    """How strongly the area around `origin` leans toward `place`, measured live from Qloo's US heatmap,
    and how that compares with every other airport Nonstop covers."""
    log = []
    origin, lat, lon = _origin(origin)
    dest = _resolve_place(place, log)
    body = _call(log, "heatmap", "/v2/insights", {"filter.type": "urn:heatmap", "signal.interests.entities": dest["id"],
                                                  "filter.location": qloo.US})
    cells = (body.get("results") or {}).get("heatmap", []) if isinstance(body, dict) else []
    grid = np.array([[c["location"]["latitude"], c["location"]["longitude"], c["query"].get("affinity", np.nan), 0]
                     for c in cells], dtype=float).reshape(-1, 4)
    if len(grid) == 0:
        raise LookupError(f"Qloo returned no heatmap for {dest['name']}")

    ap = data.airports()
    towns = {}
    for code in service.predictions().origin.unique():
        if code in ap.index:
            v = qloo.catchment_mean(grid, ap.at[code, "lat"], ap.at[code, "lon"])
            if np.isfinite(v):
                towns[code] = v
    mine = qloo.catchment_mean(grid, lat, lon)
    if not np.isfinite(mine):
        raise LookupError(f"Qloo's heatmap for {dest['name']} has no cells near {origin}")
    others = np.array([v for k, v in towns.items() if k != origin])
    top = sorted(towns.items(), key=lambda kv: -kv[1])[:5]

    dest_airport, _ = _nearest_airport(dest["lat"], dest["lon"], served_airports())
    served = bool(dest_airport) and data._pair(origin, dest_airport) in data.served(YEAR - 1)
    return {
        "origin": origin, "origin_city": city(origin),
        "qloo_destination": f"{dest['name']}, {dest['region']}" if dest["region"] else dest["name"],
        "distance_km": round(qloo.km((lat, lon), (dest["lat"], dest["lon"]))),
        "affinity": round(float(mine), 3),
        "ahead_of_share_of_towns": round(float((others < mine).mean()), 3),
        "towns_compared": int(len(others)),
        "towns_that_lean_most": [{"code": k, "city": city(k), "affinity": round(float(v), 3)} for k, v in top],
        "nearest_airport_to_destination": dest_airport,
        "already_nonstop_in_last_year": served,
        "heatmap_cells": int(len(grid)),
        **_meta(log),
    }


def wanted(origin, take=12):
    """The places Qloo says the area around `origin` loves most right now, beyond driving distance, each
    matched to its nearest airport, whether a nonstop exists, and Nonstop's launch score if ranked."""
    log = []
    origin, lat, lon = _origin(origin)
    body = _call(log, "places this area loves", "/v2/insights",
                 {"filter.type": "urn:entity:destination", "signal.location": f"POINT({lon} {lat})", "take": 50})
    lower48 = served_airports()
    served = data.served(YEAR - 1)
    df = service.predictions()
    scores = df[df.origin == origin].set_index("dest").launch_score.to_dict()
    out = []
    for rank, e in enumerate(qloo.entities(body), 1):
        loc = e.get("location") or {}
        geo = (e.get("properties") or {}).get("geocode") or {}
        if "lat" not in loc or geo.get("country_code") != "US":
            continue
        dist = qloo.km((lat, lon), (loc["lat"], loc["lon"]))
        if dist < data.MIN_KM:
            continue
        code, _ = _nearest_airport(loc["lat"], loc["lon"], lower48)
        if code == origin:
            continue
        out.append({
            "qloo_rank": rank, "place": e.get("name"), "region": geo.get("admin1_region"),
            "affinity": round(float((e.get("query") or {}).get("affinity", float("nan"))), 3),
            "distance_km": round(dist), "nearest_airport": code,
            "nonstop_exists": bool(code) and data._pair(origin, code) in served,
            "nonstop_launch_score": scores.get(code),
        })
        if len(out) >= take:
            break
    return {"origin": origin, "origin_city": city(origin), "places": out, **_meta(log)}
