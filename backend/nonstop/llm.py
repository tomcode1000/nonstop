"""DeepSeek client (OpenAI-compatible chat completions). The key comes from DEEPSEEK_API_KEY in the
environment or the project .env and is never logged or returned.

Both models reason before answering, so max_tokens must leave room (>= 200) or replies come back empty.
"""
import json
import os
import urllib.error
import urllib.request

from .qloo import ROOT

BASE = "https://api.deepseek.com"
FAST = "deepseek-flash"      # agent loop and tool calls
WRITER = "deepseek-v4-pro"   # longer documents (route cases)


def _key():
    if os.environ.get("DEEPSEEK_API_KEY"):
        return os.environ["DEEPSEEK_API_KEY"]
    env = ROOT / ".env"
    if env.exists():
        for line in open(env, encoding="utf8"):
            if line.startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("DEEPSEEK_API_KEY is not set")


def chat(messages, model=FAST, tools=None, max_tokens=1500, temperature=0.2, timeout=120):
    """One chat completion. Returns the assistant message dict (content, tool_calls, ...).

    If the model spends the whole budget reasoning (finish_reason "length" with no content and no
    tool call), the request is retried once with four times the budget.
    """
    for budget in (max_tokens, min(max_tokens * 4, 16000)):
        body = {"model": model, "messages": messages, "max_tokens": budget, "temperature": temperature}
        if tools:
            body["tools"] = tools
        req = urllib.request.Request(f"{BASE}/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                choice = json.load(r)["choices"][0]
        except urllib.error.HTTPError as err:
            raise RuntimeError(f"DeepSeek error {err.code}: {err.read().decode('utf8', 'ignore')[:200]}") from None
        msg = choice["message"]
        if msg.get("content") or msg.get("tool_calls") or choice.get("finish_reason") != "length":
            return msg
    return msg
