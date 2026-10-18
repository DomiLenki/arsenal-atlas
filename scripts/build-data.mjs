#!/usr/bin/env node
/**
 * Arsenal Atlas – Datensammler
 *
 * Sammelt für jede Epoche alle Fahrzeuge, Waffen und Ausrüstungsgegenstände aus
 * der deutschsprachigen Wikipedia und aus Wikidata, inklusive Foto, Kurzbeschreibung
 * und Einführungsjahr. Ergebnis: site/data/<Epoche>.json, featured.json, meta.json.
 *
 * Läuft in GitHub Actions (siehe .github/workflows/pages.yml), ohne Abhängigkeiten.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORY_RULES, EXCLUDE_WORDS, groupOf } from "../site/js/classify.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "site", "data");
const UA = "ArsenalAtlas/1.2 (https://github.com/DomiLenki/arsenal-atlas; Bildungsprojekt) Node.js";
const DE = "de.wikipedia.org";
const ONLY = process.env.ERAS ? process.env.ERAS.split(",") : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requestCount = 0;

/* ------------------------------------------------------------ HTTP */
async function getJSON(url, tries = 6) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      requestCount++;
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 2500 * attempt;
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        console.warn(`  HTTP ${res.status}: ${url.slice(0, 180)}`);
        return null;
      }
      const json = await res.json();
      if (json.error) {
        if (json.error.code === "maxlag") { await sleep(5000); continue; }
        console.warn(`  API-Fehler ${json.error.code}: ${json.error.info}`);
        return null;
      }
      return json;
    } catch (err) {
      await sleep(2000 * attempt);
    }
  }
  console.warn(`  Aufgegeben: ${url.slice(0, 180)}`);
  return null;
}

function api(params, host = DE) {
  const q = new URLSearchParams({ ...params, format: "json", formatversion: "2", maxlag: "5" });
  return getJSON(`https://${host}/w/api.php?${q}`);
}

/** Abfrage mit allen Fortsetzungen; Seiten werden nach Titel zusammengeführt. */
async function collect(base, host = DE, maxRounds = 400) {
  const bag = new Map();
  let cont = null;
  let rounds = 0;
  do {
    const json = await api({ ...base, ...(cont || {}) }, host);
    if (!json) break;
    const q = json.query || {};
    for (const p of q.pages || []) {
      if (!p.title || p.missing || p.invalid) continue;
      const o = bag.get(p.title) || { title: p.title, ns: p.ns || 0, thumb: null, qid: null, cats: [], disambig: false };
      o.ns = p.ns || 0;
      if (p.thumbnail) o.thumb = p.thumbnail.source;
      if (p.pageprops) {
        if (p.pageprops.wikibase_item) o.qid = p.pageprops.wikibase_item;
        if ("disambiguation" in p.pageprops) o.disambig = true;
      }
      if (p.categories) o.cats.push(...p.categories.map((c) => c.title));
      bag.set(p.title, o);
    }
    cont = json.continue || null;
    rounds++;
  } while (cont && rounds < maxRounds);
  return bag;
}

const PAGE_PROPS = {
  prop: "pageimages|pageprops",
  piprop: "thumbnail",
  pithumbsize: "640",
  pilimit: "max",
  ppprop: "wikibase_item|disambiguation",
};

/* ------------------------------------------------------------ Quellen */
async function pagesInCategory(root, maxDepth, log) {
  const queue = [["Kategorie:" + root, 0]];
  const seen = new Set();
  const titles = new Set();
  while (queue.length && seen.size < 250) {
    const [cat, depth] = queue.shift();
    if (seen.has(cat)) continue;
    seen.add(cat);
    for (const m of await listCategory(cat)) {
      if (m.ns === 14) {
        if (depth < maxDepth && !skipCategory(m.title)) queue.push([m.title, depth + 1]);
      } else if (m.ns === 0) {
        titles.add(m.title);
      }
    }
  }
  if (titles.size === 0) log(`  WARNUNG: Kategorie „${root}“ leer oder nicht vorhanden`);
  log(`Kategorie „${root}“ (Tiefe ${maxDepth}): ${titles.size} Artikel aus ${seen.size} Kategorien`);
  return titles;
}

async function listCategory(cat) {
  const out = [];
  let cont = null;
  do {
    const json = await api({ action: "query", list: "categorymembers", cmtitle: cat, cmtype: "page|subcat", cmlimit: "500", ...(cont || {}) });
    if (!json) break;
    out.push(...((json.query && json.query.categorymembers) || []));
    cont = json.continue || null;
  } while (cont);
  return out;
}

async function linkedFromList(title, log) {
  const titles = new Set();
  let cont = null;
  do {
    const json = await api({ action: "query", titles: title, redirects: "1", prop: "links", plnamespace: "0", pllimit: "500", ...(cont || {}) });
    if (!json) break;
    for (const p of (json.query && json.query.pages) || []) {
      if (p.missing) log(`  Liste fehlt: ${title}`);
      for (const l of p.links || []) titles.add(l.title);
    }
    cont = json.continue || null;
  } while (cont);
  log(`Liste „${title}“: ${titles.size} verlinkte Artikel`);
  return titles;
}

async function searchTitles(query, log, limit = 1000) {
  const titles = new Set();
  let offset = 0;
  while (offset < limit) {
    const json = await api({ action: "query", list: "search", srsearch: query, srnamespace: "0", srlimit: "500", sroffset: String(offset), srinfo: "", srprop: "" });
    if (!json) break;
    const hits = (json.query && json.query.search) || [];
    hits.forEach((h) => titles.add(h.title));
    if (!json.continue || hits.length === 0) break;
    offset = json.continue.sroffset;
  }
  log(`Suche ${query}: ${titles.size} Treffer`);
  return titles;
}

async function resolveQids(titles) {
  const json = await api({ action: "query", titles: titles.join("|"), redirects: "1", prop: "pageprops", ppprop: "wikibase_item" });
  const out = [];
  for (const p of (json && json.query && json.query.pages) || []) {
    if (p.pageprops && p.pageprops.wikibase_item) out.push({ title: p.title, qid: p.pageprops.wikibase_item });
  }
  return out;
}

/** Alles, was laut Wikidata von einer Teilstreitkraft betrieben oder verwendet wurde. */
async function wikidataOperated(qids, log) {
  if (!qids.length) return new Map();
  const values = qids.map((q) => "wd:" + q).join(" ");
  const query = `SELECT DISTINCT ?article ?start WHERE {
    VALUES ?op { ${values} }
    { ?item p:P137 ?st . ?st ps:P137 ?op . } UNION { ?item p:P1535 ?st . ?st ps:P1535 ?op . }
    OPTIONAL { ?st pq:P580 ?start . }
    ?article schema:about ?item ; schema:isPartOf <https://de.wikipedia.org/> .
  }`;
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
  const json = await getJSON(url);
  const out = new Map();
  for (const b of (json && json.results && json.results.bindings) || []) {
    const title = decodeURIComponent(b.article.value.split("/wiki/")[1] || "").replace(/_/g, " ");
    if (!title) continue;
    const y = b.start ? parseInt(b.start.value.slice(0, 4), 10) : null;
    const prev = out.get(title);
    out.set(title, prev && prev < (y || 9999) ? prev : y);
  }
  log(`Wikidata „betrieben/verwendet von“: ${out.size} Artikel`);
  return out;
}

/* ------------------------------------------------------------ Einordnung */
const EXCLUDE_RE = new RegExp(`(^|[^a-zäöüß])(${EXCLUDE_WORDS.join("|")})([^a-zäöüß]|$)`);
const SKIP_CATEGORY = /(militärische einheit|verband|division|regiment|bataillon|geschwader|staffel|hersteller|unternehmen|museum|liste|film|spiel|besatzung|schlacht |schlacht$|operation|werft|bauwerk|stützpunkt|flugplatz|person|kommandant|schiffsverlust|wrack|kriegsgefangen|modell|kaserne|truppenübungsplatz)/;
function skipCategory(title) {
  return SKIP_CATEGORY.test(title.toLowerCase());
}
function excluded(cats) {
  return cats.some((c) => EXCLUDE_RE.test(c.toLowerCase().replace(/^kategorie:/, "")));
}
function classify(cats) {
  const lower = cats.map((c) => c.toLowerCase());
  for (const [cat, words] of CATEGORY_RULES) {
    if (lower.some((c) => words.some((w) => c.includes(w)))) return cat;
  }
  return null;
}
const skipTitle = (t) => /^(Liste |Portal:|Kategorie:)/.test(t) || /Begriffsklärung/.test(t);

/* ------------------------------------------------------------ Epochen */
const ERAS = {
  K: {
    years: [1840, 1918],
    forces: ["Deutsches Heer (Deutsches Kaiserreich)", "Kaiserliche Marine", "Luftstreitkräfte (Deutsches Kaiserreich)", "Kaiserliche Schutztruppe", "Schutztruppe"],
    sources: [
      ["cat", "Flugzeugtyp des Ersten Weltkrieges (Deutsches Reich)", "F", 1],
      ["cat", "Luftschiff (Kaiserliche Marine)", "F", 1],
      ["cat", "Militärluftschiff", "F", 1],
      ["cat", "Militärschiff (Kaiserliche Marine)", "S", 2],
      ["cat", "Militärschiffsklasse (Kaiserliche Marine)", "S", 1],
      ["search", '"Deutsches Heer" "Erster Weltkrieg" incategory:Maschinengewehr', "M"],
      ["search", 'incategory:"Handwaffe" "Deutsches Heer" Kaiserreich', null],
      ["search", '"Erster Weltkrieg" "Deutsches Heer" Geschütz', null],
      ["search", '"Erster Weltkrieg" deutscher Panzerwagen', null],
      ["search", '"Erster Weltkrieg" "deutschen Heeres" Ausrüstung', null],
    ],
  },
  R: {
    years: [1880, 1935],
    forces: ["Reichswehr", "Reichsheer", "Reichsmarine"],
    sources: [
      ["search", 'Reichswehr incategory:"Kettenfahrzeug der Wehrmacht"', "P"],
      ["search", 'Reichswehr incategory:"Radfahrzeug der Wehrmacht"', "R"],
      ["search", 'Reichswehr incategory:"Handwaffe der Wehrmacht"', "W"],
      ["search", 'Reichswehr incategory:"Artillerie der Wehrmacht"', "A"],
      ["search", 'Reichswehr incategory:"Luftfahrzeug der Wehrmacht"', "F"],
      ["search", 'Reichsmarine incategory:"Militärschiffsklasse (Kriegsmarine)"', "S"],
      ["search", 'Reichsmarine incategory:"Militärschiff (Kriegsmarine)"', "S"],
    ],
  },
  W: {
    years: [1880, 1945],
    forces: ["Wehrmacht", "Heer (Wehrmacht)", "Luftwaffe (Wehrmacht)", "Kriegsmarine"],
    sources: [
      ["cat", "Kettenfahrzeug der Wehrmacht", "P", 3],
      ["cat", "Radfahrzeug der Wehrmacht", "R", 3],
      ["cat", "Luftfahrzeug der Wehrmacht", "F", 3],
      ["cat", "Artillerie der Wehrmacht", "A", 3],
      ["cat", "Handwaffe der Wehrmacht", "W", 3],
      ["cat", "Militärische Ausrüstung (Wehrmacht)", "Z", 2],
      ["cat", "Militärschiffsklasse (Kriegsmarine)", "S", 2],
      ["cat", "Militärschiff (Kriegsmarine)", "S", 3],
      ["list", "Liste von Kettenfahrzeugen der Wehrmacht"],
      ["list", "Liste der Handwaffen der Wehrmacht"],
      ["list", "Liste von Luftfahrzeugen der Luftwaffe (Wehrmacht)"],
      ["list", "Liste von Schiffen der Kriegsmarine"],
      ["search", "Wehrmacht incategory:Maschinengewehr", "M"],
      ["search", "Wehrmacht incategory:Lenkflugkörper", "K"],
      ["search", "Wehrmacht Vergeltungswaffe Rakete", null],
    ],
  },
  N: {
    years: [1930, 1990],
    forces: ["Nationale Volksarmee", "Landstreitkräfte der NVA", "Luftstreitkräfte der NVA", "Luftstreitkräfte/Luftverteidigung", "Volksmarine", "Grenztruppen der DDR"],
    sources: [
      ["list", "Liste der Technik und Bewaffnung der NVA"],
      ["search", '"Nationale Volksarmee" incategory:"Militärisches Kettenfahrzeug"', "P"],
      ["search", '"Nationalen Volksarmee" Panzer', null],
      ["search", "Volksmarine Schiffsklasse", null],
      ["search", '"Nationalen Volksarmee" Flugzeug', null],
      ["search", '"Nationalen Volksarmee" Hubschrauber', null],
      ["search", '"Nationalen Volksarmee" Lastkraftwagen', null],
      ["search", '"Nationalen Volksarmee" Handwaffe', null],
      ["search", '"Nationalen Volksarmee" Uniform Ausrüstung', null],
    ],
  },
  B: {
    years: [1900, 2030],
    forces: ["Bundeswehr", "Heer (Bundeswehr)", "Luftwaffe (Bundeswehr)", "Deutsche Marine", "Streitkräftebasis", "Bundesmarine", "Heeresflieger"],
    sources: [
      ["cat", "Kettenfahrzeug der Bundeswehr", "P", 3],
      ["cat", "Radfahrzeug der Bundeswehr", "R", 3],
      ["cat", "Luftfahrzeug der Bundeswehr", "F", 3],
      ["cat", "Militärschiff (Bundeswehr)", "S", 3],
      ["cat", "Militärschiffsklasse (Bundeswehr)", "S", 2],
      ["cat", "Militärische Ausrüstung (Bundeswehr)", "Z", 2],
      ["cat", "Handwaffe der Bundeswehr", "W", 2],
      ["list", "Liste von Handwaffen der Bundeswehr"],
      ["list", "Liste von Luftfahrzeugen der Bundeswehr"],
      ["list", "Liste von Kettenfahrzeugen der Bundeswehr"],
      ["list", "Liste von Radfahrzeugen der Bundeswehr"],
      ["list", "Liste der Schiffe der Bundeswehr"],
      ["search", "Bundeswehr incategory:Maschinengewehr", "M"],
      ["search", "Bundeswehr incategory:Lenkflugkörper", "K"],
      ["search", "Bundeswehr Panzerhaubitze Artilleriesystem", null],
    ],
  },
};

/* ------------------------------------------------------------ Details */
/** Details zu vielen Titeln; liefert Map angefragter Titel -> Seite (Weiterleitungen aufgelöst). */
async function pageDetails(titles) {
  const list = [...titles];
  const result = new Map();
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const pages = new Map();
    const alias = new Map();
    let cont = null;
    let rounds = 0;
    do {
      const json = await api({
        action: "query", titles: chunk.join("|"), redirects: "1", ...PAGE_PROPS,
        prop: "pageimages|pageprops|categories", cllimit: "max", clshow: "!hidden", ...(cont || {}),
      });
      if (!json) break;
      const q = json.query || {};
      for (const n of q.normalized || []) alias.set(n.from, n.to);
      for (const r of q.redirects || []) alias.set(r.from, r.to);
      for (const p of q.pages || []) {
        if (!p.title || p.missing || p.invalid) continue;
        const o = pages.get(p.title) || { title: p.title, ns: p.ns || 0, thumb: null, qid: null, cats: [], disambig: false };
        if (p.thumbnail) o.thumb = p.thumbnail.source;
        if (p.pageprops) {
          if (p.pageprops.wikibase_item) o.qid = p.pageprops.wikibase_item;
          if ("disambiguation" in p.pageprops) o.disambig = true;
        }
        if (p.categories) o.cats.push(...p.categories.map((c) => c.title));
        pages.set(p.title, o);
      }
      cont = json.continue || null;
      rounds++;
    } while (cont && rounds < 50);
    for (const t of chunk) {
      let x = t;
      for (let k = 0; k < 4 && alias.has(x); k++) x = alias.get(x);
      if (pages.has(x)) result.set(t, pages.get(x));
    }
  }
  return result;
}

async function wikidataDetails(qids) {
  const list = [...new Set(qids)];
  const out = new Map();
  for (let i = 0; i < list.length; i += 50) {
    const json = await api({ action: "wbgetentities", ids: list.slice(i, i + 50).join("|"), props: "claims|descriptions", languages: "de" }, "www.wikidata.org");
    for (const [qid, e] of Object.entries((json && json.entities) || {})) {
      const claims = e.claims || {};
      const year = (p) => {
        let best = null;
        for (const s of claims[p] || []) {
          const t = s.mainsnak && s.mainsnak.datavalue && s.mainsnak.datavalue.value && s.mainsnak.datavalue.value.time;
          if (!t) continue;
          const y = parseInt(t.slice(1, 5), 10);
          if (y > 1800 && y < 2100) best = best === null ? y : Math.min(best, y);
        }
        return best;
      };
      const img = (claims.P18 || [])[0];
      out.set(qid, {
        service: year("P729"),
        flight: year("P606"),
        inception: year("P571"),
        image: img && img.mainsnak && img.mainsnak.datavalue ? img.mainsnak.datavalue.value : null,
        desc: e.descriptions && e.descriptions.de ? e.descriptions.de.value : null,
      });
    }
  }
  return out;
}

const commonsThumb = (file) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}?width=640`;

/* ------------------------------------------------------------ Ablauf je Epoche */
async function buildEra(key, era) {
  const lines = [];
  const log = (s) => { console.log(`[${key}] ${s}`); lines.push(s); };
  const candidates = new Map(); // Titel -> Standardkategorie oder null
  const add = (titles, def) => {
    for (const t of titles) {
      if (skipTitle(t)) continue;
      if (!candidates.has(t) || (candidates.get(t) === null && def)) candidates.set(t, def || null);
    }
  };

  for (const [kind, name, def, depth] of era.sources) {
    if (kind === "cat") add(await pagesInCategory(name, depth, log), def);
    else if (kind === "list") add(await linkedFromList(name, log), null);
    else add(await searchTitles(name, log), def || null);
  }

  const forces = await resolveQids(era.forces);
  log(`Streitkräfte in Wikidata: ${forces.map((f) => `${f.title} (${f.qid})`).join(", ") || "keine gefunden"}`);
  const operated = await wikidataOperated(forces.map((f) => f.qid), log);
  add(operated.keys(), null);

  log(`Kandidaten gesamt: ${candidates.size}`);
  const details = await pageDetails(candidates.keys());
  const qids = [...details.values()].map((p) => p.qid).filter(Boolean);
  const wd = await wikidataDetails(qids);

  const items = new Map();
  let dropped = { excluded: 0, unclassified: 0, disambig: 0 };
  for (const [title, def] of candidates) {
    const page = details.get(title);
    if (!page || page.ns !== 0) continue;
    if (page.disambig) { dropped.disambig++; continue; }
    if (excluded(page.cats)) { dropped.excluded++; continue; }
    const c = classify(page.cats);
    let cat;
    if (def) cat = c && (groupOf(c) === groupOf(def) || def === "Z") ? c : def;
    else cat = c;
    if (!cat) { dropped.unclassified++; continue; }
    if (items.has(page.title)) continue;
    const w = page.qid ? wd.get(page.qid) || {} : {};
    let year = operated.get(title) || operated.get(page.title) || w.service || w.flight || w.inception || null;
    if (year && (year < era.years[0] || year > era.years[1])) year = null;
    const img = page.thumb || (w.image ? commonsThumb(w.image) : null);
    items.set(page.title, { t: page.title, c: cat, y: year, img, d: w.desc || null });
  }
  const list = [...items.values()].sort((a, b) => (a.y || 9999) - (b.y || 9999) || a.t.localeCompare(b.t, "de"));
  const byCat = {};
  list.forEach((x) => { byCat[x.c] = (byCat[x.c] || 0) + 1; });
  const withImg = list.filter((x) => x.img).length;
  const withYear = list.filter((x) => x.y).length;
  log(`Ergebnis: ${list.length} Einträge · mit Foto ${withImg} · mit Jahr ${withYear} · je Kategorie ${JSON.stringify(byCat)}`);
  log(`Aussortiert: ${JSON.stringify(dropped)}`);
  return { list, lines, stats: { count: list.length, withImg, withYear, byCat } };
}

/* ------------------------------------------------------------ Highlights mit Fotos */
async function featuredImages(rawFile) {
  const raw = await fs.readFile(rawFile, "utf8");
  const HINT = { P: "Panzer", R: "Militärfahrzeug", F: "Flugzeug", H: "Hubschrauber", S: "Schiff", W: "Waffe", M: "Maschinengewehr", A: "Geschütz", K: "Rakete", Z: "Militär" };
  const rows = raw.trim().split("\n").map((l) => l.split("|")).map(([, c, , n]) => ({ c, n }));
  const out = {};
  const direct = await pageDetails(rows.map((r) => r.n.replace(/[„“]/g, "")));
  let found = 0;
  for (const r of rows) {
    const req = r.n.replace(/[„“]/g, "");
    let page = direct.get(req) || null;
    const valid = page && !page.disambig && page.ns === 0;
    if (!valid) {
      const bag = await collect({ action: "query", generator: "search", gsrsearch: `${req} ${HINT[r.c]}`, gsrnamespace: "0", gsrlimit: "1", ...PAGE_PROPS }, DE, 1);
      page = [...bag.values()][0] || null;
    }
    if (page) {
      out[r.n] = { w: page.title, img: page.thumb || null };
      if (page.thumb) found++;
    }
  }
  console.log(`[Highlights] ${Object.keys(out).length} von ${rows.length} zugeordnet, ${found} mit Foto`);
  return out;
}

/* ------------------------------------------------------------ Start */
async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const started = Date.now();
  const meta = { generated: new Date().toISOString(), eras: {} };
  try { Object.assign(meta.eras, JSON.parse(await fs.readFile(path.join(OUT, "meta.json"), "utf8")).eras || {}); } catch {}
  const report = [];
  for (const [key, era] of Object.entries(ERAS)) {
    if (ONLY && !ONLY.includes(key)) continue;
    const { list, lines, stats } = await buildEra(key, era);
    if (list.length < 20) {
      console.warn(`[${key}] Zu wenige Einträge (${list.length}), vorhandene Datei bleibt bestehen.`);
      continue;
    }
    await fs.writeFile(path.join(OUT, `${key}.json`), JSON.stringify({ era: key, generated: meta.generated, items: list }));
    meta.eras[key] = stats;
    report.push(`### ${key}`, ...lines.map((l) => `- ${l}`), "");
  }
  if (!ONLY || ONLY.includes("featured")) {
    const featured = await featuredImages(path.join(ROOT, "site", "js", "highlights.txt"));
    await fs.writeFile(path.join(OUT, "featured.json"), JSON.stringify(featured));
  }
  await fs.writeFile(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 1));
  const summary = `## Arsenal Atlas – Datenstand ${meta.generated}\n\n${report.join("\n")}\n\n${requestCount} Anfragen in ${Math.round((Date.now() - started) / 1000)} s\n`;
  await fs.writeFile(path.join(ROOT, "site", "data", "REPORT.md"), summary);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(`Fertig: ${requestCount} Anfragen in ${Math.round((Date.now() - started) / 1000)} s`);
}

main().catch((err) => { console.error(err); process.exit(1); });
