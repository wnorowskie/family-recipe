from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup

from ..utils.text import normalize_whitespace


def _has_recipe_type(node: Dict[str, Any]) -> bool:
    type_field = node.get("@type") or node.get("type")
    if isinstance(type_field, list):
        return any(str(t).lower() == "recipe" for t in type_field)
    if isinstance(type_field, str):
        return type_field.lower() == "recipe"
    return False


def _flatten_graph(payload: Any) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    if isinstance(payload, list):
        for item in payload:
            results.extend(_flatten_graph(item))
    elif isinstance(payload, dict):
        if _has_recipe_type(payload):
            results.append(payload)
        if "@graph" in payload and isinstance(payload["@graph"], list):
            for entry in payload["@graph"]:
                results.extend(_flatten_graph(entry))
    return results


def _extract_instructions(raw_instructions: Any) -> List[str]:
    if raw_instructions is None:
        return []
    if isinstance(raw_instructions, str):
        return [raw_instructions]
    if isinstance(raw_instructions, list):
        instructions: List[str] = []
        for item in raw_instructions:
            if isinstance(item, str):
                instructions.append(item)
            elif isinstance(item, dict) and "text" in item:
                text_value = item.get("text")
                if isinstance(text_value, str):
                    instructions.append(text_value)
        return instructions
    if isinstance(raw_instructions, dict) and "text" in raw_instructions:
        text_value = raw_instructions.get("text")
        return [text_value] if isinstance(text_value, str) else []
    return []


def _extract_image(node: Dict[str, Any]) -> Optional[str]:
    image_field = node.get("image")
    if isinstance(image_field, str):
        return image_field
    if isinstance(image_field, list) and image_field:
        first = image_field[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict) and "url" in first and isinstance(first["url"], str):
            return first["url"]
    if isinstance(image_field, dict) and "url" in image_field and isinstance(image_field["url"], str):
        return image_field["url"]
    return None


def _extract_author(node: Dict[str, Any]) -> Optional[str]:
    author_field = node.get("author")
    if isinstance(author_field, str):
        return author_field
    if isinstance(author_field, list) and author_field:
        first = author_field[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict) and "name" in first and isinstance(first["name"], str):
            return first["name"]
    if isinstance(author_field, dict) and "name" in author_field and isinstance(author_field["name"], str):
        return author_field["name"]
    return None


def extract_from_jsonld(html: str) -> Optional[Dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    scripts = soup.find_all("script", attrs={"type": "application/ld+json"})
    for script in scripts:
        try:
            data = json.loads(script.string or "{}")
        except json.JSONDecodeError:
            continue
        recipes = _flatten_graph(data)
        if not recipes and isinstance(data, dict) and _has_recipe_type(data):
            recipes = [data]
        if not recipes and isinstance(data, list):
            for entry in data:
                if isinstance(entry, dict) and _has_recipe_type(entry):
                    recipes.append(entry)
        for recipe in recipes:
            name = normalize_whitespace(recipe.get("name") if isinstance(recipe.get("name"), str) else None)
            ingredients = recipe.get("recipeIngredient") or recipe.get("ingredients")
            ingredients_list = ingredients if isinstance(ingredients, list) else []
            instructions_list = _extract_instructions(recipe.get("recipeInstructions"))
            result: Dict[str, Any] = {
                "title": name,
                "ingredients": ingredients_list,
                "steps": instructions_list,
                "servings": recipe.get("recipeYield"),
                "prep_time": recipe.get("prepTime"),
                "cook_time": recipe.get("cookTime"),
                "total_time": recipe.get("totalTime"),
                "image_url": _extract_image(recipe),
                "author": _extract_author(recipe),
            }
            return result
    return None
