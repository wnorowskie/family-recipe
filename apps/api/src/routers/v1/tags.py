from fastapi import APIRouter, Depends
from prisma.errors import PrismaError

from ...db import prisma
from ...dependencies_v1 import get_current_user_v1
from ...errors import internal_error
from ...schemas.auth import UserResponse

router = APIRouter(prefix="/v1/tags", tags=["tags"])


@router.get("")
async def list_tags(user: UserResponse = Depends(get_current_user_v1)):
    try:
        tags = await prisma.tag.find_many(order={"name": "asc"})
        return {"tags": tags}
    except PrismaError:
        return internal_error("Failed to load tags")
