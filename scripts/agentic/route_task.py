#!/usr/bin/env python3
"""Compile a focused context bundle for a coding task.

Usage:
    python scripts/agentic/route_task.py "<task description>"

Reads .agentic/CODEMAP.json and .agentic/CONFIG/agentic.json, scores entries
against the task description, and emits a JSON bundle to stdout. Also writes
the bundle to .agentic/CONTEXT/last_context.json.

Standard library only. Idempotent.
"""

from __future__ import annotations

import datetime as _dt
import json
import re
import sys
from pathlib import Path
from typing import Any

CONFIG_PATH = Path(".agentic/CONFIG/agentic.json")
CODEMAP_PATH = Path(".agentic/CODEMAP.json")
MEMORY_INDEX_PATH = Path(".agentic/MEMORY_INDEX.md")
SUBSYSTEMS_DIR = Path(".agentic/SUBSYSTEMS")
PROJECT_BRIEF_PATH = Path(".agentic/PROJECT_BRIEF.md")
CONTEXT_OUT = Path(".agentic/CONTEXT/last_context.json")

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

MAX_SELECTED_PATHS = 10
WORD_FORM_SUFFIXES = ("s", "es", "d", "ed", "ing", "er", "ers", "ment", "ments")
WORD_FORM_ALIASES = {
    "auth": {
        "authenticate",
        "authenticated",
        "authenticating",
        "authentication",
        "authorize",
        "authorized",
        "authorizing",
        "authorization",
    },
}


def _die(msg: str, code: int = 1) -> None:
    print(f"route_task: {msg}", file=sys.stderr)
    sys.exit(code)


def _load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        _die(f"missing {path}. Run scripts/agentic/build_codemap.py first.")
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        _die(f"invalid JSON in {path}: {exc}")
        return {}  # unreachable


def _tokenize(text: str) -> set[str]:
    return {tok for tok in re.split(r"[^a-z0-9]+", text.lower()) if len(tok) > 1}


def _keyword_part_matches(part: str, task_tokens: set[str]) -> bool:
    """True when a keyword appears as an exact token or supported word form."""
    if part in task_tokens:
        return True
    if WORD_FORM_ALIASES.get(part, set()) & task_tokens:
        return True
    word_forms = {f"{part}{suffix}" for suffix in WORD_FORM_SUFFIXES}
    return bool(word_forms & task_tokens)


def _keyword_matches_task(keyword: str, task_tokens: set[str]) -> bool:
    """True when every token in a (possibly hyphenated) keyword matches the task."""
    parts = _tokenize(keyword)
    if not parts:
        return False
    return all(_keyword_part_matches(p, task_tokens) for p in parts)


def _contains_explicit_reference(normalized_task: str, reference: str) -> bool:
    """True when a path or filename appears as its own task reference."""
    if not reference:
        return False
    boundary = r"a-z0-9_./-"
    return (
        re.search(
            rf"(?<![{boundary}]){re.escape(reference)}(?![{boundary}])",
            normalized_task,
        )
        is not None
    )


def _explicit_file_reference_matches(
    task: str, entries: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Return existing codemap file entries explicitly named by path or basename."""
    normalized_task = task.lower().replace("\\", "/")
    matches: list[dict[str, Any]] = []
    for entry in entries:
        path = entry.get("path")
        if entry.get("kind") == "dir" or not isinstance(path, str) or not path:
            continue
        normalized_path = path.replace("\\", "/")
        if not Path(normalized_path).is_file():
            continue
        basename = Path(normalized_path).name.lower()
        normalized_path_lower = normalized_path.lower()
        if _contains_explicit_reference(
            normalized_task, normalized_path_lower
        ) or _contains_explicit_reference(normalized_task, basename):
            matches.append(entry)
    return sorted(matches, key=lambda entry: str(entry.get("path", "")))


def _explicit_files_from_filesystem(task: str) -> list[str]:
    normalized_task = task.lower().replace("\\", "/")
    candidates: list[str] = []

    for path in Path(".").rglob("*"):
        if not path.is_file():
            continue

        rel = path.as_posix()
        if rel.startswith(".git/") or "node_modules/" in rel:
            continue

        rel_lower = rel.lower()
        basename = path.name.lower()

        if _contains_explicit_reference(normalized_task, rel_lower) or _contains_explicit_reference(normalized_task, basename):
            candidates.append(rel)

    return sorted(set(candidates))


def _score_entry(
    entry: dict[str, Any],
    task_tokens: set[str],
    subsystem_keywords: dict[str, list[str]],
    risky_tags: set[str],
) -> int:
    """Score an entry against the task. Boosts (source-of-truth, risky-verb)
    only apply once the entry has demonstrated baseline relevance via a
    trigger or subsystem-keyword overlap; otherwise role/risk alone would
    pull in every doc regardless of topic.
    """
    triggers = {str(t).lower() for t in entry.get("read_triggers") or []}
    token_overlap = len(task_tokens & triggers)

    subsystem = entry.get("subsystem")
    sub_overlap = 0
    if subsystem and subsystem in subsystem_keywords:
        sub_overlap = sum(
            1
            for k in subsystem_keywords[subsystem]
            if _keyword_matches_task(k, task_tokens)
        )

    score = 3 * token_overlap + 2 * sub_overlap
    has_relevance = token_overlap > 0 or sub_overlap > 0

    if has_relevance and entry.get("role") == "source-of-truth":
        score += 2

    risk_tags = {str(t).lower() for t in entry.get("risk_tags") or []}
    if has_relevance and (risky_tags & risk_tags):
        score += 4

    return score


def _select_subsystem_files(selected_subsystems: set[str]) -> list[str]:
    out: list[str] = []
    if not SUBSYSTEMS_DIR.is_dir():
        return out
    for sub in sorted(selected_subsystems):
        candidate = SUBSYSTEMS_DIR / f"{sub}.md"
        if candidate.is_file():
            out.append(str(candidate))
    return out


def _routable_entries_for_selection(
    entry: dict[str, Any], entries: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    path = entry.get("path")
    if not isinstance(path, str) or not path:
        return []
    if entry.get("kind") != "dir":
        return [entry]

    prefix = f"{path.rstrip('/')}/"
    out: list[dict[str, Any]] = []
    for candidate in entries:
        candidate_path = candidate.get("path")
        if candidate.get("kind") == "dir" or not isinstance(candidate_path, str):
            continue
        if candidate_path.startswith(prefix):
            out.append(candidate)
    return out


def _confidence(
    selected_paths: list[str],
    selected_subsystems: set[str],
    has_tests: bool,
    has_explicit_paths: bool = False,
) -> tuple[str, list[str]]:
    stops: list[str] = []
    if has_explicit_paths and selected_paths:
        if has_tests:
            return "high", []
        return "medium", []
    if not selected_paths and not selected_subsystems:
        stops.append(
            "Low routing confidence: no clear subsystem match. Confirm task scope before implementing."
        )
        return "low", stops
    if len(selected_subsystems) >= 3 and not has_explicit_paths:
        stops.append(
            "Task spans multiple subsystems. Confirm the intended primary subsystem before implementing."
        )
        return "low", stops
    if not has_tests:
        stops.append(
            "No related tests located by the codemap. Add or identify tests before non-trivial changes."
        )
        return "medium", stops
    return "high", stops


def main(argv: list[str]) -> int:
    task = " ".join(argv[1:]).strip()
    if not task:
        _die('usage: route_task.py "<task description>"', code=2)
    cfg = _load_json(CONFIG_PATH)
    codemap = _load_json(CODEMAP_PATH)
    entries: list[dict[str, Any]] = codemap.get("entries", [])

    subsystem_keywords: dict[str, list[str]] = cfg.get("subsystem_keywords", {})
    task_tokens = _tokenize(task)

    risky_tags: set[str] = set()
    for verb, tags in RISKY_VERBS.items():
        if verb in task_tokens:
            risky_tags.update(tags)

    scored: list[tuple[int, dict[str, Any]]] = []
    for e in entries:
        s = _score_entry(e, task_tokens, subsystem_keywords, risky_tags)
        if s > 0:
            scored.append((s, e))
    scored.sort(key=lambda x: (-x[0], x[1].get("path", "")))

    selected_paths: list[str] = []
    selected_subsystems: set[str] = set()
    risk_tags_present: set[str] = set()
    has_tests = False

    # Direct keyword match: pull in subsystems whose configured keywords
    # appear in the task description, regardless of whether the codemap has
    # any entries for them yet. Useful for pre-MVP repos where the SUBSYSTEMS
    # stubs are the most authoritative guidance available.
    for sub_name, kws in subsystem_keywords.items():
        if any(_keyword_matches_task(kw, task_tokens) for kw in kws):
            selected_subsystems.add(sub_name)

    # Real product subsystems are those configured in agentic.json, plus any
    # that have a corresponding SUBSYSTEMS/<name>.md stub. Anything else
    # (e.g. ".agentic", "scripts" derived from the top-level fallback) is
    # tooling/meta and must not pollute the routing surface.
    valid_subsystem_names: set[str] = set(subsystem_keywords.keys())
    if SUBSYSTEMS_DIR.is_dir():
        for p in SUBSYSTEMS_DIR.glob("*.md"):
            if p.name.lower() != "readme.md":
                valid_subsystem_names.add(p.stem)

    explicit_entries = _explicit_file_reference_matches(task, entries)
    for e in explicit_entries:
        sub = e.get("subsystem")
        if sub and sub in valid_subsystem_names:
            selected_subsystems.add(sub)
        for t in e.get("risk_tags") or []:
            risk_tags_present.add(str(t))
        if e.get("related_tests"):
            has_tests = True
        candidate_path = e.get("path")
        if isinstance(candidate_path, str) and candidate_path not in selected_paths:
            selected_paths.append(candidate_path)

    explicit_fs_paths = _explicit_files_from_filesystem(task)

    for p in explicit_fs_paths:
        if p not in selected_paths:
            selected_paths.insert(0, p)

    for _, e in scored:
        sub = e.get("subsystem")
        if sub and sub in valid_subsystem_names:
            selected_subsystems.add(sub)
        for t in e.get("risk_tags") or []:
            risk_tags_present.add(str(t))
        if e.get("related_tests"):
            has_tests = True
        for candidate in _routable_entries_for_selection(e, entries):
            candidate_sub = candidate.get("subsystem")
            if candidate_sub and candidate_sub in valid_subsystem_names:
                selected_subsystems.add(candidate_sub)
            for t in candidate.get("risk_tags") or []:
                risk_tags_present.add(str(t))
            if candidate.get("related_tests"):
                has_tests = True
            if len(selected_paths) >= MAX_SELECTED_PATHS:
                break
            candidate_path = candidate.get("path")
            if not isinstance(candidate_path, str) or candidate_path in selected_paths:
                continue
            selected_paths.append(candidate_path)

    selected_subsystems &= valid_subsystem_names

    memory_files: list[str] = []
    if PROJECT_BRIEF_PATH.is_file():
        memory_files.append(str(PROJECT_BRIEF_PATH))
    if MEMORY_INDEX_PATH.is_file():
        memory_files.append(str(MEMORY_INDEX_PATH))

    subsystem_files = _select_subsystem_files(selected_subsystems)

    has_explicit_paths = bool(explicit_entries or explicit_fs_paths)

    confidence, stop_conditions = _confidence(
        selected_paths, selected_subsystems, has_tests, has_explicit_paths
    )

    unknowns: list[str] = []
    if not entries:
        unknowns.append(
            "CODEMAP has no entries yet. Run scripts/agentic/build_codemap.py."
        )
    if not selected_paths:
        unknowns.append(
            "No code paths matched the task. The repository may be pre-MVP, or the task description is too generic."
        )
    if "openai" in task_tokens or "realtime" in task_tokens or "webrtc" in task_tokens:
        unknowns.append(
            "Realtime path is OpenAI-specific. Confirm whether changes touch backend token issuance, frontend WebRTC, or both."
        )

    bundle = {
        "task": task,
        "generated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "confidence": confidence,
        "selected_paths": selected_paths,
        "selected_subsystems": sorted(selected_subsystems),
        "subsystem_files": subsystem_files,
        "memory_files": memory_files,
        "risk_tags": sorted(risk_tags_present | risky_tags),
        "unknowns": unknowns,
        "stop_conditions": stop_conditions,
    }

    CONTEXT_OUT.parent.mkdir(parents=True, exist_ok=True)
    with CONTEXT_OUT.open("w", encoding="utf-8") as fh:
        json.dump(bundle, fh, indent=2, sort_keys=False)
        fh.write("\n")

    json.dump(bundle, sys.stdout, indent=2, sort_keys=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
