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
