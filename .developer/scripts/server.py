#!/usr/bin/env python3
import json
import os
import re
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, unquote, urlparse

import text_store
from fetch_morph import cache_path, fetch_one, load_forms, load_morphs, write_output

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
IDLE_TIMEOUT_SECONDS = 8 * 60 * 60


last_access = time.time()
MORPH_FETCH_LOCK = threading.Lock()
BATCH_STATUS_LOCK = threading.Lock()
BATCH_CANCEL_EVENT = threading.Event()
BATCH_STATUS = {
    "state": "idle",
    "urn": "",
    "total": 0,
    "completed": 0,
    "cached": 0,
    "fetched": 0,
    "current": "",
    "error": "",
}

WORK_JOBS_LOCK = threading.Lock()
WORK_JOBS = {}
WORK_CANCELS = set()

DATA_MANAGEMENT_LOCK = threading.Lock()
SAFE_WORK_ID = re.compile(r"^[A-Za-z0-9_.-]+$")

NOTES_DIR = ROOT / "data" / "user"
NOTES_PATH = NOTES_DIR / "notes.json"
NOTES_LOCK = threading.Lock()
MAX_NOTES = 10000



def batch_status_snapshot():
    with BATCH_STATUS_LOCK:
        return dict(BATCH_STATUS)


def update_batch_status(**changes):
    with BATCH_STATUS_LOCK:
        BATCH_STATUS.update(changes)


def run_batch_fetch(work_urn):
    try:
        forms = load_forms(text_store.work_id(work_urn))
        morphs = load_morphs()
        total = len(forms)
        cached = sum(
            1
            for form in forms
            if morphs.get(form, {}).get("fetched")
        )
        update_batch_status(
            state="running",
            urn=work_urn,
            total=total,
            completed=cached,
            cached=cached,
            fetched=0,
            current="",
            error="",
        )

        newly_cached = 0
        for form, meta in forms.items():
            if morphs.get(form, {}).get("fetched"):
                continue
            if BATCH_CANCEL_EVENT.is_set():
                update_batch_status(
                    state="stopped",
                    current="",
                    completed=cached + newly_cached,
                )
                return

            update_batch_status(current=form)
            # Serialize writes to morph.json. Individual word lookups can run
            # between batch items, but two writers never update the file at once.
            with MORPH_FETCH_LOCK:
                entry = fetch_one(form, bare=meta["bare"], delay=1.0)

            morphs[form] = entry
            newly_cached += 1
            update_batch_status(
                completed=cached + newly_cached,
                fetched=newly_cached,
            )

        update_batch_status(
            state="done",
            completed=total,
            current="",
        )
    except Exception as error:
        update_batch_status(
            state="error",
            current="",
            error=str(error),
        )


def start_batch_fetch(work_urn):
    with BATCH_STATUS_LOCK:
        if BATCH_STATUS["state"] in {"starting", "running", "stopping"}:
            return False
        BATCH_CANCEL_EVENT.clear()
        BATCH_STATUS.update(
            state="starting",
            urn=work_urn,
            total=0,
            completed=0,
            cached=0,
            fetched=0,
            current="",
            error="",
        )

    thread = threading.Thread(target=run_batch_fetch, args=(work_urn,), daemon=True)
    thread.start()
    return True


def stop_batch_fetch():
    with BATCH_STATUS_LOCK:
        if BATCH_STATUS["state"] not in {"starting", "running", "stopping"}:
            return False
        BATCH_CANCEL_EVENT.set()
        BATCH_STATUS["state"] = "stopping"
    return True


def work_job_snapshot(work_urn):
    with WORK_JOBS_LOCK:
        job = dict(WORK_JOBS.get(work_urn, {"state": "idle"}))
    job["downloaded"] = text_store.is_downloaded(work_urn)
    return job


def run_work_download(work_urn):
    def progress(label, done, total):
        with WORK_JOBS_LOCK:
            WORK_JOBS[work_urn] = {
                "state": "running",
                "label": label,
                "done": done,
                "total": total,
            }

    def canceled():
        with WORK_JOBS_LOCK:
            return work_urn in WORK_CANCELS

    try:
        text_store.ensure_work(work_urn, progress=progress, canceled=canceled)
        with WORK_JOBS_LOCK:
            WORK_CANCELS.discard(work_urn)
            WORK_JOBS[work_urn] = {"state": "done"}
    except text_store.WorkCanceled:
        with WORK_JOBS_LOCK:
            WORK_CANCELS.discard(work_urn)
            WORK_JOBS[work_urn] = {"state": "canceled"}
    except Exception as error:
        with WORK_JOBS_LOCK:
            WORK_CANCELS.discard(work_urn)
            WORK_JOBS[work_urn] = {"state": "error", "error": str(error)}


def start_work_download(work_urn):
    with WORK_JOBS_LOCK:
        job = WORK_JOBS.get(work_urn)
        if job and job.get("state") == "running":
            return False
        WORK_CANCELS.discard(work_urn)
        WORK_JOBS[work_urn] = {"state": "running", "label": "開始しています", "done": 0, "total": 0}
    thread = threading.Thread(target=run_work_download, args=(work_urn,), daemon=True)
    thread.start()
    return True


def cancel_work_download(work_urn):
    with WORK_JOBS_LOCK:
        job = WORK_JOBS.get(work_urn)
        if not job or job.get("state") != "running":
            return False
        WORK_CANCELS.add(work_urn)
    return True

def catalog_work_map():
    return {
        text_store.work_id(work["urn"]): work
        for work in text_store.load_catalog().get("works", [])
    }


def cached_work_morph_usage():
    # Return per-work cached form sets and cross-work use counts.
    work_forms = {}
    for path in sorted(text_store.TEXTS_OUT.glob("*.json")):
        try:
            work_forms[path.stem] = set(load_forms(path.stem))
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            work_forms[path.stem] = None

    with MORPH_FETCH_LOCK:
        cached_forms = set(load_morphs())

    use_counts = {}
    for forms in work_forms.values():
        if forms is None:
            continue
        for form in forms & cached_forms:
            use_counts[form] = use_counts.get(form, 0) + 1

    return work_forms, cached_forms, use_counts


def data_management_snapshot():
    catalog = catalog_work_map()
    works = []

    with DATA_MANAGEMENT_LOCK:
        text_store.TEXTS_OUT.mkdir(parents=True, exist_ok=True)
        for path in sorted(text_store.TEXTS_OUT.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                payload = {}

            metadata = catalog.get(path.stem, {})
            versions = payload.get("versions") or metadata.get("versions") or []
            languages = []
            for version in versions:
                lang = version.get("lang", "")
                if lang and lang not in languages:
                    languages.append(lang)

            stat = path.stat()
            works.append(
                {
                    "id": path.stem,
                    "urn": payload.get("workUrn") or metadata.get("urn", ""),
                    "group": payload.get("group") or metadata.get("group", ""),
                    "title": payload.get("title") or metadata.get("title", ""),
                    "languages": languages,
                    "versionCount": len(versions),
                    "bytes": stat.st_size,
                    "modified": int(stat.st_mtime),
                }
            )

    with MORPH_FETCH_LOCK:
        morphs = load_morphs()
        morph_rows = []
        for form, entry in morphs.items():
            analyses = entry.get("analyses") or []
            lemmas = []
            definitions = []
            parse_count = 0
            for analysis in analyses:
                lemma = analysis.get("lemma", "")
                definition = analysis.get("definition", "")
                if lemma and lemma not in lemmas:
                    lemmas.append(lemma)
                if definition and definition not in definitions:
                    definitions.append(definition)
                parse_count += len(analysis.get("parses") or [])

            morph_rows.append(
                {
                    "form": form,
                    "bare": entry.get("bare", ""),
                    "lemmas": lemmas,
                    "definitions": definitions,
                    "analysisCount": len(analyses),
                    "parseCount": parse_count,
                    "bytes": len(json.dumps(entry, ensure_ascii=False).encode("utf-8")),
                }
            )

    morph_rows.sort(key=lambda row: row["form"])

    work_forms, cached_forms, use_counts = cached_work_morph_usage()
    for work in works:
        forms = work_forms.get(work["id"])
        if forms is None:
            work["cachedMorphCount"] = 0
            work["exclusiveMorphCount"] = 0
            work["sharedMorphCount"] = 0
            work["morphUsageUnavailable"] = True
            continue

        cached_for_work = forms & cached_forms
        exclusive = {
            form for form in cached_for_work
            if use_counts.get(form, 0) == 1
        }
        work["cachedMorphCount"] = len(cached_for_work)
        work["exclusiveMorphCount"] = len(exclusive)
        work["sharedMorphCount"] = len(cached_for_work - exclusive)
        work["morphUsageUnavailable"] = False

    work_bytes = sum(work["bytes"] for work in works)
    morph_path = ROOT / "app" / "data" / "morph.json"
    morph_bytes = morph_path.stat().st_size if morph_path.exists() else 0

    return {
        "works": works,
        "morphs": morph_rows,
        "summary": {
            "workCount": len(works),
            "workBytes": work_bytes,
            "morphCount": len(morph_rows),
            "morphBytes": morph_bytes,
            "totalBytes": work_bytes + morph_bytes,
        },
    }


def active_work_ids():
    with WORK_JOBS_LOCK:
        active = {
            text_store.work_id(urn)
            for urn, job in WORK_JOBS.items()
            if job.get("state") == "running"
        }

    batch = batch_status_snapshot()
    if batch.get("state") in {"starting", "running", "stopping"} and batch.get("urn"):
        active.add(text_store.work_id(batch["urn"]))
    return active


def delete_work_data(work_ids):
    deleted = []
    skipped = []
    active = active_work_ids()

    with DATA_MANAGEMENT_LOCK:
        for work_id in work_ids:
            if not isinstance(work_id, str) or not SAFE_WORK_ID.fullmatch(work_id):
                skipped.append({"id": str(work_id), "reason": "invalid id"})
                continue
            if work_id in active:
                skipped.append({"id": work_id, "reason": "処理中です"})
                continue

            path = text_store.TEXTS_OUT / f"{work_id}.json"
            if not path.exists():
                skipped.append({"id": work_id, "reason": "見つかりません"})
                continue

            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                payload = {}

            path.unlink()

            for version in payload.get("versions") or []:
                urn = version.get("urn", "")
                if not urn:
                    continue
                try:
                    text_store.version_xml_path(urn).unlink(missing_ok=True)
                except (ValueError, OSError):
                    pass

            deleted.append(work_id)

    return deleted, skipped


def delete_morph_data(forms):
    deleted = []
    skipped = []

    with MORPH_FETCH_LOCK:
        morphs = load_morphs()
        for form in forms:
            if not isinstance(form, str):
                skipped.append({"id": str(form), "reason": "invalid form"})
                continue

            entry = morphs.pop(form, None)
            if entry is None:
                skipped.append({"id": form, "reason": "見つかりません"})
                continue

            beta = entry.get("beta", "")
            if beta:
                try:
                    cache_path(beta).unlink(missing_ok=True)
                except OSError:
                    pass
            deleted.append(form)

        if deleted:
            write_output(morphs)

    return deleted, skipped


def utc_timestamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def empty_notes_document():
    return {"version": 1, "notes": []}


def read_notes_unlocked():
    if not NOTES_PATH.exists():
        return empty_notes_document()

    try:
        payload = json.loads(NOTES_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(
            f"メモファイルを読み込めません: {NOTES_PATH}: {error}"
        ) from error

    if not isinstance(payload, dict) or not isinstance(payload.get("notes"), list):
        raise RuntimeError("メモファイルの形式が正しくありません。")
    return payload


def write_notes_unlocked(payload):
    NOTES_DIR.mkdir(parents=True, exist_ok=True)
    temporary = NOTES_PATH.with_suffix(".json.tmp")
    encoded = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"

    with temporary.open("w", encoding="utf-8") as handle:
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())

    os.replace(temporary, NOTES_PATH)


def notes_snapshot():
    with NOTES_LOCK:
        payload = read_notes_unlocked()
        notes = [note for note in payload.get("notes", []) if isinstance(note, dict)]
    notes.sort(
        key=lambda note: str(note.get("updatedAt") or note.get("createdAt") or ""),
        reverse=True,
    )
    return {"version": payload.get("version", 1), "notes": notes}


def clean_note_text(value, field, maximum, required=False):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    value = value.strip() if field != "quote" else value
    if required and not value.strip():
        raise ValueError(f"{field} is required")
    if len(value) > maximum:
        raise ValueError(f"{field} is too long")
    return value


def clean_nonnegative_int(value, field, required=False):
    if value is None or value == "":
        if required:
            raise ValueError(f"{field} is required")
        return None
    if isinstance(value, bool):
        raise ValueError(f"{field} must be an integer")
    try:
        number = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field} must be an integer") from error
    if number < 0:
        raise ValueError(f"{field} must be non-negative")
    return number


def note_identity(note):
    if note.get("kind") == "word" and note.get("scope") == "work-form":
        return (
            "word",
            "work-form",
            note.get("workUrn", ""),
            note.get("form", ""),
        )
    if note.get("kind") == "word":
        return (
            "word",
            "occurrence",
            note.get("workUrn", ""),
            note.get("versionUrn", ""),
            note.get("chunk"),
            note.get("wordIndex"),
        )
    return None


def normalize_note(raw, existing=None):
    if not isinstance(raw, dict):
        raise ValueError("note must be an object")

    kind = raw.get("kind")
    if kind not in {"word", "passage"}:
        raise ValueError("kind must be word or passage")

    scope = raw.get("scope")
    if kind == "word" and scope not in {"occurrence", "work-form"}:
        raise ValueError("word scope must be occurrence or work-form")
    if kind == "passage":
        scope = "range"

    note = {
        "id": clean_note_text(
            raw.get("id") or (existing or {}).get("id") or uuid.uuid4().hex,
            "id",
            128,
            required=True,
        ),
        "kind": kind,
        "scope": scope,
        "quote": clean_note_text(raw.get("quote"), "quote", 20000, required=True),
        "memo": clean_note_text(raw.get("memo"), "memo", 50000),
        "author": clean_note_text(raw.get("author"), "author", 1000),
        "workTitle": clean_note_text(raw.get("workTitle"), "workTitle", 1000),
        "workUrn": clean_note_text(
            raw.get("workUrn"), "workUrn", 2000, required=True
        ),
        "versionUrn": clean_note_text(raw.get("versionUrn"), "versionUrn", 2000),
        "citation": clean_note_text(raw.get("citation"), "citation", 1000),
        "form": clean_note_text(raw.get("form"), "form", 1000),
        "bare": clean_note_text(raw.get("bare"), "bare", 1000),
        "lemma": clean_note_text(raw.get("lemma"), "lemma", 1000),
        "definition": clean_note_text(
            raw.get("definition"), "definition", 4000
        ),
        "chunk": clean_nonnegative_int(raw.get("chunk"), "chunk"),
        "wordIndex": clean_nonnegative_int(raw.get("wordIndex"), "wordIndex"),
        "start": clean_nonnegative_int(raw.get("start"), "start"),
        "end": clean_nonnegative_int(raw.get("end"), "end"),
    }

    if kind == "word":
        note["form"] = clean_note_text(
            raw.get("form") or raw.get("quote"),
            "form",
            1000,
            required=True,
        )
        if scope == "occurrence":
            if not note["versionUrn"]:
                raise ValueError("versionUrn is required for occurrence notes")
            if note["chunk"] is None or note["wordIndex"] is None:
                raise ValueError(
                    "chunk and wordIndex are required for occurrence notes"
                )
        else:
            note["wordIndex"] = None
    else:
        if not note["versionUrn"]:
            raise ValueError("versionUrn is required for passage notes")
        if note["chunk"] is None or note["start"] is None or note["end"] is None:
            raise ValueError("chunk, start and end are required for passage notes")
        if note["end"] <= note["start"]:
            raise ValueError("passage end must be greater than start")

    now = utc_timestamp()
    note["createdAt"] = (
        (existing or {}).get("createdAt")
        or clean_note_text(raw.get("createdAt"), "createdAt", 100)
        or now
    )
    note["updatedAt"] = now
    return note


def save_note(raw):
    with NOTES_LOCK:
        payload = read_notes_unlocked()
        notes = [note for note in payload.get("notes", []) if isinstance(note, dict)]

        requested_id = raw.get("id") if isinstance(raw, dict) else None
        existing = next(
            (note for note in notes if requested_id and note.get("id") == requested_id),
            None,
        )

        preliminary = normalize_note(raw, existing=existing)
        identity = note_identity(preliminary)
        if existing is None and identity is not None:
            existing = next(
                (note for note in notes if note_identity(note) == identity),
                None,
            )
            if existing is not None:
                preliminary = normalize_note(
                    {**raw, "id": existing.get("id")},
                    existing=existing,
                )

        if existing is not None:
            notes = [
                preliminary if note.get("id") == existing.get("id") else note
                for note in notes
            ]
        else:
            if len(notes) >= MAX_NOTES:
                raise ValueError("メモ数の上限に達しています。")
            notes.append(preliminary)

        payload = {"version": 1, "notes": notes}
        write_notes_unlocked(payload)
        return preliminary


def delete_notes(note_ids):
    if not isinstance(note_ids, list):
        raise ValueError("ids must be an array")
    if len(note_ids) > MAX_NOTES:
        raise ValueError("too many ids")

    ids = {
        value
        for value in note_ids
        if isinstance(value, str) and 0 < len(value) <= 128
    }

    with NOTES_LOCK:
        payload = read_notes_unlocked()
        original = [
            note for note in payload.get("notes", []) if isinstance(note, dict)
        ]
        kept = [note for note in original if note.get("id") not in ids]
        deleted = [
            note.get("id")
            for note in original
            if note.get("id") in ids
        ]
        if deleted:
            write_notes_unlocked({"version": 1, "notes": kept})
    return deleted


def local_origin_allowed(origin):
    if not origin:
        return True
    return (
        origin.startswith("http://127.0.0.1:")
        or origin.startswith("http://localhost:")
    )

def delete_work_scoped_morph_data(work_ids):
    # Delete only cached forms exclusive to the selected set of works.
    if not isinstance(work_ids, list):
        raise ValueError("works must be an array")
    if len(work_ids) > 1000:
        raise ValueError("too many works")

    requested = []
    skipped = []
    seen = set()
    for raw in work_ids:
        if not isinstance(raw, str) or not SAFE_WORK_ID.fullmatch(raw):
            skipped.append({"id": str(raw), "reason": "invalid work id"})
            continue
        if raw in seen:
            continue
        seen.add(raw)
        requested.append(raw)

    with DATA_MANAGEMENT_LOCK:
        downloaded_ids = {
            path.stem for path in text_store.TEXTS_OUT.glob("*.json")
        }

        selected_ids = []
        for work_id in requested:
            if work_id not in downloaded_ids:
                skipped.append({"id": work_id, "reason": "本文が見つかりません"})
                continue
            selected_ids.append(work_id)

        if not selected_ids:
            return {
                "selectedWorks": [],
                "deletedMorphs": [],
                "preservedSharedCount": 0,
                "skipped": skipped,
            }

        form_map = {}
        for work_id in sorted(downloaded_ids):
            try:
                form_map[work_id] = set(load_forms(work_id))
            except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
                raise RuntimeError(
                    f"{work_id} の単語一覧を確認できないため、"
                    "安全のため削除を中止しました。"
                ) from error

    selected_set = set(selected_ids)
    selected_forms = set().union(
        *(form_map[work_id] for work_id in selected_ids)
    )
    unselected_forms = set().union(
        *(
            forms
            for work_id, forms in form_map.items()
            if work_id not in selected_set
        )
    ) if len(form_map) > len(selected_set) else set()

    with MORPH_FETCH_LOCK:
        cached_forms = set(load_morphs())

    deletable = sorted(
        (selected_forms - unselected_forms) & cached_forms
    )
    shared = (selected_forms & unselected_forms) & cached_forms

    deleted, skipped_forms = delete_morph_data(deletable)
    skipped.extend(skipped_forms)

    return {
        "selectedWorks": selected_ids,
        "deletedMorphs": deleted,
        "preservedSharedCount": len(shared),
        "skipped": skipped,
    }


class ReaderHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP), **kwargs)

    def end_headers(self):
        # Pages must always be revalidated so UI fixes reach the browser
        # immediately; versioned assets (?v=...) stay cacheable.
        path = self.path.split("?", 1)[0]
        if path.endswith(".html") or path.endswith("/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        global last_access
        last_access = time.time()
        parsed = urlparse(self.path)
        if parsed.path == "/api/notes":
            try:
                self.send_json(notes_snapshot())
            except Exception as error:
                self.send_json({"error": str(error)}, status=500)
            return
        if parsed.path == "/api/data/manager":
            self.send_json(data_management_snapshot())
            return
        if parsed.path == "/api/morph/fetch-all/status":
            self.send_json(batch_status_snapshot())
            return
        if parsed.path == "/api/morph":
            self.handle_morph(parsed.query)
            return
        if parsed.path == "/api/works":
            self.send_json({"downloaded": text_store.downloaded_works()})
            return
        if parsed.path == "/api/work/status":
            params = parse_qs(parsed.query)
            urn = unquote(params.get("urn", [""])[0])
            if not urn:
                self.send_json({"error": "missing urn"}, status=400)
                return
            self.send_json(work_job_snapshot(urn))
            return
        super().do_GET()

    def do_POST(self):
        global last_access
        last_access = time.time()
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        if parsed.path == "/api/notes/save":
            if not local_origin_allowed(self.headers.get("Origin", "")):
                self.send_json({"error": "forbidden origin"}, status=403)
                return
            try:
                payload = self.read_json_body()
                note = save_note(payload)
                self.send_json({"note": note})
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
            except Exception as error:
                self.send_json({"error": str(error)}, status=500)
            return

        if parsed.path == "/api/notes/delete":
            if not local_origin_allowed(self.headers.get("Origin", "")):
                self.send_json({"error": "forbidden origin"}, status=403)
                return
            try:
                payload = self.read_json_body()
                deleted = delete_notes(payload.get("ids"))
                self.send_json({"deleted": deleted})
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
            except Exception as error:
                self.send_json({"error": str(error)}, status=500)
            return
        if parsed.path == "/api/data/delete-work-morphs":
            origin = self.headers.get("Origin", "")
            if origin and not (
                origin.startswith("http://127.0.0.1:")
                or origin.startswith("http://localhost:")
            ):
                self.send_json({"error": "forbidden origin"}, status=403)
                return

            try:
                payload = self.read_json_body()
                result = delete_work_scoped_morph_data(
                    payload.get("works")
                )
                self.send_json(result)
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
            except Exception as error:
                self.send_json({"error": str(error)}, status=500)
            return

        if parsed.path == "/api/data/delete":
            origin = self.headers.get("Origin", "")
            if origin and not (
                origin.startswith("http://127.0.0.1:")
                or origin.startswith("http://localhost:")
            ):
                self.send_json({"error": "forbidden origin"}, status=403)
                return

            try:
                payload = self.read_json_body()
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return

            works = payload.get("works") or []
            morphs = payload.get("morphs") or []
            if not isinstance(works, list) or not isinstance(morphs, list):
                self.send_json({"error": "works and morphs must be arrays"}, status=400)
                return
            if len(works) + len(morphs) > 10000:
                self.send_json({"error": "too many items"}, status=400)
                return

            deleted_works, skipped_works = delete_work_data(works)
            deleted_morphs, skipped_morphs = delete_morph_data(morphs)
            self.send_json({
                "deletedWorks": deleted_works,
                "deletedMorphs": deleted_morphs,
                "skipped": skipped_works + skipped_morphs,
            })
            return
        if parsed.path == "/api/work/download":
            urn = unquote(params.get("urn", [""])[0])
            if not urn:
                self.send_json({"error": "missing urn"}, status=400)
                return
            try:
                text_store.find_work(urn)
            except KeyError:
                self.send_json({"error": "unknown work"}, status=404)
                return
            started = start_work_download(urn)
            self.send_json(
                {"started": started, "status": work_job_snapshot(urn)},
                status=202 if started else 200,
            )
            return
        if parsed.path == "/api/work/cancel":
            urn = unquote(params.get("urn", [""])[0])
            if not urn:
                self.send_json({"error": "missing urn"}, status=400)
                return
            canceling = cancel_work_download(urn)
            self.send_json(
                {"canceling": canceling, "status": work_job_snapshot(urn)},
                status=202 if canceling else 200,
            )
            return
        if parsed.path == "/api/morph/fetch-all":
            urn = unquote(params.get("urn", [""])[0])
            if not urn or not text_store.is_downloaded(urn):
                self.send_json({"error": "作品がまだダウンロードされていません。"}, status=400)
                return
            started = start_batch_fetch(urn)
            self.send_json(
                {"started": started, "status": batch_status_snapshot()},
                status=202 if started else 200,
            )
            return
        if parsed.path == "/api/morph/fetch-all/stop":
            stopping = stop_batch_fetch()
            self.send_json(
                {"stopping": stopping, "status": batch_status_snapshot()},
                status=202 if stopping else 200,
            )
            return
        self.send_error(404)

    def handle_morph(self, query):
        params = parse_qs(query)
        form = unquote(params.get("form", [""])[0])
        bare = unquote(params.get("bare", [""])[0])
        if not form:
            self.send_json({"error": "missing form"}, status=400)
            return
        try:
            with MORPH_FETCH_LOCK:
                entry = fetch_one(form, bare=bare, delay=0.0)
            self.send_json({"entry": entry})
        except HTTPError as error:
            if error.code == 429:
                self.send_json(
                    {
                        "error": "Perseus returned 429 Too Many Requests. Wait a little and click again.",
                        "status": 429,
                    },
                    status=429,
                )
                return
            self.send_json({"error": f"Perseus HTTP error: {error.code}"}, status=502)
        except Exception as error:
            self.send_json({"error": str(error)}, status=500)

    def read_json_body(self):
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("application/json"):
            raise ValueError("Content-Type must be application/json")

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("invalid Content-Length") from error

        if length <= 0 or length > 2 * 1024 * 1024:
            raise ValueError("invalid request body size")

        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("invalid JSON body") from error

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def parse_server_args():
    port = 8000
    parent_pid = None
    args = iter(sys.argv[1:])

    for arg in args:
        if arg == "--parent-pid":
            try:
                parent_pid = int(next(args))
            except (StopIteration, ValueError):
                raise SystemExit("--parent-pid requires an integer PID")
        else:
            try:
                port = int(arg)
            except ValueError:
                raise SystemExit(f"Unknown server argument: {arg}")

    return port, parent_pid


def main():
    port, parent_pid = parse_server_args()
    server = ThreadingHTTPServer(("127.0.0.1", port), ReaderHandler)

    if parent_pid is None:
        start_idle_shutdown_watch(server)
    else:
        start_parent_shutdown_watch(server, parent_pid)

    print(f"Serving Perseus Local Reader at http://127.0.0.1:{port}/")
    server.serve_forever()


def start_idle_shutdown_watch(server):
    def watch():
        while True:
            time.sleep(60)
            if time.time() - last_access > IDLE_TIMEOUT_SECONDS:
                server.shutdown()
                return

    thread = threading.Thread(target=watch, daemon=True)
    thread.start()


def start_parent_shutdown_watch(server, parent_pid):
    def watch():
        while True:
            time.sleep(2)
            try:
                os.kill(parent_pid, 0)
            except ProcessLookupError:
                server.shutdown()
                return
            except PermissionError:
                pass

    thread = threading.Thread(target=watch, daemon=True)
    thread.start()


if __name__ == "__main__":
    main()
