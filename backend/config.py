from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Infinite Narrative Game"
    VERSION: str = "1.0.0"
    
    # Database
    # Default to local postgres user/pass. Override with .env
    # Fallback to SQLite if not configured (better for local dev)
    DATABASE_URL: str = "sqlite+aiosqlite:///./infinite_game.db"
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
