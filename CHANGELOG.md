# 更新日志 / Changelog

本文件记录 KunFlix 各版本的变更。版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

版本号单一来源：`backend/config.py` 的 `Settings.VERSION`，并与 `frontend/package.json`、`backend/admin/package.json` 保持同步。

---

## [v0.1.2] - 2026-08-26

**主题：安装与启动体验修复 —— 前端依赖冲突清理、PostgreSQL 空库引导兼容、SQLite 免安装兜底**

上一版本：`v0.1.1`。本版本无 schema 变更，无新增第三方依赖。

### ✨ 新增

#### dev.py SQLite 免安装兜底

新手开发者未安装 PostgreSQL 时，项目此前会在数据库探测失败处 fail-fast。现在 `dev.py` 探测失败后进入交互菜单：

- **[1] 自动降级 SQLite 继续启动**：自动把 `backend/.env` 的 `DATABASE_URL` 改写（或追加）为 `sqlite+aiosqlite:///./kunflix.db`，重新探测通过后继续完整启动，零依赖跑起全栈。
- **[2] 我已修复，重新探测**：装好 PostgreSQL / Docker 后原地重试，无需重跑依赖安装。
- **[3] 退出**：手动处理后再运行 `dev.py`。
- 非交互终端（CI / 管道）`input()` 抛 EOFError 时按退出处理，保持原有 fail-fast 行为不变。
- SQLite 兜底仅面向本地开发/快速体验；后端内置的 SQLite 方言支持（PRAGMA 调优、全局写锁、连接池配置）自动生效。

#### README 引导补充

`README.md` / `README_EN.md` 双语同步：环境要求处新增「没装 PostgreSQL 也能跑」提示，本地开发章节补充 SQLite 兜底说明。

### 🔧 改进

- **数据库引导统一走快通道**：`seed_db.py` 的建库策略与 `startup.py` 的 `_try_fast_bootstrap` 对齐 —— 空库直接 `Base.metadata.create_all()` 建终态 schema + `alembic stamp head`，不再重放历史迁移。
- **seed 引擎隔离**：`seed_db.py` 使用独立的 `create_async_engine` 与 session 工厂，避免 alembic 的 env.py dispose 全局 engine 的事件循环导致后续连接报 `Event loop is closed`。
- **alembic stamp 移出事件循环**：`alembic stamp` 内部会再启 `asyncio.run`，改为在 `asyncio.run(_bootstrap())` 返回后同步执行，消除嵌套循环 RuntimeError。
- seed 失败时以非零退出码终止启动，避免带残缺数据起服务。

### 🐛 修复

- **前端依赖 ERESOLVE 冲突**：`package.json` 中 27 个 `@tiptap/*` 包混用 `^3.20.4` ~ `^3.23.6` 多个版本范围，而 tiptap v3 各包要求 peer 精确同版本，导致 `npm ci` 直接失败；已统一为 `^3.23.6` 并重新生成 lock 文件。
- **React 版本不匹配**：`react@19.2.3` 与 `react-dom@19.2.7` 版本错位触发 Next.js 启动报错，已在 `dependencies` 与 `overrides` 两处统一为 `19.2.3`。
- **PostgreSQL 空库初始化失败**：alembic 历史迁移含 SQLite 专用语法（`PRAGMA`、`sqlite_master` 等）且存在外键类型时序问题（`credit_transactions.session_id` 为 VARCHAR 却引用当时还是 INTEGER 的 `chat_sessions.id`），在 PG 空库重放必失败；现改走 create_all + stamp 快通道彻底绕过。

### 🔢 版本管理同步

| 位置 | v0.1.1 | v0.1.2 |
|---|---|---|
| `backend/config.py` → `Settings.VERSION` | `0.1.1` | `0.1.2` |
| `frontend/package.json` | `0.1.1` | `0.1.2` |
| `backend/admin/package.json` | `0.1.1` | `0.1.2` |
| 两侧 `package-lock.json` | `0.1.1` | `0.1.2` |

### ✅ 测试与验证

- 模拟 PostgreSQL 不可达 → 选 [1] 自动降级 SQLite：配置写入、重新探测通过（exit 0）。
- SQLite 模式完整初始化（create_all + stamp + 全部种子数据）：exit 0。
- PostgreSQL 模式全栈启动验证：Backend / Frontend / Admin 三服务全部 200，`GET /api/auth/public-settings` 响应正常。

### 📌 升级说明

1. **无 schema 变更，无需迁移**。
2. 已有 PostgreSQL 库且 `alembic_version` 已 stamp 的部署不受影响；全新空库此后走 create_all + stamp 快通道。
3. SQLite 兜底生成的 `backend/kunflix.db` 仅供本地开发，请勿提交到 Git；生产与多智能体协作请务必使用 PostgreSQL。

### 📁 主要变更文件

```
dev.py                                数据库探测失败交互兜底、SQLite 自动降级
backend/scripts/seed_db.py            快通道建库、独立引擎、stamp 移出事件循环
backend/config.py                     版本号 0.1.1 → 0.1.2
frontend/package.json                 tiptap 版本统一、react-dom 对齐、版本号
frontend/package-lock.json            重新生成（tiptap 统一版本）
backend/admin/package.json            版本号
backend/admin/package-lock.json       版本号
README.md / README_EN.md              PostgreSQL 兜底引导（双语）
CHANGELOG.md                          本文件
```

---

## [v0.1.1] - 2026-08-01

**主题：MiniMax-H3 视频模型接入 + AI 助手交互体验重做**

上一版本：`v0.1.0`。本版本无数据库迁移，无新增第三方依赖。

### ✨ 新增

#### MiniMax-H3（Hailuo-03）视频生成模型

在既有 MiniMax 供应商框架上接入 MiniMax 视频 v2 接口，与 v1 Hailuo 系列双代次并存、互不影响。

- **接口**：`POST /v2/video_generation` 提交、`GET /v2/query/video_generation/{task_id}` 查询、`DELETE /v2/video_generation/{task_id}` 取消/删除；v2 查询直接返回 `content.url`，不再需要 v1 的 `file_id` → `/v1/files/retrieve` 二次换取。
- **三种生成场景**（由 `video_mode` 与已绑定素材自动推导，遵循接口的互斥约束）：
  - 文生视频 `t2va`
  - 图生视频 `i2va`：支持首帧、尾帧、首尾帧组合
  - 参考生视频 `r2va`：参考图 ≤ 9、参考视频 ≤ 3、参考音频 ≤ 3
- **参数能力**：2K 输出、时长 4–15 秒整数、7 种宽高比；宽高比按场景归一（文生不接受 `adaptive` 时兜底 `16:9`，图生强制 `adaptive`，参考生默认 `adaptive`）。
- **提交前预校验**（避免无效上游请求）：提示词必填、图生缺图、参考音频单独输入、参考素材数量截断、单文件体积（图 30MB / 视频 50MB / 音频 15MB）与请求体 64MB 上限。
- **错误可读化**：解析 OpenAI 风格错误体，`1000/1002/1004/1008/1026/2013` 等内部错误码转为中文提示（如余额不足、触发限流、命中敏感内容）。
- **任务清理**：删除本地视频任务时 best-effort 调用上游取消/删除（`queued` → cancel，终态 → delete），失败不阻断本地删除。
- **Endpoint 覆盖**：v2 路径支持 `LLMProvider.base_url`（自动剥离 `/v1`、`/v2` 版本后缀），便于切换国内/海外域名。
- **回调**：`callback_url` 按现有架构不下发，统一走 arq 后台轮询 + 前端轮询。

前端为能力驱动，模型能力表声明后参数控件（模式 / 时长 / 分辨率 / 宽高比 / 首尾帧 / 参考素材槽位）自动适配，无需逐模型改 UI。

#### AI 助手小球 Orbie

- 新增 `AiOrb`：基于 `@paper-design/shaders-react` Warp shader 的果冻质感动态头像，含眨眼、左右张望、开心瞪眼 + 腮红、周期蹦跳，拖拽时冒汗 / 眼睛变 `><` / 弹出气泡。
- 新增 `DraggableOrb`：以 AI 面板为空间边界构建"房间"物理感——四壁与输入区"地板"硬阻挡、撞墙按方向压扁回弹、松手弹回原位、回弹静默期屏蔽误点击，并支持气泡点击。
- AI 助手折叠态入口由静态图标按钮替换为小球，支持拖拽橡皮筋弹回，拖动过程中不会误触发展开。

### 🔧 改进

- **AI 助手欢迎页重构**：由四宫格预设按钮改为小球 + 轮播对话气泡（展示 8–12 秒、留白 3–5 秒、随机不重复推进），欢迎词支持 `{{name}}` 昵称插值。
- **预设提示词改为"注入输入框"语义**：点击气泡不再直接发送，而是把完整文案填入输入框并聚焦，供用户编辑后再发送（`MessageInput` 新增 `injectedPrompt` + nonce 机制，支持同一文案重复注入）。
- **四条预设提示词升级为专业结构化模板**（科幻爱情剧本 / 角色人物设计 / 分镜脚本 / 文案润色），中英双语文案同步。
- **剧场活跃度排序**：对话发送消息时触达 `Theater.updated_at`（限定归属当前用户，防止越权触达他人剧场），首页"最近剧场"按最后活跃时间排序。
- **剧场列表缓存新鲜窗口** 60 秒 → 6 秒，缩短活跃度变化的可见延迟。
- **版本号纳入运行时**：`FastAPI` 的 `title`/`version` 改由 `settings` 提供，`GET /` 返回 `version` 字段，便于部署后核对版本。

### 🐛 修复

- **视频分辨率提交 422**：请求 schema 的 `quality` 字面量缺少能力表已声明的 `512p`（Hailuo-02）与 `4k`（Veo 3.1），选中即被校验拦截；本次补齐并新增 `2k`。
- **AI 会话初始化重复建会话**：并发 effect 竞态与 React StrictMode 双调用会重复创建会话，新增按 `theaterId` 的防重入标记。
- **新建剧场排在列表末尾**：`updated_at` 为 NULL 时被 `nullslast` 推到最后，改用 `coalesce(updated_at, created_at)` 排序。
- **视频提示词长度限制过紧**：上限由 2000 提升至 7000（对齐 MiniMax-H3 单条 text 上限），前端提交侧同步按 7000 截断，避免超长直接 422。
- 修正视频模型能力配置的 TypedDict 声明：拆出可选能力键，消除 Seedance 等条目原有的类型不符。

### 🔢 版本管理同步

| 位置 | v0.1.0 | v0.1.1 |
|---|---|---|
| `backend/config.py` → `Settings.VERSION` | `1.0.0`（陈旧且未被使用） | `0.1.1`（单一来源，被 FastAPI 与 `GET /` 消费） |
| `frontend/package.json` | `0.1.0` | `0.1.1` |
| `backend/admin/package.json` | `0.1.0` | `0.1.1` |
| 两侧 `package-lock.json` | `0.1.0` | `0.1.1` |

### ✅ 测试与验证

- 新增 `backend/tests/services/test_minimax_h3_video.py`：63 项，覆盖场景推导、`content[]` 组装、宽高比/时长规则、素材数量截断、四类参数校验、体积守卫、状态与错误映射，并以假 HTTP 客户端断言真实请求的 URL / 方法 / 请求体（含 v1 端点回归守卫、`base_url` 覆盖、工厂层不再二次取 URL）。
- 后端全量测试：**190 passed**。
- `frontend` `tsc --noEmit` 无错误；`backend/admin` 仅剩一处与本次无关的既有测试文件类型告警。

### 📌 升级说明

1. **无需执行数据库迁移**。
2. 使用 MiniMax-H3 需在管理后台的 MiniMax 供应商下新增模型 `MiniMax-H3`，并设置 `model_metadata.model_type = "video"`；随后在定价表按该模型配置计费维度。
3. 2K 输出目前复用 `video_output_720p`（每输出秒）计费维度，与既有 1080p / 4K 的处理约定一致，未新增计费维度。
4. H3 返回的 `usage.input_seconds` / `input_image_count`（参考视频按秒、参考图计数）暂未纳入本地积分计算，如需精确对账需另行扩展计费维度。
5. 本地素材以 base64 内联上传，参考视频接近 50MB 时会触碰 64MB 请求体上限，此时返回中文提示而非上游报错；彻底解决需接入 MiniMax 文件上传以换取 `mm_file://` 引用。

### 📁 主要变更文件

**后端**

```
backend/config.py                                       版本号单一来源
backend/main.py                                         FastAPI title/version、GET / 返回版本
backend/schemas.py                                      quality 字面量、prompt 上限、字段注释
backend/routers/videos.py                               轮询透传 model、删除时清理上游任务
backend/routers/chats.py                                发消息触达 Theater.updated_at
backend/services/theater.py                             剧场列表 coalesce 排序
backend/services/video_generation.py                    poll 参数映射表、cancel_video_task 入口
backend/services/video_providers/base.py                适配器基类新增 delete_task
backend/services/video_providers/minimax_provider.py    MiniMax-H3 (v2) 完整实现
backend/services/video_providers/model_capabilities.py  MiniMax-H3 能力声明、TypedDict 拆分
backend/services/video_providers/__init__.py            模块说明
backend/tasks_queue/tasks.py                            后台轮询透传 model
backend/tests/services/test_minimax_h3_video.py         新增（63 项）
backend/admin/src/types/video.ts                        2K 与宽高比标签
```

**前端**

```
frontend/src/components/canvas/AiOrb.tsx                        新增
frontend/src/components/canvas/DraggableOrb.tsx                 新增
frontend/src/components/canvas/AIAssistantPanel.tsx             小球入口、提示词注入、拖拽边界
frontend/src/components/ai-assistant/WelcomeMessage.tsx         欢迎页重构
frontend/src/components/ai-assistant/MessageInput.tsx           injectedPrompt 注入
frontend/src/components/ai-assistant/hooks/useSessionManager.ts 初始化防重入
frontend/src/components/canvas/VideoGeneratePanel.tsx           提示词长度对齐
frontend/src/components/canvas/VideoGeneratePanel/constants.ts  VIDEO_PROMPT_MAX
frontend/src/hooks/useVideoGeneration.ts                        2K 分辨率标签
frontend/src/i18n/locales/{zh-CN,en-US}.json                    欢迎词与提示词模板
frontend/src/lib/theaterListCache.ts                            新鲜窗口 6 秒
```

**文档**

```
minimax-H3视频模型开发指南.md    MiniMax 视频 v2 官方接口文档（参考资料）
CHANGELOG.md                     本文件
```

---

## [v0.1.0]

首个标记版本，详见 GitHub 上的 `v0.1.0` 标签与提交历史。
