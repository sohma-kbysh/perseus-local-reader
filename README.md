# Plato Apology Local Reader

Local reading environment for Plato's *Apology* using openly distributed Perseus data.

## For Readers

On macOS, double-click:

```text
Open Plato Apology.command
```

It starts the local reader and opens your browser. The reader stops itself
automatically after about 8 hours without access.

To update this folder from GitHub, double-click:

```text
Update Plato Apology.command
```

The updater preserves locally cached morphology data, pulls the latest files
from GitHub, and opens the reader again.

If macOS asks whether the file may run, choose to open it. The reader runs only
on your own computer at `http://127.0.0.1:8000/`.

## What is local now

- The Greek text is stored locally in `app/data/apology.json`.
- The generated reader in `app/index.html` works as a static local page.
- Clicking a Greek word opens a local "morph" panel.
- `scripts/fetch_morph.py` can cache Perseus Hopper morph pages for only the
  word forms that appear in the Apology.

The morph panel first uses `app/data/morph.json` when a cached Perseus analysis
is available. Otherwise it falls back to normalized forms and local lemma
candidates from `hib_lemmas.sql`.

## Local App Files

Double-click:

```text
Open Plato Apology.app
```

It starts the local reader in the background and opens the browser.

To update from GitHub, double-click:

```text
Update Plato Apology.app
```

The local reader also stops itself automatically after about 8 hours without
access.

## Terminal

```sh
python3 scripts/server.py 8000
```

Then open:

```text
http://localhost:8000/
```

## Fetch Perseus Morph Data

The official `hib_parses.tar.gz` download repeatedly terminated early from this
network, so this project uses a resumable, Apology-only cache of Hopper's morph
pages instead.

Fetch the first 20 word forms in reading order:

```sh
python3 scripts/fetch_morph.py --limit 20 --delay 2.0
```

Continue toward all Apology word forms:

```sh
python3 scripts/fetch_morph.py --delay 2.0
```

When the reader is served with `scripts/server.py`, clicking an uncached word
fetches just that word form on demand and writes it to `app/data/morph.json`.

Perseus may return `429 Too Many Requests`; the batch script waits and retries.
The ad hoc click handler reports the 429 and lets you retry later. Both paths
write `app/data/morph.json`, so it is safe to stop and resume.

## Data Sources

- Apology TEI XML: `PerseusDL/canonical-greekLit`
- Lemma dump: Perseus Hopper official open-source download page
