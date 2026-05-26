#!/usr/bin/env python3
"""Compile a focused, graph-first context bundle for a coding task.

Usage:
    python scripts/agentic/route_task.py "<task description>" [--explain]

Reads the configured graph artifact (default: Understand Anything's
``.understand-anything/knowledge-graph.json``) plus operational memory and
emits a JSON context bundle to stdout. Also writes the bundle to
``.agentic/CONTEXT/last_context.json``.

Routing priority (first-match wins per stage; later stages add more):

    1. Explicit user-named files / paths / symbols / endpoints.
    2. Graph traversal from explicit anchors (1-hop imports both ways).
    3. Graph search against task terms (node name / summary / tags / path).
    4. Dependency / impact expansion (1-hop on top-scored graph hits).
    5. Related tests via ``test_discovery`` patterns.
    6. Operational memory overlays (PROJECT_BRIEF, MEMORY_INDEX, SUBSYSTEMS).
    7. Risk overlays from ``high_risk_patterns``.
    8. CODEMAP fallback (only if graph unavailable + ``graph.fallback`` allows).
    9. Filesystem fallback when neither graph nor CODEMAP can resolve.
    10. Stop conditions when evidence is insufficient.

Standard library only. Idempotent. Writes only to .agentic/CONTEXT/.
"""

from __future__ import annotations

import datetime as _dt
import fnmatch
import json
import os
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

REPO_ROOT = Path.cwd()
CONFIG_PATH = REPO_ROOT / ".agentic" / "CONFIG" / "agentic.json"
MEMORY_INDEX_PATH = REPO_ROOT / ".agentic" / "MEMORY_INDEX.md"
PROJECT_BRIEF_PATH = REPO_ROOT / ".agentic" / "PROJECT_BRIEF.md"
SUBSYSTEMS_DIR = REPO_ROOT / ".agentic" / "SUBSYSTEMS"
CONTEXT_OUT = REPO_ROOT / ".agentic" / "CONTEXT" / "last_context.json"

MAX_SELECTED_PATHS = 10
MAX_GRAPH_NODES_RETURNED = 15
WORD_FORM_SUFFIXES = ("s", "es", "d", "ed", "ing", "er", "ers", "ment", "ments")
WORD_FORM_ALIASES = {
    "auth": {
        "authenticate",
        "authenticated",
        "authentication",
        "authorize",
        "authorized",
        "authorization",
    },
}
RISKY_VERBS = {
    "migrate": ["data-integrity"],
    "delete": ["data-integrity"],
    "drop": ["data-integrity"],
    "auth": ["security", "authn"],
    "login": ["security", "authn"],
    "secret": ["secrets"],
    "key": ["secrets"],
    "token": ["security", "secrets"],
    "pay": ["money", "compliance"],
    "billing": ["money", "compliance"],
    "deploy": ["infra"],
    "release": ["infra"],
    "record": ["privacy"],
    "transcript": ["privacy"],
}
PRUNED_SCAN_DIRS = {
    ".cache",
    ".git",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "venv",
    ".turbo",
    ".next",
    ".vercel",
    "playwright-report",
    "test-results",
}


def _die(msg: str, code: int = 1) -> None:
    print(f"route_task: {msg}", file=sys.stderr)
    sys.exit(code)


def _load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        _die(f"missing required file: {path}")
    except json.JSONDecodeError as exc:
        _die(f"invalid JSON in {path}: {exc}")
    return {}  # unreachable


def _tokenize(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) > 1}


def _word_forms(token: str) -> set[str]:
    forms = {token}
    forms.update(WORD_FORM_ALIASES.get(token, set()))
    forms.update(f"{token}{suf}" for suf in WORD_FORM_SUFFIXES)
    return forms


def _expanded_task_tokens(task_tokens: set[str]) -> set[str]:
    expanded: set[str] = set()
    for tok in task_tokens:
        expanded |= _word_forms(tok)
    return expanded


# ---------------------------------------------------------------------------
# Graph helpers
# ---------------------------------------------------------------------------


def _load_graph(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    if not isinstance(data.get("nodes"), list):
        return None
    return data


def _index_graph(graph: dict[str, Any]) -> dict[str, Any]:
    nodes = [n for n in graph.get("nodes", []) if isinstance(n, dict)]
    edges = [e for e in graph.get("edges", []) if isinstance(e, dict)]

    nodes_by_id: dict[str, dict[str, Any]] = {}
    nodes_by_filepath: dict[str, list[dict[str, Any]]] = {}
    file_node_ids: set[str] = set()

    for node in nodes:
        nid = node.get("id")
        if isinstance(nid, str):
            nodes_by_id[nid] = node
            if node.get("type") == "file":
                file_node_ids.add(nid)
        fp = node.get("filePath")
        if isinstance(fp, str) and fp:
            nodes_by_filepath.setdefault(fp, []).append(node)

    edges_from: dict[str, list[dict[str, Any]]] = {}
    edges_to: dict[str, list[dict[str, Any]]] = {}
    for edge in edges:
        src = edge.get("source")
        tgt = edge.get("target")
        if isinstance(src, str):
            edges_from.setdefault(src, []).append(edge)
        if isinstance(tgt, str):
            edges_to.setdefault(tgt, []).append(edge)

    return {
        "nodes": nodes,
        "nodes_by_id": nodes_by_id,
        "nodes_by_filepath": nodes_by_filepath,
        "file_node_ids": file_node_ids,
        "edges": edges,
        "edges_from": edges_from,
        "edges_to": edges_to,
    }


def _node_score(
    node: dict[str, Any], task_tokens: set[str], expanded_tokens: set[str]
) -> tuple[int, list[str]]:
    """Score a graph node against task tokens; return (score, reason_parts)."""
    score = 0
    reasons: list[str] = []

    name = str(node.get("name") or "").lower()
    name_tokens = _tokenize(name)
    name_overlap = len(task_tokens & name_tokens)
    if name_overlap:
        score += 5 * name_overlap
        reasons.append(f"name match ({name_overlap})")

    tags = {str(t).lower() for t in node.get("tags") or [] if isinstance(t, str)}
    tag_overlap = len(expanded_tokens & tags)
    if tag_overlap:
        score += 3 * tag_overlap
        reasons.append(f"tag match ({tag_overlap})")

    summary = str(node.get("summary") or "").lower()
    summary_tokens = _tokenize(summary)
    summary_overlap = len(task_tokens & summary_tokens)
    if summary_overlap:
        score += 1 * summary_overlap
        reasons.append(f"summary match ({summary_overlap})")

    fp = str(node.get("filePath") or "").lower()
    fp_tokens = _tokenize(fp)
    fp_overlap = len(task_tokens & fp_tokens)
    if fp_overlap:
        score += 2 * fp_overlap
        reasons.append(f"path match ({fp_overlap})")

    return score, reasons


def _explicit_anchors_from_graph(
    task: str, idx: dict[str, Any]
) -> list[tuple[dict[str, Any], str]]:
    """Find graph nodes the user explicitly named.

    A node is an anchor when its filePath, basename, or symbol name appears as
    a token-bounded substring of the (lowered, slash-normalised) task string.
    Returns a list of (node, reason) pairs preserving insertion order.
    """
    norm = task.lower().replace("\\", "/")
    boundary = r"a-z0-9_./-"
    seen: set[str] = set()
    anchors: list[tuple[dict[str, Any], str]] = []

    def _matches(reference: str) -> bool:
        if not reference:
            return False
        return (
            re.search(
                rf"(?<![{boundary}]){re.escape(reference.lower())}(?![{boundary}])",
                norm,
            )
            is not None
        )

    for node in idx["nodes"]:
        nid = node.get("id")
        if not isinstance(nid, str) or nid in seen:
            continue
        fp = str(node.get("filePath") or "")
        name = str(node.get("name") or "")
        basename = PurePosixPath(fp).name if fp else ""
        ntype = node.get("type")

        # File / config / pipeline / document nodes: match path or basename.
        if ntype in {"file", "config", "pipeline", "document"} and fp:
            if _matches(fp) or _matches(basename):
                anchors.append((node, f"user-named ({basename or fp})"))
                seen.add(nid)
                continue

        # Symbol-level nodes: match the symbol name when it is non-trivial.
        if ntype in {"function", "class", "method"} and len(name) >= 3:
            if _matches(name):
                anchors.append((node, f"user-named symbol ({name})"))
                seen.add(nid)

    return anchors


def _file_node_for_path(idx: dict[str, Any], file_path: str) -> dict[str, Any] | None:
    candidates = idx["nodes_by_filepath"].get(file_path) or []
    for cand in candidates:
        if cand.get("type") == "file":
            return cand
    return candidates[0] if candidates else None


def _expand_dependencies(
    idx: dict[str, Any], anchor_node: dict[str, Any]
) -> list[tuple[str, str]]:
    """Return [(file_path, reason)] for 1-hop import neighbours of an anchor.

    Walks both directions on edges of type ``imports``. Limits each direction
    to a small fan-out so large hub files don't dominate the bundle.
    """
    out: list[tuple[str, str]] = []
    nid = anchor_node.get("id")
    if not isinstance(nid, str):
        return out

    # If anchor is a function node, hop to its file first.
    file_id = nid
    if anchor_node.get("type") in {"function", "class", "method"}:
        fp = anchor_node.get("filePath")
        if isinstance(fp, str):
            file_node = _file_node_for_path(idx, fp)
            if file_node and isinstance(file_node.get("id"), str):
                file_id = file_node["id"]

    def _emit(edges: Iterable[dict[str, Any]], outgoing: bool, limit: int) -> None:
        count = 0
        for edge in edges:
            if edge.get("type") != "imports":
                continue
            other_id = edge.get("target") if outgoing else edge.get("source")
            if not isinstance(other_id, str):
                continue
            other = idx["nodes_by_id"].get(other_id)
            if not other:
                continue
            other_path = other.get("filePath")
            if not isinstance(other_path, str) or not other_path:
                continue
            reason = "imports anchor" if outgoing else "imported by anchor"
            out.append((other_path, reason))
            count += 1
            if count >= limit:
                return

    _emit(idx["edges_from"].get(file_id, []), outgoing=True, limit=4)
    _emit(idx["edges_to"].get(file_id, []), outgoing=False, limit=4)
    return out


# ---------------------------------------------------------------------------
# Memory + risk overlays
# ---------------------------------------------------------------------------


def _glob_match(pattern: str, path: str) -> bool:
    """Match using fnmatch with `**` honoured as multi-segment wildcard."""
    return fnmatch.fnmatchcase(path, pattern.replace("**", "*"))


def _risk_tags_for(paths: list[str], high_risk_patterns: list[dict[str, Any]]) -> set[str]:
    tags: set[str] = set()
    for pattern_block in high_risk_patterns:
        pat = pattern_block.get("match")
        ts = pattern_block.get("tags") or []
        if not isinstance(pat, str) or not isinstance(ts, list):
            continue
        for p in paths:
            if _glob_match(pat, p):
                for t in ts:
                    if isinstance(t, str):
                        tags.add(t)
                break
    return tags


def _subsystem_for_path(path: str, valid_subsystems: set[str]) -> str | None:
    """Best-effort top-level subsystem mapping from a repo-relative path."""
    pp = PurePosixPath(path)
    if not pp.parts:
        return None
    head = pp.parts[0]
    mapping = {
        "frontend": "web",
        "backend": "api",
        "shared": "shared",
        "tests": "tests",
        ".github": "infra",
        "api": "api",
    }
    sub = mapping.get(head)
    if sub and sub in valid_subsystems:
        return sub
    return head if head in valid_subsystems else None


def _valid_subsystems(subsystem_keywords: dict[str, list[str]]) -> set[str]:
    names: set[str] = set(subsystem_keywords.keys())
    if SUBSYSTEMS_DIR.is_dir():
        for p in SUBSYSTEMS_DIR.glob("*.md"):
            if p.name.lower() != "readme.md":
                names.add(p.stem)
    return names


def _subsystem_keyword_overlay(
    task_tokens: set[str], subsystem_keywords: dict[str, list[str]]
) -> set[str]:
    """Subsystems whose configured keywords appear (with word forms) in task."""
    expanded = _expanded_task_tokens(task_tokens)
    out: set[str] = set()
    for sub, kws in subsystem_keywords.items():
        for kw in kws:
            parts = _tokenize(kw)
            if parts and all(p in expanded for p in parts):
                out.add(sub)
                break
    return out


def _related_tests_for(
    selected_paths: list[str], test_discovery: list[str]
) -> list[str]:
    """For each non-test selected source path, find sibling tests that match.

    Strategy: scan ``tests/`` and ``__tests__`` for filenames that contain the
    stem of any selected source path. Cap output at MAX_SELECTED_PATHS.
    """
    out: list[str] = []
    stems: set[str] = set()
    for p in selected_paths:
        if "tests/" in p or "/test_" in p or p.startswith("tests/"):
            continue
        stems.add(PurePosixPath(p).stem)
    if not stems:
        return out

    test_roots = [REPO_ROOT / "tests"]
    for root in test_roots:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(REPO_ROOT).as_posix()
            base = path.stem.lower()
            if any(stem.lower() in base for stem in stems):
                if rel not in out:
                    out.append(rel)
                if len(out) >= MAX_SELECTED_PATHS:
                    return out
    return out


# ---------------------------------------------------------------------------
# CODEMAP fallback path (degraded mode)
# ---------------------------------------------------------------------------


def _codemap_routing(
    task_tokens: set[str],
    subsystem_keywords: dict[str, list[str]],
    valid_subsystems: set[str],
    codemap_path: Path,
) -> tuple[list[str], dict[str, str], set[str]]:
    """Return (selected_paths, selection_reasons, selected_subsystems).

    Mirrors the v1 keyword-scoring routing as a degraded fallback when the
    graph artifact is unavailable.
    """
    if not codemap_path.is_file():
        return [], {}, set()
    try:
        codemap = json.loads(codemap_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return [], {}, set()

    entries = codemap.get("entries") or []
    expanded = _expanded_task_tokens(task_tokens)
    scored: list[tuple[int, dict[str, Any]]] = []
    for e in entries:
        if not isinstance(e, dict):
            continue
        triggers = {str(t).lower() for t in e.get("read_triggers") or []}
        token_overlap = len(task_tokens & triggers)
        sub = e.get("subsystem")
        sub_overlap = 0
        if sub and sub in subsystem_keywords:
            for kw in subsystem_keywords[sub]:
                parts = _tokenize(kw)
                if parts and all(p in expanded for p in parts):
                    sub_overlap += 1
        score = 3 * token_overlap + 2 * sub_overlap
        if score > 0:
            scored.append((score, e))
    scored.sort(key=lambda x: (-x[0], x[1].get("path", "")))

    selected: list[str] = []
    reasons: dict[str, str] = {}
    subs: set[str] = set()
    for _, e in scored:
        path = e.get("path")
        if not isinstance(path, str):
            continue
        if e.get("kind") == "dir":
            continue
        if path in reasons:
            continue
        if len(selected) >= MAX_SELECTED_PATHS:
            break
        selected.append(path)
        reasons[path] = "codemap fallback (keyword score)"
        sub = e.get("subsystem")
        if sub in valid_subsystems:
            subs.add(sub)
    return selected, reasons, subs


# ---------------------------------------------------------------------------
# Filesystem fallback (last resort)
# ---------------------------------------------------------------------------


def _filesystem_anchors(task: str) -> list[str]:
    norm = task.lower().replace("\\", "/")
    boundary = r"a-z0-9_./-"
    found: list[str] = []
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        rel_dir = Path(dirpath).relative_to(REPO_ROOT).as_posix()
        if rel_dir.startswith(".") and rel_dir not in {".", ".github"}:
            dirnames[:] = []
            continue
        dirnames[:] = sorted(
            d for d in dirnames if d not in PRUNED_SCAN_DIRS and not d.endswith(".egg-info")
        )
        for fn in sorted(filenames):
            rel = (Path(dirpath) / fn).relative_to(REPO_ROOT).as_posix()
            base = fn.lower()
            for needle in (rel.lower(), base):
                if re.search(
                    rf"(?<![{boundary}]){re.escape(needle)}(?![{boundary}])", norm
                ):
                    found.append(rel)
                    break
            if len(found) >= MAX_SELECTED_PATHS:
                return sorted(set(found))[:MAX_SELECTED_PATHS]
    return sorted(set(found))


# ---------------------------------------------------------------------------
# Confidence
# ---------------------------------------------------------------------------


def _compute_confidence(
    *,
    graph_available: bool,
    fallback_active: bool,
    has_explicit_anchors: bool,
    selected_paths_count: int,
    related_tests_count: int,
    selected_subsystems_count: int,
) -> tuple[str, list[str]]:
    stops: list[str] = []
    if selected_paths_count == 0:
        stops.append("No paths matched the task; refine the task string or supply a file anchor.")
        return "low", stops
    if has_explicit_anchors:
        level = "high" if related_tests_count > 0 else "medium"
    elif graph_available and selected_paths_count > 0:
        level = "medium"
        if related_tests_count == 0:
            stops.append("No related tests located; identify or add a test before non-trivial changes.")
    else:
        level = "low"
        stops.append("Graph not available and no explicit anchors; confirm scope before implementing.")

    if selected_subsystems_count >= 3 and not has_explicit_anchors:
        stops.append("Task spans multiple subsystems; confirm primary subsystem before implementing.")
        level = "low" if level != "low" else level

    if fallback_active and level != "low":
        level = "medium" if level == "high" else "low"

    return level, stops


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if a != "--explain"]
    explain = "--explain" in argv[1:]
    task = " ".join(args).strip()
    if not task:
        _die('usage: route_task.py "<task description>" [--explain]', code=2)

    cfg = _load_json(CONFIG_PATH)
    graph_block = cfg.get("graph") or {}
    graph_path_str = graph_block.get("path")
    graph_required = bool(graph_block.get("required", True))
    graph_fallback = graph_block.get("fallback") or "none"
    fallback_artifact = REPO_ROOT / ".agentic" / "CODEMAP.json"

    subsystem_keywords: dict[str, list[str]] = cfg.get("subsystem_keywords") or {}
    test_discovery: list[str] = cfg.get("test_discovery") or []
    high_risk_patterns: list[dict[str, Any]] = cfg.get("high_risk_patterns") or []
    valid_subsystems = _valid_subsystems(subsystem_keywords)

    # ---- Graph load -------------------------------------------------------
    graph: dict[str, Any] | None = None
    graph_path = REPO_ROOT / graph_path_str if isinstance(graph_path_str, str) else None
    if graph_path is not None:
        graph = _load_graph(graph_path)
    graph_available = graph is not None

    fallback_active = False
    if not graph_available and graph_fallback == "codemap" and fallback_artifact.is_file():
        fallback_active = True

    if not graph_available and graph_required and not fallback_active:
        # Hard config: graph required, no fallback. Surface a stop condition
        # but do not crash; the caller deserves a usable bundle.
        pass

    task_tokens = _tokenize(task)
    expanded_tokens = _expanded_task_tokens(task_tokens)

    selected_paths: list[str] = []
    selection_reasons: dict[str, str] = {}
    graph_node_summaries: list[dict[str, Any]] = []
    dependency_paths: list[str] = []
    selected_subsystems: set[str] = set()
    has_explicit_anchors = False

    def _add_path(path: str, reason: str) -> None:
        if not path or path in selection_reasons:
            return
        if len(selected_paths) >= MAX_SELECTED_PATHS:
            return
        selected_paths.append(path)
        selection_reasons[path] = reason
        sub = _subsystem_for_path(path, valid_subsystems)
        if sub:
            selected_subsystems.add(sub)

    if graph_available and graph is not None:
        idx = _index_graph(graph)

        # 1. Explicit user-named anchors (graph-resolved).
        anchors = _explicit_anchors_from_graph(task, idx)
        for node, reason in anchors:
            fp = node.get("filePath")
            if isinstance(fp, str) and fp:
                _add_path(fp, reason)
                has_explicit_anchors = True
                if len(graph_node_summaries) < MAX_GRAPH_NODES_RETURNED:
                    graph_node_summaries.append(
                        {
                            "id": node.get("id"),
                            "type": node.get("type"),
                            "name": node.get("name"),
                            "filePath": fp,
                            "tags": node.get("tags") or [],
                            "lineRange": node.get("lineRange"),
                            "reason": reason,
                        }
                    )

        # 2. Dependency expansion from anchor file nodes.
        for node, _ in anchors:
            for dep_path, dep_reason in _expand_dependencies(idx, node):
                if dep_path not in selection_reasons:
                    dependency_paths.append(dep_path)
                _add_path(dep_path, dep_reason)

        # 3. Graph search across remaining nodes.
        if expanded_tokens:
            scored: list[tuple[int, dict[str, Any], list[str]]] = []
            for node in idx["nodes"]:
                if node.get("id") in {n["id"] for n in graph_node_summaries if n.get("id")}:
                    continue
                score, parts = _node_score(node, task_tokens, expanded_tokens)
                if score > 0:
                    scored.append((score, node, parts))
            scored.sort(key=lambda t: (-t[0], str(t[1].get("filePath") or "")))
            for score, node, parts in scored:
                fp = node.get("filePath")
                if not isinstance(fp, str) or not fp:
                    continue
                reason = "graph search: " + ", ".join(parts) if parts else "graph search"
                _add_path(fp, reason)
                if len(graph_node_summaries) < MAX_GRAPH_NODES_RETURNED:
                    graph_node_summaries.append(
                        {
                            "id": node.get("id"),
                            "type": node.get("type"),
                            "name": node.get("name"),
                            "filePath": fp,
                            "tags": node.get("tags") or [],
                            "lineRange": node.get("lineRange"),
                            "reason": reason,
                        }
                    )
                if len(selected_paths) >= MAX_SELECTED_PATHS:
                    break

    elif fallback_active:
        codemap_paths, codemap_reasons, codemap_subs = _codemap_routing(
            task_tokens, subsystem_keywords, valid_subsystems, fallback_artifact
        )
        for p in codemap_paths:
            _add_path(p, codemap_reasons.get(p, "codemap fallback"))
        selected_subsystems |= codemap_subs

    # 9. Filesystem fallback (only when nothing has resolved).
    if not selected_paths:
        for p in _filesystem_anchors(task):
            _add_path(p, "filesystem anchor (last-resort)")
            has_explicit_anchors = True

    # 6/7. Subsystem-keyword overlay (soft hint, additive).
    selected_subsystems |= _subsystem_keyword_overlay(task_tokens, subsystem_keywords)
    selected_subsystems &= valid_subsystems

    # Risk overlay.
    risky_tags: set[str] = set()
    for verb, tags in RISKY_VERBS.items():
        if verb in task_tokens:
            risky_tags.update(tags)
    risk_tags = sorted(risky_tags | _risk_tags_for(selected_paths, high_risk_patterns))

    # Memory files.
    memory_files: list[str] = []
    if PROJECT_BRIEF_PATH.is_file():
        memory_files.append(PROJECT_BRIEF_PATH.relative_to(REPO_ROOT).as_posix())
    if MEMORY_INDEX_PATH.is_file():
        memory_files.append(MEMORY_INDEX_PATH.relative_to(REPO_ROOT).as_posix())

    subsystem_files: list[str] = []
    if SUBSYSTEMS_DIR.is_dir():
        for sub in sorted(selected_subsystems):
            cand = SUBSYSTEMS_DIR / f"{sub}.md"
            if cand.is_file():
                subsystem_files.append(cand.relative_to(REPO_ROOT).as_posix())

    # Related tests.
    related_tests = _related_tests_for(selected_paths, test_discovery)

    # Confidence + stops.
    confidence, stop_conditions = _compute_confidence(
        graph_available=graph_available,
        fallback_active=fallback_active,
        has_explicit_anchors=has_explicit_anchors,
        selected_paths_count=len(selected_paths),
        related_tests_count=len(related_tests),
        selected_subsystems_count=len(selected_subsystems),
    )

    unknowns: list[str] = []
    if not graph_available:
        if fallback_active:
            unknowns.append(
                "Graph unavailable; routed via CODEMAP fallback. Re-run /understand to restore graph mode."
            )
        elif graph_required:
            unknowns.append(
                "Graph required by config but artifact missing/unparseable, and no fallback active."
            )
            stop_conditions.append(
                "Graph is required but unavailable. Run /understand or set graph.required=false."
            )
    if not selected_paths:
        unknowns.append("No paths resolved by graph, fallback, or filesystem.")
    if any(t in task_tokens for t in ("openai", "realtime", "webrtc")):
        unknowns.append(
            "Realtime path is OpenAI-specific. Confirm whether changes touch backend token issuance, frontend WebRTC, or both."
        )

    bundle: dict[str, Any] = {
        "task": task,
        "generated_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "confidence": confidence,
        "graph_available": graph_available,
        "graph_source": graph_path_str if graph_available else (
            ".agentic/CODEMAP.json" if fallback_active else None
        ),
        "fallback_active": fallback_active,
        "selected_paths": selected_paths,
        "selection_reasons": selection_reasons,
        "graph_nodes": graph_node_summaries,
        "dependency_paths": sorted(set(dependency_paths)),
        "related_tests": related_tests,
        "subsystem_files": subsystem_files,
        "memory_files": memory_files,
        "selected_subsystems": sorted(selected_subsystems),
        "risk_tags": risk_tags,
        "unknowns": unknowns,
        "stop_conditions": stop_conditions,
    }

    if explain:
        bundle["_explain"] = {
            "graph_required": graph_required,
            "graph_fallback": graph_fallback,
            "expanded_token_count": len(expanded_tokens),
            "valid_subsystems": sorted(valid_subsystems),
        }

    CONTEXT_OUT.parent.mkdir(parents=True, exist_ok=True)
    CONTEXT_OUT.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")
    json.dump(bundle, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
