# Infinite Narrative Game System

Based on AgentScope, Next.js 16, Python, and PostgreSQL.

## Architecture

### 1. Worldview & Content Generation Engine
- **Core**: AgentScope (LLM Orchestration)
- **Features**:
  - Dynamic World Generation (Lore, Characters, Plot)
  - Pre-generation (Background Tasks via Redis Queue)
  - Consistency Check (Embedding-based Drift Detection)

### 2. Multi-modal Asset Pipeline
- **Visual**: Stable Diffusion / DALL-E integration via MCP adapter.
- **Audio**: TTS (ElevenLabs/OpenAI) + MusicGen via MCP.
- **Caching**: Redis (LRU Strategy, MD5 deduplication).

### 3. Interactive Narrative System
- **Frontend**: Next.js 16 (App Router), Pixi.js (Visuals), Web Audio API.
- **Backend**: FastAPI (WebSocket for real-time interaction).
- **Data**: PostgreSQL (Player Profile, Story Graph, Choices).

## Setup Instructions (Local Development)
 
## Wiki
- 项目Wiki入口：docs/wiki/README.md

### Prerequisites
- **PostgreSQL**: Install and run locally (ensure `psql` is in PATH or service is running).
- **Redis**: Install and run locally (ensure `redis-server` is running).
- **Python**: 3.10+
- **Node.js**: 18+

### Quick Start (Windows)

1. **Start Services**:
   Ensure your local PostgreSQL and Redis servers are running.
   - Create a database named `infinite_game_db` in PostgreSQL.

2. **Configure Environment**:
   Create a `.env` file in `infinite-game/backend/` based on `config.py`:
   ```ini
   OPENAI_API_KEY=your_key_here
   # Update with your local postgres credentials
   DATABASE_URL=postgresql+asyncpg://postgres:yourpassword@localhost/infinite_game_db
   REDIS_URL=redis://localhost:6379/0
   ```

3. **Start Backend**:
   Run `start_backend.bat`
   (This will create a Python virtual environment `venv`, install dependencies, and start the FastAPI server on port 8000)

4. **Start Frontend**:
   Run `start_frontend.bat`
   (This will install npm dependencies and start the Next.js dev server on port 3000)

## Configuration
Update `.env` in `backend/` with:
- `OPENAI_API_KEY`
- `DATABASE_URL` (e.g., `postgresql+asyncpg://postgres:password@localhost/infinite_game_db`)
- `REDIS_URL` (defaults to localhost)
