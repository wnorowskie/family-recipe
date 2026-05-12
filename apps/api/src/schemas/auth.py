from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    # `EmailStr` enforces RFC-shape parity with Next's `z.string().email()`
    # in src/lib/validation.ts, so malformed addresses fail at the validation
    # boundary (400 VALIDATION_ERROR) instead of reaching the DB lookup.
    # Side-effect: the validator strips surrounding whitespace and lowercases
    # the domain part — the handler's existing `.strip()` was already
    # tolerating whitespace, and domain-case-insensitivity is RFC-correct.
    email: EmailStr = Field(max_length=200)
    username: str = Field(min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=6, max_length=200)
    familyMasterKey: str = Field(min_length=6, max_length=200)
    rememberMe: bool = False


class LoginRequest(BaseModel):
    # Intentionally a plain `str` — this field accepts either an email or a
    # username, mirroring Next's `z.string().min(3)` in `loginSchema`. Using
    # `EmailStr` here would reject perfectly valid username logins.
    emailOrUsername: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=6, max_length=200)
    rememberMe: bool = False


class DeleteAccountRequest(BaseModel):
    """Self-service account-delete payload — mirrors
    `deleteAccountSchema` in src/lib/validation.ts.

    The endpoint requires two confirmations even though the caller is
    already authenticated: a fresh password proves possession of the
    account (not just a stolen access token), and the literal string
    `DELETE` in `confirmation` is the same anti-fat-finger guard the
    Next handler uses. Both are validated up-front so the destructive
    `prisma.user.delete` call never runs on a malformed request.
    """
    currentPassword: str = Field(min_length=1, max_length=200)
    # Pydantic doesn't have z.string().transform — case-insensitivity
    # is handled in the router so the schema stays declarative. Accept
    # any case here; the handler upper-cases and trims before checking.
    confirmation: str = Field(min_length=1, max_length=50)


class ResetPasswordRequest(BaseModel):
    """Master-key-gated password reset — mirrors the Next handler at
    `src/app/api/auth/reset/route.ts`.

    No email/token flow: the caller proves identity by supplying the family
    master key. Aligned with what's deployed today; a token-based flow is
    deferred to a future ticket gated on email infrastructure.
    """
    # See `SignupRequest.email` for the rationale on using `EmailStr` —
    # malformed addresses now fail at validation with 400 VALIDATION_ERROR
    # instead of falling through to the DB lookup and 401 INVALID_CREDENTIALS.
    email: EmailStr = Field(max_length=200)
    masterKey: str = Field(min_length=1, max_length=200)
    newPassword: str = Field(min_length=8, max_length=200)


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    username: str
    # Mirrors email; kept so Next-era clients that read `emailOrUsername`
    # continue to work during the FastAPI migration.
    emailOrUsername: str
    avatarUrl: Optional[str] = None
    role: str
    familySpaceId: str
    familySpaceName: Optional[str] = None


class AuthResponse(BaseModel):
    user: UserResponse
