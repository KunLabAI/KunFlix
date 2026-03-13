import asyncio
import os
import sys

# Add local deps to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "deps")))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal
from models import LLMProvider, Admin, User
from config import settings
import bcrypt
# from passlib.context import CryptContext

# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

async def seed():
    print("Seeding database...")
    async with AsyncSessionLocal() as session:
        # 1. Seed LLM Provider
        result = await session.execute(select(LLMProvider).filter_by(name="OpenAI"))
        provider = result.scalars().first()
        if not provider:
            print("Creating default OpenAI provider...")
            provider = LLMProvider(
                name="OpenAI",
                provider_type="openai_chat",
                api_key=settings.OPENAI_API_KEY or "sk-placeholder",
                models=["gpt-4-turbo", "gpt-3.5-turbo"],
                is_active=True,
                is_default=True
            )
            session.add(provider)
        else:
            print("OpenAI provider already exists.")

        # 2. Seed Admin
        result = await session.execute(select(Admin).filter_by(email="admin@example.com"))
        admin = result.scalars().first()
        if not admin:
            print("Creating default admin...")
            admin = Admin(
                email="admin@example.com",
                nickname="SuperAdmin",
                password_hash=hash_password("admin123"),
                permission_level="super_admin"
            )
            session.add(admin)
        else:
            print("Admin already exists.")

        await session.commit()
    print("Seeding completed.")

if __name__ == "__main__":
    try:
        asyncio.run(seed())
    except Exception as e:
        print(f"Seeding failed: {e}")
