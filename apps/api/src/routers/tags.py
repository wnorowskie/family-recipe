from fastapi import APIRouter, Depends
from prisma.errors import PrismaError

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import internal_error
from ..schemas.auth import UserResponse

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("")
async def list_tags(user: UserResponse = Depends(get_current_user)):
    try:
        tags = await prisma.tag.find_many(order={"name": "asc"})
        return {"tags": tags}
    except PrismaError:
        return internal_error("Failed to load tags")
