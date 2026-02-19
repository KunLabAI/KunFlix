# 系统架构 (System Architecture)

## 技术概览

本项目采用全栈微服务架构，前端基于 Next.js 16，后端采用 Python FastAPI 结合 AgentScope 作为核心叙事引擎，使用 PostgreSQL 和 Redis 进行数据持久化与任务队列管理。同时提供独立的后台管理系统进行运营配置。

```mermaid
graph TD
    User(玩家) -->|WebSocket/HTTP| GameClient[游戏前端 (Next.js 16)]
    Admin(管理员) -->|HTTP| AdminDashboard[后台管理系统 (Next.js 16)]
    
    GameClient -->|API Request| FastAPI[后端 (FastAPI)]
    GameClient -->|WebSocket| FastAPI
    AdminDashboard -->|Admin API| FastAPI
    
    subgraph "Backend (Python)"
        FastAPI --> NarrativeEngine[叙事引擎 (AgentScope)]
        FastAPI --> GameService[游戏服务]
        FastAPI --> AdminRouter[管理接口]
        
        NarrativeEngine --> LLM[LLM API (OpenAI/Claude/DashScope)]
        NarrativeEngine --> LLMConfig[动态 LLM 配置]
        
        GameService --> DB[(PostgreSQL)]
        GameService --> Redis[(Redis Queue)]
        
        Redis --> Worker[后台生成任务]
        Worker --> NarrativeEngine
        Worker --> AssetPipeline[多模态资产生成]
    end
    
    subgraph "Frontend"
        GameClient
        AdminDashboard
    end
```

## 核心模块

### 1. 叙事与内容生成引擎
*   **AgentScope框架**: 负责编排多个 Agent（如导演、旁白、NPC 管理器）。
*   **预生成机制**: 采用 N+2 章节预生成策略，后台任务通过 Redis 队列异步执行。
*   **一致性校验**: 基于向量相似度的偏离检测模块。
*   **动态 LLM 配置**: 支持运行时切换和测试不同的 LLM 提供商。

### 2. 多模态资产管线
*   **视觉生成**: 集成 Stable Diffusion / DALL-E 生成场景图和立绘。
*   **音频生成**: 使用 TTS 模型生成语音，MusicGen 生成动态背景音乐。
*   **资产缓存**: 对生成的资产进行 MD5 去重，并使用 Redis 实现 LRU 淘汰策略。

### 3. 数据存储层
*   **PostgreSQL**: 存储玩家档案、剧情节点、NPC 关系矩阵、系统配置（LLM Provider）。
*   **Redis**: 用于任务队列（Celery/BackgroundTasks）、会话状态缓存和资产缓存。

## 技术栈选型理由

*   **Next.js 16**: 提供高性能的 SSR 渲染，优化首屏加载，且支持最新的 React 特性。
*   **FastAPI**: Python 生态中最高效的异步 Web 框架，完美契合 LLM 调用的异步特性。
*   **AgentScope**: 专为多智能体协作设计的框架，便于管理复杂的叙事逻辑。
*   **PostgreSQL**: 强大的关系型数据库，适合存储复杂的剧情图谱和关联数据。
*   **Pixi.js**: 高性能的 2D 渲染引擎，用于呈现精美的立绘和动态场景。
