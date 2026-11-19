"""Unit tests for the isolated career scoring engine."""

import unittest

from ml.engine import Engine


class EngineAnalyzeTests(unittest.TestCase):
    def setUp(self):
        self.engine = Engine()

    def test_analyze_averages_scores_and_returns_normalized_keys(self):
        score, breakdown = self.engine.analyze({"logical": 80, "creative": 60})

        self.assertEqual(score, 70.0)
        self.assertEqual(breakdown, {"logical": 80.0, "creative": 60.0})

    def test_analyze_accepts_title_case_keys(self):
        score, breakdown = self.engine.analyze({"Logical": 40, "Creative": 90})

        self.assertEqual(score, 65.0)
        self.assertEqual(breakdown, {"logical": 40.0, "creative": 90.0})

    def test_analyze_defaults_missing_answers_to_zero(self):
        score, breakdown = self.engine.analyze({})

        self.assertEqual(score, 0.0)
        self.assertEqual(breakdown, {"logical": 0.0, "creative": 0.0})


class EngineRecommendationTests(unittest.TestCase):
    def setUp(self):
        self.engine = Engine()

    def test_skill_gap_has_aligned_skill_and_score_arrays(self):
        result = self.engine.skill_gap()

        self.assertEqual(len(result.skills), len(result.user))
        self.assertEqual(len(result.skills), len(result.target))
        self.assertTrue(all(0 <= score <= 10 for score in result.user + result.target))

    def test_recommendation_weights_are_applied(self):
        recommendations = self.engine.recommend({"logical": 80, "creative": 60})

        self.assertEqual([item.title for item in recommendations], ["UX Designer", "Product Manager"])
        self.assertEqual(recommendations[0].suitability, 60.0)
        self.assertEqual(recommendations[1].suitability, 58.0)

    def test_recommendation_scores_are_capped_at_one_hundred(self):
        recommendations = self.engine.recommend({"logical": 1000, "creative": 1000})

        self.assertTrue(all(item.suitability == 100.0 for item in recommendations))


if __name__ == "__main__":
    unittest.main()
