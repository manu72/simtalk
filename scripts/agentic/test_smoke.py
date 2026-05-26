"""Smoke tests for v2 Agentic OS scripts.

These run against the live repo state. They verify that each script:

- imports cleanly,
- runs end-to-end on the current graph + memory layout,
- writes the expected artifact, and
- emits a bundle with the v2 contract (route_task only).

Standard library only. Run with::

    python3 -m unittest discover -s scripts/agentic -p 'test_*.py'
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts" / "agentic"
CONTEXT_OUT = REPO_ROOT / ".agentic" / "CONTEXT" / "last_context.json"
GRAPH_INDEX = REPO_ROOT / ".agentic" / "GRAPH_INDEX.md"
CONFIG_PATH = REPO_ROOT / ".agentic" / "CONFIG" / "agentic.json"


def _load_module(name: str, filename: str):
    target = SCRIPTS_DIR / filename
    spec = importlib.util.spec_from_file_location(name, target)
    assert spec is not None and spec.loader is not None, f"could not load {filename}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _CwdRepoRoot:
    """Context manager to run scripts from the repo root, as they expect."""

    def __enter__(self):
        self._old = Path.cwd()
        os.chdir(REPO_ROOT)
        return self

    def __exit__(self, *exc):
        os.chdir(self._old)


class GraphSyncSmoke(unittest.TestCase):
    def test_runs_and_updates_graph_index(self) -> None:
        graph_sync = _load_module("agentic_graph_sync", "graph_sync.py")
        with _CwdRepoRoot():
            buf_err = io.StringIO()
            with redirect_stderr(buf_err):
                rc = graph_sync.main()
        self.assertIn(rc, (0, 1), f"graph_sync exit was {rc}")
        self.assertTrue(GRAPH_INDEX.is_file(), "GRAPH_INDEX.md missing")
        text = GRAPH_INDEX.read_text(encoding="utf-8")
        self.assertIn("<!-- agentic:managed:start -->", text)
        self.assertIn("<!-- agentic:managed:end -->", text)
        self.assertIn("<!-- human:notes:start -->", text)
        self.assertIn("<!-- human:notes:end -->", text)


class ValidateMemorySmoke(unittest.TestCase):
    def test_runs_clean_against_repo(self) -> None:
        validate = _load_module("agentic_validate_memory", "validate_memory.py")
        with _CwdRepoRoot():
            buf_err = io.StringIO()
            with redirect_stderr(buf_err):
                rc = validate.main()
        self.assertEqual(rc, 0, f"validate_memory exit was {rc}: {buf_err.getvalue()}")

    def test_does_not_create_context_cache_directory(self) -> None:
        # The module docstring promises validation is read-only. The context
        # cache parent (`.agentic/CONTEXT/`) must not be created as a side
        # effect of running the validator — `route_task.py` is responsible for
        # mkdir-ing it on first write.
        import shutil
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            # Mirror just enough of the .agentic layout to let the validator
            # exercise _check_context_cache: a config pointing at a
            # not-yet-created CONTEXT dir, plus the required memory files so
            # other checks don't mask the assertion.
            agentic = tmp_path / ".agentic"
            (agentic / "CONFIG").mkdir(parents=True)
            (agentic / "SUBSYSTEMS").mkdir()
            (agentic / "LESSONS").mkdir()
            cfg = {
                "version": 2,
                "graph": {"required": False, "fallback": "none"},
                "paths": {
                    "memory_root": ".agentic",
                    "scripts_root": "scripts/agentic",
                    "context_cache": ".agentic/CONTEXT/last_context.json",
                },
                "validation": {"require_region_markers": False},
            }
            (agentic / "CONFIG" / "agentic.json").write_text(
                json.dumps(cfg), encoding="utf-8"
            )
            for name in (
                "PROJECT_BRIEF.md",
                "MEMORY_INDEX.md",
            ):
                (agentic / name).write_text("", encoding="utf-8")
            (agentic / "SUBSYSTEMS" / "README.md").write_text("", encoding="utf-8")
            (agentic / "LESSONS" / "decisions.md").write_text("", encoding="utf-8")
            (agentic / "LESSONS" / "incidents.md").write_text("", encoding="utf-8")

            old_cwd = Path.cwd()
            os.chdir(tmp_path)
            try:
                # Re-import the module so REPO_ROOT picks up the temp dir.
                shutil.rmtree(agentic / "CONTEXT", ignore_errors=True)
                validate_fresh = _load_module(
                    "agentic_validate_memory_fresh", "validate_memory.py"
                )
                buf_err = io.StringIO()
                with redirect_stderr(buf_err):
                    rc = validate_fresh.main()
            finally:
                os.chdir(old_cwd)

            self.assertEqual(
                rc, 0, f"validate_memory exit was {rc}: {buf_err.getvalue()}"
            )
            self.assertFalse(
                (agentic / "CONTEXT").exists(),
                ".agentic/CONTEXT must not be created by the read-only validator",
            )


class RouteTaskSmoke(unittest.TestCase):
    REQUIRED_KEYS = (
        "task",
        "confidence",
        "graph_available",
        "graph_source",
        "fallback_active",
        "selected_paths",
        "selection_reasons",
        "graph_nodes",
        "dependency_paths",
        "related_tests",
        "subsystem_files",
        "memory_files",
        "risk_tags",
        "unknowns",
        "stop_conditions",
    )

    def _run(self, task: str) -> dict:
        route = _load_module("agentic_route_task", "route_task.py")
        with _CwdRepoRoot():
            buf_out = io.StringIO()
            buf_err = io.StringIO()
            with redirect_stdout(buf_out), redirect_stderr(buf_err):
                rc = route.main(["route_task.py", task])
        self.assertEqual(rc, 0, f"route_task exit was {rc}: {buf_err.getvalue()}")
        bundle = json.loads(buf_out.getvalue())
        return bundle

    def test_bundle_has_v2_contract(self) -> None:
        bundle = self._run("audit realtime token rate limiting in the backend")
        for key in self.REQUIRED_KEYS:
            self.assertIn(key, bundle, f"bundle missing key: {key}")
        self.assertIsInstance(bundle["selected_paths"], list)
        self.assertIsInstance(bundle["selection_reasons"], dict)
        self.assertIsInstance(bundle["graph_nodes"], list)
        self.assertIsInstance(bundle["dependency_paths"], list)
        self.assertIn(bundle["confidence"], {"low", "medium", "high"})
        self.assertTrue(CONTEXT_OUT.is_file(), "context cache not written")

    def test_user_named_anchor_is_honoured(self) -> None:
        bundle = self._run("review backend/src/routes/realtime.ts for cors handling")
        self.assertIn(
            "backend/src/routes/realtime.ts",
            bundle["selected_paths"],
            "explicit user-named anchor should appear in selected_paths",
        )
        reasons = bundle["selection_reasons"]
        anchor_reason = reasons.get("backend/src/routes/realtime.ts", "")
        self.assertTrue(
            anchor_reason.startswith("user-named"),
            f"anchor reason should mark user-named: {anchor_reason!r}",
        )

    def test_uses_understand_anything_when_available(self) -> None:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        graph_path = cfg["graph"]["path"]
        if not (REPO_ROOT / graph_path).is_file():
            self.skipTest("graph artifact not present in this run")
        bundle = self._run("explain how the access gate middleware enforces the password")
        self.assertTrue(bundle["graph_available"])
        self.assertFalse(bundle["fallback_active"])
        self.assertEqual(bundle["graph_source"], graph_path)

    def test_user_named_path_not_in_graph_is_anchored(self) -> None:
        # ``package.json`` exists on disk but the understand-anything graph
        # indexes source-code nodes; this exercises the priority-1 filesystem
        # anchor pass so a user-named file is added even if it isn't a graph
        # node and even if graph keyword search would otherwise saturate the
        # bundle.
        bundle = self._run("review package.json to align with the workspace settings")
        self.assertIn("package.json", bundle["selected_paths"])
        reason = bundle["selection_reasons"]["package.json"]
        self.assertTrue(
            reason.startswith("user-named"),
            f"package.json should be user-named, got: {reason!r}",
        )


class RelatedTestsUnit(unittest.TestCase):
    """Unit tests for ``_related_tests_for`` glob-driven discovery."""

    def setUp(self) -> None:
        self.route = _load_module("agentic_route_task", "route_task.py")

    def test_uses_test_discovery_globs_when_provided(self) -> None:
        # Given a single explicit source path, the configured globs should
        # surface its ``*.test.ts`` sibling without scanning the whole
        # ``tests/`` tree by substring (regression for Item 3).
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        with _CwdRepoRoot():
            related = self.route._related_tests_for(
                ["frontend/src/realtimeTokenClient.ts"], cfg.get("test_discovery") or []
            )
        self.assertIn("tests/frontend/unit/realtimeTokenClient.test.ts", related)

    def test_falls_back_to_tests_dir_when_no_patterns(self) -> None:
        # With no globs configured, behaviour degrades to scanning ``tests/``
        # only (preserves the previous behaviour as a safety net).
        with _CwdRepoRoot():
            related = self.route._related_tests_for(
                ["frontend/src/realtimeTokenClient.ts"], []
            )
        self.assertIn("tests/frontend/unit/realtimeTokenClient.test.ts", related)

    def test_skips_test_files_as_sources(self) -> None:
        # When the selected path is itself a test, its stem must not be used
        # to discover further tests — otherwise stems like ``realtime`` from
        # ``realtime.test.ts`` would seed unrelated matches.
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        with _CwdRepoRoot():
            related = self.route._related_tests_for(
                ["tests/backend/integration/routes/realtime.test.ts"],
                cfg.get("test_discovery") or [],
            )
        self.assertEqual(related, [])


class GlobMatchUnit(unittest.TestCase):
    """Unit tests for the glob translator used by routing overlays."""

    def setUp(self) -> None:
        self.route = _load_module("agentic_route_task", "route_task.py")

    def test_double_star_matches_top_level(self) -> None:
        # The legacy ``**``→``*`` substitution failed to match top-level
        # paths because ``*/auth/*`` requires a non-empty prefix. The new
        # translator treats ``**/`` as "zero or more path segments".
        self.assertTrue(self.route._glob_match("**/auth/**", "auth/login.ts"))
        self.assertTrue(self.route._glob_match("**/auth/**", "backend/auth/login.ts"))

    def test_double_star_test_globs(self) -> None:
        self.assertTrue(self.route._glob_match("**/*.test.*", "tests/foo.test.ts"))
        self.assertTrue(
            self.route._glob_match("**/__tests__/**", "frontend/src/__tests__/x.ts")
        )
        self.assertFalse(self.route._glob_match("**/*.test.*", "src/foo.ts"))

    def test_single_star_does_not_cross_segments(self) -> None:
        self.assertFalse(self.route._glob_match("*.ts", "a/b.ts"))
        self.assertTrue(self.route._glob_match("*.ts", "b.ts"))


class UpdateMemorySmoke(unittest.TestCase):
    def test_runs_and_writes_marker(self) -> None:
        update = _load_module("agentic_update_memory", "update_memory.py")
        marker = REPO_ROOT / ".agentic" / "CONTEXT" / "last_update_ref"
        if marker.exists():
            marker.unlink()
        with _CwdRepoRoot():
            buf_out = io.StringIO()
            buf_err = io.StringIO()
            with redirect_stdout(buf_out), redirect_stderr(buf_err):
                rc = update.main()
        self.assertEqual(rc, 0, f"update_memory exit was {rc}: {buf_err.getvalue()}")
        self.assertTrue(marker.is_file(), "last_update_ref marker not written")
        self.assertIn("agenticOS-update summary", buf_out.getvalue())


if __name__ == "__main__":
    unittest.main()
