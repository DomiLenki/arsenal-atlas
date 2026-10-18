# Arsenal Atlas

Fahrzeuge, Waffen und Ausrüstung deutscher Streitkräfte von 1871 bis heute – mit Zeitleisten, historischer Einordnung, Quiz, Arbeitsaufträgen und Präsentationsmodus für den Unterricht.

**Website:** https://domilenki.github.io/arsenal-atlas/

## So funktioniert es

- `src/` – Quelltext der App (`app.html`, Unterrichtsinhalte in `school.js`)
- `site/` – die veröffentlichte Website. `site/index.html` wird mit `python3 scripts/assemble.py` aus `src/` erzeugt.
- `scripts/build-data.mjs` – sammelt alle Einträge aus der deutschsprachigen Wikipedia und aus Wikidata (Kategorien, Listen, „betrieben von“/„verwendet von“), mit Foto, Kurzbeschreibung und Einführungsjahr. Ergebnis in `site/data/`.
- `.github/workflows/pages.yml` – führt den Datensammler aus und veröffentlicht die Website auf GitHub Pages. Läuft bei jeder Änderung und jeden Montag automatisch.

`site/data/REPORT.md` zeigt nach jedem Lauf, wie viele Einträge je Epoche gefunden wurden.

## Lizenzen

Texte aus Wikipedia stehen unter CC BY-SA 4.0, Fotos stammen aus Wikimedia Commons (Lizenz jeweils auf der Bildseite).
