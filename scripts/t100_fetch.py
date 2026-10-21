"""Download one year of BTS T-100 Domestic Segment (U.S. Carriers) via the TranStats form.
Usage: python -I t100_fetch.py <year> <out.zip>"""
import http.cookiejar, re, sys, urllib.parse, urllib.request

URL = "https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FIM&QO_fu146_anzr=Nv4%20Pn44vr45"
FIELDS = ["DEPARTURES_SCHEDULED", "DEPARTURES_PERFORMED", "SEATS", "PASSENGERS", "UNIQUE_CARRIER",
          "UNIQUE_CARRIER_NAME", "ORIGIN", "ORIGIN_CITY_NAME", "DEST", "DEST_CITY_NAME", "YEAR", "MONTH"]

year, out = sys.argv[1], sys.argv[2]
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0")]
page = op.open(URL, timeout=120).read().decode("utf8", "ignore")
form = {n: v for n, v in re.findall(r'<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"', page)}
periods = re.findall(r'<select[^>]*name="cboPeriod".*?</select>', page, re.S)[0]
print("period options:", re.findall(r'value="([^"]+)"', periods)[:14])
missing = [f for f in FIELDS if f'"{f}"' not in page]
print("missing fields:", missing)
form.update({"cboGeography": "All", "cboYear": year, "cboPeriod": "All", "chkDownloadZip": "on", "btnDownload": "Download"})
for f in FIELDS:
    if f not in missing:
        form[f] = "on"
req = urllib.request.Request(URL, data=urllib.parse.urlencode(form).encode(), headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": URL})
resp = op.open(req, timeout=600)
body = resp.read()
print("status", resp.status, "type", resp.headers.get("Content-Type"), "bytes", len(body))
open(out, "wb").write(body)
