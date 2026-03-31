# 画布文件类型检测

<cite>
**本文档引用的文件**
- [frontend/src/app/theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)
- [backend/routers/media.py](file://backend/routers/media.py)
- [frontend/src/components/canvas/VideoNode.tsx](file://frontend/src/components/canvas/VideoNode.tsx)
- [frontend/src/store/useCanvasStore.ts](file://frontend/src/store/useCanvasStore.ts)
- [frontend/src/components/resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)
- [backend/models.py](file://backend/models.py)
- [frontend/src/components/canvas/CharacterNode.tsx](file://frontend/src/components/canvas/CharacterNode.tsx)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)

## 简介

本文档详细分析了 Infinite Game 项目中的画布文件类型检测系统。该系统实现了完整的前端文件类型识别、后端文件处理和资源管理功能，支持文本、图片、视频和音频四种主要文件类型的自动检测和处理。

系统采用前后端分离的设计模式，前端负责文件类型识别和用户界面交互，后端负责文件存储、类型验证和资源管理。通过统一的文件类型检测机制，确保了文件处理的一致性和可靠性。

## 项目结构

画布文件类型检测功能分布在前端和后端两个主要部分：

```mermaid
graph TB
subgraph "前端层"
A[Canvas 页面<br/>文件拖拽处理]
B[VideoNode 组件<br/>视频文件处理]
C[CharacterNode 组件<br/>图片文件处理]
D[AssetCard 组件<br/>资源预览]
E[Canvas Store<br/>状态管理]
end
subgraph "后端层"
F[Media Router<br/>文件上传处理]
G[Models<br/>数据库模型]
H[文件系统<br/>存储管理]
end
A --> F
B --> F
C --> F
D --> F
E --> A
F --> G
F --> H
```

**图表来源**
- [frontend/src/app/theater/[id]/page.tsx:1-866](file://frontend/src/app/theater/[id]/page.tsx#L1-L866)
- [backend/routers/media.py:1-436](file://backend/routers/media.py#L1-L436)

**章节来源**
- [frontend/src/app/theater/[id]/page.tsx:277-293](file://frontend/src/app/theater/[id]/page.tsx#L277-L293)
- [backend/routers/media.py:29-436](file://backend/routers/media.py#L29-L436)

## 核心组件

### 文件类型检测映射表

系统使用统一的文件类型检测映射表来识别不同类型的文件：

| 文件类型 | 支持的 MIME 类型 | 支持的扩展名 |
|---------|-----------------|-------------|
| 文本 | text/plain, text/markdown, application/pdf | .txt, .md, .markdown, .pdf |
| 图片 | image/png, image/jpeg, image/jpg, image/webp, image/gif | .png, .jpg, .jpeg, .webp, .gif |
| 视频 | video/mp4, video/webm, video/ogg, video/avi, video/quicktime, video/x-ms-wmv, video/x-flv | .mp4, .webm, .avi, .mov, .wmv, .flv, .mkv |
| 音频 | audio/mpeg, audio/wav, audio/ogg, audio/mp3, audio/flac, audio/aac, audio/x-m4a | .mp3, .wav, .ogg, .flac, .aac, .m4a |

### 文件上传处理流程

```mermaid
sequenceDiagram
participant U as 用户
participant F as 前端页面
participant V as VideoNode组件
participant C as CharacterNode组件
participant R as 后端路由
participant M as 数据库模型
U->>F : 拖拽文件到画布
F->>F : getFileType() 检测文件类型
F->>V : 创建视频节点
F->>C : 创建图片节点
V->>R : POST /api/media/upload
C->>R : POST /api/media/upload
R->>R : 验证文件类型和大小
R->>M : 创建Asset记录
R-->>V : 返回文件URL
R-->>C : 返回文件URL
V->>V : 更新节点数据
C->>C : 更新节点数据
```

**图表来源**
- [frontend/src/app/theater/[id]/page.tsx:306-327](file://frontend/src/app/theater/[id]/page.tsx#L306-L327)
- [backend/routers/media.py:94-147](file://backend/routers/media.py#L94-L147)

**章节来源**
- [frontend/src/app/theater/[id]/page.tsx:277-293](file://frontend/src/app/theater/[id]/page.tsx#L277-L293)
- [backend/routers/media.py:39-76](file://backend/routers/media.py#L39-L76)

## 架构概览

### 前端架构设计

前端采用 React Hooks 和 Zustand 状态管理，实现了高效的文件类型检测和处理机制：

```mermaid
classDiagram
class CanvasPage {
+FILE_TYPE_MATCHERS : Array
+getFileType(file) : string
+createNodeFromFile(file, position)
+uploadFile(file) : Promise
+onDragOver(event)
+onDrop(event)
}
class VideoNode {
+handleFileChange(event)
+handleUploadClick()
+updateNodeData()
}
class CharacterNode {
+handleFileChange(event)
+handleUploadClick()
+updateNodeData()
}
class CanvasStore {
+nodes : Array
+edges : Array
+addNode(node)
+updateNodeData(id, data)
+deleteNode(id)
}
CanvasPage --> VideoNode : 创建
CanvasPage --> CharacterNode : 创建
CanvasPage --> CanvasStore : 状态管理
VideoNode --> CanvasStore : 更新状态
CharacterNode --> CanvasStore : 更新状态
```

**图表来源**
- [frontend/src/app/theater/[id]/page.tsx:277-510](file://frontend/src/app/theater/[id]/page.tsx#L277-L510)
- [frontend/src/store/useCanvasStore.ts:60-114](file://frontend/src/store/useCanvasStore.ts#L60-L114)

### 后端架构设计

后端采用 FastAPI 框架，实现了安全的文件处理和存储机制：

```mermaid
flowchart TD
A[文件上传请求] --> B[验证文件类型]
B --> C{类型检查}
C --> |支持类型| D[检查文件大小]
C --> |不支持类型| E[返回错误]
D --> F{大小检查}
F --> |超出限制| G[返回错误]
F --> |符合要求| H[保存文件到磁盘]
H --> I[创建数据库记录]
I --> J[返回成功响应]
E --> K[400 错误]
G --> L[413 错误]
```

**图表来源**
- [backend/routers/media.py:94-147](file://backend/routers/media.py#L94-L147)
- [backend/models.py:131-149](file://backend/models.py#L131-L149)

**章节来源**
- [frontend/src/app/theater/[id]/page.tsx:512-653](file://frontend/src/app/theater/[id]/page.tsx#L512-L653)
- [backend/routers/media.py:94-147](file://backend/routers/media.py#L94-L147)

## 详细组件分析

### 文件类型检测组件

#### 前端文件类型检测

前端实现了基于映射表的文件类型检测机制，支持 MIME 类型和文件扩展名双重验证：

```mermaid
flowchart TD
A[文件对象] --> B[提取 MIME 类型]
A --> C[提取文件名]
B --> D[MIME 类型匹配]
C --> E[扩展名匹配]
D --> F{匹配结果}
E --> F
F --> |找到匹配| G[返回文件类型]
F --> |无匹配| H[返回 null]
```

**图表来源**
- [frontend/src/app/theater/[id]/page.tsx:285-293](file://frontend/src/app/theater/[id]/page.tsx#L285-L293)

#### 后端文件类型验证

后端实现了更严格的文件类型验证机制，包括 MIME 类型映射和扩展名检查：

**章节来源**
- [frontend/src/app/theater/[id]/page.tsx:277-293](file://frontend/src/app/theater/[id]/page.tsx#L277-L293)
- [backend/routers/media.py:41-64](file://backend/routers/media.py#L41-L64)

### 文件上传处理组件

#### 视频文件处理

VideoNode 组件专门处理视频文件的上传和显示：

```mermaid
sequenceDiagram
participant U as 用户
participant VN as VideoNode
participant FS as 文件系统
participant AS as Asset系统
U->>VN : 选择视频文件
VN->>VN : 验证文件类型和大小
VN->>FS : 创建本地预览URL
VN->>AS : 上传到服务器
AS->>AS : 验证文件类型
AS->>AS : 检查文件大小限制
AS->>FS : 保存到磁盘
AS->>AS : 创建数据库记录
AS-->>VN : 返回文件URL
VN->>VN : 更新节点状态
```

**图表来源**
- [frontend/src/components/canvas/VideoNode.tsx:107-185](file://frontend/src/components/canvas/VideoNode.tsx#L107-L185)
- [backend/routers/media.py:94-147](file://backend/routers/media.py#L94-L147)

#### 图片文件处理

CharacterNode 组件处理图片文件的上传和预览：

**章节来源**
- [frontend/src/components/canvas/VideoNode.tsx:107-185](file://frontend/src/components/canvas/VideoNode.tsx#L107-L185)
- [frontend/src/components/canvas/CharacterNode.tsx:126-204](file://frontend/src/components/canvas/CharacterNode.tsx#L126-L204)

### 资源管理系统

#### 资源卡片组件

AssetCard 组件提供了统一的资源预览和管理界面：

```mermaid
classDiagram
class AssetCard {
+asset : AssetItem
+onPreview(asset)
+onRename(asset)
+onReplace(asset)
+onDelete(asset)
-PREVIEW_RENDERERS : Record
-formatSize(bytes) : string
}
class ImagePreview {
+url : string
+render() : JSX.Element
}
class VideoPreview {
+url : string
+render() : JSX.Element
}
class AudioPreview {
+url : string
+render() : JSX.Element
}
AssetCard --> ImagePreview : 渲染图片
AssetCard --> VideoPreview : 渲染视频
AssetCard --> AudioPreview : 渲染音频
```

**图表来源**
- [frontend/src/components/resources/AssetCard.tsx:75-131](file://frontend/src/components/resources/AssetCard.tsx#L75-L131)

**章节来源**
- [frontend/src/components/resources/AssetCard.tsx:31-69](file://frontend/src/components/resources/AssetCard.tsx#L31-L69)
- [frontend/src/components/resources/AssetCard.tsx:83-131](file://frontend/src/components/resources/AssetCard.tsx#L83-L131)

## 依赖关系分析

### 技术栈依赖

```mermaid
graph TB
subgraph "前端依赖"
A[React 18+]
B[@xyflow/react]
C[Zustand]
D[Lucide Icons]
E[Tailwind CSS]
end
subgraph "后端依赖"
F[FastAPI]
G[SQLAlchemy]
H[UUID]
I[Pydantic]
end
subgraph "数据库"
J[PostgreSQL]
K[SQLite]
end
A --> B
A --> C
A --> D
F --> G
F --> I
G --> J
G --> K
```

### 文件类型处理流程

```mermaid
flowchart LR
A[用户拖拽文件] --> B[前端类型检测]
B --> C{类型判断}
C --> |文本| D[创建文本节点]
C --> |图片| E[创建图片节点]
C --> |视频| F[创建视频节点]
C --> |音频| G[创建音频节点]
D --> H[文件上传]
E --> H
F --> H
G --> H
H --> I[后端验证]
I --> J[数据库存储]
J --> K[返回URL]
K --> L[更新节点状态]
```

**图表来源**
- [frontend/src/app/theater/[id]/page.tsx:330-510](file://frontend/src/app/theater/[id]/page.tsx#L330-L510)
- [backend/routers/media.py:94-147](file://backend/routers/media.py#L94-L147)

**章节来源**
- [frontend/src/store/useCanvasStore.ts:185-540](file://frontend/src/store/useCanvasStore.ts#L185-L540)
- [backend/models.py:131-149](file://backend/models.py#L131-L149)

## 性能考虑

### 前端性能优化

1. **文件类型检测缓存**：使用映射表避免重复的字符串匹配操作
2. **本地预览**：使用 Blob URL 实现快速文件预览
3. **批量处理**：支持多文件拖拽和批量上传
4. **内存管理**：及时清理 Blob URL 和事件监听器

### 后端性能优化

1. **异步处理**：使用异步数据库操作避免阻塞
2. **文件大小限制**：防止大文件占用过多存储空间
3. **缓存策略**：对常用文件类型进行缓存
4. **并发控制**：限制同时上传的文件数量

## 故障排除指南

### 常见问题及解决方案

#### 文件类型识别失败

**问题描述**：文件无法正确识别为支持的类型

**可能原因**：
1. MIME 类型为空或不支持
2. 文件扩展名不在支持列表中
3. 文件头信息损坏

**解决方案**：
1. 检查浏览器是否正确设置 MIME 类型
2. 确认文件扩展名格式正确
3. 重新下载或修复文件

#### 文件上传失败

**问题描述**：文件上传过程中出现错误

**可能原因**：
1. 文件大小超出限制
2. 文件类型不受支持
3. 网络连接问题
4. 服务器存储空间不足

**解决方案**：
1. 检查文件大小是否超过限制
2. 确认文件类型在支持范围内
3. 检查网络连接状态
4. 联系系统管理员检查存储空间

#### 资源预览问题

**问题描述**：上传的文件无法正确预览

**可能原因**：
1. 文件格式不支持
2. 文件损坏
3. 浏览器兼容性问题

**解决方案**：
1. 确认文件格式在支持列表中
2. 重新上传文件
3. 更换浏览器或更新版本

**章节来源**
- [frontend/src/app/theater/[id]/page.tsx:413-425](file://frontend/src/app/theater/[id]/page.tsx#L413-L425)
- [backend/routers/media.py:116-122](file://backend/routers/media.py#L116-L122)

## 结论

画布文件类型检测系统通过前后端协同设计，实现了高效、可靠的文件处理机制。系统的主要优势包括：

1. **统一的文件类型检测**：前后端使用一致的检测标准，确保处理逻辑的一致性
2. **灵活的扩展性**：通过映射表机制，可以轻松添加新的文件类型支持
3. **完善的错误处理**：提供了全面的错误检测和用户友好的错误提示
4. **良好的性能表现**：通过异步处理和缓存机制，保证了系统的响应速度

该系统为 Infinite Game 项目提供了坚实的文件处理基础，支持用户在画布上创建各种类型的媒体内容，为后续的功能扩展奠定了良好的技术基础。