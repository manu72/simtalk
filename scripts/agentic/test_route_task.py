#!/usr/bin/env python3
"""Regression tests for Agentic OS task routing helpers."""

from __future__ import annotations

import unittest

from scripts.agentic.route_task import _keyword_part_matches


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


if __name__ == "__main__":
    unittest.main()
