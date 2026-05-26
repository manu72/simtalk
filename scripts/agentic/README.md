# scripts/agentic

Repo-local Agentic OS v2 tooling. Python 3.10+, standard library only, idempotent. Run with the repo root as CWD.

## Scripts

- `route_task.py "<task>" [--explain]` — graph-first context router. Reads the configured graph at `agentic.json.graph.path` (default: `.understand-anything/knowledge-graph.json`), traverses imports, scores nodes by name/tag/summary/path, applies risk and subsystem overlays, and emits a JSON bundle to stdout. Cached at `.agentic/CONTEXT/last_context.json`.
- `graph_sync.py` — validates the graph artifact and refreshes the managed region of `.agentic/GRAPH_INDEX.md`. Preserves the human region byte-for-byte. Never writes graph content into Markdown.
- `validate_memory.py` — structural + freshness validator for the memory layer. Checks region markers, required files, graph (or fallback) presence, and sample inline path references. Read-only.
- `update_memory.py` — runs `graph_sync.py`, computes git-changed files since the last marker (`.agentic/CONTEXT/last_update_ref`), refreshes the managed `Memory freshness` block in `MEMORY_INDEX.md`, and prints a review summary. Never edits human regions; never fabricates lesson entries.

## Bundle contract (route_task.py)

The bundle has these keys:

```text
task, generated_at, confidence, graph_available, graph_source, fallback_active,
selected_paths, selection_reasons, graph_nodes, dependency_paths, related_tests,
subsystem_files, memory_files, selected_subsystems, risk_tags, unknowns,
stop_conditions
```

`confidence` is `high` | `medium` | `low`. `selection_reasons` is a `path → reason` map. `graph_nodes` carries up to 15 typed nodes (file/function/class/config/document/pipeline) with line ranges and tags.

## Fallback behaviour

If `agentic.json.graph.path` is missing or unparseable AND `graph.fallback == "codemap"` AND `.agentic/CODEMAP.json` exists, the router degrades to keyword-scored CODEMAP routing and sets `fallback_active: true`. Confidence is automatically demoted by one level.

If the graph is required (`graph.required: true`) and neither graph nor fallback is usable, the bundle adds a stop condition rather than crashing — the caller still gets a usable shape.

## Tests

`test_smoke.py` runs end-to-end against the live repo. From the repo root:

```bash
python3 -m unittest discover -s scripts/agentic -p 'test_*.py'
```

## Safety

These scripts only modify files inside `.agentic/CONTEXT/`, `.agentic/GRAPH_INDEX.md` (managed region only), and `.agentic/MEMORY_INDEX.md` (managed region only). They never touch product code, human regions of memory files, or anything outside `.agentic/`.
