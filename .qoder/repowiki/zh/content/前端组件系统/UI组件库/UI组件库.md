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
- [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)
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
- [utils.ts](file://frontend/src/lib/utils.ts)
- [index.ts](file://frontend/src/i18n/index.ts)
- [I18nProvider.tsx](file://frontend/src/i18n/I18nProvider.tsx)
- [LanguageSwitcher.tsx](file://frontend/src/components/LanguageSwitcher.tsx)
- [zh-CN.json](file://frontend/src/i18n/locales/zh-CN.json)
- [en-US.json](file://frontend/src/i18n/locales/en-US.json)
- [layout.tsx](file://frontend/src/app/layout.tsx)
- [home/TopBar.tsx](file://frontend/src/components/home/TopBar.tsx)
- [canvas/Sidebar.tsx](file://frontend/src/components/canvas/Sidebar.tsx)
</cite>

## 更新摘要
**所做更改**
- 新增TextEffect组件的详细说明和使用指南
- 更新基础组件章节，添加TextEffect组件的完整文档
- 添加TextEffect组件的属性接口、动画效果和使用示例
- 更新组件详解章节，完善基础组件的完整性

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [组件详解](#组件详解)
6. [国际化支持](#国际化支持)
7. [前端组件系统增强](#前端组件系统增强)
8. [依赖关系分析](#依赖关系分析)
9. [性能与可访问性](#性能与可访问性)
10. [故障排查指南](#故障排查指南)
11. [结论](#结论)
12. [附录：使用示例与最佳实践](#附录使用示例与最佳实践)

## 简介
本文件为 KunFlix 的 UI 组件库文档，聚焦于基于 Ant Design 设计体系的组件实现与使用说明。内容覆盖基础组件（按钮、输入框、头像、文本特效等）、表单组件（表单容器、选择器等）、反馈组件（警示、对话框、提示条等）以及布局组件（卡片、标签页等）。本次更新新增了完整的国际化支持系统，确保一致的多语言用户体验。

## 项目结构
UI 组件主要位于前端与后台管理端两处：
- 前端组件库：位于 frontend/src/components/ui，采用 Radix UI 作为底层交互抽象，结合 Tailwind CSS 类名工具与 class-variance-authority 实现变体与主题。
- 后台管理组件库：位于 backend/admin/src/components/ui，同样以 Radix UI 为基础，配合 react-hook-form 实现表单体系。
- 前端页面组件：位于 frontend/src/app 和 frontend/src/components 下，包含完整的页面级组件和业务组件。
- 国际化系统：位于 frontend/src/i18n，提供完整的多语言支持。

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
F_IDlg["input-dialog.tsx"]
F_DROP["dropdown-menu.tsx"]
F_TXT["textarea.tsx"]
F_SLD["slider.tsx"]
F_SHT["sheet.tsx"]
F_TEXTEFFECT["text-effect.tsx"]
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
ASSET_EDIT["resources/AssetEditDialog.tsx"]
ASSET_DELETE["resources/AssetDeleteDialog.tsx"]
ASSET_PREVIEW["resources/AssetPreviewDialog.tsx"]
end
subgraph "国际化系统"
I18N_INDEX["i18n/index.ts"]
I18N_PROVIDER["i18n/I18nProvider.tsx"]
LANG_SWITCHER["components/LanguageSwitcher.tsx"]
ZH_CN["locales/zh-CN.json"]
EN_US["locales/en-US.json"]
end
F_BTN --> |"使用"| F_BTN
F_INP --> |"使用"| F_INP
F_AV --> |"使用"| F_AV
F_CARD --> |"使用"| F_CARD
F_TABS --> |"使用"| F_TABS
F_DLG --> |"基础对话框"| F_DLG
F_CDlg --> |"确认对话框"| F_CDlg
F_IDlg --> |"输入对话框"| F_IDlg
F_TEXTEFFECT --> |"文本特效"| F_TEXTEFFECT
LOGIN --> |"登录页面"| LOGIN
RES --> |"资源页面"| RES
HOME --> |"剧场卡片"| HOME
ASSET --> |"资源卡片"| ASSET
ASSET_EDIT --> |"资源编辑对话框"| ASSET_EDIT
ASSET_DELETE --> |"资源删除对话框"| ASSET_DELETE
ASSET_PREVIEW --> |"资源预览对话框"| ASSET_PREVIEW
I18N_INDEX --> |"初始化i18n"| I18N_PROVIDER
I18N_PROVIDER --> |"提供语言上下文"| LANG_SWITCHER
LANG_SWITCHER --> |"切换语言"| ZH_CN
LANG_SWITCHER --> |"切换语言"| EN_US
```

**图表来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [card.tsx](file://frontend/src/components/ui/card.tsx)
- [tabs.tsx](file://frontend/src/components/ui/tabs.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)
- [login/page.tsx](file://frontend/src/app/login/page.tsx)
- [resources/page.tsx](file://frontend/src/app/resources/page.tsx)
- [theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)
- [home/TheaterCard.tsx](file://frontend/src/components/home/TheaterCard.tsx)
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)
- [resources/AssetEditDialog.tsx](file://frontend/src/components/resources/AssetEditDialog.tsx)
- [resources/AssetDeleteDialog.tsx](file://frontend/src/components/resources/AssetDeleteDialog.tsx)
- [resources/AssetPreviewDialog.tsx](file://frontend/src/components/resources/AssetPreviewDialog.tsx)
- [index.ts](file://frontend/src/i18n/index.ts)
- [I18nProvider.tsx](file://frontend/src/i18n/I18nProvider.tsx)
- [LanguageSwitcher.tsx](file://frontend/src/components/LanguageSwitcher.tsx)
- [zh-CN.json](file://frontend/src/i18n/locales/zh-CN.json)
- [en-US.json](file://frontend/src/i18n/locales/en-US.json)

**章节来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [card.tsx](file://frontend/src/components/ui/card.tsx)
- [tabs.tsx](file://frontend/src/components/ui/tabs.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)
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
- 基础组件：提供语义化与可复用的 UI 原子能力，如按钮、输入框、头像、文本特效等，强调变体与尺寸控制、可组合渲染与无障碍属性。
- 表单组件：围绕 react-hook-form 构建，提供表单项上下文、标签、控制域、描述与错误信息的统一接入。
- 反馈组件：用于信息提示与用户确认，包含警示框、对话框、提示条等，强调可访问性与动画过渡。
- 布局组件：用于页面结构组织，如卡片、标签页等，强调语义化结构与响应式布局。
- 对话框组件：包含基础对话框、确认对话框和输入对话框三个层次，提供用户确认、输入收集等功能。
- **国际化组件**：提供语言切换、文本翻译、本地化支持等功能，确保多语言用户体验的一致性。

**章节来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [card.tsx](file://frontend/src/components/ui/card.tsx)
- [tabs.tsx](file://frontend/src/components/ui/tabs.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)

## 架构总览
组件库整体采用"变体驱动 + 上下文注入 + 组合模式 + 国际化支持"的架构：
- 变体与类名：通过 class-variance-authority 定义组件变体与默认值，结合 cn 工具合并类名，实现主题与尺寸的灵活切换。
- 上下文与组合：表单组件通过 React Context 注入字段上下文，使标签、控制域、描述与错误信息形成统一的可访问性链路。
- 原子与复合：基础组件多为原子级封装，反馈与布局组件为复合组件，内部组合多个原子组件并提供行为逻辑。
- 原子与复合：基础组件多为原子级封装，反馈与布局组件为复合组件，内部组合多个原子组件并提供行为逻辑。
- 对话框层次：基础对话框提供通用的模态交互，确认对话框和输入对话框提供特定的业务场景解决方案，均支持Promise风格的异步处理。
- **国际化架构**：i18n系统通过react-i18next提供语言切换与文本翻译，支持中英文双语，具备持久化存储与SSR水合兼容性。

```mermaid
graph TB
subgraph "变体与样式"
CVA["class-variance-authority<br/>定义变体与默认值"]
CN["cn 工具<br/>合并类名"]
UTILS["utils.ts<br/>cn函数实现"]
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
CONFIRM_DLG["确认对话框<br/>ConfirmDialog + useConfirmDialog"]
INPUT_DLG["输入对话框<br/>InputDialog + useInputDialog"]
ASYNCHRONOUS["Promise风格接口<br/>异步处理"]
end
subgraph "文本特效系统"
TEXTEFFECT["TextEffect<br/>文本动画组件"]
FRAMERMOTION["Framer Motion<br/>动画引擎"]
ANIMATIONCOMPONENT["AnimationComponent<br/>动画子组件"]
PRESETVARIANTS["预设动画变体<br/>blur/shake/scale/fade/slide"]
END
subgraph "国际化系统"
I18N_CORE["i18n核心<br/>index.ts"]
I18N_PROVIDER["I18nProvider<br/>语言上下文"]
LANG_SWITCHER["LanguageSwitcher<br/>语言切换器"]
LOCALES["本地化资源<br/>zh-CN.json & en-US.json"]
end
BTN["Button"] --> CVA
BTN --> CN
INP["Input"] --> CN
AV["Avatar"] --> RADIX
DLG["Dialog"] --> RADIX
CDLG["ConfirmDialog"] --> BASE_DLG
IDLG["InputDialog"] --> BASE_DLG
CDLG --> ASYNCHRONOUS
IDLG --> ASYNCHRONOUS
TEXTEFFECT --> FRAMERMOTION
TEXTEFFECT --> ANIMATIONCOMPONENT
TEXTEFFECT --> PRESETVARIANTS
I18N_CORE --> I18N_PROVIDER
I18N_PROVIDER --> LANG_SWITCHER
LANG_SWITCHER --> LOCALES
```

**图表来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)
- [utils.ts](file://frontend/src/lib/utils.ts)
- [index.ts](file://frontend/src/i18n/index.ts)
- [I18nProvider.tsx](file://frontend/src/i18n/I18nProvider.tsx)
- [LanguageSwitcher.tsx](file://frontend/src/components/LanguageSwitcher.tsx)

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

#### 文本特效 TextEffect
- 组件概述
  - TextEffect 是一个强大的文本动画组件，基于 Framer Motion 实现，支持多种动画效果和分段渲染
  - 可以按字符、单词或行进行分段，提供流畅的文本进入、退出和交互动画
- 属性接口
  - children: string - 要动画化的文本内容
  - per?: 'word' | 'char' | 'line' - 分段粒度，默认为 'word'
  - as?: keyof React.JSX.IntrinsicElements - HTML标签类型，默认为 'p'
  - variants?: { container?: Variants; item?: Variants } - 自定义动画变体
  - className?: string - 外部类名
  - preset?: 'blur' | 'shake' | 'scale' | 'fade' | 'slide' - 预设动画效果
  - delay?: number - 动画延迟时间（秒）
  - trigger?: boolean - 控制动画触发的布尔值
  - onAnimationComplete?: () => void - 动画完成回调
  - segmentWrapperClassName?: string - 分段包装器类名
- 预设动画效果
  - blur: 模糊渐显效果，适合标题或重要文本
  - shake: 摇摆动画，增加趣味性和注意力
  - scale: 缩放效果，突出文本的出现
  - fade: 淡入淡出，简洁优雅
  - slide: 滑动效果，适合列表或段落
- 动画分段策略
  - 字符级别：逐个字符动画，适合短文本或强调效果
  - 单词级别：按空格分段，适合正常文本阅读
  - 行级别：按换行符分段，适合段落或诗歌
- 无障碍与可访问性
  - 行级别分段时提供完整的 aria-label
  - 字符和单词级别分段时设置 aria-hidden，避免重复读取
  - 支持 AnimatePresence 的 popLayout 模式
- 性能优化
  - 使用 React.memo 优化 AnimationComponent 渲染
  - 支持受控触发，避免不必要的动画
  - 提供自定义变体，减少重复代码
- 示例路径
  - [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)

```mermaid
classDiagram
class TextEffect {
+children : string
+per : "word"|"char"|"line"
+as : "p"|"h1"|"h2"|"h3"|"h4"|"h5"|"h6"
+variants : Variants
+className : string
+preset : "blur"|"shake"|"scale"|"fade"|"slide"
+delay : number
+trigger : boolean
+onAnimationComplete : Function
+segmentWrapperClassName : string
}
class AnimationComponent {
+segment : string
+variants : Variants
+per : "line"|"word"|"char"
+segmentWrapperClassName : string
}
class PresetVariants {
+blur : Variants
+shake : Variants
+scale : Variants
+fade : Variants
+slide : Variants
}
TextEffect --> AnimationComponent : "使用"
TextEffect --> PresetVariants : "应用预设"
```

**图表来源**
- [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)

**章节来源**
- [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)

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
  - 确认对话框：内置图标分类、颜色主题、加载状态处理，支持Promise风格的异步确认
  - 输入对话框：支持文本输入验证、回车确认、ESC取消，提供Promise风格的异步输入
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

### 对话框组件

#### 确认对话框 ConfirmDialog
- 组件构成
  - ConfirmDialog：提供删除、编辑、警告等类型的确认对话框
  - useConfirmDialog：Hook，提供Promise风格的异步确认接口
- 类型配置
  - delete：红色主题，垃圾桶图标，用于删除确认
  - edit：主色调主题，编辑图标，用于编辑确认
  - warning：黄色主题，警告图标，用于一般性警告
- 特性
  - 支持自定义标题、描述、按钮文本
  - 内置加载状态处理
  - Promise风格异步接口，简化回调处理
- 无障碍与可访问性
  - 支持键盘导航与ESC关闭
  - 加载状态提供视觉反馈
- 示例路径
  - [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)

**章节来源**
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)

#### 输入对话框 InputDialog
- 组件构成
  - InputDialog：提供文本输入的确认对话框
  - useInputDialog：Hook，提供Promise风格的异步输入接口
- 特性
  - 支持默认值、占位符、输入验证
  - 支持回车确认、ESC取消
  - 内置加载状态处理
  - Promise风格异步接口，简化回调处理
- 无障碍与可访问性
  - 自动聚焦输入框
  - 支持键盘快捷键操作
  - 输入验证提供即时反馈
- 示例路径
  - [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)

**章节来源**
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)

## 国际化支持

### i18n系统架构
KunFlix采用react-i18next作为国际化解决方案，提供完整的多语言支持：

- **核心配置**：在index.ts中初始化i18n实例，配置中英文资源、默认语言与回退语言
- **提供者模式**：I18nProvider组件在应用根部提供语言上下文，支持客户端挂载后的语言偏好恢复
- **持久化存储**：语言切换时自动保存到localStorage，避免SSR水合不匹配问题
- **资源管理**：独立的locales目录管理翻译资源，支持复杂的嵌套结构与参数化翻译

```mermaid
graph TB
subgraph "国际化核心"
I18N_INDEX["i18n/index.ts<br/>初始化与配置"]
I18N_PROVIDER["I18nProvider.tsx<br/>语言上下文提供者"]
I18N_LAYOUT["layout.tsx<br/>应用根布局"]
end
subgraph "本地化资源"
ZH_CN["zh-CN.json<br/>中文翻译"]
EN_US["en-US.json<br/>英文翻译"]
end
subgraph "语言切换"
LANG_SWITCHER["LanguageSwitcher.tsx<br/>语言切换器"]
USE_TRANSLATION["useTranslation Hook<br/>翻译函数"]
end
I18N_INDEX --> I18N_PROVIDER
I18N_PROVIDER --> I18N_LAYOUT
I18N_INDEX --> ZH_CN
I18N_INDEX --> EN_US
LANG_SWITCHER --> USE_TRANSLATION
USE_TRANSLATION --> ZH_CN
USE_TRANSLATION --> EN_US
```

**图表来源**
- [index.ts](file://frontend/src/i18n/index.ts)
- [I18nProvider.tsx](file://frontend/src/i18n/I18nProvider.tsx)
- [layout.tsx](file://frontend/src/app/layout.tsx)
- [LanguageSwitcher.tsx](file://frontend/src/components/LanguageSwitcher.tsx)
- [zh-CN.json](file://frontend/src/i18n/locales/zh-CN.json)
- [en-US.json](file://frontend/src/i18n/locales/en-US.json)

### 语言切换器组件
LanguageSwitcher组件提供直观的语言切换功能：

- **组件特性**：支持中英文切换，带旗帜标识，动画展开菜单
- **状态管理**：使用useState管理菜单开关状态，useEffect处理外部点击事件
- **无障碍支持**：提供aria-label属性，支持键盘导航
- **样式设计**：基于Tailwind CSS的现代化设计，支持悬停与选中状态

**章节来源**
- [LanguageSwitcher.tsx](file://frontend/src/components/LanguageSwitcher.tsx)

### 国际化资源文件
翻译资源文件采用JSON格式，提供完整的多语言支持：

- **结构设计**：采用层级结构管理翻译键，支持嵌套对象与数组
- **参数化翻译**：支持{{variable}}占位符，用于动态内容插入
- **复数形式**：提供plural_one/plural_other等键处理复数形式
- **完整覆盖**：涵盖导航、用户菜单、搜索、主题切换、资源管理等所有功能模块

**章节来源**
- [zh-CN.json](file://frontend/src/i18n/locales/zh-CN.json)
- [en-US.json](file://frontend/src/i18n/locales/en-US.json)

### 组件中的国际化应用
各组件通过useTranslation钩子实现国际化：

- **TopBar组件**：导航链接、用户菜单、搜索占位符等全部支持国际化
- **资源页面**：上传提示、错误信息、筛选标签、视图模式等完全本地化
- **剧场卡片**：状态显示、操作按钮、对话框文本等多语言支持
- **侧边栏组件**：节点类型名称、描述文本、空状态提示等国际化

**章节来源**
- [home/TopBar.tsx](file://frontend/src/components/home/TopBar.tsx)
- [resources/page.tsx](file://frontend/src/app/resources/page.tsx)
- [home/TheaterCard.tsx](file://frontend/src/components/home/TheaterCard.tsx)
- [canvas/Sidebar.tsx](file://frontend/src/components/canvas/Sidebar.tsx)

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
  - Promise风格异步处理简化业务逻辑
- **国际化特性**
  - 状态标签、操作按钮、对话框文本完全本地化
  - 时间格式化支持不同语言的日期显示

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
- **国际化特性**
  - 文件类型标签、操作按钮、状态信息完全本地化
  - 错误提示与帮助文本支持多语言

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
- 预览渲染器映射表
  - image：图片全屏预览
  - video：视频全屏播放
  - audio：音频播放器界面

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
- 交互模式
  - 支持重命名和替换两种模式
  - 实时文件选择反馈

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
- 无障碍与可访问性
  - 危险操作的明确视觉标识
  - 加载状态的即时反馈

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
- **国际化特性**
  - 节点类型名称、描述文本、操作提示完全本地化
  - 拖拽提示与状态信息支持多语言

**章节来源**
- [theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)

## 依赖关系分析
- 组件间耦合
  - 基础组件之间低耦合，通过共享工具函数与变体系统协作
  - 表单组件强依赖 react-hook-form 与上下文机制
  - 反馈组件依赖 Radix UI 动画与可访问性 API
  - 对话框组件提供 Promise 风格的异步接口，增强用户体验
  - 确认对话框和输入对话框组件依赖基础对话框组件
  - **国际化组件**：LanguageSwitcher依赖i18n系统，各业务组件依赖useTranslation钩子
  - **文本特效组件**：TextEffect组件依赖Framer Motion动画引擎
- 外部依赖
  - class-variance-authority：变体系统
  - @radix-ui/react-*：可访问性与动画抽象
  - lucide-react：图标
  - react-hook-form：表单状态与验证
  - framer-motion：动画系统
  - @xyflow/react：可视化画布
  - **react-i18next**：国际化支持
  - i18next：核心国际化引擎

```mermaid
graph LR
BTN["Button"] --> CVA["class-variance-authority"]
INP["Input"] --> UTIL["cn 工具"]
AV["Avatar"] --> RADIX_AV["@radix-ui/react-avatar"]
DLG["Dialog"] --> RADIX_D["@radix-ui/react-dialog"]
CDLG["ConfirmDialog"] --> DLG
IDLG["InputDialog"] --> DLG
CDLG --> PROMISE["Promise风格接口"]
IDLG --> PROMISE
TABS["Tabs"] --> STATE["内部状态"]
FORM["Form"] --> RHF["react-hook-form"]
SEL["Select"] --> RADIX_S["@radix-ui/react-select"]
ALERT["Alert"] --> CVA
TOAST["Toast"] --> RADIX_T["@radix-ui/react-toast"]
AD["AlertDialog"] --> RADIX_AD["@radix-ui/react-alert-dialog"]
LOGIN["LoginPage"] --> FM["Framer Motion"]
THEATER["InfiniteCanvas"] --> RF["@xyflow/react"]
ASSET["AssetCard"] --> DROP["DropdownMenu"]
ASSET_EDIT["AssetEditDialog"] --> DLG
ASSET_DELETE["AssetDeleteDialog"] --> DLG
ASSET_PREVIEW["AssetPreviewDialog"] --> DLG
I18N["i18n系统"] --> I18NEXT["react-i18next"]
I18N --> I18NEXT_CORE["i18next核心"]
LANG_SWITCHER["LanguageSwitcher"] --> I18N
COMPONENTS["业务组件"] --> USE_TRANSLATION["useTranslation钩子"]
USE_TRANSLATION --> I18N
TEXTEFFECT["TextEffect"] --> FRAMERMOTION["Framer Motion"]
TEXTEFFECT --> ANIMATIONCOMPONENT["AnimationComponent"]
TEXTEFFECT --> PRESETVARIANTS["预设动画变体"]
```

**图表来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)
- [login/page.tsx](file://frontend/src/app/login/page.tsx)
- [theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)
- [resources/AssetEditDialog.tsx](file://frontend/src/components/resources/AssetEditDialog.tsx)
- [resources/AssetDeleteDialog.tsx](file://frontend/src/components/resources/AssetDeleteDialog.tsx)
- [resources/AssetPreviewDialog.tsx](file://frontend/src/components/resources/AssetPreviewDialog.tsx)
- [index.ts](file://frontend/src/i18n/index.ts)
- [I18nProvider.tsx](file://frontend/src/i18n/I18nProvider.tsx)
- [LanguageSwitcher.tsx](file://frontend/src/components/LanguageSwitcher.tsx)

**章节来源**
- [button.tsx](file://frontend/src/components/ui/button.tsx)
- [input.tsx](file://frontend/src/components/ui/input.tsx)
- [avatar.tsx](file://frontend/src/components/ui/avatar.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [alert-dialog.tsx](file://backend/admin/src/components/ui/alert-dialog.tsx)
- [alert.tsx](file://backend/admin/src/components/ui/alert.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)
- [login/page.tsx](file://frontend/src/app/login/page.tsx)
- [theater/[id]/page.tsx](file://frontend/src/app/theater/[id]/page.tsx)
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)
- [index.ts](file://frontend/src/i18n/index.ts)
- [I18nProvider.tsx](file://frontend/src/i18n/I18nProvider.tsx)
- [LanguageSwitcher.tsx](file://frontend/src/components/LanguageSwitcher.tsx)

## 性能与可访问性
- 性能
  - 变体与类名计算在组件外层完成，减少重复计算
  - Tabs 内容按需渲染，避免不必要的子树挂载
  - Dialog 与 Select 使用 Portal 减少 DOM 深度对布局的影响
  - 对话框组件使用 Promise 风格接口，避免阻塞主线程
  - 资源卡片使用懒加载与条件渲染，优化大列表性能
  - 确认对话框和输入对话框组件支持加载状态，提升用户体验
  - **国际化性能**：i18n系统采用按需加载，避免不必要的翻译计算
  - **文本特效性能**：TextEffect组件使用React.memo优化渲染，支持受控触发
- 可访问性
  - 表单组件自动注入 aria-* 属性，确保屏幕阅读器可用
  - 对话框与提示条提供键盘关闭与焦点管理
  - 头像与按钮保持原生语义，避免破坏默认可访问性
  - 下拉菜单支持键盘导航与焦点陷阱
  - 资源预览对话框提供下载与关闭的键盘快捷键
  - 确认对话框和输入对话框提供明确的视觉反馈
  - **国际化可访问性**：语言切换器提供aria-label，支持屏幕阅读器
  - **文本特效可访问性**：行级别分段提供完整aria-label，字符和单词级别设置aria-hidden
- 响应式与跨浏览器
  - 组件样式使用相对单位与媒体查询，保证在不同设备上的一致表现
  - 通过 Radix UI 的动画与过渡，确保在现代浏览器中的流畅体验
  - 登录页面与资源页面提供移动端优化的响应式设计
  - **国际化兼容性**：支持RTL语言与复杂文字系统

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
  - 若输入对话框无法输入，请检查输入框的焦点状态
- 提示条相关
  - 若提示条不出现，请确认 ToastProvider 已在应用根部提供
  - 若滑动关闭无效，请检查 Radix UI 动画变量是否生效
- 资源管理相关
  - 若资源预览失败，请检查文件 URL 是否有效
  - 若资源上传失败，请检查文件类型与大小限制
  - 若资源删除确认无效，请检查对话框状态管理
- 确认对话框和输入对话框相关
  - 若确认对话框不显示，请检查 useConfirmDialog hook 的状态管理
  - 若输入对话框无法确认，请检查输入验证逻辑
  - 若对话框加载状态异常，请检查 setLoading 函数的调用
- **国际化相关**
  - 若语言切换无效，请检查LanguageSwitcher组件的i18n.changeLanguage调用
  - 若翻译文本不显示，请确认翻译键是否存在且拼写正确
  - 若SSR水合不匹配，请检查I18nProvider的客户端挂载逻辑
  - 若语言偏好未保存，请检查localStorage的访问权限
- **文本特效相关**
  - 若动画不显示，请检查trigger属性是否为true
  - 若分段不正确，请检查per属性设置（word/char/line）
  - 若动画效果异常，请检查variants配置或preset属性
  - 若性能问题，请检查是否使用了过多的TextEffect组件

**章节来源**
- [form.tsx](file://backend/admin/src/components/ui/form.tsx)
- [select.tsx](file://backend/admin/src/components/ui/select.tsx)
- [dialog.tsx](file://frontend/src/components/ui/dialog.tsx)
- [confirm-dialog.tsx](file://frontend/src/components/ui/confirm-dialog.tsx)
- [toast.tsx](file://backend/admin/src/components/ui/toast.tsx)
- [resources/AssetCard.tsx](file://frontend/src/components/resources/AssetCard.tsx)
- [LanguageSwitcher.tsx](file://frontend/src/components/LanguageSwitcher.tsx)
- [text-effect.tsx](file://frontend/src/components/ui/text-effect.tsx)

## 结论
本组件库以 Ant Design 设计体系为蓝本，结合 Radix UI 的可访问性与 class-variance-authority 的变体系统，构建了高可组合、可定制、可扩展的 UI 基础设施。通过上下文与变体驱动的设计，组件在保持一致性的同时提供了足够的灵活性，满足从基础交互到复杂业务场景的需求。

本次更新新增了完整的国际化支持系统，采用react-i18next提供多语言支持，包括：
- 完整的中英文翻译资源
- 语言切换器组件
- 组件级别的国际化集成
- 持久化语言偏好存储
- SSR水合兼容性处理

同时，新增了强大的TextEffect文本特效组件，基于Framer Motion实现，提供多种动画效果和分段渲染能力，支持字符、单词、行三种分段粒度，满足各种文本动画需求。

这些增强不仅提升了用户体验，还为后续的功能扩展奠定了坚实的基础，确保KunFlix能够在国际化环境中提供一致、高质量的用户界面。

## 附录：使用示例与最佳实践
- 组合模式
  - 使用 Tabs 将多个内容面板组合，仅渲染当前激活项
  - 使用 Card 组织信息区块，配合 Header/Title/Description 提升可读性
  - 使用 ConfirmDialog 和 InputDialog 提供一致的用户确认体验
  - 使用 TextEffect 为文本内容添加动画效果，提升视觉吸引力
- 状态管理
  - 表单场景优先使用 react-hook-form 的受控/非受控模式，结合 FormItem 与 FormControl 管理字段状态
  - Tabs 支持受控与非受控两种模式，根据业务需要选择
  - 对话框组件使用 Promise 风格接口，简化异步处理逻辑
  - 确认对话框和输入对话框组件使用 useConfirmDialog 和 useInputDialog hook 管理状态
  - TextEffect 组件支持受控触发，通过trigger属性精确控制动画时机
- 性能优化
  - 将昂贵的子树放入 TabsContent，避免一次性渲染
  - 使用 asChild 将 Button 渲染为链接或其他元素，减少额外 DOM
  - 资源卡片使用懒加载与条件渲染，优化大列表性能
  - 对话框组件使用 Portal 渲染，减少 DOM 深度影响
  - 确认对话框和输入对话框组件支持加载状态，提升用户体验
  - **国际化性能**：合理使用翻译函数，避免在渲染循环中频繁调用
  - **文本特效性能**：使用React.memo优化渲染，避免不必要的重新渲染
- 主题与样式
  - 通过变体参数快速切换主题风格，必要时使用外部类名覆盖
  - 使用 cn 合并类名，避免样式冲突
  - 对话框组件提供颜色主题映射，统一视觉风格
  - TextEffect 组件支持自定义样式，通过className属性扩展
- 无障碍访问
  - 表单组件自动注入可访问性属性，确保屏幕阅读器可用
  - 对话框与提示条提供键盘操作与焦点管理
  - 下拉菜单支持键盘导航与焦点陷阱
  - 资源预览对话框提供下载与关闭的键盘快捷键
  - 确认对话框和输入对话框提供明确的视觉反馈
  - **国际化无障碍**：确保语言切换器提供适当的aria-label
  - **文本特效无障碍**：合理使用aria-hidden和aria-label属性
- 组件扩展
  - 基于现有对话框组件模式，可以扩展更多业务场景的确认对话框
  - 资源卡片的预览渲染器模式可以扩展支持更多文件类型
  - 剧场页面的节点类型注册模式可以扩展支持更多节点类型
  - 对话框组件的Promise风格接口可以扩展支持更多异步操作场景
  - **国际化扩展**：新增语言时，只需添加对应的JSON资源文件即可
  - **文本特效扩展**：可以基于AnimationComponent扩展更多动画效果
- **国际化最佳实践**
  - 使用层级结构组织翻译键，便于维护和查找
  - 参数化翻译时使用{{variable}}占位符，支持动态内容
  - 复数形式使用plural_one/plural_other等键处理
  - 在组件中统一使用useTranslation钩子获取翻译函数
  - 语言切换时确保用户偏好得到持久化保存
  - 考虑RTL语言的支持与文本方向调整
- **文本特效最佳实践**
  - 根据内容长度选择合适的分段粒度（字符/单词/行）
  - 合理使用delay属性创建层次化的动画序列
  - 使用preset属性快速实现常见动画效果
  - 通过variants属性实现自定义动画，保持动画的一致性
  - 注意性能优化，避免在同一页面中使用过多的TextEffect组件
  - 在移动设备上谨慎使用复杂的动画效果，确保流畅性