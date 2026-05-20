#!/usr/bin/env python3
"""Regression tests for Agentic OS memory update helpers."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.agentic.update_memory import _load_json


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


if __name__ == "__main__":
    unittest.main()
