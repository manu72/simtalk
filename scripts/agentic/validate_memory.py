#!/usr/bin/env python3
"""Validate the Agentic OS memory layer.

Checks:
- Required folders and files exist.
- CODEMAP.json parses and follows the expected schema.
- Inline backtick path references in curated Markdown actually resolve on disk.

Exits non-zero on structural failure. Exits zero with warnings on stale references.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

REQUIRED_PATHS: list[Path] = [
    Path(".agentic"),
    Path(".agentic/PROJECT_BRIEF.md"),
    Path(".agentic/MEMORY_INDEX.md"),
    Path(".agentic/CODEMAP.json"),
    Path(".agentic/SUBSYSTEMS"),
    Path(".agentic/SUBSYSTEMS/README.md"),
    Path(".agentic/LESSONS"),
    Path(".agentic/LESSONS/decisions.md"),
    Path(".agentic/LESSONS/incidents.md"),
    Path(".agentic/CONTEXT"),
    Path(".agentic/CONFIG"),
    Path(".agentic/CONFIG/agentic.json"),
    Path("scripts/agentic"),
    Path("scripts/agentic/README.md"),
    Path("scripts/agentic/build_codemap.py"),
    Path("scripts/agentic/route_task.py"),
    Path("scripts/agentic/validate_memory.py"),
    Path("scripts/agentic/update_memory.py"),
    Path(".cursor/skills/agenticOS-context/SKILL.md"),
    Path(".cursor/skills/agenticOS-update/SKILL.md"),
]

CURATED_MD_FILES: list[Path] = [
    Path(".agentic/PROJECT_BRIEF.md"),
    Path(".agentic/MEMORY_INDEX.md"),
    Path(".agentic/SUBSYSTEMS/README.md"),
    Path(".agentic/LESSONS/decisions.md"),
    Path(".agentic/LESSONS/incidents.md"),
]

# Match `inline/path/like.this` (no spaces, must contain a slash or a known
# extension), inside backticks. Filters out shell flags and obvious non-paths.
PATH_RE = re.compile(r"`([^`\s]+)`")
PATH_EXTS = {
    ".md",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
    ".sh",
    ".html",
    ".css",
    ".sql",
    ".env",
    ".lock",
}


def _looks_like_path(token: str) -> bool:
    if token.startswith(("-", "$", "<", "{")):
        return False
    if " " in token:
        return False
    if "/" in token:
        return True
    suffix = Path(token).suffix.lower()
    if suffix and suffix in PATH_EXTS:
        return True
    return False


def _check_codemap(failures: list[str], warnings: list[str]) -> None:
    cm_path = Path(".agentic/CODEMAP.json")
    if not cm_path.is_file():
        failures.append(f"missing {cm_path} (run build_codemap.py)")
        return
    try:
        with cm_path.open("r", encoding="utf-8") as fh:
            data: Any = json.load(fh)
    except json.JSONDecodeError as exc:
        failures.append(f"{cm_path}: invalid JSON ({exc})")
        return

    if not isinstance(data, dict):
        failures.append(f"{cm_path}: top-level value must be an object")
        return
    for key in ("schema_version", "generated_at", "root", "entries"):
        if key not in data:
            failures.append(f"{cm_path}: missing key '{key}'")

    entries = data.get("entries")
    if not isinstance(entries, list):
        failures.append(f"{cm_path}: 'entries' must be a list")
        return
    for i, entry in enumerate(entries):
        if not isinstance(entry, dict):
            failures.append(f"{cm_path}: entries[{i}] must be an object")
            continue
        for key in ("path", "kind", "subsystem", "role", "risk_tags", "read_triggers"):
            if key not in entry:
                failures.append(f"{cm_path}: entries[{i}] missing '{key}'")
        path = entry.get("path")
        if isinstance(path, str) and path and not Path(path).exists():
            warnings.append(f"{cm_path}: entry path does not exist on disk: {path}")


def _check_curated_path_refs(warnings: list[str]) -> None:
    for md_path in CURATED_MD_FILES:
        if not md_path.is_file():
            continue
        try:
            text = md_path.read_text(encoding="utf-8")
        except OSError as exc:
            warnings.append(f"{md_path}: could not read ({exc})")
            continue
        for token in PATH_RE.findall(text):
            if not _looks_like_path(token):
                continue
            cleaned = token.rstrip(",.;:)")
            # Skip things that are clearly env vars or placeholders.
            if cleaned.startswith(("$", "<")) or cleaned.endswith(">"):
                continue
            # Skip globs and parameterised paths.
            if any(ch in cleaned for ch in "*?{}"):
                continue
            # Skip URLs.
            if cleaned.startswith(("http://", "https://")):
                continue
            # Skip command-style tokens like `pnpm install`.
            head = cleaned.split("/", 1)[0]
            if head and not head.startswith(".") and "." not in head and "/" not in cleaned:
                continue
            target = md_path.parent.joinpath(cleaned).resolve()
            if not target.exists():
                repo_root_target = Path(cleaned).resolve()
                if repo_root_target.exists():
                    target = repo_root_target
            if not target.exists():
                warnings.append(
                    f"{md_path}: referenced path not found on disk: {cleaned}"
                )


def main() -> int:
    failures: list[str] = []
    warnings: list[str] = []

    for required in REQUIRED_PATHS:
        if not required.exists():
            failures.append(f"missing required path: {required}")

    _check_codemap(failures, warnings)
    _check_curated_path_refs(warnings)

    for w in warnings:
        print(f"warn: {w}")
    for f in failures:
        print(f"fail: {f}", file=sys.stderr)

    if failures:
        print(f"validate_memory: {len(failures)} failure(s), {len(warnings)} warning(s)", file=sys.stderr)
        return 1
    print(f"validate_memory: ok ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
