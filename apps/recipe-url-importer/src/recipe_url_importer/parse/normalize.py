from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

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
    data: Dict[str, object],
    *,
    strategy: str,
    source_url: str,
    domain: str,
) -> RecipeDraft:
    title = normalize_whitespace(data.get("title") if isinstance(data.get("title"), str) else None)
    raw_ingredients = []
    if isinstance(data.get("ingredients"), list):
        raw_ingredients = [str(item) for item in data.get("ingredients", []) if item is not None]
    raw_steps = []
    if isinstance(data.get("steps"), list):
        raw_steps = [str(item) for item in data.get("steps", []) if item is not None]

    ingredients = clean_lines(raw_ingredients)
    steps = clean_lines(raw_steps)

    servings = normalize_whitespace(data.get("servings") if isinstance(data.get("servings"), str) else None)
    image_url = normalize_whitespace(data.get("image_url") if isinstance(data.get("image_url"), str) else None)
    author = normalize_whitespace(data.get("author") if isinstance(data.get("author"), str) else None)

    prep_time_minutes = _extract_time_minutes(data.get("prep_time"))
    cook_time_minutes = _extract_time_minutes(data.get("cook_time"))
    total_time_minutes = _extract_time_minutes(data.get("total_time"))

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
