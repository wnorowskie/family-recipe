from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    # Constraints mirror `signupSchema` in src/lib/validation.ts field-for-field
    # so a frontend client sees identical validation regardless of which backend
    # it points at — see #188 (payload key alignment).
    name: str = Field(min_length=1, max_length=100)
    # `EmailStr` enforces RFC-shape parity with Next's `z.string().email()`
    # in src/lib/validation.ts, so malformed addresses fail at the validation
    # boundary (400 VALIDATION_ERROR) instead of reaching the DB lookup.
    # Side-effect: the validator strips surrounding whitespace and lowercases
    # the domain part — the handler's existing `.strip()` was already
    # tolerating whitespace, and domain-case-insensitivity is RFC-correct.
    email: EmailStr = Field(max_length=200)
    username: str = Field(min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_]+$")
    # `min_length=8` mirrors Next's `z.string().min(8)`. The Next side has no
    # explicit max; the 200 cap here is a defensive bound, not a parity field.
    password: str = Field(min_length=8, max_length=200)
    # Next's `z.string().min(1)` — the master key is verified by bcrypt compare
    # against the env hash, so length is not a security boundary here; a too-short
    # key simply fails the compare. Accepting it at the validation layer matches
    # Next so the error surfaces as "Invalid Family Master Key", not a 400.
    familyMasterKey: str = Field(min_length=1, max_length=200)
    rememberMe: bool = False


class LoginRequest(BaseModel):
    # Intentionally a plain `str`, not `EmailStr` — this field accepts
    # either an email OR a username (see `loginSchema.emailOrUsername` in
    # src/lib/validation.ts), and `EmailStr` would reject perfectly valid
    # username logins. `min_length=1` mirrors Next's `z.string().min(1)`;
    # a too-short value falls through to the `find_first` lookup and
    # surfaces as 401 INVALID_CREDENTIALS, not 400 VALIDATION_ERROR.
    emailOrUsername: str = Field(min_length=1, max_length=200)
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
