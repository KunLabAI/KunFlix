# UI组件库

<cite>
**本文引用的文件**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [card.tsx](file://frontend/src/components/ui/card.tsx)
- [tabs.tsx](file://frontend/src/components/ui/tabs.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [dropdown-menu.tsx](file://frontend/src/components/ui/dropdown-menu.tsx)
- [textarea.tsx](file://frontend/src/components/ui/textarea.tsx)
- [slider.tsx](file://frontend/src/components/ui/slider.tsx)
- [sheet.tsx](file://frontend/src/components/ui/sheet.tsx)
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)
- [login/page.tsx](file://frontend/src/app/login/page.tsx)
- [resources/page.tsx](file://frontend/src/app/resources/page.tsx)
- [theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)
- [home/TheaterCard.tsx](file://frontend/src/components/home/TheaterCard.tsx)
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)
- [resources/AssetEditDialog.tsx](file://frontend/src/components/resources/AssetEditDialog.tsx)
- [resources/AssetDeleteDialog.tsx](file://frontend/src/components/resources/AssetDeleteDialog.tsx)
- [resources/AssetPreviewDialog.tsx](file://frontend/src/components/resources/AssetPreviewDialog.tsx)
</cite>

## 更新摘要
**所做更改**
- 新增确认对话框组件（ConfirmDialog）和输入对话框组件（InputDialog）的详细文档
- 更新对话框组件章节，包含基础对话框和确认对话框两个层次
- 新增前端组件系统增强部分，涵盖登录页面、Home页面组件、资源页面等
- 更新组件详解章节，补充确认对话框、输入对话框、资源卡片等新组件
- 新增前端组件系统架构图和组件关系图
- 更新依赖关系分析，反映新增组件的依赖关系

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [组件详解](#组件详解)
6. [前端组件系统增强](#前端组件系统增强)
7. [依赖关系分析](#依赖关系分析)
8. [性能与可访问性](#性能与可访问性)
9. [故障排查指南](#故障排查指南)
10. [结论](#结论)
11. [附录：使用示例与最佳实践](#附录使用示例与最佳实践)

## 简介
本文件为 KunFlix 的 UI 组件库文档，聚焦于基于 Ant Design 设计体系的组件实现与使用说明。内容覆盖基础组件（按钮、输入框、头像等）、表单组件（表单容器、选择器等）、反馈组件（警示、对话框、提示条等）以及布局组件（卡片、标签页等）。本次更新确认对话框组件已添加到UI组件库中，同时前端组件系统得到显著增强，包括登录页面、Home页面组件、资源页面等的改进。

## 项目结构
UI 组件主要位于前端与后台管理端两处：
- 前端组件库：位于 frontend/src/components/ui，采用 Radix UI 作为底层交互抽象，结合 Tailwind CSS 类名工具与 class-variance-authority 实现变体与主题。
- 后台管理组件库：位于 backend/admin/src/components/ui，同样以 Radix UI 为基础，配合 react-hook-form 实现表单体系。
- 前端页面组件：位于 frontend/src/app 和 frontend/src/components 下，包含完整的页面级组件和业务组件。

```mermaid
graph TB
subgraph "前端组件库"
F_BTN["button.tsx"]
F_INP["input.tsx"]
F_AV["avatar.tsx"]
F_CARD["card.tsx"]
F_TABS["tabs.tsx"]
F_DLG["dialog.tsx"]
F_CDlg["confirm-dialog.tsx"]
F_DROP["dropdown-menu.tsx"]
F_TXT["textarea.tsx"]
F_SLD["slider.tsx"]
F_SHT["sheet.tsx"]
end
subgraph "后台管理组件库"
B_FORM["form.tsx"]
B_SEL["select.tsx"]
B_ALERT["alert.tsx"]
B_TOAST["toast.tsx"]
B_AD["alert-dialog.tsx"]
end
subgraph "前端页面组件"
LOGIN["login/page.tsx"]
RES["resources/page.tsx"]
THEATER["theater/[id]/page.tsx"]
HOME["home/TheaterCard.tsx"]
ASSET["resources/AssetCard.tsx"]
end
F_BTN --> |"使用"| F_BTN
F_INP --> |"使用"| F_INP
F_AV --> |"使用"| F_AV
F_CARD --> |"使用"| F_CARD
F_TABS --> |"使用"| F_TABS
F_DLG --> |"使用"| F_DLG
F_CDlg --> |"确认对话框"| F_CDlg
LOGIN --> |"登录页面"| LOGIN
RES --> |"资源页面"| RES
HOME --> |"剧场卡片"| HOME
ASSET --> |"资源卡片"| ASSET
```

**图表来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [card.tsx](file://frontend/src/components/ui/card.tsx)
- [tabs.tsx](file://frontend/src/components/ui/tabs.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [login/page.tsx](file://frontend/src/app/login/page.tsx)
- [resources/page.tsx](file://frontend/src/app/resources/page.tsx)
- [theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)
- [home/TheaterCard.tsx](file://frontend/src/components/home/TheaterCard.tsx)
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)

**章节来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [card.tsx](file://frontend/src/components/ui/card.tsx)
- [tabs.tsx](file://frontend/src/components/ui/tabs.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)
- [login/page.tsx](file://frontend/src/app/login/page.tsx)
- [resources/page.tsx](file://frontend/src/app/resources/page.tsx)
- [theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)
- [home/TheaterCard.tsx](file://frontend/src/components/home/TheaterCard.tsx)
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)

## 核心组件
本节概述各类型组件的职责与通用能力：
- 基础组件：提供语义化与可复用的 UI 原子能力，如按钮、输入框、头像等，强调变体与尺寸控制、可组合渲染与无障碍属性。
- 表单组件：围绕 react-hook-form 构建，提供表单项上下文、标签、控制域、描述与错误信息的统一接入。
- 反馈组件：用于信息提示与用户确认，包含警示框、对话框、提示条等，强调可访问性与动画过渡。
- 布局组件：用于页面结构组织，如卡片、标签页等，强调语义化结构与响应式布局。
- 对话框组件：包含基础对话框和确认对话框两个层次，提供用户确认、输入收集等功能。

**章节来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [card.tsx](file://frontend/src/components/ui/card.tsx)
- [tabs.tsx](file://frontend/src/components/ui/tabs.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)

## 架构总览
组件库整体采用"变体驱动 + 上下文注入 + 组合模式"的架构：
- 变体与类名：通过 class-variance-authority 定义组件变体与默认值，结合 cn 工具合并类名，实现主题与尺寸的灵活切换。
- 上下文与组合：表单组件通过 React Context 注入字段上下文，使标签、控制域、描述与错误信息形成统一的可访问性链路。
- 原子与复合：基础组件多为原子级封装，反馈与布局组件为复合组件，内部组合多个原子组件并提供行为逻辑。
- 对话框层次：基础对话框提供通用的模态交互，确认对话框和输入对话框提供特定的业务场景解决方案。

```mermaid
graph TB
subgraph "变体与样式"
CVA["class-variance-authority<br/>定义变体与默认值"]
CN["cn 工具<br/>合并类名"]
end
subgraph "上下文与表单"
RHF["react-hook-form<br/>表单上下文"]
CTX["FormField/FormItem<br/>字段上下文"]
end
subgraph "Radix UI 抽象"
RADIX["Radix UI 原子组件<br/>触发器、内容、图标等"]
end
subgraph "对话框层次"
BASE_DLG["基础对话框<br/>Dialog/DialogContent"]
CONFIRM_DLG["确认对话框<br/>ConfirmDialog"]
INPUT_DLG["输入对话框<br/>InputDialog"]
end
BTN["Button"] --> CVA
BTN --> CN
INP["Input"] --> CN
AV["Avatar"] --> RADIX
DLG["Dialog"] --> RADIX
CDLG["ConfirmDialog"] --> BASE_DLG
IDLG["InputDialog"] --> BASE_DLG
TABS["Tabs"] --> |"内部状态与克隆子元素"| TABS
FORM["Form/FormLabel/FormControl"] --> RHF
FORM --> CTX
SEL["Select"] --> RADIX
ALERT["Alert"] --> CVA
TOAST["Toast"] --> RADIX
AD["AlertDialog"] --> RADIX
```

**图表来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)

## 组件详解

### 基础组件

#### 按钮 Button
- 属性接口
  - 继承原生按钮属性
  - 变体 variant：default、destructive、outline、secondary、ghost、link
  - 尺寸 size：default、sm、lg、icon
  - asChild：是否将渲染委托给子元素（通过 Slot）
- 事件处理
  - 支持原生按钮事件；asChild 模式下由子元素接管事件
- 样式与主题
  - 使用变体定义前景/背景色与悬停态；尺寸控制高度与内边距
  - 通过 cn 合并外部类名，支持主题覆盖
- 无障碍与可访问性
  - 默认保持原生按钮语义；支持聚焦环与禁用态
- 示例路径
  - [button.tsx](file://frontend/src/components/ui/button.tsx)

```mermaid
classDiagram
class Button {
+variant : "default"|"destructive"|"outline"|"secondary"|"ghost"|"link"
+size : "default"|"sm"|"lg"|"icon"
+asChild : boolean
+onClick(event)
+onFocus(event)
+onBlur(event)
}
class buttonVariants {
+apply(variant,size,className) string
}
Button --> buttonVariants : "使用变体"
```

**图表来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)

**章节来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)

#### 输入框 Input
- 属性接口
  - 继承原生 input 属性
  - 支持类型 type 与类名覆盖
- 事件处理
  - 支持 onChange、onFocus、onBlur 等原生事件
- 样式与主题
  - 统一圆角、边框、占位符颜色与聚焦态环
  - 移动端与桌面端文本大小差异化
- 无障碍与可访问性
  - 与表单标签配合时，建议通过 FormLabel 与 FormControl 提供可访问性链路
- 示例路径
  - [input.tsx](file://frontend/src/components/ui/input.tsx)

**章节来源**
- [input.tsx](file://frontend/src/components/ui/input.tsx)

#### 头像 Avatar
- 组件构成
  - Avatar：根容器，控制尺寸与裁剪
  - AvatarImage：图片层，填充容器
  - AvatarFallback：回退层，占位或默认头像
- 事件处理
  - 图片加载失败时自动切换到回退层
- 样式与主题
  - 圆形裁剪、尺寸一致、回退层浅色背景
- 无障碍与可访问性
  - 建议在不可见场景提供替代文本（如通过父容器语义）
- 示例路径
  - [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)

```mermaid
classDiagram
class Avatar {
+className : string
}
class AvatarImage {
+className : string
}
class AvatarFallback {
+className : string
}
Avatar --> AvatarImage : "包含"
Avatar --> AvatarFallback : "包含"
```

**图表来源**
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)

**章节来源**
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)

### 表单组件

#### 表单 Form 体系
- 组成
  - Form：react-hook-form 的 FormProvider 包装
  - FormField：将 Controller 与字段上下文结合
  - FormItem：为字段生成唯一 ID 并组织布局
  - FormLabel：绑定到对应字段 ID，错误态高亮
  - FormControl：注入 aria-* 属性，连接描述与错误
  - FormDescription：辅助说明文本
  - FormMessage：错误信息展示
- 无障碍与可访问性
  - 自动注入 aria-describedby、aria-invalid，确保屏幕阅读器可读
- 示例路径
  - [form.tsx](file://backend/admin/src/components/ui/form.tsx)

```mermaid
sequenceDiagram
participant U as "用户"
participant L as "FormLabel"
participant C as "FormControl"
participant D as "FormDescription"
participant M as "FormMessage"
U->>L : 点击标签
L->>C : 设置htmlFor关联字段ID
C->>D : 注入aria-describedby
C->>M : 注入aria-invalid
M-->>U : 显示错误信息
```

**图表来源**
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)

**章节来源**
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)

#### 选择器 Select
- 组成
  - Select：根容器
  - SelectTrigger：触发器，含下拉图标
  - SelectContent：弹出层，含滚动按钮与视口
  - SelectItem：选项项，含选中指示器
  - SelectLabel、SelectSeparator、SelectScrollUpButton、SelectScrollDownButton
- 无障碍与可访问性
  - 使用 Portal 渲染，支持键盘导航与焦点管理
- 示例路径
  - [select.tsx](file://backend/admin/src/components/ui/select.tsx)

```mermaid
flowchart TD
Start(["打开选择器"]) --> Trigger["点击触发器"]
Trigger --> Content["渲染弹出层"]
Content --> Viewport["显示选项列表"]
Viewport --> Item["点击选项项"]
Item --> Close["关闭并更新值"]
Close --> End(["完成"])
```

**图表来源**
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)

**章节来源**
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)

### 反馈组件

#### 警示 Alert
- 组件构成
  - Alert：容器，支持 default 与 destructive 两种变体
  - AlertTitle：标题
  - AlertDescription：描述文本
- 无障碍与可访问性
  - 容器设置 role="alert"，提升可访问性
- 示例路径
  - [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)

**章节来源**
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)

#### 对话框 Dialog 体系
- 组件层次
  - 基础对话框：Dialog、DialogContent、DialogHeader、DialogFooter、DialogTitle、DialogDescription
  - 确认对话框：ConfirmDialog，提供删除、编辑、警告等类型的确认对话框
  - 输入对话框：InputDialog，提供文本输入的确认对话框
- 组成与特性
  - 基础对话框：提供模态遮罩、居中内容区、关闭按钮等标准模态交互
  - 确认对话框：内置图标分类、颜色主题、加载状态处理
  - 输入对话框：支持文本输入验证、回车确认、ESC取消
- 无障碍与可访问性
  - 关闭按钮包含 sr-only 文本，确保可读
  - 内容区支持键盘焦点陷阱与 ESC 关闭
  - 提供 Promise 风格的异步处理接口
- 示例路径
  - [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
  - [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)

```mermaid
sequenceDiagram
participant U as "用户"
participant T as "DialogTrigger"
participant O as "DialogOverlay"
participant C as "DialogContent"
participant X as "DialogClose"
U->>T : 点击触发
T->>O : 打开遮罩
O->>C : 渲染内容
U->>X : 点击关闭
X->>O : 关闭遮罩
O-->>U : 返回
```

**图表来源**
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)

**章节来源**
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)

#### 提示条 Toast
- 组件构成
  - ToastProvider、ToastViewport：提供者与视口
  - Toast：提示条，支持 default 与 destructive
  - ToastTitle、ToastDescription：标题与描述
  - ToastAction、ToastClose：动作按钮与关闭按钮
- 无障碍与可访问性
  - 提供可滑动关闭与可访问性属性
- 示例路径
  - [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)

**章节来源**
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)

#### 警示对话框 AlertDialog
- 组件构成
  - AlertDialog：根容器，提供更强烈的用户确认场景
  - AlertDialogTrigger、AlertDialogPortal、AlertDialogOverlay
  - AlertDialogContent：内容区，含标题、描述、操作按钮
  - AlertDialogAction、AlertDialogCancel：确认与取消按钮
- 无障碍与可访问性
  - 强制焦点陷阱，防止用户意外关闭
  - 提供明确的危险操作标识
- 示例路径
  - [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)

**章节来源**
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)

### 布局组件

#### 卡片 Card
- 组件构成
  - Card：卡片容器
  - CardHeader、CardTitle、CardDescription、CardContent、CardFooter
- 无障碍与可访问性
  - 语义化结构，建议在标题层级上遵循文档语义
- 示例路径
  - [card.tsx](file://frontend/src/components/ui/card.tsx)

**章节来源**
- [card.tsx](file://frontend/src/components/ui/card.tsx)

#### 标签页 Tabs
- 组件构成
  - Tabs：根容器，维护当前激活标签
  - TabsList：标签列表
  - TabsTrigger：标签触发器，支持受控/非受控
  - TabsContent：内容区，仅渲染当前激活项
- 事件处理
  - 触发器点击后通过回调更新激活项
- 无障碍与可访问性
  - 通过 data-active-tab 标记当前项，便于样式与可访问性联动
- 示例路径
  - [tabs.tsx](file://frontend/src/components/ui/tabs.tsx)

```mermaid
flowchart TD
Init["初始化 Tabs"] --> SetDefault["设置默认值或受控值"]
SetDefault --> Render["渲染 TabsList 与 TabsContent"]
Render --> Click["点击 TabsTrigger"]
Click --> Update["更新激活标签"]
Update --> Render
```

**图表来源**
- [tabs.tsx](file://frontend/src/components/ui/tabs.tsx)

**章节来源**
- [tabs.tsx](file://frontend/src/components/ui/tabs.tsx)

### 交互组件

#### 下拉菜单 DropdownMenu
- 组件构成
  - DropdownMenu：根容器
  - DropdownMenuTrigger：触发器
  - DropdownMenuContent：内容区，支持对齐与定位
  - DropdownMenuItem：菜单项，支持分隔符
- 无障碍与可访问性
  - 支持键盘导航与焦点管理
  - 提供受控/非受控两种模式
- 示例路径
  - [dropdown-menu.tsx](file://frontend/src/components/ui/dropdown-menu.tsx)

**章节来源**
- [dropdown-menu.tsx](file://frontend/src/components/ui/dropdown-menu.tsx)

#### 文本域 Textarea
- 组件构成
  - Textarea：多行文本输入框
  - 支持自动调整高度、禁用态、只读态
- 无障碍与可访问性
  - 保持原生 textarea 的可访问性特性
- 示例路径
  - [textarea.tsx](file://frontend/src/components/ui/textarea.tsx)

**章节来源**
- [textarea.tsx](file://frontend/src/components/ui/textarea.tsx)

#### 滑块 Slider
- 组件构成
  - Slider：数值范围选择器
  - 支持连续值选择、步进控制、禁用态
- 无障碍与可访问性
  - 提供键盘控制与屏幕阅读器支持
- 示例路径
  - [slider.tsx](file://frontend/src/components/ui/slider.tsx)

**章节来源**
- [slider.tsx](file://frontend/src/components/ui/slider.tsx)

#### 模态抽屉 Sheet
- 组件构成
  - Sheet：从边缘滑出的模态容器
  - 支持顶部、底部、左侧、右侧滑出
  - SheetTrigger、SheetContent、SheetHeader、SheetFooter
- 无障碍与可访问性
  - 提供焦点陷阱与 ESC 关闭
- 示例路径
  - [sheet.tsx](file://frontend/src/components/ui/sheet.tsx)

**章节来源**
- [sheet.tsx](file://frontend/src/components/ui/sheet.tsx)

## 前端组件系统增强

### 登录页面组件
前端组件系统得到了显著增强，特别是在登录页面组件方面：

#### 登录页面 LoginPage
- 功能特性
  - 支持登录/注册双模式切换
  - 基于 Ant Design 的 App 组件提供消息提示
  - 集成 Framer Motion 实现流畅的动画效果
  - 完整的表单验证与错误处理
- 组件架构
  - 左右分屏设计：品牌展示区 + 表单登录区
  - 响应式布局：移动端与桌面端差异化设计
  - 动画系统：使用 Framer Motion 实现页面级动画
- 交互流程
  - 表单字段动态生成与验证
  - 密码可见性切换
  - 加载状态管理与错误提示

**章节来源**
- [login/page.tsx](file://frontend/src/app/login/page.tsx)

### Home 页面组件
Home 页面组件提供了丰富的剧场管理功能：

#### 剧场卡片 TheaterCard
- 功能特性
  - 支持多种状态显示（草稿、已发布、已归档）
  - 自动从画布节点提取背景图片/视频
  - 集成确认对话框与输入对话框
  - 支持重命名、复制、删除等操作
- 组件设计
  - 响应式卡片布局
  - 悬停动画效果
  - 状态徽章与元信息展示
- 交互模式
  - 下拉菜单提供操作选项
  - 对话框组件提供确认与输入功能

**章节来源**
- [home/TheaterCard.tsx](file://frontend/src/components/home/TheaterCard.tsx)

### 资源页面组件
资源页面提供了完整的资源管理功能：

#### 资源卡片 AssetCard
- 功能特性
  - 支持多种文件类型预览（图片、视频、音频）
  - 网格视图与列表视图切换
  - 文件大小格式化与时间显示
  - 预览、重命名、替换、删除操作
- 组件架构
  - 预览渲染器映射表
  - 文件类型图标与颜色主题
  - 悬停效果与渐变覆盖
- 交互设计
  - 点击预览与操作菜单
  - 响应式布局适配

**章节来源**
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)

#### 资源对话框组件
资源页面配套提供了完整的对话框组件：

##### 资源预览对话框 AssetPreviewDialog
- 功能特性
  - 支持全屏预览图片、视频、音频
  - 下载功能与关闭按钮
  - 文件信息显示
- 组件设计
  - 无边框对话框设计
  - 透明背景与模糊效果
  - 响应式内容布局

**章节来源**
- [resources/AssetPreviewDialog.tsx](file://frontend/src/components/resources/AssetPreviewDialog.tsx)

##### 资源编辑对话框 AssetEditDialog
- 功能特性
  - 重命名对话框：文本输入验证
  - 替换文件对话框：文件选择与上传
  - 加载状态管理
- 组件设计
  - Promise 风格的异步处理
  - 条件渲染不同的表单字段
  - 错误处理与状态同步

**章节来源**
- [resources/AssetEditDialog.tsx](file://frontend/src/components/resources/AssetEditDialog.tsx)

##### 资源删除对话框 AssetDeleteDialog
- 功能特性
  - 危险操作确认
  - 确认删除的视觉强调
  - 加载状态与错误处理
- 组件设计
  - 红色主题的危险操作样式
  - 文件名称的醒目显示
  - 简洁的确认流程

**章节来源**
- [resources/AssetDeleteDialog.tsx](file://frontend/src/components/resources/AssetDeleteDialog.tsx)

### 剧场页面组件
剧场页面提供了可视化的创作环境：

#### 剧场页面 InfiniteCanvas
- 功能特性
  - 基于 React Flow 的可视化画布
  - 多种节点类型支持（文本、图片、视频、故事板）
  - 文件拖拽上传与自动布局
  - 撤销/重做与自动保存
- 组件架构
  - 节点类型注册与边类型定义
  - 拖拽事件处理与文件类型检测
  - 对齐吸附与 AI 辅助拖拽
- 交互设计
  - 快速添加菜单
  - 缩放控制与小地图
  - 状态指示器与保存状态

**章节来源**
- [theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)

## 依赖关系分析
- 组件间耦合
  - 基础组件之间低耦合，通过共享工具函数与变体系统协作
  - 表单组件强依赖 react-hook-form 与上下文机制
  - 反馈组件依赖 Radix UI 动画与可访问性 API
  - 对话框组件提供 Promise 风格的异步接口，增强用户体验
- 外部依赖
  - class-variance-authority：变体系统
  - @radix-ui/react-*：可访问性与动画抽象
  - lucide-react：图标
  - react-hook-form：表单状态与验证
  - framer-motion：动画系统
  - @xyflow/react：可视化画布

```mermaid
graph LR
BTN["Button"] --> CVA["class-variance-authority"]
INP["Input"] --> UTIL["cn 工具"]
AV["Avatar"] --> RADIX_AV["@radix-ui/react-avatar"]
DLG["Dialog"] --> RADIX_D["@radix-ui/react-dialog"]
CDLG["ConfirmDialog"] --> DLG
IDLG["InputDialog"] --> DLG
TABS["Tabs"] --> STATE["内部状态"]
FORM["Form"] --> RHF["react-hook-form"]
SEL["Select"] --> RADIX_S["@radix-ui/react-select"]
ALERT["Alert"] --> CVA
TOAST["Toast"] --> RADIX_T["@radix-ui/react-toast"]
AD["AlertDialog"] --> RADIX_AD["@radix-ui/react-alert-dialog"]
LOGIN["LoginPage"] --> FM["Framer Motion"]
THEATER["InfiniteCanvas"] --> RF["@xyflow/react"]
ASSET["AssetCard"] --> DROP["DropdownMenu"]
```

**图表来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)
- [login/page.tsx](file://frontend/src/app/login/page.tsx)
- [theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)

**章节来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)
- [login/page.tsx](file://frontend/src/app/login/page.tsx)
- [theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)

## 性能与可访问性
- 性能
  - 变体与类名计算在组件外层完成，减少重复计算
  - Tabs 内容按需渲染，避免不必要的子树挂载
  - Dialog 与 Select 使用 Portal 减少 DOM 深度对布局的影响
  - 对话框组件使用 Promise 风格接口，避免阻塞主线程
  - 资源卡片使用懒加载与条件渲染，优化大列表性能
- 可访问性
  - 表单组件自动注入 aria-* 属性，确保屏幕阅读器可用
  - 对话框与提示条提供键盘关闭与焦点管理
  - 头像与按钮保持原生语义，避免破坏默认可访问性
  - 下拉菜单支持键盘导航与焦点陷阱
  - 资源预览对话框提供下载与关闭的键盘快捷键
- 响应式与跨浏览器
  - 组件样式使用相对单位与媒体查询，保证在不同设备上的一致表现
  - 通过 Radix UI 的动画与过渡，确保在现代浏览器中的流畅体验
  - 登录页面与资源页面提供移动端优化的响应式设计

## 故障排查指南
- 表单相关
  - 若 FormLabel 不生效，请检查是否包裹在 FormField 中
  - 若 FormControl 未显示错误，请确认字段已注册且存在错误对象
- 选择器相关
  - 若选项无法选中，请检查 SelectItem 是否在 SelectContent 内
  - 若滚动按钮无效，请确认 SelectContent 的 viewport 配置正确
- 对话框相关
  - 若遮罩点击无效，请确认 DialogOverlay 与 DialogPortal 正确嵌套
  - 若关闭按钮无提示，请检查 sr-only 文本是否可见
  - 若确认对话框无响应，请检查 Promise 回调是否正确处理
- 提示条相关
  - 若提示条不出现，请确认 ToastProvider 已在应用根部提供
  - 若滑动关闭无效，请检查 Radix UI 动画变量是否生效
- 资源管理相关
  - 若资源预览失败，请检查文件 URL 是否有效
  - 若资源上传失败，请检查文件类型与大小限制
  - 若资源删除确认无效，请检查对话框状态管理

**章节来源**
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)

## 结论
本组件库以 Ant Design 设计体系为蓝本，结合 Radix UI 的可访问性与 class-variance-authority 的变体系统，构建了高可组合、可定制、可扩展的 UI 基础设施。通过上下文与变体驱动的设计，组件在保持一致性的同时提供了足够的灵活性，满足从基础交互到复杂业务场景的需求。

本次更新确认对话框组件已添加到UI组件库中，同时前端组件系统得到显著增强，包括登录页面、Home页面组件、资源页面等的改进。这些增强不仅提升了用户体验，还为后续的功能扩展奠定了坚实的基础。

## 附录：使用示例与最佳实践
- 组合模式
  - 使用 Tabs 将多个内容面板组合，仅渲染当前激活项
  - 使用 Card 组织信息区块，配合 Header/Title/Description 提升可读性
  - 使用 ConfirmDialog 和 InputDialog 提供一致的用户确认体验
- 状态管理
  - 表单场景优先使用 react-hook-form 的受控/非受控模式，结合 FormItem 与 FormControl 管理字段状态
  - Tabs 支持受控与非受控两种模式，根据业务需要选择
  - 对话框组件使用 Promise 风格接口，简化异步处理逻辑
- 性能优化
  - 将昂贵的子树放入 TabsContent，避免一次性渲染
  - 使用 asChild 将 Button 渲染为链接或其他元素，减少额外 DOM
  - 资源卡片使用懒加载与条件渲染，优化大列表性能
  - 对话框组件使用 Portal 渲染，减少 DOM 深度影响
- 主题与样式
  - 通过变体参数快速切换主题风格，必要时使用外部类名覆盖
  - 使用 cn 合并类名，避免样式冲突
  - 对话框组件提供颜色主题映射，统一视觉风格
- 无障碍访问
  - 表单组件自动注入可访问性属性，确保屏幕阅读器可用
  - 对话框与提示条提供键盘操作与焦点管理
  - 下拉菜单支持键盘导航与焦点陷阱
  - 资源预览对话框提供下载与关闭的键盘快捷键
- 组件扩展
  - 基于现有对话框组件模式，可以扩展更多业务场景的确认对话框
  - 资源卡片的预览渲染器模式可以扩展支持更多文件类型
  - 剧场页面的节点类型注册模式可以扩展支持更多节点类型