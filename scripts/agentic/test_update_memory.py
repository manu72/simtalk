#!/usr/bin/env python3
"""Regression tests for Agentic OS memory update helpers."""

from __future__ import annotations

import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.agentic.update_memory import _load_json, main


class LoadJsonTest(unittest.TestCase):
    def test_missing_file_raises_file_not_found_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing_path = Path(tmp) / "missing.json"

            with self.assertRaises(FileNotFoundError):
                _load_json(missing_path)

    def test_invalid_json_raises_json_decode_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            invalid_path = Path(tmp) / "invalid.json"
            invalid_path.write_text("{not json", encoding="utf-8")

            with self.assertRaises(json.JSONDecodeError):
                _load_json(invalid_path)


class StaleSubsystemDetectionTest(unittest.TestCase):
    def _write_memory_files(self, root: Path, subsystem_files: dict[str, str]) -> None:
        (root / ".agentic" / "CONFIG").mkdir(parents=True)
        (root / ".agentic" / "SUBSYSTEMS").mkdir(parents=True)
        (root / ".agentic" / "CONFIG" / "agentic.json").write_text(
            json.dumps({"subsystem_keywords": {"api": ["api"], "web": ["web"]}}),
            encoding="utf-8",
        )
        (root / ".agentic" / "CODEMAP.json").write_text(
            json.dumps({"entries": []}),
            encoding="utf-8",
        )
        for name, body in subsystem_files.items():
            (root / ".agentic" / "SUBSYSTEMS" / f"{name}.md").write_text(
                body,
                encoding="utf-8",
            )

    def _run_update_memory(self, root: Path) -> tuple[int, str]:
        original_cwd = Path.cwd()
        stdout = io.StringIO()
        try:
            os.chdir(root)
            with patch("scripts.agentic.update_memory._run_build_codemap", return_value=0):
                with contextlib.redirect_stdout(stdout):
                    rc = main()
        finally:
            os.chdir(original_cwd)
        return rc, stdout.getvalue()

    def test_planned_subsystem_stubs_are_not_reported_as_stale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_memory_files(
                root,
                {
                    "api": "# api\n\n> Status: planned. Code not yet implemented at init time.\n",
                    "web": "# web\n\n> Status: planned. Code not yet implemented at init time.\n",
                },
            )

            rc, output = self._run_update_memory(root)

            self.assertEqual(0, rc)
            self.assertIn("No subsystem drift detected.", output)
            self.assertNotIn("Subsystem files with no current code-map evidence:", output)
            self.assertNotIn(".agentic/SUBSYSTEMS/api.md", output)
            self.assertNotIn(".agentic/SUBSYSTEMS/web.md", output)

    def test_non_planned_subsystem_file_without_codemap_evidence_is_stale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_memory_files(
                root,
                {
                    "api": "# api\n\n> Status: maintained. Code previously existed.\n",
                    "web": "# web\n\n> Status: planned. Code not yet implemented at init time.\n",
                },
            )

            rc, output = self._run_update_memory(root)

            self.assertEqual(0, rc)
            self.assertIn("Subsystem files with no current code-map evidence:", output)
            self.assertIn(".agentic/SUBSYSTEMS/api.md", output)
            self.assertNotIn(".agentic/SUBSYSTEMS/web.md", output)


if __name__ == "__main__":
    unittest.main()
