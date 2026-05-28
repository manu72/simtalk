"""Shared fixture builder for ``route_task.py`` broad tests.

Constructs a minimal but realistic Agentic OS install in a temp directory:

- ``.agentic/CONFIG/agentic.json`` with the v2 schema + optional overrides.
- ``.agentic/PROJECT_BRIEF.md``, ``.agentic/MEMORY_INDEX.md`` (managed/human
  region markers preserved for the validator).
- ``.agentic/SUBSYSTEMS/{web,api}.md`` plus README.
- ``.agentic/LESSONS/decisions.md`` (with two headings used by the lessons
  injection test) and ``incidents.md`` (empty).
- A small synthetic ``.understand-anything/knowledge-graph.json`` with file
  nodes, one symbol node, and edges of mixed types (``imports``, ``calls``,
  ``tested_by``) — enough to exercise dependency expansion and graph-driven
  test discovery without depending on the live repo graph.
- Source files (``backend/src/...``, ``frontend/src/...``) and matching test
  files under ``tests/`` so the fs-walk fallback path has something to find.

Each test imports ``build_fixture`` and calls ``build()`` inside a temp
directory.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


DEFAULT_GRAPH: dict[str, Any] = {
    "version": "1.0.0",
    "project": {"name": "fixture", "languages": ["typescript"], "frameworks": []},
    "nodes": [
        {
            "id": "file:backend/src/routes/realtime.ts",
            "type": "file",
            "name": "realtime.ts",
            "filePath": "backend/src/routes/realtime.ts",
            "tags": ["route", "realtime", "security"],
            "summary": "Realtime token route on the Hono backend",
        },
        {
            "id": "function:backend/src/routes/realtime.ts:createRoute",
            "type": "function",
            "name": "createRealtimeRoute",
            "filePath": "backend/src/routes/realtime.ts",
            "tags": ["factory", "route"],
            "summary": "Builds the realtime token route handler",
            "lineRange": [12, 48],
        },
        {
            "id": "file:backend/src/services/openAiRealtime.ts",
            "type": "file",
            "name": "openAiRealtime.ts",
            "filePath": "backend/src/services/openAiRealtime.ts",
            "tags": ["service", "openai", "secrets"],
            "summary": "Mints ephemeral OpenAI realtime client secrets",
        },
        {
            "id": "file:backend/src/middleware/cors.ts",
            "type": "file",
            "name": "cors.ts",
            "filePath": "backend/src/middleware/cors.ts",
            "tags": ["middleware", "cors", "security"],
            "summary": "CORS middleware factory",
        },
        {
            "id": "file:frontend/src/realtimeTokenClient.ts",
            "type": "file",
            "name": "realtimeTokenClient.ts",
            "filePath": "frontend/src/realtimeTokenClient.ts",
            "tags": ["frontend", "client", "realtime"],
            "summary": "Frontend client that requests realtime tokens",
        },
        {
            "id": "file:shared/types/src/index.ts",
            "type": "file",
            "name": "index.ts",
            "filePath": "shared/types/src/index.ts",
            "tags": ["shared", "zod", "contract"],
            "summary": "Cross-boundary Zod contracts",
        },
        {
            "id": "file:tests/backend/unit/realtime.test.ts",
            "type": "file",
            "name": "realtime.test.ts",
            "filePath": "tests/backend/unit/realtime.test.ts",
            "tags": ["test", "backend", "unit"],
            "summary": "Unit test for the realtime route",
        },
        {
            "id": "file:tests/backend/unit/openAiRealtime.test.ts",
            "type": "file",
            "name": "openAiRealtime.test.ts",
            "filePath": "tests/backend/unit/openAiRealtime.test.ts",
            "tags": ["test", "backend", "unit"],
            "summary": "Unit test for the OpenAI realtime service",
        },
    ],
    "edges": [
        {
            "source": "file:backend/src/routes/realtime.ts",
            "target": "file:backend/src/services/openAiRealtime.ts",
            "type": "imports",
            "direction": "forward",
            "weight": 1,
        },
        {
            "source": "file:backend/src/routes/realtime.ts",
            "target": "file:shared/types/src/index.ts",
            "type": "imports",
            "direction": "forward",
            "weight": 1,
        },
        {
            "source": "file:backend/src/routes/realtime.ts",
            "target": "file:backend/src/middleware/cors.ts",
            "type": "calls",
            "direction": "forward",
            "weight": 1,
        },
        {
            "source": "file:backend/src/routes/realtime.ts",
            "target": "file:tests/backend/unit/realtime.test.ts",
            "type": "tested_by",
            "direction": "forward",
            "weight": 1,
        },
        {
            "source": "file:backend/src/services/openAiRealtime.ts",
            "target": "file:tests/backend/unit/openAiRealtime.test.ts",
            "type": "tested_by",
            "direction": "forward",
            "weight": 1,
        },
        {
            "source": "file:frontend/src/realtimeTokenClient.ts",
            "target": "file:shared/types/src/index.ts",
            "type": "imports",
            "direction": "forward",
            "weight": 1,
        },
    ],
}

DEFAULT_DECISIONS = """# Decisions

## 2026-05-20 — Build Phase 1 as a private single-device web app

- Context: ...
- Decision: ...

## 2026-05-27 — Add backend-brokered image translation

- Context: photo translation needs server brokering
- Decision: add POST /image-translate/translate route
"""

DEFAULT_PROJECT_BRIEF = """<!-- agentic:managed:start -->
# Project brief

Fixture project for route_task tests.

<!-- agentic:managed:end -->

<!-- human:notes:start -->
Human notes go here.
<!-- human:notes:end -->
"""

DEFAULT_MEMORY_INDEX = """<!-- agentic:managed:start -->
# Memory index

## Subsystems

- `SUBSYSTEMS/web.md`
- `SUBSYSTEMS/api.md`

<!-- agentic:managed:end -->

<!-- human:notes:start -->
Routing hints live here.
<!-- human:notes:end -->
"""


def _subsystem_template(name: str) -> str:
    return (
        "<!-- agentic:managed:start -->\n"
        f"# {name}\n\n"
        "Fixture subsystem.\n"
        "<!-- agentic:managed:end -->\n\n"
        "<!-- human:notes:start -->\n"
        "Human notes.\n"
        "<!-- human:notes:end -->\n"
    )


def _make_config(
    *,
    graph_path: str = ".understand-anything/knowledge-graph.json",
    graph_required: bool = True,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg: dict[str, Any] = {
        "version": 2,
        "graph": {
            "provider": "understand-anything",
            "path": graph_path,
            "required": graph_required,
            "fallback": "codemap",
        },
        "paths": {
            "memory_root": ".agentic",
            "scripts_root": "scripts/agentic",
            "context_cache": ".agentic/CONTEXT/last_context.json",
        },
        "freshness_rules": {"graph_max_age_hours": 168, "memory_max_age_days": 30},
        "validation": {"require_region_markers": True, "sample_path_check_count": 5},
        "ignore_globs": [],
        "test_discovery": [
            "**/tests/**",
            "**/*.test.*",
            "**/*.spec.*",
        ],
        "high_risk_patterns": [
            {
                "match": "**/auth/**",
                "tags": ["security", "authn"],
                "keywords": ["auth", "login"],
            },
            {"match": "**/realtime/**", "tags": ["realtime", "latency"]},
        ],
        "subsystem_keywords": {
            "web": ["frontend", "react", "ui"],
            "api": ["backend", "route", "token", "hono"],
            "shared": ["shared", "types", "contract"],
            "tests": ["test", "vitest", "playwright"],
        },
    }
    if extra:
        for k, v in extra.items():
            if k in cfg and isinstance(cfg[k], dict) and isinstance(v, dict):
                cfg[k] = {**cfg[k], **v}
            else:
                cfg[k] = v
    return cfg


def build(
    root: Path,
    *,
    graph: dict[str, Any] | None = None,
    graph_mtime_age_hours: float | None = None,
    graph_path: str = ".understand-anything/knowledge-graph.json",
    config_extra: dict[str, Any] | None = None,
    decisions: str = DEFAULT_DECISIONS,
    include_source_files: bool = True,
) -> Path:
    """Materialise the fixture under ``root`` and return ``root``.

    ``graph_mtime_age_hours``: when set, backdates the graph file's mtime so
    freshness tests can flag it as stale.
    ``include_source_files``: when True (default), writes empty stub files
    for every ``filePath`` in the graph plus the project's source/test files
    used by the fs-walk fallback path.
    """
    if graph is None:
        graph = json.loads(json.dumps(DEFAULT_GRAPH))

    _write(root / ".agentic" / "CONFIG" / "agentic.json", json.dumps(
        _make_config(graph_path=graph_path, extra=config_extra), indent=2
    ))
    _write(root / ".agentic" / "PROJECT_BRIEF.md", DEFAULT_PROJECT_BRIEF)
    _write(root / ".agentic" / "MEMORY_INDEX.md", DEFAULT_MEMORY_INDEX)
    _write(root / ".agentic" / "SUBSYSTEMS" / "README.md", "# Subsystems index\n")
    _write(root / ".agentic" / "SUBSYSTEMS" / "web.md", _subsystem_template("web"))
    _write(root / ".agentic" / "SUBSYSTEMS" / "api.md", _subsystem_template("api"))
    _write(root / ".agentic" / "LESSONS" / "decisions.md", decisions)
    _write(root / ".agentic" / "LESSONS" / "incidents.md", "# Incidents\n")

    graph_file = root / graph_path
    _write(graph_file, json.dumps(graph, indent=2))

    if include_source_files:
        seen: set[str] = set()
        for node in graph.get("nodes", []):
            fp = node.get("filePath")
            if isinstance(fp, str) and fp and fp not in seen:
                seen.add(fp)
                _write(root / fp, "")
        # A noisy tsconfig.test.json that would falsely match *.test.* under
        # the legacy logic. The fixture exercises the NON_TEST_EXTENSIONS
        # rejection. Located outside ``tests/`` so it doesn't get matched by
        # **/tests/**.
        _write(root / "backend" / "tsconfig.test.json", "{}")

    if graph_mtime_age_hours is not None:
        # Backdate mtime so freshness rules trigger.
        old = time.time() - (graph_mtime_age_hours * 3600.0)
        os.utime(graph_file, (old, old))

    return root
