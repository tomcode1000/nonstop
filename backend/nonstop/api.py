"""Nonstop HTTP API (FastAPI). The browser never sees the Qloo or DeepSeek keys.

Run: uvicorn nonstop.api:app --reload   (from backend/)
"""
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import agent, data, features, predict, service
from .service import YEAR, city

app = FastAPI(title="Nonstop", description="Finds the leisure flights a town is missing, using Qloo's taste graph.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"ok": True, "year": YEAR}


@app.get("/api/airports")
def airports():
    df, ap = service.predictions(), data.airports()
    seats = data.airport_seats(YEAR - 1)
    out = []
    for code, g in df.groupby("origin"):
        fresh = g[g.metro_served == 0]
        top = (fresh if len(fresh) else g).nsmallest(1, "rank_at_origin").iloc[0]
        out.append({"code": code, "city": city(code), "lat": ap.at[code, "lat"], "lon": ap.at[code, "lon"],
                    "seats": int(seats.get(code, 0)), "top_opportunity": top.dest, "top_score": float(top.launch_score),
                    "called_2026": int(g[g.rank_at_origin <= 10].already_launched.sum())})
    return sorted(out, key=lambda a: -a["seats"])


@app.get("/api/airport/{code}/opportunities")
def opportunities(code: str, limit: int = 15, second_airports: bool = False):
    """Top missing leisure routes for an airport. By default, destinations whose metro is already
    reachable nonstop (Boise-Everett when Boise-Seattle exists) are left out; second_airports=true keeps them."""
    try:
        return service.opportunities(code, limit, second_airports)
    except LookupError as err:
        raise HTTPException(404, str(err)) from None


@app.get("/api/route/{origin}/{dest}")
def route(origin: str, dest: str):
    try:
        return service.route(origin, dest)
    except LookupError as err:
        raise HTTPException(404, str(err)) from None


@app.get("/api/heatmap/{dest}")
def heatmap(dest: str, max_points: int = 6000):
    """The Qloo US heatmap behind a destination (served live; never stored in the repo)."""
    store = features.destination_heatmaps([dest.upper()])
    qdest, cells = store[dest.upper()]
    if qdest is None or len(cells) == 0:
        raise HTTPException(404, f"No Qloo heatmap for {dest}")
    if len(cells) > max_points:
        cells = cells[np.random.default_rng(7).choice(len(cells), max_points, replace=False)]
    return {"dest": dest.upper(), "qloo_destination": qdest["name"],
            "cells": [[round(a, 4), round(b, 4), round(c, 3)] for a, b, c, _ in cells.tolist()]}


@app.get("/api/backtest")
def backtest():
    try:
        return service.backtest_summary()
    except FileNotFoundError:
        raise HTTPException(404, "Run `python -m nonstop.model` first") from None


@app.get("/api/replay/{year}")
def replay(year: int, top: int = 10):
    """Time machine: the model's picks for `year` (trained on earlier years only) and what actually launched."""
    if year not in (2025,):
        raise HTTPException(404, "Replay is available for 2025")
    cand = predict.replay(year)
    ap = data.airports()
    df, _ = data.t100()
    y = df[(df.year == year) & (df.deps_sched >= data.MIN_DEPARTURES)]
    first = y.groupby(["a", "b"]).month.min()
    launched = cand[cand.label == 1]

    def arc(r):
        a, b = data._pair(r.origin, r.dest)
        return {"origin": r.origin, "dest": r.dest, "origin_city": city(r.origin), "dest_city": city(r.dest),
                "from": [ap.at[r.origin, "lon"], ap.at[r.origin, "lat"]], "to": [ap.at[r.dest, "lon"], ap.at[r.dest, "lat"]],
                "rank": int(r.rank_at_origin), "month": int(first.get((a, b), 0)) if r.label else None}

    called = launched[launched.rank_at_origin <= top]
    return {"year": year, "top": top,
            "picks": [],   # per-origin picks are large; the replay UI only needs the launches
            "launches": [arc(r) for _, r in launched.drop_duplicates(["origin", "dest"]).iterrows()],
            "summary": {"launches": int(len(launched)), "called_in_top": int(len(called)),
                        "share": round(len(called) / max(1, len(launched)), 3)}}


class Question(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    airport: str | None = Field(default=None, max_length=4)


@app.post("/api/ask")
async def ask(q: Question):
    """Ask Nonstop: the DeepSeek agent answers from Nonstop's own tools and returns its tool trace."""
    try:
        return await run_in_threadpool(agent.ask, q.question, q.airport)
    except RuntimeError as err:
        raise HTTPException(502, str(err)) from None


@app.get("/api/case/{origin}/{dest}")
async def case(origin: str, dest: str):
    """A route case an airport can send to an airline, written from Nonstop's facts only."""
    try:
        return await run_in_threadpool(agent.route_case, origin, dest)
    except LookupError as err:
        raise HTTPException(404, str(err)) from None
    except RuntimeError as err:
        raise HTTPException(502, str(err)) from None
