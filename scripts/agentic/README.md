# scripts/agentic

Local tooling for Agentic OS.

- `build_codemap.py` — scans the repo and writes `.agentic/CODEMAP.json`.
- `route_task.py "<task>"` — emits a JSON context bundle to stdout and caches it at `.agentic/CONTEXT/last_context.json`.
- `validate_memory.py` — verifies required files exist and referenced paths resolve.
- `update_memory.py` — refreshes generated artifacts; prompts for curated updates.

Run with the repo root as CWD. Python 3.10+. Standard library only.

These scripts only modify files under `.agentic/` and `scripts/agentic/`. They never touch product code or curated memory.
