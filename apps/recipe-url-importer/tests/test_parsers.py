from pathlib import Path

from recipe_url_importer.parse.confidence import compute_confidence
from recipe_url_importer.parse.heuristic import extract_with_heuristics
from recipe_url_importer.parse.jsonld import extract_from_jsonld
from recipe_url_importer.parse.normalize import normalize_recipe

FIXTURES = Path(__file__).parent / "fixtures"


def test_jsonld_graph_extraction():
    html = (FIXTURES / "jsonld_graph.html").read_text()
    data = extract_from_jsonld(html)
    assert data is not None
    recipe = normalize_recipe(data, strategy="jsonld", source_url="https://example.com/recipe", domain="example.com")
    assert recipe.title == "Test Chili"
    assert recipe.ingredients == ["1 lb beef", "1 onion"]
    assert recipe.steps == ["Brown beef.", "Add onion."]
    assert recipe.total_time_minutes == 60
    confidence, warnings, missing = compute_confidence(recipe, "jsonld")
    assert confidence >= 0.65
    assert "MISSING_STEPS" not in warnings
    assert not missing


def test_heuristic_extraction_basic():
    html = (FIXTURES / "heuristic_simple.html").read_text()
    data = extract_with_heuristics(html)
    assert data is not None
    recipe = normalize_recipe(data, strategy="heuristic", source_url="https://example.com/cookies", domain="example.com")
    assert recipe.title == "Grandma's Cookies"
    assert len(recipe.ingredients) == 3
    assert recipe.steps[0].startswith("Mix ingredients")
