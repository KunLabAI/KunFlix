# 部署与环境配置 (Deployment)

本指南旨在帮助您在本地 Windows 环境中快速搭建开发环境。我们使用 Python 虚拟环境 (venv) 和 Docker (可选，但推荐) 来管理依赖。

## 1. 前置条件 (Prerequisites)

请确保已安装以下软件：
*   **Python 3.10+**: [下载链接](https://www.python.org/downloads/)
*   **Node.js 18+ (LTS)**: [下载链接](https://nodejs.org/)
*   **PostgreSQL**: [下载链接](https://www.postgresql.org/download/) (确保 `psql` 命令可用或服务已启动)
*   **Redis**: [下载链接](https://redis.io/download/) (Windows版本或WSL)
*   **Git**: [下载链接](https://git-scm.com/downloads)

## 2. 数据库配置

1.  启动 PostgreSQL 服务。
2.  创建一个新的数据库 `infinite_game_db`：
    ```bash
    createdb -U postgres infinite_game_db
    ```
3.  启动 Redis 服务 (默认端口 6379)。

## 3. 后端部署 (Backend)

1.  进入 `infinite-game/backend` 目录。
2.  复制环境变量示例文件：
    ```powershell
    copy .env.example .env
    ```
3.  编辑 `.env` 文件，填入您的配置信息：
    *   `OPENAI_API_KEY`: 您的 OpenAI API 密钥。
    *   `DATABASE_URL`: 数据库连接字符串 (默认为 `postgresql+asyncpg://postgres:postgres@localhost/infinite_game_db`)。
    *   `REDIS_URL`: Redis 连接字符串 (默认为 `redis://localhost:6379/0`)。
4.  运行启动脚本 (自动创建虚拟环境并安装依赖)：
    ```powershell
    ..\start_backend.bat
    ```
    *   若首次运行，脚本会自动创建 `venv` 并安装依赖，这可能需要几分钟。
    *   成功启动后，您将看到 Uvicorn 运行在 `http://0.0.0.0:8000`。

## 4. 前端部署 (Frontend)

1.  进入 `infinite-game/frontend` 目录。
2.  运行启动脚本 (自动安装依赖并启动)：
    ```powershell
    ..\start_frontend.bat
    ```
    *   若首次运行，脚本会自动执行 `npm install`。
    *   成功启动后，Next.js 将运行在 `http://localhost:3000`。

## 5. 验证部署

1.  打开浏览器访问 `http://localhost:3000`。
2.  输入任意用户名，点击 **Start Adventure**。
3.  若一切正常：
    *   右侧 Story Log 区域会显示 "Connected"。
    *   稍等片刻，您将看到 AI 生成的初始剧情文本流式输出。
    *   控制台无报错信息。

## 常见问题 (FAQ)

*   **数据库连接失败**: 请检查 `DATABASE_URL` 中的用户名和密码是否与您的本地 Postgres 配置一致。
*   **OpenAI API 错误**: 请确保 `.env` 中的 API Key 正确且有额度。
*   **WebSocket 连接断开**: 检查后端服务是否正在运行，且端口未被占用。
