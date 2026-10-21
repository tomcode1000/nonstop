"""Screenshot every page of the running app (frontend on :3000, API on :8000) for a visual check.

Usage: .venv/Scripts/python scripts/screenshots.py [outdir]
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "screenshots")
OUT.mkdir(parents=True, exist_ok=True)
PAGES = {"home": "/", "airport_boi": "/airport/BOI", "replay_end": "/replay", "proof": "/proof"}

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"])
    for size, (w, h) in {"desktop": (1440, 900), "mobile": (390, 844)}.items():
        page = browser.new_page(viewport={"width": w, "height": h})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        for name, path in PAGES.items():
            if size == "mobile" and name == "replay_end":
                continue
            page.goto("http://localhost:3000" + path, wait_until="networkidle")
            page.wait_for_timeout(3500)
            if name == "replay_end":
                page.locator("input[type=range]").fill("12")
                page.wait_for_timeout(1500)
            page.screenshot(path=OUT / f"{size}_{name}.png", full_page=name == "proof")
        print(size, "console errors:", errors[:5] or "none")
    browser.close()
