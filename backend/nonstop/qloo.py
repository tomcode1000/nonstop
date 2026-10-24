"""Qloo client for Nonstop.

Reads QLOO_API_KEY from the environment or the project .env (never printed). Every response is cached
in .cache/qloo/ (git-ignored, never committed: the hackathon rules forbid publishing Qloo data), live
calls are throttled under the 5 requests/second limit, and retryable errors back off and retry.
"""
import hashlib
import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://hackathon.api.qloo.com"
CACHE = ROOT / ".cache" / "qloo"
CACHE.mkdir(parents=True, exist_ok=True)
US = "POLYGON((-125 24, -66 24, -66 50, -125 50, -125 24))"
calls = 0


def _key():
    if os.environ.get("QLOO_API_KEY"):
        return os.environ["QLOO_API_KEY"]
    for line in open(ROOT / ".env", encoding="utf8"):
        if line.startswith("QLOO_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("QLOO_API_KEY is not set")


def get(path, params, retries=4):
    """GET a Qloo endpoint. Returns (status, body); body is parsed JSON on 200, else an error string."""
    global calls
    url = BASE + path + "?" + urllib.parse.urlencode(params, doseq=True)
    cached = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".json")
    if cached.exists():
        return 200, json.loads(cached.read_text(encoding="utf8"))
    for attempt in range(retries):
        time.sleep(0.25)
        calls += 1
        req = urllib.request.Request(url, headers={"X-Api-Key": _key(), "accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = json.load(r)
            cached.write_text(json.dumps(body), encoding="utf8")
            return 200, body
        except urllib.error.HTTPError as err:
            if err.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            return err.code, err.read().decode("utf8", "ignore")[:300]
        except OSError as err:
            if attempt == retries - 1:
                return 0, str(err)
            time.sleep(2 ** attempt)
    return 0, "unreachable"


LIVE_TTL = 3600
_live_memo = {}


def live(path, params):
    """GET Qloo now, bypassing the disk cache. Returns (status, body, ms, fresh).

    Used by the app at request time. A one-hour in-memory memo stops repeat questions from spending
    the 10k-a-month hackathon quota; nothing is written to disk. `fresh` is False when the memo
    answered, and `ms` is then the original call's time.
    """
    global calls
    url = BASE + path + "?" + urllib.parse.urlencode(params, doseq=True)
    hit = _live_memo.get(url)
    if hit and time.time() - hit[0] < LIVE_TTL:
        return 200, hit[1], hit[2], False
    start = time.time()
    for attempt in range(3):
        if time.time() - start > 50:
            break
        calls += 1
        req = urllib.request.Request(url, headers={"X-Api-Key": _key(), "accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = json.load(r)
            ms = round((time.time() - start) * 1000)
            _live_memo[url] = (time.time(), body, ms)
            return 200, body, ms, True
        except urllib.error.HTTPError as err:
            if err.code in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            return err.code, err.read().decode("utf8", "ignore")[:300], round((time.time() - start) * 1000), True
        except OSError as err:
            if attempt == 2:
                return 0, str(err), round((time.time() - start) * 1000), True
            time.sleep(2 ** attempt)
    return 0, "timed out", round((time.time() - start) * 1000), True


def entities(body):
    if not isinstance(body, dict):
        return []
    res = body.get("results")
    if isinstance(res, list):
        return res
    if isinstance(res, dict):
        return res.get("entities") or []
    return []


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    return 6371 * 2 * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2
                                          + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))


def destination_near(lat, lon, names=()):
    """The Qloo destination an airport serves: the top-ranked destination within 60 km, else within 80 km.

    Name search alone is unreliable ("Key West" resolves to West Hollywood; "Valparaiso" is the town
    beside Destin's airport), so this first asks Qloo for destinations around the airport's
    coordinates. Some towns only come back from name search (Jackson Hole), so `names` are tried
    next, accepting a hit only if it lies within 80 km. Returns {id, name, km} or None.
    """
    found = _near_point(lat, lon)
    for limit in (60, 80):
        within = [f for f in found if f["km"] <= limit]
        if within:
            return within[0]
    for name in names:
        _, body = get("/search", {"query": name, "types": "urn:entity:destination", "take": 5})
        for e in entities(body):
            loc = e.get("location") or {}
            if "lat" in loc and km((loc["lat"], loc["lon"]), (lat, lon)) <= 80:
                return {"id": e["entity_id"], "name": e.get("name"), "km": km((loc["lat"], loc["lon"]), (lat, lon))}
    return None


def _near_point(lat, lon):
    _, body = get("/v2/insights", {"filter.type": "urn:entity:destination", "filter.location": f"POINT({lon} {lat})",
                                   "filter.location.radius": 80000, "take": 10})
    found = []
    for e in entities(body):
        loc = e.get("location") or {}
        if "lat" in loc:
            found.append({"id": e["entity_id"], "name": e.get("name"), "km": km((loc["lat"], loc["lon"]), (lat, lon))})
    return found


def heatmap(entity_id):
    """US-wide affinity heatmap for one entity as an array of [lat, lon, affinity, popularity] (may be empty)."""
    _, body = get("/v2/insights", {"filter.type": "urn:heatmap", "signal.interests.entities": entity_id, "filter.location": US})
    cells = (body.get("results") or {}).get("heatmap", []) if isinstance(body, dict) else []
    return np.array([[c["location"]["latitude"], c["location"]["longitude"],
                      c["query"].get("affinity", np.nan), c["query"].get("popularity", np.nan)] for c in cells]).reshape(-1, 4)


def catchment_mean(cells, lat, lon, radius_km=100):
    """Mean affinity of heatmap cells within radius_km of a point (NaN when no cell is that close)."""
    if len(cells) == 0:
        return float("nan")
    dlat = np.radians(cells[:, 0] - lat)
    dlon = np.radians(cells[:, 1] - lon)
    h = np.sin(dlat / 2) ** 2 + np.cos(np.radians(lat)) * np.cos(np.radians(cells[:, 0])) * np.sin(dlon / 2) ** 2
    near = cells[6371 * 2 * np.arcsin(np.sqrt(h)) <= radius_km, 2]
    return float(near.mean()) if len(near) else float("nan")
