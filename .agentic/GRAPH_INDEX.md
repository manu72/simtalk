
<!-- agentic:managed:start -->

## Graph status

- Provider: understand-anything
- Graph path: `.understand-anything/knowledge-graph.json`
- Graph mode available: yes
- Fallback mode: codemap
- Last checked: 2026-05-28T02:46:58Z
- Last generated: 2026-05-26T06:52:24Z
- Parseable: yes
- Non-empty: yes
- Sample paths resolve: 5/5
- Coverage notes: 226 nodes
- Known gaps: none
- Unknowns: none

<!-- agentic:managed:end -->
<!-- human:notes:start -->

## Human notes

Routing hints, judgement calls, and provider-specific quirks live here.

- UA writes to its native path (`.understand-anything/knowledge-graph.json`). The Agentic OS preferred path (`.agentic/GRAPH/knowledge-graph.json`) is intentionally not used.
- UA also produces `fingerprints.json` and `meta.json` alongside the graph; treat those as UA-internal and out of scope for routing.
- Re-run `/understand` after substantial structural changes (new subsystems, large refactors, package additions). UA `/understand` is incremental by default.

<!-- human:notes:end -->
