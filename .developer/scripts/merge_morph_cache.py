#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def load(path):
    if not path.exists():
        return {"forms": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    if len(sys.argv) != 3:
        print("usage: merge_morph_cache.py BASE_JSON LOCAL_JSON", file=sys.stderr)
        return 2
    base_path = Path(sys.argv[1])
    local_path = Path(sys.argv[2])
    base = load(base_path)
    local = load(local_path)
    forms = base.setdefault("forms", {})
    forms.update(local.get("forms", {}))
    base["generatedFrom"] = base.get("generatedFrom") or "Perseus Hopper morph HTML"
    base_path.write_text(json.dumps(base, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

