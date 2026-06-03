---
name: Music_Composition_Guide
description: "专业音乐创作与编曲指南，用于AI音乐生成。涵盖曲风流派、乐器配置、节拍调性、歌词编写、音乐结构设计等核心创作要素，适配 Lyria 3、Suno、Udio 等主流音乐生成模型。"
metadata:
  builtin_skill_version: "1.0"
---

# 音乐创作与编曲指南

**目的**：为AI音乐生成注入专业音乐创作知识，通过精确描述曲风、乐器编制、节拍调性、歌曲结构与情绪走向，使生成的音乐具备专业编曲水准与情感表达力。

## 使用场景

- 创作完整歌曲（含人声与歌词）
- 生成纯器乐配乐（电影配乐、游戏BGM、氛围音乐）
- 为视频/场景匹配背景音乐
- 需要特定音乐风格与编曲质感的创作
- 设计音乐结构（前奏、主歌、副歌、桥段编排）

## 核心原则

1. **风格决定一切**：先确定音乐流派，再匹配乐器、节拍、调性
2. **结构服务叙事**：歌曲结构编排需服务情感递进，避免平铺直叙
3. **参数协调统一**：BPM、调性、乐器编制三者需风格内自洽
4. **一次一风格**：单首作品聚焦一个核心风格，融合不超过两种亚类型

---

## 一、音乐流派速查

### 主流流行类

| 流派 | BPM范围 | 核心乐器 | 情绪特征 | 适用场景 |
|------|---------|----------|----------|----------|
| Pop | 100-130 | 合成器、电吉他、鼓机、贝斯 | 明亮、积极、易上口 | 日常BGM、广告、短视频 |
| R&B/Soul | 60-100 | 电钢琴、合成Pad、指弹贝斯、刷子鼓 | 柔和、性感、深情 | 夜景、情感叙事、浪漫场景 |
| Indie Pop | 110-140 | 原声吉他、合成器、手鼓、铃鼓 | 清新、文艺、慵懒 | 生活类视频、旅行vlog |
| Funk | 100-130 | Slap贝斯、Wah吉他、铜管、Clavinet | 律动强、欢快、性感 | 舞蹈、趣味内容、动态场景 |

### 电子音乐类

| 流派 | BPM范围 | 核心乐器 | 情绪特征 | 适用场景 |
|------|---------|----------|----------|----------|
| EDM/House | 124-130 | 合成器Lead、超级锯齿波、Sub Bass、4-on-the-floor鼓 | 能量感、亢奋 | 运动、派对、高能场景 |
| Lo-Fi Hip Hop | 70-90 | 采样钢琴、磁带Hiss、vinyl噪音、采样鼓loop | 放松、怀旧、温馨 | 学习、冥想、雨天氛围 |
| Synthwave | 80-120 | 模拟合成器、琶音器、Side-chain Bass、电子鼓 | 复古未来、赛博感 | 科幻场景、夜间城市、游戏 |
| Ambient | 60-80 | Pad合成器、颗粒合成、田野录音、反转混响 | 空灵、冥想、广阔 | 太空场景、冥想、自然环境 |
| Drum & Bass | 160-180 | Reese Bass、Amen Break采样、合成Lead | 紧张、速度感 | 追逐场景、极限运动 |
| Techno | 130-150 | 909鼓机、酸性合成器、工业采样 | 机械、冷峻、催眠 | 工业场景、地下派对 |

### 摇滚/金属类

| 流派 | BPM范围 | 核心乐器 | 情绪特征 | 适用场景 |
|------|---------|----------|----------|----------|
| Rock | 110-140 | 失真电吉他、贝斯、架子鼓、偶尔钢琴 | 力量、激情、叛逆 | 运动、热血、对抗场景 |
| Metal | 120-200 | 重失真吉他、双踩鼓、低音Drop调弦 | 暴烈、史诗、黑暗 | 战斗、末日、极端场景 |
| Post-Rock | 100-140 | 延迟吉他、反转吉他、弓弦贝斯、密集鼓 | 渐进、壮阔、忧郁 | 风光、情感高潮、思考场景 |
| Punk | 150-200 | 简洁Power Chord、快速鼓点、粗糙音色 | 反叛、直接、愤怒 | 街头、青春、抗议 |

### 古典/管弦类

| 流派 | BPM范围 | 核心乐器 | 情绪特征 | 适用场景 |
|------|---------|----------|----------|----------|
| Orchestral Epic | 80-140 | 弦乐组、铜管组、定音鼓、合唱团 | 宏大、壮丽、英雄 | 预告片、战争、史诗叙事 |
| Chamber Music | 60-120 | 弦乐四重奏、钢琴、长笛、大提琴 | 优雅、细腻、内省 | 高端品牌、文艺、戏剧 |
| Neoclassical | 70-120 | 钢琴、弦乐、极简电子元素 | 忧郁、空灵、电影感 | 情感叙事、独白、回忆 |
| Film Score (Action) | 120-160 | 全管弦乐团、打击乐组、电子低音 | 紧张、英雄、激烈 | 动作片、追逐、决战 |

### 爵士/布鲁斯类

| 流派 | BPM范围 | 核心乐器 | 情绪特征 | 适用场景 |
|------|---------|----------|----------|----------|
| Jazz (Swing) | 120-160 | 钢琴三重奏、小号、萨克斯、Walking Bass | 优雅、即兴、活泼 | 餐厅、复古场景、城市夜景 |
| Bossa Nova | 100-130 | 尼龙弦吉他、轻柔打击、贝斯、钢琴 | 浪漫、慵懒、阳光 | 海滩、咖啡馆、午后 |
| Blues | 60-120 | 布鲁斯吉他、口琴、Hammond风琴、Shuffle鼓 | 忧伤、沧桑、深情 | 公路、酒吧、情感独白 |

### 世界音乐/民族类

| 流派 | BPM范围 | 核心乐器 | 情绪特征 | 适用场景 |
|------|---------|----------|----------|----------|
| Chinese Traditional | 60-120 | 古筝、笛子、二胡、琵琶、扬琴 | 古典、诗意、悠远 | 中国风场景、武侠、山水 |
| Japanese | 80-120 | 三味线、尺八、太鼓、筝 | 禅意、宁静、仪式感 | 日式美学、禅修、自然 |
| Celtic | 100-140 | 爱尔兰笛、竖琴、手风琴、Bodhrán鼓 | 田园、冒险、神秘 | 奇幻、冒险、田园风光 |
| Latin | 90-130 | 康加鼓、邦戈鼓、小号、古典吉他、铃铛 | 热情、律动、奔放 | 舞蹈、节庆、热带场景 |

---

## 二、乐器配置详解

### 节奏组（Rhythm Section）

| 乐器 | 角色 | 音色特征 | 流派适配 |
|------|------|----------|----------|
| 架子鼓 (Acoustic Drums) | 节拍骨架 | 温暖、有机、动态丰富 | Rock、Pop、Jazz、Funk |
| 电子鼓/鼓机 (Drum Machine) | 精准节奏 | 干净、精准、合成质感 | EDM、Hip Hop、Synthwave |
| 808鼓 (TR-808) | 低频冲击 | 深沉Sub、弹性Kick | Hip Hop、Trap、R&B |
| 909鼓 (TR-909) | 4-on-the-floor | 经典嘶声Hi-hat、punchy kick | House、Techno、Dance |
| 贝斯 (Electric Bass) | 低频基础 | 温暖、饱满、律动驱动 | 全流派通用 |
| Slap Bass | 律动打击 | 明亮、弹性、攻击性 | Funk、Disco、Pop |
| 合成贝斯 (Synth Bass) | 电子低频 | 厚重、可塑性强 | EDM、Synthwave、Pop |

### 和声/旋律乐器

| 乐器 | 角色 | 音色特征 | 流派适配 |
|------|------|----------|----------|
| 原声钢琴 (Acoustic Piano) | 和声+旋律 | 温暖、共鸣丰富、表现力强 | Jazz、Classical、Ballad |
| 电钢琴 (Rhodes/Wurlitzer) | 温暖和声 | 圆润、温暖、颤音质感 | R&B、Neo Soul、Lo-Fi |
| 合成器Lead (Synth Lead) | 主旋律 | 明亮、穿透力强 | EDM、Synthwave、Pop |
| 合成器Pad (Synth Pad) | 氛围铺底 | 宽广、持续、空灵 | Ambient、Chill、Film |
| 原声吉他 (Acoustic Guitar) | 和弦/指弹 | 温暖、有机、亲切 | Folk、Pop、Bossa Nova |
| 电吉他 (Clean) | 清澈旋律 | 明亮、颗粒感、空间感 | Indie、Jazz、Funk |
| 电吉他 (Distortion) | 力量和弦 | 厚重、攻击性、饱和 | Rock、Metal、Punk |

### 管弦乐器

| 乐器组 | 成员 | 角色 | 情感表达 |
|--------|------|------|----------|
| 弦乐组 (Strings) | 小提琴、中提琴、大提琴、低音提琴 | 情感核心、和声层 | 壮丽→悲伤→温柔全频谱 |
| 木管组 (Woodwinds) | 长笛、双簧管、单簧管、巴松 | 色彩点缀、旋律 | 田园、梦幻、叙事 |
| 铜管组 (Brass) | 小号、法国号、长号、大号 | 力量、辉煌 | 英雄、宣告、壮阔 |
| 打击乐组 (Percussion) | 定音鼓、军鼓、钹、三角铁 | 节奏强化、高潮推动 | 史诗、仪式、战斗 |

### 人声类型

| 类型 | 描述 | 适用风格 |
|------|------|----------|
| Male Tenor | 男高音，明亮穿透力强 | Pop、Rock、Musical |
| Male Baritone | 男中音，温暖沉稳 | Jazz、Soul、Ballad |
| Female Soprano | 女高音，空灵高亢 | Classical、Pop、Film |
| Female Alto | 女中音，温暖醇厚 | R&B、Jazz、Indie |
| Choir/Chorus | 合唱团 | Orchestral、Epic、Gospel |
| Rap/Spoken Word | 说唱/念白 | Hip Hop、Trap |

---

## 三、音乐结构设计

### 标准歌曲结构模板

| 结构模式 | 段落编排 | 适用流派 | 时长参考 |
|----------|----------|----------|----------|
| Verse-Chorus | Intro → Verse → Chorus → Verse → Chorus → Outro | Pop、Rock | 3-4 min |
| AABA | A → A → B(Bridge) → A | Jazz Standards、Ballad | 3-5 min |
| Through-Composed | 连续发展，不重复 | Film Score、Progressive | 2-8 min |
| Drop-Based | Build → Drop → Breakdown → Build → Drop | EDM、House | 3-6 min |
| Verse-Only | Verse → Verse → Verse (渐进变化) | Folk、Ambient、Lo-Fi | 2-4 min |
| Rondo | A → B → A → C → A | Classical、Game OST | 3-7 min |

### 段落功能详解

| 段落 | 标签 | 功能 | 技巧要点 |
|------|------|------|----------|
| 前奏 (Intro) | [Intro] | 建立调性与氛围，吸引注意 | 通常8-16小节，可用核心动机变体 |
| 主歌 (Verse) | [Verse] | 叙事推进，铺陈情感 | 旋律相对平稳，为副歌蓄力 |
| 预副歌 (Pre-Chorus) | [Pre-Chorus] | 制造张力，过渡到副歌 | 和弦渐进上升，节奏加密 |
| 副歌 (Chorus) | [Chorus] | 情感高潮，核心记忆点 | 旋律最高亢、编曲最饱满 |
| 桥段 (Bridge) | [Bridge] | 打破重复，提供对比 | 和弦走向不同、新旋律或节奏变化 |
| 间奏 (Interlude) | [Interlude] | 器乐展示，情绪过渡 | Solo演奏或氛围铺垫 |
| 尾声 (Outro) | [Outro] | 收束全曲，留有余韵 | 渐弱（Fade out）或明确终止 |
| 积蓄 (Build-up) | [Build] | 能量递增（电子乐） | 鼓点加密、滤波器扫频上升 |
| 落点 (Drop) | [Drop] | 能量释放（电子乐） | 全频爆发、Bass冲击 |

### 时间轴编排范例

**Pop歌曲标准编排：**
```
[0:00-0:15] Intro — 钢琴与轻柔鼓loop
[0:15-0:45] Verse 1 — 人声进入，简洁编曲
[0:45-1:00] Pre-Chorus — 弦乐渐入，节奏加密
[1:00-1:30] Chorus — 全编制爆发，核心旋律
[1:30-2:00] Verse 2 — 编曲层次丰富于Verse 1
[2:00-2:15] Pre-Chorus — 加入和声
[2:15-2:45] Chorus — 副歌重复+加花
[2:45-3:10] Bridge — 和弦转调，情感转折
[3:10-3:40] Final Chorus — 升调/加层，最高潮
[3:40-4:00] Outro — 渐弱收束
```

**EDM/House标准编排：**
```
[0:00-0:30] Intro — 鼓组渐入+氛围Pad
[0:30-1:00] Build-up 1 — 主旋律暗示，滤波器上升
[1:00-1:30] Drop 1 — 全频爆发，主Hook
[1:30-2:00] Breakdown — 退去鼓组，仅Pad+FX
[2:00-2:30] Build-up 2 — 更强张力
[2:30-3:00] Drop 2 — 变奏Drop，加入新元素
[3:00-3:30] Outro — 能量逐渐退出
```

---

## 四、调性与情绪映射

### 大调/小调情绪速查

| 调性 | 情绪色彩 | 常用流派 |
|------|----------|----------|
| C Major | 纯净、明亮、开阔 | Pop、Classical、Film |
| G Major | 温暖、欢快、田园 | Folk、Country、Indie |
| D Major | 辉煌、胜利、积极 | Rock、Orchestral |
| A Major | 甜美、青春、热情 | Pop、Dance |
| E Major | 明亮、能量感 | Rock、EDM |
| F Major | 平静、牧歌、和平 | Acoustic、Classical |
| A Minor | 忧郁、深沉、内省 | Pop、Rock、Classical |
| E Minor | 悲伤、史诗、戏剧 | Metal、Film Score |
| D Minor | 黑暗、严肃、强烈 | Classical、Techno |
| B Minor | 孤独、神秘、浪漫 | Ballad、Gothic |
| G Minor | 悲怆、激情、不安 | Baroque、Drama |
| C Minor | 庄严、英雄悲剧感 | Orchestral、Epic |

### 常用和弦进行

| 进行 | 标记 | 情感 | 经典范例 |
|------|------|------|----------|
| I-V-vi-IV | C-G-Am-F | 欢乐/感动 | 绝大多数流行歌曲 |
| vi-IV-I-V | Am-F-C-G | 忧郁/坚韧 | 流行抒情 |
| I-vi-IV-V | C-Am-F-G | 复古/温暖 | 50s-60s怀旧 |
| ii-V-I | Dm7-G7-Cmaj7 | 爵士和声解决 | Jazz Standards |
| i-VI-III-VII | Am-F-C-G | 大气/史诗 | Epic、EDM |
| I-IV-vi-V | C-F-Am-G | 积极/前进 | Anthem、Rock |
| i-iv-v-i | Am-Dm-Em-Am | 阴暗/紧张 | 电影配乐、Metal |

---

## 五、提示词模板库

### 流行歌曲
```
A catchy pop song in C major at 118 BPM with bright synths, punchy drum machine, electric bass, and layered vocal harmonies. Uplifting and energetic mood with a memorable hook in the chorus. Structure: Intro → Verse → Pre-Chorus → Chorus → Verse → Chorus → Bridge → Final Chorus → Outro.
```

### 电影配乐——史诗战斗
```
Epic orchestral battle music in D minor at 140 BPM. Full symphony orchestra with powerful brass fanfares, intense string ostinato, thundering timpani, and massive taiko drums. Build from ominous tension to heroic triumph. Structure: slow ominous intro building to relentless battle rhythm with brass melody soaring above.
```

### 电子音乐——Deep House
```
Deep house track at 124 BPM in A minor. Warm analog synth pads, groovy bass line with side-chain compression, crisp hi-hats, deep kick drum, subtle vocal chops, and shimmering arpeggiated synths. Hypnotic, warm, and danceable. Structure: Intro → Build → Drop → Breakdown → Build → Drop → Outro.
```

### Lo-Fi Chill
```
Lo-fi hip hop beat at 75 BPM in F major. Dusty vinyl crackle, mellow Rhodes piano chords, soft boom-bap drums with tape saturation, warm sub bass, and jazzy guitar licks. Rainy day mood, relaxing and nostalgic. Instrumental only, no vocals.
```

### 中国风
```
Chinese traditional style piece at 80 BPM in pentatonic A minor. Guzheng (古筝) as lead instrument with dizi (竹笛) counter-melody, soft yangqin arpeggios, and gentle percussion. Ethereal, poetic atmosphere evoking misty mountain landscapes. Instrumental only.
```

### 爵士乐
```
Smooth jazz trio piece in Bb major at 130 BPM (swing feel). Acoustic upright bass walking line, brushed drums with gentle swing, warm piano comping and improvised solo passages. Intimate, sophisticated, late-night cocktail bar atmosphere. Instrumental only.
```

### 摇滚——车库风格
```
Raw garage rock track in E minor at 145 BPM. Crunchy distorted guitar power chords, driving bass, aggressive drums with heavy snare, and gritty male vocals. Rebellious energy, lo-fi production aesthetic. Structure: Verse → Chorus → Verse → Chorus → Guitar Solo → Chorus → Outro.
```

### 氛围/冥想
```
Ambient meditation soundscape at 60 BPM in C major (free tempo). Evolving granular synthesis textures, gentle sine wave drones, crystalline bell tones with long reverb tails, and distant field recordings of flowing water. Deeply calming, spacious, and transcendent. No rhythm section.
```

---

## 六、歌词编写指南

### 歌词结构标签

在提示词中使用标准标签标记歌词结构：

```
[Verse 1]
Walking through the city lights alone
Every shadow tells a story yet unknown

[Pre-Chorus]
But tonight I feel the change in the air

[Chorus]
We are infinite, we are the stars
Nothing can break us, nothing's too far

[Verse 2]
Memories like photographs in rain
Every color fading but the love remains

[Bridge]
When the world goes silent and the night is deep
I'll find you in my dreams before I fall asleep

[Outro]
Infinite... we are infinite...
```

### 歌词风格匹配原则

| 音乐风格 | 歌词特征 | 语言技巧 |
|----------|----------|----------|
| Pop | 直白、情感共鸣、重复Hook | 简单词汇、朗朗上口 |
| Rock | 叛逆、意象强烈、力量感 | 比喻、对比、短句 |
| R&B | 情感细腻、感官描写 | 暗喻、节奏感强 |
| Hip Hop | 韵脚密集、文字游戏 | 多音节押韵、双关 |
| Folk | 叙事性强、自然意象 | 故事性、口语化 |
| Metal | 暗黑、史诗、神话 | 意象宏大、戏剧化 |
| Indie | 文艺、隐喻、个人化 | 非传统比喻、意识流 |

### 多语言歌词提示

通过 `language` 参数指定歌词语言：
- `Write lyrics in Chinese.` — 中文歌词
- `Write lyrics in Japanese.` — 日语歌词
- `Write lyrics in Korean.` — 韩语歌词
- `Write lyrics in English.` — 英语歌词（默认）
- `Write lyrics in Spanish.` — 西班牙语歌词

---

## 七、快速意图匹配指南

| 创作意图 | 推荐配置 |
|----------|----------|
| 欢快日常BGM | Pop, C Major, 120 BPM, 合成器+吉他+鼓机 |
| 深夜放松 | Lo-Fi, F Major, 75 BPM, Rhodes+采样鼓+vinyl |
| 战斗/高能 | Orchestral Epic, D Minor, 140 BPM, 全管弦+铜管+打击 |
| 浪漫情歌 | R&B Ballad, Ab Major, 70 BPM, 电钢琴+弦乐+柔和鼓 |
| 科幻/赛博 | Synthwave, A Minor, 100 BPM, 模拟合成器+琶音+电子鼓 |
| 自然/冥想 | Ambient, C Major (自由), 60 BPM, Pad+田野录音+铃 |
| 派对/舞曲 | House, Am, 126 BPM, 4-on-the-floor+synth+bass |
| 中国风/古典 | Chinese Traditional, 宫调式, 80 BPM, 古筝+笛子+琵琶 |
| 冒险/探索 | Celtic/Fantasy, G Major, 120 BPM, 笛+竖琴+鼓 |
| 伤感/治愈 | Neoclassical, A Minor, 72 BPM, 钢琴+大提琴+极简弦乐 |
| 街头/嘻哈 | Hip Hop, 各调, 85-95 BPM, 808+采样+人声 |
| 复古怀旧 | 80s Synthpop, D Major, 110 BPM, 模拟合成器+鼓机+Bass |

---

## 八、与音乐生成模型集成方式

### 通用提示词构成公式

```
[流派/风格] + [调性] + [BPM] + [核心乐器] + [情绪/氛围] + [结构编排] + [人声/器乐指示]
```

### 结构化字段映射（structured参数）

| 字段 | 用途 | 示例值 |
|------|------|--------|
| genre | 音乐流派 | "Deep House", "Orchestral Epic" |
| instruments | 乐器列表 | "piano, strings, synth pad" |
| bpm | 节拍速度 | "120" |
| key_scale | 调性 | "C Major", "A Minor Pentatonic" |
| mood | 情绪氛围 | "uplifting and energetic" |
| language | 歌词语言 | "Chinese", "English" |
| vocals | 是否含人声 | true / false |
| lyrics | 歌词文本 | "[Verse 1]\nLyrics here..." |
| timeline | 时间轴编排 | "[0:00-0:15] Intro..." |

### 模型适配注意事项

- **Lyria 3 Clip**：适合30秒短片段，突出单一段落（如一段Chorus）
- **Lyria 3 Pro**：适合完整歌曲（1-2分钟），支持多段落结构
- **通用原则**：提示词越详细、结构越明确，生成质量越高
- **参考图片**：可传入最多10张图片引导音乐情绪（场景图→配乐风格）
- **负向提示**：使用 `Avoid:` 排除不需要的元素（如 "Avoid: vocals, distortion, drums"）

---

## 完整音乐参数参考

上方速查表提供快速选型。每种流派组合的**详细编曲参数**和**可直接使用的完整提示词模板**，请参阅：

👉 [音乐创作完整参考手册](./references/full_music_guide.md)

使用方式：
1. 从速查表中根据创作意图选定流派与乐器组合
2. 打开完整参考手册查阅对应风格的详细提示词模板
3. 根据具体场景需求微调后融入生成提示词
