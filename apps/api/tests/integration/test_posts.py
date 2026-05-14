"""Integration tests for posts router create endpoints."""

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from typing import Optional

from prisma.errors import PrismaError

import pytest

from src.multipart_uploads import ProcessedUpload
from src.uploads import MAX_PHOTO_COUNT
from tests.helpers.error_envelope import assert_error_envelope

pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")
POST_ID = "ckpost1234567890123456789"


def _make_recipe_payload():
    return {
        "origin": "Italy",
        "ingredients": [{"name": "Tomato", "quantity": 2, "unit": "pcs"}],
        "steps": [{"text": "Chop"}, {"text": "Cook"}],
        "totalTime": 30,
        "servings": 4,
        "courses": ["dinner"],
        "difficulty": "easy",
        "tags": [],
    }


def _stub_create_hydration(
    mock_prisma,
    *,
    post_id: str,
    title: str = "Hello",
    caption: Optional[str] = "Hi",
    main_photo_storage_key: Optional[str] = None,
    photo_storage_keys: Optional[list] = None,
    tags: Optional[list] = None,
    author_id: str = "user_test_123",
    recipe_details=None,
):
    """Wire up the mocks needed for `create_post` and `update_post` to call
    `_load_post_detail` after the underlying `prisma.post.create`.

    Post-#187 the create/update handlers re-hydrate via the same detail-load
    used by `GET /v1/posts/{id}` so the response carries resolved photo URLs
    and the standard nested shape (comments, cookedStats, reactions, etc.).
    Tests that previously asserted against the raw create return value now
    need the hydration path stubbed.
    """
    now = datetime(2024, 1, 1, tzinfo=timezone.utc)
    photo_keys = list(photo_storage_keys or [])
    hydrated = SimpleNamespace(
        id=post_id,
        title=title,
        caption=caption,
        createdAt=now,
        updatedAt=now,
        mainPhotoStorageKey=main_photo_storage_key,
        authorId=author_id,
        author=SimpleNamespace(id=author_id, name="Alice", avatarStorageKey=None),
        editor=None,
        lastEditNote=None,
        lastEditAt=None,
        photos=[
            SimpleNamespace(id=f"ph{i}", storageKey=key, sortOrder=i)
            for i, key in enumerate(photo_keys)
        ],
        recipeDetails=recipe_details,
        tags=tags or [],
    )
    mock_prisma.post.find_first = AsyncMock(return_value=hydrated)
    mock_prisma.comment.find_many = AsyncMock(return_value=[])
    mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
    mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
    mock_prisma.reaction.find_many = AsyncMock(return_value=[])


class TestCreatePost:
    def test_create_text_post(self, client, mock_prisma, member_auth):
        # Post-#187 `create_post` re-hydrates via `_load_post_detail` so the
        # response shape matches GET /posts/{id} and mirrors Next's
        # `getPostDetail` call. `_stub_create_hydration` wires up the
        # find_first + cooked/comments/favorites mocks the hydration touches.
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.post.create = AsyncMock(return_value=SimpleNamespace(id="post-1"))
        _stub_create_hydration(mock_prisma, post_id="post-1", title="Hello", caption="Hi")

        payload = {"title": "Hello", "caption": "Hi"}
        response = client.post("/posts", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["post"]["title"] == "Hello"
        assert body["post"]["photos"] == []

    def test_create_recipe_post(self, client, mock_prisma, member_auth):
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.post.create = AsyncMock(return_value=SimpleNamespace(id="post-2"))
        # The hydrated detail response shape uses `recipe` (the friendlier
        # key built by `_load_post_detail`), not the raw Prisma
        # `recipeDetails`. The recipe-detail SimpleNamespace below feeds
        # that shape so the test assertion targets the response-side key.
        recipe = SimpleNamespace(
            origin="Italy",
            ingredients=json.dumps([{"name": "Tomato", "unit": "pcs", "quantity": 2}]),
            steps=json.dumps([{"text": "Chop"}]),
            totalTime=30,
            servings=4,
            courses=json.dumps(["dinner"]),
            course="dinner",
            difficulty="easy",
        )
        _stub_create_hydration(
            mock_prisma,
            post_id="post-2",
            title="Pasta",
            caption="Yum",
            recipe_details=recipe,
        )

        payload = {"title": "Pasta", "caption": "Yum", "recipe": _make_recipe_payload()}
        response = client.post("/posts", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 201, response.json()
        body = response.json()["post"]
        assert body["recipe"] is not None
        assert body["recipe"]["courses"][0] == "dinner"

    def test_create_post_with_photos(self, client, mock_prisma, member_auth, monkeypatch):
        # Storage keys post-#187. Strings are intentionally short labels (not
        # the `<ms-timestamp>-<uuid>.<ext>` shape `process_upload` actually
        # generates) so they don't trip the gitleaks `generic-api-key` rule —
        # the resolver and DB layer treat them as opaque, so the test value
        # doesn't need to look real.
        key_1, key_2 = "fixture-a.jpg", "fixture-b.jpg"
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.post.create = AsyncMock(return_value=SimpleNamespace(id="post-3"))
        _stub_create_hydration(
            mock_prisma,
            post_id="post-3",
            title="Photo Post",
            caption=None,
            main_photo_storage_key=key_1,
            photo_storage_keys=[key_1, key_2],
        )
        monkeypatch.setattr(
            "src.routers.posts.process_upload",
            AsyncMock(
                side_effect=[
                    ProcessedUpload(storage_key=key_1, size_bytes=10, content_type="image/jpeg"),
                    ProcessedUpload(storage_key=key_2, size_bytes=10, content_type="image/jpeg"),
                ]
            ),
        )

        payload = {"title": "Photo Post"}
        files = [
            ("photos", ("p1.jpg", b"data1", "image/jpeg")),
            ("photos", ("p2.jpg", b"data2", "image/jpeg")),
        ]
        response = client.post("/posts", data={"payload": json.dumps(payload)}, files=files, headers=member_auth)

        assert response.status_code == 201, response.json()
        body = response.json()["post"]
        # Without UPLOADS_BUCKET set in tests, the resolver returns
        # `/uploads/<storage_key>` for keys (the local-disk path); the
        # passthrough only fires for already-URL-like values.
        assert body["mainPhotoUrl"] == f"/uploads/{key_1}"
        assert len(body["photos"]) == 2
        assert body["photos"][0]["url"] == f"/uploads/{key_1}"

    def test_create_post_with_tags(self, client, mock_prisma, member_auth):
        mock_prisma.tag.find_many = AsyncMock(
            return_value=[SimpleNamespace(id="t1", name="spicy"), SimpleNamespace(id="t2", name="quick")]
        )
        mock_prisma.post.create = AsyncMock(return_value=SimpleNamespace(id="post-4"))
        # Hydrated detail response surfaces tags as a flat name list (not
        # the Prisma `{tag: {id, name}}` shape); update the assertion to
        # match.
        _stub_create_hydration(
            mock_prisma,
            post_id="post-4",
            title="Tagged",
            caption=None,
            tags=[
                SimpleNamespace(tag=SimpleNamespace(id="t1", name="spicy")),
                SimpleNamespace(tag=SimpleNamespace(id="t2", name="quick")),
            ],
        )

        payload = {"title": "Tagged", "recipe": {"tags": ["spicy", "quick"]}}
        response = client.post("/posts", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 201, response.json()
        assert response.json()["post"]["tags"] == ["spicy", "quick"]

    def test_create_post_invalid_tag_400(self, client, mock_prisma, member_auth):
        # Matches Next handler at src/app/api/posts/route.ts: 400 INVALID_TAG
        # ("One or more tags are not available"). Previously 409 CONFLICT on
        # the FastAPI side; aligned in #200.
        mock_prisma.tag.find_many = AsyncMock(return_value=[])

        payload = {"title": "Bad Tags", "recipe": {"tags": ["missing"]}}
        response = client.post("/posts", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert_error_envelope(
            response,
            status_code=400,
            code="INVALID_TAG",
            message_contains="not available",
        )

    def test_create_post_max_photos_exceeded_400(self, client, member_auth):
        # Matches Next POST + PATCH handlers' TOO_MANY_PHOTOS canonical code
        # (see src/app/api/posts/route.ts and src/app/api/posts/[postId]/route.ts;
        # reconciled in #202).
        files = [("photos", (f"p{i}.jpg", b"data", "image/jpeg")) for i in range(MAX_PHOTO_COUNT + 1)]
        payload = {"title": "Too many"}

        response = client.post("/posts", data={"payload": json.dumps(payload)}, files=files, headers=member_auth)

        assert_error_envelope(
            response,
            status_code=400,
            code="TOO_MANY_PHOTOS",
            message_contains="upload up to",
        )

    def test_create_post_invalid_mime_type_400(self, client, mock_prisma, member_auth):
        # Matches Next handler's UNSUPPORTED_FILE_TYPE
        # (src/app/api/posts/route.ts catches savePhotoFile's throw).
        # Post-#187 the message is generated by `process_upload` and lists
        # the allowed mime types explicitly; the substring check is
        # narrowed to a stable fragment.
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        payload = {"title": "Bad mime"}
        files = [("photos", ("bad.txt", b"data", "text/plain"))]

        response = client.post("/posts", data={"payload": json.dumps(payload)}, files=files, headers=member_auth)

        assert_error_envelope(
            response,
            status_code=400,
            code="UNSUPPORTED_FILE_TYPE",
            message_contains="image/jpeg",
        )

    def test_create_post_malformed_payload_json_400(self, client, member_auth):
        # Previously 409 CONFLICT; aligned to 400 VALIDATION_ERROR in #200 so
        # malformed JSON returns the canonical bad-input envelope.
        response = client.post(
            "/posts", data={"payload": "{not-json"}, headers=member_auth
        )

        assert_error_envelope(
            response,
            status_code=400,
            code="VALIDATION_ERROR",
            message_contains="valid json",
        )

    def test_create_post_requires_auth(self, client):
        payload = {"title": "No auth"}

        response = client.post("/posts", data={"payload": json.dumps(payload)})

        assert response.status_code == 401

    def test_create_post_oversized_single_file_400(self, client, mock_prisma, member_auth, monkeypatch):
        """Per-file size cap (POSTS_MEDIA_MAX_BYTES = 10MB) triggers a
        `FILE_TOO_LARGE` 400 from `process_upload`. The mock raises
        `UploadError` to simulate the cap hit so we don't have to assemble
        an actual 10MB byte payload in the test body."""
        from src.multipart_uploads import UploadError

        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        monkeypatch.setattr(
            "src.routers.posts.process_upload",
            AsyncMock(side_effect=UploadError("FILE_TOO_LARGE", "File exceeds the 10MB limit for post-media")),
        )

        payload = {"title": "Big"}
        files = [("photos", ("big.jpg", b"d", "image/jpeg"))]
        response = client.post(
            "/posts", data={"payload": json.dumps(payload)}, files=files, headers=member_auth
        )

        assert_error_envelope(
            response,
            status_code=400,
            code="FILE_TOO_LARGE",
            message_contains="10MB",
        )

    def test_create_post_oversized_aggregate_request_400(self, client, mock_prisma, member_auth, monkeypatch):
        """Aggregate-request cap (50MB total across all `photos` after
        processing) — enforced in `_process_photo_uploads` by summing each
        ProcessedUpload's `size_bytes`. We feed it three "files" whose
        mocked processed sizes sum to >50MB and assert the rejection.

        The cap is on *processed* bytes (post EXIF strip / resize), so this
        also documents that the check fires after individual files have
        already passed the per-file cap."""
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        twenty_mb = 20 * 1024 * 1024
        monkeypatch.setattr(
            "src.routers.posts.process_upload",
            AsyncMock(
                side_effect=[
                    ProcessedUpload(storage_key="k1.jpg", size_bytes=twenty_mb, content_type="image/jpeg"),
                    ProcessedUpload(storage_key="k2.jpg", size_bytes=twenty_mb, content_type="image/jpeg"),
                    ProcessedUpload(storage_key="k3.jpg", size_bytes=twenty_mb, content_type="image/jpeg"),
                ]
            ),
        )

        payload = {"title": "Big stack"}
        files = [("photos", (f"p{i}.jpg", b"d", "image/jpeg")) for i in range(3)]
        response = client.post(
            "/posts", data={"payload": json.dumps(payload)}, files=files, headers=member_auth
        )

        assert_error_envelope(
            response,
            status_code=400,
            code="FILE_TOO_LARGE",
            message_contains="50mb",
        )

    def test_create_post_max_files_boundary(self, client, mock_prisma, member_auth, monkeypatch):
        """MAX_PHOTO_COUNT files exactly is accepted (boundary check —
        anything <= the cap should succeed)."""
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.post.create = AsyncMock(return_value=SimpleNamespace(id="post-many"))
        photo_keys = [f"key-{i}.jpg" for i in range(MAX_PHOTO_COUNT)]
        _stub_create_hydration(
            mock_prisma,
            post_id="post-many",
            title="Maxed",
            main_photo_storage_key=photo_keys[0],
            photo_storage_keys=photo_keys,
        )
        monkeypatch.setattr(
            "src.routers.posts.process_upload",
            AsyncMock(
                side_effect=[
                    ProcessedUpload(storage_key=key, size_bytes=10, content_type="image/jpeg")
                    for key in photo_keys
                ]
            ),
        )

        payload = {"title": "Maxed"}
        files = [("photos", (f"p{i}.jpg", b"d", "image/jpeg")) for i in range(MAX_PHOTO_COUNT)]
        response = client.post(
            "/posts", data={"payload": json.dumps(payload)}, files=files, headers=member_auth
        )

        assert response.status_code == 201, response.json()
        assert len(response.json()["post"]["photos"]) == MAX_PHOTO_COUNT

    def test_create_post_returns_post_shape(self, client, mock_prisma, member_auth):
        # Post-#187 the response is the hydrated detail shape, which uses
        # `recipe` (computed) rather than the raw Prisma `recipeDetails`
        # field — assert against the documented response keys.
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.post.create = AsyncMock(return_value=SimpleNamespace(id="post-5"))
        _stub_create_hydration(mock_prisma, post_id="post-5", title="Shape", caption=None)

        payload = {"title": "Shape"}
        response = client.post("/posts", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 201, response.json()
        post = response.json()["post"]
        for key in ["id", "title", "photos", "recipe", "tags", "comments", "cookedStats"]:
            assert key in post


class TestGetPostDetail:
    def _base_post(self, author_id="user_test_123"):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        return SimpleNamespace(
            id=POST_ID,
            title="Post",
            caption="Cap",
            createdAt=now,
            updatedAt=now,
            mainPhotoStorageKey=None,
            authorId=author_id,
            author=SimpleNamespace(id=author_id, name="Alice", avatarStorageKey=None),
            editor=None,
            lastEditNote=None,
            lastEditAt=None,
            photos=[],
            recipeDetails=None,
            tags=[],
        )

    def test_get_post_success(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["post"]["id"] == POST_ID
        assert body["canEdit"] is True

    def test_get_post_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=None)

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 404

    def test_get_post_invalid_cuid_404(self, client, member_auth):
        response = client.get("/posts/not-cuid", headers=member_auth)

        assert response.status_code == 404

    def test_get_post_includes_comments(self, client, mock_prisma, member_auth):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(
            return_value=[
                SimpleNamespace(
                    id="c1",
                    text="Nice",
                    photoStorageKey=None,
                    createdAt=now,
                    author=SimpleNamespace(id="u1", name="Bob", avatarStorageKey=None),
                ),
                SimpleNamespace(
                    id="c2",
                    text="Great",
                    photoStorageKey=None,
                    createdAt=now,
                    author=SimpleNamespace(id="u2", name="Ann", avatarStorageKey=None),
                ),
            ]
        )
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200
        comments = response.json()["post"]["comments"]
        assert len(comments) == 2
        assert {c["text"] for c in comments} == {"Nice", "Great"}

    def test_get_post_includes_reaction_summary(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(
            return_value=[
                SimpleNamespace(emoji="❤️", user=SimpleNamespace(id="u1", name="Bob", avatarStorageKey=None), targetType="post", targetId="post-1"),
                SimpleNamespace(emoji="❤️", user=SimpleNamespace(id="u2", name="Sue", avatarStorageKey=None), targetType="post", targetId="post-1"),
                SimpleNamespace(emoji="👍", user=SimpleNamespace(id="u3", name="Eve", avatarStorageKey=None), targetType="post", targetId="post-1"),
            ]
        )

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200
        summary = response.json()["post"]["reactionSummary"]
        counts = {item["emoji"]: item["count"] for item in summary}
        assert counts["❤️"] == 2
        assert counts["👍"] == 1

    def test_get_post_includes_is_favorited(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=SimpleNamespace(id="fav1"))
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200
        assert response.json()["post"]["isFavorited"] is True

    def test_get_post_includes_cooked_stats(self, client, mock_prisma, member_auth):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [
                    SimpleNamespace(id="k1", rating=5, note=None, createdAt=now, user=SimpleNamespace(id="u1", name="Bob", avatarStorageKey=None)),
                    SimpleNamespace(id="k2", rating=3, note=None, createdAt=now, user=SimpleNamespace(id="u2", name="Ann", avatarStorageKey=None)),
                ],
                [SimpleNamespace(id="k1", rating=5, note=None, createdAt=now), SimpleNamespace(id="k2", rating=3, note=None, createdAt=now)],
            ]
        )
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200
        stats = response.json()["post"]["cookedStats"]
        assert stats["timesCooked"] == 2
        assert stats["averageRating"] == 4

    def test_get_post_comments_pagination(self, client, mock_prisma, member_auth):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(
            return_value=[
                SimpleNamespace(id="c1", text="A", photoStorageKey=None, createdAt=now, author=None),
                SimpleNamespace(id="c2", text="B", photoStorageKey=None, createdAt=now, author=None),
            ]
        )
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}?commentLimit=1", headers=member_auth)

        assert response.status_code == 200
        page = response.json()["post"]["commentsPage"]
        assert page["hasMore"] is True
        assert page["nextOffset"] == 1

    def test_get_post_cooked_pagination(self, client, mock_prisma, member_auth):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [
                    SimpleNamespace(id="k1", rating=None, note=None, createdAt=now, user=None),
                    SimpleNamespace(id="k2", rating=None, note=None, createdAt=now, user=None),
                ],
                [SimpleNamespace(id="k1", rating=None, note=None, createdAt=now)],
            ]
        )
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}?cookedLimit=1", headers=member_auth)

        assert response.status_code == 200
        page = response.json()["post"]["recentCookedPage"]
        assert page["hasMore"] is True
        assert page["nextOffset"] == 1

    def test_get_post_includes_can_edit_false_for_other_author(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post(author_id="other"))
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200
        assert response.json()["canEdit"] is False

    def test_get_post_requires_auth(self, client):
        response = client.get("/posts/post-1")

        assert response.status_code == 401


class TestUpdatePost:
    def _post(
        self,
        *,
        author_id: str = "user_test_123",
        photos=None,
        recipe_details=None,
        tags=None,
        main_photo_url: Optional[str] = None,
        last_edit_note: Optional[str] = None,
        last_edit_at=None,
        title: str = "Post",
        caption: Optional[str] = "Cap",
    ):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        return SimpleNamespace(
            id=POST_ID,
            title=title,
            caption=caption,
            createdAt=now,
            updatedAt=now,
            mainPhotoStorageKey=main_photo_url,
            authorId=author_id,
            author=SimpleNamespace(id=author_id, name="Alice", avatarStorageKey=None),
            editor=None,
            lastEditNote=last_edit_note,
            lastEditAt=last_edit_at or now,
            photos=photos or [],
            recipeDetails=recipe_details,
            tags=tags or [],
        )

    def _photo(self, photo_id: str, sort_order: int = 0):
        return SimpleNamespace(id=photo_id, storageKey=f"https://cdn.test/{photo_id}.jpg", sortOrder=sort_order)

    def _recipe_details(self):
        return SimpleNamespace(
            origin="Italy",
            ingredients=json.dumps([{"name": "Tomato", "unit": "pcs", "quantity": 2}]),
            steps=json.dumps([{"text": "Chop"}]),
            totalTime=30,
            servings=4,
            course="dinner",
            courses=json.dumps(["dinner"]),
            difficulty="easy",
        )

    def test_update_post_author_can_edit(self, client, mock_prisma, member_auth):
        initial = self._post()
        updated = self._post(title="Updated Title", caption="New", main_photo_url=None)
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Updated Title", "caption": "New"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["title"] == "Updated Title"

    def test_update_post_admin_can_edit(
        self, client, mock_prisma, admin_auth, mock_admin_user, mock_family_space
    ):
        mock_admin_user.memberships = [SimpleNamespace(role="admin", familySpaceId=mock_family_space.id, familySpace=mock_family_space)]
        mock_prisma.user.find_unique = AsyncMock(return_value=mock_admin_user)

        initial = self._post(author_id="other")
        updated = self._post(author_id="other", title="Admin Edit")
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Admin Edit"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=admin_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["title"] == "Admin Edit"

    def test_update_post_owner_can_edit(
        self, client, mock_prisma, owner_auth, mock_owner_user, mock_family_space
    ):
        mock_owner_user.memberships = [SimpleNamespace(role="owner", familySpaceId=mock_family_space.id, familySpace=mock_family_space)]
        mock_prisma.user.find_unique = AsyncMock(return_value=mock_owner_user)

        initial = self._post(author_id="another")
        updated = self._post(author_id="another", title="Owner Edit")
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Owner Edit"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=owner_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["title"] == "Owner Edit"

    def test_update_post_member_cannot_edit_others_403(self, client, mock_prisma, member_auth):
        initial = self._post(author_id="someone_else")
        mock_prisma.post.find_first = AsyncMock(return_value=initial)

        payload = {"title": "Nope"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 403

    def test_update_post_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=None)

        payload = {"title": "Missing"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 404

    def test_update_post_add_photos(self, client, mock_prisma, member_auth, monkeypatch):
        initial = self._post(photos=[])
        updated_photos = [self._photo("ph_new_1", 0), self._photo("ph_new_2", 1)]
        updated = self._post(photos=updated_photos, main_photo_url=updated_photos[0].storageKey)

        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        # Post-#187: photo writes go through `multipart_uploads.process_upload`
        # and the DB stores storage keys rather than resolved URLs. The mock
        # returns `ProcessedUpload` dataclasses whose `storage_key` flows into
        # the DB column via `_process_photo_uploads`.
        monkeypatch.setattr(
            "src.routers.posts.process_upload",
            AsyncMock(
                side_effect=[
                    ProcessedUpload(storage_key=updated_photos[0].storageKey, size_bytes=10, content_type="image/jpeg"),
                    ProcessedUpload(storage_key=updated_photos[1].storageKey, size_bytes=10, content_type="image/jpeg"),
                ]
            ),
        )
        monkeypatch.setattr("src.routers.posts.delete_uploads", AsyncMock())

        payload = {
            "title": "Photos",
            "photoOrder": [
                {"type": "new", "fileIndex": 0},
                {"type": "new", "fileIndex": 1},
            ],
        }
        files = [
            ("photos", ("p1.jpg", b"data1", "image/jpeg")),
            ("photos", ("p2.jpg", b"data2", "image/jpeg")),
        ]

        response = client.put(
            f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, files=files, headers=member_auth
        )

        assert response.status_code == 200, response.json()
        body = response.json()["post"]
        assert len(body["photos"]) == 2
        assert body["mainPhotoUrl"] == updated_photos[0].storageKey

    def test_update_post_remove_photos(self, client, mock_prisma, member_auth, monkeypatch):
        existing_photos = [self._photo("ph1", 0), self._photo("ph2", 1)]
        initial = self._post(photos=existing_photos, main_photo_url=existing_photos[0].storageKey)
        kept = self._photo("ph2", 0)
        updated = self._post(photos=[kept], main_photo_url=kept.storageKey)

        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        delete_mock = AsyncMock()
        monkeypatch.setattr("src.routers.posts.delete_uploads", delete_mock)
        # Force router to respect explicit photo order by lowering max count so unreferenced photos are removed
        monkeypatch.setattr("src.routers.posts.MAX_PHOTO_COUNT", 1)

        payload = {"title": "Keep one", "photoOrder": [{"type": "existing", "id": "ph2"}]}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        photos = response.json()["post"]["photos"]
        assert len(photos) == 1
        assert photos[0]["url"] == kept.storageKey
        delete_mock.assert_awaited_with([existing_photos[0].storageKey])

    def test_update_post_reorder_photos(self, client, mock_prisma, member_auth, monkeypatch):
        existing_photos = [self._photo("ph1", 0), self._photo("ph2", 1)]
        initial = self._post(photos=existing_photos, main_photo_url=existing_photos[0].storageKey)
        reordered = [self._photo("ph2", 0), self._photo("ph1", 1)]
        updated = self._post(photos=reordered, main_photo_url=reordered[0].storageKey)

        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        monkeypatch.setattr("src.routers.posts.delete_uploads", AsyncMock())

        payload = {
            "title": "Reorder",
            "photoOrder": [
                {"type": "existing", "id": "ph2"},
                {"type": "existing", "id": "ph1"},
            ],
        }
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        photos = response.json()["post"]["photos"]
        assert [p["id"] for p in photos] == ["ph2", "ph1"]
        assert response.json()["post"]["mainPhotoUrl"] == reordered[0].storageKey

    def test_update_post_change_tags(self, client, mock_prisma, member_auth):
        initial = self._post(tags=[SimpleNamespace(tag=SimpleNamespace(id="old", name="old"))])
        updated = self._post(tags=[SimpleNamespace(tag=SimpleNamespace(id="new", name="spicy"))])
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.tag.find_many = AsyncMock(return_value=[SimpleNamespace(id="t1", name="spicy")])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Tags", "recipe": {"tags": ["spicy"]}}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["tags"] == ["spicy"]

    def test_update_post_add_recipe(self, client, mock_prisma, member_auth):
        initial = self._post(recipe_details=None)
        recipe_details = self._recipe_details()
        updated = self._post(recipe_details=recipe_details)
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Add recipe", "recipe": _make_recipe_payload()}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        recipe = response.json()["post"]["recipe"]
        assert recipe["origin"] == "Italy"
        assert recipe["ingredients"][0]["name"] == "Tomato"

    def test_update_post_remove_recipe(self, client, mock_prisma, member_auth):
        existing_recipe = self._recipe_details()
        initial = self._post(recipe_details=existing_recipe)
        updated = self._post(recipe_details=None)
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Remove recipe"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["recipe"] is None

    def test_update_post_change_note_recorded(self, client, mock_prisma, member_auth):
        initial = self._post()
        updated = self._post(last_edit_note="Fixed typo", last_edit_at=datetime(2024, 1, 2, tzinfo=timezone.utc))
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Note", "changeNote": "  Fixed typo  "}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["lastEditNote"] == "Fixed typo"

    def test_update_post_invalid_tag_400(self, client, mock_prisma, member_auth):
        # Matches Next PUT handler at src/app/api/posts/[postId]/route.ts: 400
        # INVALID_TAG when a requested tag name doesn't resolve. Previously
        # 409 CONFLICT on the FastAPI side; aligned in #200.
        initial = self._post()
        mock_prisma.post.find_first = AsyncMock(return_value=initial)
        mock_prisma.tag.find_many = AsyncMock(return_value=[])  # no tag matches "missing"

        payload = {"title": "Bad Tags", "recipe": {"tags": ["missing"]}}
        response = client.put(
            f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth
        )

        assert_error_envelope(
            response,
            status_code=400,
            code="INVALID_TAG",
            message_contains="not available",
        )

    def test_update_post_photo_order_exceeds_max_400(self, client, mock_prisma, member_auth):
        # Matches Next PUT handler's TOO_MANY_PHOTOS guard on `photoOrder`
        # length. Previously 409 CONFLICT on the FastAPI side; aligned in #200.
        initial = self._post()
        mock_prisma.post.find_first = AsyncMock(return_value=initial)

        payload = {
            "title": "Too many ordered",
            "photoOrder": [
                {"type": "new", "fileIndex": i} for i in range(MAX_PHOTO_COUNT + 1)
            ],
        }
        response = client.put(
            f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth
        )

        assert_error_envelope(
            response,
            status_code=400,
            code="TOO_MANY_PHOTOS",
            message_contains="include up to",
        )

    def test_update_post_malformed_payload_json_400(self, client, mock_prisma, member_auth):
        # Previously 409 CONFLICT; aligned to 400 VALIDATION_ERROR in #200.
        initial = self._post()
        mock_prisma.post.find_first = AsyncMock(return_value=initial)

        response = client.put(
            f"/posts/{POST_ID}", data={"payload": "{not-json"}, headers=member_auth
        )

        assert_error_envelope(
            response,
            status_code=400,
            code="VALIDATION_ERROR",
            message_contains="valid json",
        )

    def test_update_post_requires_auth(self, client):
        payload = {"title": "No auth"}

        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)})

        assert response.status_code == 401


class TestDeletePost:
    def _post(self, *, author_id: str = "user_test_123", photos=None, comments=None):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        return SimpleNamespace(
            id=POST_ID,
            authorId=author_id,
            familySpaceId="family_test_123",
            photos=photos or [],
            comments=comments or [],
            createdAt=now,
        )

    def _photo(self, photo_id: str):
        return SimpleNamespace(id=photo_id, storageKey=f"https://cdn.test/{photo_id}.jpg")

    def _comment(self, comment_id: str, photo_url: Optional[str] = None):
        return SimpleNamespace(id=comment_id, photoStorageKey=photo_url)

    def test_delete_post_author_can_delete(self, client, mock_prisma, member_auth, monkeypatch):
        photos = [self._photo("ph1"), self._photo("ph2")]
        comments = [self._comment("c1", photo_url="https://cdn.test/c1.jpg")]
        post = self._post(author_id="user_test_123", photos=photos, comments=comments)
        mock_prisma.post.find_first = AsyncMock(return_value=post)
        mock_prisma.post.delete = AsyncMock(return_value=None)
        delete_mock = AsyncMock()
        monkeypatch.setattr("src.routers.posts.delete_uploads", delete_mock)

        response = client.delete(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200, response.json()
        delete_mock.assert_awaited_once()
        assert set(delete_mock.await_args.args[0]) == {
            "https://cdn.test/ph1.jpg",
            "https://cdn.test/ph2.jpg",
            "https://cdn.test/c1.jpg",
        }

    def test_delete_post_admin_can_delete(self, client, mock_prisma, admin_auth, mock_admin_user, mock_family_space, monkeypatch):
        mock_admin_user.memberships = [SimpleNamespace(role="admin", familySpaceId=mock_family_space.id, familySpace=mock_family_space)]
        mock_prisma.user.find_unique = AsyncMock(return_value=mock_admin_user)

        post = self._post(author_id="someone_else")
        mock_prisma.post.find_first = AsyncMock(return_value=post)
        mock_prisma.post.delete = AsyncMock(return_value=None)
        monkeypatch.setattr("src.routers.posts.delete_uploads", AsyncMock())

        response = client.delete(f"/posts/{POST_ID}", headers=admin_auth)

        assert response.status_code == 200, response.json()

    def test_delete_post_member_cannot_delete_others_403(self, client, mock_prisma, member_auth):
        post = self._post(author_id="other")
        mock_prisma.post.find_first = AsyncMock(return_value=post)

        response = client.delete(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 403

    def test_delete_post_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=None)

        response = client.delete(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 404

    def test_delete_post_requires_auth(self, client):
        response = client.delete(f"/posts/{POST_ID}")

        assert response.status_code == 401


class TestFavoritePost:
    def test_favorite_post_success(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.favorite.create = AsyncMock(return_value=None)

        response = client.post(f"/posts/{POST_ID}/favorite", headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["favorited"] is True

    def test_favorite_post_idempotent(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.favorite.create = AsyncMock(side_effect=PrismaError("already favorited"))

        response = client.post(f"/posts/{POST_ID}/favorite", headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["favorited"] is True

    def test_favorite_post_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=None)

        response = client.post(f"/posts/{POST_ID}/favorite", headers=member_auth)

        assert response.status_code == 404

    def test_favorite_post_requires_auth(self, client):
        response = client.post(f"/posts/{POST_ID}/favorite")

        assert response.status_code == 401

    def test_unfavorite_post_success(self, client, mock_prisma, member_auth):
        mock_prisma.favorite.delete_many = AsyncMock(return_value=None)

        response = client.delete(f"/posts/{POST_ID}/favorite", headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["favorited"] is False


class TestCookedEvents:
    def _event(self, event_id: str, rating=None, note=None, user=None, created_at=None):
        return SimpleNamespace(
            id=event_id,
            rating=rating,
            note=note,
            createdAt=created_at or datetime(2024, 1, 1, tzinfo=timezone.utc),
            user=user,
        )

    def test_log_cooked_success(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.cookedevent.create = AsyncMock(return_value=None)
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [self._event("e1"), self._event("e2")],
                [self._event("e2")],
            ]
        )

        response = client.post(f"/posts/{POST_ID}/cooked", json={"rating": None, "note": None}, headers=member_auth)

        assert response.status_code == 200, response.json()
        stats = response.json()["cookedStats"]
        assert stats["timesCooked"] == 2
        assert stats["averageRating"] is None

    def test_log_cooked_with_rating(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.cookedevent.create = AsyncMock(return_value=None)
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [self._event("e1", rating=5), self._event("e2", rating=3)],
                [self._event("e3", rating=5)],
            ]
        )

        response = client.post(f"/posts/{POST_ID}/cooked", json={"rating": 5, "note": None}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["cookedStats"]["averageRating"] == 4
        assert response.json()["recentCooked"][0]["rating"] == 5

    def test_log_cooked_with_note(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.cookedevent.create = AsyncMock(return_value=None)
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [self._event("e1", note="Great")],
                [self._event("e1", note="Great")],
            ]
        )

        response = client.post(f"/posts/{POST_ID}/cooked", json={"note": "Great"}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["recentCooked"][0]["note"] == "Great"

    def test_log_cooked_updates_stats(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.cookedevent.create = AsyncMock(return_value=None)
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [self._event("e1", rating=5), self._event("e2", rating=1), self._event("e3", rating=4)],
                [self._event("e3", rating=4), self._event("e2", rating=1)],
            ]
        )

        response = client.post(f"/posts/{POST_ID}/cooked", json={"rating": 4}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["cookedStats"]["averageRating"] == pytest.approx(10 / 3)
        assert response.json()["cookedStats"]["timesCooked"] == 3

    def test_log_cooked_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=None)

        response = client.post(f"/posts/{POST_ID}/cooked", json={}, headers=member_auth)

        assert response.status_code == 404

    def test_list_cooked_success(self, client, mock_prisma, member_auth):
        mock_prisma.cookedevent.find_many = AsyncMock(
            return_value=[
                self._event(
                    "e1",
                    rating=5,
                    note=None,
                    user=SimpleNamespace(id="u1", name="Alice", avatarStorageKey="avatars/a.jpg", passwordHash="secret"),
                ),
                self._event(
                    "e2",
                    rating=None,
                    note="nice",
                    user=SimpleNamespace(id="u2", name="Bob", avatarStorageKey=None, passwordHash="secret"),
                ),
            ]
        )

        response = client.get(f"/posts/{POST_ID}/cooked", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert len(body["cookedEvents"]) == 2
        assert body["cookedEvents"][0]["user"] == {
            "id": "u1",
            "name": "Alice",
            "avatarUrl": "/uploads/avatars/a.jpg",
        }
        assert body["cookedEvents"][1]["user"] == {"id": "u2", "name": "Bob", "avatarUrl": None}
        # Confirm the raw User model is not leaked (no passwordHash / avatarStorageKey)
        raw = response.text
        assert "passwordHash" not in raw
        assert "avatarStorageKey" not in raw
        assert body["hasMore"] is False
        assert body["nextOffset"] == 2

    def test_list_cooked_pagination(self, client, mock_prisma, member_auth):
        mock_prisma.cookedevent.find_many = AsyncMock(
            return_value=[
                self._event("e1", user=SimpleNamespace(id="u1", name="A", avatarStorageKey=None)),
                self._event("e2", user=SimpleNamespace(id="u2", name="B", avatarStorageKey=None)),
            ]
        )

        response = client.get(f"/posts/{POST_ID}/cooked?limit=1", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["hasMore"] is True
        assert body["nextOffset"] == 1

    def test_unfavorite_post_idempotent(self, client, mock_prisma, member_auth):
        mock_prisma.favorite.delete_many = AsyncMock(return_value=None)

        response = client.delete(f"/posts/{POST_ID}/favorite", headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["favorited"] is False
