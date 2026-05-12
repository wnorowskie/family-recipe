from typing import Optional

from pydantic import BaseModel, Field


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=200)
    username: str = Field(min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=6, max_length=200)
    familyMasterKey: str = Field(min_length=6, max_length=200)
    rememberMe: bool = False


class LoginRequest(BaseModel):
    emailOrUsername: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=6, max_length=200)
    rememberMe: bool = False


class ResetPasswordRequest(BaseModel):
    """Master-key-gated password reset — mirrors the Next handler at
    `src/app/api/auth/reset/route.ts`.

    No email/token flow: the caller proves identity by supplying the family
    master key. Aligned with what's deployed today; a token-based flow is
    deferred to a future ticket gated on email infrastructure.
    """
    email: str = Field(min_length=3, max_length=200)
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
