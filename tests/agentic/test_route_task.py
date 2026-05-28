"""Broad tests for ``scripts/agentic/route_task.py``.

Each test materialises an isolated Agentic OS install in a tempdir (see
``fixtures/build_fixture.py``) and invokes ``route_task.py`` via subprocess
with that tempdir as the CWD. This keeps the router under test in its
documented runtime shape (repo-root CWD; reads ``.agentic/CONFIG/...``;
writes ``.agentic/CONTEXT/last_context.json``) without depending on the
live SimTalk repo state.

Run::

    python3 -m unittest discover -s tests/agentic -p 'test_*.py'
"""

from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ROUTE_TASK = REPO_ROOT / "scripts" / "agentic" / "route_task.py"

sys.path.insert(0, str(Path(__file__).parent / "fixtures"))
import build_fixture  # noqa: E402


REQUIRED_KEYS = (
    "task",
    "generated_at",
    "confidence",
    "graph_available",
    "graph_source",
    "graph_age_hours",
    "fallback_active",
    "selected_paths",
    "selected_tests",
    "selection_reasons",
    "graph_nodes",
    "dependency_paths",
    "related_tests",
    "lesson_files",
    "subsystem_files",
    "memory_files",
    "selected_subsystems",
    "risk_tags",
    "unknowns",
    "stop_conditions",
)


def _run(root: Path, task: str, *, explain: bool = False) -> dict:
    """Invoke route_task.py under ``root`` and return the parsed bundle."""
    cmd = [sys.executable, str(ROUTE_TASK), task]
    if explain:
        cmd.append("--explain")
    proc = subprocess.run(
        cmd,
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, f"route_task failed: rc={proc.returncode} stderr={proc.stderr}"
    return json.loads(proc.stdout)


class SchemaContract(unittest.TestCase):
    def test_bundle_has_all_documented_keys(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(root, "review backend realtime token route")
            for key in REQUIRED_KEYS:
                self.assertIn(key, bundle, f"missing key: {key}")
            self.assertIn(bundle["confidence"], {"low", "medium", "high"})
            self.assertIsInstance(bundle["selected_paths"], list)
            self.assertIsInstance(bundle["selected_tests"], list)
            self.assertIsInstance(bundle["lesson_files"], list)
            self.assertIsInstance(bundle["graph_nodes"], list)
            self.assertTrue((root / ".agentic" / "CONTEXT" / "last_context.json").is_file())


class AnchorResolution(unittest.TestCase):
    def test_explicit_filesystem_path_anchor(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(root, "review backend/src/routes/realtime.ts for cors handling")
            paths = bundle["selected_paths"] + bundle["selected_tests"]
            self.assertIn("backend/src/routes/realtime.ts", paths)
            reason = bundle["selection_reasons"]["backend/src/routes/realtime.ts"]
            self.assertTrue(
                reason.startswith("user-named"),
                f"anchor reason should mark user-named: {reason!r}",
            )

    def test_explicit_symbol_name_anchor(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(root, "explain createRealtimeRoute")
            self.assertIn("backend/src/routes/realtime.ts", bundle["selected_paths"])
            self.assertTrue(
                any(
                    n.get("type") == "function" and n.get("name") == "createRealtimeRoute"
                    for n in bundle["graph_nodes"]
                ),
                "symbol-level graph node should be present",
            )

    def test_nonexistent_name_records_no_anchor(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(root, "review the nonexistent foo bar widget", explain=True)
            self.assertEqual(bundle["selection_reasons"].get("foo.ts", None), None)
            # No explicit anchors means the route is heuristic.
            self.assertFalse(
                any(
                    r.startswith("user-named")
                    for r in bundle["selection_reasons"].values()
                ),
                "no path should be marked user-named for a fully nonexistent task",
            )


class StageBudgets(unittest.TestCase):
    def test_anchors_survive_when_search_would_saturate(self) -> None:
        # Force tiny budgets and verify the anchor still appears.
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(
                Path(tmp),
                config_extra={
                    "routing": {
                        "budgets": {"anchors": 1, "deps": 0, "search": 0, "tests": 0},
                        "hard_cap": 2,
                        "min_search_score_with_anchors": 3,
                    }
                },
            )
            bundle = _run(
                root,
                "review backend/src/routes/realtime.ts realtime token route handler",
            )
            self.assertIn("backend/src/routes/realtime.ts", bundle["selected_paths"])
            # Stage caps mean overall paths are bounded to hard_cap.
            total = len(bundle["selected_paths"]) + len(bundle["selected_tests"])
            self.assertLessEqual(total, 2)

    def test_search_heavy_task_still_allows_dep_expansion(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(
                root,
                "review backend/src/routes/realtime.ts realtime token route handler service security",
            )
            # The anchor's outgoing imports edge points at openAiRealtime.ts;
            # with stage budgets, the dep should not be starved by search.
            self.assertIn(
                "backend/src/services/openAiRealtime.ts",
                bundle["selected_paths"],
                "dependency expansion should run after anchors regardless of search",
            )


class EdgeTypeBreadth(unittest.TestCase):
    def test_calls_edges_traversed_by_default(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(
                root,
                "review backend/src/routes/realtime.ts",
                explain=True,
            )
            # CORS middleware is reachable from the anchor only via a
            # ``calls`` edge in the fixture. Default config allows it.
            self.assertIn("backend/src/middleware/cors.ts", bundle["selected_paths"])
            self.assertIn("calls", bundle["_explain"]["edge_types_used"])

    def test_test_edges_flow_into_test_buckets_not_dependency_paths(self) -> None:
        """tested_by edges must surface the test file as a test, never as a dep.

        The test file may land in either ``selected_tests`` (when graph
        search also matches it) or ``related_tests`` (when only the
        ``tested_by`` edge surfaces it), but it must never appear in
        ``dependency_paths`` and must not be duplicated across the two
        test buckets.
        """
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(root, "review backend/src/routes/realtime.ts")
            test_path = "tests/backend/unit/realtime.test.ts"
            test_buckets = set(bundle["selected_tests"]) | set(bundle["related_tests"])
            self.assertIn(
                test_path,
                test_buckets,
                "tested_by edge should surface the test in selected_tests or related_tests",
            )
            self.assertFalse(
                test_path in bundle["selected_tests"] and test_path in bundle["related_tests"],
                "test file must not be duplicated across selected_tests and related_tests",
            )
            self.assertNotIn(test_path, bundle["dependency_paths"])

    def test_disabled_edge_type_is_not_traversed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(
                Path(tmp),
                config_extra={
                    "graph": {"dependency_edge_types": ["imports"]},
                },
            )
            bundle = _run(root, "review backend/src/routes/realtime.ts", explain=True)
            # cors.ts was only reachable via calls; with calls disabled it
            # should not be picked up by dep expansion.
            cors_reason = bundle["selection_reasons"].get("backend/src/middleware/cors.ts")
            if cors_reason is not None:
                # If it appears, it must not be via dep expansion.
                self.assertNotIn("dependency", cors_reason)


class TestFileDeduplication(unittest.TestCase):
    """A test file selected as an anchor must not also appear in related_tests.

    ``_add_path`` routes test files into ``selected_tests`` (kept separate
    from ``selected_paths``). The fs-walk fallback historically deduped
    against ``set(selected_paths)`` only, so a test anchor could surface
    again as a "related" test. The fix threads ``selected_tests`` through
    the fallback's ``exclude`` parameter; the graph branch already dedupes
    against ``selection_reasons`` so it was not affected.
    """

    def test_walk_fallback_does_not_duplicate_anchored_test(self) -> None:
        # Strip tested_by edges so the fallback path runs.
        graph = copy.deepcopy(build_fixture.DEFAULT_GRAPH)
        graph["edges"] = [e for e in graph["edges"] if e.get("type") != "tested_by"]
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp), graph=graph)
            bundle = _run(
                root,
                "review tests/backend/unit/realtime.test.ts and backend/src/routes/realtime.ts",
            )
            test_path = "tests/backend/unit/realtime.test.ts"
            self.assertIn(test_path, bundle["selected_tests"])
            self.assertNotIn(
                test_path,
                bundle["related_tests"],
                "test file already in selected_tests must not duplicate into related_tests",
            )


class GraphRelatedTestsDefensive(unittest.TestCase):
    """``_graph_related_tests`` must not trust edge type alone.

    A malformed or over-permissive graph (test edges pointing at docs,
    config, or other sources) would otherwise leak non-test files into
    ``related_tests`` and downstream into the bundle that consumers treat
    as authoritative test evidence.
    """

    def test_test_edge_pointing_at_doc_is_rejected(self) -> None:
        # Inject a tested_by edge from realtime.ts to a .md document.
        graph = copy.deepcopy(build_fixture.DEFAULT_GRAPH)
        graph["nodes"].append(
            {
                "id": "document:docs/realtime-notes.md",
                "type": "document",
                "name": "realtime-notes.md",
                "filePath": "docs/realtime-notes.md",
                "tags": ["documentation"],
                "summary": "Notes about the realtime route",
            }
        )
        graph["edges"].append(
            {
                "source": "file:backend/src/routes/realtime.ts",
                "target": "document:docs/realtime-notes.md",
                "type": "tested_by",
                "direction": "forward",
                "weight": 1,
            }
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp), graph=graph)
            # Make the doc file exist so its absence isn't what's filtering it.
            (root / "docs").mkdir(parents=True, exist_ok=True)
            (root / "docs" / "realtime-notes.md").write_text("", encoding="utf-8")
            bundle = _run(root, "review backend/src/routes/realtime.ts")
            for t in bundle["related_tests"]:
                self.assertFalse(
                    t.endswith(".md"),
                    f"doc leaked into related_tests via tested_by edge: {t}",
                )
            self.assertNotIn("docs/realtime-notes.md", bundle["related_tests"])

    def test_test_edge_pointing_at_source_is_rejected(self) -> None:
        # Bogus tested_by edge to another source file (e.g. a graph provider
        # that emits both directions or a hand-authored edge mistake).
        graph = copy.deepcopy(build_fixture.DEFAULT_GRAPH)
        graph["edges"].append(
            {
                "source": "file:backend/src/routes/realtime.ts",
                "target": "file:backend/src/middleware/cors.ts",
                "type": "tested_by",
                "direction": "forward",
                "weight": 1,
            }
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp), graph=graph)
            bundle = _run(root, "review backend/src/routes/realtime.ts")
            self.assertNotIn(
                "backend/src/middleware/cors.ts",
                bundle["related_tests"],
                "non-test source must not leak into related_tests",
            )


class ConfigTypeValidation(unittest.TestCase):
    """Mistyped config values must not silently degrade routing.

    A string mistakenly configured where a list is expected would otherwise
    become a per-character set when fed to ``set(...)`` in the edge-type
    filters, breaking dependency expansion without surfacing any error.
    These tests lock the safe-default fallback in place.
    """

    def test_string_dependency_edge_types_falls_back_to_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(
                Path(tmp),
                config_extra={"graph": {"dependency_edge_types": "imports"}},
            )
            bundle = _run(
                root, "review backend/src/routes/realtime.ts", explain=True
            )
            # With safe defaults restored, imports edges are traversed and
            # openAiRealtime.ts surfaces via dependency expansion. If the
            # string had become a character set, no dependency would appear.
            self.assertIn(
                "backend/src/services/openAiRealtime.ts",
                bundle["selected_paths"],
                "dependency expansion silently degraded under string config",
            )
            self.assertIn("imports", bundle["_explain"]["edge_types_used"])

    def test_string_test_edge_types_falls_back_to_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(
                Path(tmp),
                config_extra={"graph": {"test_edge_types": "tested_by"}},
            )
            bundle = _run(root, "review backend/src/routes/realtime.ts")
            test_buckets = set(bundle["selected_tests"]) | set(bundle["related_tests"])
            self.assertIn(
                "tests/backend/unit/realtime.test.ts",
                test_buckets,
                "graph-driven test discovery silently degraded under string config",
            )

    def test_list_with_non_string_items_is_sanitised(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(
                Path(tmp),
                config_extra={
                    "graph": {"dependency_edge_types": ["imports", 42, None]}
                },
            )
            bundle = _run(
                root, "review backend/src/routes/realtime.ts", explain=True
            )
            # Non-string items dropped; imports still applied.
            self.assertIn("imports", bundle["_explain"]["edge_types_used"])

    def test_non_int_dependency_fanout_falls_back_to_default(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(
                Path(tmp),
                config_extra={"graph": {"dependency_fanout": "four"}},
            )
            bundle = _run(root, "review backend/src/routes/realtime.ts")
            # Dependency expansion still works under string fanout.
            self.assertIn(
                "backend/src/services/openAiRealtime.ts",
                bundle["selected_paths"],
            )


class RelatedTestsBudget(unittest.TestCase):
    """``related_tests`` must honour ``budgets.tests`` in both branches.

    The contract documented in scripts/agentic/README.md states that
    ``tests`` is the bound on graph-driven and walk-driven test discovery
    combined. Both branches of Stage 5 must enforce the same cap so a hub
    file with many ``tested_by`` edges (graph branch) or many stem-matching
    walk hits (fallback branch) cannot overflow the bundle.
    """

    def test_graph_branch_respects_tests_cap(self) -> None:
        # Add multiple tested_by edges from realtime.ts to N test files; the
        # cap must clip the resulting related_tests list.
        graph = copy.deepcopy(build_fixture.DEFAULT_GRAPH)
        extra_tests = [
            f"tests/backend/unit/realtime_extra_{i}.test.ts" for i in range(6)
        ]
        for t in extra_tests:
            graph["nodes"].append(
                {
                    "id": f"file:{t}",
                    "type": "file",
                    "name": t.rsplit("/", 1)[-1],
                    "filePath": t,
                    "tags": ["test", "backend", "unit"],
                    "summary": "Extra unit test",
                }
            )
            graph["edges"].append(
                {
                    "source": "file:backend/src/routes/realtime.ts",
                    "target": f"file:{t}",
                    "type": "tested_by",
                    "direction": "forward",
                    "weight": 1,
                }
            )
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(
                Path(tmp),
                graph=graph,
                config_extra={
                    "routing": {
                        "budgets": {"anchors": 6, "deps": 4, "search": 6, "tests": 2},
                        "hard_cap": 12,
                    }
                },
            )
            bundle = _run(root, "review backend/src/routes/realtime.ts")
            self.assertLessEqual(
                len(bundle["related_tests"]),
                2,
                f"graph branch ignored tests cap: {bundle['related_tests']}",
            )

    def test_walk_fallback_respects_tests_cap(self) -> None:
        # Strip test edges so the fallback runs, then ensure the cap is
        # enforced (previously a +6 cushion blew past the configured value).
        graph = copy.deepcopy(build_fixture.DEFAULT_GRAPH)
        graph["edges"] = [e for e in graph["edges"] if e.get("type") != "tested_by"]
        # Drop the existing test nodes so the fixture's own test files don't
        # gate the walk, then create N stem-matching test files on disk.
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(
                Path(tmp),
                graph=graph,
                config_extra={
                    "routing": {
                        "budgets": {"anchors": 6, "deps": 4, "search": 6, "tests": 2},
                        "hard_cap": 12,
                    }
                },
            )
            tests_dir = root / "tests" / "backend" / "unit"
            tests_dir.mkdir(parents=True, exist_ok=True)
            for i in range(6):
                (tests_dir / f"realtime_extra_{i}.test.ts").write_text("", encoding="utf-8")
            bundle = _run(root, "review backend/src/routes/realtime.ts")
            self.assertLessEqual(
                len(bundle["related_tests"]),
                2,
                f"walk fallback ignored tests cap: {bundle['related_tests']}",
            )


class GraphVsWalkTests(unittest.TestCase):
    def test_graph_driven_tests_path_preferred(self) -> None:
        """Graph-edge test discovery should surface the test file and record
        the ``tested_by`` edge as used. The file may land in either
        ``selected_tests`` (when graph search also matches it) or
        ``related_tests`` (when only the edge surfaces it); both signal
        successful graph-driven discovery.
        """
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(root, "review backend/src/routes/realtime.ts", explain=True)
            test_buckets = set(bundle["selected_tests"]) | set(bundle["related_tests"])
            self.assertIn("tests/backend/unit/realtime.test.ts", test_buckets)
            self.assertIn("tested_by", bundle["_explain"]["edge_types_used"])

    def test_tsconfig_test_json_is_rejected(self) -> None:
        # Strip the tested_by edges so the fs-walk fallback runs, which is
        # the path that historically picked up the bogus tsconfig.test.json.
        graph = copy.deepcopy(build_fixture.DEFAULT_GRAPH)
        graph["edges"] = [e for e in graph["edges"] if e.get("type") != "tested_by"]
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp), graph=graph)
            bundle = _run(root, "review backend/src/routes/realtime.ts", explain=True)
            for t in bundle["related_tests"]:
                self.assertFalse(
                    t.endswith(".json"),
                    f"tsconfig-style .json file leaked into related_tests: {t}",
                )
            # The candidate should be visible in the --explain trace.
            dropped = bundle["_explain"]["dropped_test_candidates"]
            self.assertTrue(
                any(d.endswith("tsconfig.test.json") for d in dropped),
                f"expected tsconfig.test.json in dropped_test_candidates: {dropped}",
            )


class LessonsInjection(unittest.TestCase):
    def test_decision_heading_overlap_surfaces_lesson_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(
                root,
                "add backend brokered image translation",
                explain=True,
            )
            self.assertIn(".agentic/LESSONS/decisions.md", bundle["lesson_files"])
            # Lesson path is mirrored into memory_files for backward compat.
            self.assertIn(".agentic/LESSONS/decisions.md", bundle["memory_files"])
            matches = bundle["_explain"]["lesson_matches"]
            self.assertIn(".agentic/LESSONS/decisions.md", matches)
            slugs = matches[".agentic/LESSONS/decisions.md"]
            self.assertTrue(
                any("image-translation" in s for s in slugs),
                f"expected image-translation slug, got {slugs}",
            )

    def test_unrelated_task_does_not_inject_lessons(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(root, "tweak the cors middleware factory signature")
            self.assertEqual(bundle["lesson_files"], [])


class Freshness(unittest.TestCase):
    def test_stale_graph_emits_unknown_and_downgrades_confidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            # 200h > 168h freshness threshold.
            root = build_fixture.build(Path(tmp), graph_mtime_age_hours=200)
            bundle = _run(root, "review backend/src/routes/realtime.ts", explain=True)
            self.assertTrue(bundle["_explain"]["graph_stale"])
            self.assertGreater(bundle["graph_age_hours"], 168)
            self.assertTrue(
                any("hours old" in u for u in bundle["unknowns"]),
                f"expected stale-graph unknown, got {bundle['unknowns']}",
            )

    def test_fresh_graph_is_not_stale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(root, "review backend/src/routes/realtime.ts", explain=True)
            self.assertFalse(bundle["_explain"]["graph_stale"])


class RiskUnification(unittest.TestCase):
    def test_per_block_keywords_emit_risk_tags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            # The default fixture config has keywords ["auth", "login"] on
            # the **/auth/** block. Token "login" should surface security/authn.
            root = build_fixture.build(Path(tmp))
            bundle = _run(root, "investigate login regression in the cors layer")
            self.assertIn("security", bundle["risk_tags"])
            self.assertIn("authn", bundle["risk_tags"])

    def test_default_verbs_still_apply_without_block_keywords(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            # Strip all keywords from high_risk_patterns to force the
            # curated-default fallback.
            root = build_fixture.build(
                Path(tmp),
                config_extra={
                    "high_risk_patterns": [
                        {"match": "**/auth/**", "tags": ["security", "authn"]},
                    ],
                },
            )
            bundle = _run(root, "rotate the openai api token used by realtime")
            self.assertIn("security", bundle["risk_tags"])
            self.assertIn("secrets", bundle["risk_tags"])


class ConfidenceRules(unittest.TestCase):
    def test_graph_route_with_no_tests_is_unknown_not_stop(self) -> None:
        graph = copy.deepcopy(build_fixture.DEFAULT_GRAPH)
        graph["edges"] = [e for e in graph["edges"] if e.get("type") != "tested_by"]
        # Drop the test-file nodes too so neither edge-driven nor walk-driven
        # discovery finds anything.
        graph["nodes"] = [
            n for n in graph["nodes"] if not (
                isinstance(n.get("filePath"), str) and n["filePath"].startswith("tests/")
            )
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp), graph=graph)
            # Remove the tests/ directory so fs-walk yields nothing either.
            for p in (root / "tests").rglob("*"):
                if p.is_file():
                    p.unlink()
            bundle = _run(root, "review backend/src/routes/realtime.ts")
            self.assertEqual(bundle["related_tests"], [])
            self.assertNotIn(
                "No related tests located",
                " | ".join(bundle["stop_conditions"]),
                "no-tests must not be a stop when the route is graph-driven and anchored",
            )
            self.assertTrue(
                any("No related tests" in u for u in bundle["unknowns"]),
                f"expected no-tests unknown, got {bundle['unknowns']}",
            )
            # Anchored + no tests => medium (per _compute_confidence).
            self.assertEqual(bundle["confidence"], "medium")


class RepoRootGuard(unittest.TestCase):
    def test_running_outside_repo_root_dies(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            # No .agentic/ at all in this directory.
            proc = subprocess.run(
                [sys.executable, str(ROUTE_TASK), "anything"],
                cwd=tmp,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(proc.returncode, 0)
            self.assertIn("must run from repo root", proc.stderr)


class ExplainTrace(unittest.TestCase):
    def test_explain_includes_new_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(
                root,
                "review backend/src/routes/realtime.ts service security",
                explain=True,
            )
            ex = bundle["_explain"]
            for key in (
                "stage_budgets",
                "stage_usage",
                "hard_cap",
                "edge_types_used",
                "dependency_edge_types_allowed",
                "test_edge_types_allowed",
                "min_search_score_with_anchors",
                "rejected_nodes",
                "dropped_test_candidates",
                "lesson_matches",
                "graph_age_hours",
                "graph_stale",
            ):
                self.assertIn(key, ex, f"_explain missing key: {key}")


class FilesystemAnchorShortcircuit(unittest.TestCase):
    def test_no_path_shaped_token_skips_walk(self) -> None:
        # Indirect: with no path-shaped token, the fs anchor pass must not
        # surface any user-named paths from the fixture.
        with tempfile.TemporaryDirectory() as tmp:
            root = build_fixture.build(Path(tmp))
            bundle = _run(root, "review realtime translation flow", explain=True)
            user_named = [
                p
                for p, r in bundle["selection_reasons"].items()
                if r == "user-named filesystem path"
            ]
            self.assertEqual(user_named, [])


if __name__ == "__main__":
    unittest.main()
