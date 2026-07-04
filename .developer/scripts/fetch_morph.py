#!/usr/bin/env python3
import argparse
import hashlib
import html
import json
import re
import time
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


ROOT = Path(__file__).resolve().parents[1]
APP_DATA = ROOT / "app" / "data"
CACHE = ROOT / "data" / "vendor" / "morph_html"
OUT = APP_DATA / "morph.json"

BASE_URL = "https://www.perseus.tufts.edu/hopper/morph"

GREEK_TO_BETA = {
    "α": "a",
    "β": "b",
    "γ": "g",
    "δ": "d",
    "ε": "e",
    "ζ": "z",
    "η": "h",
    "θ": "q",
    "ι": "i",
    "κ": "k",
    "λ": "l",
    "μ": "m",
    "ν": "n",
    "ξ": "c",
    "ο": "o",
    "π": "p",
    "ρ": "r",
    "σ": "s",
    "ς": "s",
    "τ": "t",
    "υ": "u",
    "φ": "f",
    "χ": "x",
    "ψ": "y",
    "ω": "w",
}

MARK_TO_BETA = {
    "\u0313": ")",
    "\u0314": "(",
    "\u0301": "/",
    "\u0300": "\\",
    "\u0342": "=",
    "\u0308": "+",
    "\u0345": "|",
}


def greek_to_beta(text):
    out = []
    for raw in text:
        decomposed = unicodedata.normalize("NFD", raw)
        if not decomposed:
            continue
        base = decomposed[0]
        lower = base.lower()
        beta = GREEK_TO_BETA.get(lower)
        if not beta:
            continue
        marks = "".join(MARK_TO_BETA[ch] for ch in decomposed[1:] if ch in MARK_TO_BETA)
        if base != lower:
            beta = "*" + beta
        out.append(beta + marks)
    return "".join(out)


class MorphParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.analyses = []
        self.current = None
        self.div_depth = 0
        self.in_h4 = False
        self.in_def = False
        self.in_td = False
        self.current_td = []
        self.current_row = []
        self.capture = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set(attrs.get("class", "").split())
        if tag == "div" and "analysis" in classes:
            self.current = {"lemmaId": "", "lemma": "", "definition": "", "parses": []}
            self.div_depth = 1
            return
        if not self.current:
            return
        if tag == "div":
            self.div_depth += 1
        if tag == "div" and "lemma" in classes:
            self.current["lemmaId"] = attrs.get("id", "")
        elif tag == "h4":
            self.in_h4 = True
            self.capture = []
        elif tag == "span" and "lemma_definition" in classes:
            self.in_def = True
            self.capture = []
        elif tag == "tr":
            self.current_row = []
        elif tag == "td":
            self.in_td = True
            self.current_td = []

    def handle_endtag(self, tag):
        if not self.current:
            return
        if tag == "h4" and self.in_h4:
            self.current["lemma"] = clean("".join(self.capture))
            self.in_h4 = False
        elif tag == "span" and self.in_def:
            self.current["definition"] = clean("".join(self.capture))
            self.in_def = False
        elif tag == "td" and self.in_td:
            self.current_row.append(clean("".join(self.current_td)))
            self.in_td = False
        elif tag == "tr":
            if len(self.current_row) >= 2 and self.current_row[0] and self.current_row[1]:
                self.current["parses"].append({"form": self.current_row[0], "parse": self.current_row[1]})
        elif tag == "div":
            self.div_depth -= 1
            if self.div_depth == 0:
                if self.current["lemma"] or self.current["parses"]:
                    self.analyses.append(self.current)
                self.current = None

    def handle_data(self, data):
        if self.in_h4 or self.in_def:
            self.capture.append(data)
        if self.in_td:
            self.current_td.append(data)


def clean(value):
    return html.unescape(re.sub(r"\s+", " ", value)).strip()


def parse_html(source):
    parser = MorphParser()
    parser.feed(source)
    return parser.analyses


def cache_path(beta):
    digest = hashlib.sha1(beta.encode("utf-8")).hexdigest()
    return CACHE / f"{digest}.html"


def fetch(beta, delay):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = cache_path(beta)
    if path.exists() and path.stat().st_size > 1000:
        return path.read_text(encoding="utf-8", errors="replace"), True
    url = BASE_URL + "?" + urlencode({"l": beta, "la": "greek"})
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    tries = 0
    while True:
        tries += 1
        try:
            with urlopen(request, timeout=30) as response:
                body = response.read().decode("utf-8", errors="replace")
            break
        except HTTPError as error:
            if error.code == 429 and tries <= 8:
                wait = min(300, 45 * tries)
                print(f"429 for {beta}; waiting {wait}s")
                time.sleep(wait)
                continue
            raise
        except URLError:
            if tries <= 4:
                wait = 15 * tries
                print(f"network error for {beta}; waiting {wait}s")
                time.sleep(wait)
                continue
            raise
    path.write_text(body, encoding="utf-8")
    time.sleep(delay)
    return body, False


def load_morphs():
    if OUT.exists():
        return json.loads(OUT.read_text(encoding="utf-8")).get("forms", {})
    return {}


def fetch_one(form, bare=None, delay=0.0):
    morphs = load_morphs()
    if form in morphs and morphs[form].get("analyses"):
        return morphs[form]
    beta = greek_to_beta(form)
    if not beta:
        raise ValueError(f"Could not convert to Beta Code: {form}")
    source, _from_cache = fetch(beta, delay)
    analyses = parse_html(source)
    entry = {
        "form": form,
        "bare": bare or "",
        "beta": beta,
        "analyses": analyses,
        "source": "Perseus Hopper morph",
        "fetched": True,
    }
    morphs[form] = entry
    write_output(morphs)
    return entry


def load_forms(work_id):
    """Collect Greek word forms from a downloaded work JSON (app/data/texts/)."""
    data = json.loads(
        (APP_DATA / "texts" / f"{work_id}.json").read_text(encoding="utf-8")
    )
    forms = {}
    for version in data.get("versions", []):
        if version.get("lang") != "grc":
            continue
        for bare, info in (version.get("words") or {}).items():
            for form in info.get("forms", []):
                if form not in forms:
                    beta = greek_to_beta(form)
                    if beta:
                        forms[form] = {"bare": bare, "beta": beta}
    return forms


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("work", help="work id, e.g. tlg0059.tlg002 (must be downloaded)")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--delay", type=float, default=0.35)
    parser.add_argument("--reparse", action="store_true")
    args = parser.parse_args()

    forms = load_forms(args.work)
    morphs = load_morphs()

    items = list(forms.items())
    if args.limit:
        items = items[: args.limit]

    fetched = 0
    for index, (form, meta) in enumerate(items, start=1):
        if form in morphs and not args.reparse:
            continue
        source, from_cache = fetch(meta["beta"], args.delay)
        analyses = parse_html(source)
        morphs[form] = {
            "form": form,
            "bare": meta["bare"],
            "beta": meta["beta"],
            "analyses": analyses,
            "source": "Perseus Hopper morph",
            "fetched": True,
        }
        write_output(morphs)
        fetched += 0 if from_cache else 1
        if index % 25 == 0:
            write_output(morphs)
            print(f"{index}/{len(items)} processed, {fetched} fetched")

    write_output(morphs)
    print(f"done: {len(morphs)} forms cached, {fetched} fetched this run")


def write_output(morphs):
    APP_DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"forms": morphs, "generatedFrom": "Perseus Hopper morph HTML"}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
