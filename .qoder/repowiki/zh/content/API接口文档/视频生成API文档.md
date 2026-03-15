# 视频生成API文档

<cite>
**本文档中引用的文件**
- [videos.py](file://backend/routers/videos.py)
- [video_generation.py](file://backend/services/video_generation.py)
- [models.py](file://backend/models.py)
- [schemas.py](file://backend/schemas.py)
- [billing.py](file://backend/services/billing.py)
- [media_utils.py](file://backend/services/media_utils.py)
- [auth.py](file://backend/auth.py)
- [database.py](file://backend/database.py)
- [config.py](file://backend/config.py)
- [page.tsx](file://backend/admin/src/app/admin/videos/page.tsx)
- [useVideoTasks.ts](file://backend/admin/src/hooks/useVideoTasks.ts)
- [VideoPreviewModal.tsx](file://backend/admin/src/app/admin/videos/VideoPreviewModal.tsx)
- [new_page.tsx](file://backend/admin/src/app/admin/videos/new/page.tsx)
</cite>

## 更新摘要
**变更内容**
- 新增provider/model架构替代agent架构，包括API路由重构和计费系统更新
- 新增视频任务删除功能，支持已完成和失败任务的清理
- 后台管理界面增强，包括实时状态轮询和任务删除功能
- 计费系统更新，支持基于provider.model_costs的差异化计费

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [API规范](#api规范)
7. [后台管理界面](#后台管理界面)
8. [依赖分析](#依赖分析)
9. [性能考虑](#性能考虑)
10. [故障排除指南](#故障排除指南)
11. [结论](#结论)

## 简介

视频生成API是Infinite Narrative Game项目的核心功能模块之一，提供基于xAI平台的视频生成服务。该API支持多种视频生成模式，包括文本到视频、图片到视频和视频编辑，并集成了完整的计费系统、任务管理和状态轮询机制。

**更新** 本API现已采用新的provider/model架构替代原有的agent架构，提供更灵活的供应商管理和模型选择功能。同时新增了视频任务删除功能，支持管理员清理已完成和失败的任务记录。

本API文档详细介绍了视频生成服务的架构设计、接口规范、数据模型和实现细节，帮助开发者快速理解和集成视频生成功能。

## 项目结构

视频生成API位于后端项目的`backend`目录中，主要包含以下核心组件：

```mermaid
graph TB
subgraph "后端架构"
A[FastAPI 应用] --> B[视频路由]
A --> C[认证模块]
A --> D[数据库层]
B --> E[视频生成服务]
B --> F[计费服务]
B --> G[媒体工具]
E --> H[xAI API 集成]
F --> I[积分计算]
G --> J[文件存储]
D --> K[数据模型]
D --> L[会话管理]
D --> M[LLM供应商管理]
end
subgraph "后台管理界面"
N[视频管理页面] --> O[任务列表]
N --> P[视频预览]
N --> Q[创建任务]
O --> R[状态轮询]
P --> S[实时播放]
Q --> T[配置表单]
Q --> U[供应商选择]
Q --> V[模型选择]
N --> W[任务删除]
W --> X[终态检查]
W --> Y[文件清理]
end
subgraph "前端集成"
Z[聊天界面] --> AA[视频任务提交]
AA --> AB[状态轮询]
AB --> AC[结果展示]
R --> AD[后端轮询]
AD --> AE[数据库更新]
AE --> AB
end
```

**图表来源**
- [main.py](file://backend/main.py#L84-L105)
- [videos.py](file://backend/routers/videos.py#L20-L20)
- [page.tsx](file://backend/admin/src/app/admin/videos/page.tsx#L55-L209)
- [useVideoTasks.ts](file://backend/admin/src/hooks/useVideoTasks.ts#L17-L66)

**章节来源**
- [main.py](file://backend/main.py#L1-L127)
- [config.py](file://backend/config.py#L1-L40)

## 核心组件

视频生成API由多个相互协作的组件构成，每个组件都有明确的职责分工：

### 主要组件概述

1. **FastAPI 应用层** - 提供Web服务和路由管理
2. **视频路由模块** - 处理视频相关的HTTP请求，支持分页查询和过滤
3. **视频生成服务** - 封装xAI API调用和任务管理
4. **计费服务** - 实现积分扣费和余额管理，支持基于provider/model的成本计算
5. **媒体工具** - 处理文件下载和存储
6. **认证模块** - 管理用户身份验证和授权，支持管理员访问
7. **数据库层** - 提供数据持久化和查询，支持视频任务追踪
8. **LLM供应商管理** - 管理供应商配置和模型成本
9. **后台管理界面** - 提供可视化任务管理、状态监控和视频预览

**更新** 新增LLM供应商管理组件，支持多供应商和多模型的灵活配置。

**章节来源**
- [videos.py](file://backend/routers/videos.py#L1-L317)
- [video_generation.py](file://backend/services/video_generation.py#L1-L203)
- [page.tsx](file://backend/admin/src/app/admin/videos/page.tsx#L1-L268)

## 架构概览

视频生成API采用分层架构设计，实现了清晰的关注点分离，并集成了实时状态轮询机制：

```mermaid
sequenceDiagram
participant Client as 客户端
participant AdminUI as 后台界面
participant API as FastAPI路由
participant Service as 视频服务
participant Billing as 计费服务
participant Media as 媒体工具
participant Provider as LLM供应商
participant xAI as xAI API
Client->>API : POST /api/videos/
API->>Provider : 获取供应商配置
Provider-->>API : 返回API密钥和模型成本
API->>Service : submit_video_task(ctx)
Service->>xAI : 提交生成请求
xAI-->>Service : 返回任务ID
Service-->>API : VideoResult
API->>Billing : calculate_video_credit_cost
API->>Media : 保存视频文件
API-->>Client : VideoTaskResponse
AdminUI->>API : GET /api/videos/?page&page_size
API-->>AdminUI : VideoTaskListResponse
AdminUI->>API : GET /api/videos/{task_id}/status
API->>Service : poll_video_task()
Service->>xAI : 查询状态
xAI-->>Service : 状态信息
Service-->>API : VideoResult
API->>Billing : 扣除积分
API->>Media : 下载视频
API-->>AdminUI : 更新状态
AdminUI->>API : DELETE /api/videos/{task_id}
API->>Media : 删除本地文件
API->>DB : 删除任务记录
API-->>AdminUI : 删除确认
```

**图表来源**
- [videos.py](file://backend/routers/videos.py#L23-L317)
- [video_generation.py](file://backend/services/video_generation.py#L134-L203)
- [useVideoTasks.ts](file://backend/admin/src/hooks/useVideoTasks.ts#L34-L48)

**更新** 新增供应商配置获取和任务删除流程，支持基于provider/model的成本计算。

## 详细组件分析

### 视频生成服务

视频生成服务是整个API的核心，负责与xAI平台进行交互并管理视频生成任务。

#### 核心数据结构

```mermaid
classDiagram
class VideoContext {
+string api_key
+string model
+string prompt
+string image_url
+int duration
+string quality
+string aspect_ratio
+string mode
+string video_mode
}
class VideoResult {
+string xai_task_id
+string status
+string video_url
+float duration_seconds
+string error
}
class VideoTask {
+string id
+string xai_task_id
+string session_id
+string provider_id
+string model
+string user_id
+string video_mode
+string prompt
+string image_url
+int duration
+string quality
+string aspect_ratio
+string status
+string result_video_url
+float credit_cost
+int input_image_count
+float output_duration_seconds
+DateTime created_at
+DateTime completed_at
}
VideoContext --> VideoResult : "生成"
VideoTask --> VideoResult : "存储状态"
```

**图表来源**
- [video_generation.py](file://backend/services/video_generation.py#L37-L59)
- [models.py](file://backend/models.py#L352-L382)

#### 视频模式注册表

系统支持三种视频生成模式，通过注册表模式实现灵活扩展：

| 模式 | 描述 | 请求参数 |
|------|------|----------|
| text_to_video | 文本生成视频 | prompt, duration, quality, aspect_ratio |
| image_to_video | 图片生成视频 | prompt, image_url, duration, quality, aspect_ratio |
| edit | 视频编辑 | prompt, image_url, duration, quality, aspect_ratio |

**章节来源**
- [video_generation.py](file://backend/services/video_generation.py#L62-L100)
- [schemas.py](file://backend/schemas.py#L550-L568)

### 计费系统

计费系统采用映射表驱动的设计，支持基于provider/model的成本计算：

```mermaid
flowchart TD
Start([开始计费]) --> GetTask["获取VideoTask和LLMProvider"]
GetTask --> GetRate["从provider.model_costs[model]获取费率"]
GetRate --> CalcInput["计算输入费用<br/>video_input_image_credit × input_image_count"]
CalcInput --> CalcOutput["计算输出费用<br/>video_output_rate × output_duration_seconds"]
CalcOutput --> CheckZero{"费用是否为0?"}
CheckZero --> |是| LogZero["记录零费用交易"]
CheckZero --> |否| Deduct["原子扣费"]
Deduct --> CreateTrans["创建交易记录"]
LogZero --> CreateTrans
CreateTrans --> End([结束])
```

**图表来源**
- [billing.py](file://backend/services/billing.py#L287-L324)

**更新** 计费系统现在支持基于provider/model的成本计算，通过provider.model_costs[model]字典获取各维度费率。

**章节来源**
- [billing.py](file://backend/services/billing.py#L1-L324)
- [models.py](file://backend/models.py#L196-L201)

### 状态轮询机制

系统实现了智能的状态轮询机制，确保任务状态的实时更新：

```mermaid
stateDiagram-v2
[*] --> Pending
Pending --> Processing : 提交成功
Processing --> Completed : 生成完成
Processing --> Failed : 生成失败
Pending --> Failed : 超时(>5分钟)
state Pending {
[*] --> Checking
Checking --> Checking : 轮询xAI
Checking --> Timeout : 超时检测
}
state Processing {
[*] --> Downloading
Downloading --> Saving
Saving --> Billing
}
```

**图表来源**
- [videos.py](file://backend/routers/videos.py#L113-L185)
- [useVideoTasks.ts](file://backend/admin/src/hooks/useVideoTasks.ts#L34-L48)

**更新** 新增供应商配置获取和任务删除功能，支持管理员清理终态任务。

**章节来源**
- [videos.py](file://backend/routers/videos.py#L107-L185)
- [useVideoTasks.ts](file://backend/admin/src/hooks/useVideoTasks.ts#L17-L66)

## API规范

### 基础信息

- **基础URL**: `/api/videos`
- **认证**: 需要有效的JWT令牌，管理员可访问所有任务
- **内容类型**: `application/json`
- **响应格式**: JSON

### 视频生成任务

#### 提交视频生成任务

**请求方法**: `POST /api/videos/`

**请求体参数**:

| 参数 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| provider_id | string | 是 | - | LLM供应商ID |
| model | string | 是 | - | 模型名称 |
| session_id | string | 否 | null | 聊天会话ID |
| video_mode | string | 否 | "text_to_video" | 视频模式 |
| prompt | string | 是 | - | 生成提示词 |
| image_url | string | 否 | null | 输入图片URL |
| config | object | 否 | null | 视频配置 |

**配置参数**:

| 参数 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| duration | integer | 否 | 5 | 视频时长(1-15秒) |
| quality | string | 否 | "720p" | 视频质量(480p/720p) |
| aspect_ratio | string | 否 | "16:9" | 宽高比 |
| mode | string | 否 | "normal" | 模式(保留字段) |

**响应体**:

| 字段 | 类型 | 描述 |
|------|------|------|
| id | string | 任务ID |
| xai_task_id | string | xAI任务ID |
| status | string | 任务状态 |
| video_mode | string | 视频模式 |
| prompt | string | 提示词 |
| duration | integer | 视频时长 |
| quality | string | 视频质量 |
| aspect_ratio | string | 宽高比 |
| video_url | string | 视频URL |
| credit_cost | number | 积分费用 |
| error_message | string | 错误信息 |
| provider_id | string | 供应商ID |
| provider_name | string | 供应商名称 |
| model | string | 模型名称 |
| user_id | string | 用户ID |
| created_at | string | 创建时间 |
| completed_at | string | 完成时间 |

**章节来源**
- [videos.py](file://backend/routers/videos.py#L73-L142)
- [schemas.py](file://backend/schemas.py#L560-L585)

#### 获取任务状态

**请求方法**: `GET /api/videos/{task_id}/status`

**路径参数**:

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| task_id | string | 是 | 视频任务ID |

**响应体**: 同上

**更新** 新增状态轮询端点，支持实时获取任务状态。

**章节来源**
- [videos.py](file://backend/routers/videos.py#L144-L226)

#### 获取会话任务列表

**请求方法**: `GET /api/videos/session/{session_id}`

**路径参数**:

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| session_id | string | 是 | 聊天会话ID |

**响应体**: 数组，包含多个VideoTaskResponse对象

**章节来源**
- [videos.py](file://backend/routers/videos.py#L228-L242)

#### 分页查询视频任务

**请求方法**: `GET /api/videos/`

**查询参数**:

| 参数 | 类型 | 必需 | 默认值 | 描述 |
|------|------|------|--------|------|
| page | integer | 否 | 1 | 页码(>=1) |
| page_size | integer | 否 | 20 | 页面大小(1-100) |
| status | string | 否 | null | 任务状态过滤 |
| video_mode | string | 否 | null | 视频模式过滤 |
| provider_id | string | 否 | null | 供应商ID过滤 |

**响应体**: VideoTaskListResponse对象，包含items数组和分页信息

**更新** 新增分页查询功能，支持管理员对所有任务进行管理。

**章节来源**
- [videos.py](file://backend/routers/videos.py#L25-L71)

#### 删除视频任务

**请求方法**: `DELETE /api/videos/{task_id}`

**路径参数**:

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| task_id | string | 是 | 视频任务ID |

**请求体**: 无

**响应体**: 
```json
{
  "detail": "ok"
}
```

**删除规则**:
- 仅允许删除已完成(completed)或失败(failed)的任务
- 删除时会清理本地视频文件和关联的聊天消息
- 任务记录将从数据库中永久删除

**章节来源**
- [videos.py](file://backend/routers/videos.py#L240-L271)

### 错误处理

系统提供了完善的错误处理机制：

| HTTP状态码 | 错误类型 | 描述 |
|------------|----------|------|
| 400 | Bad Request | 请求参数无效 |
| 401 | Unauthorized | 未认证或令牌无效 |
| 403 | Forbidden | 账户被禁用或权限不足 |
| 404 | Not Found | 任务或资源不存在 |
| 429 | Too Many Requests | 请求过于频繁 |
| 500 | Internal Server Error | 服务器内部错误 |
| 502 | Bad Gateway | 第三方服务错误 |
| 503 | Service Unavailable | 服务不可用 |

**章节来源**
- [videos.py](file://backend/routers/videos.py#L35-L40)
- [videos.py](file://backend/routers/videos.py#L119-L120)

## 后台管理界面

### 视频管理页面

后台管理界面提供了完整的视频任务管理功能：

```mermaid
graph TB
subgraph "视频管理界面"
A[视频管理页面] --> B[任务列表卡片]
A --> C[分页导航]
A --> D[创建新任务按钮]
B --> E[状态徽章]
B --> F[视频缩略图]
B --> G[提示词预览]
B --> H[供应商/模型信息]
B --> I[时间信息]
F --> J[点击预览弹窗]
D --> K[新建视频任务页面]
K --> L[供应商选择]
K --> M[模型选择]
K --> N[视频设置表单]
N --> O[生成模式选择]
N --> P[提示词输入]
N --> Q[图片URL输入]
N --> R[时长滑块]
N --> S[画质选择]
N --> T[比例选择]
B --> U[删除按钮]
U --> V[终态检查]
U --> W[文件清理]
end
```

**图表来源**
- [page.tsx](file://backend/admin/src/app/admin/videos/page.tsx#L55-L268)
- [new_page.tsx](file://backend/admin/src/app/admin/videos/new/page.tsx#L42-L258)

### 实时状态轮询

后台管理界面实现了智能的状态轮询机制：

```mermaid
sequenceDiagram
participant AdminUI as 后台界面
participant SWR as SWR Hook
participant API as 视频API
participant xAI as xAI API
AdminUI->>SWR : 初始化查询
SWR->>API : GET /videos/?page&page_size
API-->>SWR : VideoTaskListResponse
SWR-->>AdminUI : 渲染任务列表
SWR->>SWR : 检测活跃任务
SWR->>API : GET /videos/{id}/status
API->>xAI : 查询任务状态
xAI-->>API : 状态信息
API-->>SWR : 更新后的任务状态
SWR-->>AdminUI : 重新渲染
SWR->>SWR : 5秒间隔轮询
```

**图表来源**
- [useVideoTasks.ts](file://backend/admin/src/hooks/useVideoTasks.ts#L34-L48)

**更新** 新增任务删除功能，支持管理员清理终态任务。

**章节来源**
- [page.tsx](file://backend/admin/src/app/admin/videos/page.tsx#L55-L268)
- [useVideoTasks.ts](file://backend/admin/src/hooks/useVideoTasks.ts#L17-L66)

### 视频预览功能

后台管理界面提供了完整的视频预览功能：

| 功能特性 | 描述 | 实现方式 |
|----------|------|----------|
| 视频播放 | 支持MP4格式视频播放 | HTML5 video元素 |
| 状态显示 | 显示任务状态和错误信息 | 状态徽章和错误提示 |
| 任务详情 | 显示视频配置和计费信息 | 详情表格 |
| 提示词查看 | 显示原始提示词内容 | 文本区域 |
| 时间信息 | 显示创建和完成时间 | 本地化时间格式 |
| 删除功能 | 支持删除已完成或失败任务 | 删除按钮和确认对话框 |

**章节来源**
- [VideoPreviewModal.tsx](file://backend/admin/src/app/admin/videos/VideoPreviewModal.tsx#L20-L116)

## 依赖分析

视频生成API的依赖关系体现了清晰的分层架构：

```mermaid
graph TB
subgraph "外部依赖"
A[xAI API]
B[SQLite数据库]
C[Redis缓存]
end
subgraph "内部模块"
D[FastAPI应用]
E[视频路由]
F[视频服务]
G[计费服务]
H[媒体工具]
I[认证模块]
J[数据库层]
K[LLM供应商管理]
end
D --> E
E --> F
E --> G
E --> H
F --> A
G --> J
H --> B
I --> J
J --> B
J --> K
D --> C
```

**图表来源**
- [main.py](file://backend/main.py#L32-L46)
- [database.py](file://backend/database.py#L1-L31)

### 关键依赖关系

1. **xAI API集成**: 通过HTTP客户端与外部服务通信
2. **数据库连接**: 使用SQLAlchemy ORM进行数据持久化
3. **认证系统**: 基于JWT的用户身份验证
4. **异步处理**: 使用async/await实现非阻塞操作
5. **后台管理界面**: 基于Next.js的React应用，使用SWR进行数据同步
6. **LLM供应商管理**: 支持多供应商和多模型的灵活配置

**更新** 新增LLM供应商管理依赖，支持基于provider/model的成本计算。

**章节来源**
- [video_generation.py](file://backend/services/video_generation.py#L18-L20)
- [auth.py](file://backend/auth.py#L1-L229)

## 性能考虑

### 异步架构优势

视频生成API采用了完全的异步架构设计，具有以下性能优势：

1. **非阻塞I/O**: 使用async/await避免线程阻塞
2. **连接池管理**: 数据库连接池自动管理连接复用
3. **超时控制**: 合理的超时设置防止资源泄露
4. **内存优化**: 流式处理大型文件下载

### 缓存策略

```mermaid
flowchart LR
A[任务提交] --> B[本地缓存]
B --> C[数据库存储]
C --> D[xAI API调用]
D --> E[异步处理]
E --> F[状态轮询]
F --> G[结果缓存]
G --> H[最终响应]
I[后台界面] --> J[SWR缓存]
J --> F
K[供应商配置] --> L[内存缓存]
L --> M[快速成本计算]
```

**图表来源**
- [videos.py](file://backend/routers/videos.py#L121-L124)
- [useVideoTasks.ts](file://backend/admin/src/hooks/useVideoTasks.ts#L30-L32)

**更新** 新增供应商配置缓存和任务删除优化机制。

### 并发处理

系统通过以下机制保证并发安全性：

1. **原子操作**: 使用数据库原子更新确保计费安全
2. **连接池**: 限制最大连接数防止资源耗尽
3. **超时保护**: 防止长时间占用连接
4. **错误恢复**: 自动重试机制提高可靠性
5. **状态轮询优化**: 智能轮询策略减少不必要的API调用
6. **任务删除保护**: 终态检查确保数据一致性

**更新** 新增任务删除的终态检查和文件清理保护机制。

## 故障排除指南

### 常见问题及解决方案

#### 1. 任务状态长时间保持Pending

**可能原因**:
- xAI API服务延迟
- 网络连接问题
- 任务队列拥堵

**解决步骤**:
1. 检查xAI API服务状态
2. 验证网络连接稳定性
3. 查看服务器负载情况
4. 等待系统自动重试

#### 2. 积分扣费失败

**可能原因**:
- 余额不足
- 账户被冻结
- 数据库事务冲突

**解决步骤**:
1. 检查用户余额
2. 验证账户状态
3. 查看数据库日志
4. 重试操作

#### 3. 视频文件下载失败

**可能原因**:
- 远程URL失效
- 网络超时
- 文件格式不支持

**解决步骤**:
1. 验证视频URL有效性
2. 检查网络连接
3. 查看文件格式
4. 重新生成视频

#### 4. 后台界面状态不同步

**可能原因**:
- SWR缓存问题
- 轮询间隔设置不当
- 网络连接不稳定

**解决步骤**:
1. 刷新页面清除缓存
2. 检查网络连接
3. 调整轮询间隔
4. 查看浏览器控制台错误

#### 5. 任务删除失败

**可能原因**:
- 任务状态不是终态
- 文件删除权限问题
- 数据库事务冲突

**解决步骤**:
1. 验证任务状态为completed或failed
2. 检查文件系统权限
3. 查看数据库日志
4. 重试操作

**章节来源**
- [videos.py](file://backend/routers/videos.py#L138-L145)
- [billing.py](file://backend/services/billing.py#L197-L214)

### 日志监控

系统提供了详细的日志记录机制：

| 日志级别 | 用途 | 示例 |
|----------|------|------|
| INFO | 操作记录 | 任务创建、状态更新、供应商配置 |
| WARNING | 警告信息 | 超时警告、余额不足、权限问题 |
| ERROR | 错误信息 | API调用失败、数据库错误、文件删除失败 |
| DEBUG | 调试信息 | 详细流程跟踪、供应商成本计算 |

**更新** 新增供应商配置和任务删除的日志监控。

**章节来源**
- [video_generation.py](file://backend/services/video_generation.py#L109-L131)
- [videos.py](file://backend/routers/videos.py#L175-L177)

## 结论

视频生成API是一个设计精良、功能完整的异步服务，具有以下特点：

1. **架构清晰**: 分层设计确保了良好的可维护性
2. **功能完整**: 支持多种视频生成模式和完整的生命周期管理
3. **性能优秀**: 异步架构和缓存策略提供了高效的处理能力
4. **安全可靠**: 完善的认证、授权和错误处理机制
5. **易于扩展**: 注册表模式和模块化设计便于功能扩展
6. **管理友好**: 完整的后台管理界面，支持实时状态监控
7. **用户体验佳**: 智能轮询机制确保状态更新的实时性
8. **供应商灵活**: 基于provider/model的架构支持多供应商配置
9. **成本透明**: 基于provider/model的成本计算清晰明了
10. **数据管理**: 支持任务删除和文件清理，维护数据整洁

**更新** 新增provider/model架构、任务删除功能和供应商管理能力，显著提升了系统的灵活性和可管理性。

该API为Infinite Narrative Game项目提供了强大的视频生成功能，为用户创造沉浸式的互动体验奠定了坚实的技术基础。新的供应商管理架构和后台管理界面使得视频生成服务更加灵活和可控，为系统管理员提供了强大的管理工具。