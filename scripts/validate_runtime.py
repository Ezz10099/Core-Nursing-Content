#!/usr/bin/env python3
import hashlib
import html.parser
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime"
FILES = RUNTIME / "files"
OBJECTS = RUNTIME / "objects"

def fail(msg):
    raise SystemExit(msg)

def safe_path(rel):
    if not rel or rel.startswith(("/", "\\")) or "\\" in rel or "%" in rel or ":" in rel:
        return False
    parts = rel.split("/")
    return all(p and p not in (".", "..") and not p.startswith(".") for p in parts)

m = json.loads((RUNTIME / "runtime-manifest.json").read_text(encoding="utf-8"))
if set(m) != {"schemaVersion","runtimeVersion","minEngineVersion","entryPoint","files"}:
    fail("runtime manifest keys invalid")
if m["schemaVersion"] != 2 or m["runtimeVersion"] < 1 or m["minEngineVersion"] < 1:
    fail("runtime manifest versions invalid")
if not safe_path(m["entryPoint"]):
    fail("unsafe entry point")

seen_paths=set()
for e in m["files"]:
    if set(e) != {"path","size","sha256","object"}:
        fail("runtime file entry keys invalid")

    rel=e["path"]
    if not safe_path(rel) or rel in seen_paths:
        fail(f"unsafe/duplicate path: {rel}")
    seen_paths.add(rel)

    digest=e["sha256"]
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        fail(f"invalid SHA-256: {rel}")

    object_rel=e["object"]
    expected_object=f"objects/{digest}"
    if object_rel != expected_object or not safe_path(object_rel):
        fail(f"invalid object location: {rel}")

    source=FILES / rel
    obj=RUNTIME / object_rel
    if not source.is_file():
        fail(f"missing runtime source file: {rel}")
    if not obj.is_file():
        fail(f"missing runtime object: {object_rel}")

    source_data=source.read_bytes()
    object_data=obj.read_bytes()
    if len(source_data) != e["size"]:
        fail(f"source size mismatch: {rel}")
    if hashlib.sha256(source_data).hexdigest() != digest:
        fail(f"source hash mismatch: {rel}")
    if len(object_data) != e["size"]:
        fail(f"object size mismatch: {object_rel}")
    if hashlib.sha256(object_data).hexdigest() != digest:
        fail(f"object hash mismatch: {object_rel}")
    if object_data != source_data:
        fail(f"object/source bytes differ: {rel}")

actual={p.relative_to(FILES).as_posix() for p in FILES.rglob("*") if p.is_file()}
if actual != seen_paths:
    fail(f"manifest/file set mismatch: manifest={sorted(seen_paths)} actual={sorted(actual)}")
if m["entryPoint"] not in seen_paths:
    fail("entry point missing from manifest")

class RefParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.refs=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=="link" and a.get("rel")=="stylesheet" and a.get("href"): self.refs.append(a["href"])
        if tag=="script" and a.get("src"): self.refs.append(a["src"])
        if tag in ("img","source") and a.get("src"): self.refs.append(a["src"])

index=(FILES / m["entryPoint"]).read_text(encoding="utf-8")
parser=RefParser(); parser.feed(index)
for ref in parser.refs:
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", ref) or ref.startswith("//"):
        fail(f"external runtime resource forbidden: {ref}")
    normalized=(Path(m["entryPoint"]).parent / ref).as_posix()
    if not safe_path(normalized) or not (FILES / normalized).is_file():
        fail(f"runtime reference missing/unsafe: {ref}")

app_js=(FILES / "js/app.js").read_text(encoding="utf-8")
for token in ("confirmRuntimeHealthy","getActiveRuntimeVersion","CoreNursingUpdate","CoreNursingSync"):
    if token not in app_js:
        fail(f"runtime JS missing contract token: {token}")

# Legacy Engine v2 compatibility channel must remain valid and untouched.
content=json.loads((ROOT/"content.json").read_text(encoding="utf-8"))
if content.get("schemaVersion") != 1 or int(content.get("contentVersion",0)) < 1:
    fail("legacy content.json invalid")

shell=(ROOT/"shell.html").read_bytes()
shell_manifest=json.loads((ROOT/"shell-manifest.json").read_text(encoding="utf-8"))
if shell_manifest.get("schemaVersion") != 1:
    fail("legacy shell manifest invalid")
if hashlib.sha256(shell).hexdigest() != shell_manifest.get("sha256"):
    fail("legacy shell hash mismatch")

print("content-addressed runtime + legacy channel validation passed")
