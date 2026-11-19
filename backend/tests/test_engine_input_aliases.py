"""Regression tests for supported aptitude answer key aliases."""

import unittest

from ml.engine import Engine


class EngineInputAliasTests(unittest.TestCase):
    def test_lowercase_keys_win_when_both_aliases_are_provided(self):
        score, breakdown = Engine().analyze({
            "logical": 20,
            "Logical": 90,
            "creative": 40,
            "Creative": 100,
        })

        self.assertEqual(score, 30.0)
        self.assertEqual(breakdown, {"logical": 20.0, "creative": 40.0})

    def test_recommendations_accept_title_case_keys(self):
        results = Engine().recommend({"Logical": 80, "Creative": 60})

        self.assertEqual(
            [(item.title, item.suitability) for item in results],
            [("UX Designer", 60.0), ("Product Manager", 58.0)],
        )

    def test_empty_breakdown_produces_zero_weighted_scores(self):
        results = Engine().recommend({})

        self.assertEqual([item.suitability for item in results], [0.0, 0.0])


if __name__ == "__main__":
    unittest.main()
