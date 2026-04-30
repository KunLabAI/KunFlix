from datetime import datetime, timedelta, timezone
from typing import Optional, Literal
import uuid as _uuid

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from config import settings
from database import get_db
from auth_revocation import is_revoked

# ---------------------------------------------------------------------------
# Password hashing  (direct bcrypt, no passlib)
# ---------------------------------------------------------------------------


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ---------------------------------------------------------------------------
# JWT token creation
# ---------------------------------------------------------------------------
def create_access_token(
    subject_id: str,
    role: str,
    subject_type: Literal["user", "admin"] = "user"
) -> str:
    """创建 Access Token
    
    Args:
        subject_id: 用户 ID 或管理员 ID
        role: 角色标识 ("user" 或 "admin")
        subject_type: 主体类型，用于区分查询哪张表
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": subject_id,
        "role": role,
        "subject_type": subject_type,
        "type": "access",
        "jti": _uuid.uuid4().hex,
        "exp": expire
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject_id: str, subject_type: Literal["user", "admin"] = "user") -> str:
    """创建 Refresh Token"""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": subject_id,
        "subject_type": subject_type,
        "type": "refresh",
        "jti": _uuid.uuid4().hex,
        "exp": expire
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and return the JWT payload. Raises HTTPException on failure."""
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def decode_token_checked(token: str) -> dict:
    """Decode + 黑名单检查。需事件循环上下文。"""
    payload = decode_token(token)
    if await is_revoked(payload.get("jti")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Extract user from JWT access token."""
    from models import User  # deferred to avoid circular import

    payload = await decode_token_checked(token)
    user_id: Optional[str] = payload.get("sub")
    token_type: Optional[str] = payload.get("type")

    # Guard: must be an access token
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    has_valid_claim = user_id and token_type == "access"
    result = await db.execute(select(User).filter(User.id == user_id)) if has_valid_claim else None
    user = result.scalars().first() if result else None

    if not user:
        raise credentials_exception
    return user


async def get_current_active_user(current_user=Depends(get_current_user)):
    """Ensure the user account is active."""
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return current_user


# ---------------------------------------------------------------------------
# Admin authentication (基于独立的 admins 表)
# ---------------------------------------------------------------------------
async def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """从 JWT 中提取管理员信息（基于 admins 表）"""
    from models import Admin  # deferred to avoid circular import

    payload = await decode_token_checked(token)
    admin_id: Optional[str] = payload.get("sub")
    token_type: Optional[str] = payload.get("type")
    subject_type: Optional[str] = payload.get("subject_type", "user")

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid admin credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 验证是管理员 Token
    has_valid_claim = admin_id and token_type == "access" and subject_type == "admin"
    result = await db.execute(select(Admin).filter(Admin.id == admin_id)) if has_valid_claim else None
    admin = result.scalars().first() if result else None

    if not admin:
        raise credentials_exception
    return admin


async def get_current_active_admin(current_admin=Depends(get_current_admin)):
    """确保管理员账户处于活跃状态"""
    if not current_admin.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin account disabled")
    return current_admin


async def require_admin(current_admin=Depends(get_current_active_admin)):
    """管理员权限验证（基于独立的 admins 表）"""
    return current_admin


# ---------------------------------------------------------------------------
# Universal authentication (supports both User and Admin)
# ---------------------------------------------------------------------------
async def get_current_user_or_admin(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """从 JWT 中提取用户或管理员信息（根据 subject_type 决定查询哪张表）
    
    返回 User 或 Admin 对象，允许管理员访问需要用户认证的端点。
    """
    from models import User, Admin  # deferred to avoid circular import

    payload = await decode_token_checked(token)
    subject_id: Optional[str] = payload.get("sub")
    token_type: Optional[str] = payload.get("type")
    subject_type: Optional[str] = payload.get("subject_type", "user")

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Guard: must be an access token
    if not subject_id or token_type != "access":
        raise credentials_exception

    # 根据 subject_type 查询对应的表（使用映射避免 if-else）
    query_map = {
        "user": (User, User.id),
        "admin": (Admin, Admin.id),
    }
    
    model_info = query_map.get(subject_type)
    if not model_info:
        raise credentials_exception
    
    model, id_field = model_info
    result = await db.execute(select(model).filter(id_field == subject_id))
    entity = result.scalars().first()

    if not entity:
        raise credentials_exception
    return entity


async def get_current_active_user_or_admin(current=Depends(get_current_user_or_admin)):
    """确保用户或管理员账户处于活跃状态"""
    if not current.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return current


# ---------------------------------------------------------------------------
# Multi-tenant query helper
# ---------------------------------------------------------------------------
def is_admin_entity(entity) -> bool:
    """检查实体是否是管理员（根据类名判断）"""
    return type(entity).__name__ == "Admin"


def scoped_query(query, model, entity):
    """Apply row-level isolation: user sees only own data, admin sees all.

    Uses class name check to determine entity type (avoids if-else branching).
    Admin entities (from admins table) bypass the filter.
    """
    # 管理员可以看到所有数据，普通用户只能看到自己的数据
    return query if is_admin_entity(entity) else query.filter(model.user_id == entity.id)
