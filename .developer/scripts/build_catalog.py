#!/usr/bin/env python3
"""Build app/data/catalog.json from PerseusDL/canonical-greekLit metadata.

Uses a sparse, blob-filtered clone that checks out only the __cts__.xml
metadata files (a few MB), not the full text corpus. Run this at development
time; the generated catalog.json is shipped with the reader.

Usage:
    python3 build_catalog.py             # clone/update metadata and build
    python3 build_catalog.py --no-fetch  # rebuild from the existing clone
"""
import argparse
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLONE = ROOT / "data" / "vendor" / "canonical-greekLit-meta"
OUT = ROOT / "app" / "data" / "catalog.json"

REPO_URL = "https://github.com/PerseusDL/canonical-greekLit.git"
CTS_NS = "{http://chs.harvard.edu/xmlns/cts}"


def sync_metadata():
    if not CLONE.exists():
        CLONE.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "clone", "--filter=blob:none", "--no-checkout", REPO_URL, str(CLONE)],
            check=True,
        )
        subprocess.run(
            ["git", "-C", str(CLONE), "sparse-checkout", "set", "--no-cone", "**/__cts__.xml"],
            check=True,
        )
        subprocess.run(["git", "-C", str(CLONE), "checkout", "master"], check=True)
    else:
        subprocess.run(["git", "-C", str(CLONE), "pull", "--ff-only"], check=True)


def text_of(parent, tag, prefer_lang="eng"):
    nodes = parent.findall(f"{CTS_NS}{tag}")
    if not nodes:
        return ""
    for node in nodes:
        if node.attrib.get("{http://www.w3.org/XML/1998/namespace}lang") == prefer_lang:
            return (node.text or "").strip()
    return (nodes[0].text or "").strip()


def parse_group(path):
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return None
    if not root.tag.endswith("textgroup"):
        return None
    return {
        "urn": root.attrib.get("urn", ""),
        "name": text_of(root, "groupname"),
    }


def parse_work(path):
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return None
    if not root.tag.endswith("work"):
        return None
    versions = []
    for kind in ("edition", "translation"):
        for node in root.findall(f"{CTS_NS}{kind}"):
            urn = node.attrib.get("urn", "")
            if not urn:
                continue
            lang = node.attrib.get(
                "{http://www.w3.org/XML/1998/namespace}lang", ""
            )
            if kind == "edition" and not lang:
                lang = root.attrib.get(
                    "{http://www.w3.org/XML/1998/namespace}lang", "grc"
                )
            versions.append(
                {
                    "urn": urn,
                    "kind": kind,
                    "lang": lang,
                    "label": text_of(node, "label"),
                    "description": text_of(node, "description"),
                }
            )
    if not versions:
        return None
    return {
        "urn": root.attrib.get("urn", ""),
        "groupUrn": root.attrib.get("groupUrn", ""),
        "lang": root.attrib.get("{http://www.w3.org/XML/1998/namespace}lang", ""),
        "title": text_of(root, "title"),
        "versions": versions,
    }


def existing_files():
    """All file paths in the repo tree — no blob download needed."""
    output = subprocess.run(
        ["git", "-C", str(CLONE), "ls-tree", "-r", "master", "--name-only"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return set(output.splitlines())


def version_repo_path(version_urn):
    tail = version_urn.rsplit(":", 1)[-1]
    group, work = tail.split(".", 2)[:2]
    return f"data/{group}/{work}/{tail}.xml"


def build():
    data_dir = CLONE / "data"
    files = existing_files()
    groups = {}
    works = []
    dropped = 0
    for meta in sorted(data_dir.glob("*/__cts__.xml")):
        group = parse_group(meta)
        if group and group["urn"]:
            groups[group["urn"]] = group["name"]
    for meta in sorted(data_dir.glob("*/*/__cts__.xml")):
        work = parse_work(meta)
        if not (work and work["urn"]):
            continue
        # Keep only versions whose XML actually exists in the repo, so the
        # reader never offers a download that would 404.
        kept = [
            v for v in work["versions"] if version_repo_path(v["urn"]) in files
        ]
        dropped += len(work["versions"]) - len(kept)
        if not kept:
            continue
        work["versions"] = kept
        work["group"] = groups.get(work["groupUrn"], "")
        works.append(work)
    if dropped:
        print(f"dropped {dropped} catalog versions without an XML file", file=sys.stderr)
    return {
        "source": "PerseusDL/canonical-greekLit",
        "generated": date.today().isoformat(),
        "works": works,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-fetch", action="store_true")
    args = parser.parse_args()
    if not args.no_fetch:
        sync_metadata()
    catalog = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"catalog.json: {len(catalog['works'])} works, "
        f"{sum(len(w['versions']) for w in catalog['works'])} versions",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
