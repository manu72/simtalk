# scripts/agentic

Repo-local Agentic OS v2 tooling. Python 3.10+, standard library only, idempotent. Run with the repo root as CWD.

## Scripts

- `route_task.py "<task>" [--explain]` — graph-first context router. Reads the configured graph at `agentic.json.graph.path` (default: `.understand-anything/knowledge-graph.json`), walks anchors → dependencies → search → tests, layers in memory/subsystem/lesson overlays, and emits a JSON bundle to stdout. Cached at `.agentic/CONTEXT/last_context.json`.
- `graph_sync.py` — validates the graph artifact and refreshes the managed region of `.agentic/GRAPH_INDEX.md`. Preserves the human region byte-for-byte. Never writes graph content into Markdown.
- `validate_memory.py` — structural + freshness validator for the memory layer. Checks region markers, required files, graph (or fallback) presence, and sample inline path references. Read-only.
- `update_memory.py` — runs `graph_sync.py`, computes git-changed files since the last marker (`.agentic/CONTEXT/last_update_ref`), refreshes the managed `Memory freshness` block in `MEMORY_INDEX.md`, and prints a review summary. Never edits human regions; never fabricates lesson entries.

## Bundle contract (`route_task.py`)

Top-level keys (all present on every run):

```text
task, generated_at, confidence, graph_available, graph_source, graph_age_hours,
fallback_active, selected_paths, selected_tests, selection_reasons, graph_nodes,
dependency_paths, related_tests, lesson_files, subsystem_files, memory_files,
selected_subsystems, risk_tags, unknowns, stop_conditions
```

Notes:

- `confidence` is `high` | `medium` | `low`.
- `selected_paths` carries source/config/doc files; `selected_tests` carries test files (split from `selected_paths` so consumers don't have to infer kind).
- `selection_reasons` is a `path → reason` map covering both lists.
- `graph_nodes` carries up to 15 typed nodes, deduplicated per `filePath` (symbol-level entries with a `lineRange` are preferred over the bare file node).
- `lesson_files` lists `.agentic/LESSONS/*.md` files whose `##` headings overlap the task tokens. These paths are also mirrored into `memory_files` for backward compatibility.
- `graph_age_hours` is the mtime age of the graph artifact; `null` when no graph is loaded.

## Routing pipeline

```text
filesystem anchors (path-shaped tokens only)
  → graph anchors (file / symbol / config / document)
  → dependency expansion (configurable edge types)
  → graph search (score floor when at least one anchor is resolved)
  → related tests (graph-edge driven; fs-walk fallback)
  → lessons injection (decisions.md / incidents.md headings)
  → memory + subsystem overlays
  → risk overlay (per-block keywords + curated verb defaults)
  → freshness check
  → confidence + stop conditions
```

Explicit user-named evidence always overrides heuristic routing.

## Stage budgets

Routing uses per-stage budgets under a single hard cap. Defaults:

```json
{
  "routing": {
    "budgets": { "anchors": 6, "deps": 4, "search": 6, "tests": 4 },
    "hard_cap": 12,
    "min_search_score_with_anchors": 3
  }
}
```

- `anchors` runs first; explicit user-named paths can't be crowded out by later stages.
- `deps` runs after anchors regardless of search outcome, so dependency expansion is not starved by a search-heavy task.
- `search` is gated by `min_search_score_with_anchors` once at least one anchor exists, suppressing trailing noise.
- `tests` is the bound on graph-driven and walk-driven test discovery combined.

## Configurable edge types

```json
{
  "graph": {
    "dependency_edge_types": ["imports", "calls", "depends_on", "references"],
    "test_edge_types": ["tested_by", "tests"],
    "dependency_fanout": 4
  }
}
```

`dependency_edge_types` controls which graph edges flow into `dependency_paths`. `test_edge_types` controls which edges flow into `related_tests`. `dependency_fanout` caps neighbours per direction so a hub file can't dominate the bundle.

Defaults match Understand Anything's vocabulary (`tested_by`, not `tests`).

## Risk overlay

Each `high_risk_patterns` block may declare `"keywords": ["..."]`. When task tokens overlap a block's keywords, that block's tags are added to `risk_tags`. The curated verb dictionary inside `route_task.py` (`migrate`, `deploy`, `secret`, ...) remains as an additive fallback so risk signalling does not regress on un-migrated configs.

```json
{
  "high_risk_patterns": [
    {
      "match": "**/auth/**",
      "tags": ["security", "authn"],
      "keywords": ["auth", "login", "authn", "authz"]
    }
  ]
}
```

## Subsystem inference

```json
{
  "subsystem_path_roots": {
    "frontend": "web",
    "backend": "api",
    "shared": "shared",
    "tests": "tests",
    ".github": "infra",
    "api": "api"
  }
}
```

Move repo-specific path-root → subsystem mappings here. The script ships SimTalk-shaped defaults when the key is absent.

## Freshness

Graph age (`graph_age_hours`) is compared to `freshness_rules.graph_max_age_hours` (default 168). When stale:

- An entry is added to `unknowns` (`"Graph is N hours old; consider re-running /understand."`).
- Confidence is downgraded by one level (mirroring `fallback_active`).

## `--explain` output

`--explain` adds an `_explain` block to the bundle for diagnosing why a file did or didn't make it into the route. Keys:

- `stage_budgets`, `stage_usage`, `hard_cap` — configured budgets and how many slots each stage used.
- `edge_types_used` — the set of edge types actually traversed in this run.
- `dependency_edge_types_allowed`, `test_edge_types_allowed` — the configured allowlists.
- `min_search_score_with_anchors` — the active score floor.
- `rejected_nodes` — up to 10 graph nodes that scored > 0 but were not selected, with `{id, name, filePath, score, reason}` where reason is `cap`, `below_floor`, `duplicate_path`, or `non_file_node`. This is the primary diagnostic when an expected file is missing.
- `dropped_test_candidates` — paths that matched a `test_discovery` glob but were rejected by `_is_test_path` (e.g. `tsconfig.test.json`).
- `lesson_matches` — `path → [heading_slug, ...]` for surfaced lessons.
- `graph_age_hours`, `graph_stale`, `expanded_token_count`, `vocab_size`, `valid_subsystems`, `graph_required`, `graph_fallback` — additional context.

## Fallback behaviour

If `agentic.json.graph.path` is missing or unparseable AND `graph.fallback == "codemap"` AND `.agentic/CODEMAP.json` exists, the router degrades to keyword-scored CODEMAP routing and sets `fallback_active: true`. Confidence is automatically demoted by one level.

If the graph is required (`graph.required: true`) and neither graph nor fallback is usable, the bundle adds a stop condition rather than crashing — the caller still gets a usable shape.

## Tests

End-to-end smoke tests live alongside the scripts and run against the live repo state:

```bash
python3 -m unittest discover -s scripts/agentic -p 'test_*.py'
```

Broad unit/integration tests live under `tests/agentic/` and exercise the router against synthetic fixtures (per-stage budgets, edge-type breadth, graph-driven vs fs-walk test discovery, lessons injection, freshness, risk unification, confidence rules, schema regression):

```bash
python3 -m unittest discover -s tests/agentic -p 'test_*.py'
```

## Safety

These scripts only modify files inside `.agentic/CONTEXT/`, `.agentic/GRAPH_INDEX.md` (managed region only), and `.agentic/MEMORY_INDEX.md` (managed region only). They never touch product code, human regions of memory files, or anything outside `.agentic/`.
