from __future__ import annotations

from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup

from ..utils.text import normalize_whitespace


def _collect_itemprop_text(elements) -> List[str]:
    values: List[str] = []
    for el in elements:
        text = normalize_whitespace(el.get_text(" ", strip=True))
        if text:
            values.append(text)
    return values


def extract_from_microdata(html: str) -> Optional[Dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    candidates = soup.find_all(attrs={"itemscope": True, "itemtype": True})
    for candidate in candidates:
        itemtype = candidate.get("itemtype", "").lower()
        if "schema.org/recipe" not in itemtype:
            continue
        title = normalize_whitespace(candidate.find(attrs={"itemprop": "name"}).get_text(" ", strip=True)) if candidate.find(attrs={"itemprop": "name"}) else None
        ingredients_elements = candidate.find_all(attrs={"itemprop": ["recipeIngredient", "ingredients"]})
        instructions_elements = candidate.find_all(attrs={"itemprop": "recipeInstructions"})

        ingredients = _collect_itemprop_text(ingredients_elements)
        instructions = _collect_itemprop_text(instructions_elements)

        servings_el = candidate.find(attrs={"itemprop": "recipeYield"})
        prep_el = candidate.find(attrs={"itemprop": "prepTime"})
        cook_el = candidate.find(attrs={"itemprop": "cookTime"})
        total_el = candidate.find(attrs={"itemprop": "totalTime"})
        image_el = candidate.find(attrs={"itemprop": "image"})
        author_el = candidate.find(attrs={"itemprop": "author"})

        return {
            "title": title,
            "ingredients": ingredients,
            "steps": instructions,
            "servings": normalize_whitespace(servings_el.get_text(" ", strip=True)) if servings_el else None,
            "prep_time": prep_el.get("content") if prep_el else None,
            "cook_time": cook_el.get("content") if cook_el else None,
            "total_time": total_el.get("content") if total_el else None,
            "image_url": normalize_whitespace(image_el.get("content") or image_el.get("src") if image_el else None),
            "author": normalize_whitespace(author_el.get_text(" ", strip=True)) if author_el else None,
        }
    return None
