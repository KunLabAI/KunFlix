# 后端开发指南 (Backend Guide)

## 目录结构
```bash
backend/
├── agents.py       # 智能体定义（NarrativeEngine, Director, Narrator, NPC_Manager）
├── config.py       # 配置管理（Settings, Environment Variables）
├── database.py     # 数据库连接与会话管理
├── main.py         # FastAPI入口文件（API Endpoints, WebSocket）
├── models.py       # SQLAlchemy ORM模型
├── services.py     # 业务逻辑服务层（GameService）
├── tasks.py        # 后台任务与预生成逻辑（N+2策略）
├── requirements.txt
└── .env            # 环境变量配置
```

## 核心组件

### 1. NarrativeEngine (叙事引擎)
*   **位置**: `backend/agents.py`
*   **功能**:
    *   管理AgentScope的初始化。
    *   定义Director（导演）、Narrator（旁白）、NPC_Manager（NPC管理）等智能体。
    *   `generate_chapter`: 生成章节内容，包括剧情大纲、详细内容和NPC更新。
*   **调用**:
    ```python
    # 示例调用
    narrative_engine.generate_chapter(player_context={"id": 1}, previous_summary="...")
    ```

### 2. GameService (游戏服务)
*   **位置**: `backend/services.py`
*   **功能**:
    *   `create_player`: 创建玩家档案。
    *   `init_world`: 初始化世界观和前两章内容。
    *   `process_player_choice`: 处理玩家交互，触发剧情推进。
*   **数据库交互**: 负责与PostgreSQL的CRUD操作。

### 3. Background Tasks (后台任务)
*   **位置**: `backend/tasks.py`
*   **功能**:
    *   `pre_generate_next_chapter`: 实现N+2预生成策略。当玩家进入第N章时，异步生成第N+2章。
    *   `generate_assets_for_chapter`: 触发图像和音频的异步生成。

## 数据模型 (Models)

### Player (玩家)
*   `id`: 主键
*   `username`: 用户名
*   `current_chapter`: 当前章节
*   `personality_profile`: 玩家行为画像
*   `relationships`: NPC关系矩阵（好感度、信任度、隐藏属性）

### StoryChapter (剧情章节)
*   `chapter_number`: 章节序号
*   `content`: 剧情正文
*   `status`: pending, generating, ready, completed
*   `summary_embedding`: 剧情向量（用于一致性检测）
*   `world_state_snapshot`: 此时的世界状态快照

## API 接口

*   `POST /players/`: 创建新玩家。
*   `POST /story/init/{player_id}`: 初始化玩家的世界观与第一章。
*   `WS /ws/{player_id}`: 建立WebSocket连接，用于实时推送剧情更新。

## 开发注意事项

*   确保 `.env` 文件配置正确（`OPENAI_API_KEY`, `DATABASE_URL`）。
*   修改 `models.py` 后需要更新数据库架构（当前demo使用 `create_all`，生产环境建议使用 `alembic`）。
*   LLM调用是耗时操作，务必使用异步调用或后台任务处理。
