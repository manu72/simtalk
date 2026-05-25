# Agentic OS

## Part 1: Manifesto

# The Agentic OS Manifesto

Modern software systems are too large and too complex for stateless language models to understand in a single prompt.

The problem is not that models are unintelligent. The problem is that they are context-bound.

Every prompt begins with amnesia.

Without structure, the model compensates by guessing.

Guessing leads to architectural drift, inconsistent decisions, subtle regressions, and wasted effort.

Agentic OS is a disciplined approach to solving this problem.

It treats a software repository as an operating environment for AI agents.

Just as a traditional operating system manages memory, storage, and process scheduling for programs, Agentic OS manages context, knowledge, and decision routing for language models.

## Core Principles

### 1. Context is Working Memory

Large language models perform best when given the smallest set of relevant evidence.

More context is not inherently better.

Irrelevant context degrades reasoning.

### 2. Memory is Indexed, Not Dumped

Durable knowledge should be structured as an index that points to source evidence.

The memory layer should answer:

- What exists?
- Where is the source of truth?
- What must be read before editing?
- What lessons were learned?
- What tests prove correctness?

### 3. Routing Precedes Reasoning

The first task of an agent is not coding.

The first task is determining what information is required.

### 4. Evidence Over Intuition

Agents should read the canonical source files before proposing changes.

When uncertainty is high, the correct response is to investigate, not improvise.

### 5. Decisions Must Compound

Every incident, architectural decision, and lesson learned should improve future performance.

The system should become more reliable over time.

### 6. Tooling Beats Prompting

Deterministic tools should handle indexing, search, routing, and validation.

The LLM should spend its reasoning budget on judgement.

### 7. Memory Must Stay Fresh

Generated maps are regenerated automatically.

Human summaries are updated only when durable knowledge changes.

### 8. Quality Over Token Minimisation

Lower token usage is a side effect.

The true goal is fewer incorrect assumptions and higher quality outputs.

## The Agentic OS Model

Agentic OS consists of two cooperating systems.

### Memory Layer

A structured, evolving representation of:

- Architecture
- Principles
- Invariants
- Lessons learned
- Change history
- File relationships

### Context Compiler

A deterministic routing engine that converts a task into a focused context bundle.

For every prompt, it decides:

- Relevant subsystems
- Required files
- Applicable rules
- Historical lessons
- Risks
- Unknowns
- Verification steps

## The Standard of Success

A successful Agentic OS produces agents that:

- Read the right files first
- Ask better questions
- Make fewer assumptions
- Respect architectural boundaries
- Catch regressions earlier
- Improve with every decision

The objective is simple:

> Provide the minimal sufficient evidence required for the highest quality decision.

That is Agentic OS.

---

# Part 2: Reference Implementation Plan

## Objective

Build a reusable t8 Agentic OS framework that can be installed into any software repository to improve AI coding quality, reduce guessing, and preserve operational working memory over time.

The primary audience for Agentic OS memory is AI agents, not humans. Humans are reviewers, governors, and escalation points. The memory files should be concise, structured, current, and optimised for agent routing, task execution, risk detection, and context compilation.

This implementation replaces the earlier CODEMAP-first design with a graph-first architecture:

- Agentic OS uses Understand Anything as a pluggable structured-codebase-memory and retrieval tool.
- Agentic OS provides operational memory, routing policy, governance, lessons, risks, and workflow discipline.
- Personal-level skills orchestrate focused workflows.
- Tooling performs deterministic graph, routing, validation, and memory maintenance work.

The system is split into six personal-level skills:

Bootstrap/setup skills:

1. `agenticOS-bootstrap`
2. `agenticOS-graph`
3. `agenticOS-memory`
4. `agenticOS-tooling`

Runtime skills:

5. `agenticOS-context`
6. `agenticOS-update`

All six canonical skills are personal/global skills, not repo-level generated skills. They should be maintained centrally so they do not drift across repositories.

The bootstrap skills are used during setup, repair, migration, and upgrades. The runtime skills are used during normal development.

---

## Core Architecture

### Structural Intelligence Layer

Owned by Agentic OS and implemented through tooling.

Understand Anything is the preferred tool used by Agentic OS to generate and query structured codebase memory. It has functions, not architectural ownership.

Agentic OS uses Understand Anything to:

- build and refresh the code knowledge graph;
- map files, symbols, functions, classes, imports, dependencies, and relationships;
- support impact analysis and graph traversal;
- provide structural evidence to the context compiler.

Preferred primary graph artifact:

```text
.agentic/GRAPH/knowledge-graph.json
```

Use this path if Understand Anything allows configurable output. If not, use the tool's native output path and reference that path in `.agentic/CONFIG/agentic.json`.

Agentic OS must not duplicate the full graph into large static memory files.

### Operational Memory Layer

Owned by Agentic OS.

Responsibilities:

- Capture project brief, architectural intent, subsystem rules, lessons, decisions, risks, invariants, and operational constraints.
- Preserve human-reviewed institutional knowledge.
- Provide routing governance over the graph.
- Keep future AI agents from guessing.

Primary memory root:

```text
.agentic/
```

### Context Compiler and Routing Engine

Owned by Agentic OS tooling and invoked by the `agenticOS-context` skill.

The routing engine is a key part of the context compiler workflow. It should not be broken into a separate skill. The skill orchestrates the workflow; the repo-local or canonical tooling performs deterministic routing.

Responsibilities:

- Convert a user task into a focused context bundle.
- Prioritise explicit user evidence.
- Query or read graph intelligence.
- Use fallback CODEMAP only when graph mode is unavailable.
- Overlay operational memory.
- Return selected files, graph nodes, related tests, risk warnings, unknowns, stop conditions, and confidence.

Primary runtime script:

```text
scripts/agentic/route_task.py
```

---

## Target Repository Structure

```text
.agentic/
  PROJECT_BRIEF.md
  MEMORY_INDEX.md
  GRAPH_INDEX.md

  GRAPH/
    knowledge-graph.json

  SUBSYSTEMS/
    README.md
    <subsystem>.md

  LESSONS/
    decisions.md
    incidents.md

  CONTEXT/
    last_context.json

  CONFIG/
    agentic.json

.cursor/skills/
  # Personal/global skills, not repo-level generated files:
  agenticOS-bootstrap/SKILL.md
  agenticOS-graph/SKILL.md
  agenticOS-memory/SKILL.md
  agenticOS-tooling/SKILL.md
  agenticOS-context/SKILL.md
  agenticOS-update/SKILL.md

scripts/agentic/
  README.md
  graph_sync.py
  route_task.py
  validate_memory.py
  update_memory.py
```

Optional future structure when tooling is extracted into a shared package:

```text
t8-agentic-os/
  agentic/
    graph.py
    router.py
    memory.py
    validate.py
    update.py
    schemas.py
  templates/
    skills/
    memory/
    config/
  tests/
```

---

## Managed and Human Memory Regions

Every major operational memory file should support managed and human regions. These files are primarily for agents, not humans, but human review remains part of the governance loop.

```markdown
<!-- agentic:managed:start -->
Assistant/tool maintained content.
<!-- agentic:managed:end -->

<!-- human:notes:start -->
Human judgement, context, warnings, and nuance.
Never overwrite automatically.
<!-- human:notes:end -->
```

Managed sections may be regenerated by `agenticOS-memory` or `agenticOS-update`.

Human sections are preserved by default, but they are not sacred. The memory update tooling should review them for staleness, inaccuracy, incompleteness, or conflict with current repo evidence, then propose edits and update after human confirmation.

This is the core model:

```text
AI-maintained operational memory with human review gates.
```

---

## Skill 1: `agenticOS-bootstrap`

### Purpose

Personal-level top-level orchestration skill for installing, repairing, refreshing, or upgrading Agentic OS in a repository.

This skill should remain short. It should not contain the full implementation details for graph setup, memory generation, or tooling generation. It delegates to the focused setup skills.

### When to use

Use when:

- setting up Agentic OS in a new repo;
- migrating from the older CODEMAP-based system;
- repairing a broken Agentic OS install;
- upgrading skills/tooling;
- checking whether a repo has all required Agentic OS pieces.

Do not use before normal coding tasks.

### Responsibilities

1. Confirm repository root.
2. Detect current install state.
3. Classify mode: `init`, `refresh`, `repair`, `migration`, or `upgrade`.
4. Call setup skills in order:
   - `agenticOS-graph`
   - `agenticOS-memory`
   - `agenticOS-tooling`
5. Run final validation.
6. Summarise graph status, memory status, tooling status, unknowns, and next steps.

### Inputs inspected

- `.git/`
- `.agentic/`
- `.understand-anything/`
- `.cursor/skills/`
- `scripts/agentic/`
- root README and manifests

### Outputs

- Installed or repaired Agentic OS framework.
- Clear summary of what changed.
- Clear list of unknowns or conflicts requiring human review.

### Non-goals

- Do not generate graph-specific logic directly.
- Do not generate memory templates directly.
- Do not generate Python tooling directly.
- Do not perform normal runtime context routing.

---

## Skill 2: `agenticOS-graph`

### Purpose

Personal-level skill that installs, detects, validates, and refreshes the structural intelligence layer using Understand Anything where available.

### Responsibilities

1. Detect whether Understand Anything is installed or configured.
2. Detect whether the configured graph file exists.
3. Prefer `.agentic/GRAPH/knowledge-graph.json` if Understand Anything allows configurable output.
4. Ask before installing or running remote install commands.
5. Generate or refresh the knowledge graph.
6. Validate graph existence and parseability.
7. Record graph status in `.agentic/GRAPH_INDEX.md` managed section.
8. Surface graph gaps and unknowns.

### Rules

- Never silently execute remote installation scripts.
- Never hand-write the knowledge graph.
- Never duplicate the full graph into `.agentic/`.
- If graph generation fails, preserve fallback mode and record the failure.

### Graph status fields

`GRAPH_INDEX.md` managed section should include:

```markdown
## Graph status
- Provider: Understand Anything
- Graph path: `.agentic/GRAPH/knowledge-graph.json` or configured fallback path
- Last checked:
- Last generated:
- Parseable: yes/no
- Coverage notes:
- Known gaps:
```

### Fallback mode

If Understand Anything is unavailable, Agentic OS may generate and use a lightweight fallback `CODEMAP.json` as the structural cache.

Filesystem lookup remains available for explicit file/path matching, but it is not the primary fallback structural layer.

Fallback mode must be marked clearly as graph-unavailable. It is acceptable for bootstrapping, but not ideal for high-quality routing.

---

## Skill 3: `agenticOS-memory`

### Purpose

Personal-level skill that creates, refreshes, reviews, and maintains the Agentic OS operational memory layer for AI agents.

### Responsibilities

1. Create or update `.agentic/PROJECT_BRIEF.md`.
2. Create or update `.agentic/MEMORY_INDEX.md`.
3. Create or update `.agentic/SUBSYSTEMS/README.md`.
4. Create or update subsystem files where evidence is strong.
5. Create or update `.agentic/LESSONS/decisions.md`.
6. Create or update `.agentic/LESSONS/incidents.md`.
7. Ingest external AI instruction files.
8. Preserve human sections by default.
9. Review human sections for staleness, inaccuracy, incompleteness, and conflict.
10. Propose updates to human sections where needed and apply them only after confirmation.
11. Refresh managed sections.
12. Surface conflicts and unknowns.

### External instruction sources

Inspect if present:

```text
CLAUDE.md
AGENTS.md
.cursor/rules/*
.cursor/skills/*
.github/copilot-instructions.md
```

These files should be respected, not overwritten.

Durable rules may be summarised into Agentic OS memory. Conflicts must be surfaced, not silently resolved.

### `PROJECT_BRIEF.md` purpose

A concise project-level operational overview for agents.

The whole file must be initialised by the agent from repo evidence, especially the root README and existing project docs. Do not leave the human section blank by default.

Managed section should include:

- project purpose if discoverable;
- stack;
- runtime;
- deployment signals;
- major subsystems;
- source-of-truth files;
- external agent instruction sources;
- unknowns.

Human section should be initially populated by the agent from README/project evidence and should include inferred or documented:

- product intent;
- business constraints;
- architectural philosophy;
- project-specific judgement.

After initialisation, the agent may review this section, flag staleness or gaps, and update it after confirmation.

### `MEMORY_INDEX.md` purpose

A routing-oriented operational index.

Managed section should include:

- subsystem list;
- high-risk areas;
- source-of-truth files;
- lessons and decisions index;
- external instruction sources;
- memory freshness status.

Human section should include:

- routing hints;
- priority warnings;
- project-specific “read this first” notes.

### `SUBSYSTEMS/*.md` purpose

Operational memory per major subsystem.

Each subsystem file should include:

- purpose;
- owned paths;
- public contracts;
- source-of-truth files;
- related tests;
- dependencies;
- invariants;
- common failure modes;
- do-not-do rules;
- related lessons.

### `LESSONS/*.md` purpose

Durable institutional learning.

Use sparingly.

Decisions are for architectural choices.

Incidents are for failures, regressions, outages, near-misses, and hard-won lessons.

Do not record routine implementation details.

---

## Skill 4: `agenticOS-tooling`

### Purpose

Personal-level skill that installs, generates, repairs, or updates the repo-local tooling used by Agentic OS.

### Responsibilities

1. Create or update `.agentic/CONFIG/agentic.json`.
2. Create or update `scripts/agentic/README.md`.
3. Create or update `scripts/agentic/graph_sync.py`.
4. Create or update `scripts/agentic/route_task.py`.
5. Create or update `scripts/agentic/validate_memory.py`.
6. Create or update `scripts/agentic/update_memory.py`.
7. Verify the six personal-level Agentic OS skills exist in the user's personal/global skills location.
8. Do not generate repo-local copies of the six canonical skills unless the user explicitly requests repo-level pinned skill versions.

### Near-term implementation

Tooling may be generated or repaired in-repo.

### Preferred future implementation

Tooling should be copied or installed from a known-good canonical `t8-agentic-os` repository/package.

The skill should support both:

```text
local generated tooling mode
canonical tooling install mode
```

### `agentic.json` required fields

```json
{
  "version": 2,
  "graph": {
    "provider": "understand-anything",
    "path": ".agentic/GRAPH/knowledge-graph.json",
    "required": true,
    "fallback": "codemap"
  },
  "paths": {
    "memory_root": ".agentic",
    "scripts_root": "scripts/agentic",
    "context_cache": ".agentic/CONTEXT/last_context.json"
  },
  "generated_artifacts": [
    ".agentic/CONTEXT/last_context.json"
  ]
}
```

Additional config should include:

- ignore globs;
- high-risk patterns;
- subsystem keywords;
- freshness rules;
- graph validation settings;
- memory validation settings.

### `graph_sync.py`

Responsibilities:

- Verify graph file exists.
- Parse graph file.
- Extract lightweight graph metadata.
- Update `GRAPH_INDEX.md` managed section.
- Detect graph freshness issues.
- Avoid duplicating graph contents.

### `route_task.py`

Responsibilities:

- Accept task string.
- Extract explicit file/path/function references.
- Resolve explicit file references against filesystem first.
- Use Understand Anything graph as the primary structural retrieval source.
- Use operational memory as routing overlay.
- Include related tests where discoverable.
- Produce a context bundle.
- Write `.agentic/CONTEXT/last_context.json`.

Routing priority order:

1. Explicit user-named files, paths, functions, symbols, endpoints, or tests.
2. Graph traversal from explicit anchors.
3. Graph search against task terms.
4. Dependency and impact expansion.
5. Related tests.
6. Operational memory overlays.
7. Risk overlays.
8. Filesystem fallback.
9. Stop conditions.

Explicit user evidence always overrides heuristic routing.

If a user names an existing file, it must be included.

### Context bundle schema

```json
{
  "task": "...",
  "confidence": "high|medium|low",
  "graph_available": true,
  "graph_source": ".understand-anything/knowledge-graph.json",
  "selected_paths": [],
  "selection_reasons": {},
  "graph_nodes": [],
  "dependency_paths": [],
  "related_tests": [],
  "subsystem_files": [],
  "memory_files": [],
  "risk_tags": [],
  "unknowns": [],
  "stop_conditions": []
}
```

### `validate_memory.py`

Responsibilities:

- Validate required folder structure.
- Validate graph file exists and parses.
- Validate managed/human region markers.
- Validate config parses.
- Validate referenced file paths exist.
- Validate runtime skills exist with uppercase `SKILL.md`.
- Warn on stale graph or memory.

### `update_memory.py`

Responsibilities:

- Refresh graph or request graph refresh.
- Run `graph_sync.py`.
- Detect graph deltas where possible.
- Refresh managed sections.
- Preserve human sections.
- Propose lessons and decisions.
- Print review summary.

Never silently overwrite human sections.

---

## Runtime Skill 1: `agenticOS-context`

### Purpose

Personal-level runtime skill that compiles a focused context bundle before a coding task.

Use before substantial coding tasks.

### Workflow

1. Verify `.agentic/CONFIG/agentic.json` exists.
2. Verify graph status via config and `GRAPH_INDEX.md`.
3. Invoke the routing engine by running `python scripts/agentic/route_task.py "<task>"`.
4. Treat the routing engine as part of the context compiler workflow, not as a separate skill.
5. Read the returned context bundle.
6. Read only required selected paths, memory files, subsystem files, and related tests unless blocked.
7. State confidence, risks, unknowns, and stop conditions.
8. If confidence is low, ask before implementing.
9. If explicit user evidence was omitted but exists, read it and report the router issue.
10. Proceed with implementation only after sufficient evidence exists.

### Non-goals

- Do not bootstrap.
- Do not update operational memory.
- Do not perform wide repository scans by default.
- Do not ignore explicit user-named files.

---

## Runtime Skill 2: `agenticOS-update`

### Purpose

Personal-level runtime skill that updates operational memory after durable changes.

Use after:

- new subsystem creation;
- major architecture change;
- deployment change;
- security rule change;
- data model change;
- production incident;
- regression lesson;
- important routing failure;
- durable project decision.

Do not use for routine changes.

### Workflow

1. Run `python scripts/agentic/update_memory.py`.
2. Review proposed managed-section updates.
3. Preserve human sections by default, but review them for staleness, inaccuracy, incompleteness, or conflict.
4. Propose human-section edits where needed and apply only after confirmation.
5. Add lesson/decision only if durable.
6. Run `python scripts/agentic/validate_memory.py`.
7. Commit code and Agentic OS updates together.

### Definition of Done addition

Every non-trivial PR should ask:

```text
Did this change create durable knowledge Agentic OS should remember?
```

If yes, run `agenticOS-update`.

---

## Development Workflow

### New repo

Use the personal-level skill:

```text
/agenticOS-bootstrap
```

Then normal development begins.

### Normal coding task

```text
/agenticOS-context
<task>
```

Optional follow-on skills may still be used:

```text
/doyouunderstand
planning skills
review skills
superpowers
```

Agentic OS should run first because it compiles the evidence packet.

### Durable change

```text
/agenticOS-update
```

### Repair graph only

```text
/agenticOS-graph
```

### Repair memory only

```text
/agenticOS-memory
```

### Repair tooling only

```text
/agenticOS-tooling
```

---

## Git and CI Strategy

Commit:

```text
.agentic/PROJECT_BRIEF.md
.agentic/MEMORY_INDEX.md
.agentic/GRAPH_INDEX.md
.agentic/SUBSYSTEMS/**
.agentic/LESSONS/**
.agentic/CONFIG/agentic.json
scripts/agentic/**
```

Do not normally commit the six canonical personal-level Agentic OS skills into every repo. They should be maintained centrally at the user/team skill level. Repo-level copies may be created only when a project requires pinned local skill versions.

Usually ignore:

```text
.agentic/CONTEXT/
```

Decision required for graph artifact:

```text
.agentic/GRAPH/knowledge-graph.json
```

If the graph is small and deterministic, committing it may help reviewability. If it is large or machine-local, ignore it and regenerate in CI/local setup.

If Understand Anything cannot write to `.agentic/GRAPH/knowledge-graph.json`, configure Agentic OS to point at the actual graph path and decide whether that path should be committed or ignored.

CI should eventually run:

```text
python scripts/agentic/validate_memory.py
```

Optional future checks:

```text
python scripts/agentic/graph_sync.py --check
python scripts/agentic/update_memory.py --check
```

---

## Success Criteria

The implementation succeeds when:

- agents stop relying on broad repo scans;
- explicit user-named files are never omitted;
- context bundles are small but sufficient;
- graph freshness is visible;
- memory freshness is visible;
- subsystem memory remains accurate;
- lessons and decisions accumulate without bloat;
- routing failures lead to durable improvements;
- PRs include Agentic OS updates when architecture changes;
- new agents can work effectively without prior chat history.

---

## Phased Rollout

### Phase 1: Skill split

Create the four setup skills and two runtime skills.

Do not over-automate yet.

### Phase 2: Graph integration

Integrate Understand Anything as the primary structural source.

Add graph validation and graph index generation.

### Phase 3: Router upgrade

Replace CODEMAP keyword routing with graph-first routing.

Add explicit evidence anchors, selection reasons, and stop conditions.

### Phase 4: Managed memory

Add managed/human regions to all operational memory files.

Add update tooling that preserves human notes.

### Phase 5: Canonical tooling repo

Move scripts/templates into `t8-agentic-os`.

Bootstrap should install/copy known-good tooling rather than generating scripts from scratch.

### Phase 6: CI and governance

Add validation checks, PR checklist, and t8-wide adoption guidance.

---

## Design Guardrails

Do not recreate a giant CODEMAP except as a fallback-only structural cache when graph mode is unavailable.

Do not treat Markdown as source code intelligence.

Do not let human memory become manual-only documentation.

Do not silently overwrite human judgement.

Do not run remote installers without approval.

Do not allow low-confidence routing to suppress explicit user evidence.

Do not make `agenticOS-bootstrap` a god-skill.

Do make each skill small, focused, and reusable.

Do make tooling deterministic and testable.

Do make graph and memory freshness visible.

Do make the OS better after every important lesson.

