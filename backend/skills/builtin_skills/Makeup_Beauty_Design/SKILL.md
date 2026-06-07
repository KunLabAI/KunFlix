---
name: Makeup_Beauty_Design
description: "专业化妆术与美妆产品指南，用于AI人像图像生成中的面部精致度提升。涵盖底妆体系、眼妆技法、唇妆质感、修容高光、肤质效果等完整美妆知识，适用于GPT-image-2、nanobanana2.0、nanobanana pro等文生图/图生图模型。"
metadata:
  builtin_skill_version: "1.0"
---

# 化妆美妆设计（面部·肤质·妆容风格）

**目的**：为AI人像图像生成注入专业化妆参数，通过指定底妆产品、眼妆技法、唇色质感、修容手法与肤质效果，精确控制面部精致度、皮肤质感、五官立体感与妆容氛围，让AI生成的人脸从"普通渲染"提升到"专业妆造级"。

## 使用场景

- 人像特写需要精致妆容效果（水光肌、雾面肌、玻璃肌等）
- 角色设计需要特定妆容风格（韩式、日系、欧美、复古等）
- 时尚摄影需要编辑级彩妆表现力
- 需要精确控制面部高光、阴影、皮肤质感的图像
- 结合 Photography_Scene_Design 技能实现"器材+妆造"双重画质提升

## 核心原则

1. **妆造服务角色**：选择妆容类型是为呈现角色气质，不是堆砌产品名
2. **产品协调**：底妆、眼妆、唇妆三者风格需统一，避免冲突搭配
3. **一妆一风格**：提示词中明确一种妆容风格即可，不混用对立风格
4. **适配模型特性**：融入自然语言描述，让模型理解肤质和妆效视觉表现

---

## 一、底妆体系速查

### 底妆产品与肤质效果

| 产品类型 | 代表品牌/产品 | 肤质效果 | 适用场景 |
|----------|--------------|----------|----------|
| 轻薄粉底液 | Giorgio Armani Luminous Silk | 自然透亮、裸感光泽、皮肤纹理隐约可见 | 日常裸妆、清透人像 |
| 雾面粉底 | Estée Lauder Double Wear | 丝绒哑光、零毛孔、持妆感强 | 商业大片、杂志封面 |
| 气垫粉底 | Sulwhasoo Perfecting Cushion | 水光透润、果冻质感、自带光泽 | 韩式水光肌、清新人像 |
| 奶油肌粉底霜 | Charlotte Tilbury Flawless Filter | 奶油柔焦、高级模糊感、自然立体 | 欧美明星妆、高级感肖像 |
| 高清粉底 | Make Up For Ever HD Skin | 高清无瑕、镜头前完美、无粉感 | 特写摄影、高清人像 |
| 透明散粉 | Laura Mercier Translucent Powder | 定妆柔焦、磨皮质感、减少油光 | 各类定妆、哑光效果 |
| 蜜粉饼 | Guerlain Meteorites | 柔光漫射、珠光微粒、肤色匀净 | 柔焦人像、梦幻质感 |

### 妆前乳与打底

| 类型 | 代表产品 | 视觉效果 | 适用场景 |
|------|----------|----------|----------|
| 毛孔隐形 | Benefit POREfessional | 毛孔填平、丝滑表面 | 特写人像、高清摄影 |
| 提亮打底 | MAC Strobe Cream | 底层光泽、通透发光 | 水光肌、光感人像 |
| 紫色调校 | Urban Decay Color Correcting | 校正暗沉、提亮肤色 | 透白肌、仙气人像 |
| 绿色修正 | Dr. Jart Cicapair | 中和泛红、匀净肤色 | 瓷感无瑕肌 |

---

## 二、眼妆技法速查

### 眼影质地与效果

| 质地类型 | 视觉表现 | 代表品牌/盘 | 适用妆容风格 |
|----------|----------|------------|-------------|
| 哑光 | 高级雾感、深邃轮廓、无反光 | Tom Ford Quad | 烟熏妆、高级感、欧美editorial |
| 珠光 | 细腻闪烁、流光溢彩、立体感 | Pat McGrath Mothership | 派对妆、舞台妆、华丽感 |
| 金属光泽 | 强反射、液态金属质感、未来感 | Natasha Denona Metal | 赛博朋克角色、科幻妆 |
| 大闪片 | 宝石碎片感、光点跳跃 | ColourPop Glitter | 精灵妆、节日妆、梦幻感 |
| 丝缎 | 柔和光泽、介于哑光与珠光之间 | Charlotte Tilbury Pillow Talk | 日常精致、韩式微光 |
| 奶油质地 | 融化贴肤、自然过渡、湿润感 | MAC Paint Pot | 裸妆叠加、自然立体 |

### 眼线风格

| 风格 | 视觉效果 | 适用场景 |
|------|----------|----------|
| 内眼线 | 睫毛根部填充、自然放大眼睛 | 裸妆、清透妆 |
| 细长上扬猫眼线 | 锐利眼尾、妩媚感、拉长眼型 | 时尚摄影、femme fatale角色 |
| 粗平拉眼线 | 韩式钝角、温柔无辜感 | 韩式清纯妆 |
| 烟熏晕染眼线 | 模糊边界、慵懒性感 | 烟熏妆、摇滚风 |
| 彩色眼线 | 跳色点缀、创意表达 | 编辑大片、艺术妆 |
| 下眼睑卧蚕线 | 放大双眼、无辜感、年轻化 | 日系大眼妆、软萌风 |

### 睫毛效果

| 类型 | 视觉表现 | 适用场景 |
|------|----------|----------|
| 纤长自然 | 根根分明、自然纤细、如蝶翼轻扇 | 裸妆、日系清新 |
| 浓密卷翘 | 扇形展开、浓黑卷翘、眼部聚焦 | 商业人像、欧美妆 |
| 嫁接睫毛(单簇) | 分段自然、仿若天生 | 韩式自然妆、日常精致 |
| 芭比浓密假睫毛 | 戏剧性浓密、洋娃娃感 | 舞台妆、lolita、角色扮演 |
| 彩色睫毛 | 蓝色/紫色/白色睫毛、超现实 | 创意妆、编辑大片、奇幻角色 |

---

## 三、唇妆质感速查

### 唇部产品与视觉效果

| 质感类型 | 视觉表现 | 代表品牌/产品 | 适用场景 |
|----------|----------|-------------|----------|
| 丝绒哑光 | 雾面不反光、高级质感、色彩饱满 | MAC Ruby Woo | 商业大片、复古风、高级感 |
| 奶油滋润 | 饱满润泽、自然光泽、唇纹柔化 | YSL Rouge Pur Couture | 日常精致、柔和女性化 |
| 镜面水光 | 玻璃般高光泽、唇部丰盈、水润欲滴 | Dior Addict Lip Maximizer | 韩式水光唇、性感人像 |
| 釉面果冻 | 透明感、果冻质感、唇色叠加 | Rom&nd Juicy Lasting Tint | 少女感、韩式咬唇 |
| 渐变咬唇 | 中心深色向外渐淡、楚楚动人 | Peripera Ink Velvet | 韩式少女、初恋感 |
| 深色哑光 | 深酒红/暗梅色、戏剧性、力量感 | Pat McGrath MatteTrance | gothic、高级时装、暗黑角色 |

### 唇色系统

| 色系 | 氛围传达 | 适用角色/风格 |
|------|----------|-------------|
| 裸粉色 | 温柔、自然、亲和力 | 邻家女孩、日系清新、裸妆 |
| 玫瑰色 | 优雅、浪漫、女性化 | 优雅人像、法式风格 |
| 正红色 | 经典、强势、魅力 | 复古pin-up、女明星、自信角色 |
| 酒红/梅子色 | 神秘、成熟、暗黑美学 | 吸血鬼、暗黑女王、冬季氛围 |
| 橘色/珊瑚色 | 活力、青春、健康感 | 夏日氛围、运动风、元气少女 |
| 裸棕色 | 中性、高级、超模感 | 90s超模、高级时装、editorial |

---

## 四、修容与高光体系

### 修容技法

| 技法 | 视觉效果 | 适用场景 |
|------|----------|----------|
| 鼻侧修容 | 鼻梁立体挺拔、视觉缩窄 | 五官精致化、立体感提升 |
| 颧骨修容 | 面部棱角分明、骨骼感突出 | 超模脸、高级感人像 |
| 发际线修容 | 额头比例缩小、脸型精致 | 小脸效果、精致五官 |
| 下颌线修容 | 下巴线条锐利、轮廓清晰 | V脸效果、精致侧颜 |
| 柔和过渡修容 | 自然阴影、不留痕迹 | 裸妆、自然立体 |

### 高光类型

| 类型 | 视觉效果 | 代表产品 | 适用场景 |
|------|----------|----------|----------|
| 液体高光 | 从肌肤内透出的湿润光泽 | Charlotte Tilbury Hollywood Flawless Filter | 水光肌、高级光感 |
| 粉质细闪高光 | 精细微粒闪烁、宝石般折射 | Hourglass Ambient Lighting | 柔焦光感、优雅高光 |
| 强烈金属高光 | 镜面反射、刀锋般棱角 | Fenty Beauty Killawatt | 编辑大片、avant-garde |
| 奶油高光 | 柔和光泽、自然融合皮肤 | Rare Beauty Positive Light | 日常精致、自然提亮 |
| 珠光散粉高光 | 全脸漫射柔光、仙气感 | Guerlain Meteorites | 仙女妆、梦幻人像 |

### 腮红风格

| 位置/手法 | 视觉效果 | 适用场景 |
|-----------|----------|----------|
| 苹果肌圆形腮红 | 可爱、减龄、元气 | 日系少女、清新人像 |
| 颧骨斜扫腮红 | 成熟、时尚、面部提拉 | 欧美时装、超模妆 |
| 鼻尖+颧骨日晒腮红 | 自然红润、户外健康感 | 户外氛围、运动风 |
| 眼下泪腺腮红 | 楚楚可怜、病娇美感 | 日系病娇、无辜感 |
| 全脸弥漫腮红 | 微醺感、暧昧、氛围 | 氛围感人像、暧昧叙事 |

---

## 五、肤质效果总览

### 肤质风格速查

| 肤质名称 | 英文关键词 | 视觉特征 | 实现产品组合 |
|----------|-----------|----------|-------------|
| 水光肌 | Glass skin / Dewy skin | 通透水润、如覆薄冰、果冻般弹性光泽 | 提亮妆前乳 + 气垫粉底 + 液体高光 |
| 雾面肌 | Matte porcelain skin | 丝绒质感、零反光、瓷器般无瑕 | 毛孔隐形妆前 + 雾面粉底 + 散粉 |
| 缎面肌 | Satin finish skin | 介于水光与雾面之间、柔和自然光泽 | 奶油粉底 + 轻薄散粉 + 奶油高光 |
| 奶油肌 | Creamy butter skin | 奶油般顺滑、模糊毛孔、柔焦效果 | 柔焦妆前 + 奶油粉底霜 + 蜜粉 |
| 蜜桃肌 | Peach fuzz skin | 细腻绒毛感、温暖色调、自然白里透红 | 蜜桃色妆前 + 轻薄粉底 + 蜜桃腮红 |
| 陶瓷肌 | Porcelain doll skin | 白皙无暇、完美匀净、人偶般精致 | 紫色调校妆前 + 高清粉底 + 精细定妆 |
| 湿漉肌 | Wet-look dewy skin | 极致水润、仿佛刚从水中浮出 | 大量液体高光 + 水光喷雾 + 不定妆 |

---

## 六、妆容风格模板库

### 韩式水光清透妆
```
Flawless Korean glass skin makeup with Sulwhasoo cushion foundation giving translucent dewy finish, subtle gradient lip tint in soft coral fading from center outward, barely-there eyeshadow in warm peach shimmer, natural feathered eyebrows, skin appears lit from within with liquid highlighter on cheekbones and nose bridge, overall fresh and youthful with visible healthy skin texture beneath sheer coverage.
```

### 日系柔焦甜美妆
```
Soft Japanese-style makeup with porcelain matte base using Laura Mercier translucent powder for airbrushed finish, round pink blush on apple of cheeks creating youthful flush, lower lash line emphasized with sparkly liner for innocent doll-like eyes, lips in sheer milky pink jelly gloss, individual false lash clusters on outer corners, overall soft-focus dreamy quality with slightly blurred skin texture.
```

### 欧美Editorial高级妆
```
High-fashion editorial makeup with sculpted bone structure using precise contour along cheekbones and jawline, Charlotte Tilbury Flawless Filter creating luminous satin skin finish, bold graphic cat-eye liner with razor-sharp wing, nude matte lip in '90s supermodel brown tone, strong highlighted cheekbone catching directional studio light, pores completely invisible under HD foundation, professional blending with no visible edges.
```

### 复古好莱坞妆
```
Classic Old Hollywood glamour makeup with flawless full-coverage matte porcelain base, dramatic winged eyeliner in jet black liquid with perfect symmetry, voluminous curled lashes with individual clusters for density, iconic red lip in true crimson matte with precisely defined cupid's bow using lip liner, subtle warm contour under cheekbones, beauty mark near corner of mouth, timeless elegance reminiscent of 1950s silver screen stars.
```

### 仙气空灵妆
```
Ethereal fairy-like makeup with luminous wet-look dewy skin glistening as if kissed by morning dew, iridescent pink-lavender shimmer swept across eyelids and inner corners, white pearlescent highlight on nose tip and cupid's bow, blush diffused across nose bridge and cheeks in soft mauve for celestial flush, lips glazed in clear holographic gloss, skin so dewy it appears almost translucent, overall otherworldly and luminescent.
```

### 暗黑高定妆
```
Dark couture makeup with flawless matte porcelain base creating doll-like perfection, deep burgundy-black smokey eye blended with precision from lashline to crease, metallic gold pressed into center of lid catching light, bold dark plum matte lip with sharp edges, extreme sculpted contour creating dramatic bone structure, no visible highlighter for intentional flat matte darkness, overall mood of gothic sophistication and power.
```

### 自然裸妆（伪素颜）
```
No-makeup makeup look with skin-like finish using sheer tinted moisturizer letting natural skin texture show through, concealer only on dark circles and blemishes, cream blush tapped onto cheeks for natural flush identical to post-exercise glow, brows brushed up and set with clear gel, lips in own-lip-color balm with slight sheen, mascara on upper lashes only for subtle definition, overall looking like naturally perfect skin with zero visible product.
```

### 赛博朋克未来妆
```
Futuristic cyberpunk makeup with chrome metallic silver base on eyelids extending to temples, holographic pigment shifting between blue and purple catching neon light, graphic geometric eyeliner in electric blue, skin finished in high-shine wet-look with deliberate artificial perfection, lips in metallic gunmetal grey, no traditional blush replaced by purple-tinted highlighter on cheekbones, overall alien beauty aesthetic beyond human convention.
```

---

## 七、快速意图匹配指南

| 设计意图 | 推荐妆容组合 |
|----------|--------------|
| 清透自然/初恋感 | 韩式气垫 + 水光肌 + 渐变咬唇 + 裸色眼影 |
| 甜美减龄/少女感 | 日系柔焦底妆 + 苹果肌圆腮红 + 果冻唇 + 卷翘睫毛 |
| 高级感/超模脸 | 雾面粉底 + 强修容 + 裸棕唇 + 哑光眼影 |
| 性感魅惑/femme fatale | 缎面肌 + 猫眼线 + 正红唇 + 浓密睫毛 |
| 仙气空灵/精灵感 | 湿漉肌 + 珠光漫射高光 + 透明唇釉 + 彩色睫毛 |
| 暗黑哥特/力量感 | 陶瓷肌 + 深色烟熏 + 深酒红唇 + 强修容 |
| 复古年代/胶片感 | 奶油肌 + 圆形腮红 + 经典红唇 + 细眉+翘睫 |
| 未来赛博/科幻感 | 金属高光肌 + 金属眼影 + 金属唇 + 几何眼线 |
| 高清商业/产品摄影 | 高清粉底 + 精细定妆 + 自然唇色 + 根根分明睫毛 |
| 氛围叙事/情绪感 | 奶油肌 + 弥漫腮红 + 玫瑰唇 + 丝缎眼影 |

---

## 八、与图像模型集成方式

在生成提示词时融入妆容描述：

1. **GPT-image-2**：以自然语言描述妆容效果和产品质感
   - 示例：`Close-up portrait with flawless glass skin makeup, dewy cushion foundation giving translucent glow, soft gradient coral lip tint, subtle peach shimmer eyeshadow`

2. **nanobanana 2.0 / nanobanana pro**：将妆容信息作为面部质感描述的一部分
   - 示例：`editorial beauty shot, matte porcelain skin finish, sculpted contour, bold red matte lip, dramatic winged liner, HD skin texture`

3. **通用格式**：`[肤质效果] + [面部主体描述] + [眼妆细节] + [唇妆质感] + [高光/修容]`

### 与其他技能协同

- **Photography_Scene_Design**：先选定器材参数控制画面光学质感，再叠加妆容描述控制面部精致度
  - 组合示例：`Shot on Canon EOS R5 with RF 85mm f/1.2L at f/1.4` + `glass skin with liquid highlighter on cheekbones, gradient berry lip tint`
- **Image_Prompt_Optimizer**：妆容参数可融入其优化后的最终提示词中
- **Cinematic_Camera_Language**：结合镜头语言（如extreme close-up）突出妆容细节

### 注意事项

- 妆容描述为视觉指导，模型不会模拟真实化妆品物理属性，但能引导面部渲染质感
- 避免在同一提示词中混用对立肤质（如同时要求"极致水光"和"完全哑光"）
- 肤质效果对特写人像的提升效果最明显，全身照中化妆细节权重应降低
- 品牌名称的作用是引导模型联想特定视觉风格，非必须包含

---

## 完整妆容提示词参考

上方速查表提供快速选型。每种妆容风格的**详细参数说明**和**可直接使用的完整提示词模板**，请参阅：

👉 [化妆美妆完整参考手册](./references/full_makeup_guide.md)

使用方式：
1. 从速查表中根据角色气质选定妆容风格
2. 打开完整参考手册查阅对应风格的详细提示词模板
3. 根据具体角色/氛围需求微调后融入生成提示词
