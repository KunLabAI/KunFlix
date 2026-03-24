# 聊天API

<cite>
**本文引用的文件**
- [backend/main.py](file://backend/main.py)
- [backend/routers/chats.py](file://backend/routers/chats.py)
- [backend/models.py](file://backend/models.py)
- [backend/schemas.py](file://backend/schemas.py)
- [backend/database.py](file://backend/database.py)
- [backend/config.py](file://backend/config.py)
- [backend/services.py](file://backend/services.py)
- [frontend/src/hooks/useSocket.ts](file://frontend/src/hooks/useSocket.ts)
- [backend/admin/src/components/admin/agents/ChatInterface.tsx](file://backend/admin/src/components/admin/agents/ChatInterface.tsx)
- [backend/requirements.txt](file://backend/requirements.txt)
- [backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py](file://backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py)
- [frontend/src/components/canvas/AIAssistantPanel.tsx](file://frontend/src/components/canvas/AIAssistantPanel.tsx)
</cite>

## 更新摘要
**变更内容**
- 新增剧院ID过滤参数支持，增强API层对剧院系统的集成
- 更新聊天会话管理功能，支持按剧院ID筛选会话
- 增强前端AI助手面板的剧院上下文支持
- 添加剧院ID字段到聊天会话模型和数据库迁移

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考量](#性能考量)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
本文件为"聊天API"的完整技术文档，覆盖实时聊天与对话管理相关接口，包括聊天会话创建、消息发送、历史记录查询、WebSocket连接、消息格式与事件处理机制、消息类型分类、内容验证与安全检查、以及与聊天机器人的集成指导与最佳实践。文档同时提供具体API调用示例路径，涵盖文本消息与流式响应的处理流程。

**更新** 本次更新增强了剧院系统支持，新增剧院ID过滤参数，允许按剧院ID筛选聊天会话，为剧院场景下的聊天管理提供更好的支持。

## 项目结构
后端采用FastAPI + SQLAlchemy异步ORM + Alembic迁移，数据库模型包含玩家、故事章节、资产、LLM提供商、聊天会话与消息等；前端包含React Hook用于WebSocket连接，以及Admin侧的聊天界面组件用于演示API调用与流式接收。

```mermaid
graph TB
subgraph "后端"
A["FastAPI 应用<br/>backend/main.py"]
B["聊天路由<br/>backend/routers/chats.py"]
C["数据库模型<br/>backend/models.py"]
D["数据验证模型<br/>backend/schemas.py"]
E["数据库连接与会话<br/>backend/database.py"]
F["配置<br/>backend/config.py"]
G["业务服务<br/>backend/services.py"]
H["迁移文件<br/>backend/migrations/.../2733ee5c4fd0_add_theater_id_to_chat_sessions.py"]
end
subgraph "前端"
I["WebSocket Hook<br/>frontend/src/hooks/useSocket.ts"]
J["Admin 聊天界面<br/>backend/admin/.../ChatInterface.tsx"]
K["AI助手面板<br/>frontend/src/components/canvas/AIAssistantPanel.tsx"]
end
A --> B
B --> C
B --> D
B --> E
A --> F
G --> C
H --> C
I --> A
J --> A
K --> A
```

**图表来源**
- [backend/main.py:83-98](file://backend/main.py#L83-L98)
- [backend/routers/chats.py:16-20](file://backend/routers/chats.py#L16-L20)
- [backend/models.py:80-122](file://backend/models.py#L80-L122)
- [backend/schemas.py:75-102](file://backend/schemas.py#L75-L102)
- [backend/database.py:1-31](file://backend/database.py#L1-L31)
- [backend/config.py:7-34](file://backend/config.py#L7-L34)
- [frontend/src/hooks/useSocket.ts:1-43](file://frontend/src/hooks/useSocket.ts#L1-L43)
- [backend/admin/src/components/admin/agents/ChatInterface.tsx:1-123](file://backend/admin/src/components/admin/agents/ChatInterface.tsx#L1-L123)
- [backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py:21-28](file://backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py#L21-L28)
- [frontend/src/components/canvas/AIAssistantPanel.tsx:125-170](file://frontend/src/components/canvas/AIAssistantPanel.tsx#L125-L170)

**章节来源**
- [backend/main.py:83-98](file://backend/main.py#L83-L98)
- [backend/routers/chats.py:16-20](file://backend/routers/chats.py#L16-L20)
- [backend/models.py:80-122](file://backend/models.py#L80-L122)
- [backend/schemas.py:75-102](file://backend/schemas.py#L75-L102)
- [backend/database.py:1-31](file://backend/database.py#L1-L31)
- [backend/config.py:7-34](file://backend/config.py#L7-L34)
- [frontend/src/hooks/useSocket.ts:1-43](file://frontend/src/hooks/useSocket.ts#L1-L43)
- [backend/admin/src/components/admin/agents/ChatInterface.tsx:1-123](file://backend/admin/src/components/admin/agents/ChatInterface.tsx#L1-L123)
- [backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py:21-28](file://backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py#L21-L28)
- [frontend/src/components/canvas/AIAssistantPanel.tsx:125-170](file://frontend/src/components/canvas/AIAssistantPanel.tsx#L125-L170)

## 核心组件
- 聊天会话管理：创建、列出、查询、删除会话；查询会话内历史消息。**新增** 支持按剧院ID过滤会话。
- 消息发送与流式响应：保存用户消息，准备上下文，调用LLM提供商（OpenAI/Azure OpenAI、DashScope），流式返回助手回复，并保存助手消息。
- WebSocket实时聊天：提供/ws/{player_id}端点，用于实时消息推送与接收。
- 数据模型与验证：ChatSession、ChatMessage、Agent、LLMProvider等模型与Pydantic验证模型。**更新** ChatSession模型新增theater_id字段。
- 前端集成：React Hook负责WebSocket连接与消息收发；Admin界面演示REST API调用与流式读取；**新增** AI助手面板支持剧院上下文。

**章节来源**
- [backend/routers/chats.py:22-71](file://backend/routers/chats.py#L22-L71)
- [backend/routers/chats.py:72-258](file://backend/routers/chats.py#L72-L258)
- [backend/main.py:157-169](file://backend/main.py#L157-L169)
- [backend/models.py:172-183](file://backend/models.py#L172-L183)
- [backend/schemas.py:75-102](file://backend/schemas.py#L75-L102)
- [frontend/src/hooks/useSocket.ts:1-43](file://frontend/src/hooks/useSocket.ts#L1-L43)
- [backend/admin/src/components/admin/agents/ChatInterface.tsx:99-156](file://backend/admin/src/components/admin/agents/ChatInterface.tsx#L99-L156)
- [frontend/src/components/canvas/AIAssistantPanel.tsx:125-170](file://frontend/src/components/canvas/AIAssistantPanel.tsx#L125-L170)

## 架构总览
聊天API围绕"会话-消息"模型展开，消息发送流程通过REST接口触发，内部完成上下文拼接、LLM调用与流式返回，并在完成后持久化助手消息。WebSocket端点用于实时推送（当前示例中仅回显消息，未实现广播/房间机制）。**更新** 新增剧院ID过滤支持，增强剧院场景下的会话管理能力。

```mermaid
sequenceDiagram
participant FE as "前端/客户端"
participant API as "聊天路由<br/>/api/chats"
participant DB as "数据库<br/>SQLAlchemy"
participant LLM as "LLM提供商<br/>OpenAI/DashScope"
FE->>API : "POST /api/chats/{session_id}/messages"<br/>请求体 : {role : "user", content : "...", theater_id : "..." }
API->>DB : "保存用户消息"
API->>DB : "查询历史消息"
API->>LLM : "流式请求模型"
LLM-->>API : "增量内容块"
API-->>FE : "流式响应(text/plain)"
API->>DB : "保存助手消息"
API-->>FE : "完成"
```

**图表来源**
- [backend/routers/chats.py:72-258](file://backend/routers/chats.py#L72-L258)
- [backend/models.py:90-98](file://backend/models.py#L90-L98)
- [backend/database.py:28-31](file://backend/database.py#L28-L31)

## 详细组件分析

### 聊天会话管理
- 创建会话
  - 方法与路径：POST /api/chats/
  - 请求体：ChatSessionCreate（title, agent_id, **theater_id**）
  - 响应体：ChatSessionResponse（含id、created_at、updated_at、**theater_id**）
  - 行为：校验Agent存在性，创建会话并返回
- 列出会话
  - 方法与路径：GET /api/chats/
  - 查询参数：agent_id（可选）、**theater_id（可选）**、skip、limit
  - 响应体：会话列表（按updated_at倒序）
  - **更新** 新增theater_id参数，支持按剧院ID过滤会话
- 查询会话
  - 方法与路径：GET /api/chats/{session_id}
  - 响应体：单个会话
- 删除会话
  - 方法与路径：DELETE /api/chats/{session_id}
  - 行为：级联删除消息（当前实现中手动删除消息再删除会话）

**章节来源**
- [backend/routers/chats.py:22-37](file://backend/routers/chats.py#L22-L37)
- [backend/routers/chats.py:39-53](file://backend/routers/chats.py#L39-L53)
- [backend/routers/chats.py:55-61](file://backend/routers/chats.py#L55-L61)
- [backend/routers/chats.py:260-274](file://backend/routers/chats.py#L260-L274)
- [backend/schemas.py:75-87](file://backend/schemas.py#L75-L87)

### 历史记录查询
- 方法与路径：GET /api/chats/{session_id}/messages
- 排序：按created_at升序
- 响应体：消息列表（包含id、session_id、role、content、created_at）

**章节来源**
- [backend/routers/chats.py:63-70](file://backend/routers/chats.py#L63-L70)
- [backend/schemas.py:96-101](file://backend/schemas.py#L96-L101)

### 消息发送与流式响应
- 方法与路径：POST /api/chats/{session_id}/messages
- 请求体：ChatMessageCreate（role, content, **edit_last_image**, **theater_id**）
- 流程要点：
  - 校验会话与Agent存在性
  - 保存用户消息
  - 准备历史消息作为上下文
  - 选择LLM提供商（OpenAI/Azure OpenAI、DashScope），流式生成
  - 将生成内容以text/plain流式返回
  - 在完成后保存助手消息并更新会话时间戳
- 支持的提供商与模型：
  - OpenAI/Azure OpenAI：通过AsyncOpenAI/AsyncAzureOpenAI调用
  - DashScope：通过dashscope.Generation.call调用
- 错误处理：捕获异常并返回错误信息；记录日志

```mermaid
flowchart TD
Start(["进入 send_message"]) --> CheckSession["校验会话存在"]
CheckSession --> |不存在| Err404["返回 404"]
CheckSession --> |存在| CheckAgent["校验Agent存在"]
CheckAgent --> |不存在| Err404
CheckAgent --> SaveUser["保存用户消息"]
SaveUser --> LoadHist["加载历史消息"]
LoadHist --> PickProvider["选择LLM提供商"]
PickProvider --> StreamGen["流式生成响应"]
StreamGen --> YieldDelta["逐块返回增量内容"]
YieldDelta --> SaveAssist["保存助手消息并更新会话时间"]
SaveAssist --> Done(["结束"])
```

**图表来源**
- [backend/routers/chats.py:72-258](file://backend/routers/chats.py#L72-L258)

**章节来源**
- [backend/routers/chats.py:72-258](file://backend/routers/chats.py#L72-L258)

### WebSocket连接与事件处理
- 端点：/ws/{player_id}
- 行为：接受连接后循环读取文本消息并回显，最终关闭连接
- 前端Hook：useSocket封装了WebSocket连接、消息收发与连接状态

```mermaid
sequenceDiagram
participant FE as "前端 Hook<br/>useSocket.ts"
participant WS as "WebSocket 端点<br/>/ws/{player_id}"
FE->>WS : "建立连接"
WS-->>FE : "onopen"
FE->>WS : "发送消息"
WS-->>FE : "回显消息"
FE->>WS : "关闭"
WS-->>FE : "onclose"
```

**图表来源**
- [frontend/src/hooks/useSocket.ts:8-33](file://frontend/src/hooks/useSocket.ts#L8-L33)
- [backend/main.py:157-169](file://backend/main.py#L157-L169)

**章节来源**
- [backend/main.py:157-169](file://backend/main.py#L157-L169)
- [frontend/src/hooks/useSocket.ts:1-43](file://frontend/src/hooks/useSocket.ts#L1-L43)

### 数据模型与消息类型
- ChatSession：会话基本信息（标题、关联Agent、**剧院ID**、时间戳）
- ChatMessage：消息实体（角色、内容、所属会话、时间戳）
- Agent：智能体配置（关联LLM提供商、模型、温度、上下文窗口、系统提示等）
- LLMProvider：LLM提供商配置（名称、类型、密钥、基础URL、可用模型、标签、启用状态等）

```mermaid
classDiagram
class ChatSession {
+int id
+string title
+string agent_id
+string theater_id
+datetime created_at
+datetime updated_at
}
class ChatMessage {
+int id
+int session_id
+string role
+text content
+datetime created_at
}
class Agent {
+string id
+string name
+string description
+string provider_id
+string model
+float temperature
+int context_window
+text system_prompt
+json tools
+bool thinking_mode
+datetime created_at
+datetime updated_at
}
class LLMProvider {
+string id
+string name
+string provider_type
+string api_key
+string base_url
+json models
+json tags
+bool is_active
+bool is_default
+json config_json
+datetime created_at
+datetime updated_at
}
ChatMessage --> ChatSession : "属于"
ChatSession --> Agent : "关联"
Agent --> LLMProvider : "使用"
```

**图表来源**
- [backend/models.py:80-122](file://backend/models.py#L80-L122)

**章节来源**
- [backend/models.py:80-122](file://backend/models.py#L80-L122)

### 消息类型与内容格式
- 角色（role）：user、assistant、system
- 内容（content）：字符串形式的文本消息
- 历史消息按created_at升序排列，作为上下文传入LLM
- 流式响应媒体类型：text/plain，逐块返回增量内容
- **新增** theater_id：剧院ID，用于剧院上下文识别和过滤

**章节来源**
- [backend/routers/chats.py:118-127](file://backend/routers/chats.py#L118-L127)
- [backend/routers/chats.py:169-173](file://backend/routers/chats.py#L169-L173)
- [backend/schemas.py:89-92](file://backend/schemas.py#L89-L92)

### 安全与验证
- 输入验证：Pydantic模型用于请求体与响应体的数据校验
- 资源存在性校验：会话、Agent、提供商均进行存在性检查
- 提供商可用性：检查LLMProvider.is_active
- 错误处理：HTTP异常与日志记录，保证接口健壮性
- 当前未发现内置敏感词过滤或内容审核逻辑，建议在上游或下游增加内容安全策略

**章节来源**
- [backend/schemas.py:43-73](file://backend/schemas.py#L43-L73)
- [backend/routers/chats.py:24-28](file://backend/routers/chats.py#L24-L28)
- [backend/routers/chats.py:109-110](file://backend/routers/chats.py#L109-L110)
- [backend/routers/chats.py:211-215](file://backend/routers/chats.py#L211-L215)

### 聊天机器人集成与最佳实践
- 选择合适的LLM提供商与模型，配置temperature与context_window
- 使用system_prompt引导模型行为，避免歧义
- 对外暴露统一的会话与消息接口，便于前端与Admin集成
- 流式响应提升用户体验，注意前端Reader解析与UI渲染
- **新增** 在剧院场景中，合理使用theater_id参数进行会话过滤和管理
- 建议在生产环境增加：
  - 敏感词过滤与内容审核
  - 速率限制与配额控制
  - 会话超时与清理策略
  - 日志审计与错误追踪

**章节来源**
- [backend/routers/chats.py:145-209](file://backend/routers/chats.py#L145-L209)
- [backend/admin/src/components/admin/agents/ChatInterface.tsx:99-156](file://backend/admin/src/components/admin/agents/ChatInterface.tsx#L99-L156)

### 剧院系统集成
- **新增** 剧院ID过滤支持：通过theater_id查询参数过滤聊天会话
- **新增** 剧院上下文支持：消息发送时可携带theater_id参数
- **新增** 前端AI助手面板：自动检测剧院ID并创建/使用相应的聊天会话
- **新增** 数据库迁移：为chat_sessions表添加theater_id字段

**章节来源**
- [backend/routers/chats.py:110-130](file://backend/routers/chats.py#L110-L130)
- [backend/routers/chats.py:189-238](file://backend/routers/chats.py#L189-L238)
- [frontend/src/components/canvas/AIAssistantPanel.tsx:125-170](file://frontend/src/components/canvas/AIAssistantPanel.tsx#L125-L170)
- [backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py:21-28](file://backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py#L21-L28)

## 依赖关系分析

```mermaid
graph LR
R["聊天路由<br/>routers/chats.py"] --> M["模型<br/>models.py"]
R --> S["Schema<br/>schemas.py"]
R --> DB["数据库会话<br/>database.py:get_db"]
APP["FastAPI 应用<br/>main.py"] --> R
APP --> CFG["配置<br/>config.py"]
FE1["useSocket Hook<br/>frontend/src/hooks/useSocket.ts"] --> APP
FE2["Admin ChatInterface<br/>.../ChatInterface.tsx"] --> APP
FE3["AIAssistantPanel<br/>frontend/src/components/canvas/AIAssistantPanel.tsx"] --> APP
MIG["迁移文件<br/>2733ee5c4fd0_add_theater_id_to_chat_sessions.py"] --> M
```

**图表来源**
- [backend/routers/chats.py:10-12](file://backend/routers/chats.py#L10-L12)
- [backend/models.py:80-122](file://backend/models.py#L80-L122)
- [backend/schemas.py:75-102](file://backend/schemas.py#L75-L102)
- [backend/database.py:28-31](file://backend/database.py#L28-L31)
- [backend/main.py:83-98](file://backend/main.py#L83-L98)
- [backend/config.py:7-34](file://backend/config.py#L7-L34)
- [frontend/src/hooks/useSocket.ts:1-43](file://frontend/src/hooks/useSocket.ts#L1-L43)
- [backend/admin/src/components/admin/agents/ChatInterface.tsx:1-123](file://backend/admin/src/components/admin/agents/ChatInterface.tsx#L1-L123)
- [frontend/src/components/canvas/AIAssistantPanel.tsx:125-170](file://frontend/src/components/canvas/AIAssistantPanel.tsx#L125-L170)
- [backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py:21-28](file://backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py#L21-L28)

**章节来源**
- [backend/routers/chats.py:10-12](file://backend/routers/chats.py#L10-L12)
- [backend/database.py:28-31](file://backend/database.py#L28-L31)
- [backend/main.py:83-98](file://backend/main.py#L83-L98)
- [frontend/src/hooks/useSocket.ts:1-43](file://frontend/src/hooks/useSocket.ts#L1-L43)
- [backend/admin/src/components/admin/agents/ChatInterface.tsx:1-123](file://backend/admin/src/components/admin/agents/ChatInterface.tsx#L1-L123)
- [frontend/src/components/canvas/AIAssistantPanel.tsx:125-170](file://frontend/src/components/canvas/AIAssistantPanel.tsx#L125-L170)

## 性能考量
- 异步I/O：使用SQLAlchemy异步引擎与FastAPI异步路由，降低阻塞
- 连接池：数据库连接池配置，减少连接开销
- 流式响应：使用StreamingResponse减少等待时间，提升交互体验
- 上下文长度控制：通过context_window与temperature控制生成成本与质量
- 日志级别：精简SQLAlchemy与Uvicorn访问日志，降低IO开销
- **新增** 剧院ID索引：数据库为theater_id字段建立了索引，提升过滤性能

**章节来源**
- [backend/database.py:8-23](file://backend/database.py#L8-L23)
- [backend/main.py:14-28](file://backend/main.py#L14-L28)
- [backend/routers/chats.py:145-209](file://backend/routers/chats.py#L145-L209)
- [backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py:23-26](file://backend/migrations/versions/2733ee5c4fd0_add_theater_id_to_chat_sessions.py#L23-L26)

## 故障排查指南
- 会话不存在：检查session_id是否正确，或先创建会话
- Agent不可用：确认Agent关联的LLMProvider.is_active为True
- LLM调用失败：检查提供商类型、API Key、基础URL与模型名称
- WebSocket无法连接：确认端口与CORS配置，浏览器控制台查看网络错误
- 流式响应中断：检查后端日志与提供商限流/配额
- **新增** 剧院ID过滤无效：确认theater_id参数格式正确，数据库中存在对应记录
- **新增** 剧院上下文问题：检查前端传递的theater_id是否与后端期望一致

**章节来源**
- [backend/routers/chats.py:81-87](file://backend/routers/chats.py#L81-L87)
- [backend/routers/chats.py:109-110](file://backend/routers/chats.py#L109-L110)
- [backend/main.py:85-91](file://backend/main.py#L85-L91)
- [frontend/src/hooks/useSocket.ts:8-33](file://frontend/src/hooks/useSocket.ts#L8-L33)

## 结论
本聊天API提供了完整的会话与消息管理能力，支持多提供商流式响应与WebSocket实时交互。通过清晰的模型与验证层、异步数据库与流式响应机制，能够满足动态叙事与多模态生成场景下的实时交互需求。

**更新** 新增的剧院ID过滤功能显著增强了API对剧院系统的支持，使得按剧院维度管理聊天会话成为可能。结合前端AI助手面板的剧院上下文支持，为复杂的剧院场景提供了完善的聊天解决方案。

建议在生产环境中补充内容安全与限流策略，以保障稳定性与合规性。

## 附录

### API清单与示例路径
- 创建会话
  - 方法：POST
  - 路径：/api/chats/
  - 请求体：ChatSessionCreate（**新增** theater_id）
  - 示例路径：[创建会话示例:71-83](file://backend/admin/src/components/admin/agents/ChatInterface.tsx#L71-L83)
- 列出会话
  - 方法：GET
  - 路径：/api/chats/
  - 查询参数：agent_id、**theater_id（新增）**、skip、limit
  - 示例路径：[列会话示例:44-47](file://backend/admin/src/components/admin/agents/ChatInterface.tsx#L44-L47)
- 查询会话
  - 方法：GET
  - 路径：/api/chats/{session_id}
- 删除会话
  - 方法：DELETE
  - 路径：/api/chats/{session_id}
- 查询历史消息
  - 方法：GET
  - 路径：/api/chats/{session_id}/messages
- 发送消息并流式获取响应
  - 方法：POST
  - 路径：/api/chats/{session_id}/messages
  - 请求体：ChatMessageCreate（**新增** edit_last_image, **新增** theater_id）
  - 响应：text/plain 流式
  - 示例路径：[发送消息示例:99-156](file://backend/admin/src/components/admin/agents/ChatInterface.tsx#L99-L156)
- WebSocket实时聊天
  - 方法：WebSocket
  - 路径：/ws/{player_id}
  - 示例路径：[WebSocket Hook:8-33](file://frontend/src/hooks/useSocket.ts#L8-L33)

### 剧院系统集成示例
- **新增** 前端AI助手面板集成
  - 自动检测剧院ID并创建/使用相应会话
  - 支持剧院上下文的聊天会话管理
  - 示例路径：[AI助手面板:125-170](file://frontend/src/components/canvas/AIAssistantPanel.tsx#L125-L170)

**章节来源**
- [backend/routers/chats.py:22-70](file://backend/routers/chats.py#L22-L70)
- [backend/routers/chats.py:72-258](file://backend/routers/chats.py#L72-L258)
- [backend/admin/src/components/admin/agents/ChatInterface.tsx:44-156](file://backend/admin/src/components/admin/agents/ChatInterface.tsx#L44-L156)
- [frontend/src/hooks/useSocket.ts:8-33](file://frontend/src/hooks/useSocket.ts#L8-L33)
- [frontend/src/components/canvas/AIAssistantPanel.tsx:125-170](file://frontend/src/components/canvas/AIAssistantPanel.tsx#L125-L170)