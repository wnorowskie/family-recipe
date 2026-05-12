"""Request/response shapes for /v1/feedback (issue #183).

Mirrors the Next.js handler at src/app/api/feedback/route.ts and the
`feedbackSubmissionSchema` Zod in src/lib/validation.ts. Two intentional
divergences from the Next contract — both follow the issue spec, which is
the v1 design target; the Next handler will be retired in Phase 4:

1. POST returns 201 with the persisted row under `{ feedback }`. Next
   returns 200 `{ success: true }`. The 201+body shape is what the
   migration plan documents and what the SPA cutover will consume.
2. GET pagination is reported as `{ total }` (issue spec) rather than
   the `{ page: { hasMore, nextOffset } }` envelope Next uses for posts
   / comments / etc. `total` is a single COUNT against the same filter
   — bounded by the feedback table size (admin-only surface, not a hot
   path).
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


FeedbackCategory = Literal["bug", "suggestion"]

# Cheap "has an @ with non-empty local + domain" check — matches the
# semantics of z.string().email() in the Next handler well enough for
# the in-app feedback form's purposes. We deliberately avoid pulling
# in the `pydantic[email]` extra (and therefore `email-validator`) for
# a single optional field; rolling out a stricter RFC-aware validator
# is the responsibility of issue #205, which adds EmailStr across
# /v1/auth/* and brings the dep along with it.


class CreateFeedbackRequest(BaseModel):
    # Lengths mirror feedbackSubmissionSchema in src/lib/validation.ts so
    # the contract is identical at the wire level. Pydantic's str length
    # bounds reject overlong / empty messages before the DB write.
    category: FeedbackCategory
    message: str = Field(min_length=10, max_length=2000)
    email: Optional[str] = Field(default=None, max_length=200)
    # HttpUrl is too strict for the legacy contract (rejects trailing-slash
    # variations the Next Zod accepts). The Next side uses
    # `z.string().url()`. Keep it loose here and rely on the 2000-char cap.
    pageUrl: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        # Don't reject empty-string sent by a fence-post in the frontend
        # — coerce to None so the DB column stays NULL rather than "".
        stripped = v.strip()
        if not stripped:
            return None
        local, _, domain = stripped.partition("@")
        if not local or not domain or "." not in domain:
            raise ValueError("Enter a valid email")
        return stripped


class FeedbackResponse(BaseModel):
    """Single feedback row returned by POST and embedded in GET list items."""
    id: str
    category: FeedbackCategory
    message: str
    contactEmail: Optional[str] = None
    userId: Optional[str] = None
    familySpaceId: Optional[str] = None
    pageUrl: Optional[str] = None
    userAgent: Optional[str] = None
    createdAt: str  # ISO-8601


class CreateFeedbackResponse(BaseModel):
    feedback: FeedbackResponse


class FeedbackListItem(FeedbackResponse):
    """GET list rows include the resolved author display fields.

    Matches FeedbackListItem in src/lib/feedback.ts — the Next admin UI
    keys off userName / userEmail when a feedback row has a userId.
    """
    userName: Optional[str] = None
    userEmail: Optional[str] = None


class FeedbackListResponse(BaseModel):
    items: List[FeedbackListItem]
    total: int
