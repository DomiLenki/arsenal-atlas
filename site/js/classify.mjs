/* Gemeinsame Regeln zur Einordnung von Wikipedia-Artikeln (Datensammler und App). */

/** Reihenfolge ist wichtig: spezifische Begriffe vor allgemeinen. */
export const CATEGORY_RULES = [
  ["K", ["u-boot-abwehr", "wasserbombe"]],
  ["S", ["torpedoboot", "schnellboot", "kanonenboot", "minensuchboot", "u-boot", "unterseeboot", "minenleger", "hilfskreuzer", "militärschiff", "schiffsklasse"]],
  ["K", ["panzerabwehrmine", "landmine", "seemine", "abwehrmine"]],
  ["M", ["maschinengewehr"]],
  ["A", ["raketenwerfer", "artilleriesystem", "panzerhaubitze", "selbstfahrlafette", "eisenbahngeschütz"]],
  ["K", ["rakete", "flugkörper", "lenkwaffe", "panzerabwehrwaffe", "marschflugkörper", "torpedo", "fliegerbombe", "gleitbombe", "seemine", "landmine"]],
  ["H", ["hubschrauber"]],
  ["F", ["flugzeug", "luftfahrzeug", "luftschiff", "drohne", "segelflug", "lastensegler"]],
  ["R", ["radpanzer", "spähwagen", "panzerwagen", "halbkettenfahrzeug", "zugkraftwagen"]],
  ["P", ["kettenfahrzeug", "kampfpanzer", "schützenpanzer", "jagdpanzer", "flakpanzer", "flugabwehrkanonenpanzer", "spähpanzer", "transportpanzer", "bergepanzer", "brückenlegepanzer", "pionierpanzer", "sturmgeschütz", "panzerkampfwagen", "leichter panzer", "mittlerer panzer", "schwerer panzer"]],
  ["A", ["geschütz", "haubitze", "kanone", "mörser", "artillerie", "flugabwehrwaffe", "granatwerfer", "minenwerfer"]],
  ["W", ["pistole", "gewehr", "karabiner", "revolver", "büchse", "handwaffe", "handgranate", "flammenwerfer", "bajonett", "seitengewehr", "maschinenpistole", "blankwaffe"]],
  ["S", ["schiff", "boot", "korvette", "fregatte", "zerstörer", "kreuzer", "u-boot", "minensucher", "tender", "flottenbegleiter"]],
  ["P", ["panzer"]],
  ["R", ["radfahrzeug", "lastkraftwagen", "lkw", "geländewagen", "pkw", "kraftrad", "motorrad", "zugmaschine", "militärfahrzeug", "kraftfahrzeug", "automobil", "kettenkrad"]],
  ["Z", ["ausrüstung", "helm", "uniform", "tarnmuster", "funkgerät", "optisches gerät", "fernglas", "zielfernrohr", "schlüsselmaschine", "chiffriermaschine", "feldküche", "nachtsichtgerät", "radar", "gasmaske", "fallschirm", "feldflasche", "tarnkleidung", "kopfbedeckung", "schutzausrüstung", "spaten", "militärische ausrüstung"]],
];

/** Ganze Wörter in Kategorienamen, die auf Personen, Orte, Einheiten usw. hinweisen. */
export const EXCLUDE_WORDS = [
  "geboren", "gestorben", "person", "militärperson", "gemeinde", "konflikt", "begriffsklärung",
  "organisation", "truppengattung", "dienstgrad", "kaserne", "pilot", "film", "roman", "orden", "turm",
  "militärischer verband", "militärischer verband der ss",
];
/** Wortenden, die auch in Zusammensetzungen ausschließen (z. B. Flugzeughersteller, Seeschlacht). */
export const EXCLUDE_SUFFIXES = [
  "hersteller", "unternehmen", "schlacht", "museum", "offizier", "kennzeichen", "bauwerk",
  "baudenkmal", "bunker", "befestigungsanlage", "festung", "denkmal", "geschwader", "behörde", "flugplatz",
  "konstrukteur", "ingenieur", "computerspiel", "ehrenzeichen", "kriegsfilm",
];
const L = "a-zäöüß";
/** „Mann“ und „Frau“ nur als ganze Kategorie (Personenartikel), nicht z. B. in „Schimpfwort (Mann)“. */
export const EXCLUDE_PATTERN = `^(mann|frau)$|(^|[^${L}])(${EXCLUDE_WORDS.join("|")})([^${L}]|$)|(${EXCLUDE_SUFFIXES.join("|")})([^${L}]|$)`;

const GROUP = { P: "v", R: "v", F: "v", H: "v", S: "v", W: "w", M: "w", A: "w", K: "w", Z: "z" };
export const groupOf = (c) => GROUP[c];
