"""Integration tests for recipes browse endpoint."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from prisma.errors import PrismaError


pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")


def _make_author(idx: int = 1, **overrides) -> SimpleNamespace:
    data = {
        "id": f"author-{idx}",
        "name": f"Chef {idx}",
        "avatarUrl": f"https://cdn.test/avatar-{idx}.jpg",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _make_recipe_details(**overrides) -> SimpleNamespace:
    data = {
        "course": "dinner",
        "courses": json.dumps(["dinner"]),
        "difficulty": "easy",
        "totalTime": 45,
        "servings": 4,
        "ingredients": "tomato, basil",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _make_post(**overrides) -> SimpleNamespace:
    data = {
        "id": "recipe-1",
        "title": "Tomato Soup",
        "mainPhotoUrl": "https://cdn.test/recipe.jpg",
        "author": _make_author(),
        "recipeDetails": _make_recipe_details(),
        "tags": [],
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _make_tag(name: str) -> SimpleNamespace:
    return SimpleNamespace(tag=SimpleNamespace(id=f"tag-{name}", name=name))


def _setup_posts(mock_prisma, posts, cooked_events=None):
    mock_prisma.post.find_many = AsyncMock(return_value=posts)
    mock_prisma.cookedevent.find_many = AsyncMock(return_value=cooked_events or [])


def test_browse_recipes_success(client, mock_prisma, member_auth):
    post = _make_post(tags=[_make_tag("spicy")])
    _setup_posts(mock_prisma, [post])

    response = client.get("/recipes", headers=member_auth)

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["items"][0]["id"] == post.id
    assert body["items"][0]["cookedStats"] == {"timesCooked": 0, "averageRating": None}


def test_browse_recipes_pagination(client, mock_prisma, member_auth):
    posts = [_make_post(id="recipe-1"), _make_post(id="recipe-2")]
    _setup_posts(mock_prisma, posts)

    response = client.get("/recipes?limit=1&offset=2", headers=member_auth)

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["hasMore"] is True
    assert data["nextOffset"] == 3


def test_browse_recipes_only_has_recipe_details(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes", headers=member_auth)

    assert response.status_code == 200
    where = mock_prisma.post.find_many.await_args.kwargs["where"]
    assert where["familySpaceId"] == "family_test_123"
    assert where["hasRecipeDetails"] is True


def test_browse_recipes_includes_cooked_stats(client, mock_prisma, member_auth):
    post = _make_post(id="recipe-10")
    cooked = [SimpleNamespace(postId="recipe-10", rating=5), SimpleNamespace(postId="recipe-10", rating=3), SimpleNamespace(postId="recipe-10", rating=None)]
    _setup_posts(mock_prisma, [post], cooked_events=cooked)

    response = client.get("/recipes", headers=member_auth)

    assert response.status_code == 200
    stats = response.json()["items"][0]["cookedStats"]
    assert stats == {"timesCooked": 3, "averageRating": 4}


def test_browse_recipes_includes_courses(client, mock_prisma, member_auth):
    details = _make_recipe_details(courses=json.dumps(["breakfast", "snack"]))
    post = _make_post(recipeDetails=details)
    _setup_posts(mock_prisma, [post])

    response = client.get("/recipes", headers=member_auth)

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["courses"] == ["breakfast", "snack"]
    assert item["primaryCourse"] == "breakfast"


def test_browse_recipes_includes_tags(client, mock_prisma, member_auth):
    tags = [_make_tag("spicy"), _make_tag("quick")]
    post = _make_post(tags=tags)
    _setup_posts(mock_prisma, [post])

    response = client.get("/recipes", headers=member_auth)

    assert response.status_code == 200
    assert response.json()["items"][0]["tags"] == ["spicy", "quick"]


def test_browse_recipes_requires_auth(client):
    response = client.get("/recipes")

    assert response.status_code == 401


def test_browse_recipes_prisma_error(client, mock_prisma, member_auth):
    mock_prisma.post.find_many = AsyncMock(side_effect=PrismaError("err", "msg"))

    response = client.get("/recipes", headers=member_auth)

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"


def test_browse_recipes_search_by_title(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?q=Soup", headers=member_auth)

    assert response.status_code == 200
    where = mock_prisma.post.find_many.await_args.kwargs["where"]
    assert where["AND"][0]["title"] == {"contains": "Soup", "mode": "insensitive"}


def test_browse_recipes_search_case_insensitive(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?q=%20SpIcE%20%20", headers=member_auth)

    assert response.status_code == 200
    where = mock_prisma.post.find_many.await_args.kwargs["where"]
    assert where["AND"][0]["title"]["contains"] == "SpIcE"
    assert where["AND"][0]["title"]["mode"] == "insensitive"


def test_browse_recipes_filter_single_course(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?course=breakfast", headers=member_auth)

    assert response.status_code == 200
    course_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert course_filter["OR"][0]["recipeDetails"]["is"]["OR"][0] == {"course": "breakfast"}


def test_browse_recipes_filter_multiple_courses(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?course=breakfast&course=dinner", headers=member_auth)

    assert response.status_code == 200
    course_clause = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert len(course_clause["OR"]) == 2


def test_browse_recipes_invalid_course_ignored(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?course=invalid", headers=member_auth)

    assert response.status_code == 200
    where = mock_prisma.post.find_many.await_args.kwargs["where"]
    assert "AND" not in where


def test_browse_recipes_filter_single_tag(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?tags=spicy", headers=member_auth)

    assert response.status_code == 200
    tag_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert tag_filter == {"tags": {"some": {"tag": {"name": "spicy"}}}}


def test_browse_recipes_filter_multiple_tags(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?tags=spicy&tags=quick", headers=member_auth)

    assert response.status_code == 200
    filters = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"]
    assert filters == [
        {"tags": {"some": {"tag": {"name": "spicy"}}}},
        {"tags": {"some": {"tag": {"name": "quick"}}}},
    ]


def test_browse_recipes_filter_tags_deduplicate_values(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?tags=spicy&tags=spicy", headers=member_auth)

    assert response.status_code == 200
    filters = mock_prisma.post.find_many.await_args.kwargs["where"].get("AND", [])
    assert filters == [{"tags": {"some": {"tag": {"name": "spicy"}}}}]


def test_browse_recipes_filter_tags_ignores_empty_values(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?tags=&tags=quick", headers=member_auth)

    assert response.status_code == 200
    filters = mock_prisma.post.find_many.await_args.kwargs["where"].get("AND", [])
    assert filters == [{"tags": {"some": {"tag": {"name": "quick"}}}}]


def test_browse_recipes_filter_difficulty(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?difficulty=hard", headers=member_auth)

    assert response.status_code == 200
    difficulty_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert difficulty_filter == {"recipeDetails": {"is": {"difficulty": {"in": ["hard"]}}}}


def test_browse_recipes_filter_multiple_difficulties(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?difficulty=easy&difficulty=medium", headers=member_auth)

    assert response.status_code == 200
    difficulty_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert difficulty_filter == {"recipeDetails": {"is": {"difficulty": {"in": ["easy", "medium"]}}}}


def test_browse_recipes_filter_author(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?authorId=author-1", headers=member_auth)

    assert response.status_code == 200
    author_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert author_filter == {"authorId": {"in": ["author-1"]}}


def test_browse_recipes_filter_multiple_authors(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?authorId=author-1&authorId=author-2", headers=member_auth)

    assert response.status_code == 200
    author_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert author_filter == {"authorId": {"in": ["author-1", "author-2"]}}


def test_browse_recipes_filter_time_range(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?totalTimeMin=10&totalTimeMax=50", headers=member_auth)

    assert response.status_code == 200
    time_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert time_filter == {"recipeDetails": {"is": {"totalTime": {"gte": 10, "lte": 50}}}}


def test_browse_recipes_filter_time_min_only(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?totalTimeMin=15", headers=member_auth)

    assert response.status_code == 200
    time_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert time_filter == {"recipeDetails": {"is": {"totalTime": {"gte": 15}}}}


def test_browse_recipes_filter_time_max_only(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?totalTimeMax=90", headers=member_auth)

    assert response.status_code == 200
    time_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert time_filter == {"recipeDetails": {"is": {"totalTime": {"lte": 90}}}}


def test_browse_recipes_filter_servings_range(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?servingsMin=2&servingsMax=6", headers=member_auth)

    assert response.status_code == 200
    servings_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert servings_filter == {"recipeDetails": {"is": {"servings": {"gte": 2, "lte": 6}}}}


def test_browse_recipes_filter_servings_min_only(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?servingsMin=3", headers=member_auth)

    assert response.status_code == 200
    servings_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert servings_filter == {"recipeDetails": {"is": {"servings": {"gte": 3}}}}


def test_browse_recipes_filter_servings_max_only(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?servingsMax=8", headers=member_auth)

    assert response.status_code == 200
    servings_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert servings_filter == {"recipeDetails": {"is": {"servings": {"lte": 8}}}}


def test_browse_recipes_filter_ingredient(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?ingredients=garlic", headers=member_auth)

    assert response.status_code == 200
    ingredient_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert ingredient_filter == {"recipeDetails": {"is": {"ingredients": {"contains": "garlic"}}}}


def test_browse_recipes_filter_multiple_ingredients(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?ingredients=garlic&ingredients=onion", headers=member_auth)

    assert response.status_code == 200
    filters = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"]
    assert filters == [
        {"recipeDetails": {"is": {"ingredients": {"contains": "garlic"}}}},
        {"recipeDetails": {"is": {"ingredients": {"contains": "onion"}}}},
    ]


def test_browse_recipes_max_5_ingredients(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])
    query = "&".join(f"ingredients=ing{i}" for i in range(6))

    response = client.get(f"/recipes?{query}", headers=member_auth)

    assert response.status_code == 200
    filters = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"]
    assert len(filters) == 5


def test_browse_recipes_sort_recent(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?sort=recent", headers=member_auth)

    assert response.status_code == 200
    order = mock_prisma.post.find_many.await_args.kwargs["order"]
    assert order == [{"createdAt": "desc"}]


def test_browse_recipes_sort_alpha(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?sort=alpha", headers=member_auth)

    assert response.status_code == 200
    order = mock_prisma.post.find_many.await_args.kwargs["order"]
    assert order == [{"title": "asc"}, {"createdAt": "desc"}]


def test_browse_recipes_multiple_filters(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])
    params = (
        "q=Soup&course=dinner&tags=spicy&difficulty=easy&authorId=author-1&"
        "totalTimeMin=10&servingsMin=2&ingredients=garlic"
    )

    response = client.get(f"/recipes?{params}", headers=member_auth)

    assert response.status_code == 200
    and_filters = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"]
    assert any("title" in clause for clause in and_filters)
    assert any("OR" in clause for clause in and_filters)
    assert any("tags" in clause for clause in and_filters)
    assert any(clause.get("authorId") for clause in and_filters)
    assert any("totalTime" in clause.get("recipeDetails", {}).get("is", {}) for clause in and_filters)
    assert any("servings" in clause.get("recipeDetails", {}).get("is", {}) for clause in and_filters)
    assert any("ingredients" in clause.get("recipeDetails", {}).get("is", {}) for clause in and_filters)


def test_browse_recipes_limit_parameter_uses_take_plus_one(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?limit=5", headers=member_auth)

    assert response.status_code == 200
    assert mock_prisma.post.find_many.await_args.kwargs["take"] == 6


def test_browse_recipes_offset_parameter_passed_to_skip(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?offset=10", headers=member_auth)

    assert response.status_code == 200
    assert mock_prisma.post.find_many.await_args.kwargs["skip"] == 10


def test_browse_recipes_author_filter_dedupes_ids(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?authorId=author-1&authorId=author-1", headers=member_auth)

    assert response.status_code == 200
    author_filter = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"][0]
    assert author_filter == {"authorId": {"in": ["author-1"]}}


def test_browse_recipes_ingredients_deduplicate_values(client, mock_prisma, member_auth):
    _setup_posts(mock_prisma, [])

    response = client.get("/recipes?ingredients=garlic&ingredients=garlic", headers=member_auth)

    assert response.status_code == 200
    filters = mock_prisma.post.find_many.await_args.kwargs["where"]["AND"]
    assert len(filters) == 1


def test_browse_recipes_primary_course_fallback(client, mock_prisma, member_auth):
    details = _make_recipe_details(courses=json.dumps([]), course="lunch")
    post = _make_post(recipeDetails=details)
    _setup_posts(mock_prisma, [post])

    response = client.get("/recipes", headers=member_auth)

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["courses"] == []
    assert item["primaryCourse"] == "lunch"
