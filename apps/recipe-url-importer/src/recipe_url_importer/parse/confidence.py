from __future__ import annotations

from typing import List, Tuple

from ..models import RecipeDraft

BASE_SCORES = {
    "jsonld": 0.65,
    "microdata": 0.55,
    "heuristic": 0.35,
    "headless_jsonld": 0.60,
    "headless_heuristic": 0.40,
}


def compute_confidence(recipe: RecipeDraft, strategy: str) -> Tuple[float, List[str], List[str]]:
    base = BASE_SCORES.get(strategy, 0.0)
    score = base
    warnings: List[str] = []

    if len(recipe.ingredients) >= 3:
        score += 0.10
    if len(recipe.steps) >= 2:
        score += 0.10
    if recipe.title:
        score += 0.05

    bonus_meta = 0
    for field in [recipe.image_url, recipe.servings, recipe.prep_time_minutes, recipe.cook_time_minutes, recipe.total_time_minutes]:
        if field:
            bonus_meta += 0.02
    score += min(bonus_meta, 0.10)

    if len(recipe.ingredients) > 60:
        score -= 0.10
    if len(recipe.steps) > 50:
        score -= 0.10

    text_blob = " ".join(recipe.ingredients + recipe.steps).lower()
    if any(term in text_blob for term in ["subscribe", "sign in", "enable javascript"]):
        score -= 0.15

    missing_fields: List[str] = []
    if not recipe.title:
        missing_fields.append("title")
    if not recipe.ingredients:
        missing_fields.append("ingredients")
    if not recipe.steps:
        missing_fields.append("steps")

    if not recipe.ingredients:
        warnings.append("MISSING_INGREDIENTS")
    if not recipe.steps:
        warnings.append("MISSING_STEPS")
    if strategy.startswith("headless"):
        warnings.append("JS_RENDERING_REQUIRED_SUSPECTED")
    if strategy in {"heuristic", "headless_heuristic"}:
        warnings.append("HEURISTIC_EXTRACTION_USED")

    score = max(0.0, min(score, 1.0))
    if score < 0.65:
        warnings.append("LOW_CONFIDENCE")

    return score, warnings, missing_fields
