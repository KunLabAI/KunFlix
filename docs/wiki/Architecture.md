# 系统架构 (System Architecture)

## 技术概览

本项目采用全栈微服务架构，前端基于Next.js 16，后端采用Python FastAPI结合AgentScope作为核心叙事引擎，使用PostgreSQL和Redis进行数据持久化与任务队列管理。

```mermaid
graph TD
    User(玩家) -->|WebSocket| NextJS[前端 (Next.js 16)]
    NextJS -->|API Request| FastAPI[后端 (FastAPI)]
    NextJS -->|WebSocket| FastAPI
    
    subgraph "Backend (Python)"
        FastAPI --> NarrativeEngine[叙事引擎 (AgentScope)]
        FastAPI --> GameService[游戏服务]
        NarrativeEngine --> LLM[LLM API (OpenAI/Claude)]
        
        GameService --> DB[(PostgreSQL)]
        GameService --> Redis[(Redis Queue)]
        
        Redis --> Worker[后台生成任务]
        Worker --> NarrativeEngine
        Worker --> AssetPipeline[多模态资产生成]
    end
    
    subgraph "Frontend (Next.js)"
        PixiJS[Pixi.js 渲染]
        AudioAPI[Web Audio API]
        React[React Components]
    end
```

## 核心模块

### 1. 叙事与内容生成引擎
*   **AgentScope框架**: 负责编排多个Agent（如导演、旁白、NPC管理器）。
*   **预生成机制**: 采用 N+2 章节预生成策略，后台任务通过Redis队列异步执行。
*   **一致性校验**: 基于向量相似度的偏离检测模块。

### 2. 多模态资产管线
*   **视觉生成**: 集成Stable Diffusion / DALL-E生成场景图和立绘。
*   **音频生成**: 使用TTS模型生成语音，MusicGen生成动态背景音乐。
*   **资产缓存**: 对生成的资产进行MD5去重，并使用Redis实现LRU淘汰策略。

### 3. 数据存储层
*   **PostgreSQL**: 存储玩家档案、剧情节点、NPC关系矩阵等结构化数据。
*   **Redis**: 用于任务队列（Celery/BackgroundTasks）、会话状态缓存和资产缓存。

## 技术栈选型理由

*   **Next.js 16**: 提供高性能的SSR渲染，优化首屏加载，且支持最新的React特性。
*   **FastAPI**: Python生态中最高效的异步Web框架，完美契合LLM调用的异步特性。
*   **AgentScope**: 专为多智能体协作设计的框架，便于管理复杂的叙事逻辑。
*   **PostgreSQL**: 强大的关系型数据库，适合存储复杂的剧情图谱和关联数据。
*   **Pixi.js**: 高性能的2D渲染引擎，用于呈现精美的立绘和动态场景。
