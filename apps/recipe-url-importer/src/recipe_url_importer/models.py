from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, HttpUrl


class ParseOptions(BaseModel):
    prefer_language: Optional[str] = Field(default=None)
    include_debug: bool = Field(default=False)


class ParseRequest(BaseModel):
    url: HttpUrl
    options: Optional[ParseOptions] = None


class RecipeSource(BaseModel):
    url: str
    domain: str
    strategy: str
    retrieved_at: datetime


class RecipeDraft(BaseModel):
    title: Optional[str] = None
    ingredients: List[str] = Field(default_factory=list)
    steps: List[str] = Field(default_factory=list)
    servings: Optional[str] = None
    prep_time_minutes: Optional[int] = None
    cook_time_minutes: Optional[int] = None
    total_time_minutes: Optional[int] = None
    image_url: Optional[str] = None
    author: Optional[str] = None
    source: Optional[RecipeSource] = None


class ParseResponse(BaseModel):
    request_id: str
    recipe: RecipeDraft
    confidence: float
    warnings: List[str]
    missing_fields: List[str]


class ErrorResponse(BaseModel):
    request_id: str
    code: str
    message: str
