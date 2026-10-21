"""Screenshot one page of the running app. Usage: python scripts/shot.py <path> <out.png> [width height wait_ms] [base]"""
import sys

from playwright.sync_api import sync_playwright

path, out = sys.argv[1], sys.argv[2]
w, h, wait = (int(x) for x in (sys.argv[3:6] if len(sys.argv) >= 6 else (1440, 900, 7000)))
base = sys.argv[6] if len(sys.argv) > 6 else "http://localhost:3001"
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"])
    page = browser.new_page(viewport={"width": w, "height": h})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:300]))
    page.goto(base + path, wait_until="networkidle", timeout=120000)
    page.wait_for_timeout(wait)
    page.screenshot(path=out)
    print("page errors:", errors or "none")
    browser.close()
