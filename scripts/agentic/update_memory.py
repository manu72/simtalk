#!/usr/bin/env python3
"""Refresh generated artifacts and report curated edits to consider.

This script:
- Re-runs build_codemap to regenerate .agentic/CODEMAP.json.
- Diffs detected top-level subsystems against existing .agentic/SUBSYSTEMS/*.md.
- Prints actionable suggestions. NEVER modifies curated files automatically.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

CODEMAP_PATH = Path(".agentic/CODEMAP.json")
CONFIG_PATH = Path(".agentic/CONFIG/agentic.json")
SUBSYSTEMS_DIR = Path(".agentic/SUBSYSTEMS")
SCRIPTS_DIR = Path("scripts/agentic")


def _run_build_codemap() -> int:
    cmd = [sys.executable, str(SCRIPTS_DIR / "build_codemap.py")]
    completed = subprocess.run(cmd, check=False)
    return completed.returncode


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _detected_subsystems(
    codemap: dict[str, Any], valid_names: set[str]
) -> set[str]:
    found: set[str] = set()
    for entry in codemap.get("entries", []):
        sub = entry.get("subsystem")
        if isinstance(sub, str) and sub and sub in valid_names:
            found.add(sub)
    return found


def _existing_subsystem_files() -> set[str]:
    if not SUBSYSTEMS_DIR.is_dir():
        return set()
    out: set[str] = set()
    for p in SUBSYSTEMS_DIR.glob("*.md"):
        if p.name.lower() == "readme.md":
            continue
        out.add(p.stem)
    return out


def main() -> int:
    rc = _run_build_codemap()
    if rc != 0:
        print("update_memory: build_codemap failed; aborting.", file=sys.stderr)
        return rc

    codemap = _load_json(CODEMAP_PATH)
    cfg = _load_json(CONFIG_PATH)
    valid_names: set[str] = set(cfg.get("subsystem_keywords", {}).keys())
    valid_names |= _existing_subsystem_files()
    detected = _detected_subsystems(codemap, valid_names)
    existing = _existing_subsystem_files()

    new_subs = sorted(detected - existing)
    stale_subs = sorted(existing - detected)

    print("update_memory: codemap refreshed.")
    if new_subs:
        print("Suggested new subsystem files:")
        for s in new_subs:
            print(f"  - .agentic/SUBSYSTEMS/{s}.md (detected by codemap; not yet documented)")
    if stale_subs:
        print("Subsystem files with no current code-map evidence:")
        for s in stale_subs:
            print(
                f"  - .agentic/SUBSYSTEMS/{s}.md (no entries map to subsystem '{s}'; verify before removing)"
            )
    if not new_subs and not stale_subs:
        print("No subsystem drift detected.")

    print(
        "Reminder: curated files (PROJECT_BRIEF, SUBSYSTEMS/*, LESSONS/*) are never auto-edited. "
        "Apply changes by hand and re-run scripts/agentic/validate_memory.py."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
