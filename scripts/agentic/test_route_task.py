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

from scripts.agentic.route_task import _keyword_part_matches, main


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
    def test_selected_paths_excludes_scored_directory_entries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".agentic" / "CONFIG").mkdir(parents=True)
            (root / ".agentic" / "CONTEXT").mkdir()
            (root / ".agentic" / "PROJECT_BRIEF.md").write_text("# Brief\n", encoding="utf-8")
            (root / ".agentic" / "MEMORY_INDEX.md").write_text("# Memory\n", encoding="utf-8")
            (root / ".agentic" / "CONFIG" / "agentic.json").write_text(
                json.dumps({"subsystem_keywords": {}}),
                encoding="utf-8",
            )
            (root / ".agentic" / "CODEMAP.json").write_text(
                json.dumps(
                    {
                        "entries": [
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
                        ]
                    }
                ),
                encoding="utf-8",
            )

            original_cwd = Path.cwd()
            stdout = io.StringIO()
            try:
                os.chdir(root)
                with contextlib.redirect_stdout(stdout):
                    rc = main(["route_task.py", "routing"])
            finally:
                os.chdir(original_cwd)

            bundle = json.loads(stdout.getvalue())
            self.assertEqual(0, rc)
            self.assertNotIn("scripts", bundle["selected_paths"])
            self.assertIn("scripts/agentic/route_task.py", bundle["selected_paths"])


if __name__ == "__main__":
    unittest.main()
