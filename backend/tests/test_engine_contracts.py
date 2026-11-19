"""Contract tests for the career scoring engine's returned data shapes."""

import unittest

from ml.engine import CareerRecommendation, Engine, SkillGapResult


class EngineContractTests(unittest.TestCase):
    def test_analyze_does_not_mutate_input_answers(self):
        answers = {"logical": 75, "creative": 55}
        original = answers.copy()

        self.assertEqual(Engine().analyze(answers)[0], 65.0)
        self.assertEqual(answers, original)

    def test_recommendations_keep_dataclass_contract(self):
        recommendations = Engine().recommend({"logical": 80, "creative": 60})

        self.assertTrue(all(isinstance(item, CareerRecommendation) for item in recommendations))
        self.assertTrue(all(item.title and item.details for item in recommendations))
        self.assertTrue(all(isinstance(item.suitability, float) for item in recommendations))

    def test_skill_gap_returns_independent_lists(self):
        engine = Engine()
        first = engine.skill_gap()
        self.assertIsInstance(first, SkillGapResult)
        first.skills.append("Temporary test value")

        second = engine.skill_gap()
        self.assertNotIn("Temporary test value", second.skills)
        self.assertEqual(len(second.skills), len(second.user))
        self.assertEqual(len(second.skills), len(second.target))


if __name__ == "__main__":
    unittest.main()
