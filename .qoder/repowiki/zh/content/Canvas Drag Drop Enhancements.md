# 画布拖拽增强功能文档

<cite>
**本文档引用的文件**
- [useCanvasDragDrop.ts](file://frontend/src/app/theater/[id]/hooks/useCanvasDragDrop.ts)
- [useNodeDragToAI.ts](file://frontend/src/app/theater/[id]/hooks/useNodeDragToAI.ts)
- [useCanvasStore.ts](file://frontend/src/store/useCanvasStore.ts)
- [useAIAssistantStore.ts](file://frontend/src/store/useAIAssistantStore.ts)
- [TheaterCanvas.tsx](file://frontend/src/components/TheaterCanvas.tsx)
- [AIAssistantPanel.tsx](file://frontend/src/components/canvas/AIAssistantPanel.tsx)
- [NodePreviewCard.tsx](file://frontend/src/components/ai-assistant/NodePreviewCard.tsx)
- [nodeAttachmentUtils.ts](file://frontend/src/lib/nodeAttachmentUtils.ts)
- [CharacterNode.tsx](file://frontend/src/components/canvas/CharacterNode.tsx)
- [ScriptNode.tsx](file://frontend/src/components/canvas/ScriptNode.tsx)
- [StoryboardNode.tsx](file://frontend/src/components/canvas/StoryboardNode.tsx)
- [VideoNode.tsx](file://frontend/src/components/canvas/VideoNode.tsx)
- [graphUtils.ts](file://frontend/src/lib/graphUtils.ts)
- [page.tsx](file://frontend/src/app/theater/[id]/page.tsx)
- [CustomEdge.tsx](file://frontend/src/components/canvas/CustomEdge.tsx)
- [Sidebar.tsx](file://frontend/src/components/canvas/Sidebar.tsx)
- [useCanvasSnapping.ts](file://frontend/src/app/theater/[id]/hooks/useCanvasSnapping.ts)
- [theaterApi.ts](file://frontend/src/lib/theaterApi.ts)
- [package.json](file://frontend/package.json)
</cite>

## 更新摘要
**所做更改**
- 新增拖拽到AI功能章节，详细介绍useNodeDragToAI钩子的实现
- 添加节点预览卡片组件分析，说明NodePreviewCard的设计和功能
- 新增节点附件工具模块，解释nodeAttachmentUtils的数据提取机制
- 更新架构概览，反映AI拖拽增强功能的集成
- 扩展依赖关系分析，包含新增的AI助手存储和工具模块
- 更新故障排除指南，添加AI拖拽功能的相关问题

## 目录
1. [项目概述](#项目概述)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [新增AI拖拽增强功能](#新增ai拖拽增强功能)
7. [依赖关系分析](#依赖关系分析)
8. [性能考虑](#性能考虑)
9. [故障排除指南](#故障排除指南)
10. [结论](#结论)

## 项目概述

Canvas Drag Drop Enhancements 是一个基于 React 和 Next.js 构建的无限叙事剧场应用，专注于提供强大的画布拖拽和节点管理功能。该系统集成了 React Flow 进行可视化布局，并提供了完整的节点拖拽、连接、对齐和同步功能。

**更新** 新增了AI拖拽增强功能，允许用户将画布节点直接拖拽到AI助手面板进行智能创作和编辑。

主要特性包括：
- 支持多种节点类型的拖拽添加（文本、图片、视频、故事板）
- 实时文件拖拽导入功能
- 智能对齐和吸附功能
- 节点连接和关系管理
- 自动保存和版本控制
- 响应式设计和高性能渲染
- **新增** AI助手拖拽集成，支持节点到AI的直接交互
- **新增** 节点预览和附件管理功能

## 项目结构

前端项目采用模块化架构，主要分为以下几个核心部分：

```mermaid
graph TB
subgraph "应用层"
A[页面组件<br/>page.tsx]
B[画布组件<br/>TheaterCanvas.tsx]
C[侧边栏<br/>Sidebar.tsx]
D[AI助手面板<br/>AIAssistantPanel.tsx]
end
subgraph "画布节点"
E[脚本文本节点<br/>ScriptNode.tsx]
F[角色图片节点<br/>CharacterNode.tsx]
G[视频节点<br/>VideoNode.tsx]
H[故事板节点<br/>StoryboardNode.tsx]
I[自定义连线<br/>CustomEdge.tsx]
end
subgraph "状态管理"
J[画布存储<br/>useCanvasStore.ts]
K[拖拽钩子<br/>useCanvasDragDrop.ts]
L[对齐钩子<br/>useCanvasSnapping.ts]
M[AI助手存储<br/>useAIAssistantStore.ts]
N[节点拖拽AI钩子<br/>useNodeDragToAI.ts]
end
subgraph "工具库"
O[图工具<br/>graphUtils.ts]
P[节点附件工具<br/>nodeAttachmentUtils.ts]
Q[剧场API<br/>theaterApi.ts]
end
subgraph "AI助手组件"
R[节点预览卡片<br/>NodePreviewCard.tsx]
S[面板头部<br/>PanelHeader.tsx]
T[消息输入<br/>MessageInput.tsx]
end
A --> C
A --> B
A --> D
B --> E
B --> F
B --> G
B --> H
B --> I
A --> J
C --> K
A --> L
A --> N
J --> O
J --> Q
M --> R
N --> P
D --> R
```

**图表来源**
- [page.tsx:1-891](file://frontend/src/app/theater/[id]/page.tsx#L1-L891)
- [useCanvasStore.ts:1-540](file://frontend/src/store/useCanvasStore.ts#L1-L540)
- [useAIAssistantStore.ts:1-345](file://frontend/src/store/useAIAssistantStore.ts#L1-L345)
- [AIAssistantPanel.tsx:1-580](file://frontend/src/components/canvas/AIAssistantPanel.tsx#L1-L580)

**章节来源**
- [page.tsx:1-891](file://frontend/src/app/theater/[id]/page.tsx#L1-L891)
- [package.json:1-94](file://frontend/package.json#L1-L94)

## 核心组件

### 画布拖拽钩子系统

`useCanvasDragDrop` 钩子提供了完整的拖拽功能实现：

```mermaid
sequenceDiagram
participant User as 用户
participant Sidebar as 侧边栏
participant DragDrop as 拖拽系统
participant Store as 状态存储
participant Canvas as 画布
User->>Sidebar : 拖拽节点
Sidebar->>DragDrop : onDragStart()
DragDrop->>DragDrop : 设置拖拽数据
User->>Canvas : 在画布上释放
Canvas->>DragDrop : onDrop()
DragDrop->>DragDrop : 解析拖拽数据
DragDrop->>Store : addNode()
Store->>Canvas : 更新画布显示
Canvas->>User : 显示新节点
```

**图表来源**
- [useCanvasDragDrop.ts:1-74](file://frontend/src/app/theater/[id]/hooks/useCanvasDragDrop.ts#L1-L74)
- [Sidebar.tsx:88-118](file://frontend/src/components/canvas/Sidebar.tsx#L88-L118)

### 画布存储管理系统

`useCanvasStore` 提供了集中式的状态管理，包含以下核心功能：

- **节点管理**：添加、删除、更新节点
- **连接管理**：创建、删除、验证连接关系
- **历史记录**：撤销/重做功能
- **同步机制**：与后端数据库实时同步
- **设置管理**：网格吸附、对齐指南等

**章节来源**
- [useCanvasStore.ts:1-540](file://frontend/src/store/useCanvasStore.ts#L1-L540)

## 架构概览

系统采用分层架构设计，确保各组件职责清晰且可维护。**更新** 新增了AI拖拽增强功能的架构集成：

```mermaid
graph TD
subgraph "表现层"
A[页面组件]
B[节点组件]
C[UI组件]
D[AI助手面板]
E[节点预览卡片]
end
subgraph "业务逻辑层"
F[拖拽处理]
G[连接管理]
H[对齐算法]
I[文件处理]
J[节点拖拽AI处理]
K[附件数据提取]
end
subgraph "状态管理层"
L[画布存储]
M[资源存储]
N[认证状态]
O[AI助手存储]
P[节点附件存储]
end
subgraph "数据访问层"
Q[后端API]
R[本地存储]
S[文件上传]
T[SSE流处理]
end
A --> B
A --> C
A --> D
B --> F
B --> G
B --> H
F --> J
J --> K
K --> P
D --> E
D --> O
E --> P
F --> L
G --> L
H --> L
I --> L
J --> O
O --> T
L --> Q
L --> R
L --> S
```

**图表来源**
- [page.tsx:54-92](file://frontend/src/app/theater/[id]/page.tsx#L54-L92)
- [useCanvasStore.ts:185-540](file://frontend/src/store/useCanvasStore.ts#L185-L540)
- [useNodeDragToAI.ts:1-88](file://frontend/src/app/theater/[id]/hooks/useNodeDragToAI.ts#L1-L88)
- [useAIAssistantStore.ts:76-181](file://frontend/src/store/useAIAssistantStore.ts#L76-L181)

## 详细组件分析

### 拖拽系统实现

#### 拖拽数据格式规范

系统使用标准化的数据传输格式来确保跨组件的兼容性：

| 数据类型 | 键名 | 描述 | 示例值 |
|---------|------|------|--------|
| 节点类型 | `application/reactflow` | 节点类型标识 | `"text"`, `"image"` |
| 节点数据 | `application/reactflow-data` | 节点初始数据 | `{title: "新文本卡"}` |
| 节点尺寸 | `application/reactflow-dimensions` | 节点默认尺寸 | `{"width": 400, "height": 300}` |

#### 文件拖拽处理流程

```mermaid
flowchart TD
A[用户拖拽文件] --> B{检测拖拽类型}
B --> |内部节点拖拽| C[设置拖拽效果为移动]
B --> |外部文件拖拽| D[设置拖拽效果为复制]
D --> E[检测文件类型]
E --> F[验证文件大小]
F --> G{文件类型支持?}
G --> |是| H[创建节点]
G --> |否| I[显示错误提示]
H --> J[上传文件到服务器]
J --> K[更新节点数据]
K --> L[显示新节点]
C --> M[直接添加节点]
M --> L
```

**图表来源**
- [page.tsx:512-653](file://frontend/src/app/theater/[id]/page.tsx#L512-L653)
- [Sidebar.tsx:88-118](file://frontend/src/components/canvas/Sidebar.tsx#L88-L118)

**章节来源**
- [page.tsx:277-510](file://frontend/src/app/theater/[id]/page.tsx#L277-L510)
- [useCanvasDragDrop.ts:10-70](file://frontend/src/app/theater/[id]/hooks/useCanvasDragDrop.ts#L10-L70)

### 节点类型系统

#### 文本节点（ScriptNode）

文本节点支持富文本编辑和标签管理：

```mermaid
classDiagram
class ScriptNode {
+string id
+ScriptNodeData data
+boolean selected
+handleEdit() void
+handleDelete() void
+handleDuplicate() void
+handleAIAssist() void
}
class ScriptNodeData {
+string title
+object content
+string[] tags
+string[] characters
+string scenes
}
class ScriptEditor {
+initialContent object
+isEditable boolean
+onUpdate() void
}
ScriptNode --> ScriptNodeData : 使用
ScriptNode --> ScriptEditor : 包含
```

**图表来源**
- [ScriptNode.tsx:11-261](file://frontend/src/components/canvas/ScriptNode.tsx#L11-L261)
- [useCanvasStore.ts:27-33](file://frontend/src/store/useCanvasStore.ts#L27-L33)

#### 图片节点（CharacterNode）

图片节点提供完整的图片管理和编辑功能：

```mermaid
stateDiagram-v2
[*] --> 未上传
未上传 --> 上传中 : 用户选择图片
上传中 --> 上传成功 : 服务器响应成功
上传中 --> 上传失败 : 服务器响应失败
上传成功 --> 预览模式 : 显示图片
上传失败 --> 错误提示 : 显示错误信息
预览模式 --> 编辑模式 : 双击图片
编辑模式 --> 预览模式 : 完成编辑
预览模式 --> 删除 : 点击删除按钮
删除 --> [*]
```

**图表来源**
- [CharacterNode.tsx:13-596](file://frontend/src/components/canvas/CharacterNode.tsx#L13-L596)

**章节来源**
- [CharacterNode.tsx:105-204](file://frontend/src/components/canvas/CharacterNode.tsx#L105-L204)
- [VideoNode.tsx:107-185](file://frontend/src/components/canvas/VideoNode.tsx#L107-L185)

### 对齐和吸附系统

#### 智能对齐算法

对齐系统通过计算节点边缘距离来实现精确的对齐效果：

```mermaid
flowchart LR
A[拖拽节点] --> B[计算边缘距离]
B --> C{距离小于阈值?}
C --> |是| D[找到对齐线]
C --> |否| E[继续检查其他节点]
D --> F[更新对齐线位置]
F --> G[应用位置偏移]
E --> H[检查下一个节点]
H --> B
G --> I[显示对齐线]
I --> J[拖拽完成]
J --> K[清除对齐线]
```

**图表来源**
- [useCanvasSnapping.ts:12-90](file://frontend/src/app/theater/[id]/hooks/useCanvasSnapping.ts#L12-L90)

**章节来源**
- [useCanvasSnapping.ts:1-98](file://frontend/src/app/theater/[id]/hooks/useCanvasSnapping.ts#L1-L98)

### 连接管理系统

#### 循环检测算法

系统内置循环检测机制，防止创建无效的循环连接：

```mermaid
sequenceDiagram
participant User as 用户
participant Edge as 连接器
participant Graph as 图结构
participant Validator as 验证器
User->>Edge : 创建连接
Edge->>Validator : 检查循环
Validator->>Graph : 构建邻接表
Graph->>Validator : DFS搜索路径
Validator->>Validator : 检查目标到源的可达性
Validator->>Edge : 返回验证结果
Edge->>User : 允许或阻止连接
```

**图表来源**
- [graphUtils.ts:4-38](file://frontend/src/lib/graphUtils.ts#L4-L38)

**章节来源**
- [useCanvasStore.ts:238-254](file://frontend/src/store/useCanvasStore.ts#L238-L254)
- [graphUtils.ts:1-39](file://frontend/src/lib/graphUtils.ts#L1-L39)

## 新增AI拖拽增强功能

### 节点拖拽到AI功能

**useNodeDragToAI** 钩子实现了画布节点到AI助手面板的拖拽功能，提供完整的拖拽检测和状态管理。

#### 拖拽检测流程

```mermaid
flowchart TD
A[节点拖拽开始] --> B{保存原始位置}
B --> C[缓存AI面板矩形]
C --> D[监听拖拽事件]
D --> E{检测鼠标位置}
E --> |在面板内| F[设置拖拽悬停状态]
E --> |不在面板内| G[清除拖拽状态]
F --> H[拖拽结束]
G --> H
H --> I{是否在面板上释放}
I --> |是| J[恢复节点位置]
I --> |否| K[保持当前位置]
J --> L[提取节点附件]
L --> M[设置AI助手附件]
M --> N[自动打开面板]
N --> O[清理引用]
```

**图表来源**
- [useNodeDragToAI.ts:28-84](file://frontend/src/app/theater/[id]/hooks/useNodeDragToAI.ts#L28-L84)

#### 节点附件数据提取

`nodeAttachmentUtils` 模块提供了统一的节点数据提取机制，支持所有节点类型的附件转换：

```mermaid
classDiagram
class NodeAttachment {
+string nodeId
+NodeType nodeType
+string label
+string excerpt
+string thumbnailUrl
+Record~string, unknown~ meta
}
class NodeAttachmentExtractor {
+extractNodeAttachment(node : CanvasNode) NodeAttachment
+extractPlainTextFromTiptap(json, maxLength) string
}
class AttachmentExtractors {
+text : (node) => NodeAttachment
+image : (node) => NodeAttachment
+video : (node) => NodeAttachment
+storyboard : (node) => NodeAttachment
}
NodeAttachmentExtractor --> AttachmentExtractors : 使用
NodeAttachmentExtractor --> NodeAttachment : 生成
```

**图表来源**
- [nodeAttachmentUtils.ts:74-84](file://frontend/src/lib/nodeAttachmentUtils.ts#L74-L84)
- [useAIAssistantStore.ts:76-84](file://frontend/src/store/useAIAssistantStore.ts#L76-L84)

**章节来源**
- [useNodeDragToAI.ts:1-88](file://frontend/src/app/theater/[id]/hooks/useNodeDragToAI.ts#L1-L88)
- [nodeAttachmentUtils.ts:1-85](file://frontend/src/lib/nodeAttachmentUtils.ts#L1-L85)

### 节点预览卡片组件

**NodePreviewCard** 组件负责在AI助手面板中显示被拖拽节点的预览信息，提供直观的视觉反馈。

#### 预览卡片设计

| 节点类型 | 图标 | 颜色主题 | 缩略图显示 |
|---------|------|----------|------------|
| 文本节点 | ScrollText | 蓝色系 | 否 |
| 图片节点 | ImageIcon | 绿色系 | 是 |
| 视频节点 | Film | 黄色系 | 是 |
| 故事板节点 | Clapperboard | 紫色系 | 否 |

#### 预览卡片交互

```mermaid
stateDiagram-v2
[*] --> 卡片显示
卡片显示 --> 悬停状态 : 鼠标悬停
卡片显示 --> 上传状态 : 正在上传
悬停状态 --> 正常状态 : 移出卡片
上传状态 --> 正常状态 : 上传完成
正常状态 --> 缩略图显示 : 图片/视频
正常状态 --> 文本摘要 : 文本节点
卡片显示 --> 关闭 : 点击关闭按钮
关闭 --> [*]
```

**图表来源**
- [NodePreviewCard.tsx:32-109](file://frontend/src/components/ai-assistant/NodePreviewCard.tsx#L32-L109)

**章节来源**
- [NodePreviewCard.tsx:1-110](file://frontend/src/components/ai-assistant/NodePreviewCard.tsx#L1-L110)

### AI助手存储管理

**useAIAssistantStore** 扩展了原有的存储管理，新增了节点附件和拖拽状态的管理功能。

#### 新增存储状态

| 状态名称 | 类型 | 描述 |
|---------|------|------|
| nodeAttachment | NodeAttachment | 当前拖拽到面板的节点附件 |
| isDragOverPanel | boolean | 拖拽悬停状态 |
| imageEditContext | ImageEditContext | 图像编辑上下文 |

#### 互斥状态管理

AI助手存储实现了智能的状态互斥机制，确保节点附件和图像编辑上下文不会同时存在：

```mermaid
flowchart TD
A[设置节点附件] --> B{检查图像编辑上下文}
B --> |存在| C[清除图像编辑上下文]
B --> |不存在| D[保持现有状态]
C --> E[设置节点附件]
D --> E
E --> F[触发状态更新]
```

**图表来源**
- [useAIAssistantStore.ts:306-312](file://frontend/src/store/useAIAssistantStore.ts#L306-L312)

**章节来源**
- [useAIAssistantStore.ts:76-181](file://frontend/src/store/useAIAssistantStore.ts#L76-L181)
- [useAIAssistantStore.ts:306-322](file://frontend/src/store/useAIAssistantStore.ts#L306-L322)

### 页面集成实现

**页面组件** 将AI拖拽功能与现有的画布系统无缝集成，实现了组合拖拽回调的协调工作。

#### 组合拖拽回调

页面组件通过组合函数实现了多个拖拽钩子的协调工作：

```mermaid
sequenceDiagram
participant User as 用户
participant Page as 页面组件
participant Snapping as 对齐钩子
participant AIHook as AI拖拽钩子
participant Store as 状态存储
User->>Page : 开始拖拽节点
Page->>AIHook : onNodeDragStart()
AIHook->>AIHook : 保存原始位置
Page->>Snapping : onNodeDrag()
Snapping->>Store : 更新对齐状态
Page->>AIHook : onNodeDrag()
AIHook->>AIHook : 检测面板悬停
User->>Page : 结束拖拽
Page->>Snapping : onNodeDragStop()
Snapping->>Store : 清理对齐状态
Page->>AIHook : onNodeDragStop()
AIHook->>Store : 处理节点附件
```

**图表来源**
- [page.tsx:95-119](file://frontend/src/app/theater/[id]/page.tsx#L95-L119)

**章节来源**
- [page.tsx:95-119](file://frontend/src/app/theater/[id]/page.tsx#L95-L119)

## 依赖关系分析

### 核心依赖关系

```mermaid
graph TB
subgraph "React Flow 生态"
A[@xyflow/react]
B[React Flow Provider]
C[Handle 组件]
end
subgraph "状态管理"
D[zustand]
E[persist middleware]
F[画布存储]
G[AI助手存储]
end
subgraph "UI 组件库"
H[lucide-react]
I[Radix UI]
J[framer-motion]
end
subgraph "工具库"
K[uuid]
L[axios]
M[tiptap]
N[nodeAttachmentUtils]
O[graphUtils]
end
A --> B
A --> C
D --> E
F --> G
G --> D
H --> I
A --> K
F --> O
G --> N
J --> H
```

**图表来源**
- [package.json:13-69](file://frontend/package.json#L13-L69)

### 组件间依赖关系

```mermaid
graph LR
A[page.tsx] --> B[useCanvasStore.ts]
A --> C[Sidebar.tsx]
A --> D[ReactFlow]
A --> E[useNodeDragToAI.ts]
C --> F[useCanvasDragDrop.ts]
B --> G[theaterApi.ts]
B --> H[graphUtils.ts]
I[ScriptNode.tsx] --> B
J[CharacterNode.tsx] --> B
K[VideoNode.tsx] --> B
L[StoryboardNode.tsx] --> B
M[CustomEdge.tsx] --> B
A --> N[AIAssistantPanel.tsx]
N --> O[NodePreviewCard.tsx]
N --> P[useAIAssistantStore.ts]
E --> Q[nodeAttachmentUtils.ts]
P --> R[NodeAttachment接口]
```

**图表来源**
- [page.tsx:22-42](file://frontend/src/app/theater/[id]/page.tsx#L22-L42)
- [useCanvasStore.ts:1-25](file://frontend/src/store/useCanvasStore.ts#L1-L25)
- [useNodeDragToAI.ts:1-88](file://frontend/src/app/theater/[id]/hooks/useNodeDragToAI.ts#L1-L88)

**章节来源**
- [package.json:1-94](file://frontend/package.json#L1-L94)

## 性能考虑

### 优化策略

1. **虚拟化渲染**：大量节点时使用 React Window 进行虚拟化
2. **事件节流**：拖拽和缩放操作使用防抖和节流
3. **增量更新**：只更新变化的节点和连接
4. **内存管理**：及时清理临时对象和事件监听器
5. **懒加载**：动态导入大型依赖库
6. **状态优化**：AI拖拽状态使用引用缓存减少渲染
7. **条件渲染**：节点预览卡片按需显示

### 存储优化

- 使用 localStorage 进行本地持久化
- 实现智能合并策略避免重复数据
- 支持离线模式和自动同步
- **新增** AI助手存储的局部化持久化

## 故障排除指南

### 常见问题及解决方案

#### 拖拽功能异常

**问题**：节点无法拖拽到画布
**原因**：拖拽数据格式不正确
**解决**：检查 `onDragStart` 函数中的数据设置

#### 连接创建失败

**问题**：连接线无法创建或自动删除
**原因**：循环检测阻止了连接
**解决**：检查节点间的依赖关系，避免形成循环

#### 文件上传失败

**问题**：拖拽文件后无法创建节点
**原因**：文件类型不支持或大小超限
**解决**：验证文件类型和大小限制

#### AI拖拽功能异常

**问题**：节点拖拽到AI面板无响应
**原因**：AI面板未正确初始化或DOM元素不存在
**解决**：检查AI面板的data-ai-panel-dropzone属性和初始化状态

**章节来源**
- [page.tsx:285-510](file://frontend/src/app/theater/[id]/page.tsx#L285-L510)
- [useCanvasStore.ts:238-254](file://frontend/src/store/useCanvasStore.ts#L238-L254)
- [useNodeDragToAI.ts:28-84](file://frontend/src/app/theater/[id]/hooks/useNodeDragToAI.ts#L28-L84)

## 结论

Canvas Drag Drop Enhancements 提供了一个完整、高性能的画布拖拽解决方案。**更新** 新增的AI拖拽增强功能进一步提升了用户体验，实现了画布节点与AI助手的无缝集成。

关键优势包括：
- **易用性**：直观的拖拽界面和丰富的节点类型
- **性能**：优化的渲染和状态管理
- **可靠性**：完善的错误处理和数据验证
- **扩展性**：清晰的架构便于功能扩展
- **智能化**：AI助手拖拽集成，支持智能创作和编辑
- **可视化**：节点预览卡片提供直观的拖拽反馈

未来可以考虑的功能增强：
- 更多节点类型的扩展
- 批量操作支持
- 更高级的对齐和布局算法
- 实时协作功能
- AI拖拽的更多应用场景