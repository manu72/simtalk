# scripts/agentic

Local tooling for Agentic OS. Python 3.10+, standard library only. Run with the repo root as CWD.

## Scripts

- `graph_sync.py` — reads the configured graph artifact (default: `.understand-anything/knowledge-graph.json`), validates it, and refreshes the managed region of `.agentic/GRAPH_INDEX.md`. Never writes graph content into Markdown. v2 (graph-aware).
- `route_task.py "<task>"` — emits a JSON context bundle to stdout and caches it at `.agentic/CONTEXT/last_context.json`. v1 (CODEMAP-aware); reads `subsystem_keywords` from `agentic.json`.
- `validate_memory.py` — verifies required memory files exist and referenced paths resolve. v1.
- `update_memory.py` — refreshes generated artifacts; prompts for curated updates. v1.
- `build_codemap.py` — legacy v1 fallback: scans the repo and writes `.agentic/CODEMAP.json`. Retained for the `codemap` fallback path; not the primary structural source under v2.

## Tests

The v1 scripts are covered by `test_*.py` files in this directory. Run with `python -m unittest discover -s scripts/agentic -p 'test_*.py'`.

## Schema

`.agentic/CONFIG/agentic.json` is at v2 (graph-first) but retains v1 keys (`subsystem_keywords`, `paths.codemap`) so the v1 routing/validation/update scripts continue to work unchanged. v2-only keys (`graph`, `freshness_rules`, `validation`) are additive.

## Safety

These scripts only modify files under `.agentic/` and `scripts/agentic/`. They never touch product code, curated memory human regions, or files outside `.agentic/`.
