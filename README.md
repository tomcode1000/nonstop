# Nonstop: the leisure flights your town is missing

Nonstop predicts which new leisure nonstop routes US airlines (Allegiant, Breeze, Avelo, Sun Country,
Frontier, Spirit) are likely to launch next. It combines every US route and ticket record from the
Department of Transportation with **Qloo's taste graph**: where people's tastes for a destination
already are, even when no direct flight exists yet.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

**Who it's for:** airport air-service teams who pitch new routes to airlines, small communities applying
for federal air-service grants, and tourism boards that co-fund new routes.

## What it does

- **Airport view.** Pick any of 279 US airports and see its top missing leisure routes, each with a
  launch score, Qloo taste (with the US-wide Qloo heat map behind it), the drivers behind the score,
  how many people already make the trip with a connection and what they spend, and the leisure airline
  most likely to fly it.
- **Route case.** One click writes a pitch an airport can send to an airline network planner, using only
  Nonstop's facts.
- **Ask Nonstop.** A DeepSeek agent that answers questions ("Which Texas towns are best placed for a new
  nonstop to Florida?") by calling Nonstop's own tools. Every step is shown, and every number comes from a
  tool result.
- **Time machine.** Replays 2025 month by month: the model, trained only on 2024, called the route in
  advance (green) or missed it (red).
- **Proof.** The full out-of-sample backtest, the method, and the limits.

## Results (out of sample)

| Check | Result |
|---|---|
| Temporal backtest (train on 2024 launches, test on 2025; 33,829 possible routes, 191 launches) | AUC **0.910 → 0.918** with Qloo; Qloo lift +0.0075 AUC, 90% CI [+0.001, +0.013] |
| Time machine 2025 (trained on 2024 only) | **96 of 191** new leisure routes were already in their airport's top 10 |
| Forward check 2026 (Jan–Jul, never seen in training) | **45 of 111** launches were already in their airport's top 10 |

The baseline is strong: distance, airport size, leisure airlines already present, US DOT ticket demand
(DB1B), and whether a nearby airport in the same metro is already served. Qloo adds signal on top of it.
The Proof page lists everything we tested, including what did not work (taste does not predict whether a
new route survives; a second Qloo signal, each town's own top-50 destinations, added nothing and was left out).

## How Qloo is used

| Qloo call | Purpose |
|---|---|
| `/v2/insights` `filter.type=urn:entity:destination` + `filter.location=POINT(...)` | Match each airport to the Qloo destination it serves (by coordinates, because name search is unreliable) |
| `/v2/insights` `filter.type=urn:heatmap` over a US polygon | One heat map (about 10,000 cells) per destination; each origin airport gets its catchment's affinity, its rank among all towns, and how much it prefers that destination over its other options |
| `/v2/insights` `filter.type=urn:entity:destination` + `signal.location` | Each town's own favourite destinations (shown as an explanation) |
| `/search` | Destination lookups with a coordinate check |

About 800 Qloo calls build the full feature set; responses are cached server-side and **never committed**
(the hackathon rules forbid publishing Qloo data). No personal data is sent to Qloo, and results describe
group tastes, never individuals.

## Architecture

```
frontend/  Next.js 15 + deck.gl + MapLibre (arc map, Qloo heat map, replay, chat)
backend/   FastAPI
  nonstop/qloo.py        Qloo client: cache, retries, airport matching, heat maps
  nonstop/data.py        US DOT T-100 (all 61 carriers, monthly) + DB1B (10% ticket sample) + OurAirports
  nonstop/features.py    candidate routes and features, all measured the year before the launch
  nonstop/model.py       temporal backtest (logistic regression; LightGBM for comparison)
  nonstop/predict.py     forward predictions and the 2025 replay
  nonstop/matchmaker.py  which leisure airline is likely to fly a route, learned from their own launches
  nonstop/agent.py       Ask Nonstop + route cases (DeepSeek, tool calling)
  nonstop/api.py         HTTP API
scripts/   data downloads (T-100 via the TranStats form, DB1B with resume), kill tests, screenshots
```

## Run it locally

Requirements: Python 3.12, Node 22.

```bash
python -m venv .venv && .venv/Scripts/pip install -r backend/requirements.txt   # macOS/Linux: .venv/bin/pip
cp .env.example .env                       # add QLOO_API_KEY and DEEPSEEK_API_KEY

# 1. Public US DOT data (about 1 GB of downloads, reduced to ~20 MB)
python scripts/t100_fetch.py 2022 data/raw/t100_2022.zip   # repeat for 2023–2026
python scripts/db1b_fetch.py 2023_1 2023_2 2023_3 2023_4 2024_1 2024_2 2024_3 2024_4 2025_1 2025_2
curl -o data/raw/airports.csv https://davidmegginson.github.io/ourairports-data/airports.csv

# 2. Features, backtest and predictions (makes ~800 Qloo calls the first time, then uses the cache)
cd backend
python -m nonstop.model
python -m nonstop.predict
uvicorn nonstop.api:app --port 8000

# 3. Frontend
cd ../frontend && npm ci && npm run dev    # http://localhost:3000
```

## Limits

- Qloo's data is a 2026 snapshot, so some measured taste may postdate the routes it scores. The 2026
  forward check is the clean test.
- Qloo has no destination entry for about 30 small Midwest and Plains airports (for example Green Bay,
  Fargo, Jackson Hole), so they cannot be ranked as destinations.
- The launch score is a percentile across all candidate routes, not a probability.

## Data sources

US DOT Bureau of Transportation Statistics (T-100 Domestic Segment, DB1B Market), OurAirports (public
domain), Qloo Insights API, CARTO basemap tiles © OpenStreetMap contributors.

## License

MIT
