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
