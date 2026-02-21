# 无限剧情游戏系统 (Infinite Narrative Game System)

这是一个基于 **AgentScope** 多智能体框架、**Next.js 16** 前端、**FastAPI** 后端和 **PostgreSQL** 数据库构建的无限剧情游戏平台。利用 LLM 驱动的叙事引擎和多模态生成技术，为玩家提供沉浸式的动态游戏体验。

## 核心特性

- **动态世界观与剧情生成**：基于 AgentScope 的多智能体协作（导演、编剧、NPC），实现剧情的无限延伸与逻辑自洽。
- **多模态资产生成**：集成 通义万象/即梦AI-图片生成4.0 生成场景与立绘，集成 TTS/MusicGen 生成语音与背景音乐。
- **实时交互**：通过 WebSocket 实现低延迟的剧情推送与玩家互动。
- **动态 LLM 配置**：支持通过 Admin 后台动态管理和切换 LLM 提供商（OpenAI, DashScope, Anthropic, Gemini 等），无需重启服务。
- **后台管理系统**：提供可视化的玩家管理、剧情监控、资源管理和系统配置界面。
- **数据持久化与一致性**：使用 PostgreSQL 存储结构化数据，结合向量检索（Embedding）确保长剧情的一致性。

## 技术栈

### 后端 (Backend)
- **语言**: Python 3.10+
- **框架**: FastAPI (异步高性能 Web 框架)
- **AI 框架**: AgentScope (多智能体编排)
- **数据库**: PostgreSQL (使用 SQLAlchemy 异步 ORM), Redis (缓存与消息队列)
- **依赖管理**: pip / requirements.txt

### 前端 (Frontend)
- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **渲染**: Pixi.js (2D 图形渲染)
- **状态管理**: React Context / Hooks

### 后台管理 (Admin Dashboard)
- **框架**: Next.js 16
- **功能**: 系统监控、用户管理、LLM 供应商配置

## 目录结构

```bash
Infinite Game/
├── backend/                # Python 后端代码
│   ├── admin/              # 后台管理系统前端代码 (Next.js)
│   ├── routers/            # API 路由定义 (Admin, LLM Config 等)
│   ├── agents.py           # AgentScope 智能体定义
│   ├── main.py             # FastAPI 入口文件
│   ├── models.py           # 数据库模型
│   ├── services.py         # 业务逻辑层
│   ├── schemas.py          # Pydantic 数据验证模型
│   └── ...
├── frontend/               # 游戏客户端前端代码 (Next.js)
├── docs/                   # 项目文档
│   └── wiki/               # 详细开发文档
└── README.md               # 项目说明
```

## 快速开始

### 前置要求
- Python 3.10+
- Node.js 18+
- PostgreSQL (需创建数据库 `infinite_game_db`)
- Redis

### 1. 后端设置

```bash
cd backend

# 创建并激活虚拟环境 (推荐)
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入数据库连接信息和初始 API Key (可选，也可在后台配置)

# 启动后端服务
python main.py
# 服务将运行在 http://localhost:8000
# 注意：启动时会自动检查并应用数据库迁移。
```

### 数据库迁移

本项目使用 Alembic 管理数据库版本。当你修改了 `models.py` 中的模型定义后，请使用以下命令生成迁移脚本：

```bash
# 生成迁移脚本
python manage_db.py migrate "描述变更内容"

# 应用迁移 (通常在启动服务时自动执行，也可手动运行)
python manage_db.py upgrade

# 回滚迁移
python manage_db.py downgrade
```

详细说明请参考 [Wiki: 数据库迁移指南](docs/wiki/Database-Migration.md)。

### 2. 游戏前端设置

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 访问 http://localhost:3000
```

### 3. 后台管理系统设置

```bash
cd backend/admin

# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 访问 http://localhost:3001 (假设端口配置为 3001)
```

## 文档

详细的开发文档请参考 [Wiki](.qoder/repowiki/zh/content/快速开始.md)：

## 贡献

欢迎提交 Issue 和 Pull Request 来改进本项目。
