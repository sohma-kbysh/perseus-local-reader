#!/usr/bin/env python3
"""Generic TEI (EpiDoc) -> reader JSON converter for canonical-greekLit texts.

Generalizes the original Apology-only build.py:
- works for prose (section / book.chapter.section), epic (book.line),
  and drama (episodes, speakers, lines)
- splits large works into chunks (one per top-level textpart div) when the
  citation scheme has two or more levels; single-level works stay one chunk
- links Greek words to the local morph panel (grc versions only)
"""
import html
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent
LEMMA_SQL = REPO_ROOT / "data" / "vendor" / "hib_lemmas.sql"

TEI = "{http://www.tei-c.org/ns/1.0}"

GREEK_RE = re.compile(r"[Ͱ-Ͽἀ-῿]+(?:[ʼ’'][Ͱ-Ͽἀ-῿]+)?")
INSERT_RE = re.compile(r"INSERT INTO `(?P<table>[^`]+)` VALUES (?P<values>.*);", re.S)
LEMMA_ROW_RE = re.compile(
    r"\((\d+),'((?:\\'|[^'])*)','((?:\\'|[^'])*)',(\d+),(\d+),(NULL|'(?:\\'|[^'])*')\)"
)

GREEK_TO_BETA = {
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "h",
    "θ": "q", "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "c",
    "ο": "o", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "u",
    "φ": "f", "χ": "x", "ψ": "y", "ω": "w",
}

_lemma_index_cache = None


def strip_marks(text):
    normalized = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def greek_to_bare(text):
    stripped = (
        strip_marks(text)
        .replace("᾿", "")
        .replace("ʼ", "")
        .replace("’", "")
        .replace("'", "")
    )
    return "".join(GREEK_TO_BETA.get(ch, "") for ch in stripped)


def unescape_sql(value):
    return value.replace("\\'", "'").replace("\\\\", "\\")


def load_lemma_index():
    global _lemma_index_cache
    if _lemma_index_cache is not None:
        return _lemma_index_cache
    index = {}
    if LEMMA_SQL.exists():
        sql_text = LEMMA_SQL.read_text(encoding="utf-8", errors="replace")
        for match in INSERT_RE.finditer(sql_text):
            if match.group("table") != "hib_lemmas":
                continue
            for row in LEMMA_ROW_RE.finditer(match.group("values")):
                lang_id = int(row.group(5))
                bare = unescape_sql(row.group(3))
                if lang_id != 2 or not bare:
                    continue
                short_def = row.group(6)
                index.setdefault(bare, []).append(
                    {
                        "id": int(row.group(1)),
                        "lemma": unescape_sql(row.group(2)),
                        "bare": bare,
                        "sequence": int(row.group(4)),
                        "shortDef": ""
                        if short_def == "NULL"
                        else unescape_sql(short_def[1:-1]),
                    }
                )
    _lemma_index_cache = index
    return index


def tag_of(node):
    return node.tag.split("}", 1)[-1]


class Serializer:
    """Recursively renders a TEI node tree to reader HTML.

    cite_units: citation hierarchy from the CTS refsDecl, e.g. ["section"],
    ["book", "line"], ["book", "chapter", "section"]. The bottom unit is
    rendered as an inline reference mark (Stephanus-style); units above it
    become headings; anything outside the hierarchy is structural only.
    """

    def __init__(self, cite_units=None):
        self.cite_units = [u.lower() for u in (cite_units or [])]
        self.bottom_unit = self.cite_units[-1] if self.cite_units else None
        self.unit_state = {}
        self.line_count = 0
        self.anchors = []
        self.section = ""

    def cite_path(self, n):
        """Dotted citation label for a bottom-unit reference, e.g. '1.2'."""
        parts = [
            self.unit_state[unit]
            for unit in self.cite_units[:-1]
            if unit in self.unit_state
        ]
        parts.append(n)
        return ".".join(parts)

    def add_anchor(self, anchor_id, label):
        if not self.anchors or self.anchors[-1]["id"] != anchor_id:
            self.anchors.append({"id": anchor_id, "label": label})

    def serialize(self, node, depth=0):
        pieces = []
        if node.text:
            pieces.append(html.escape(node.text))
        for child in node:
            pieces.append(self.render_child(child, depth))
            if child.tail:
                pieces.append(html.escape(child.tail))
        return "".join(pieces)

    def render_child(self, child, depth):
        tag = tag_of(child)
        attrib = child.attrib
        if tag == "div":
            subtype = attrib.get("subtype", attrib.get("type", "")).lower()
            n = attrib.get("n", "")
            marker = ""
            if n:
                in_units = subtype in self.cite_units
                is_bottom = subtype == self.bottom_unit
                fallback = not self.cite_units
                if is_bottom or fallback:
                    path = self.cite_path(n) if in_units else n
                    anchor_id = f"c-{path}".replace(" ", "_")
                    self.add_anchor(anchor_id, path)
                    self.section = path
                    marker = (
                        '<br class="stephanus-break" />'
                        f'<span class="stephanus" id="{html.escape(anchor_id)}">{html.escape(n)}</span>'
                    )
                elif in_units:
                    self.unit_state[subtype] = n
                    anchor_id = f"c-{subtype}-{n}".replace(" ", "_")
                    label = f"{subtype.capitalize()} {n}"
                    self.add_anchor(anchor_id, label)
                    self.section = n
                    marker = (
                        f'<h3 class="textpart-heading" id="{html.escape(anchor_id)}">'
                        f"{html.escape(label)}</h3>"
                    )
            inner = self.serialize(child, depth + 1)
            return f'<section class="textpart">{marker}{inner}</section>'
        if tag == "milestone":
            unit = attrib.get("unit", "").lower()
            n = attrib.get("n", "")
            if unit == "para":
                return '<span class="para-break"></span>'
            in_units = unit in self.cite_units if self.cite_units else bool(n)
            if n and in_units:
                if self.cite_units and unit != self.bottom_unit:
                    # Upper citation unit expressed as a milestone: track the
                    # position for dotted labels but stay visually quiet.
                    self.unit_state[unit] = n
                    return ""
                path = self.cite_path(n) if self.cite_units else n
                self.section = path
                anchor_id = f"m-{path}".replace(" ", "_")
                self.add_anchor(anchor_id, path)
                return (
                    '<br class="stephanus-break" />'
                    f'<span class="stephanus" id="{html.escape(anchor_id)}">{html.escape(n)}</span>'
                )
            return ""
        if tag == "p":
            return f"<p>{self.serialize(child, depth)}</p>"
        if tag == "l":
            self.line_count += 1
            n = attrib.get("n", "")
            number = n or str(self.line_count)
            show = False
            try:
                show = int(number) % 5 == 0
            except ValueError:
                show = bool(n)
            num_html = (
                f'<span class="line-no">{html.escape(number)}</span>' if show else ""
            )
            anchor = ""
            try:
                if self.bottom_unit == "line" and (
                    int(number) % 25 == 0 or int(number) == 1
                ):
                    anchor_id = f"ln-{number}"
                    self.add_anchor(anchor_id, number)
                    anchor = f' id="{anchor_id}"'
            except ValueError:
                pass
            return (
                f'<span class="verse-line"{anchor}>{self.serialize(child, depth)}'
                f"{num_html}</span>"
            )
        if tag == "lb":
            return "<br />"
        if tag == "sp":
            return f'<div class="speech">{self.serialize(child, depth)}</div>'
        if tag == "speaker":
            return f'<span class="speaker">{self.serialize(child, depth)}</span>'
        if tag == "q" or tag == "said":
            return f"<q>{self.serialize(child, depth)}</q>"
        if tag == "quote":
            return f'<span class="tei-quote">{self.serialize(child, depth)}</span>'
        if tag == "add":
            return f'<span class="editorial-add">{self.serialize(child, depth)}</span>'
        if tag == "del":
            return f'<span class="editorial-del">{self.serialize(child, depth)}</span>'
        if tag == "gap":
            return '<span class="gap">[…]</span>'
        if tag == "note":
            note_text = "".join(child.itertext()).strip()
            if not note_text:
                return ""
            return (
                f'<sup class="tei-note" title="{html.escape(note_text)}">※</sup>'
            )
        if tag == "head":
            return f'<h4 class="tei-head">{self.serialize(child, depth)}</h4>'
        if tag == "label":
            return f'<span class="tei-label">{self.serialize(child, depth)}</span>'
        if tag == "castList":
            return ""
        # foreign, name, placeName, persName, w, seg, hi, etc.: transparent
        return self.serialize(child, depth)


def link_words(fragment, work_urn):
    """Wrap Greek word tokens in minimal morph-link markup.

    The reader builds the morph URL client-side from the word text, so the
    marker stays tiny — this keeps large works (Iliad: ~112k running words)
    to a fraction of the size of attribute-heavy links.
    """

    def repl(match):
        return f'<a class="word">{html.escape(match.group(0))}</a>'

    parts = re.split(r"(<[^>]+>)", fragment)
    return "".join(
        part if part.startswith("<") else GREEK_RE.sub(repl, part) for part in parts
    )


def citation_units(root):
    """Return citation unit names ordered top -> bottom (e.g. ["book", "line"]).

    cRefPattern entries are ordered most-specific-first in Perseus files; the
    number of capture groups in matchPattern gives the depth, so sorting by it
    yields top-first order.
    """
    patterns = root.findall(
        f".//{TEI}refsDecl[@n='CTS']/{TEI}cRefPattern"
    ) or root.findall(f".//{TEI}refsDecl/{TEI}cRefPattern")
    units = []
    for pattern in patterns:
        name = pattern.attrib.get("n", "")
        match = pattern.attrib.get("matchPattern", "")
        depth = match.count("(")
        if name:
            units.append((depth, name))
    units.sort(key=lambda item: item[0])
    return [name for _depth, name in units]


def structural_units(edition):
    """Fallback citation hierarchy from nested textpart div subtypes.

    Some files (e.g. Pausanias) have cRefPattern entries without an `n`
    attribute; the div nesting (book > chapter > section) still tells us the
    hierarchy.
    """
    units = []
    node = edition
    while True:
        child = node.find(f"./{TEI}div")
        if child is None or child.attrib.get("type") != "textpart":
            break
        subtype = child.attrib.get("subtype", "").lower()
        if not subtype or subtype in units:
            break
        units.append(subtype)
        node = child
    return units


def find_edition_div(root):
    body = root.find(f".//{TEI}text/{TEI}body")
    if body is None:
        raise ValueError("TEI body not found")
    for div in body.findall(f"./{TEI}div"):
        if div.attrib.get("type") in ("edition", "translation"):
            return div
    first = body.find(f"./{TEI}div")
    return first if first is not None else body


def chunk_label(div, index):
    subtype = div.attrib.get("subtype", div.attrib.get("type", "part"))
    n = div.attrib.get("n", str(index))
    return f"{subtype.capitalize()} {n}".strip(), n


def collect_words(nodes):
    all_words = {}
    for node in nodes:
        text = "".join(node.itertext())
        for word in GREEK_RE.findall(text):
            bare = greek_to_bare(word)
            if bare:
                entry = all_words.setdefault(bare, {"forms": set(), "count": 0})
                entry["forms"].add(word)
                entry["count"] += 1
    return {
        bare: {"forms": sorted(value["forms"]), "count": value["count"]}
        for bare, value in sorted(all_words.items())
    }


_lemma_keys_cache = None
_lemma_short_keys_cache = None


def _lemma_key_tables(lemma_index):
    """Sorted key list (for bisect prefix scans) + keys shorter than 4 chars."""
    global _lemma_keys_cache, _lemma_short_keys_cache
    if _lemma_keys_cache is None:
        _lemma_keys_cache = sorted(lemma_index)
        _lemma_short_keys_cache = [key for key in _lemma_keys_cache if len(key) < 4]
    return _lemma_keys_cache, _lemma_short_keys_cache


def focused_lemmas(words, lemma_index):
    import bisect

    keys, short_keys = _lemma_key_tables(lemma_index)
    result = {}
    for bare in words:
        candidates = list(lemma_index.get(bare, []))
        if not candidates:
            prefix = bare[: max(4, min(len(bare), 6))]
            scan = bare[:4]
            # Every fallback candidate of length >= 4 shares bare's first four
            # characters, so a bisect range scan replaces the full-index scan.
            lo = bisect.bisect_left(keys, scan)
            hi = bisect.bisect_right(keys, scan + "￿")
            pool = keys[lo:hi] + [
                key for key in short_keys if bare.startswith(key)
            ]
            candidates = [
                item
                for key in pool
                if key.startswith(prefix)
                or bare.startswith(key[: max(4, min(len(key), 6))])
                for item in lemma_index[key][:2]
            ][:8]
        # Only the fields the morph panel renders — keeps large works small.
        result[bare] = [
            {"lemma": item["lemma"], "shortDef": item["shortDef"]}
            for item in candidates[:12]
        ]
    return result


def convert_version(xml_path, version_meta, work_urn):
    """Convert one edition/translation XML file to a reader version dict."""
    root = ET.parse(xml_path).getroot()
    edition = find_edition_div(root)
    lang = version_meta.get("lang") or edition.attrib.get(
        "{http://www.w3.org/XML/1998/namespace}lang", ""
    )
    units = citation_units(root) or structural_units(edition)
    top_divs = edition.findall(f"./{TEI}div")
    is_greek = lang == "grc"

    chunks = []
    if len(units) >= 2 and len(top_divs) > 1:
        # Multi-level citation scheme: one chunk per top-level div (book, ...);
        # inside a chunk, only the remaining units matter.
        inner_units = units[1:]
        for index, div in enumerate(top_divs, start=1):
            label, n = chunk_label(div, index)
            serializer = Serializer(cite_units=inner_units)
            body_html = serializer.serialize(div)
            if is_greek:
                body_html = link_words(body_html, work_urn)
            chunks.append(
                {
                    "n": n,
                    "label": label,
                    "html": body_html,
                    "anchors": serializer.anchors,
                }
            )
        word_nodes = top_divs
    else:
        serializer = Serializer(cite_units=units)
        body_html = serializer.serialize(edition)
        if is_greek:
            body_html = link_words(body_html, work_urn)
        chunks.append(
            {
                "n": "all",
                "label": "",
                "html": body_html,
                "anchors": serializer.anchors,
            }
        )
        word_nodes = [edition]

    version = {
        "urn": version_meta.get("urn", ""),
        "kind": version_meta.get("kind", ""),
        "lang": lang,
        "label": version_meta.get("label", ""),
        "description": version_meta.get("description", ""),
        "chunks": chunks,
    }
    if is_greek:
        words = collect_words(word_nodes)
        version["words"] = words
        version["lemmas"] = focused_lemmas(words, load_lemma_index())
    return version


def build_work(work_meta, version_files):
    """Assemble the full work JSON.

    work_meta: catalog entry ({urn, group, title, versions:[...]})
    version_files: list of (version_meta, xml_path) pairs
    """
    versions = []
    for version_meta, xml_path in version_files:
        versions.append(convert_version(xml_path, version_meta, work_meta["urn"]))
    return {
        "workUrn": work_meta["urn"],
        "group": work_meta.get("group", ""),
        "title": work_meta.get("title", ""),
        "source": "PerseusDL/canonical-greekLit",
        "versions": versions,
    }


if __name__ == "__main__":
    import sys

    xml_file = Path(sys.argv[1])
    meta = {"urn": "test", "lang": sys.argv[2] if len(sys.argv) > 2 else "grc"}
    version = convert_version(xml_file, meta, "urn:test")
    print(
        json.dumps(
            {
                "chunks": len(version["chunks"]),
                "labels": [c["label"] for c in version["chunks"][:5]],
                "anchors0": version["chunks"][0]["anchors"][:8],
                "html0": version["chunks"][0]["html"][:400],
                "words": len(version.get("words", {})),
            },
            ensure_ascii=False,
            indent=1,
        )
    )
