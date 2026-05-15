"""Pydantic schemas for `/me` endpoints (current-user surface)."""

from pydantic import BaseModel, EmailStr, Field


class UpdateProfileRequest(BaseModel):
    """Profile update payload — mirrors `updateProfileSchema` in
    `src/lib/validation.ts`.

    Validated against the *form-field* values on the FastAPI side; the route
    handler at `PATCH /v1/me/profile` assembles a dict from the multipart
    body and feeds it through this model so the validation boundary stays
    consistent with the Next side's Zod call.

    The `currentPassword` and `avatar`/`removeAvatar` flags are NOT in this
    schema because they aren't validated as part of the profile shape — they
    gate the update (password confirmation when email/username change) and
    drive a side-effect (avatar storage write) respectively. Both are read
    directly from the form in the handler.
    """

    # Names map 1:1 to Next's Zod schema. `min_length`/`max_length` mirror the
    # Zod constraints so a frontend client sees the same validation errors
    # regardless of which backend it's pointed at.
    name: str = Field(min_length=1, max_length=100)
    # EmailStr matches Next's `.email()`. See `SignupRequest.email` in auth.py
    # for the parity rationale; same applies here.
    email: EmailStr = Field(max_length=200)
    # Username constraint mirrors `signupSchema.username`: 3-30 chars,
    # alphanumeric + underscore only.
    username: str = Field(
        min_length=3,
        max_length=30,
        pattern=r"^[a-zA-Z0-9_]+$",
    )


class ChangePasswordRequest(BaseModel):
    """Self-service password-change payload — mirrors
    `changePasswordSchema` in `src/lib/validation.ts`.

    Replaces the hand-rolled `payload: dict` + `isinstance` checks that
    previously kept the request body out of the OpenAPI snapshot (#216).
    The "current password is incorrect" branch stays in the handler — that
    is a bcrypt verify failure, not a schema validation failure.
    """

    # `min_length=1` mirrors Next's `z.string().min(1)` on currentPassword.
    # The 200 cap is a defensive upper bound, not a parity field; bcrypt
    # itself truncates at 72 bytes so anything beyond that is wasted input.
    currentPassword: str = Field(min_length=1, max_length=200)
    # `min_length=8` mirrors Next's `z.string().min(8)` on newPassword.
    newPassword: str = Field(min_length=8, max_length=200)
