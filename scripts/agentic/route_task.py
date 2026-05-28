#!/usr/bin/env python3
"""Compile a focused, graph-first context bundle for a coding task.

Usage:
    python scripts/agentic/route_task.py "<task description>" [--explain]

Reads the configured graph artifact (default: Understand Anything's
``.understand-anything/knowledge-graph.json``) plus operational memory and
emits a JSON context bundle to stdout. Also writes the bundle to
``.agentic/CONTEXT/last_context.json``.

Routing pipeline (per-stage budgets under a single hard cap; later stages add
selections only if their budget and the hard cap allow it):

    1. Filesystem anchors (path-shaped tokens only).
    2. Graph: explicit user-named anchors (file / config / doc / symbol nodes).
    3. Dependency expansion from anchors using configurable edge types.
    4. Graph search by name / tag / summary / path against task tokens; a
       score floor applies once at least one anchor has been resolved.
    5. Test discovery: graph-edge driven when available, fs-walk fallback.
    6. Lessons injection: ``LESSONS/{decisions,incidents}.md`` headings whose
       tokens overlap the task tokens.
    7. Operational memory + subsystem overlays.
    8. Risk overlays: per-block ``keywords`` from ``high_risk_patterns`` plus
       a curated default verb dictionary as a fallback.
    9. Freshness check: stale graph adds an ``unknowns`` entry and downgrades
       confidence by one level.
   10. Confidence + stop conditions.

Standard library only. Idempotent. Writes only to .agentic/CONTEXT/.
"""

from __future__ import annotations

import datetime as _dt
import fnmatch
import json
import os
import re
import sys
from collections.abc import Iterable
from pathlib import Path, PurePosixPath
from typing import Any

REPO_ROOT = Path.cwd()
CONFIG_PATH = REPO_ROOT / ".agentic" / "CONFIG" / "agentic.json"
MEMORY_INDEX_PATH = REPO_ROOT / ".agentic" / "MEMORY_INDEX.md"
PROJECT_BRIEF_PATH = REPO_ROOT / ".agentic" / "PROJECT_BRIEF.md"
SUBSYSTEMS_DIR = REPO_ROOT / ".agentic" / "SUBSYSTEMS"
LESSONS_DIR = REPO_ROOT / ".agentic" / "LESSONS"
CONTEXT_OUT = REPO_ROOT / ".agentic" / "CONTEXT" / "last_context.json"

# ---- Routing defaults (overridable via agentic.json) ----------------------

DEFAULT_HARD_CAP = 12
DEFAULT_BUDGETS = {"anchors": 6, "deps": 4, "search": 6, "tests": 4}
DEFAULT_MIN_SEARCH_SCORE_WITH_ANCHORS = 3
DEFAULT_DEPENDENCY_EDGE_TYPES = ["imports", "calls", "depends_on", "references"]
DEFAULT_TEST_EDGE_TYPES = ["tested_by", "tests"]
DEFAULT_DEPENDENCY_FANOUT = 4

MAX_GRAPH_NODES_RETURNED = 15
MAX_REJECTED_NODES_RETURNED = 10

# Extensions we refuse to treat as tests even if they match a ``*.test.*``
# glob. This is the regression-driver for the historical case where
# ``backend/tsconfig.test.json`` was being injected into ``related_tests``.
NON_TEST_EXTENSIONS = {".json", ".yml", ".yaml", ".md"}

DEFAULT_SUBSYSTEM_PATH_ROOTS = {
    "frontend": "web",
    "backend": "api",
    "shared": "shared",
    "tests": "tests",
    ".github": "infra",
    "api": "api",
}

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

# Curated fallback risk dictionary used when a ``high_risk_patterns`` block
# does not declare its own ``keywords``. Keeps risk signalling working on
# repos that have not yet migrated their config to the per-block schema.
DEFAULT_RISKY_VERBS = {
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


def _string_list_or_default(value: Any, default: list[str]) -> list[str]:
    """Return ``value`` as a validated ``list[str]``; fall back to ``default``.

    Guards against the silent failure where a config value mistyped as a
    bare string (e.g. ``"imports"`` instead of ``["imports"]``) is later
    fed to ``set(...)`` for edge-type filtering and becomes a character set
    that matches nothing useful. Non-string items inside an otherwise valid
    list are filtered out; an empty list after filtering also falls back.
    """
    if not isinstance(value, list):
        return default
    valid = [v for v in value if isinstance(v, str)]
    return valid if valid else default


def _positive_int_or_default(value: Any, default: int) -> int:
    """Return ``value`` as a positive ``int``; fall back to ``default``.

    ``bool`` is a subclass of ``int`` in Python; that path is excluded so a
    configured ``True``/``False`` (almost certainly a typo for a numeric
    budget) is not silently coerced into ``1``/``0``.
    """
    if isinstance(value, bool):
        return default
    if not isinstance(value, int) or value <= 0:
        return default
    return value


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


def _word_forms(token: str, vocab: set[str] | None = None) -> set[str]:
    """Expand ``token`` into related word forms.

    When ``vocab`` is provided (typically the union of graph node names,
    tags, and filePath stems), only emit forms that exist in vocab. This
    suppresses the historical noise from blind suffix concatenation (e.g.
    ``cors`` -> ``corsment``).

    When ``vocab`` is not provided (e.g. CODEMAP fallback path or routes
    that pre-date graph mode), fall back to the legacy suffix expansion so
    keyword-overlap-driven helpers do not regress for un-migrated repos.
    """
    forms: set[str] = {token}
    forms |= WORD_FORM_ALIASES.get(token, set())
    if vocab is None:
        forms.update(f"{token}{suf}" for suf in WORD_FORM_SUFFIXES)
        return forms

    candidates: set[str] = set()
    for suf in WORD_FORM_SUFFIXES:
        candidates.add(token + suf)
        if token.endswith(suf) and len(token) > len(suf) + 1:
            candidates.add(token[: -len(suf)])
    forms |= {c for c in candidates if c in vocab}
    return forms


def _expanded_task_tokens(
    task_tokens: set[str], vocab: set[str] | None = None
) -> set[str]:
    expanded: set[str] = set()
    for tok in task_tokens:
        expanded |= _word_forms(tok, vocab)
    return expanded


def _looks_path_shaped(task: str) -> bool:
    """Cheap pre-check: does the task string reference a path-like token?

    Skips the full repo walk in ``_filesystem_anchors`` when there is
    nothing in the task that could possibly match an on-disk path.
    """
    if "/" in task or "\\" in task:
        return True
    return bool(re.search(r"[a-z0-9_-]\.[a-z0-9]{1,8}\b", task, re.IGNORECASE))


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


def _graph_vocab(idx: dict[str, Any]) -> set[str]:
    """Union of tokens from node names, tags, and filePath stems.

    Used to drive vocabulary-aware word-form expansion so token explosion
    is bounded by what the graph actually knows about.
    """
    vocab: set[str] = set()
    for node in idx["nodes"]:
        name = node.get("name")
        if isinstance(name, str):
            vocab |= _tokenize(name)
        tags = node.get("tags") or []
        for t in tags:
            if isinstance(t, str):
                vocab |= _tokenize(t)
        fp = node.get("filePath")
        if isinstance(fp, str) and fp:
            vocab |= _tokenize(PurePosixPath(fp).stem)
            vocab |= _tokenize(fp)
    return vocab


def _node_score(
    node: dict[str, Any], task_tokens: set[str], expanded_tokens: set[str]
) -> tuple[int, list[str]]:
    """Score a graph node against task tokens; return (score, reason_parts).

    Deliberate asymmetry: name/summary/path overlaps use the raw
    ``task_tokens`` (we don't want a fuzzy match against an inflected form
    of a file basename), while tag overlaps use ``expanded_tokens`` because
    tag vocabularies are small, controlled, and benefit from morphology.
    """
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

        if ntype in {"file", "config", "pipeline", "document"} and fp:
            if _matches(fp) or _matches(basename):
                anchors.append((node, f"user-named ({basename or fp})"))
                seen.add(nid)
                continue

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
    idx: dict[str, Any],
    anchor_node: dict[str, Any],
    *,
    edge_types: list[str],
    fanout: int,
    edge_types_used: set[str] | None = None,
) -> list[tuple[str, str]]:
    """Return [(file_path, reason)] for 1-hop neighbours of an anchor.

    Walks both directions on edges whose ``type`` appears in ``edge_types``.
    Limits each direction to ``fanout`` so large hub files don't dominate
    the bundle. The matched edge type is appended to the reason so the
    caller can tell why a dependency was selected.
    """
    out: list[tuple[str, str]] = []
    nid = anchor_node.get("id")
    if not isinstance(nid, str):
        return out

    file_id = nid
    if anchor_node.get("type") in {"function", "class", "method"}:
        fp = anchor_node.get("filePath")
        if isinstance(fp, str):
            file_node = _file_node_for_path(idx, fp)
            if file_node and isinstance(file_node.get("id"), str):
                file_id = file_node["id"]

    allowed = set(edge_types)

    def _emit(edges: Iterable[dict[str, Any]], outgoing: bool) -> None:
        count = 0
        for edge in edges:
            etype = edge.get("type")
            if etype not in allowed:
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
            verb = etype if outgoing else f"reverse-{etype}"
            reason = f"dependency: {verb}"
            out.append((other_path, reason))
            if isinstance(edge_types_used, set):
                edge_types_used.add(etype)
            count += 1
            if count >= fanout:
                return

    _emit(idx["edges_from"].get(file_id, []), outgoing=True)
    _emit(idx["edges_to"].get(file_id, []), outgoing=False)
    return out


def _graph_related_tests(
    idx: dict[str, Any],
    source_paths: list[str],
    test_edge_types: list[str],
    test_discovery: list[str],
    edge_types_used: set[str] | None = None,
) -> list[str]:
    """Collect test paths via test-type graph edges from source file nodes.

    Edge-type filtering alone is not a sufficient guarantee that the other
    endpoint is actually a test file: a graph provider may emit the
    relationship in both directions (so an ``edges_to`` traversal of a
    ``tested_by`` edge can surface a non-test source), a user-configured
    ``test_edge_types`` may include an over-broad type, or a malformed graph
    may point a test edge at a doc or config file. ``_is_test_path`` is the
    authoritative check used elsewhere in the router and is applied here so
    ``related_tests`` always carries real test files.
    """
    allowed = set(test_edge_types)
    out: list[str] = []
    seen: set[str] = set()

    def _add(fp: str) -> None:
        if fp in seen:
            return
        seen.add(fp)
        out.append(fp)

    def _consider(other: dict[str, Any] | None, etype: str) -> None:
        if other is None:
            return
        fp = other.get("filePath")
        if not isinstance(fp, str) or not fp:
            return
        if not _is_test_path(fp, test_discovery):
            return
        _add(fp)
        if isinstance(edge_types_used, set):
            edge_types_used.add(etype)

    for sp in source_paths:
        file_node = _file_node_for_path(idx, sp)
        if not file_node:
            continue
        nid = file_node.get("id")
        if not isinstance(nid, str):
            continue
        for edge in idx["edges_from"].get(nid, []):
            etype = edge.get("type")
            if etype not in allowed:
                continue
            _consider(idx["nodes_by_id"].get(edge.get("target") or ""), etype)
        for edge in idx["edges_to"].get(nid, []):
            etype = edge.get("type")
            if etype not in allowed:
                continue
            _consider(idx["nodes_by_id"].get(edge.get("source") or ""), etype)
    return out


# ---------------------------------------------------------------------------
# Memory + risk overlays
# ---------------------------------------------------------------------------


def _glob_to_regex(pattern: str) -> re.Pattern[str]:
    """Translate a POSIX-style glob to a regex.

    Honours ``**`` as a zero-or-more path-segment wildcard. Plain ``*`` and
    ``?`` match within a single segment (do not cross ``/``). Anchored to the
    full string.
    """
    out: list[str] = []
    i = 0
    n = len(pattern)
    while i < n:
        if pattern[i : i + 3] == "**/":
            out.append("(?:.*/)?")
            i += 3
        elif pattern[i : i + 3] == "/**" and (i + 3 == n or pattern[i + 3] == "/"):
            out.append("(?:/.*)?")
            i += 3
        elif pattern[i : i + 2] == "**":
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def _glob_match(pattern: str, path: str) -> bool:
    try:
        return _glob_to_regex(pattern).match(path) is not None
    except re.error:
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


def _risk_tags_from_keywords(
    task_tokens: set[str],
    high_risk_patterns: list[dict[str, Any]],
) -> set[str]:
    """Risk tags from per-block ``keywords`` overlap with task tokens."""
    tags: set[str] = set()
    for block in high_risk_patterns:
        kws = block.get("keywords")
        if not isinstance(kws, list) or not kws:
            continue
        block_tags = block.get("tags") or []
        for kw in kws:
            if isinstance(kw, str) and kw.lower() in task_tokens:
                for t in block_tags:
                    if isinstance(t, str):
                        tags.add(t)
                break
    return tags


def _subsystem_for_path(
    path: str,
    valid_subsystems: set[str],
    roots: dict[str, str] | None = None,
) -> str | None:
    """Best-effort top-level subsystem mapping from a repo-relative path.

    The head-folder map comes from ``subsystem_path_roots`` in
    ``agentic.json`` when present; otherwise it falls back to a curated
    default that covers SimTalk's pnpm-workspace layout.
    """
    pp = PurePosixPath(path)
    if not pp.parts:
        return None
    head = pp.parts[0]
    mapping = roots if isinstance(roots, dict) and roots else DEFAULT_SUBSYSTEM_PATH_ROOTS
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
    task_tokens: set[str],
    subsystem_keywords: dict[str, list[str]],
    vocab: set[str] | None = None,
) -> set[str]:
    """Subsystems whose configured keywords appear (with word forms) in task."""
    expanded = _expanded_task_tokens(task_tokens, vocab)
    out: set[str] = set()
    for sub, kws in subsystem_keywords.items():
        for kw in kws:
            parts = _tokenize(kw)
            if parts and all(p in expanded for p in parts):
                out.add(sub)
                break
    return out


def _is_test_path(path: str, test_discovery: list[str]) -> bool:
    """Decide if a repo-relative path looks like a test file.

    Rejects files with documented non-test extensions (``.json``, ``.yml``,
    ``.yaml``, ``.md``) even if they happen to match a ``*.test.*`` glob —
    this is the regression-driver for the ``tsconfig.test.json`` case.
    """
    suffix = PurePosixPath(path).suffix.lower()
    if suffix in NON_TEST_EXTENSIONS:
        return False
    if test_discovery:
        return any(_glob_match(pat, path) for pat in test_discovery)
    return path.startswith("tests/") or "/tests/" in path or "/test_" in path


def _related_tests_for(
    selected_paths: list[str],
    test_discovery: list[str],
    *,
    cap: int = 10,
    dropped: list[str] | None = None,
) -> list[str]:
    """Walk-based test discovery (graph-unavailable fallback).

    For each non-test selected source path, find tests whose stem contains
    the source stem. Caps output at ``cap`` (default 10) for parity with
    the historical behaviour. Returns repo-relative POSIX paths.

    ``dropped`` (optional) collects glob-matched paths that were rejected
    by ``_is_test_path`` (e.g. ``tsconfig.test.json``) so ``--explain``
    can show why a candidate didn't make it through.
    """
    stems: set[str] = set()
    selected_set = set(selected_paths)
    for p in selected_paths:
        if _is_test_path(p, test_discovery):
            continue
        stems.add(PurePosixPath(p).stem.lower())
    if not stems:
        return []

    out: list[str] = []

    def _consider(rel: str) -> bool:
        if rel in selected_set or rel in out:
            return False
        if test_discovery and any(_glob_match(pat, rel) for pat in test_discovery):
            if not _is_test_path(rel, test_discovery):
                if isinstance(dropped, list) and rel not in dropped:
                    dropped.append(rel)
                return False
        else:
            if not _is_test_path(rel, test_discovery):
                return False
        base = PurePosixPath(rel).stem.lower()
        if not any(stem in base for stem in stems):
            return False
        out.append(rel)
        return len(out) >= cap

    if test_discovery:
        for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
            rel_dir = Path(dirpath).relative_to(REPO_ROOT).as_posix()
            if rel_dir.startswith(".") and rel_dir not in {".", ".github"}:
                dirnames[:] = []
                continue
            dirnames[:] = sorted(
                d
                for d in dirnames
                if d not in PRUNED_SCAN_DIRS and not d.endswith(".egg-info")
            )
            for fn in sorted(filenames):
                rel = (Path(dirpath) / fn).relative_to(REPO_ROOT).as_posix()
                if _consider(rel):
                    return out
        return out

    test_root = REPO_ROOT / "tests"
    if test_root.is_dir():
        for path in test_root.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(REPO_ROOT).as_posix()
            if _consider(rel):
                return out
    return out


# ---------------------------------------------------------------------------
# Lessons
# ---------------------------------------------------------------------------


def _slugify(heading: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", heading.lower()).strip("-")
    return s


def _inject_lessons(
    task_tokens: set[str], expanded_tokens: set[str]
) -> tuple[list[str], dict[str, list[str]]]:
    """Find lesson files whose ``##`` headings overlap task tokens.

    Returns ``(lesson_files, matches_by_path)`` where ``lesson_files`` is
    the deduplicated list of paths to read, and ``matches_by_path`` maps
    each path to the list of matching heading slugs. Slugs are exposed in
    ``--explain`` so the reader can jump to the relevant decision quickly.
    """
    matches: dict[str, list[str]] = {}
    if not LESSONS_DIR.is_dir():
        return [], matches

    for filename in ("decisions.md", "incidents.md"):
        path = LESSONS_DIR / filename
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()
        for line in text.splitlines():
            if not line.startswith("## "):
                continue
            heading = line[3:].strip()
            heading_tokens = _tokenize(heading)
            if not heading_tokens:
                continue
            if heading_tokens & expanded_tokens or heading_tokens & task_tokens:
                slug = _slugify(heading)
                if slug:
                    matches.setdefault(rel, []).append(slug)

    return sorted(matches.keys()), matches


# ---------------------------------------------------------------------------
# CODEMAP fallback path (degraded mode)
# ---------------------------------------------------------------------------


def _codemap_routing(
    task_tokens: set[str],
    subsystem_keywords: dict[str, list[str]],
    valid_subsystems: set[str],
    codemap_path: Path,
    *,
    cap: int,
) -> tuple[list[str], dict[str, str], set[str]]:
    """Return (selected_paths, selection_reasons, selected_subsystems)."""
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
        if len(selected) >= cap:
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


def _filesystem_anchors(task: str, *, cap: int) -> list[str]:
    """Walk the repo for files whose path/basename appears verbatim in task.

    Short-circuits and returns ``[]`` immediately when the task contains no
    path-shaped tokens (no slashes, no ``stem.ext`` pattern). This avoids
    an unconditional full repo walk on every routing call.
    """
    if not _looks_path_shaped(task):
        return []

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
            if len(found) >= cap:
                return sorted(set(found))[:cap]
    return sorted(set(found))


# ---------------------------------------------------------------------------
# Confidence
# ---------------------------------------------------------------------------


def _compute_confidence(
    *,
    graph_available: bool,
    fallback_active: bool,
    graph_stale: bool,
    has_explicit_anchors: bool,
    selected_paths_count: int,
    related_tests_count: int,
    selected_subsystems_count: int,
) -> tuple[str, list[str]]:
    """Compute the confidence level and any hard stop conditions.

    No-test-found is deliberately NOT a stop when the route is graph-driven
    and has produced paths — the caller can still proceed by reading the
    selected sources. It becomes an ``unknowns`` entry in main().
    """
    stops: list[str] = []
    if selected_paths_count == 0:
        stops.append("No paths matched the task; refine the task string or supply a file anchor.")
        return "low", stops

    if has_explicit_anchors:
        level = "high" if related_tests_count > 0 else "medium"
    elif graph_available and selected_paths_count > 0:
        level = "medium"
    else:
        level = "low"
        stops.append("Graph not available and no explicit anchors; confirm scope before implementing.")

    if selected_subsystems_count >= 3 and not has_explicit_anchors:
        stops.append("Task spans multiple subsystems; confirm primary subsystem before implementing.")
        if level != "low":
            level = "low"

    if fallback_active and level != "low":
        level = "medium" if level == "high" else "low"

    if graph_stale and level != "low":
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

    if not CONFIG_PATH.is_file():
        _die(
            f"must run from repo root; expected {CONFIG_PATH.relative_to(REPO_ROOT) if CONFIG_PATH.is_relative_to(REPO_ROOT) else CONFIG_PATH} under CWD ({REPO_ROOT})"
        )

    cfg = _load_json(CONFIG_PATH)
    graph_block = cfg.get("graph") or {}
    graph_path_str = graph_block.get("path")
    graph_required = bool(graph_block.get("required", True))
    graph_fallback = graph_block.get("fallback") or "none"
    dep_edge_types = _string_list_or_default(
        graph_block.get("dependency_edge_types"), DEFAULT_DEPENDENCY_EDGE_TYPES
    )
    test_edge_types = _string_list_or_default(
        graph_block.get("test_edge_types"), DEFAULT_TEST_EDGE_TYPES
    )
    dep_fanout = _positive_int_or_default(
        graph_block.get("dependency_fanout"), DEFAULT_DEPENDENCY_FANOUT
    )

    routing_block = cfg.get("routing") or {}
    budgets = {**DEFAULT_BUDGETS, **(routing_block.get("budgets") or {})}
    hard_cap = routing_block.get("hard_cap") or DEFAULT_HARD_CAP
    if not isinstance(hard_cap, int) or hard_cap <= 0:
        hard_cap = DEFAULT_HARD_CAP
    min_score_with_anchors = routing_block.get(
        "min_search_score_with_anchors", DEFAULT_MIN_SEARCH_SCORE_WITH_ANCHORS
    )
    if not isinstance(min_score_with_anchors, int):
        min_score_with_anchors = DEFAULT_MIN_SEARCH_SCORE_WITH_ANCHORS

    subsystem_path_roots = cfg.get("subsystem_path_roots") or DEFAULT_SUBSYSTEM_PATH_ROOTS
    fallback_artifact = REPO_ROOT / ".agentic" / "CODEMAP.json"

    subsystem_keywords: dict[str, list[str]] = cfg.get("subsystem_keywords") or {}
    test_discovery: list[str] = cfg.get("test_discovery") or []
    high_risk_patterns: list[dict[str, Any]] = cfg.get("high_risk_patterns") or []
    freshness_rules = cfg.get("freshness_rules") or {}
    graph_max_age_hours = freshness_rules.get("graph_max_age_hours")

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

    # ---- Freshness --------------------------------------------------------
    graph_age_hours: float | None = None
    graph_stale = False
    if graph_available and graph_path is not None:
        try:
            mtime = graph_path.stat().st_mtime
            age_seconds = _dt.datetime.now(_dt.timezone.utc).timestamp() - mtime
            graph_age_hours = round(age_seconds / 3600.0, 1)
        except OSError:
            graph_age_hours = None
        if (
            isinstance(graph_max_age_hours, (int, float))
            and graph_age_hours is not None
            and graph_age_hours > float(graph_max_age_hours)
        ):
            graph_stale = True

    # ---- Tokenisation -----------------------------------------------------
    task_tokens = _tokenize(task)

    idx: dict[str, Any] | None = _index_graph(graph) if graph_available and graph is not None else None
    vocab = _graph_vocab(idx) if idx is not None else None
    expanded_tokens = _expanded_task_tokens(task_tokens, vocab)

    # ---- Selection state --------------------------------------------------
    selected_paths: list[str] = []
    selected_tests: list[str] = []
    selection_reasons: dict[str, str] = {}
    graph_node_summaries: list[dict[str, Any]] = []
    dependency_paths: list[str] = []
    selected_subsystems: set[str] = set()
    has_explicit_anchors = False
    edge_types_used: set[str] = set()
    stage_usage = {k: 0 for k in budgets.keys()}
    rejected_nodes: list[dict[str, Any]] = []
    dropped_test_candidates: list[str] = []

    def _add_path(path: str, reason: str, stage: str) -> bool:
        """Append ``path`` to ``selected_paths`` (or ``selected_tests``).

        Returns True when added, False when rejected by the hard cap or the
        stage budget. Test files (per ``_is_test_path``) flow into
        ``selected_tests`` so the caller can keep evidence distinct from
        peripheral code.
        """
        if not path or path in selection_reasons:
            return False
        total = len(selected_paths) + len(selected_tests)
        if total >= hard_cap:
            return False
        stage_budget = budgets.get(stage)
        if isinstance(stage_budget, int) and stage_usage.get(stage, 0) >= stage_budget:
            return False
        if _is_test_path(path, test_discovery):
            selected_tests.append(path)
        else:
            selected_paths.append(path)
        selection_reasons[path] = reason
        stage_usage[stage] = stage_usage.get(stage, 0) + 1
        sub = _subsystem_for_path(path, valid_subsystems, subsystem_path_roots)
        if sub:
            selected_subsystems.add(sub)
        return True

    def _push_graph_node(summary: dict[str, Any]) -> None:
        """Add to ``graph_node_summaries`` with file/symbol dedupe.

        When a node summary for the same ``filePath`` is already present,
        prefer the one carrying a ``lineRange`` (symbol-level) over the
        bare file node. Frees slots for more breadth in the bundle.
        """
        fp = summary.get("filePath")
        for i, existing in enumerate(graph_node_summaries):
            if existing.get("filePath") != fp:
                continue
            existing_lr = existing.get("lineRange")
            new_lr = summary.get("lineRange")
            if new_lr and not existing_lr:
                graph_node_summaries[i] = summary
            return
        if len(graph_node_summaries) < MAX_GRAPH_NODES_RETURNED:
            graph_node_summaries.append(summary)

    # ---- Stage 1: filesystem anchors (path-shaped tokens only) ------------
    fs_anchor_paths = _filesystem_anchors(task, cap=budgets.get("anchors", DEFAULT_BUDGETS["anchors"]))
    for p in fs_anchor_paths:
        if _add_path(p, "user-named filesystem path", "anchors"):
            has_explicit_anchors = True

    # ---- Stage 2 & 3: graph anchors + dependency expansion ----------------
    if idx is not None:
        anchors = _explicit_anchors_from_graph(task, idx)
        for node, reason in anchors:
            fp = node.get("filePath")
            if isinstance(fp, str) and fp:
                if _add_path(fp, reason, "anchors"):
                    has_explicit_anchors = True
                _push_graph_node(
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

        for node, _ in anchors:
            deps = _expand_dependencies(
                idx,
                node,
                edge_types=dep_edge_types,
                fanout=dep_fanout,
                edge_types_used=edge_types_used,
            )
            for dep_path, dep_reason in deps:
                if dep_path not in selection_reasons:
                    dependency_paths.append(dep_path)
                _add_path(dep_path, dep_reason, "deps")

        # ---- Stage 4: graph search ---------------------------------------
        if expanded_tokens:
            anchored_ids = {n["id"] for n in graph_node_summaries if n.get("id")}
            scored: list[tuple[int, dict[str, Any], list[str]]] = []
            for node in idx["nodes"]:
                if node.get("id") in anchored_ids:
                    continue
                score, parts = _node_score(node, task_tokens, expanded_tokens)
                if score > 0:
                    scored.append((score, node, parts))
            scored.sort(key=lambda t: (-t[0], str(t[1].get("filePath") or "")))
            for score, node, parts in scored:
                fp = node.get("filePath")
                summary = {
                    "id": node.get("id"),
                    "type": node.get("type"),
                    "name": node.get("name"),
                    "filePath": fp,
                    "tags": node.get("tags") or [],
                    "lineRange": node.get("lineRange"),
                    "score": score,
                }
                if not isinstance(fp, str) or not fp:
                    if len(rejected_nodes) < MAX_REJECTED_NODES_RETURNED:
                        rejected_nodes.append({**summary, "reason": "non_file_node"})
                    continue
                if has_explicit_anchors and score < min_score_with_anchors:
                    if len(rejected_nodes) < MAX_REJECTED_NODES_RETURNED:
                        rejected_nodes.append({**summary, "reason": "below_floor"})
                    continue
                if fp in selection_reasons:
                    if len(rejected_nodes) < MAX_REJECTED_NODES_RETURNED:
                        rejected_nodes.append({**summary, "reason": "duplicate_path"})
                    continue
                reason = "graph search: " + ", ".join(parts) if parts else "graph search"
                added = _add_path(fp, reason, "search")
                if not added:
                    if len(rejected_nodes) < MAX_REJECTED_NODES_RETURNED:
                        rejected_nodes.append({**summary, "reason": "cap"})
                    continue
                _push_graph_node({**summary, "reason": reason})

    elif fallback_active:
        codemap_paths, codemap_reasons, codemap_subs = _codemap_routing(
            task_tokens,
            subsystem_keywords,
            valid_subsystems,
            fallback_artifact,
            cap=hard_cap,
        )
        for p in codemap_paths:
            _add_path(p, codemap_reasons.get(p, "codemap fallback"), "search")
        selected_subsystems |= codemap_subs

    # ---- Stage 5: related tests (graph-edge preferred, fs-walk fallback)
    # The same cap applies to both branches so the bundle's
    # ``related_tests`` length is bounded by the configured test budget
    # regardless of whether discovery was graph-driven or walk-driven. This
    # matches the documented contract that ``tests`` is the bound on
    # graph-driven and walk-driven test discovery combined.
    tests_cap = budgets.get("tests", DEFAULT_BUDGETS["tests"])
    related_tests: list[str] = []
    if idx is not None:
        graph_tests = _graph_related_tests(
            idx,
            selected_paths,
            test_edge_types,
            test_discovery,
            edge_types_used=edge_types_used,
        )
        for t in graph_tests:
            if t in selection_reasons or t in related_tests:
                continue
            related_tests.append(t)
            if len(related_tests) >= tests_cap:
                break
        if not related_tests:
            related_tests = _related_tests_for(
                selected_paths,
                test_discovery,
                cap=tests_cap,
                dropped=dropped_test_candidates,
            )
    else:
        related_tests = _related_tests_for(
            selected_paths,
            test_discovery,
            cap=tests_cap,
            dropped=dropped_test_candidates,
        )

    # ---- Subsystem overlay (soft hint, additive; intersected once) --------
    selected_subsystems |= _subsystem_keyword_overlay(task_tokens, subsystem_keywords, vocab)
    selected_subsystems &= valid_subsystems

    # ---- Risk overlay -----------------------------------------------------
    risky = _risk_tags_from_keywords(task_tokens, high_risk_patterns)
    # Always also apply the curated default verbs so un-migrated configs
    # (no per-block keywords) still see verb-based risk signals.
    for verb, tags in DEFAULT_RISKY_VERBS.items():
        if verb in task_tokens:
            risky.update(tags)
    risk_tags = sorted(risky | _risk_tags_for(selected_paths, high_risk_patterns))

    # ---- Memory + subsystem + lesson files --------------------------------
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

    lesson_files, lesson_matches = _inject_lessons(task_tokens, expanded_tokens)
    # Mirror lesson paths into memory_files so consumers that only read
    # memory_files (older callers) still benefit; lesson_files remains the
    # canonical surface with per-heading slugs in --explain.
    for lf in lesson_files:
        if lf not in memory_files:
            memory_files.append(lf)

    # ---- Confidence + stops ----------------------------------------------
    confidence, stop_conditions = _compute_confidence(
        graph_available=graph_available,
        fallback_active=fallback_active,
        graph_stale=graph_stale,
        has_explicit_anchors=has_explicit_anchors,
        selected_paths_count=len(selected_paths) + len(selected_tests),
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
    if not selected_paths and not selected_tests:
        unknowns.append("No paths resolved by graph, fallback, or filesystem.")
    if (
        graph_available
        and (selected_paths or selected_tests)
        and not related_tests
    ):
        unknowns.append(
            "No related tests located; identify or add a test before non-trivial changes."
        )
    if graph_stale and graph_age_hours is not None:
        unknowns.append(
            f"Graph is {graph_age_hours} hours old; consider re-running /understand."
        )
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
        "graph_age_hours": graph_age_hours,
        "fallback_active": fallback_active,
        "selected_paths": selected_paths,
        "selected_tests": selected_tests,
        "selection_reasons": selection_reasons,
        "graph_nodes": graph_node_summaries,
        "dependency_paths": sorted(set(dependency_paths)),
        "related_tests": related_tests,
        "lesson_files": lesson_files,
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
            "graph_age_hours": graph_age_hours,
            "graph_stale": graph_stale,
            "expanded_token_count": len(expanded_tokens),
            "vocab_size": len(vocab) if vocab is not None else 0,
            "valid_subsystems": sorted(valid_subsystems),
            "stage_budgets": budgets,
            "stage_usage": stage_usage,
            "hard_cap": hard_cap,
            "edge_types_used": sorted(edge_types_used),
            "dependency_edge_types_allowed": list(dep_edge_types),
            "test_edge_types_allowed": list(test_edge_types),
            "min_search_score_with_anchors": min_score_with_anchors,
            "rejected_nodes": rejected_nodes,
            "dropped_test_candidates": dropped_test_candidates,
            "lesson_matches": lesson_matches,
        }

    CONTEXT_OUT.parent.mkdir(parents=True, exist_ok=True)
    CONTEXT_OUT.write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf-8")
    json.dump(bundle, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
