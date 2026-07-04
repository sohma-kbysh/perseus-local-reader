#!/usr/bin/env python3
import html
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlencode


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "data" / "vendor"
OUT = ROOT / "app" / "data"
TEI_NS = {"tei": "http://www.tei-c.org/ns/1.0"}

GREEK_RE = re.compile(r"[Ͱ-Ͽἀ-῿]+(?:[ʼ’'][Ͱ-Ͽἀ-῿]+)?")
INSERT_RE = re.compile(r"INSERT INTO `(?P<table>[^`]+)` VALUES (?P<values>.*);", re.S)
LEMMA_ROW_RE = re.compile(
    r"\((\d+),'((?:\\'|[^'])*)','((?:\\'|[^'])*)',(\d+),(\d+),(NULL|'(?:\\'|[^'])*')\)"
)

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


def strip_marks(text):
    normalized = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def greek_to_bare(text):
    stripped = strip_marks(text).replace("᾿", "").replace("ʼ", "").replace("’", "").replace("'", "")
    return "".join(GREEK_TO_BETA.get(ch, "") for ch in stripped)


def unescape_sql(value):
    return value.replace("\\'", "'").replace("\\\\", "\\")


def iter_lemma_rows(sql_text):
    for match in INSERT_RE.finditer(sql_text):
        if match.group("table") != "hib_lemmas":
            continue
        for row in LEMMA_ROW_RE.finditer(match.group("values")):
            short_def = row.group(6)
            yield (
                int(row.group(1)),
                unescape_sql(row.group(2)),
                unescape_sql(row.group(3)),
                int(row.group(4)),
                int(row.group(5)),
                None if short_def == "NULL" else unescape_sql(short_def[1:-1]),
            )


def load_lemmas():
    path = VENDOR / "hib_lemmas.sql"
    if not path.exists():
        return {}
    index = {}
    sql_text = path.read_text(encoding="utf-8", errors="replace")
    for row in iter_lemma_rows(sql_text):
        lemma_id, lemma_text, bare, seq, lang_id, short_def = row
        if lang_id != 2 or not bare:
            continue
        index.setdefault(bare, []).append(
            {
                "id": lemma_id,
                "lemma": lemma_text,
                "bare": bare,
                "sequence": seq,
                "shortDef": short_def or "",
            }
        )
    return index


def load_parses(lemma_index):
    path = VENDOR / "hib_parses.sql"
    if not path.exists():
        return {}
    sql_text = path.read_text(encoding="utf-8", errors="replace")
    parses = {}
    # Full parse support is intentionally left as a narrow extension point
    # because the official hib_parses dump could not be downloaded completely in
    # this environment. Keep the returned shape stable for the UI.
    return parses


def serialize_node(node, current_section):
    pieces = []
    if node.text:
        pieces.append(html.escape(node.text))
    for child in node:
        tag = child.tag.split("}", 1)[-1]
        if tag == "milestone" and child.attrib.get("unit") == "section":
            label = child.attrib.get("n", "")
            pieces.append(f'<span class="stephanus" id="s-{html.escape(label)}">{html.escape(label)}</span>')
        elif tag == "milestone" and child.attrib.get("unit") == "para":
            pieces.append('<span class="para-break"></span>')
        elif tag == "q":
            pieces.append("<q>" + serialize_node(child, current_section) + "</q>")
        elif tag == "add":
            pieces.append('<span class="editorial-add">' + serialize_node(child, current_section) + "</span>")
        else:
            pieces.append(serialize_node(child, current_section))
        if child.tail:
            pieces.append(html.escape(child.tail))
    return "".join(pieces)


def link_words(fragment, section):
    def repl(match):
        word = match.group(0)
        bare = greek_to_bare(word)
        href = "./morph.html?" + urlencode({"form": word, "bare": bare, "section": section})
        return (
            f'<a class="word" href="{href}" target="morphFrame" '
            f'data-form="{html.escape(word)}" data-bare="{html.escape(bare)}" '
            f'data-section="{html.escape(section)}">{html.escape(word)}</a>'
        )

    # Avoid linking inside tags by splitting on simple HTML tags generated above.
    parts = re.split(r"(<[^>]+>)", fragment)
    return "".join(part if part.startswith("<") else GREEK_RE.sub(repl, part) for part in parts)


def build_text():
    tree = ET.parse(VENDOR / "apology-grc.xml")
    sections = []
    all_words = {}
    for div in tree.findall(".//tei:div[@subtype='section']", TEI_NS):
        section = div.attrib.get("n", "")
        body = "".join(serialize_node(child, section) for child in div)
        linked = link_words(body, section)
        for word in GREEK_RE.findall(ET.tostring(div, encoding="unicode", method="text")):
            bare = greek_to_bare(word)
            if bare:
                all_words.setdefault(bare, {"forms": set(), "count": 0})
                all_words[bare]["forms"].add(word)
                all_words[bare]["count"] += 1
        sections.append({"section": section, "html": linked})
    words = {
        bare: {"forms": sorted(value["forms"]), "count": value["count"]}
        for bare, value in sorted(all_words.items())
    }
    return sections, words


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sections, words = build_text()
    lemma_index = load_lemmas()
    parse_index = load_parses(lemma_index)
    focused_lemmas = {}
    for bare in words:
        candidates = list(lemma_index.get(bare, []))
        if not candidates:
            prefix = bare[: max(4, min(len(bare), 6))]
            candidates = [
                item
                for key, values in lemma_index.items()
                if key.startswith(prefix) or bare.startswith(key[: max(4, min(len(key), 6))])
                for item in values[:2]
            ][:8]
        focused_lemmas[bare] = candidates[:12]
    (OUT / "apology.json").write_text(
        json.dumps(
            {
                "title": "Plato, Apology",
                "source": "PerseusDL canonical-greekLit / tlg0059.tlg002.perseus-grc2",
                "sections": sections,
                "words": words,
                "lemmas": focused_lemmas,
                "parses": parse_index,
                "hasFullParses": bool(parse_index),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
