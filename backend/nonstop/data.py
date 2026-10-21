"""Public aviation data for Nonstop, cleaned into small cached tables (data/derived/*.parquet).

Sources (all US government or open data, downloaded by scripts/):
  T-100 Domestic Segment  monthly scheduled departures and seats by carrier and airport pair (BTS)
  DB1B Market             10% ticket sample: origin-destination passengers and fares (BTS)
  OurAirports             airport coordinates and cities

Airport pairs are unordered tuples (a, b) with a < b, so "BOI-BNA" and "BNA-BOI" are one market.
"""
import csv
import io
import zipfile
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW, DERIVED = ROOT / "data" / "raw", ROOT / "data" / "derived"
DERIVED.mkdir(parents=True, exist_ok=True)

# Airlines whose networks are built around leisure travel (ultra-low-cost and leisure carriers).
LEISURE = {"G4": "Allegiant", "MX": "Breeze", "XP": "Avelo", "SY": "Sun Country", "F9": "Frontier", "NK": "Spirit"}
MIN_DEPARTURES = 4          # scheduled departures in a month for a pair to count as served that month
MIN_KM, MAX_KM = 300, 4000  # shorter trips are driven; longer ones need widebodies


@lru_cache
def airports():
    """US airports with an IATA code: index iata -> lat, lon, city, state, name, lower48."""
    rows = []
    for r in csv.DictReader(open(RAW / "airports.csv", encoding="utf8")):
        if r["iso_country"] == "US" and r["iata_code"]:
            lat, lon = float(r["latitude_deg"]), float(r["longitude_deg"])
            rows.append((r["iata_code"], lat, lon, r["municipality"], r["iso_region"][3:], r["name"],
                         24 <= lat <= 50 and -125 <= lon <= -66))
    return pd.DataFrame(rows, columns=["iata", "lat", "lon", "city", "state", "name", "lower48"]).drop_duplicates("iata").set_index("iata")


def _pair(a, b):
    return (a, b) if a < b else (b, a)


@lru_cache
def t100():
    """Monthly service per (year, month, carrier, a, b), both directions pooled; plus departing seats per airport."""
    cache, seats_cache = DERIVED / "t100.parquet", DERIVED / "airport_seats.parquet"
    if cache.exists() and seats_cache.exists():
        return pd.read_parquet(cache), pd.read_parquet(seats_cache)
    frames = []
    for z in sorted(RAW.glob("t100_*.zip")):
        with zipfile.ZipFile(z) as zf:
            df = pd.read_csv(zf.open("T_T100D_SEGMENT_US_CARRIER_ONLY.csv"),
                             usecols=["DEPARTURES_SCHEDULED", "DEPARTURES_PERFORMED", "SEATS", "PASSENGERS",
                                      "UNIQUE_CARRIER", "ORIGIN", "DEST", "YEAR", "MONTH"], encoding="latin-1")
        frames.append(df[df.SEATS > 0])
    raw = pd.concat(frames, ignore_index=True)
    seats = raw.groupby(["YEAR", "ORIGIN"], as_index=False).SEATS.sum().rename(columns={"YEAR": "year", "ORIGIN": "iata", "SEATS": "seats"})
    a = np.where(raw.ORIGIN < raw.DEST, raw.ORIGIN, raw.DEST)
    b = np.where(raw.ORIGIN < raw.DEST, raw.DEST, raw.ORIGIN)
    raw = raw.assign(a=a, b=b)
    out = (raw.groupby(["YEAR", "MONTH", "UNIQUE_CARRIER", "a", "b"], as_index=False)
              [["DEPARTURES_SCHEDULED", "DEPARTURES_PERFORMED", "SEATS", "PASSENGERS"]].sum())
    out.columns = ["year", "month", "carrier", "a", "b", "deps_sched", "deps_flown", "seats", "pax"]
    # Directions were pooled, so a pair flown both ways shows ~2x departures: halve to one-way.
    out[["deps_sched", "deps_flown", "seats", "pax"]] /= 2
    out.to_parquet(cache)
    seats.to_parquet(seats_cache)
    return out, seats


@lru_cache
def service(year):
    """Per pair for one year: months served, carriers, leisure carriers, seats."""
    df, _ = t100()
    y = df[df.year == year]
    monthly = y.groupby(["a", "b", "month"]).deps_sched.sum()
    months = (monthly >= MIN_DEPARTURES).groupby(level=["a", "b"]).sum().rename("months")
    carriers = y[y.deps_sched >= MIN_DEPARTURES].groupby(["a", "b"]).carrier.agg(lambda s: frozenset(s)).rename("carriers")
    seats = y.groupby(["a", "b"]).seats.sum().rename("seats")
    out = pd.concat([months, carriers, seats], axis=1)
    out["months"] = out.months.fillna(0).astype(int)
    out["carriers"] = out.carriers.apply(lambda c: c if isinstance(c, frozenset) else frozenset())
    out["leisure"] = out.carriers.apply(lambda c: bool(c & LEISURE.keys()))
    return out


def served(year, min_months=1):
    s = service(year)
    return set(s.index[s.months >= min_months])


@lru_cache
def airport_seats(year):
    _, seats = t100()
    return seats[seats.year == year].set_index("iata").seats


def launches(year):
    """Brand-new markets: served in >=2 months of `year`, not served at all in `year - 1`."""
    s = service(year)
    prev = served(year - 1)
    new = s[(s.months >= 2) & ~s.index.isin(prev)].copy()
    ap = airports()
    ok = [p for p in new.index if p[0] in ap.index and p[1] in ap.index]
    new = new.loc[ok]
    new["km"] = [distance_km(*p) for p in new.index]
    return new[(new.km >= MIN_KM) & (new.km <= MAX_KM)]


def distance_km(a, b):
    ap = airports()
    la1, lo1, la2, lo2 = np.radians([ap.at[a, "lat"], ap.at[a, "lon"], ap.at[b, "lat"], ap.at[b, "lon"]])
    return float(6371 * 2 * np.arcsin(np.sqrt(np.sin((la2 - la1) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2) ** 2)))


@lru_cache
def db1b(year):
    """Annual origin-destination demand per pair from the DB1B quarters available for `year`.

    Returns pax (scaled to a full year if quarters are missing), pax_connect share, avg_fare, quarters.
    """
    files = sorted(DERIVED.glob(f"db1b_{year}_*.csv"))
    if not files:
        return pd.DataFrame(columns=["pax", "connect_share", "avg_fare", "quarters"])
    df = pd.concat([pd.read_csv(f) for f in files])
    df["fare_x_pax"] = df.avg_fare * df.pax
    g = df.groupby(["a", "b"])[["pax", "pax_connect", "fare_x_pax"]].sum()
    out = pd.DataFrame({
        "pax": g.pax * 4 / len(files),
        "connect_share": g.pax_connect / g.pax.where(g.pax > 0),
        "avg_fare": g.fare_x_pax / g.pax.where(g.pax > 0),
    })
    out["quarters"] = len(files)
    return out
