from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional
from urllib.parse import urlsplit

from ..cache.memory_cache import MemoryCache
from ..config import Settings
from ..fetch.client import fetch_html
from ..fetch.headless import render_page_html
from ..parse.confidence import compute_confidence
from ..parse.heuristic import extract_with_heuristics
from ..parse.jsonld import extract_from_jsonld
from ..parse.microdata import extract_from_microdata
from ..parse.normalize import normalize_recipe
from ..security.url_validation import normalize_url


@dataclass
class PipelineResult:
    recipe_response: dict
    strategy: str
    domain: str
    upstream_status: int
    fetch_timing_ms: float


async def run_pipeline(
    url: str,
    settings: Settings,
    cache: MemoryCache[dict],
    request_id: str,
) -> PipelineResult:
    canonical_url = normalize_url(url)
    cached = cache.get(canonical_url)
    if cached:
        return PipelineResult(
            recipe_response=cached,
            strategy=cached["recipe"]["source"]["strategy"] if cached.get("recipe") else "cache",
            domain=cached["recipe"]["source"]["domain"] if cached.get("recipe") else "",
            upstream_status=200,
            fetch_timing_ms=0.0,
        )

    fetch_result = await fetch_html(canonical_url, settings, request_id)
    cache_key = normalize_url(fetch_result.final_url)
    if cache_key != canonical_url:
        cached_final = cache.get(cache_key)
        if cached_final:
            return PipelineResult(
                recipe_response=cached_final,
                strategy=cached_final["recipe"]["source"]["strategy"] if cached_final.get("recipe") else "cache",
                domain=cached_final["recipe"]["source"]["domain"] if cached_final.get("recipe") else "",
                upstream_status=fetch_result.upstream_status,
                fetch_timing_ms=fetch_result.elapsed_ms,
            )
    domain = urlsplit(fetch_result.final_url).hostname or ""

    strategy_order = [item.strip() for item in settings.importer_strategy_order.split(",") if item.strip()]
    warnings: List[str] = []
    recipe_data: Optional[dict] = None
    used_strategy = "unknown"

    html = fetch_result.content

    for strategy in strategy_order:
        if strategy == "jsonld":
            recipe_data = extract_from_jsonld(html)
            if recipe_data:
                used_strategy = "jsonld"
                break
        elif strategy == "microdata":
            recipe_data = extract_from_microdata(html)
            if recipe_data:
                used_strategy = "microdata"
                break
        elif strategy == "heuristic":
            recipe_data = extract_with_heuristics(html)
            if recipe_data:
                used_strategy = "heuristic"
                break
        elif strategy == "headless":
            if not settings.enable_headless:
                warnings.append("JS_RENDERING_REQUIRED_SUSPECTED")
                continue
            if settings.headless_allowlist_domains and domain.lower() not in settings.headless_allowlist_domains:
                warnings.append("JS_RENDERING_REQUIRED_SUSPECTED")
                continue
            rendered_html = await render_page_html(fetch_result.final_url, settings, request_id)
            if not rendered_html:
                warnings.append("JS_RENDERING_REQUIRED_SUSPECTED")
                continue
            recipe_data = extract_from_jsonld(rendered_html)
            if recipe_data:
                used_strategy = "headless_jsonld"
                html = rendered_html
                break
            recipe_data = extract_with_heuristics(rendered_html)
            if recipe_data:
                used_strategy = "headless_heuristic"
                html = rendered_html
                break

    if not recipe_data:
        recipe_data = {"title": None, "ingredients": [], "steps": []}
        used_strategy = used_strategy if used_strategy != "unknown" else "heuristic"
        warnings.append("NO_RECIPE_SCHEMA_FOUND")

    normalized = normalize_recipe(
        recipe_data,
        strategy=used_strategy,
        source_url=fetch_result.final_url,
        domain=domain,
    )

    confidence, confidence_warnings, missing_fields = compute_confidence(normalized, used_strategy)
    combined_warnings = list(dict.fromkeys(warnings + confidence_warnings))

    response_payload = {
        "recipe": normalized.model_dump(),
        "confidence": confidence,
        "warnings": combined_warnings,
        "missing_fields": missing_fields,
    }

    cache.set(cache_key, response_payload)
    if cache_key != canonical_url:
        cache.set(canonical_url, response_payload)

    return PipelineResult(
        recipe_response=response_payload,
        strategy=used_strategy,
        domain=domain,
        upstream_status=fetch_result.upstream_status,
        fetch_timing_ms=fetch_result.elapsed_ms,
    )
