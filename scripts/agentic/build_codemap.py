#!/usr/bin/env python3
"""Scan the repository and write .agentic/CODEMAP.json.

Standard library only. Idempotent. Safe to re-run.
Reads ignore globs and subsystem/risk hints from .agentic/CONFIG/agentic.json.
"""

from __future__ import annotations

import datetime as _dt
import fnmatch
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

CONFIG_PATH = Path(".agentic/CONFIG/agentic.json")
OUT_PATH = Path(".agentic/CODEMAP.json")
SCHEMA_VERSION = "1.0"

LANGUAGE_BY_EXT: dict[str, str] = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".swift": "swift",
    ".m": "objective-c",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".sql": "sql",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
}


def _die(msg: str, code: int = 1) -> None:
    print(f"build_codemap: {msg}", file=sys.stderr)
    sys.exit(code)


def _load_config() -> dict[str, Any]:
    if not CONFIG_PATH.is_file():
        _die(f"missing config at {CONFIG_PATH}. Run agenticOS-init.")
    try:
        with CONFIG_PATH.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        _die(f"invalid JSON in {CONFIG_PATH}: {exc}")
        return {}  # unreachable, satisfies type checkers


def _matches_any(path: str, globs: list[str]) -> bool:
    """Match path against globs. Tries the path verbatim and with a leading
    `./` so that patterns like `**/.git/**` correctly match repo-root paths
    such as `.git/objects` (fnmatch's `**/X/**` requires something before X).
    """
    if any(fnmatch.fnmatch(path, pat) for pat in globs):
        return True
    return any(fnmatch.fnmatch("./" + path, pat) for pat in globs)


# Patterns of the form **/NAME/** indicate "ignore this directory wherever it
# appears, including at the repo root". We extract NAME and use it as a
# basename-level ignore so the walker prunes such directories at any depth.
_DIRNAME_GLOB_RE = re.compile(r"^\*\*/([^/*?\[\]]+)/\*\*$")


def _ignored_basenames(ignore_globs: list[str]) -> set[str]:
    names: set[str] = set()
    for g in ignore_globs:
        m = _DIRNAME_GLOB_RE.match(g)
        if m:
            names.add(m.group(1))
    return names


def _detect_language(name: str) -> str | None:
    return LANGUAGE_BY_EXT.get(Path(name).suffix.lower())


def _detect_subsystem(rel_path: str, keywords_by_subsystem: dict[str, list[str]]) -> str | None:
    """First keyword match wins; fall back to top-level folder name only when
    the path is actually nested. Root-level files (no `/`) get no subsystem
    rather than a nonsensical filename-as-subsystem like `prd.md`.
    """
    lowered = rel_path.lower().replace(os.sep, "/")
    for subsystem, keywords in keywords_by_subsystem.items():
        for kw in keywords:
            kw_l = kw.lower()
            if (
                f"/{kw_l}/" in f"/{lowered}/"
                or lowered.startswith(f"{kw_l}/")
                or lowered == kw_l
            ):
                return subsystem
    if "/" in lowered:
        top = lowered.split("/", 1)[0]
        return top or None
    return None


def _detect_risk_tags(rel_path: str, patterns: list[dict[str, Any]]) -> list[str]:
    tags: list[str] = []
    for entry in patterns:
        pat = entry.get("match")
        these = entry.get("tags") or []
        if pat and fnmatch.fnmatch(rel_path, pat):
            for t in these:
                if t not in tags:
                    tags.append(t)
    return tags


def _related_tests(rel_path: str, test_globs: list[str], all_paths: list[str]) -> list[str]:
    """Find test paths that share the subsystem/top-level prefix and match test globs."""
    top = rel_path.split("/", 1)[0]
    matches: list[str] = []
    for candidate in all_paths:
        if not _matches_any(candidate, test_globs):
            continue
        if candidate.startswith(f"{top}/") or candidate == top:
            matches.append(candidate)
    matches.sort()
    return matches[:10]


def _walk(
    root: Path, ignore_globs: list[str]
) -> tuple[list[str], list[str]]:
    """Return (directories, files) as POSIX-style paths relative to root."""
    dirs: list[str] = []
    files: list[str] = []
    basename_ignores = _ignored_basenames(ignore_globs)

    def _is_ignored_dir(rel: str, basename: str) -> bool:
        if basename in basename_ignores:
            return True
        return _matches_any(rel + "/", ignore_globs) or _matches_any(rel, ignore_globs)

    for current_root, subdirs, filenames in os.walk(root, followlinks=False):
        rel_root = os.path.relpath(current_root, root).replace(os.sep, "/")
        if rel_root == ".":
            rel_root_norm = ""
        else:
            rel_root_norm = rel_root
            if _is_ignored_dir(rel_root_norm, Path(rel_root_norm).name):
                # Skip this directory and its descendants.
                subdirs[:] = []
                continue
            dirs.append(rel_root_norm)

        # Prune ignored subdirectories in-place so os.walk skips them.
        pruned: list[str] = []
        for sub in subdirs:
            sub_rel = f"{rel_root_norm}/{sub}".lstrip("/")
            if _is_ignored_dir(sub_rel, sub):
                continue
            pruned.append(sub)
        subdirs[:] = pruned

        for fname in filenames:
            file_rel = f"{rel_root_norm}/{fname}".lstrip("/")
            if _matches_any(file_rel, ignore_globs):
                continue
            files.append(file_rel)

    dirs.sort()
    files.sort()
    return dirs, files


def _build_entries(
    dirs: list[str], files: list[str], cfg: dict[str, Any]
) -> list[dict[str, Any]]:
    keywords_by_subsystem: dict[str, list[str]] = cfg.get("subsystem_keywords", {})
    high_risk_patterns: list[dict[str, Any]] = cfg.get("high_risk_patterns", [])
    test_globs: list[str] = cfg.get("test_discovery", [])

    entries: list[dict[str, Any]] = []

    # Directory entries (one level of granularity per directory).
    for d in dirs:
        if not d:
            continue
        subsystem = _detect_subsystem(d, keywords_by_subsystem)
        risk = _detect_risk_tags(d, high_risk_patterns)
        related = _related_tests(d, test_globs, files)
        triggers = sorted(
            set(
                ([Path(d).name.lower()] if d else [])
                + (keywords_by_subsystem.get(subsystem, []) if subsystem else [])
            )
        )
        entries.append(
            {
                "path": d,
                "kind": "dir",
                "language": None,
                "subsystem": subsystem,
                "role": "module",
                "risk_tags": risk,
                "related_tests": related,
                "read_triggers": triggers,
            }
        )

    # Notable file entries: source-of-truth and config files only.
    notable_basenames = {
        "package.json",
        "pnpm-workspace.yaml",
        "pnpm-lock.yaml",
        "tsconfig.json",
        "vite.config.ts",
        "vite.config.js",
        "playwright.config.ts",
        "playwright.config.js",
        "vitest.config.ts",
        "vitest.config.js",
        "Dockerfile",
        "docker-compose.yml",
        "docker-compose.yaml",
        "Makefile",
        ".env.example",
        "README.md",
        "PRD.md",
        "System_Architecture.md",
        "WORKING_MEMORY.md",
    }
    for f in files:
        base = Path(f).name
        if  (
            base not in notable_basenames
            and _detect_language(base) is None
            and not f.startswith("scripts/agentic/")
        ):
            continue
        subsystem = _detect_subsystem(f, keywords_by_subsystem)
        risk = _detect_risk_tags(f, high_risk_patterns)
        related = _related_tests(f, test_globs, files)
        triggers = sorted(
            set(
                [base.lower()]
                + (keywords_by_subsystem.get(subsystem, []) if subsystem else [])
            )
        )
        entries.append(
            {
                "path": f,
                "kind": "file",
                "language": _detect_language(base),
                "subsystem": subsystem,
                "role": "source-of-truth",
                "risk_tags": risk,
                "related_tests": related,
                "read_triggers": triggers,
            }
        )

    entries.sort(key=lambda e: (e["path"], e["kind"]))
    return entries


def main() -> int:
    cfg = _load_config()
    root = Path(".").resolve()
    ignore_globs: list[str] = cfg.get("ignore_globs", [])

    dirs, files = _walk(root, ignore_globs)
    entries = _build_entries(dirs, files, cfg)

    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "root": ".",
        "entries": entries,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=False)
        fh.write("\n")

    print(f"build_codemap: wrote {OUT_PATH} ({len(entries)} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
