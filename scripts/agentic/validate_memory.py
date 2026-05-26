#!/usr/bin/env python3
"""Validate the v2 Agentic OS memory and tooling layer.

Checks (warnings are non-fatal; structural failures exit non-zero):

- Required files present: ``.agentic/CONFIG/agentic.json``, ``PROJECT_BRIEF.md``,
  ``MEMORY_INDEX.md``, ``SUBSYSTEMS/README.md``, ``LESSONS/decisions.md``,
  ``LESSONS/incidents.md``.
- ``agentic.json`` parses and has required top-level keys (``version``, ``graph``,
  ``paths``).
- Graph artifact at ``graph.path`` exists and parses, OR ``graph.required`` is
  ``false`` and a fallback artifact (CODEMAP.json) is present.
- If ``validation.require_region_markers`` is true, paired managed/human region
  markers exist in PROJECT_BRIEF.md, MEMORY_INDEX.md, GRAPH_INDEX.md, and each
  ``SUBSYSTEMS/<name>.md``.
- Configured ``paths.context_cache`` parent directory is creatable.
- Sample-check up to ``validation.sample_path_check_count`` inline backtick
  paths in memory files; warn on misses.
- Warn on stale graph (``freshness_rules.graph_max_age_hours``).
- Warn on stale memory files (``freshness_rules.memory_max_age_days``).

Standard library only. Read-only: never modifies any file.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path.cwd()
CONFIG_PATH = REPO_ROOT / ".agentic" / "CONFIG" / "agentic.json"
GRAPH_INDEX_PATH = REPO_ROOT / ".agentic" / "GRAPH_INDEX.md"
PROJECT_BRIEF = REPO_ROOT / ".agentic" / "PROJECT_BRIEF.md"
MEMORY_INDEX = REPO_ROOT / ".agentic" / "MEMORY_INDEX.md"
SUBSYSTEMS_DIR = REPO_ROOT / ".agentic" / "SUBSYSTEMS"
SUBSYSTEMS_README = SUBSYSTEMS_DIR / "README.md"
DECISIONS = REPO_ROOT / ".agentic" / "LESSONS" / "decisions.md"
INCIDENTS = REPO_ROOT / ".agentic" / "LESSONS" / "incidents.md"

MANAGED_START = "<!-- agentic:managed:start -->"
MANAGED_END = "<!-- agentic:managed:end -->"
HUMAN_START = "<!-- human:notes:start -->"
HUMAN_END = "<!-- human:notes:end -->"

REQUIRED_TOP_LEVEL_KEYS = ("version", "graph", "paths")
DEFAULT_GRAPH_MAX_AGE_HOURS = 168
DEFAULT_MEMORY_MAX_AGE_DAYS = 30
DEFAULT_SAMPLE_PATH_COUNT = 5
INLINE_PATH_PATTERN = re.compile(r"`([^`\s]{2,})`")


def _hours_since(mtime: float) -> float:
    return (datetime.now(timezone.utc).timestamp() - mtime) / 3600.0


class Report:
    """Collects errors and warnings without dying mid-check."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def _check_required_files(report: Report) -> None:
    required = [
        CONFIG_PATH,
        PROJECT_BRIEF,
        MEMORY_INDEX,
        SUBSYSTEMS_README,
        DECISIONS,
        INCIDENTS,
    ]
    for path in required:
        if not path.is_file():
            report.err(f"missing required file: {path.relative_to(REPO_ROOT)}")


def _check_config(report: Report) -> dict | None:
    if not CONFIG_PATH.is_file():
        return None
    try:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        report.err(f"agentic.json is not valid JSON: {exc}")
        return None
    if not isinstance(cfg, dict):
        report.err("agentic.json must be a JSON object")
        return None
    for key in REQUIRED_TOP_LEVEL_KEYS:
        if key not in cfg:
            report.err(f"agentic.json missing required key: {key}")
    version = cfg.get("version")
    if version != 2:
        report.warn(f"agentic.json.version is {version!r}; expected 2 for v2 Agentic OS")
    return cfg


def _check_graph(cfg: dict, report: Report) -> bool:
    """Return True when the graph (or its fallback) is usable."""
    graph_block = cfg.get("graph") or {}
    graph_path_str = graph_block.get("path")
    graph_required = bool(graph_block.get("required", True))
    fallback = graph_block.get("fallback")

    graph_path = REPO_ROOT / graph_path_str if isinstance(graph_path_str, str) else None
    graph_ok = False
    if graph_path is not None and graph_path.is_file():
        try:
            data = json.loads(graph_path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("nodes"), list) and data["nodes"]:
                graph_ok = True
        except json.JSONDecodeError:
            report.warn(f"graph at {graph_path_str} is not valid JSON")
        if graph_ok:
            freshness = cfg.get("freshness_rules") or {}
            max_age = float(freshness.get("graph_max_age_hours", DEFAULT_GRAPH_MAX_AGE_HOURS))
            age = _hours_since(graph_path.stat().st_mtime)
            if age > max_age:
                report.warn(
                    f"graph is stale: {age:.1f}h since regeneration (>{max_age:.0f}h)."
                )
    elif graph_path_str:
        report.warn(f"graph not found at {graph_path_str}")

    if graph_ok:
        return True

    if fallback == "codemap":
        codemap = REPO_ROOT / ".agentic" / "CODEMAP.json"
        if codemap.is_file():
            report.warn("graph unavailable; CODEMAP fallback active")
            return True

    if graph_required:
        report.err("graph required but neither graph artifact nor fallback is usable")
    return False


def _check_region_markers(cfg: dict, report: Report) -> None:
    require = bool((cfg.get("validation") or {}).get("require_region_markers", True))
    if not require:
        return
    files = [PROJECT_BRIEF, MEMORY_INDEX]
    if GRAPH_INDEX_PATH.is_file():
        files.append(GRAPH_INDEX_PATH)
    if SUBSYSTEMS_DIR.is_dir():
        for p in SUBSYSTEMS_DIR.glob("*.md"):
            if p.name.lower() == "readme.md":
                continue
            files.append(p)

    for path in files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        m_start = text.count(MANAGED_START)
        m_end = text.count(MANAGED_END)
        h_start = text.count(HUMAN_START)
        h_end = text.count(HUMAN_END)
        rel = path.relative_to(REPO_ROOT)
        if m_start != 1 or m_end != 1:
            report.err(f"{rel}: managed region markers must appear exactly once each")
        if h_start != 1 or h_end != 1:
            report.err(f"{rel}: human region markers must appear exactly once each")
        if m_start == 1 and m_end == 1 and text.find(MANAGED_START) > text.find(MANAGED_END):
            report.err(f"{rel}: managed region end appears before start")
        if h_start == 1 and h_end == 1 and text.find(HUMAN_START) > text.find(HUMAN_END):
            report.err(f"{rel}: human region end appears before start")


def _check_context_cache(cfg: dict, report: Report) -> None:
    paths = cfg.get("paths") or {}
    cache_str = paths.get("context_cache")
    if not isinstance(cache_str, str) or not cache_str:
        report.err("agentic.json.paths.context_cache is missing")
        return
    cache_parent = (REPO_ROOT / cache_str).parent
    # Read-only check (see module docstring): never create directories here.
    # If the parent already exists, it must be a writable directory. Otherwise
    # walk up to the nearest existing ancestor and verify it is a writable
    # directory we could create the missing segments inside. ``route_task.py``
    # is responsible for actually mkdir-ing the cache dir on first write.
    if cache_parent.exists():
        if not cache_parent.is_dir():
            report.err(f"context cache parent is not a directory: {cache_parent}")
        elif not os.access(cache_parent, os.W_OK):
            report.err(f"context cache parent not writable: {cache_parent}")
        return
    ancestor = cache_parent.parent
    while True:
        if ancestor.exists():
            if not ancestor.is_dir():
                report.err(
                    f"context cache ancestor is not a directory: {ancestor}"
                )
            elif not os.access(ancestor, os.W_OK):
                report.err(
                    f"context cache parent not creatable (ancestor {ancestor} not writable)"
                )
            return
        if ancestor.parent == ancestor:
            report.err(f"context cache parent not creatable: {cache_parent}")
            return
        ancestor = ancestor.parent


def _check_memory_freshness(cfg: dict, report: Report) -> None:
    freshness = cfg.get("freshness_rules") or {}
    max_age_days = float(freshness.get("memory_max_age_days", DEFAULT_MEMORY_MAX_AGE_DAYS))
    files = [PROJECT_BRIEF, MEMORY_INDEX]
    if SUBSYSTEMS_DIR.is_dir():
        files.extend(SUBSYSTEMS_DIR.glob("*.md"))
    now = datetime.now(timezone.utc).timestamp()
    for path in files:
        if not path.is_file():
            continue
        age_days = (now - path.stat().st_mtime) / 86400.0
        if age_days > max_age_days:
            report.warn(
                f"{path.relative_to(REPO_ROOT)}: stale ({age_days:.1f} days > {max_age_days:.0f})"
            )


def _check_sample_paths(cfg: dict, report: Report) -> None:
    sample_size = int((cfg.get("validation") or {}).get(
        "sample_path_check_count", DEFAULT_SAMPLE_PATH_COUNT
    ))
    if sample_size <= 0:
        return

    files = [PROJECT_BRIEF, MEMORY_INDEX]
    if SUBSYSTEMS_DIR.is_dir():
        files.extend(p for p in SUBSYSTEMS_DIR.glob("*.md") if p.is_file())

    for path in files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        candidates: list[str] = []
        for match in INLINE_PATH_PATTERN.finditer(text):
            token = match.group(1)
            # Heuristic: only treat as a path candidate when it contains a slash
            # or a known path-like extension. This avoids treating package
            # names, env var names, and prose backticks as missing paths.
            if "/" not in token:
                continue
            if token.startswith(("http://", "https://", "@")):
                continue
            # URL paths ("/v1/...") and absolute paths are not repo paths.
            if token.startswith("/"):
                continue
            # Shell brace expansion ("tests/{a,b}/") is a pattern, not a path.
            if any(c in token for c in (" ", "*", "<", ">", "{", "}")):
                continue
            candidates.append(token)
            if len(candidates) >= sample_size:
                break

        for ref in candidates:
            cleaned = ref.rstrip(".,;:)")
            # Try repo-root relative first, then memory-file-relative. Memory
            # files frequently reference siblings (e.g. MEMORY_INDEX.md →
            # `SUBSYSTEMS/web.md`) which resolve against `.agentic/`, not the
            # repo root.
            if (REPO_ROOT / cleaned).exists():
                continue
            if (path.parent / cleaned).exists():
                continue
            report.warn(f"{path.relative_to(REPO_ROOT)}: referenced path not found: {cleaned}")


def main() -> int:
    report = Report()

    _check_required_files(report)
    cfg = _check_config(report)
    if cfg is not None:
        _check_graph(cfg, report)
        _check_region_markers(cfg, report)
        _check_context_cache(cfg, report)
        _check_memory_freshness(cfg, report)
        _check_sample_paths(cfg, report)

    for w in report.warnings:
        print(f"warn: {w}", file=sys.stderr)
    for e in report.errors:
        print(f"error: {e}", file=sys.stderr)

    if report.errors:
        print(
            f"validate_memory: failed ({len(report.errors)} error(s), {len(report.warnings)} warning(s))",
            file=sys.stderr,
        )
        return 1
    print(
        f"validate_memory: ok ({len(report.warnings)} warning(s))",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
