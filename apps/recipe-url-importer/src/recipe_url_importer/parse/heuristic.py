from __future__ import annotations

import re
from typing import Dict, List, Optional

from bs4 import BeautifulSoup
from readability import Document

from ..utils.text import clean_lines, normalize_whitespace

INGREDIENT_KEYWORDS = [
    "ingredient",
    "ingredients",
    "what you'll need",
    "what you need",
]

INSTRUCTION_KEYWORDS = [
    "instruction",
    "instructions",
    "directions",
    "method",
    "steps",
]


def _matches_heading(text: str, keywords: List[str]) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in keywords)


def _extract_section_text(start_node) -> List[str]:
    items: List[str] = []
    current = start_node.find_next_sibling()
    while current:
        if current.name and re.match(r"h[1-6]", current.name):
            break
        if current.name in {"ul", "ol"}:
            for li in current.find_all("li"):
                text = normalize_whitespace(li.get_text(" ", strip=True))
                if text:
                    items.append(text)
        elif current.name in {"p", "div"}:
            text = normalize_whitespace(current.get_text(" ", strip=True))
            if text:
                # Split paragraphs that contain numbered steps into separate entries.
                if re.match(r"^\d+[\).\s]", text):
                    parts = [part for part in re.split(r"\s*\d+[\).\s]\s*", text) if part]
                    items.extend(parts)
                else:
                    items.append(text)
        current = current.find_next_sibling()
    return clean_lines(items)


def _find_heading_section(soup: BeautifulSoup, keywords: List[str]) -> Optional[List[str]]:
    for heading in soup.find_all(re.compile(r"h[1-6]")):
        text = normalize_whitespace(heading.get_text(" ", strip=True))
        if text and _matches_heading(text, keywords):
            section_items = _extract_section_text(heading)
            if section_items:
                return section_items
    return None


def extract_with_heuristics(html: str) -> Optional[Dict[str, object]]:
    try:
        doc = Document(html)
        readable_html = doc.summary()
        readable_title = doc.short_title()
    except Exception:
        readable_html = html
        readable_title = None

    soup = BeautifulSoup(readable_html, "lxml")
    title_tag = soup.find("h1") or soup.find("title")
    title = normalize_whitespace(title_tag.get_text(" ", strip=True)) if title_tag else None
    if readable_title and not title:
        title = normalize_whitespace(readable_title)

    ingredients = _find_heading_section(soup, INGREDIENT_KEYWORDS) or []
    instructions = _find_heading_section(soup, INSTRUCTION_KEYWORDS) or []

    if not ingredients:
        # Fallback: first list in the document.
        first_list = soup.find(["ul", "ol"])
        if first_list:
            ingredients = clean_lines(li.get_text(" ", strip=True) for li in first_list.find_all("li"))

    return {
        "title": title,
        "ingredients": ingredients,
        "steps": instructions,
    } if (ingredients or instructions or title) else None
