#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime"
FILES = RUNTIME / "files"
OBJECTS = RUNTIME / "objects"
MANIFEST = RUNTIME / "runtime-manifest.json"

SCHEMA_VERSION = 2
RUNTIME_VERSION = 9
MIN_ENGINE_VERSION = 2

def safe_path(rel: str) -> bool:
    if not rel or rel.startswith(("/", "\\")) or "\\" in rel or "%" in rel or ":" in rel:
        return False
    parts = rel.split("/")
    return all(p and p not in (".", "..") and not p.startswith(".") for p in parts)

OBJECTS.mkdir(parents=True, exist_ok=True)

entries = []
for path in sorted(p for p in FILES.rglob("*") if p.is_file()):
    rel = path.relative_to(FILES).as_posix()
    if not safe_path(rel):
        raise SystemExit(f"unsafe runtime path: {rel}")

    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    object_rel = f"objects/{digest}"
    object_path = RUNTIME / object_rel

    if object_path.exists():
        existing = object_path.read_bytes()
        if existing != data:
            raise SystemExit(f"content-addressed object collision/corruption: {digest}")
    else:
        object_path.write_bytes(data)

    entries.append({
        "path": rel,
        "size": len(data),
        "sha256": digest,
        "object": object_rel,
    })

manifest = {
    "schemaVersion": SCHEMA_VERSION,
    "runtimeVersion": RUNTIME_VERSION,
    "minEngineVersion": MIN_ENGINE_VERSION,
    "entryPoint": "index.html",
    "files": entries,
}

MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


