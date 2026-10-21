"""Check that a DeepSeek API key works, without ever printing the key.

Usage:
  python -I check_deepseek.py                  # reads DEEPSEEK_API_KEY from the environment
  python -I check_deepseek.py path/to/.env     # or reads it from a .env file

Prints: whether a key was found (length only), the models the key can use, and a one-word chat reply.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "https://api.deepseek.com"


def key_from_env_file(path):
    with open(path, encoding="utf8") as fh:
        for line in fh:
            name, sep, value = line.strip().partition("=")
            if sep and name.strip().upper().startswith("DEEPSEEK") and "KEY" in name.upper():
                return value.strip().strip('"').strip("'")
    return None


def call(path, key, body=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf8", "ignore")[:300]


key = key_from_env_file(sys.argv[1]) if len(sys.argv) > 1 else os.environ.get("DEEPSEEK_API_KEY")
if not key:
    sys.exit("No DeepSeek key found (set DEEPSEEK_API_KEY or pass a .env path).")
print(f"Key found ({len(key)} characters; not shown).")

status, models = call("/models", key)
print("GET /models:", status, [m["id"] for m in models.get("data", [])] if isinstance(models, dict) else models)

if status == 200:
    model = models["data"][0]["id"]
    status, reply = call("/chat/completions", key, {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with the single word: ready"}],
        "max_tokens": 200,  # both models reason before answering; a tiny limit returns empty content
    })
    text = reply["choices"][0]["message"]["content"] if status == 200 else reply
    print(f"POST /chat/completions ({model}):", status, text)
