from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from ..models import RecipeDraft, RecipeSource
from ..utils.text import clean_lines, normalize_whitespace
from ..utils.time import duration_to_minutes


def _extract_time_minutes(value: Optional[str | int]) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    return duration_to_minutes(value)


def normalize_recipe(
    data: Dict[str, Any],
    *,
    strategy: str,
    source_url: str,
    domain: str,
) -> RecipeDraft:
    raw_title = data.get("title")
    title = normalize_whitespace(raw_title if isinstance(raw_title, str) else None)

    raw_ingredients_list = data.get("ingredients")
    raw_ingredients: list[str] = []
    if isinstance(raw_ingredients_list, list):
        raw_ingredients = [str(item) for item in raw_ingredients_list if item is not None]

    raw_steps_list = data.get("steps")
    raw_steps: list[str] = []
    if isinstance(raw_steps_list, list):
        raw_steps = [str(item) for item in raw_steps_list if item is not None]

    ingredients = clean_lines(raw_ingredients)
    steps = clean_lines(raw_steps)

    raw_servings = data.get("servings")
    raw_image = data.get("image_url")
    raw_author = data.get("author")

    servings = normalize_whitespace(raw_servings if isinstance(raw_servings, str) else None)
    image_url = normalize_whitespace(raw_image if isinstance(raw_image, str) else None)
    author = normalize_whitespace(raw_author if isinstance(raw_author, str) else None)

    raw_prep = data.get("prep_time")
    raw_cook = data.get("cook_time")
    raw_total = data.get("total_time")

    prep_time_minutes = _extract_time_minutes(raw_prep if isinstance(raw_prep, (str, int)) else None)
    cook_time_minutes = _extract_time_minutes(raw_cook if isinstance(raw_cook, (str, int)) else None)
    total_time_minutes = _extract_time_minutes(raw_total if isinstance(raw_total, (str, int)) else None)

    source = RecipeSource(
        url=source_url,
        domain=domain,
        strategy=strategy,
        retrieved_at=datetime.now(timezone.utc),
    )

    return RecipeDraft(
        title=title,
        ingredients=ingredients,
        steps=steps,
        servings=servings,
        prep_time_minutes=prep_time_minutes,
        cook_time_minutes=cook_time_minutes,
        total_time_minutes=total_time_minutes,
        image_url=image_url,
        author=author,
        source=source,
    )
