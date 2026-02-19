# 需求追踪 (Requirements Traceability)

本页面记录了原始需求与当前代码实现的对应关系。

## 1. 世界观与内容生成引擎

| 需求点 | 状态 | 代码位置 | 说明 |
| :--- | :--- | :--- | :--- |
| **大语言模型核心** | ✅ 已实现 | `backend/agents.py` | 使用 `AgentScope` 框架集成 `gpt-4-turbo`。 |
| **世界观动态生成** | ✅ 已实现 | `backend/services.py` | `init_world` 函数调用 Director Agent 生成初始设定。 |
| **章节预生成 (N+2)** | ✅ 已实现 | `backend/tasks.py` | `pre_generate_next_chapter` 实现异步预生成逻辑。 |
| **偏离度检测** | ⚠️ 部分实现 | `backend/models.py` | 数据库字段 `summary_embedding` 已预留，具体逻辑待完善。 |

## 2. 多模态资产生产管线

| 需求点 | 状态 | 代码位置 | 说明 |
| :--- | :--- | :--- | :--- |
| **视觉系统 (生图)** | ⚠️ 待接入 | `backend/tasks.py` | `generate_assets_for_chapter` 框架已搭建，需集成 Stable Diffusion API。 |
| **音频系统 (配音/BGM)** | ⚠️ 待接入 | `backend/tasks.py` | 同上，需集成 TTS/MusicGen API。 |
| **资产缓存池** | ✅ 已实现 | `backend/models.py` | `Asset` 表包含 `content_hash` 和 `last_accessed` 字段，支持去重与LRU。 |

## 3. 交互式叙事系统

| 需求点 | 状态 | 代码位置 | 说明 |
| :--- | :--- | :--- | :--- |
| **多种交互模板** | ⚠️ 基础版 | `frontend/src/app/page.tsx` | 目前仅支持文本输入，需扩展选择题/填空题UI组件。 |
| **NPC深度互动** | ✅ 已实现 | `backend/models.py` | `Player` 表中 `relationships` JSON字段存储好感度/信任度矩阵。 |
| **行为分析模块** | ⚠️ 待完善 | `backend/models.py` | `personality_profile` 字段已预留，分析逻辑需在 Agent 中增强。 |

## 4. 全栈技术架构

| 需求点 | 状态 | 代码位置 | 说明 |
| :--- | :--- | :--- | :--- |
| **前端 Next.js 16** | ✅ 已实现 | `frontend/` | 基于 App Router 架构，集成 Tailwind CSS。 |
| **Pixi.js 渲染** | ✅ 已实现 | `frontend/src/components/GameCanvas.tsx` | 实现了基础的 Pixi Application 初始化与组件封装。 |
| **Redis 队列** | ✅ 已实现 | `backend/config.py` | 集成 Redis 作为 Celery/BackgroundTasks 的 Broker。 |
| **WebSocket 长连接** | ✅ 已实现 | `backend/main.py` | `/ws/{player_id}` 端点实现双向实时通信。 |
| **AI 中间层 (MCP)** | ⚠️ 待封装 | `backend/agents.py` | 目前直接调用 AgentScope，需进一步封装标准 MCP 适配器。 |

## 5. 性能与质量保障

| 需求点 | 状态 | 代码位置 | 说明 |
| :--- | :--- | :--- | :--- |
| **内容过滤管道** | ⚠️ 待接入 | `backend/agents.py` | 需在 System Prompt 中增加安全过滤指令或接入第三方审核API。 |
| **生成失败熔断** | ⚠️ 待实现 | - | 需在 API 调用层增加重试与降级逻辑。 |
| **体验基线 (<2s)** | ⚠️ 待优化 | - | 依赖模型响应速度，需通过流式传输 (Streaming) 优化首字延迟。 |

## 后续计划 (Next Steps)

1.  **完善多模态生成**: 接入 DALL-E 3 或 Stable Diffusion API，实现真正的图文并茂。
2.  **增强交互UI**: 前端增加选择题、填空题的专用组件。
3.  **流式响应**: 优化 WebSocket 传输协议，支持 Token 级别的流式输出。
4.  **安全审核**: 集成内容安全审核机制。
