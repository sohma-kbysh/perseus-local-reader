#!/usr/bin/env python3
"""On-demand download + conversion + cache of Perseus works.

A "work" is downloaded as a unit: every version (Greek edition, English
translation, ...) listed in catalog.json is fetched together, converted with
tei_convert, and stored as one JSON file under app/data/texts/. Once written,
the work is fully readable offline.
"""
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import tei_convert

ROOT = Path(__file__).resolve().parents[1]
APP_DATA = ROOT / "app" / "data"
TEXTS_OUT = APP_DATA / "texts"
XML_CACHE = ROOT / "data" / "vendor" / "texts"
CATALOG = APP_DATA / "catalog.json"

RAW_BASE = "https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/data"

_catalog_cache = None


def load_catalog():
    global _catalog_cache
    if _catalog_cache is None:
        _catalog_cache = json.loads(CATALOG.read_text(encoding="utf-8"))
    return _catalog_cache


def work_id(work_urn):
    """urn:cts:greekLit:tlg0059.tlg002 -> tlg0059.tlg002"""
    tail = work_urn.rsplit(":", 1)[-1]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", tail):
        raise ValueError(f"unsafe work urn: {work_urn}")
    return tail

def work_path(work_urn):
    return TEXTS_OUT / f"{work_id(work_urn)}.json"


def is_downloaded(work_urn):
    return work_path(work_urn).exists()


def find_work(work_urn):
    for work in load_catalog()["works"]:
        if work["urn"] == work_urn:
            return work
    raise KeyError(f"work not in catalog: {work_urn}")


def version_xml_url(version_urn):
    """urn:cts:greekLit:tlg0059.tlg002.perseus-grc2 -> raw GitHub URL"""
    tail = version_urn.rsplit(":", 1)[-1]
    group, work, _rest = tail.split(".", 2)
    return f"{RAW_BASE}/{group}/{work}/{tail}.xml"


def version_xml_path(version_urn):
    tail = version_urn.rsplit(":", 1)[-1]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", tail):
        raise ValueError(f"unsafe version urn: {version_urn}")
    return XML_CACHE / f"{tail}.xml"


class WorkCanceled(Exception):
    """Raised when a download job is canceled by the user."""


def check_canceled(canceled, work_urn):
    if canceled and canceled():
        raise WorkCanceled(work_urn)


def cancelable_sleep(seconds, canceled, work_urn):
    deadline = time.time() + seconds
    while time.time() < deadline:
        check_canceled(canceled, work_urn)
        time.sleep(min(0.2, deadline - time.time()))


def download_xml(version_urn, progress=None, canceled=None, work_urn=None):
    path = version_xml_path(version_urn)
    if path.exists() and path.stat().st_size > 500:
        return path
    url = version_xml_url(version_urn)
    request = Request(url, headers={"User-Agent": "perseus-local-reader"})
    tries = 0
    while True:
        tries += 1
        try:
            check_canceled(canceled, work_urn)
            with urlopen(request, timeout=60) as response:
                chunks = []
                while True:
                    check_canceled(canceled, work_urn)
                    chunk = response.read(1024 * 64)
                    if not chunk:
                        break
                    chunks.append(chunk)
                body = b"".join(chunks)
            break
        except HTTPError as error:
            if error.code == 404:
                raise FileNotFoundError(url)
            if tries <= 3:
                cancelable_sleep(5 * tries, canceled, work_urn)
                continue
            raise
        except URLError:
            if tries <= 3:
                cancelable_sleep(5 * tries, canceled, work_urn)
                continue
            raise
    check_canceled(canceled, work_urn)
    XML_CACHE.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return path


def ensure_work(work_urn, progress=None, force=False, canceled=None):
    """Download and convert every version of a work. Returns the JSON path.

    progress: optional callable(step_label, done, total)
    canceled: optional callable() -> bool; checked between steps. When it
        returns True the job stops cleanly (no partial JSON is written) and
        WorkCanceled is raised.
    """
    out_path = work_path(work_urn)
    if out_path.exists() and not force:
        return out_path

    work = find_work(work_urn)
    versions = work["versions"]
    total = len(versions) * 2  # download + convert per version
    done = 0

    def report(label):
        check_canceled(canceled, work_urn)
        if progress:
            progress(label, done, total)

    version_files = []
    for version in versions:
        report(f"取得中: {version['urn'].rsplit(':', 1)[-1]}")
        try:
            xml_path = download_xml(version["urn"], canceled=canceled, work_urn=work_urn)
        except FileNotFoundError:
            done += 2
            continue
        done += 1
        check_canceled(canceled, work_urn)
        version_files.append((version, xml_path))

    if not version_files:
        raise RuntimeError("この作品の本文ファイルを取得できませんでした。")

    converted = []
    for version, xml_path in version_files:
        report(f"変換中: {version['urn'].rsplit(':', 1)[-1]}")
        try:
            check_canceled(canceled, work_urn)
            converted.append(
                tei_convert.convert_version(xml_path, version, work["urn"])
            )
        except Exception as error:
            print(f"convert failed for {version['urn']}: {error}")
        done += 1

    if not converted:
        raise RuntimeError("この作品の本文を変換できませんでした。")

    report("保存中")
    payload = {
        "workUrn": work["urn"],
        "group": work.get("group", ""),
        "title": work.get("title", ""),
        "source": "PerseusDL/canonical-greekLit",
        "versions": converted,
    }
    TEXTS_OUT.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    tmp.replace(out_path)
    return out_path


def downloaded_works():
    if not TEXTS_OUT.exists():
        return []
    ids = []
    for path in sorted(TEXTS_OUT.glob("*.json")):
        ids.append(path.stem)
    return ids


if __name__ == "__main__":
    import sys

    urn = sys.argv[1]
    path = ensure_work(urn, progress=lambda label, d, t: print(f"[{d}/{t}] {label}"))
    print(path, path.stat().st_size)
