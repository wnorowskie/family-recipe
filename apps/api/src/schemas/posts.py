from typing import List, Optional

from pydantic import BaseModel, Field


class Ingredient(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    unit: Optional[str] = None
    quantity: Optional[float] = Field(default=None)


class Step(BaseModel):
    text: str = Field(min_length=1)


class RecipeInput(BaseModel):
    origin: Optional[str] = None
    ingredients: List[Ingredient] = Field(default_factory=list)
    steps: List[Step] = Field(default_factory=list)
    totalTime: Optional[int] = Field(default=None, ge=0, le=720)
    servings: Optional[int] = Field(default=None, ge=1, le=50)
    course: Optional[str] = None
    courses: Optional[List[str]] = None
    difficulty: Optional[str] = None
    tags: Optional[List[str]] = None


class CreatePostRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    caption: Optional[str] = None
    recipe: Optional[RecipeInput] = None


class UpdatePostRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    caption: Optional[str] = None
    recipe: Optional[RecipeInput] = None
    changeNote: Optional[str] = Field(default=None, max_length=280)


class FavoriteResponse(BaseModel):
    favorited: bool


class CookedRequest(BaseModel):
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    note: Optional[str] = None
