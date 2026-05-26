#!/usr/bin/env python3
"""Refresh Agentic OS managed memory after a meaningful change.

Behaviour:

1. Run ``graph_sync.py`` (in-process) to refresh the managed region of
   ``GRAPH_INDEX.md``. Continue with a warning if the graph is unavailable.
2. Inspect ``git`` for files changed since the last update marker
   (``.agentic/CONTEXT/last_update_ref``). If git is unavailable, fall back to
   a no-history report.
3. Map each changed file to one or more candidate subsystems (top-level folder
   match; ``high_risk_patterns``; ``SUBSYSTEMS/<name>.md`` ownership).
4. Refresh the managed ``Memory freshness`` block in ``MEMORY_INDEX.md`` (only
   between the managed region markers; the human region is preserved
   byte-for-byte).
5. Print a review summary listing changed files, mapped subsystems, risk tags,
   graph status, and any human-region edits the user should consider applying
   manually. This script never modifies human regions automatically.

Standard library only. Idempotent. Writes only inside ``.agentic/``.
"""

from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

REPO_ROOT = Path.cwd()
CONFIG_PATH = REPO_ROOT / ".agentic" / "CONFIG" / "agentic.json"
MEMORY_INDEX_PATH = REPO_ROOT / ".agentic" / "MEMORY_INDEX.md"
SUBSYSTEMS_DIR = REPO_ROOT / ".agentic" / "SUBSYSTEMS"
LAST_REF_PATH = REPO_ROOT / ".agentic" / "CONTEXT" / "last_update_ref"
SCRIPTS_DIR = REPO_ROOT / "scripts" / "agentic"

MANAGED_START = "<!-- agentic:managed:start -->"
MANAGED_END = "<!-- agentic:managed:end -->"
FRESHNESS_HEADER = "## Memory freshness"


def _load_config() -> dict:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"update_memory: missing {CONFIG_PATH}", file=sys.stderr)
        sys.exit(2)
    except json.JSONDecodeError as exc:
        print(f"update_memory: invalid JSON in {CONFIG_PATH}: {exc}", file=sys.stderr)
        sys.exit(2)


def _run_graph_sync() -> tuple[int, str]:
    """Invoke graph_sync.py in-process so we share the working directory."""
    target = SCRIPTS_DIR / "graph_sync.py"
    if not target.is_file():
        return 1, "graph_sync.py not found"
    spec = importlib.util.spec_from_file_location("agentic_graph_sync", target)
    if spec is None or spec.loader is None:
        return 1, "could not load graph_sync.py"
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        return 1, f"graph_sync raised: {exc}"
    try:
        rc = module.main()
    except SystemExit as exc:
        rc = int(exc.code) if exc.code is not None else 0
    except Exception as exc:
        return 1, f"graph_sync.main() raised: {exc}"
    return int(rc), "ok" if rc == 0 else f"graph_sync exit {rc}"


def _git_available() -> bool:
    try:
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def _git_head() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return out.stdout.strip() or None
    except subprocess.CalledProcessError:
        return None


def _git_changed_files(since_ref: str | None) -> list[str]:
    """Return repo-relative paths changed since `since_ref` (or working tree)."""
    if since_ref:
        try:
            out = subprocess.run(
                ["git", "diff", "--name-only", f"{since_ref}..HEAD"],
                cwd=REPO_ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            committed = [line.strip() for line in out.stdout.splitlines() if line.strip()]
        except subprocess.CalledProcessError:
            committed = []
    else:
        committed = []
    try:
        out = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        working: list[str] = []
        for raw in out.stdout.splitlines():
            if not raw.strip():
                continue
            # porcelain format: "XY path" or "XY orig -> path"
            payload = raw[3:].strip()
            if "->" in payload:
                payload = payload.split("->", 1)[1].strip()
            working.append(payload)
    except subprocess.CalledProcessError:
        working = []
    seen: set[str] = set()
    out_paths: list[str] = []
    for p in committed + working:
        if p and p not in seen:
            seen.add(p)
            out_paths.append(p)
    return out_paths


def _valid_subsystems() -> set[str]:
    names: set[str] = set()
    if SUBSYSTEMS_DIR.is_dir():
        for p in SUBSYSTEMS_DIR.glob("*.md"):
            if p.name.lower() != "readme.md":
                names.add(p.stem)
    return names


def _subsystem_for(path: str, valid: set[str]) -> str | None:
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
    if sub and sub in valid:
        return sub
    return head if head in valid else None


def _glob_to_regex(pattern: str) -> re.Pattern[str]:
    """Translate a POSIX-style glob to a regex.

    Honours ``**`` as a zero-or-more path-segment wildcard so patterns like
    ``**/.env*`` match a top-level ``.env``. Plain ``*`` and ``?`` match
    within a single segment (do not cross ``/``). Anchored to the full
    string. Mirrors the translator in ``route_task.py`` so risk-overlay and
    routing behaviour stay consistent.
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
    """Match a repo-relative POSIX path against a glob with ``**`` support."""
    return _glob_to_regex(pattern).match(path) is not None


def _risk_tags_for(paths: list[str], high_risk_patterns: list[dict]) -> set[str]:
    tags: set[str] = set()
    for block in high_risk_patterns:
        pat = block.get("match")
        ts = block.get("tags") or []
        if not isinstance(pat, str) or not isinstance(ts, list):
            continue
        for p in paths:
            if _glob_match(pat, p):
                for t in ts:
                    if isinstance(t, str):
                        tags.add(t)
                break
    return tags


def _refresh_freshness_block(refreshed_files: list[str]) -> bool:
    """Refresh only the `## Memory freshness` block inside the managed region.

    Returns True when the file was rewritten.
    """
    if not MEMORY_INDEX_PATH.is_file():
        return False
    text = MEMORY_INDEX_PATH.read_text(encoding="utf-8")
    if MANAGED_START not in text or MANAGED_END not in text:
        return False
    head, _, rest = text.partition(MANAGED_START)
    managed, _, tail = rest.partition(MANAGED_END)

    iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    refresh_lines = [
        f"## Memory freshness",
        "",
        f"- Last refreshed: {iso}",
        "- Files refreshed this run: " + (", ".join(refreshed_files) if refreshed_files else "MEMORY_INDEX.md (managed region)"),
        "- Source: scripts/agentic/update_memory.py",
        "",
    ]
    new_block = "\n".join(refresh_lines)

    pattern = re.compile(r"## Memory freshness\s*\n(?:.*\n)*?(?=\n##\s|\Z)", re.MULTILINE)
    if pattern.search(managed):
        new_managed = pattern.sub(new_block, managed, count=1)
    else:
        # Append before the managed block close.
        new_managed = managed.rstrip() + "\n\n" + new_block
    new_text = head + MANAGED_START + new_managed + MANAGED_END + tail
    if new_text != text:
        MEMORY_INDEX_PATH.write_text(new_text, encoding="utf-8")
        return True
    return False


def _save_marker(ref: str | None) -> None:
    LAST_REF_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = ref or "unknown"
    LAST_REF_PATH.write_text(payload + "\n", encoding="utf-8")


def main() -> int:
    cfg = _load_config()
    valid_subs = _valid_subsystems()
    high_risk = cfg.get("high_risk_patterns") or []

    # 1. Graph sync first.
    rc, status = _run_graph_sync()
    graph_status = "ok" if rc == 0 else f"warn ({status})"
    if rc != 0:
        print(f"update_memory: graph_sync warning: {status}", file=sys.stderr)

    # 2. Compute changed files.
    changed: list[str] = []
    last_ref: str | None = None
    git_ok = _git_available()
    if git_ok:
        if LAST_REF_PATH.is_file():
            stored = LAST_REF_PATH.read_text(encoding="utf-8").strip()
            if stored and stored != "unknown":
                last_ref = stored
        changed = _git_changed_files(last_ref)
    else:
        print("update_memory: git unavailable; skipping change detection", file=sys.stderr)

    sub_to_files: dict[str, list[str]] = {}
    for path in changed:
        sub = _subsystem_for(path, valid_subs)
        if sub:
            sub_to_files.setdefault(sub, []).append(path)

    risk_tags = _risk_tags_for(changed, high_risk)

    # 3. Refresh MEMORY_INDEX freshness block.
    refreshed_files = []
    if _refresh_freshness_block(changed):
        refreshed_files.append(".agentic/MEMORY_INDEX.md (managed)")

    # 4. Save marker for next run.
    head_ref = _git_head() if git_ok else None
    _save_marker(head_ref)

    # 5. Print review summary.
    iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print("agenticOS-update summary")
    print("========================")
    print(f"At: {iso}")
    print(f"Graph sync: {graph_status}")
    print(f"Last update marker: {last_ref or 'none'}")
    print(f"Current HEAD: {head_ref or 'unknown'}")
    print(f"Changed files: {len(changed)}")
    if changed:
        for p in changed[:25]:
            sub = _subsystem_for(p, valid_subs) or "-"
            print(f"  - {p} (subsystem: {sub})")
        if len(changed) > 25:
            print(f"  ... and {len(changed) - 25} more")
    print("Subsystems touched: " + (", ".join(sorted(sub_to_files)) or "none"))
    print("Risk tags: " + (", ".join(sorted(risk_tags)) or "none"))
    print("Files refreshed automatically:")
    if refreshed_files:
        for r in refreshed_files:
            print(f"  - {r}")
    else:
        print("  - none")
    print()
    print("Human regions are NEVER edited automatically. Review these files for stale content:")
    candidates: list[Path] = []
    for sub in sub_to_files:
        candidate = SUBSYSTEMS_DIR / f"{sub}.md"
        if candidate.is_file():
            candidates.append(candidate)
    if candidates:
        for c in candidates:
            print(f"  - {c.relative_to(REPO_ROOT)}")
    else:
        print("  - none flagged")
    print()
    print("If a durable architectural decision or incident occurred, append an entry to")
    print("  .agentic/LESSONS/decisions.md or .agentic/LESSONS/incidents.md")
    print("manually. This script never fabricates lesson entries.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
