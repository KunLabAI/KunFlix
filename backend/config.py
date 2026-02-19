import os
from pydantic_settings import BaseSettings

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "infinite_game.db")

class Settings(BaseSettings):
    PROJECT_NAME: str = "Infinite Narrative Game"
    VERSION: str = "1.0.0"
    
    # Database
    # Default to local postgres user/pass. Override with .env
    # Fallback to SQLite if not configured (better for local dev)
    # Use absolute path to ensure we always use the same DB file regardless of CWD
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DB_PATH}"
    # DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost/infinite_game_db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # AI Models
    OPENAI_API_KEY: str = ""
    CLAUDE_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    
    # Generation Settings
    STORY_GENERATION_MODEL: str = "gpt-4-turbo"
    IMAGE_GENERATION_MODEL: str = "dall-e-3"
    
    class Config:
        env_file = ".env"

settings = Settings()
