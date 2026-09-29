#!/usr/bin/env python3
import hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ROOT / "runtime" / "files"
MANIFEST = ROOT / "runtime" / "runtime-manifest.json"
RUNTIME_VERSION = 1
MIN_ENGINE_VERSION = 2

def safe_path(rel: str) -> bool:
    if not rel or rel.startswith(("/", "\\")) or "\\" in rel or "%" in rel or ":" in rel:
        return False
    parts = rel.split("/")
    return all(p and p not in (".", "..") and not p.startswith(".") for p in parts)

entries = []
for path in sorted(p for p in FILES.rglob("*") if p.is_file()):
    rel = path.relative_to(FILES).as_posix()
    if not safe_path(rel):
        raise SystemExit(f"unsafe runtime path: {rel}")
    data = path.read_bytes()
    entries.append({
        "path": rel,
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    })

manifest = {
    "schemaVersion": 1,
    "runtimeVersion": RUNTIME_VERSION,
    "minEngineVersion": MIN_ENGINE_VERSION,
    "entryPoint": "index.html",
    "files": entries,
}
MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
