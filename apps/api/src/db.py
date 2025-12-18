from prisma import Prisma

prisma = Prisma()


async def connect_db() -> None:
    if not prisma.is_connected():
        await prisma.connect()


async def disconnect_db() -> None:
    if prisma.is_connected():
        await prisma.disconnect()
