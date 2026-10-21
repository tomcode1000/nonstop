"""Airline matchmaker: which leisure airline is most likely to fly a candidate route.

Learned from every leisure-airline launch in the training years. For carrier c and route (o, d):

  P(c | launch) ∝ share(c) × presence(c, o, d) × distance_fit(c, km)

  share(c)          c's share of all leisure launches (how expansionary it is)
  presence(c, o, d) how much more often c launches routes touching airports it already serves,
                    estimated from history (an airline almost always grows from its existing stations)
  distance_fit      a log-normal fitted to the distances of c's own launches
"""
from collections import Counter

import numpy as np

from . import data

PRESENCE_LEVELS = ("both", "one", "none")


def _presence(carrier, o, d, stations):
    at = stations.get(carrier, set())
    n = (o in at) + (d in at)
    return PRESENCE_LEVELS[2 - n]


def stations_by_carrier(year):
    s = data.service(year)
    out = {}
    for (a, b), row in s[s.months >= 1].iterrows():
        for c in row.carriers & data.LEISURE.keys():
            out.setdefault(c, set()).update((a, b))
    return out


class Matchmaker:
    def __init__(self, years=(2024, 2025)):
        launches = []                      # (carrier, o, d, km, stations of the prior year)
        for y in years:
            stations = stations_by_carrier(y - 1)
            for (a, b), row in data.launches(y).iterrows():
                for c in row.carriers & data.LEISURE.keys():
                    launches.append((c, a, b, row.km, stations))
        counts = Counter(c for c, *_ in launches)
        total = sum(counts.values())
        self.share = {c: (counts[c] + 1) / (total + len(data.LEISURE)) for c in data.LEISURE}
        # Presence likelihood ratio: how often launches touch existing stations, per level.
        pres = Counter(_presence(c, a, b, st) for c, a, b, _, st in launches)
        self.presence = {lvl: (pres[lvl] + 1) / (total + 3) for lvl in PRESENCE_LEVELS}
        self.dist = {}
        for c in data.LEISURE:
            kms = np.log([k for cc, _, _, k, _ in launches if cc == c] or [1500.0])
            self.dist[c] = (kms.mean(), max(kms.std(), 0.25))
        self.n_launches = dict(counts)

    def rank(self, o, d, km, stations):
        """[{carrier, name, probability, why}] for route o-d, most likely first."""
        scores = {}
        for c in data.LEISURE:
            mu, sd = self.dist[c]
            fit = np.exp(-0.5 * ((np.log(km) - mu) / sd) ** 2) / sd
            scores[c] = self.share[c] * self.presence[_presence(c, o, d, stations)] * fit
        total = sum(scores.values()) or 1.0
        out = []
        for c, v in sorted(scores.items(), key=lambda kv: -kv[1]):
            at = stations.get(c, set())
            why = []
            if o in at and d in at:
                why.append(f"already flies from both {o} and {d}")
            elif o in at or d in at:
                why.append(f"already serves {o if o in at else d}")
            else:
                why.append("would need a new station at both ends")
            why.append(f"typical launch length ~{np.exp(self.dist[c][0]):,.0f} km (this route {km:,.0f} km)")
            why.append(f"{self.n_launches.get(c, 0)} new leisure markets opened in the training years")
            out.append({"carrier": c, "name": data.LEISURE[c], "probability": round(v / total, 3), "why": why})
        return out
