#!/usr/bin/env python3
"""Regression tests for Agentic OS codemap helpers."""

from __future__ import annotations

import unittest

from scripts.agentic.build_codemap import _is_default_ignored


class DefaultIgnorePartsTest(unittest.TestCase):
    def test_multi_segment_default_ignore_entries_match_path_segments(self) -> None:
        self.assertTrue(_is_default_ignored(".agentic/CONTEXT/last_context.json"))


if __name__ == "__main__":
    unittest.main()
