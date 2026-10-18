#!/usr/bin/env python3
"""Klickt die Website durch (Rollenauswahl, Epochen, Listen, Detail, Quiz, Mappe, Präsentation).

Aufruf: python3 scripts/uitest.py http://127.0.0.1:8765/ [screenshot-ordner]
Wikipedia-Anfragen werden abgefangen und mit Testdaten beantwortet.
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
OUT = sys.argv[2] if len(sys.argv) > 2 else None
PX = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='40'%3E%3Crect width='64' height='40' fill='%23667'/%3E%3C/svg%3E"


def wiki(route):
    url = route.request.url
    if "rest_v1" in url:
        body = {"title": "Testartikel", "extract": "Testtext aus Wikipedia.", "description": "Kampfpanzer",
                "content_urls": {"desktop": {"page": "https://de.wikipedia.org/wiki/Testartikel"}, "mobile": {"page": "https://de.m.wikipedia.org/wiki/Testartikel"}}}
    else:
        body = {"query": {"pages": [{"title": "Treffer", "ns": 0, "thumbnail": {"source": PX}}]}}
    route.fulfill(status=200, content_type="application/json", body=json.dumps(body), headers={"Access-Control-Allow-Origin": "*"})


def shot(pg, name, full=False):
    if OUT:
        pg.screenshot(path=f"{OUT}/{name}.png", full_page=full)


errors = []
checks = []


def check(name, ok):
    checks.append((name, bool(ok)))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    ctx.route("**/*.wikipedia.org/**", wiki)
    ctx.route("**/*.wikimedia.org/**", lambda r: r.fulfill(status=404, body=""))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))

    # Rollenauswahl
    pg.goto(BASE); pg.wait_for_timeout(600)
    check("Rollenauswahl beim ersten Start", pg.locator(".welcome .role").count() == 2)
    shot(pg, "w_welcome")
    pg.click("[data-action=set-role][data-v=s]"); pg.wait_for_timeout(600)
    check("Schüleransicht ohne Lehrkräfte-Kachel", pg.locator("a[href='#/lehrkraefte']").count() == 0)
    check("Eintragszahl aus Daten auf Startseite", "Über 3.000 Einträge" in pg.inner_text("body"))
    shot(pg, "w_home_s")

    # Epoche, Lösungen für Schüler unsichtbar
    pg.goto(BASE + "#/era/W"); pg.wait_for_timeout(1200)
    check("Keine Lösungshinweise für Schüler", pg.locator("details.hint").count() == 0)
    txt = pg.inner_text("body")
    check("Statische Daten geladen (Fahrzeuge > 1000)", any(int(s.replace(".", "")) > 1000 for s in __import__("re").findall(r"([\d.]+) Einträge", txt)))
    pg.goto(BASE + "#/era/W/vehicles"); pg.wait_for_timeout(500)
    pg.goto(BASE + "#/era/W/domain/land"); pg.wait_for_timeout(800)
    t0 = time.time(); pg.fill("#q", "Testobjekt W12"); pg.wait_for_timeout(400)
    check("Suche in großer Liste", pg.locator(".row").count() >= 1)
    pg.fill("#q", ""); pg.wait_for_timeout(400)
    shot(pg, "w_list")
    # Detail eines geladenen Eintrags
    pg.locator(".row").nth(5).click(); pg.wait_for_timeout(800)
    check("Detailseite mit Wikidata-Beschreibung", "Kurzbeschreibung aus Wikidata" in pg.inner_text("body") or pg.locator(".d-desc").count() > 0)
    check("Wikipedia-Text und Zitierhilfe", pg.locator(".cite").count() == 1)
    pg.click("[data-action=mappe-toggle]")
    pg.goto(BASE + "#/item/" + "f%3ATiger%20I"); pg.wait_for_timeout(800)
    check("Highlight mit Einordnung", pg.locator(".ctx").count() == 1)
    pg.click("[data-action=mappe-toggle]")
    pg.goto(BASE + "#/mappe"); pg.wait_for_timeout(500)
    check("Mappe mit zwei Einträgen", pg.locator("table tbody tr").count() == 2)
    pg.goto(BASE + "#/aufgaben"); pg.wait_for_timeout(400)
    check("Aufgabenseite: 24 Aufgaben", pg.locator(".tasks li").count() == 24)
    check("Aufgabenseite: keine Lösungen für Schüler", pg.locator("details.hint").count() == 0)

    # Quiz
    pg.goto(BASE + "#/quiz"); pg.wait_for_timeout(300)
    pg.click("[data-action=quiz-start][data-era=K]")
    for _ in range(10):
        pg.wait_for_timeout(120)
        pg.click("[data-action=quiz-answer] >> nth=1")
        pg.click("[data-action=quiz-next]")
    pg.wait_for_timeout(200)
    check("Quiz bis zum Ergebnis", pg.locator(".score").count() == 1)

    # Wechsel zur Lehrkraft
    pg.goto(BASE + "#/"); pg.wait_for_timeout(300)
    pg.click("[data-action=switch-role]"); pg.wait_for_timeout(300)
    pg.click("[data-action=set-role][data-v=t]"); pg.wait_for_timeout(500)
    check("Lehrkräfte-Kachel sichtbar", pg.locator("a[href='#/lehrkraefte']").count() == 1)
    shot(pg, "w_home_t")
    pg.goto(BASE + "#/aufgaben"); pg.wait_for_timeout(400)
    check("Lösungshinweise für Lehrkräfte (24)", pg.locator("details.hint").count() == 24)
    check("Lösungen standardmäßig eingeklappt", pg.locator("details.hint[open]").count() == 0)
    pg.locator("details.hint summary").first.click(); pg.wait_for_timeout(200)
    shot(pg, "w_tasks_t")
    pg.goto(BASE + "#/lehrkraefte"); pg.wait_for_timeout(300)
    check("Seite für Lehrkräfte", "Didaktische Leitlinien" in pg.inner_text("body"))
    pg.goto(BASE + "#/settings"); pg.wait_for_timeout(300)
    pg.click("[data-action=set-theme][data-v=light]"); pg.wait_for_timeout(200)
    pg.goto(BASE + "#/era/B"); pg.wait_for_timeout(1200)
    shot(pg, "w_era_light", True)
    pg.click("[data-action=present-era]"); pg.wait_for_timeout(400)
    check("Präsentation startet", pg.locator("#pres").count() == 1)
    pg.keyboard.press("Escape")
    ctx.close(); b.close()

for name, ok in checks:
    print(("OK    " if ok else "FEHLER") + "  " + name)
print("JS-Fehler:", errors or "keine")
sys.exit(0 if all(ok for _, ok in checks) and not errors else 1)
