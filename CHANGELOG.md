# 更新日志 / Changelog

本文件记录 KunFlix 各版本的变更。版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

版本号单一来源：`backend/config.py` 的 `Settings.VERSION`，并与 `frontend/package.json`、`backend/admin/package.json` 保持同步。

---

## [v0.1.4] - 2026-09-28

**主题：Gemini TTS 语音合成节点全栈接入（画布节点 + 音色复刻/扩展音色库/试听 + Agent 技能 + 管理端配置）**

上一版本：`v0.1.3`。本版本**含数据库迁移**（新增 `tts_tasks`、`replicated_voices` 两张表），无新增第三方依赖。

### ✨ 新增

#### Gemini TTS 语音合成节点（画布）

以既有音乐生成（Lyria）链路为参照，同构接入 Google Gemini 系列 TTS 模型，打通「后端供应商适配 → 服务编排 → 路由 → 工具/Agent 技能 → 前端画布节点 → 管理端配置」全链路：

- **供应商适配层** `services/tts_providers/`：调用 Interactions API（`POST /v1beta/interactions`），支持单说话人（`speech_metadata.style` + 30 个预置音色）、双说话人 `conversational` 对话、WAV / L16 输出（裸 PCM 自动补 RIFF/WAVE 头）；`voice` 为 `auto` 时省略 `speech_config` 由模型自选音色。
- **数据模型 + 迁移**：新增 `TTSTask`（合成任务）、`ReplicatedVoice`（复刻音色）两表，迁移链 `k8l9m0n1o2p3` → `l9m0n1o2p3q4`。
- **计费**：新增 `tts_generation` 维度（按次计费）。
- **服务编排** `services/tts_generation.py`：工厂分派 + 异步后台执行（保存音频、注册 Asset、按次计费、画布占位节点回填、`tts.*` 实时推送）。
- **路由** `routers/tts.py`：生成 / 任务状态 / 会话任务列表 / 供应商 / 模型能力 / 音色列表 / 复刻上传 / 复刻删除 / 扩展音色库 / 试听 共 11 个端点，`main.py` 注册。
- **工具 + Agent 技能**：`tool_manager/providers/tts_gen.py` 封装 `generate_tts` 工具（text / voice / style / speakers），`skills/builtin_skills/tts_tools/SKILL.md` 内置技能供 Agent 勾选启用。
- **前端画布**：`TTSNode` + `TtsGeneratePanel`（模型选择器带供应商 logo/昵称、音色选择器分组、单/双说话人编辑），`useTtsGeneration` hook、`store` 新增 `TtsNodeData`、连线注入（text→tts 文本、tts→video 音频），AI 助手侧 `TtsTaskCard` + SSE 实时进度。
- **管理端**：`TtsGenConfigDialog`（启用 / 按 `model_type=tts` 选模型 / 默认音色含 auto / 输出格式）、LLM schema 新增「语音模型」类型、定价与 Agent 参数新增 `tts_generation` 维度、`seed_db.py` 预置 `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts`。

#### 音色能力：自动 / 复刻 / 扩展音色库 / 按需试听

- **自动音色**：`voice=auto`，交由模型自选。
- **音色复刻（持久音色库）**：`POST /v1beta/voices`（`type=replicated`、`store=true`），上传参考音频 + 授权录音，防御式 `_extract_voice_id` 递归提取 `voice_` / `voicekey_` ID，入库长期复用。
- **预置音色性别**：`PREBUILT_VOICES` 为 (名称, 语气, 性别) 三元组（女声 14 / 男声 16，源自 Google 官方音色表），音色选择器支持「全部 / 男声 / 女声」筛选与 ♂/♀ 徽标（性别为音色固有属性，不可经 style 修改）。
- **扩展音色库**：`list_voice_library()` 直连 `GET /v1beta/voices`（性别 / 语言 / 音高 / 口音 / 关键词 / 分页原生筛选），`/voice-library` 后端代理（API Key 仅后端解析、不下发前端），`VoiceLibraryDialog` 浏览弹窗。
- **按需试听**：因列表接口不返回 `sample_audio`，新增 `POST /preview` 同步端点，复用 `generate_tts` 合成短示例并内联返回 base64 WAV，不计费 / 不建任务 / 不落库 / 不注册资产。
- **中英多语言**：`VOICE_TONES_ZH` + `localizeVoiceTone` 本地化语气标签（音色名不翻译）。

#### 多语音生成历史 + 语气风格选择器 + 交互式内联音效标签

- **生成历史列表**：`TTSNode/HistorySidebar` 在节点卡片左侧渲染同一节点多次生成的历史音频，布局与音频节点侧栏对齐；点击历史即应用到当前节点，拖出画布克隆为新节点（携带配置预填面板）。
- **语气风格下拉选择器**：`StyleSelector` 将自由输入框改为下拉，提供 20 种预设风格（耳语 / 播客主持 / 温暖旁白 / 上气不接下气 等，源自官方 Prompting guide），中英多语言标签、提交值统一为英文描述；单说话人与双说话人每个角色均可选。
- **交互式内联音效标签**：`TtsTextEditor`（contentEditable 芯片）替换纯文本框——`<laugh>` `<sigh>` `<short pause>` 等 9 种官方人声标签渲染为可交互芯片：配置面板点击即插入到光标处、芯片可在文本内拖拽左右换位、点 × 删除；序列化结果即 Gemini 要求的 verbatim transcript + 标签，提交链路零改动。

### 📌 升级说明

1. **需执行数据库迁移**：`alembic upgrade head`（新增 `tts_tasks`、`replicated_voices` 两表）；全新空库仍走 `create_all` + `stamp` 快通道。
2. 已存在实例需在管理后台为 Gemini 供应商添加 TTS 模型 `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts` 并设 `model_metadata.model_type = "tts"`；新实例运行 `seed_db.py` 自动预置。
3. Agent 调用 TTS 需在智能体技能中勾选「TTS 语音合成」（`tts_tools`）。
4. 计费：在管理后台定价表按模型配置 `tts_generation` 维度（按次）。
5. 音色复刻 / 扩展音色库 / 试听均会消耗开发者自己的 Gemini API 配额（试听不扣平台积分，但仍调上游）。
6. 语气风格须搭配具体音色：当选择「自动音色」+ 非默认风格时，后端自动回退到默认音色 `Kore` 承载该风格；如需精确掌控音色，请显式选择一个音色。
7. **后端 Python 改动需重启服务生效。**

### 📁 主要变更文件

**后端**

```
backend/config.py                                        版本号 0.1.4（单一来源）
backend/main.py                                          注册 tts 路由
backend/models.py                                        TTSTask、ReplicatedVoice 表
backend/schemas.py                                       TTS 请求/响应 schema
backend/services/tts_providers/{base,gemini_tts}.py      新增：适配器、复刻、扩展音色库、试听
backend/services/tts_generation.py                       新增：工厂分派 + 异步执行编排
backend/services/billing.py                              tts_generation 计费维度
backend/services/chat_generation.py                      tts_task_created SSE
backend/services/media_canvas_bridge.py                  tts 画布桥接
backend/services/tool_manager/providers/tts_gen.py       新增：generate_tts 工具
backend/services/tool_manager/context.py                 tts_tools skill-gate、任务收集器
backend/routers/tts.py                                   新增：11 个 TTS 端点
backend/migrations/versions/k8l9m0n1o2p3_*.py            新增：tts_tasks 表
backend/migrations/versions/l9m0n1o2p3q4_*.py            新增：replicated_voices 表
backend/scripts/seed_db.py                               预置 Gemini TTS 模型
backend/skills/builtin_skills/tts_tools/SKILL.md         新增：TTS 内置技能
backend/tasks_queue/{tasks,worker}.py                    TTS 后台任务
```

**管理端**

```
backend/admin/src/components/admin/tools/TtsGenConfigDialog.tsx    新增：TTS 工具配置
backend/admin/src/app/admin/tools/page.tsx                         接线 TTS 配置
backend/admin/src/app/admin/llm/schema.ts                          语音模型类型
backend/admin/src/app/admin/pricing/components/PricingForm.tsx     tts_generation 维度
backend/admin/src/components/admin/agents/AgentForm/Parameters.tsx  tts_generation 参数
backend/admin/src/types/index.ts                                   类型
backend/admin/src/i18n/locales/{zh-CN,en-US}.json                  文案
```

**前端**

```
frontend/src/components/canvas/TTSNode.tsx                 新增：TTS 画布节点
frontend/src/components/canvas/TTSNode/HistorySidebar.tsx  新增：生成历史侧栏
frontend/src/components/canvas/TtsGeneratePanel.tsx        新增：生成面板
frontend/src/components/canvas/TtsGeneratePanel/           新增：Model/Voice/Style 选择器、
                                                           TtsTextEditor、复刻/音色库弹窗、配置面板
frontend/src/hooks/useTtsGeneration.ts                     新增：生成/音色/模型 hooks
frontend/src/components/ai-assistant/TtsTaskCard.tsx       新增：AI 助手 TTS 任务卡
frontend/src/store/useCanvasStore.ts                       TtsNodeData、tts 占位
frontend/src/lib/canvas/edgePayload.ts                     text→tts 注入、tts→video 音频
frontend/src/app/globals.css                               内联标签芯片样式
frontend/src/components/SettingsDialog.tsx                 更新日志代码块/媒体渲染收尾
frontend/src/components/canvas/{Sidebar,QuickAddMenu,NodePickerDropdown}.tsx   注册 tts 节点
frontend/src/i18n/locales/{zh-CN,en-US}.json               TTS 全量文案
（另含 theater page、ChatMessage、NodePreviewCard、useSSEHandler、nodeAttachmentUtils、
  useVideoPanelReferences、useQuickAddMenu、useAIAssistantStore 等 tts 接线）
```

**文档**

```
CHANGELOG.md            本文件
```

---

## [v0.1.3] - 2026-08-27

**主题：阿里百炼 Wan3.0 全能参考视频模型接入 + 管理端地域 Endpoint 强约束**

上一版本：`v0.1.2`。本版本无数据库迁移，无新增第三方依赖。

### ✨ 新增

#### 阿里百炼 Wan3.0 视频生成模型（All-in-One）

在既有 DashScope 供应商框架上接入万相 3.0 系列（`wan3.0-video-prime` 高速版 / `wan3.0-video` 标准版），全能参考模型，五种生成场景：

- **文生视频**：纯提示词生成，`ratio` 支持 `adaptive` 自适应构图。
- **图生视频**：首帧、尾帧、首尾帧组合；双帧输入时宽高比自动按素材推导。
- **参考生视频**：参考图 ≤ 10、参考视频 ≤ 5（总时长 ≤ 15 秒）、参考音频 ≤ 5（总时长 ≤ 15 秒），另支持文件参考（≤ 1）与网页链接参考（≤ 1），与首尾帧互斥。
- **视频编辑**：基于已有视频按提示词重绘 / 风格迁移。
- **视频延长**：从原视频结尾自然续写，时长自动设为 `-1` 智能模式、宽高比强制 `adaptive`。

关键能力：

- **参数体系**：分辨率 480P / 720P / 1080P；时长 2–30 秒整数与 `-1` 智能时长（有视频输入时输入+输出总长 ≤ 30 秒）；宽高比 `adaptive` + 16:9 / 4:3 / 1:1 / 3:4 / 9:16；`audio`（默认 true）、`seed`、`watermark`。
- **提示词智能改写**：能力开关 `supports_prompt_optimizer` 映射 API 参数 `prompt_extend`（默认开启，短提示词提升明显但增加耗时）。
- **地域限制强校验**：Wan3.0 要求模型、Endpoint URL、API Key 同地域。提交前校验 `base_url` 必须为 `https://{业务空间ID}.{地域}.maas.aliyuncs.com` 五地域格式（北京 / 新加坡 / 东京 / 法兰克福 / 弗吉尼亚），不符时快速失败并返回中文配置指引，避免无效上游请求。
- **异步处理**：复用 DashScope 既有的创建任务（`X-DashScope-Async: enable`）→ arq 后台轮询管道，响应解析无需改动。
- **本地媒体适配**：本地文件经 `_ensure_public_url` OSS 上传策略转公网 URL（dashscope 继续走 `base64` 旁路），网页链接透传不规范化。
- **默认供应商注册**：`seed_db.py` 新增阿里百炼供应商（`model_metadata` 含 `model_type=video` 展示名），并补齐种子脚本对 `model_metadata` 字段的持久化；新实例开箱即用。
- **数据管道贯通**：`VideoConfig.duration` 范围放宽至 `-1 ~ 30`；`VideoGenerateRequest` / `VideoContext` 新增 `reference_files` / `reference_links` 字段，路由层透传到适配器。
- 前端表单保持能力驱动：`model_capabilities` 声明后时长滑块（2–30 秒 + Auto）、分辨率、宽高比、提示词优化开关自动适配，无需逐模型改 UI。

#### 管理端：DashScope 基础 URL 必填与引导文案

- AI 供应商向导选择 DashScope 时，基础 URL 由选填改为**必填**（标签加红色星号 + 提交校验拦截）。
- 输入框引导文案：（如北京 `https://{业务空间ID}.cn-beijing.maas.aliyuncs.com`）；描述文案同步提示同地域要求，中英双语。

### 🎬 效果演示（Wan3.0 生成样例）

<video src="https://github.com/user-attachments/assets/9949381b-383c-481d-ad77-4bee4aed5b47" controls></video>

<video src="https://github.com/user-attachments/assets/c33da244-bb9b-4ffa-9e9d-e111813de5cf" controls></video>

<video src="https://github.com/user-attachments/assets/acb0a93a-607f-4025-8989-168e8adba3fc" controls></video>


### 🔧 改进

- **设置对话框「更新日志」渲染重做**：手写逐行解析器替换为 `react-markdown` + `remark-gfm`，完整支持标题 / 表格 / 代码块（语言角标 + 行内/块级区分）/ 引用 / 链接 / 图片；release body 内联的原始 HTML `<img>` / `<video>` 标签按段提取并渲染为真实媒体；发布列表改为固定高度独立滚动区 + 底部渐隐提示，历史版本可在对话框内连续浏览；版本卡片样式统一（取消首张蓝色高亮）。
- **模型前缀推断表**：`wan3.0` / `wanx` 前缀归入 dashscope 供应商，避免供应商匹配歧义。
- **能力声明扩展**：`VideoModelCapabilities` 新增 `supports_reference_files` / `supports_reference_links` 可选键。

### 🐛 修复

- **视频封面截取失败**：`_generate_video_poster` 写临时文件以 `.tmp` 结尾，ffmpeg 无法从扩展名推断输出容器格式（`Unable to choose an output format`，rc=-22），显式追加 `-f image2` 指定格式；已用真实视频验证，存量视频无需重传，下次请求列表时懒加载自动生成。
- **种子脚本丢失模型元数据**：`seed_db.py` 创建 `LLMProvider` 时未传入 `model_metadata`，导致用户端视频供应商列表不展示新模型；本次补齐。

### ✅ 测试与验证

- Wan3.0 适配器冒烟测试 10 项场景全部通过：能力声明、供应商路由、地域校验、文生/图生/首尾帧/参考/链接/延长各场景 payload 组装、参数钳制、HappyHorse 兼容回归、种子配置。
- 后端模块导入链验证通过；`frontend` 与 `backend/admin` `tsc --noEmit` 均无新增错误。
- ffmpeg 修复经真实视频文件验证（成功生成 480px 封面）。

### 📌 升级说明

1. **无需执行数据库迁移**。
2. 新实例运行 `seed_db.py` 自动注册阿里百炼供应商；已存在实例需在管理后台手动添加 DashScope 供应商，模型填 `wan3.0-video-prime` / `wan3.0-video`，并设置 `model_metadata.model_type = "video"`。
3. **必须**为该供应商配置与模型、API Key **同地域**的 `base_url`（如北京 `https://{业务空间ID}.cn-beijing.maas.aliyuncs.com`）；Wan3.0 与 HappyHorse 系列如并存，建议使用独立的供应商条目分别配置。
4. Wan3.0 计费沿用既有视频计费维度（按输出秒），在管理后台定价表按模型配置即可。
5. 前端「提示词优化」开关对 Wan3.0 生效，对应 `prompt_extend` 参数（API 默认开启）。

### 📁 主要变更文件

**后端**

```
backend/config.py                                       版本号 0.1.3（单一来源）
backend/schemas.py                                      duration -1~30、reference_files/links 字段
backend/routers/videos.py                               参考文件/链接透传
backend/services/video_generation.py                    wan3.0/wanx 前缀 → dashscope 映射
backend/services/media_utils.py                         ffmpeg -f image2 封面修复
backend/services/video_providers/model_capabilities.py  Wan3.0 双模型能力、新增能力键
backend/services/video_providers/dashscope_provider.py  Wan3.0 payload 组装、地域校验、参数映射
backend/services/video_providers/base.py                VideoContext 参考文件/链接字段
backend/scripts/seed_db.py                              阿里百炼供应商、model_metadata 持久化
```

**管理端**

```
backend/admin/src/app/admin/llm/schema.ts                              DashScope base_url 必填校验
backend/admin/src/app/admin/llm/components/wizard/step-connection.tsx  必填标记与专属引导文案
backend/admin/src/i18n/locales/{zh-CN,en-US}.json                      新增文案键
```

**前端**

```
frontend/src/hooks/useVideoGeneration.ts       能力类型与创建参数新增文件/链接字段
frontend/src/components/SettingsDialog.tsx     更新日志 Markdown 渲染重做（含媒体段提取、滚动区）
```

**文档**

```
CHANGELOG.md                 本文件
```

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
