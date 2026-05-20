---
name: agenticOS-update
description: Updates Agentic OS memory after durable changes - new subsystems, architectural decisions, incidents, or important lessons. Refreshes CODEMAP and prompts for curated edits without overwriting human-authored memory. Use only when a change is durable and worth remembering.
---

# agenticOS-update

Maintenance skill. Keeps Agentic OS memory accurate without bloat.

## When to use

- A new subsystem appeared or a major folder was renamed/removed.
- A durable architectural decision was made.
- An incident, regression, or near-miss occurred.
- A rule/invariant was added (e.g. "never call X directly").

Do NOT use for routine code changes.

## Workflow

1. Run: `python3 scripts/agentic/update_memory.py`.
2. Review its report. For each suggestion:
   - If accurate and durable, edit the relevant curated file (`PROJECT_BRIEF.md`, `SUBSYSTEMS/<name>.md`, `LESSONS/decisions.md`, `LESSONS/incidents.md`).
   - Keep entries short. Prefer one-liners with links to source-of-truth files.
3. Re-run: `python3 scripts/agentic/validate_memory.py`. Resolve warnings.
4. Never auto-overwrite curated files. Generated artifacts (per `generated_artifacts` in `.agentic/CONFIG/agentic.json`) may be regenerated freely.

## Anti-bloat rules

- Memory is an index, not a duplicate of the code.
- Remove obsolete entries when superseded.
- If a lesson fits in one sentence, keep it one sentence.
