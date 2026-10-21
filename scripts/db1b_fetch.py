"""Download BTS DB1B Market quarters and reduce each to a per-airport-pair demand table.

DB1B is a 10% sample of US domestic tickets. For every unordered airport pair it gives:
  pax          estimated passengers per quarter (sample x 10)
  pax_connect  of those, passengers whose trip used a connection (MktCoupons > 1)
  avg_fare     mean market fare per passenger (USD)
Output: data/derived/db1b_<year>_<q>.csv. The ~95 MB zip is deleted after reduction.

Usage: python -I scripts/db1b_fetch.py 2024_1 2024_2 ...
"""
import csv
import io
import sys
import time
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "data" / "raw", ROOT / "data" / "derived"
RAW.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
URL = "https://transtats.bts.gov/PREZIP/Origin_and_Destination_Survey_DB1BMarket_{}.zip"
UA = {"User-Agent": "Mozilla/5.0"}


def download(url, dest, attempts=30):
    """BTS drops long transfers silently, so resume with Range requests until the size matches."""
    for wait in (0, 30, 60, 120, 300, 300):
        time.sleep(wait)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, method="HEAD", headers=UA), timeout=120) as r:
                size = int(r.headers["Content-Length"])
            break
        except OSError as err:
            print(f"   {dest.name}: size check failed ({err})", flush=True)
    else:
        raise SystemExit(f"{dest.name}: server unreachable")
    part = dest.with_suffix(".part")
    for _ in range(attempts):
        have = part.stat().st_size if part.exists() else 0
        if have >= size:
            break
        req = urllib.request.Request(url, headers={**UA, "Range": f"bytes={have}-"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r, open(part, "ab") as fh:
                while chunk := r.read(1 << 20):
                    fh.write(chunk)
        except OSError as err:
            wait = min(300, 10 * 2 ** min(_, 5))
            print(f"   {dest.name}: interrupted at {have >> 20} MB ({err}); retrying in {wait}s", flush=True)
            time.sleep(wait)
    if part.stat().st_size != size:
        raise SystemExit(f"{dest.name}: incomplete after {attempts} attempts")
    part.rename(dest)

for quarter in sys.argv[1:]:
    out = OUT / f"db1b_{quarter}.csv"
    if out.exists():
        print(quarter, "already reduced")
        continue
    zpath = RAW / f"db1b_{quarter}.zip"
    if not zpath.exists():
        download(URL.format(quarter), zpath)
    agg = defaultdict(lambda: [0.0, 0.0, 0.0])          # pax, pax_connect, fare*pax
    with zipfile.ZipFile(zpath) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        for r in csv.DictReader(io.TextIOWrapper(z.open(name), encoding="latin-1")):
            pax = float(r["Passengers"] or 0)
            if pax <= 0:
                continue
            a = agg[tuple(sorted((r["Origin"], r["Dest"])))]
            a[0] += pax
            if int(float(r["MktCoupons"] or 1)) > 1:
                a[1] += pax
            a[2] += pax * float(r["MktFare"] or 0)
    with open(out, "w", newline="", encoding="utf8") as fh:
        w = csv.writer(fh)
        w.writerow(["a", "b", "pax", "pax_connect", "avg_fare"])
        for (a, b), (p, pc, fp) in sorted(agg.items()):
            w.writerow([a, b, round(p * 10), round(pc * 10), round(fp / p, 2)])
    zpath.unlink()
    print(quarter, "->", out.name, len(agg), "pairs", flush=True)
