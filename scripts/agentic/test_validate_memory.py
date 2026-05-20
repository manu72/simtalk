#!/usr/bin/env python3
"""Regression tests for Agentic OS memory validation helpers."""
# pylint: disable=protected-access

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from scripts.agentic import validate_memory


class CuratedPathRefsTest(unittest.TestCase):
    def test_ignores_external_absolute_api_endpoints(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            md_path = root / "docs" / "guide.md"
            md_path.parent.mkdir(parents=True)
            md_path.write_text("Use `/v1/realtime/translations`.\n", encoding="utf-8")

            warnings: list[str] = []
            original_files = validate_memory.CURATED_MD_FILES
            validate_memory.CURATED_MD_FILES = [md_path]
            try:
                validate_memory._check_curated_path_refs(warnings)
            finally:
                validate_memory.CURATED_MD_FILES = original_files

            self.assertEqual([], warnings)

    def test_resolves_markdown_references_relative_to_markdown_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            md_path = root / "docs" / "guide.md"
            referenced = md_path.parent / "nested" / "target.md"
            referenced.parent.mkdir(parents=True)
            referenced.write_text("# Target\n", encoding="utf-8")
            md_path.write_text("See `nested/target.md`.\n", encoding="utf-8")

            warnings: list[str] = []
            original_files = validate_memory.CURATED_MD_FILES
            validate_memory.CURATED_MD_FILES = [md_path]
            try:
                validate_memory._check_curated_path_refs(warnings)
            finally:
                validate_memory.CURATED_MD_FILES = original_files

            self.assertEqual([], warnings)

    def test_falls_back_to_repo_root_when_file_relative_path_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            md_path = root / "docs" / "guide.md"
            md_path.parent.mkdir(parents=True)
            (root / "shared" / "target.md").parent.mkdir()
            (root / "shared" / "target.md").write_text("# Target\n", encoding="utf-8")
            md_path.write_text("See `shared/target.md`.\n", encoding="utf-8")

            warnings: list[str] = []
            original_files = validate_memory.CURATED_MD_FILES
            original_cwd = Path.cwd()
            validate_memory.CURATED_MD_FILES = [md_path]
            try:
                os.chdir(root)
                validate_memory._check_curated_path_refs(warnings)
            finally:
                os.chdir(original_cwd)
                validate_memory.CURATED_MD_FILES = original_files

            self.assertEqual([], warnings)


if __name__ == "__main__":
    unittest.main()
