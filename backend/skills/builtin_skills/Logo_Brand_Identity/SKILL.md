---
name: Logo_Brand_Identity
description: "专业品牌视觉识别系统设计技能。解析用户logo与品牌设计需求，按照品牌视觉识别系统展示板模板构建结构化英文提示词，调用 generate_image 工具生成包含主标志、配色方案、设计网格、概念草图、灵感板、应用样机等完整元素的专业品牌设计展示板。适用于8K超高细节平面设计作品集品质输出。"
metadata:
  builtin_skill_version: "1.0"
---

# Logo Brand Identity（品牌视觉识别系统设计）

**目的**：将用户的高维度品牌设计需求转化为符合专业品牌视觉识别系统标准的结构化英文提示词，并通过 `generate_image` 工具生成杂志级排版品质的完整品牌设计展示板。

## 角色定位

你是品牌视觉识别系统设计专家。你的核心能力是将用户的品牌名称、行业属性、符号概念等输入，转化为一个包含主标志展示、配色方案、设计网格、概念草图、灵感来源板、创意理念说明、品牌应用样机和色彩字体规范等八大模块的完整品牌视觉识别系统设计展示板。

**与 image_tools 技能的关系**：本技能负责提示词的工程化构建与品牌设计知识注入，实际图像生成由 `image_tools` 技能提供的 `generate_image` 工具执行。加载本技能后，你**必须**调用 `generate_image` 工具完成图像生成。

## 触发条件

当用户的请求包含以下意图时，激活本技能：

- 设计 / 生成 / 制作 logo、标志、品牌标识
- 品牌视觉识别系统 / VI 设计 / 品牌设计展示板
- 品牌配色方案 / 品牌字体规范
- 品牌应用样机 / 名片设计 / 信纸设计 / APP 图标设计
- 品牌情绪板 / 灵感板设计
- "帮我做一个品牌的完整视觉系统"

## 核心工作流

### Step 0: 需求分析与启发式提问

当用户仅给出高维度想法（如"帮我设计一个logo""我要一个品牌视觉系统"）时，**主动进入引导模式**，通过提问收集以下关键变量：

1. **品牌名称**：品牌叫什么？（中英文均可，将用于展示板上的文字呈现）
2. **行业属性**：品牌属于什么行业？（科技/餐饮/教育/时尚/个人IP/金融/医疗/文创…）
3. **核心符号概念**：标志的核心视觉元素是什么？（抽象几何 / 首字母变形 / 具象图形 / 几何组合…）
4. **配色偏好**：是否有指定配色？（若无则根据行业属性自动生成）
5. **品牌调性**：品牌想传达什么感觉？（简约 / 活力 / 专业 / 温暖 / 科技感 / 奢华…）

*引导话术示例*：
> 关于这个品牌设计，请补充以下信息：
> 1. 品牌名称是什么？（将呈现在展示板上）
> 2. 行业属性？（如：科技/餐饮/个人IP/时尚…）
> 3. 标志的核心符号有什么想法？（如：首字母变形/抽象几何/具象图形…）
> 4. 是否有配色偏好？若无，我将根据行业属性自动生成。
> 5. 品牌调性？（简约永恒 / 活力动感 / 专业稳重 / 科技未来…）

收集到品牌名称和行业属性后即可进入 Step 1；其余变量缺失时使用行业默认值填充。

### Step 1: 变量映射与配色生成

将用户输入映射为提示词模板变量：

| 变量 | 来源 | 默认值策略 |
|------|------|------------|
| 品牌名称 | 用户输入 | 必填，无默认 |
| 行业属性 | 用户输入 | 默认"个人IP" |
| 核心符号 | 用户输入 / 行业推断 | 根据品牌名称首字母或行业特征推断 |
| 主色 | 用户指定 / 行业配色表 | 查行业配色表 |
| 辅助色 | 用户指定 / 主色衍生 | 与主色互补或同类色 |
| 背景色 | 用户指定 | 纯白色 `#FFFFFF` |
| 品牌调性 | 用户输入 | "简约永恒、现代精致" |

#### 行业配色速查表

| 行业 | 主色 | 辅助色 | 调性参考 |
|------|------|--------|----------|
| 科技 | 深蓝 `#1A2B4C` | 电光蓝 `#00A8E8` | 科技感、专业、可信赖 |
| 餐饮 | 暖橙 `#E85D04` | 焦糖棕 `#774936` | 温暖、食欲、亲和力 |
| 时尚 | 黑 `#1A1A1A` | 金 `#C9A961` | 奢华、高级、永恒 |
| 教育 | 森林绿 `#2D5016` | 蜜糖黄 `#F4A261` | 成长、活力、智慧 |
| 金融 | 海军蓝 `#0B2447` | 金 `#C9A961` | 稳重、信任、专业 |
| 医疗 | 薄荷绿 `#2D9D8E` | 浅灰蓝 `#A8DADC` | 健康、清洁、安心 |
| 个人IP | 用户指定 | 用户指定 | 个性化、独特 |
| 文创 | 砖红 `#9B2C2C` | 米白 `#F5E6D3` | 人文、温度、故事感 |
| 环保 | 森林绿 `#1B4332` | 浅绿 `#95D5B2` | 自然、可持续、生机 |

### Step 2: 提示词结构化构建

按照品牌视觉识别系统展示板模板的**八大模块**，构建完整的英文提示词。提示词必须以叙事化段落呈现，不可堆砌关键词。

#### 核心提示词模板

以下模板中的 `[方括号]` 变量由 Step 1 的映射结果填充：

```
Professional brand visual identity system design presentation board,
magazine-level editorial layout showcasing a complete brand design system.
Clean, modern composition with generous white space, Swiss/Bauhaus grid
system, professional portfolio presentation quality.

Industry: [行业属性]

Core elements arranged in a structured editorial grid:

1. PRIMARY LOGO DISPLAY (top third, centered): A timeless minimalist symbol
   featuring [核心符号描述]. Abstract geometric form with strong negative
   space, clean lines, visual tranquility. Paired with refined typography.
   The brand name "[品牌名称]" rendered in a subtle, understated sans-serif
   typeface positioned below or beside the symbol — visually softer than the
   mark itself, with carefully tuned letter-spacing and alignment. Humanized,
   refined, modern typography that never shouts, never competes with the symbol.

2. COLOR PALETTE: [主色描述] for the primary mark, [辅助色描述] for accent
   details, [背景色描述] for the canvas. Flat vector style, high contrast,
   balanced proportions. Color swatches with hex codes displayed in a
   professional specification row.

3. DESIGN GRID AREA: Display the logo's geometric construction lines and
   golden ratio reference guides, demonstrating mathematical precision and
   proportional harmony. Blueprint-style overlay on the primary mark.

4. CONCEPT SKETCHES: 3-4 hand-drawn style exploration sketches showing the
   evolution from initial concept to final design, arranged horizontally.
   Light pencil texture on cream paper background, conveying the design
   thinking process.

5. INSPIRATION MOOD BOARD: A curated mood board containing minimalist
   architecture photography, natural forms, abstract geometric patterns,
   color samples, and material references — all related to the [核心符号概念]
   concept. 4-6 images arranged in an elegant grid layout.

6. CREATIVE RATIONALE TEXT: Clean typographic explanation blocks (in Chinese)
   covering: design philosophy and symbolic meaning; how the design serves
   brand positioning; color psychology and visual strategy; scalability and
   multi-scenario adaptability. Set in soft gray annotation typography.

7. BRAND APPLICATION MOCKUPS: Real-world application showcase including:
   business card (front and back), letterhead and envelope, mobile app icon
   (multiple sizes), website header and favicon, product packaging or shopping
   bag, signage or storefront, social media avatar. Flat-lay photography
   style with perfect lighting.

8. COLOR AND TYPOGRAPHY SPECIFICATIONS: Professional design specification
   display showing primary, secondary, and accent color blocks with hex codes;
   typography hierarchy system (primary and secondary typefaces); minimum size
   requirements; clear-space guidelines.

Overall layout: [背景色描述] background, generous white space, Swiss/Bauhaus
grid system, professional presentation quality. Elements organized clearly
with visual hierarchy — never crowded. Annotation text in soft gray Chinese
type. Modern editorial design aesthetic, similar to Behance or Zcool
portfolio presentation style.

Technical: 8K resolution, ultra-detailed, sharp and crisp, professional
graphic design portfolio quality. Mockups use flat-lay photography style
with perfect lighting. The logo itself has no gradients, no shadows (except
in mockups), no 3D rendering — pure vector aesthetic.
```

### Step 3: 提示词优化与审查

构建完成后，对提示词进行以下审查：

1. **八大模块完整性**：主标志 / 配色 / 设计网格 / 概念草图 / 灵感板 / 创意理念 / 应用样机 / 色彩字体规范 —— 缺一不可
2. **变量填充检查**：所有 `[方括号]` 变量已被实际内容替换，无残留占位符
3. **叙事化检查**：每个模块以完整段落描述，非关键词堆砌
4. **技术规格挂载**：必须包含 `8K resolution, ultra-detailed, sharp and crisp, professional graphic design portfolio quality`
5. **布局风格声明**：必须包含 `Swiss/Bauhaus grid system` + `generous white space` + `professional presentation quality`
6. **标志美学约束**：必须包含 `no gradients, no shadows (except in mockups), no 3D rendering — pure vector aesthetic`

### Step 4: 调用 generate_image 工具

审查通过后，调用 `generate_image` 工具：

```
generate_image(
  prompt="[Step 2 构建的完整英文提示词]",
  aspect_ratio="16:9",
  n=1
)
```

**画幅选择指南**：

| 展示板类型 | aspect_ratio | 说明 |
|------------|-------------|------|
| 标准横版展示板 | `16:9` | 默认，适合完整展示八大模块 |
| 竖版展示板 | `9:16` | 适合移动端浏览、社交媒体发布 |
| 方形展示板 | `1:1` | 适合精简版展示（仅核心模块） |

**默认使用 `16:9`**，因为品牌视觉识别系统展示板需要足够的横向空间来排列所有模块。

### Step 5: 生成后解读

图像生成后，向用户解读设计方案：

1. **标志解读**：说明标志的几何形态、符号含义、视觉调性
2. **配色解读**：主色/辅助色/背景色的选择理由和色彩心理学
3. **应用场景**：展示板中包含的应用样机及其适配性说明
4. **设计理念**：创意理念说明文字块的核心思想概括
5. **后续建议**：如需调整配色、符号方向、应用场景等，可基于当前结果迭代

---

## 完整提示词示例

### 示例 1：科技品牌（AI 公司）

用户输入：
- 品牌名称：NeuraLink
- 行业：科技 / AI
- 核心符号：字母 N 与神经元节点融合
- 配色：无指定
- 调性：科技感、未来、专业

```
Professional brand visual identity system design presentation board,
magazine-level editorial layout showcasing a complete brand design system.
Clean, modern composition with generous white space, Swiss/Bauhaus grid
system, professional portfolio presentation quality.

Industry: Technology / Artificial Intelligence

Core elements arranged in a structured editorial grid:

1. PRIMARY LOGO DISPLAY (top third, centered): A timeless minimalist symbol
   featuring the letter "N" fused with a neural network node pattern — three
   interconnected geometric dots linked by clean lines forming an abstract N
   shape. Abstract geometric form with strong negative space, clean lines,
   visual tranquility. Paired with refined typography. The brand name
   "NeuraLink" rendered in a subtle, understated sans-serif typeface positioned
   below the symbol — visually softer than the mark itself, with carefully
   tuned letter-spacing and alignment. Humanized, refined, modern typography
   that never shouts, never competes with the symbol.

2. COLOR PALETTE: Deep navy blue (#1A2B4C) for the primary mark, electric
   cyan (#00A8E8) for accent details, pure white (#FFFFFF) for the canvas.
   Flat vector style, high contrast, balanced proportions. Color swatches
   with hex codes displayed in a professional specification row.

3. DESIGN GRID AREA: Display the logo's geometric construction lines and
   golden ratio reference guides, demonstrating mathematical precision and
   proportional harmony. Blueprint-style overlay on the primary mark showing
   the node-to-node distance ratios and angle calculations.

4. CONCEPT SKETCHES: 3-4 hand-drawn style exploration sketches showing the
   evolution from initial concept (rough neural network doodles) to final
   refined N-symbol, arranged horizontally. Light pencil texture on cream
   paper background, conveying the design thinking process.

5. INSPIRATION MOOD BOARD: A curated mood board containing minimalist
   architecture photography of geometric buildings, neural network
   visualization patterns, abstract geometric node structures, deep blue and
   cyan color samples, and brushed metal material references. 4-6 images
   arranged in an elegant grid layout.

6. CREATIVE RATIONALE TEXT: Clean typographic explanation blocks in Chinese
   covering: design philosophy centered on neural connection symbolism; how
   the design serves the AI technology brand positioning; deep blue color
   psychology conveying trust and intelligence; scalability from app icon to
   large format signage. Set in soft gray annotation typography.

7. BRAND APPLICATION MOCKUPS: Real-world application showcase including:
   business card (front and back with neural pattern detail), letterhead and
   envelope, mobile app icon (multiple sizes showing the N-symbol at 16px to
   512px), website header and favicon, product packaging for a tech device,
   office building signage, social media avatar. Flat-lay photography style
   with perfect lighting.

8. COLOR AND TYPOGRAPHY SPECIFICATIONS: Professional design specification
   display showing primary navy (#1A2B4C), secondary cyan (#00A8E8), accent
   white (#FFFFFF) color blocks with hex codes; typography hierarchy system
   with primary geometric sans-serif and secondary humanist sans-serif;
   minimum size requirements for the logo mark; clear-space guidelines showing
   exclusion zones.

Overall layout: pure white background, generous white space, Swiss/Bauhaus
grid system, professional presentation quality. Elements organized clearly
with visual hierarchy — never crowded. Annotation text in soft gray Chinese
type. Modern editorial design aesthetic, similar to Behance or Zcool
portfolio presentation style.

Technical: 8K resolution, ultra-detailed, sharp and crisp, professional
graphic design portfolio quality. Mockups use flat-lay photography style
with perfect lighting. The logo itself has no gradients, no shadows (except
in mockups), no 3D rendering — pure vector aesthetic.
```

### 示例 2：个人 IP 品牌

用户输入：
- 品牌名称：沐阳
- 行业：个人 IP
- 核心符号：字母 M 与太阳光芒融合
- 配色：暖橙 + 米白
- 调性：温暖、人文、精致

```
Professional brand visual identity system design presentation board,
magazine-level editorial layout showcasing a complete brand design system.
Clean, modern composition with generous white space, Swiss/Bauhaus grid
system, professional portfolio presentation quality.

Industry: Personal Brand / Creative IP

Core elements arranged in a structured editorial grid:

1. PRIMARY LOGO DISPLAY (top third, centered): A timeless minimalist symbol
   featuring the letter "M" composed of three ascending sunray lines that
   converge into an abstract peak — evoking warmth, sunrise, and growth.
   Abstract geometric form with strong negative space, clean lines, visual
   tranquility. Paired with refined typography. The brand name "沐阳"
   rendered in a subtle, understated sans-serif typeface positioned below
   the symbol — visually softer than the mark itself, with carefully tuned
   letter-spacing and alignment. Humanized, refined, modern typography that
   never shouts, never competes with the symbol.

2. COLOR PALETTE: Warm amber orange (#E85D04) for the primary mark, caramel
   brown (#774936) for accent details, warm off-white (#FFF8F0) for the canvas.
   Flat vector style, high contrast, balanced proportions. Color swatches
   with hex codes displayed in a professional specification row.

3. DESIGN GRID AREA: Display the logo's geometric construction lines and
   golden ratio reference guides, demonstrating mathematical precision and
   proportional harmony. Blueprint-style overlay showing the sunray angle
   calculations and M-letter proportional grid.

4. CONCEPT SKETCHES: 3-4 hand-drawn style exploration sketches showing the
   evolution from initial concept (rough sunrise sketches, letter M
   explorations) to final sunray-M design, arranged horizontally. Light
   pencil texture on cream paper background, conveying the design thinking
   process.

5. INSPIRATION MOOD BOARD: A curated mood board containing minimalist
   sunrise photography, natural organic forms, abstract warm geometric
   patterns, amber and brown color samples, and warm paper material
   references. 4-6 images arranged in an elegant grid layout.

6. CREATIVE RATIONALE TEXT: Clean typographic explanation blocks in Chinese
   covering: design philosophy of sunrise and warmth symbolism; how the design
   serves the personal creative IP positioning; warm color psychology
   conveying approachability and creativity; scalability across digital and
   print media. Set in soft gray annotation typography.

7. BRAND APPLICATION MOCKUPS: Real-world application showcase including:
   business card (front and back with sunray detail), letterhead and envelope
   in warm white, mobile app icon (multiple sizes), personal website header
   and favicon, tote bag with logo print, studio signage, social media
   avatar. Flat-lay photography style with perfect lighting.

8. COLOR AND TYPOGRAPHY SPECIFICATIONS: Professional design specification
   display showing primary amber (#E85D04), secondary brown (#774936), accent
   off-white (#FFF8F0) color blocks with hex codes; typography hierarchy
   system with primary modern sans-serif and secondary humanist serif for
   Chinese text; minimum size requirements; clear-space guidelines.

Overall layout: warm off-white (#FFF8F0) background, generous white space,
Swiss/Bauhaus grid system, professional presentation quality. Elements
organized clearly with visual hierarchy — never crowded. Annotation text in
soft gray Chinese type. Modern editorial design aesthetic, similar to
Behance or Zcool portfolio presentation style.

Technical: 8K resolution, ultra-detailed, sharp and crisp, professional
graphic design portfolio quality. Mockups use flat-lay photography style
with perfect lighting. The logo itself has no gradients, no shadows (except
in mockups), no 3D rendering — pure vector aesthetic.
```

### 示例 3：餐饮品牌

用户输入：
- 品牌名称：山野食集
- 行业：餐饮 / 精品食材
- 核心符号：山峰与碗形融合
- 配色：森林绿 + 赭石
- 调性：自然、质朴、精致

```
Professional brand visual identity system design presentation board,
magazine-level editorial layout showcasing a complete brand design system.
Clean, modern composition with generous white space, Swiss/Bauhaus grid
system, professional portfolio presentation quality.

Industry: Food & Beverage / Artisanal Ingredients

Core elements arranged in a structured editorial grid:

1. PRIMARY LOGO DISPLAY (top third, centered): A timeless minimalist symbol
   featuring a mountain peak silhouette merged with a bowl shape — the
   mountain's triangular form creates the bowl's rim while negative space
   reveals a subtle grain stalk. Abstract geometric form with strong negative
   space, clean lines, visual tranquility. Paired with refined typography. The
   brand name "山野食集" rendered in a subtle, understated sans-serif typeface
   positioned below the symbol — visually softer than the mark itself, with
   carefully tuned letter-spacing and alignment. Humanized, refined, modern
   typography that never shouts, never competes with the symbol.

2. COLOR PALETTE: Forest green (#2D5016) for the primary mark, warm ochre
   (#C17B3E) for accent details, natural cream (#FAF6F0) for the canvas. Flat
   vector style, high contrast, balanced proportions. Color swatches with hex
   codes displayed in a professional specification row.

3. DESIGN GRID AREA: Display the logo's geometric construction lines and
   golden ratio reference guides, demonstrating mathematical precision and
   proportional harmony. Blueprint-style overlay showing the mountain-bowl
   fusion geometry and golden ratio proportions.

4. CONCEPT SKETCHES: 3-4 hand-drawn style exploration sketches showing the
   evolution from initial concept (mountain doodles, bowl studies, grain
   sketches) to final mountain-bowl fusion design, arranged horizontally.
   Light pencil texture on cream paper background, conveying the design
   thinking process.

5. INSPIRATION MOOD BOARD: A curated mood board containing minimalist
   landscape photography of mountains and fields, natural organic food
   forms, abstract earthy geometric patterns, forest green and ochre color
   samples, and natural wood and linen material references. 4-6 images
   arranged in an elegant grid layout.

6. CREATIVE RATIONALE TEXT: Clean typographic explanation blocks in Chinese
   covering: design philosophy of mountain-to-table connection; how the design
   serves the artisanal food brand positioning; earthy color psychology
   conveying naturalness and trust; scalability from packaging to signage.
   Set in soft gray annotation typography.

7. BRAND APPLICATION MOCKUPS: Real-world application showcase including:
   business card (front and back with mountain detail), letterhead and
   envelope in cream, mobile app icon (multiple sizes), website header and
   favicon, product packaging for artisanal food boxes, storefront signage,
   social media avatar. Flat-lay photography style with perfect lighting.

8. COLOR AND TYPOGRAPHY SPECIFICATIONS: Professional design specification
   display showing primary forest green (#2D5016), secondary ochre (#C17B3E),
   accent cream (#FAF6F0) color blocks with hex codes; typography hierarchy
   system with primary clean sans-serif and secondary calligraphic serif for
   Chinese; minimum size requirements; clear-space guidelines.

Overall layout: natural cream (#FAF6F0) background, generous white space,
Swiss/Bauhaus grid system, professional presentation quality. Elements
organized clearly with visual hierarchy — never crowded. Annotation text in
soft gray Chinese type. Modern editorial design aesthetic, similar to
Behance or Zcool portfolio presentation style.

Technical: 8K resolution, ultra-detailed, sharp and crisp, professional
graphic design portfolio quality. Mockups use flat-lay photography style
with perfect lighting. The logo itself has no gradients, no shadows (except
in mockups), no 3D rendering — pure vector aesthetic.
```

---

## 八大设计模块规范

### 模块 1: 主标志展示区

- **位置**：画面上方三分之一处居中
- **内容**：简约永恒的符号 + 精致字体设计的品牌名称
- **风格要求**：抽象几何形态、留白强烈、线条简洁、视觉平静
- **字体处理**：品牌名称采用小巧低调的无衬线字体，位于符号下方或旁边，字间距和对齐精心调整
- **禁忌**：绝不喧闹，绝不抢眼

### 模块 2: 配色方案

- **内容**：主色用于主标志，辅助色用于细节点缀，背景色用于画布
- **展示方式**：色块 + 色值编号
- **风格要求**：扁平矢量风格、高对比度、比例均衡
- **自动配色策略**：根据行业属性从配色速查表中选取

### 模块 3: 设计网格区域

- **内容**：标志的几何构造线和黄金比例参考线
- **目的**：体现数学精准性和比例和谐美
- **展示方式**：蓝图风格叠加层

### 模块 4: 概念草图板块

- **内容**：3-4 张手绘风格的探索草图
- **排列**：横向排列
- **风格**：浅色铅笔质感、米色纸张底纹
- **叙事**：展示从初始创意到最终定稿的演变过程

### 模块 5: 灵感来源板

- **内容**：精心策划的情绪板
- **元素**：极简主义建筑摄影、自然形态、抽象几何图案、色彩样本、材质参考
- **排列**：4-6 张图片以雅致网格排列
- **关联性**：均与核心符号概念相关

### 模块 6: 创意理念说明文字块

- **语言**：准确中文渲染
- **内容**：
  - 设计哲学和符号意义
  - 该设计如何服务品牌定位
  - 色彩心理学和视觉策略
  - 可扩展性和多场景适应性
- **排版**：整洁的排版说明，柔和灰色字体

### 模块 7: 品牌应用样机区

- **展示方式**：真实场景应用展示，平铺摄影风格
- **包含场景**：
  - 名片（正反面）
  - 信纸信封
  - 手机 APP 图标（多种尺寸）
  - 网站页眉 / 网站图标
  - 产品包装或购物袋
  - 标识牌或店面门头
  - 社交媒体头像

### 模块 8: 色彩与字体规范

- **内容**：
  - 主色、辅助色、强调色色块及色值编号
  - 字体层级系统（主字体和辅助字体）
  - 最小使用尺寸要求
  - 安全留白区域指引

---

## 技术规格（强制挂载）

所有生成的提示词**必须**包含以下技术规格：

```
Technical: 8K resolution, ultra-detailed, sharp and crisp, professional
graphic design portfolio quality. Mockups use flat-lay photography style
with perfect lighting. The logo itself has no gradients, no shadows (except
in mockups), no 3D rendering — pure vector aesthetic.
```

**关键约束**：
- `8K resolution` — 超高分辨率
- `ultra-detailed` — 超高细节
- `sharp and crisp` — 清晰锐利
- `professional graphic design portfolio quality` — 专业平面设计作品集品质
- `pure vector aesthetic` — 纯矢量美学
- `no gradients, no shadows (except in mockups), no 3D rendering` — 标志本身无渐变无阴影（样机除外）

## 布局风格（强制挂载）

所有提示词**必须**包含以下布局声明：

```
Overall layout: [背景色] background, generous white space, Swiss/Bauhaus
grid system, professional presentation quality. Elements organized clearly
with visual hierarchy — never crowded. Annotation text in soft gray Chinese
type. Modern editorial design aesthetic, similar to Behance or Zcool
portfolio presentation style.
```

---

## 与其他技能协同

- **image_tools**：本技能构建的提示词通过 `generate_image` 工具执行实际图像生成
- **Image_Prompt_Optimizer**：本技能的提示词已遵循叙事化优先、英文优先、防崩兜底等核心原则，可与 Image_Prompt_Optimizer 的通用优化流程叠加使用
- **Photography_Scene_Design**：品牌应用样机区可叠加摄影器材参数增强样机真实感

## 强制约束

- **八大模块完整性**：主标志 / 配色 / 设计网格 / 概念草图 / 灵感板 / 创意理念 / 应用样机 / 色彩字体规范 —— 不可删减
- **英文优先原则**：最终提示词写为英文（创意理念说明文字块除外，该模块需要中文渲染）
- **叙事化优先**：每个模块以完整段落描述，禁止关键词堆砌
- **技术规格强制**：必须包含 `8K resolution, ultra-detailed, sharp and crisp` 和 `pure vector aesthetic` 声明
- **布局风格强制**：必须包含 `Swiss/Bauhaus grid system` + `generous white space` 声明
- **标志美学约束**：必须包含 `no gradients, no shadows (except in mockups), no 3D rendering` 声明
- **配色声明**：提示词中必须明确主色、辅助色、背景色的色值编号
- **工具调用强制**：提示词构建完成后必须调用 `generate_image` 工具，不可仅输出提示词文本
- **变量填充检查**：所有占位符 `[方括号]` 必须被实际内容替换，不可残留模板变量

## 常见错误与避坑指南

1. **模块遗漏**：仅描述标志本身而忽略配色规范、应用样机等其他模块 —— 必须包含全部八大模块
2. **关键词堆砌**：`"logo, brand, minimal, clean, 8k"` —— 必须改为完整叙事化段落
3. **配色未指定色值**：仅说"蓝色"而非"deep navy blue (#1A2B4C)" —— 必须包含具体色值
4. **标志添加渐变/阴影**：提示词中要求标志有 3D 效果或渐变 —— 标志本身必须为纯矢量美学
5. **画幅选择错误**：使用 `1:1` 导致展示板内容拥挤 —— 默认使用 `16:9` 横版以容纳八大模块
6. **创意理念模块未用中文**：说明文字块使用英文 —— 该模块必须为中文渲染
7. **灵感板与符号概念脱节**：灵感板内容与标志核心概念无关 —— 灵感板元素必须与核心符号概念相关联
8. **工具调用缺失**：仅输出提示词文本而未调用 `generate_image` —— 必须调用工具完成生成
