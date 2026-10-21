"""Day-one kill tests for Nonstop (BRIEF.md section 8). Never prints the key.

1. Destination coverage  2. US heatmap for a destination signal  3. Location -> destination insight.
Usage: python -I scripts/qloo_killtest.py
"""
from qloo_client import US, entities, get, km
import qloo_client

# ---------------------------------------------------------------- 0. key
status, body = get("/search", {"query": "Nashville", "types": "urn:entity:destination", "take": 5})
print(f"[0] key check: /search status {status}")
if status != 200:
    raise SystemExit(f"Stop: {body}")

# ---------------------------------------------------------------- 1. coverage
DESTS = ["Orlando", "Las Vegas", "Nashville", "New Orleans", "Miami", "Denver", "Phoenix", "San Diego",
         "Honolulu", "Savannah", "Charleston", "Asheville", "Myrtle Beach", "Destin", "Key West", "Bozeman",
         "Jackson Hole", "Sedona", "Palm Springs", "Gatlinburg", "Branson", "Punta Gorda", "Sarasota",
         "Fort Myers", "Pensacola", "Gulf Shores", "Hilton Head Island", "Traverse City", "Bar Harbor",
         "Park City", "Lake Tahoe", "Santa Fe", "Austin", "Chicago", "New York City", "Boston", "Seattle",
         "Portland", "Salt Lake City", "Tampa"]
resolved = {}
for name in DESTS:
    status, body = get("/search", {"query": name, "types": "urn:entity:destination", "take": 3})
    hits = entities(body)
    if hits:
        h = hits[0]
        resolved[name] = (h.get("entity_id") or h.get("id"), h.get("name"), h.get("popularity"))
print(f"\n[1] destination coverage: {len(resolved)}/{len(DESTS)} resolved "
      f"({'PASS' if len(resolved) / len(DESTS) >= 0.85 else 'FAIL'} at >=85%)")
for name in DESTS:
    r = resolved.get(name)
    print(f"    {name:20s} -> " + (f"{r[1]}  (popularity {r[2]})" if r else "NOT FOUND"))

# ---------------------------------------------------------------- 2. US heatmap for a destination
CITIES = {"Chicago": (41.88, -87.63), "Boise": (43.62, -116.2), "Atlanta": (33.75, -84.39),
          "Minneapolis": (44.98, -93.27), "Dallas": (32.78, -96.8), "Boston": (42.36, -71.06),
          "Denver": (39.74, -104.99), "Seattle": (47.61, -122.33)}




print("\n[2] US heatmap for destination signals")
heat_ok = []
for name in ["Nashville", "Destin", "Las Vegas"]:
    if name not in resolved:
        print(f"    {name}: not resolved, skipped"); continue
    status, body = get("/v2/insights", {"filter.type": "urn:heatmap", "signal.interests.entities": resolved[name][0],
                                         "filter.location": US})
    cells = (body.get("results") or {}).get("heatmap", []) if isinstance(body, dict) else []
    print(f"    {name}: status {status}, {len(cells)} cells" + ("" if cells else f"  body={str(body)[:200]}"))
    if not cells:
        continue
    pts = [((c["location"]["latitude"], c["location"]["longitude"]), c["query"].get("affinity"), c["query"].get("popularity")) for c in cells]
    rows = []
    for city, ll in CITIES.items():
        near = [a for p, a, _ in pts if a is not None and km(p, ll) <= 120]
        rows.append((city, len(near), sum(near) / len(near) if near else None))
    print("      catchment (<=120 km) mean affinity: " + ", ".join(f"{c} {m:.3f} (n={n})" if m is not None else f"{c} -" for c, n, m in rows))
    vals = [m for _, _, m in rows if m is not None]
    spread = max(vals) - min(vals) if len(vals) > 1 else 0
    heat_ok.append(len(cells) >= 1000 and spread >= 0.05)
    print(f"      spread across cities: {spread:.3f}")
print(f"    -> {'PASS' if heat_ok and all(heat_ok) else 'FAIL'} (need >=1000 cells and >=0.05 spread between catchments)")

# ---------------------------------------------------------------- 3. location -> destination ranking
print("\n[3] origin -> destination insight (top 20)")
tops = {}
for origin in ["Minneapolis", "Atlanta", "Boise"]:
    status, body = get("/v2/insights", {"filter.type": "urn:entity:destination", "signal.location.query": origin, "take": 20})
    names = [e.get("name") for e in entities(body)]
    tops[origin] = names
    print(f"    {origin}: status {status}, {len(names)} results: {names[:10]}")
a, b = set(tops.get("Minneapolis", [])), set(tops.get("Atlanta", []))
overlap = len(a & b) / max(1, min(len(a), len(b)))
print(f"    Minneapolis vs Atlanta overlap: {overlap:.0%} -> {'PASS' if a and b and overlap <= 0.7 else 'FAIL'} (need distinct lists, overlap <=70%)")

print(f"\nLive Qloo calls this run: {qloo_client.calls} (cached responses reused)")
