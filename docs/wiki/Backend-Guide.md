# 后端开发指南 (Backend Guide)

## 目录结构

```bash
backend/
├── admin/              # 后台管理系统前端代码 (Next.js)
├── routers/            # API 路由模块
│   ├── admin.py        # 后台管理相关 API
│   └── llm_config.py   # LLM 配置相关 API
├── agents.py           # 智能体定义与 AgentScope 编排
├── config.py           # 配置管理（Settings, Environment Variables）
├── database.py         # 数据库连接与异步会话管理
├── main.py             # FastAPI 入口文件（API Endpoints, WebSocket）
├── models.py           # SQLAlchemy ORM模型
├── schemas.py          # Pydantic 数据验证模型
├── services.py         # 业务逻辑服务层（GameService）
├── tasks.py            # 后台任务与预生成逻辑（N+2策略）
├── requirements.txt
└── .env                # 环境变量配置
```

## 核心组件

### 1. NarrativeEngine (叙事引擎)
*   **位置**: `backend/agents.py`
*   **功能**:
    *   管理 **AgentScope** 的初始化与配置加载。
    *   定义 Director（导演）、Narrator（旁白）、NPC_Manager（NPC管理）等智能体。
    *   实现 `generate_chapter`: 协调多智能体生成章节内容，包括剧情大纲、详细内容和 NPC 状态更新。
    *   支持动态重新加载 LLM 配置 (`reload_config`)。

### 2. GameService (游戏服务)
*   **位置**: `backend/services.py`
*   **功能**:
    *   `create_player`: 创建玩家档案。
    *   `init_world`: 初始化世界观和前两章内容。
    *   `process_player_choice`: 处理玩家交互，触发剧情推进。
*   **数据库交互**: 封装了大部分与 PostgreSQL 的 CRUD 操作。

### 3. API Routers (路由层)
*   **位置**: `backend/routers/`
*   **功能**:
    *   `admin.py`: 提供给后台管理系统的接口，包括数据统计、玩家/剧情管理。
    *   `llm_config.py`: 提供 LLM 供应商的 CRUD 和连接测试接口。

## 数据模型 (Models)

### Player (玩家)
*   `id`: 主键
*   `username`: 用户名
*   `current_chapter`: 当前章节
*   `personality_profile`: 玩家行为画像 (JSON)
*   `inventory`: 物品栏 (JSON)
*   `relationships`: NPC关系矩阵（好感度、信任度、隐藏属性） (JSON)

### StoryChapter (剧情章节)
*   `chapter_number`: 章节序号
*   `title`: 章节标题
*   `content`: 剧情正文
*   `status`: pending, generating, ready, completed
*   `choices`: 下一步的选项分支 (JSON)
*   `summary_embedding`: 剧情向量（用于一致性检测）
*   `world_state_snapshot`: 此时的世界状态快照

### Asset (多模态资源)
*   `type`: image, audio, voice
*   `content_hash`: 内容哈希 (用于去重)
*   `url`: 资源链接
*   `prompt`: 生成该资源的提示词
*   `last_accessed`: 最后访问时间 (用于 LRU 缓存清理)

### LLMProvider (LLM 供应商配置)
*   `name`: 供应商名称 (如 "OpenAI Dev", "DashScope Prod")
*   `provider_type`: 类型 (openai, dashscope, anthropic, gemini)
*   `api_key`: API 密钥
*   `base_url`: 自定义 API 地址 (可选)
*   `models`: 支持的模型列表 (JSON)
*   `is_active`: 是否激活
*   `is_default`: 是否为默认配置
*   `config_json`: AgentScope 额外配置参数

## API 接口概览

### Game API (面向游戏客户端)
*   `POST /players/`: 创建新玩家。
*   `POST /story/init/{player_id}`: 初始化玩家的世界观与第一章。
*   `WS /ws/{player_id}`: WebSocket 连接，用于实时推送剧情更新和接收玩家操作。

### Admin API (面向后台管理系统)
*   `GET /api/admin/stats`: 获取系统统计数据 (玩家数, 故事数等)。
*   `GET /api/admin/players`: 获取玩家列表。
*   `DELETE /api/admin/players/{player_id}`: 删除玩家及其存档。
*   `GET /api/admin/stories`: 获取剧情章节列表 (支持按玩家筛选)。

### LLM Config API (LLM 配置管理)
*   `GET /api/admin/llm-providers/`: 获取所有配置。
*   `POST /api/admin/llm-providers/`: 创建新配置。
*   `PUT /api/admin/llm-providers/{id}`: 更新配置。
*   `POST /api/admin/llm-providers/test-connection`: 测试 LLM 连接。

## 开发注意事项

1.  **异步编程**: 所有数据库操作和 IO 密集型任务均采用 `async/await` 模式。
2.  **数据库迁移**: 修改 `models.py` 后，虽然 `main.py` 启动时会尝试 `create_all`，但在生产环境中建议引入 Alembic 进行版本控制。
3.  **AgentScope 集成**: `agents.py` 负责将数据库中的 `LLMProvider` 配置转换为 AgentScope 的运行时配置。修改智能体逻辑时，需注意保持与 AgentScope 版本的兼容性。
4.  **环境配置**: 即使支持动态配置 LLM，`.env` 文件仍需配置基础的数据库 (`DATABASE_URL`) 和 Redis (`REDIS_URL`) 连接信息。
