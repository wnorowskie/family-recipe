from typing import Optional

from pydantic import BaseModel, Field


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    emailOrUsername: str = Field(min_length=3, max_length=200)
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
    emailOrUsername: str
    avatarUrl: Optional[str] = None
    role: str
    familySpaceId: str
    familySpaceName: Optional[str] = None


class AuthResponse(BaseModel):
    user: UserResponse
