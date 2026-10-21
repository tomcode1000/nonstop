"""Launches and survival from T-100 segment files (all US carriers, monthly).
Service in a month = >=4 scheduled departures with seats > 0 (both directions pooled).
Launch = served in month m, not served in the previous 12 months. Survived = served in any of m+10..m+14."""
import csv, io, sys, zipfile
from collections import Counter, defaultdict
from pathlib import Path

LEISURE = {"G4": "Allegiant", "MX": "Breeze", "XP": "Avelo", "SY": "Sun Country", "F9": "Frontier", "NK": "Spirit"}
market, carrier = defaultdict(Counter), defaultdict(Counter)
for p in sorted(Path(sys.argv[1]).glob("t100_*.zip")):
    z = zipfile.ZipFile(p)
    for r in csv.DictReader(io.TextIOWrapper(z.open("T_T100D_SEGMENT_US_CARRIER_ONLY.csv"), encoding="latin-1")):
        if float(r["SEATS"] or 0) <= 0:
            continue
        m = int(r["YEAR"]) * 12 + int(r["MONTH"]) - 1
        pair = tuple(sorted((r["ORIGIN"], r["DEST"])))
        dep = float(r["DEPARTURES_SCHEDULED"] or 0)
        market[pair][m] += dep
        carrier[(r["UNIQUE_CARRIER"], pair)][m] += dep

def served(c):
    return {m for m, d in c.items() if d >= 4}

allm = sorted({m for c in market.values() for m in c})
first, last = allm[0], allm[-1]
print(f"months covered: {first//12}-{first%12+1:02d} .. {last//12}-{last%12+1:02d}")

def cohort(series, label, keyfn=lambda k: None):
    launches = defaultdict(list)
    for k, c in series.items():
        s = served(c)
        for m in sorted(s):
            if m - 12 >= first and not any(x in s for x in range(m - 12, m)):
                ok = None if m + 14 > last else any(x in s for x in range(m + 10, m + 15))
                launches[m // 12].append((k, ok))
    print(f"\n== {label} ==")
    for y in sorted(launches):
        L = launches[y]; judged = [o for _, o in L if o is not None]
        surv = f"{sum(judged)}/{len(judged)} survived ({sum(judged)/len(judged):.0%})" if judged else "survival not yet measurable"
        print(f"{y}: {len(L)} launches | {surv}")
    return launches

cohort(market, "NEW MARKETS (no carrier served the airport pair in the prior 12 months)")
cl = cohort(carrier, "CARRIER LAUNCHES (incl. entering an existing market)")
print("\nLeisure/ULCC carrier launches by year (survived/judged):")
for code, name in LEISURE.items():
    parts = []
    for y in sorted(cl):
        L = [o for (c, _), o in cl[y] if c == code]; j = [o for o in L if o is not None]
        parts.append(f"{y}: {len(L)}" + (f" ({sum(j)}/{len(j)})" if j else ""))
    print(f"  {name:12s} " + " | ".join(parts))
