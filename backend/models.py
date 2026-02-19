from sqlalchemy import Column, Integer, String, Text, ForeignKey, JSON, DateTime, Float, Boolean
from sqlalchemy.sql import func
from database import Base

class Player(Base):
    __tablename__ = "players"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Player state & preferences
    current_chapter = Column(Integer, default=1)
    personality_profile = Column(JSON, default={}) # Behavior analysis
    inventory = Column(JSON, default=[])
    
    # NPC Relationships: {npc_id: {affinity: 0, trust: 0, hidden: 0}}
    relationships = Column(JSON, default={})

class StoryChapter(Base):
    __tablename__ = "story_chapters"
    
    id = Column(Integer, primary_key=True, index=True)
    player_id = Column(Integer, ForeignKey("players.id"))
    chapter_number = Column(Integer)
    title = Column(String)
    content = Column(Text) # The main text content
    
    # Status: pending, generating, ready, completed
    status = Column(String, default="pending") 
    
    # Choices leading to next branches
    choices = Column(JSON, default=[]) 
    
    # Metadata for consistency check
    summary_embedding = Column(JSON) # Vector for consistency check
    world_state_snapshot = Column(JSON) # Snapshot of variables
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Asset(Base):
    __tablename__ = "assets"
    
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String) # image, audio, voice
    content_hash = Column(String, index=True) # MD5 for deduplication
    url = Column(String)
    prompt = Column(Text)
    
    # Cache management
    last_accessed = Column(DateTime(timezone=True), server_default=func.now())
    file_path = Column(String)

class LLMProvider(Base):
    __tablename__ = "llm_providers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) # e.g. "OpenAI", "DashScope"
    provider_type = Column(String) # e.g. "openai_chat", "dashscope_chat", "post_api_chat"
    
    api_key = Column(String) # Encrypted ideally, but plain for now
    base_url = Column(String, nullable=True) # e.g. "https://api.openai.com/v1"
    
    models = Column(JSON, default=[]) # List of model names e.g. ["gpt-4", "gpt-3.5"]
    
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    
    config_json = Column(JSON, default={}) # Extra config for AgentScope
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
