# AI服务监控

<cite>
**本文档引用的文件**
- [billing.py](file://backend/services/billing.py)
- [tool_execution_logger.py](file://backend/services/tool_execution_logger.py)
- [admin_tools.py](file://backend/routers/admin_tools.py)
- [models.py](file://backend/models.py)
- [schemas.py](file://backend/schemas.py)
- [agent_executor.py](file://backend/services/agent_executor.py)
- [llm_stream.py](file://backend/services/llm_stream.py)
- [video_generation.py](file://backend/services/video_generation.py)
- [image_config_adapter.py](file://backend/services/image_config_adapter.py)
- [video_providers/model_capabilities.py](file://backend/services/video_providers/model_capabilities.py)
- [usePerformanceMonitor.ts](file://frontend/src/components/ai-assistant/hooks/usePerformanceMonitor.ts)
- [BILLING_REVIEW.md](file://backend/docs/BILLING_REVIEW.md)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)

## 简介
本文件面向KunFlix的AI服务监控体系，围绕以下目标提供系统化文档：
- AI服务调用监控：LLM API调用次数统计、响应时间监控、错误率跟踪
- 工具执行监控：图像生成、视频生成与编辑工具的使用量统计、成功率监控、耗时分析
- 计费系统监控：API调用费用计算、用户余额变化追踪、消费限额预警
- AI代理性能监控：代理响应时间、任务完成率、资源使用情况
- 第三方AI服务集成监控：OpenAI、Claude、Gemini等服务的调用状态与配额使用情况

## 项目结构
后端采用分层架构，监控相关能力主要分布在以下模块：
- 服务层：计费、工具执行日志、LLM流式处理、视频生成、配置适配
- 路由层：管理员工具监控接口、用户与订阅管理接口
- 数据模型层：用户、信用交易、工具执行记录、视频任务等
- 前端Hook：前端侧性能指标采集（FPS、长任务、布局偏移等）

```mermaid
graph TB
subgraph "前端"
FE_PM["usePerformanceMonitor.ts<br/>前端性能监控"]
end
subgraph "后端"
SVC_LLM["llm_stream.py<br/>流式LLM处理"]
SVC_AGENT["agent_executor.py<br/>代理执行器"]
SVC_TOOLS["tool_execution_logger.py<br/>工具执行日志"]
SVC_VIDEO["video_generation.py<br/>视频生成服务"]
SVC_IMG["image_config_adapter.py<br/>图像配置适配"]
SVC_BILL["billing.py<br/>计费计算与扣费"]
SVC_VCAP["model_capabilities.py<br/>视频模型能力"]
end
subgraph "路由与模型"
RT_ADMIN["admin_tools.py<br/>管理员工具监控"]
MODELS["models.py<br/>数据模型"]
SCHEMAS["schemas.py<br/>数据结构定义"]
end
FE_PM --> |"前端指标上报"| RT_ADMIN
SVC_LLM --> SVC_BILL
SVC_AGENT --> SVC_BILL
SVC_TOOLS --> RT_ADMIN
SVC_VIDEO --> SVC_VCAP
SVC_IMG --> SVC_LLM
SVC_BILL --> MODELS
RT_ADMIN --> MODELS
SCHEMAS --> MODELS
```

**图表来源**
- [llm_stream.py:1-1041](file://backend/services/llm_stream.py#L1-L1041)
- [agent_executor.py:1-287](file://backend/services/agent_executor.py#L1-L287)
- [tool_execution_logger.py:1-89](file://backend/services/tool_execution_logger.py#L1-L89)
- [video_generation.py:1-180](file://backend/services/video_generation.py#L1-L180)
- [image_config_adapter.py:1-250](file://backend/services/image_config_adapter.py#L1-L250)
- [billing.py:1-388](file://backend/services/billing.py#L1-L388)
- [admin_tools.py:1-273](file://backend/routers/admin_tools.py#L1-L273)
- [models.py:1-503](file://backend/models.py#L1-L503)
- [schemas.py:1-931](file://backend/schemas.py#L1-L931)

**章节来源**
- [admin_tools.py:1-273](file://backend/routers/admin_tools.py#L1-L273)
- [models.py:1-503](file://backend/models.py#L1-L503)
- [schemas.py:1-931](file://backend/schemas.py#L1-L931)

## 核心组件
- 计费与余额管理：提供原子化扣费、余额检查、退款、费用计算与明细记录
- 工具执行日志：非阻塞记录工具调用、参数脱敏、状态与耗时
- LLM流式处理：统一供应商注册表、流式结果聚合、模态token统计
- 视频生成服务：多供应商适配、任务提交与轮询、模型能力配置
- 管理员监控接口：工具使用统计、执行日志查询、配置能力查看
- 前端性能监控：FPS、长任务、布局偏移、首次输入延迟等指标采集

**章节来源**
- [billing.py:1-388](file://backend/services/billing.py#L1-L388)
- [tool_execution_logger.py:1-89](file://backend/services/tool_execution_logger.py#L1-L89)
- [llm_stream.py:1-1041](file://backend/services/llm_stream.py#L1-L1041)
- [video_generation.py:1-180](file://backend/services/video_generation.py#L1-L180)
- [admin_tools.py:1-273](file://backend/routers/admin_tools.py#L1-L273)
- [usePerformanceMonitor.ts:1-236](file://frontend/src/components/ai-assistant/hooks/usePerformanceMonitor.ts#L1-L236)

## 架构总览
下图展示了AI服务监控的关键交互路径：前端性能指标、工具调用日志、LLM流式处理、视频生成与计费系统的协同。

```mermaid
sequenceDiagram
participant FE as "前端客户端"
participant Hook as "性能监控Hook"
participant Agent as "代理执行器"
participant LLM as "LLM流式处理"
participant Tools as "工具执行日志"
participant Billing as "计费系统"
participant Admin as "管理员监控接口"
participant DB as "数据库"
FE->>Hook : 初始化性能监控
Hook-->>FE : 上报FPS/长任务/CLS/FID
Agent->>LLM : 发起流式请求
LLM-->>Agent : 返回流式片段与统计
Agent->>Tools : 记录工具调用(非阻塞)
Tools->>DB : 异步写入执行日志
Agent->>Billing : 计算并原子扣费
Billing->>DB : 更新余额与交易记录
Admin->>DB : 查询工具统计与执行日志
DB-->>Admin : 返回统计数据
```

**图表来源**
- [usePerformanceMonitor.ts:1-236](file://frontend/src/components/ai-assistant/hooks/usePerformanceMonitor.ts#L1-L236)
- [agent_executor.py:1-287](file://backend/services/agent_executor.py#L1-L287)
- [llm_stream.py:1-1041](file://backend/services/llm_stream.py#L1-L1041)
- [tool_execution_logger.py:1-89](file://backend/services/tool_execution_logger.py#L1-L89)
- [billing.py:1-388](file://backend/services/billing.py#L1-L388)
- [admin_tools.py:1-273](file://backend/routers/admin_tools.py#L1-L273)
- [models.py:1-503](file://backend/models.py#L1-L503)

## 详细组件分析

### LLM API调用监控
- 统计维度：输入/输出tokens、模态token（文本/图像）、工具调用次数、搜索查询次数、生成图片数量
- 监控指标：调用次数、平均/最大响应时间、错误率、工具调用成功率
- 实现要点：
  - 流式结果聚合：统一收集文本增量、推理内容、工具调用与token统计
  - 供应商注册表：减少分支判断，便于扩展新供应商
  - 前端性能联动：结合前端FPS与长任务指标，定位慢响应根因

```mermaid
flowchart TD
Start(["开始流式调用"]) --> BuildMsg["构建消息与上下文"]
BuildMsg --> ProviderSel{"选择供应商"}
ProviderSel --> |OpenAI/DeepSeek| OpenAI["OpenAI/DeepSeek处理器"]
ProviderSel --> |xAI/Grok| XAI["xAI处理器"]
ProviderSel --> |Anthropic/MiniMax| Anthropic["Anthropic/MiniMax处理器"]
ProviderSel --> |Gemini| Gemini["Gemini处理器"]
OpenAI --> Stream["流式接收片段"]
XAI --> Stream
Anthropic --> Stream
Gemini --> Stream
Stream --> Aggregate["聚合结果与统计"]
Aggregate --> Tokens["计算tokens与模态统计"]
Tokens --> End(["结束并返回"])
```

**图表来源**
- [llm_stream.py:1-1041](file://backend/services/llm_stream.py#L1-L1041)
- [agent_executor.py:1-287](file://backend/services/agent_executor.py#L1-L287)

**章节来源**
- [llm_stream.py:1-1041](file://backend/services/llm_stream.py#L1-L1041)
- [agent_executor.py:1-287](file://backend/services/agent_executor.py#L1-L287)

### 工具执行监控
- 记录字段：工具名、供应商名、代理ID、会话ID、用户ID、状态、耗时、结果摘要、错误信息
- 统计接口：总调用次数、错误数、错误率、平均耗时、按工具/供应商分组统计
- 非阻塞写入：使用异步任务，失败静默，不影响主流程
- 敏感信息脱敏：自动过滤api_key、secret、token、password等字段

```mermaid
sequenceDiagram
participant Agent as "代理"
participant ToolMgr as "工具管理器"
participant Logger as "工具执行日志"
participant DB as "数据库"
Agent->>ToolMgr : 调用工具(名称, 参数)
ToolMgr->>Logger : 记录执行(名称, 参数, 状态, 耗时)
Logger->>DB : 异步写入(非阻塞)
DB-->>Logger : 写入完成
ToolMgr-->>Agent : 返回结果
```

**图表来源**
- [tool_execution_logger.py:1-89](file://backend/services/tool_execution_logger.py#L1-L89)
- [admin_tools.py:1-273](file://backend/routers/admin_tools.py#L1-L273)

**章节来源**
- [tool_execution_logger.py:1-89](file://backend/services/tool_execution_logger.py#L1-L89)
- [admin_tools.py:1-273](file://backend/routers/admin_tools.py#L1-L273)

### 计费系统监控
- 费用计算：按维度（输入/文本输出/图像输出/搜索/图片生成）与规模（每1M tokens或单次）计算
- 原子扣费：使用UPDATE...WHERE确保并发安全，失败时抛出余额不足或冻结异常
- 余额检查：预估费用校验，避免负余额滥用
- 退款与调整：支持管理员手动调整与原子退款，记录交易明细
- 数据模型：用户/管理员余额、信用交易流水、视频任务计费字段

```mermaid
flowchart TD
PreCheck["预估费用与余额检查"] --> Deduct{"原子扣费"}
Deduct --> |成功| Record["记录交易流水"]
Deduct --> |失败| HandleErr["处理异常(余额不足/冻结)"]
Record --> End(["完成"])
HandleErr --> End
```

**图表来源**
- [billing.py:1-388](file://backend/services/billing.py#L1-L388)
- [models.py:1-503](file://backend/models.py#L1-L503)
- [schemas.py:1-931](file://backend/schemas.py#L1-L931)

**章节来源**
- [billing.py:1-388](file://backend/services/billing.py#L1-L388)
- [models.py:1-503](file://backend/models.py#L1-L503)
- [schemas.py:1-931](file://backend/schemas.py#L1-L931)
- [BILLING_REVIEW.md:1-196](file://backend/docs/BILLING_REVIEW.md#L1-L196)

### AI代理性能监控
- 指标采集：代理响应时间、任务完成率、资源使用（CPU/内存/网络）
- 前端性能联动：FPS、长任务、布局偏移、首次输入延迟
- 建议实践：结合前端Hook与后端日志，定位UI卡顿与慢响应根因

**章节来源**
- [usePerformanceMonitor.ts:1-236](file://frontend/src/components/ai-assistant/hooks/usePerformanceMonitor.ts#L1-L236)
- [agent_executor.py:1-287](file://backend/services/agent_executor.py#L1-L287)

### 第三方AI服务集成监控
- 供应商适配：OpenAI、Azure、DeepSeek、xAI、Anthropic、MiniMax、DashScope、Gemini、Ark/Doubao
- 统一入口：根据模型或供应商类型选择适配器，支持任务提交与轮询
- 模型能力：视频模型能力配置，涵盖模式、时长、分辨率、参考图、音频等
- 图像配置：统一配置到各供应商参数的映射，避免条件分支

```mermaid
classDiagram
class VideoGeneration {
+submit_video_task(ctx)
+poll_video_task(api_key, task_id, provider_type)
+infer_provider_type(model, provider_type_hint)
}
class ModelCapabilities {
+VIDEO_MODEL_CAPABILITIES
+get_model_capabilities(model_name)
+get_supported_models()
+get_models_by_provider(provider)
}
class ImageConfigAdapter {
+to_provider_config(provider_type, unified_config)
+resolve_image_configs(agent, provider_type)
+resolve_global_image_configs(global_config, agent, provider_type)
}
VideoGeneration --> ModelCapabilities : "查询能力"
VideoGeneration --> ImageConfigAdapter : "图像配置适配"
```

**图表来源**
- [video_generation.py:1-180](file://backend/services/video_generation.py#L1-L180)
- [video_providers/model_capabilities.py:1-477](file://backend/services/video_providers/model_capabilities.py#L1-L477)
- [image_config_adapter.py:1-250](file://backend/services/image_config_adapter.py#L1-L250)

**章节来源**
- [video_generation.py:1-180](file://backend/services/video_generation.py#L1-L180)
- [video_providers/model_capabilities.py:1-477](file://backend/services/video_providers/model_capabilities.py#L1-L477)
- [image_config_adapter.py:1-250](file://backend/services/image_config_adapter.py#L1-L250)

## 依赖关系分析
- 低耦合设计：监控组件通过统一接口与数据模型交互，避免交叉依赖
- 数据一致性：计费与日志均依赖数据库事务与索引，保证统计准确性
- 扩展性：供应商注册表与工具注册表采用映射表，便于新增供应商与工具

```mermaid
graph LR
Billing["计费系统"] --> Models["数据模型"]
ToolsLog["工具日志"] --> Models
LLMStream["LLM流式处理"] --> Models
AdminAPI["管理员监控接口"] --> Models
AdminAPI --> ToolsLog
AdminAPI --> Billing
AdminAPI --> LLMStream
```

**图表来源**
- [billing.py:1-388](file://backend/services/billing.py#L1-L388)
- [tool_execution_logger.py:1-89](file://backend/services/tool_execution_logger.py#L1-L89)
- [llm_stream.py:1-1041](file://backend/services/llm_stream.py#L1-L1041)
- [admin_tools.py:1-273](file://backend/routers/admin_tools.py#L1-L273)
- [models.py:1-503](file://backend/models.py#L1-L503)

**章节来源**
- [models.py:1-503](file://backend/models.py#L1-L503)
- [admin_tools.py:1-273](file://backend/routers/admin_tools.py#L1-L273)

## 性能考虑
- 前端性能监控：FPS采样、长任务阈值、布局偏移与首次输入延迟，辅助定位UI卡顿
- 后端非阻塞日志：异步写入避免阻塞主流程
- 原子扣费：数据库层面避免并发竞态，降低统计偏差
- 统一适配：映射表与注册表减少分支判断，提升扩展效率

[本节为通用指导，无需具体文件引用]

## 故障排查指南
- 余额不足/冻结：检查余额检查与冻结状态，确认预估费用与实际费用差异
- 并发扣费异常：核对原子扣费逻辑，确保UPDATE...WHERE条件正确
- 工具执行失败：查看执行日志中的状态与错误信息，结合前端性能指标定位根因
- 计费异常：核对费率配置、规模因子与维度映射，确保与供应商计费一致

**章节来源**
- [billing.py:1-388](file://backend/services/billing.py#L1-L388)
- [tool_execution_logger.py:1-89](file://backend/services/tool_execution_logger.py#L1-L89)
- [admin_tools.py:1-273](file://backend/routers/admin_tools.py#L1-L273)
- [BILLING_REVIEW.md:1-196](file://backend/docs/BILLING_REVIEW.md#L1-L196)

## 结论
通过统一的监控组件与清晰的职责划分，KunFlix实现了对AI服务调用、工具执行、计费与第三方服务的全链路监控。建议持续完善原子扣费、余额检查与退款机制，结合前端性能指标与后端日志，形成闭环的质量保障体系。