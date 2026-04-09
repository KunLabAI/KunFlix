## 提示指南和策略
要掌握图片生成，首先要了解一个基本原则：
描述场景，而不仅仅是列出关键字。 该模型的核心优势在于其深厚的语言理解能力。与一连串不相关的字词相比，叙述性、描述性段落几乎总是能生成更好、更连贯的图片。

### 用于生成图片的提示
以下策略将帮助您创建有效的提示，以生成您想要的图片。

#### 1. 逼真场景
对于逼真的图片，请使用摄影术语。提及拍摄角度、镜头类型、光线和细节，引导模型生成逼真的效果。

模板

```
A photorealistic [shot type] of [subject], [action or expression], set in
[environment]. The scene is illuminated by [lighting description], creating
a [mood] atmosphere. Captured with a [camera/lens details], emphasizing
[key textures and details]. The image should be in a [aspect ratio] format.
``` 

#### 2. 风格化插图和贴纸
如需创建贴纸、图标或素材资源，请明确说明样式并要求使用白色背景。

模板

```
A [style] sticker of a [subject], featuring [key characteristics] and a
[color palette]. The design should have [line style] and [shading style].
The background must be white.
```

#### 3. 图片中的文字准确无误
在呈现文本方面表现出色。清楚说明文字、字体样式（描述性）和整体设计。

模板
```
Create a [image type] for [brand/concept] with the text "[text to render]"
in a [font style]. The design should be [style description], with a
[color scheme].
```

#### 4. 产品模型和商业摄影
非常适合为电子商务、广告或品牌宣传拍摄清晰专业的商品照片。

模板
```
A high-resolution, studio-lit product photograph of a [product description]
on a [background surface/description]. The lighting is a [lighting setup,
e.g., three-point softbox setup] to [lighting purpose]. The camera angle is
a [angle type] to showcase [specific feature]. Ultra-realistic, with sharp
focus on [key detail]. [Aspect ratio].
```

#### 5. 极简风格和负空间设计
非常适合用于为网站、演示文稿或营销材料创建背景，以便在其中叠加文字。

模板

``` 
A minimalist composition featuring a single [subject] positioned in the
[bottom-right/top-left/etc.] of the frame. The background is a vast, empty
[color] canvas, creating significant negative space. Soft, subtle lighting.
[Aspect ratio].
``` 

#### 6. 连续艺术（漫画分格 / 故事板）
以角色一致性和场景描述为基础，为视觉故事讲述创建分格。

模板

```
Make a 3 panel comic in a [style]. Put the character in a [type of scene].
```

### 用于修改图片的提示
以下示例展示了如何提供图片以及文本提示，以进行编辑、构图和风格迁移。

#### 1. 添加和移除元素
提供图片并描述您的更改。模型将与原始图片的风格、光照和透视效果保持一致。

模板
```
Using the provided image of [subject], please [add/remove/modify] [element]
to/from the scene. Ensure the change is [description of how the change should
integrate].
```

#### 2. 局部重绘（语义遮盖）
通过对话定义“蒙版”，修改图片的特定部分，同时保持其余部分不变。

模板
```
Using the provided image, change only the [specific element] to [new
element/description]. Keep everything else in the image exactly the same,
preserving the original style, lighting, and composition.
```

#### 3. 风格迁移
提供一张图片，要求模型以不同的艺术风格重现其内容。

模板
```
Transform the provided photograph of [subject] into the artistic style of [artist/art style]. Preserve the original composition but render it with [description of stylistic elements].
```

#### 4. 高级合成：组合多张图片
提供多张图片作为上下文，以创建新的合成场景。此功能非常适合制作产品视觉稿或创意拼图。

模板
```
Create a new image by combining the elements from the provided images. Take
the [element from image 1] and place it with/on the [element from image 2].
The final image should be a [description of the final scene].
```

#### 5. 高保真细节保留
为确保在编辑过程中保留关键细节（例如面部或徽标），请在编辑请求中详细描述这些细节。

模板
```
Using the provided images, place [element from image 2] onto [element from
image 1]. Ensure that the features of [element from image 1] remain
completely unchanged. The added element should [description of how the
element should integrate].
```

#### 6. 让事物焕发活力
上传草图或简笔画，然后让模型将其细化为成品图片。

模板
```
Turn this rough [medium] sketch of a [subject] into a [style description]
photo. Keep the [specific features] from the sketch but add [new details/materials].
```

#### 7. 角色一致性：360 度全景
您可以迭代提示不同的角度，从而生成角色的 360 度视图。为获得最佳效果，请在后续提示中添加之前生成的图片，以保持一致性。对于复杂的姿势，请添加所需姿势的参考图片。

模板
```
您可以迭代提示不同的角度，从而生成角色的 360 度视图。为获得最佳效果，请在后续提示中添加之前生成的图片，以保持一致性。对于复杂的姿势，请添加所需姿势的参考图片。
```

### 最佳做法
如需将结果从“好”提升到“优秀”，请将以下专业策略融入您的工作流程。

- 内容要非常具体：您提供的信息越详细，对输出结果的掌控程度就越高。与其使用“奇幻盔甲”，不如具体描述为“华丽的精灵板甲，蚀刻着银叶图案，带有高领和猎鹰翅膀形状的肩甲”。

- 提供上下文和意图：说明图片的用途。模型对上下文的理解会影响最终输出。例如，“为高端极简护肤品牌设计徽标”的效果要好于“设计徽标”。

- 迭代和优化：不要指望第一次尝试就能生成完美的图片。利用模型的对话特性进行小幅更改。然后，您可以继续发出提示，例如“效果不错，但能让光线更暖一些吗？”或“保持所有内容不变，但让角色的表情更严肃一些。”

- 使用分步指令：对于包含许多元素的复杂场景，请将提示拆分为多个步骤。“首先，创建一个宁静、薄雾弥漫的黎明森林的背景。然后，在前景中添加一个长满苔藓的古老石制祭坛。最后，将一把发光的剑放在祭坛顶部。”

- 使用“语义负面提示”：不要说“没有汽车”，而是通过说“一条没有交通迹象的空旷、荒凉的街道”来正面描述所需的场景。

- 控制镜头：使用摄影和电影语言来控制构图。例如wide-angle shot、macro shot、low-angle perspective等字词。

### 限制与局限
- 为获得最佳性能，请使用以下语言：英语、ar-EG、de-DE、es-MX、fr-FR、hi-IN、id-ID、it-IT、ja-JP、ko-KR、pt-BR、ru-RU、ua-UA、vi-VN、zh-CN。

- 图片生成不支持音频或视频输入。

- 模型不一定会生成用户明确要求的确切数量的图片输出。
