#!/usr/bin/env python3
"""Regression tests for Agentic OS task routing helpers."""

from __future__ import annotations

import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path

from scripts.agentic.route_task import MAX_SELECTED_PATHS, _keyword_part_matches, main


class KeywordPartMatchesTest(unittest.TestCase):
    def test_does_not_match_short_keyword_prefixes_inside_unrelated_tokens(self) -> None:
        self.assertFalse(_keyword_part_matches("ui", {"uuid"}))
        self.assertFalse(_keyword_part_matches("api", {"apical"}))
        self.assertFalse(_keyword_part_matches("web", {"webrtc"}))
        self.assertFalse(_keyword_part_matches("auth", {"author"}))

    def test_still_matches_exact_short_keywords(self) -> None:
        self.assertTrue(_keyword_part_matches("api", {"api"}))
        self.assertTrue(_keyword_part_matches("ui", {"ui"}))

    def test_still_matches_limited_word_forms_and_aliases(self) -> None:
        self.assertTrue(_keyword_part_matches("auth", {"authorization"}))
        self.assertTrue(_keyword_part_matches("test", {"testing"}))
        self.assertTrue(_keyword_part_matches("schema", {"schemas"}))


class RouteTaskBundleTest(unittest.TestCase):
    def _write_fixture(
        self,
        root: Path,
        entries: list[dict[str, object]],
        subsystem_keywords: dict[str, list[str]] | None = None,
    ) -> None:
        (root / ".agentic" / "CONFIG").mkdir(parents=True)
        (root / ".agentic" / "CONTEXT").mkdir()
        (root / ".agentic" / "PROJECT_BRIEF.md").write_text("# Brief\n", encoding="utf-8")
        (root / ".agentic" / "MEMORY_INDEX.md").write_text("# Memory\n", encoding="utf-8")
        (root / ".agentic" / "CONFIG" / "agentic.json").write_text(
            json.dumps({"subsystem_keywords": subsystem_keywords or {}}),
            encoding="utf-8",
        )
        (root / ".agentic" / "CODEMAP.json").write_text(
            json.dumps({"entries": entries}),
            encoding="utf-8",
        )

    def _run_route(self, root: Path, task: str) -> dict[str, object]:
        original_cwd = Path.cwd()
        stdout = io.StringIO()
        try:
            os.chdir(root)
            with contextlib.redirect_stdout(stdout):
                rc = main(["route_task.py", task])
        finally:
            os.chdir(original_cwd)

        bundle = json.loads(stdout.getvalue())
        self.assertEqual(0, rc)
        return bundle

    def test_selected_paths_excludes_scored_directory_entries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts" / "agentic").mkdir(parents=True)
            (root / "scripts" / "agentic" / "route_task.py").write_text("# route\n", encoding="utf-8")
            self._write_fixture(
                root,
                [
                    {
                        "path": "scripts",
                        "kind": "dir",
                        "subsystem": "scripts",
                        "role": "supporting",
                        "risk_tags": [],
                        "read_triggers": ["routing"],
                        "related_tests": [],
                    },
                    {
                        "path": "scripts/agentic/route_task.py",
                        "kind": "file",
                        "subsystem": "scripts",
                        "role": "supporting",
                        "risk_tags": [],
                        "read_triggers": ["route_task.py"],
                        "related_tests": ["scripts/agentic/test_route_task.py"],
                    },
                ],
            )

            bundle = self._run_route(root, "routing")
            self.assertNotIn("scripts", bundle["selected_paths"])
            self.assertIn("scripts/agentic/route_task.py", bundle["selected_paths"])

    def test_exact_path_reference_includes_existing_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rate_limit_path = root / "backend" / "src" / "middleware" / "rateLimit.ts"
            rate_limit_path.parent.mkdir(parents=True)
            rate_limit_path.write_text("export const value = 1;\n", encoding="utf-8")
            self._write_fixture(
                root,
                [
                    {
                        "path": "backend/src/middleware/rateLimit.ts",
                        "kind": "file",
                        "subsystem": "api",
                        "role": "supporting",
                        "risk_tags": ["security"],
                        "read_triggers": [],
                        "related_tests": ["backend/src/middleware/rateLimit.test.ts"],
                    }
                ],
                {
                    "api": ["api"],
                    "web": ["web"],
                    "shared": ["shared"],
                },
            )

            bundle = self._run_route(
                root,
                "Fix backend/src/middleware/rateLimit.ts across api web shared boundaries",
            )

            self.assertIn("backend/src/middleware/rateLimit.ts", bundle["selected_paths"])
            self.assertFalse(
                any("multiple subsystems" in stop for stop in bundle["stop_conditions"])
            )

    def test_basename_reference_includes_existing_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rate_limit_path = root / "backend" / "src" / "middleware" / "rateLimit.ts"
            rate_limit_path.parent.mkdir(parents=True)
            rate_limit_path.write_text("export const value = 1;\n", encoding="utf-8")
            self._write_fixture(
                root,
                [
                    {
                        "path": "backend/src/middleware/rateLimit.ts",
                        "kind": "file",
                        "subsystem": "api",
                        "role": "supporting",
                        "risk_tags": ["security"],
                        "read_triggers": [],
                        "related_tests": ["backend/src/middleware/rateLimit.test.ts"],
                    }
                ],
            )

            bundle = self._run_route(root, "Fix rateLimit.ts")

            self.assertIn("backend/src/middleware/rateLimit.ts", bundle["selected_paths"])

    def test_function_and_file_hint_includes_existing_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rate_limit_path = root / "backend" / "src" / "middleware" / "rateLimit.ts"
            rate_limit_path.parent.mkdir(parents=True)
            rate_limit_path.write_text(
                "export function clientKeyFromHeaders() {}\n",
                encoding="utf-8",
            )
            self._write_fixture(
                root,
                [
                    {
                        "path": "backend/src/middleware/rateLimit.ts",
                        "kind": "file",
                        "subsystem": "api",
                        "role": "supporting",
                        "risk_tags": ["security"],
                        "read_triggers": [],
                        "related_tests": ["backend/src/middleware/rateLimit.test.ts"],
                    }
                ],
            )

            bundle = self._run_route(root, "Fix clientKeyFromHeaders in rateLimit.ts")

            self.assertIn("backend/src/middleware/rateLimit.ts", bundle["selected_paths"])

    def test_filesystem_explicit_matches_skip_build_cache_and_venv_dirs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            selected_path = root / "src" / "target.py"
            ignored_paths = [
                root / ".venv" / "lib" / "target.py",
                root / "venv" / "target.py",
                root / "build" / "target.py",
                root / "dist" / "target.py",
                root / "__pycache__" / "target.py",
                root / ".pytest_cache" / "target.py",
                root / ".cache" / "target.py",
                root / "package.egg-info" / "target.py",
            ]
            for path in [selected_path, *ignored_paths]:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("# target\n", encoding="utf-8")
            self._write_fixture(root, [])

            bundle = self._run_route(root, "Fix target.py")

            self.assertEqual(["src/target.py"], bundle["selected_paths"])

    def test_filesystem_explicit_matches_are_capped_to_selected_path_limit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for index in range(MAX_SELECTED_PATHS + 3):
                path = root / f"pkg_{index:02d}" / "target.py"
                path.parent.mkdir(parents=True)
                path.write_text("# target\n", encoding="utf-8")
            self._write_fixture(root, [])

            bundle = self._run_route(root, "Fix target.py")

            self.assertLessEqual(len(bundle["selected_paths"]), MAX_SELECTED_PATHS)


if __name__ == "__main__":
    unittest.main()
