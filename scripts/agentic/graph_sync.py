#!/usr/bin/env python3
"""Sync graph status into .agentic/GRAPH_INDEX.md (managed region only).

Reads graph status from the configured graph artifact and refreshes the
managed region of `.agentic/GRAPH_INDEX.md` between
`<!-- agentic:managed:start -->` and `<!-- agentic:managed:end -->`.
The human region is preserved byte-for-byte. Never writes graph content
into Markdown.

Run from the repo root. Python 3.10+, standard library only.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path.cwd()
CONFIG_PATH = REPO_ROOT / ".agentic" / "CONFIG" / "agentic.json"
GRAPH_INDEX_PATH = REPO_ROOT / ".agentic" / "GRAPH_INDEX.md"

MANAGED_START = "<!-- agentic:managed:start -->"
MANAGED_END = "<!-- agentic:managed:end -->"
HUMAN_START = "<!-- human:notes:start -->"
HUMAN_END = "<!-- human:notes:end -->"

DEFAULT_MAX_AGE_HOURS = 168
DEFAULT_SAMPLE_SIZE = 5


def _load_config() -> dict:
    if not CONFIG_PATH.exists():
        print(f"ERROR: {CONFIG_PATH} not found.", file=sys.stderr)
        sys.exit(2)
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: failed to parse {CONFIG_PATH}: {exc}", file=sys.stderr)
        sys.exit(2)


def _iso_utc(ts: float | None = None) -> str:
    dt = datetime.fromtimestamp(ts, tz=timezone.utc) if ts is not None else datetime.now(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _hours_since(mtime: float) -> float:
    return (datetime.now(timezone.utc).timestamp() - mtime) / 3600.0


def _sample_paths_resolve(graph: dict, sample_size: int) -> tuple[int, int]:
    """Sample a few file paths from the graph and verify they exist on disk.

    Returns (hits, sampled). The graph format is provider-defined; this
    helper handles the Understand Anything shape (top-level `nodes` list
    with `filePath` strings) and falls back to scanning JSON values.
    """
    candidates: list[str] = []
    nodes = graph.get("nodes")
    if isinstance(nodes, list):
        for node in nodes:
            if not isinstance(node, dict):
                continue
            fp = node.get("filePath")
            if isinstance(fp, str) and fp:
                candidates.append(fp)
            if len(candidates) >= sample_size:
                break

    if len(candidates) < sample_size:
        def walk(value):
            if isinstance(value, dict):
                for v in value.values():
                    yield from walk(v)
            elif isinstance(value, list):
                for v in value:
                    yield from walk(v)
            elif isinstance(value, str):
                yield value

        for s in walk(graph):
            if "/" in s and not s.startswith(("http://", "https://")) and (REPO_ROOT / s).exists():
                if s not in candidates:
                    candidates.append(s)
            if len(candidates) >= sample_size:
                break

    sampled = candidates[:sample_size]
    hits = sum(1 for p in sampled if (REPO_ROOT / p).exists())
    return hits, len(sampled)


def _graph_node_count(graph: dict) -> int | None:
    nodes = graph.get("nodes")
    if isinstance(nodes, list):
        return len(nodes)
    return None


def _build_managed_block(
    *,
    provider: str,
    graph_path: str,
    available: bool,
    fallback: str | None,
    last_generated: str,
    parseable: bool,
    non_empty: bool,
    sample_hits: int,
    sample_count: int,
    node_count: int | None,
    stale: bool,
) -> str:
    fallback_str = fallback if fallback else "none"
    coverage = (
        f"{node_count} nodes" if node_count is not None else "unknown"
    )
    gaps = "stale: graph older than freshness budget" if stale else "none"
    lines = [
        MANAGED_START,
        "",
        "## Graph status",
        "",
        f"- Provider: {provider}",
        f"- Graph path: `{graph_path}`",
        f"- Graph mode available: {'yes' if available else 'no'}",
        f"- Fallback mode: {fallback_str}",
        f"- Last checked: {_iso_utc()}",
        f"- Last generated: {last_generated}",
        f"- Parseable: {'yes' if parseable else 'no'}",
        f"- Non-empty: {'yes' if non_empty else 'no'}",
        f"- Sample paths resolve: {sample_hits}/{sample_count}",
        f"- Coverage notes: {coverage}",
        f"- Known gaps: {gaps}",
        "- Unknowns: none",
        "",
        MANAGED_END,
    ]
    return "\n".join(lines)


def _splice_managed(existing: str, new_managed: str) -> str:
    """Replace the managed region in `existing`, preserving the human region.

    If the existing file is missing region markers, this writer will create
    a fresh file with a default human region appended.
    """
    if MANAGED_START in existing and MANAGED_END in existing:
        before, _, rest = existing.partition(MANAGED_START)
        _, _, after = rest.partition(MANAGED_END)
        return f"{before.rstrip()}\n{new_managed}\n{after.lstrip()}".rstrip() + "\n"

    default_human = "\n".join(
        [
            HUMAN_START,
            "",
            "## Human notes",
            "",
            "Routing hints, judgement calls, and provider-specific quirks live here.",
            "",
            HUMAN_END,
        ]
    )
    return f"{new_managed}\n\n{default_human}\n"


def main() -> int:
    config = _load_config()
    graph_block = config.get("graph") or {}
    provider = graph_block.get("provider", "none")
    configured_path = graph_block.get("path")
    graph_required = bool(graph_block.get("required", True))
    fallback = graph_block.get("fallback")
    freshness = config.get("freshness_rules") or {}
    max_age_hours = float(freshness.get("graph_max_age_hours", DEFAULT_MAX_AGE_HOURS))
    sample_size = int((config.get("validation") or {}).get("sample_path_check_count", DEFAULT_SAMPLE_SIZE))

    if not configured_path:
        print("ERROR: agentic.json is missing graph.path.", file=sys.stderr)
        return 2

    graph_path = REPO_ROOT / configured_path
    available = False
    parseable = False
    non_empty = False
    sample_hits = 0
    sample_count = 0
    node_count: int | None = None
    last_generated = "unknown"
    stale = False

    if not graph_path.exists():
        print(f"WARNING: graph not found at {configured_path}.", file=sys.stderr)
        if graph_required:
            print("Graph is marked required. Run /understand or activate fallback.", file=sys.stderr)
    else:
        try:
            data = json.loads(graph_path.read_text(encoding="utf-8"))
            parseable = True
            non_empty = bool(data) and bool(data.get("nodes") if isinstance(data, dict) else data)
            available = parseable and non_empty
            if isinstance(data, dict):
                node_count = _graph_node_count(data)
                sample_hits, sample_count = _sample_paths_resolve(data, sample_size)
            mtime = graph_path.stat().st_mtime
            last_generated = _iso_utc(mtime)
            stale = _hours_since(mtime) > max_age_hours
            if stale:
                print(f"WARNING: graph is stale (> {max_age_hours:.0f}h).", file=sys.stderr)
        except json.JSONDecodeError as exc:
            print(f"ERROR: graph at {configured_path} is not valid JSON: {exc}", file=sys.stderr)
            return 1

    managed = _build_managed_block(
        provider=provider,
        graph_path=configured_path,
        available=available,
        fallback=fallback,
        last_generated=last_generated,
        parseable=parseable,
        non_empty=non_empty,
        sample_hits=sample_hits,
        sample_count=sample_count,
        node_count=node_count,
        stale=stale,
    )

    GRAPH_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    if GRAPH_INDEX_PATH.exists():
        existing = GRAPH_INDEX_PATH.read_text(encoding="utf-8")
        new = _splice_managed(existing, managed)
    else:
        default_human = "\n".join(
            [
                HUMAN_START,
                "",
                "## Human notes",
                "",
                "Routing hints, judgement calls, and provider-specific quirks live here.",
                "",
                HUMAN_END,
            ]
        )
        new = f"{managed}\n\n{default_human}\n"

    GRAPH_INDEX_PATH.write_text(new, encoding="utf-8")

    if not available and graph_required and not (fallback and fallback != "none"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
