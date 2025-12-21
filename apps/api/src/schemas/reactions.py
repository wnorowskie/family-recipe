from pydantic import BaseModel, Field


class ReactionRequest(BaseModel):
    targetType: str = Field(pattern="^(post|comment)$")
    targetId: str = Field(min_length=1)
    emoji: str = Field(min_length=1, max_length=10)
