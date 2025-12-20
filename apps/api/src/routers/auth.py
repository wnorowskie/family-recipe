import logging

from fastapi import APIRouter, Depends, Response, status
from prisma.errors import PrismaError

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import bad_request, forbidden, internal_error, invalid_credentials
from ..schemas.auth import AuthResponse, LoginRequest, SignupRequest, UserResponse
from ..security import clear_session_cookie, hash_password, set_session_cookie, sign_token, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, response: Response):
    try:
        existing_user = await prisma.user.find_unique(
            where={"emailOrUsername": payload.emailOrUsername}
        )
        if existing_user:
            return bad_request("A user with this email or username already exists")

        family_space = await prisma.familyspace.find_first()
        if not family_space:
            return internal_error("No family space found. Please contact the administrator.")

        is_valid_key = verify_password(payload.familyMasterKey, family_space.masterKeyHash)
        if not is_valid_key:
            return bad_request("Invalid Family Master Key")

        members_count = await prisma.familymembership.count(
            where={"familySpaceId": family_space.id}
        )
        role = "owner" if members_count == 0 else "member"

        async with prisma.tx() as tx:
            user = await tx.user.create(
                data={
                    "name": payload.name,
                    "emailOrUsername": payload.emailOrUsername,
                    "passwordHash": hash_password(payload.password),
                }
            )

            membership = await tx.familymembership.create(
                data={
                    "familySpaceId": family_space.id,
                    "userId": user.id,
                    "role": role,
                }
            )

        token = sign_token(
            {
                "userId": user.id,
                "familySpaceId": membership.familySpaceId,
                "role": membership.role,
            },
            remember_me=payload.rememberMe,
        )

        user_response = UserResponse(
            id=user.id,
            name=user.name,
            emailOrUsername=user.emailOrUsername,
            avatarUrl=user.avatarUrl,
            role=membership.role,
            familySpaceId=membership.familySpaceId,
            familySpaceName=family_space.name,
        )

        set_session_cookie(response, token, payload.rememberMe)

        return AuthResponse(user=user_response)
    except PrismaError as error:
        logger.exception("auth.signup.prisma_error: %s", error)
        return internal_error("Database error during signup")
    except Exception as error:  # noqa: BLE001
        logger.exception("auth.signup.error: %s", error)
        return internal_error("Failed to signup")


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, response: Response):
    try:
        user = await prisma.user.find_unique(
            where={"emailOrUsername": payload.emailOrUsername},
            include={
                "memberships": {
                    "include": {"familySpace": True},
                }
            },
        )

        if not user:
            logger.info(
                "auth.login.invalid_credentials user not found",
                extra={"emailOrUsername": payload.emailOrUsername},
            )
            return invalid_credentials()

        is_valid_password = verify_password(payload.password, user.passwordHash)
        if not is_valid_password:
            logger.info(
                "auth.login.invalid_credentials bad password",
                extra={"emailOrUsername": payload.emailOrUsername},
            )
            return invalid_credentials()

        if not user.memberships:
            logger.info(
                "auth.login.no_membership",
                extra={"emailOrUsername": payload.emailOrUsername, "userId": user.id},
            )
            return forbidden("User is not a member of any family space")

        membership = user.memberships[0]

        token = sign_token(
            {
                "userId": user.id,
                "familySpaceId": membership.familySpaceId,
                "role": membership.role,
            },
            remember_me=payload.rememberMe,
        )

        user_response = UserResponse(
            id=user.id,
            name=user.name,
            emailOrUsername=user.emailOrUsername,
            avatarUrl=user.avatarUrl,
            role=membership.role,
            familySpaceId=membership.familySpaceId,
            familySpaceName=membership.familySpace.name if membership.familySpace else None,
        )

        set_session_cookie(response, token, payload.rememberMe)

        return AuthResponse(user=user_response)
    except PrismaError as error:
        logger.exception("auth.login.prisma_error: %s", error)
        return internal_error("Database error during login")
    except Exception as error:  # noqa: BLE001
        logger.exception("auth.login.error: %s", error)
        return internal_error("Failed to login")


@router.get("/me", response_model=AuthResponse)
async def me(user: UserResponse = Depends(get_current_user)):
    return AuthResponse(user=user)


@router.post("/logout", response_model=dict[str, str])
async def logout(response: Response, user: UserResponse = Depends(get_current_user)):
    try:
        clear_session_cookie(response)
        return {"message": "Logged out successfully"}
    except Exception as error:  # noqa: BLE001
        logger.exception("auth.logout.error: %s", error)
        return internal_error("Failed to logout")
