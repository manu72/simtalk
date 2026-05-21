---
name: agenticOS-context
description: Compiles a focused context bundle before any coding task in a repo that has Agentic OS initialised. Runs scripts/agentic/route_task.py with the task description, reads only the files in the returned bundle, surfaces unknowns and stop conditions, and prevents wide-codebase scanning. Use before any non-trivial coding task in this repo.
---

# agenticOS-context

Runtime context routing. Do NOT bootstrap. If `.agentic/` is missing, stop and tell the user to run `agenticOS-init`.

## Workflow

1. Verify `.agentic/CONFIG/agentic.json` and `.agentic/CODEMAP.json` exist. If not, stop.
2. Run: `python3 scripts/agentic/route_task.py "<concise task description>"`.
3. Parse the JSON bundle from stdout (also at `.agentic/CONTEXT/last_context.json`).
4. Read ONLY:
   - Files listed in `selected_paths`.
   - Files listed in `subsystem_files` and `memory_files`.
5. Before writing code:
   - State the relevant invariants, do-not-do rules, and risk tags from the bundle.
   - List any `unknowns` and `stop_conditions`. If a stop condition is hit, ask the user before proceeding.
   - State the bundle `confidence`. If confidence is low, do not implement until the user confirms the route or provides more context.
6. Prefer minimal sufficient evidence. Do not expand the read set unless a specific gap blocks the task.
7. If the user explicitly names a file, path, function, endpoint, or test, treat it as a routing anchor.
   - If the route bundle includes it, proceed with that file.
   - If the route bundle omits it but the file exists, read the explicitly named file and proceed with the narrowest safe edit.
   - Report that the routing engine needs correction.
   - Do not stop merely because the route is low-confidence when the user supplied an existing file target.
8. If the bundle looks wrong (e.g. missing the obvious source-of-truth), refine the task string and re-run once; if still wrong, ask the user.

## Non-goals

- Do not modify `.agentic/` or `scripts/agentic/`.
- Do not re-scan the codebase.
- Do not update memory. That is `agenticOS-update`'s job.
