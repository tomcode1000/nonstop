"""Ask Nonstop: a DeepSeek agent that answers questions about missing leisure routes using Nonstop's
own tools. Every number it states must come from a tool result; the trace of tool calls is returned
with the answer so the UI can show its sources.
"""
import json

from . import llm, service

SYSTEM = """You are Nonstop, an analyst for airport air-service teams. Nonstop predicts which new
leisure nonstop routes airlines (Allegiant, Breeze, Avelo, Sun Country, Frontier, Spirit) are likely
to launch, combining US DOT route and ticket data with Qloo's taste graph (where people's tastes
for a destination already are).

Rules:
- Use the tools. Every number, rank or score you state must come from a tool result in this
  conversation. Never estimate, round up, or invent figures. If a tool cannot answer, say so.
- Refer to airports by IATA code with the city, e.g. "BOI (Boise, ID)".
- Launch score is a 0-100 percentile across all candidate routes, not a probability.
- Qloo results describe group tastes, never individuals.
- "qloo_destination" is the Qloo place used as the taste anchor for the destination airport (Monterey's
  airport uses Santa Cruz, Destin's uses Destin). Call it the taste anchor; the route is still to the airport.
- Nonstop does not predict whether routes survive or get cut; never claim it does.
- Be concise: a short direct answer first, then up to 5 bullet points. No headings."""

TOOLS = [
    {"type": "function", "function": {
        "name": "find_airports", "description": "Find airports Nonstop covers by city, state code, IATA code or airport name.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "airport_opportunities",
        "description": "Ranked missing leisure routes for one airport, with launch score, Qloo taste, demand, drivers and likely airlines.",
        "parameters": {"type": "object", "properties": {
            "code": {"type": "string", "description": "IATA code of the origin airport"},
            "limit": {"type": "integer", "default": 8},
            "include_second_airports": {"type": "boolean", "default": False,
                                        "description": "Include destinations whose metro is already served via a nearby airport"}},
            "required": ["code"]}}},
    {"type": "function", "function": {
        "name": "explain_route", "description": "Full evidence for one specific route origin -> dest.",
        "parameters": {"type": "object", "properties": {"origin": {"type": "string"}, "dest": {"type": "string"}},
                       "required": ["origin", "dest"]}}},
    {"type": "function", "function": {
        "name": "search_routes",
        "description": "Best missing leisure routes nationally, optionally filtered by origin and/or destination US state codes or destination airports.",
        "parameters": {"type": "object", "properties": {
            "origin_states": {"type": "array", "items": {"type": "string"}, "description": "e.g. [\"TX\"]"},
            "dest_states": {"type": "array", "items": {"type": "string"}, "description": "e.g. [\"FL\", \"SC\"]"},
            "dest_codes": {"type": "array", "items": {"type": "string"}},
            "limit": {"type": "integer", "default": 10}}}}},
    {"type": "function", "function": {
        "name": "backtest_summary",
        "description": "How accurate Nonstop has been: temporal backtest, 2025 replay and 2026 forward check.",
        "parameters": {"type": "object", "properties": {}}}},
]


def _slim_route(r):
    """Keep tool results small: the model does not need coordinates."""
    return {k: v for k, v in r.items() if k not in ("lat", "lon")}


def run_tool(name, args):
    try:
        if name == "find_airports":
            return service.find_airports(args["query"])
        if name == "airport_opportunities":
            out = service.opportunities(args["code"], int(args.get("limit", 8)), bool(args.get("include_second_airports", False)))
            out["opportunities"] = [_slim_route(r) for r in out["opportunities"]]
            out.pop("lat", None), out.pop("lon", None)
            return out
        if name == "explain_route":
            return _slim_route(service.route(args["origin"], args["dest"]))
        if name == "search_routes":
            return service.search_routes(args.get("origin_states"), args.get("dest_states"), args.get("dest_codes"),
                                         limit=int(args.get("limit", 10)))
        if name == "backtest_summary":
            b = service.backtest_summary()
            return {"models": {k: v for k, v in b["models"].items() if "logistic" in k},
                    "test": b["test"], "replay": b["replay"], "forward": b["forward"]}
        return {"error": f"unknown tool {name}"}
    except (LookupError, KeyError, ValueError) as err:
        return {"error": str(err)}


def ask(question, airport=None, max_rounds=6):
    """Answer a question. Returns {answer, trace:[{tool, args, ok}]}."""
    messages = [{"role": "system", "content": SYSTEM}]
    if airport:
        messages.append({"role": "system", "content": f"The user is looking at airport {airport.upper()} in the app."})
    messages.append({"role": "user", "content": question})
    trace = []
    for _ in range(max_rounds):
        msg = llm.chat(messages, tools=TOOLS)
        calls = msg.get("tool_calls") or []
        if not calls:
            return {"answer": (msg.get("content") or "").strip(), "trace": trace}
        messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
        for call in calls:
            name = call["function"]["name"]
            try:
                args = json.loads(call["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            result = run_tool(name, args)
            trace.append({"tool": name, "args": args, "ok": not (isinstance(result, dict) and "error" in result)})
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result, default=str)[:12000]})
    final = llm.chat(messages + [{"role": "user", "content": "Answer now from the tool results above."}])
    return {"answer": (final.get("content") or "").strip(), "trace": trace}


CASE_PROMPT = """Write a two-page route case that {origin_city}'s air service team can send to an
airline network planner, arguing for a new nonstop {origin} -> {dest} ({dest_city}).

Use ONLY the facts in the JSON below. Do not add any number that is not in it. Markdown, with these
sections: "The ask" (one paragraph), "Demand already exists" (DOT ticket data), "Taste says more people
want to go" (Qloo, explained in plain words: affinity is how strongly this area's tastes lean toward the
destination; rank among towns is versus every other US town), "Why it ranks here" (the drivers),
"Best-fit airline" (from the matchmaker, with its reasons), "Track record" (from the backtest facts),
Field meanings: "rank" is the route's position in the airport's list of new markets (say "#N of the
airport's missing routes"); qloo.rank_among_towns and qloo.rank_among_own_options are shares (0.79 = "ahead
of 79% of ..."); qloo.vs_own_options is a raw difference, do not quote it; launch_score is a percentile;
airline "probability" is the matchmaker's relative likelihood among leisure airlines.
and "Caveats" (launch score is a percentile, not a probability; Qloo data is a 2026 snapshot; taste
predicts launches, not route survival). Keep it under 550 words. Confident, specific, no hype.

FACTS:
{facts}"""


def route_case(origin, dest):
    """A pitch document for one route, written by the larger model from tool facts only."""
    facts = service.route(origin, dest)
    b = service.backtest_summary()
    facts["track_record"] = {
        "backtest_auc_with_qloo": b["models"]["logistic | baseline + Qloo"]["auc"],
        "backtest_auc_without_qloo": b["models"]["logistic | baseline"]["auc"],
        "replay_2025": b["replay"], "forward_2026": b["forward"]}
    prompt = CASE_PROMPT.format(origin=facts["origin"], dest=facts["dest"], origin_city=facts["origin_city"],
                                dest_city=facts["dest_city"], facts=json.dumps(_slim_route(facts), indent=1, default=str))
    msg = llm.chat([{"role": "user", "content": prompt}], model=llm.WRITER, max_tokens=8000, temperature=0.3, timeout=300)
    return {"origin": facts["origin"], "dest": facts["dest"], "markdown": (msg.get("content") or "").strip(), "facts": facts}
