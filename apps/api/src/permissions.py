from .schemas.auth import UserResponse


def is_owner_or_admin(user: UserResponse) -> bool:
    return user.role in ("owner", "admin")


def can_edit_post(user: UserResponse, post_author_id: str) -> bool:
    return user.id == post_author_id or is_owner_or_admin(user)


def can_delete_comment(user: UserResponse, comment_author_id: str) -> bool:
    return user.id == comment_author_id or is_owner_or_admin(user)


def can_remove_member(current_user: UserResponse, target_user_id: str, target_role: str) -> bool:
    if not is_owner_or_admin(current_user):
        return False
    if target_user_id == current_user.id:
        return False
    if target_role == "owner":
        return False
    return True
