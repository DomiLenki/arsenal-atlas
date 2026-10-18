#!/usr/bin/env python3
"""Baut site/index.html aus src/app.html, src/school.js, site/js/classify.mjs und den Highlights.

Aufruf:  python3 scripts/assemble.py [ziel.html]
Ohne Ziel wird site/index.html geschrieben, dazu Icons und Web-Manifest.
"""
import base64
import io
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON = os.path.join(ROOT, "src", "icon.png")


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def build_html():
    html = read("src", "app.html")
    school = read("src", "school.js")
    raw = read("site", "js", "highlights.txt").strip()
    classify = read("site", "js", "classify.mjs")
    classify = re.sub(r"^export\s+", "", classify, flags=re.M)
    assert "`" not in raw and "${" not in raw

    buf = io.BytesIO()
    Image.open(ICON).convert("RGB").resize((160, 160), Image.LANCZOS).save(buf, "JPEG", quality=88)
    logo = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

    out = (html.replace("__SCHOOL__", school).replace("__CLASSIFY__", classify)
           .replace("__RAW__", raw).replace("__LOGO__", logo))
    for token in ("__SCHOOL__", "__CLASSIFY__", "__RAW__", "__LOGO__"):
        assert token not in out, token
    return out


def write_icons(site):
    art = Image.open(ICON).convert("RGB")
    for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
        art.resize((size, size), Image.LANCZOS).save(os.path.join(site, name), optimize=True)
    manifest = {
        "name": "Arsenal Atlas",
        "short_name": "Arsenal Atlas",
        "description": "Deutsche Militärgeschichte in Technik und Kontext, 1871 bis heute",
        "lang": "de",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": "#0b1626",
        "theme_color": "#0b1626",
        "icons": [
            {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        ],
    }
    with open(os.path.join(site, "manifest.webmanifest"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    html = build_html()
    if len(sys.argv) > 1:
        target = sys.argv[1]
    else:
        target = os.path.join(ROOT, "site", "index.html")
        write_icons(os.path.join(ROOT, "site"))
    os.makedirs(os.path.dirname(os.path.abspath(target)), exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        f.write(html)
    print(target, len(html), "Zeichen")
