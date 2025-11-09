from dataclasses import dataclass
from typing import List, Dict
import numpy as np

@dataclass
class SkillGapResult:
    skills: List[str]
    user: List[float]
    target: List[float]

@dataclass
class CareerRecommendation:
    title: str
    suitability: float
    details: str

class Engine:
    def analyze(self, answers: Dict[str, int]):
        # normalize keys
        logical = float(answers.get("logical", answers.get("Logical", 0)))
        creative = float(answers.get("creative", answers.get("Creative", 0)))
        score = (logical + creative) / 2.0
        # store lowercase keys to align with API consumers
        breakdown = {"logical": logical, "creative": creative}
        return score, breakdown

    def skill_gap(self) -> SkillGapResult:
        skills = ["Python", "SQL", "Statistics", "Machine Learning", "Communication"]
        user = [8, 6, 9, 5, 7]
        target = [9, 8, 8, 7, 9]
        return SkillGapResult(skills, user, target)

    def recommend(self, breakdown: Dict[str, float]):
        logical = breakdown.get("logical", breakdown.get("Logical", 0))
        creative = breakdown.get("creative", breakdown.get("Creative", 0))
        ux = 0.6*creative + 0.3*logical
        pm = 0.5*logical + 0.3*creative
        return [
            CareerRecommendation("UX Designer", float(min(100, ux)), "Design and research"),
            CareerRecommendation("Product Manager", float(min(100, pm)), "Strategy and delivery"),
        ]
