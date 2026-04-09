---
name: Image_Prompt_Optimizer
description: "Image prompt optimization expert for generation and editing. Use when the user asks to generate, edit, or optimize image prompts. Rewrites rough descriptions into high-quality engineered prompts based on photography terminology, scene narration, and professional templates."
metadata:
  builtin_skill_version: "1.0"
---

# Image Prompt Optimizer

**IMPORTANT**: This is a prompt optimization skill, NOT an image generation tool. After optimizing the prompt, you should call `generate_image` or `edit_image` (from `image_tools` skill) to actually create or edit images.

## Core Principle

**Describe the scene, not just list keywords.** Narrative, descriptive paragraphs almost always produce better, more coherent images than a string of unrelated words.

## Image Generation Prompt Templates

### 1. Photorealistic Scenes

Use photography terminology: shooting angles, lens types, lighting, and details.

```
A photorealistic [shot type] of [subject], [action or expression], set in
[environment]. The scene is illuminated by [lighting description], creating
a [mood] atmosphere. Captured with a [camera/lens details], emphasizing
[key textures and details]. The image should be in a [aspect ratio] format.
```

### 2. Stylized Illustrations & Stickers

Specify the style explicitly and request a white background.

```
A [style] sticker of a [subject], featuring [key characteristics] and a
[color palette]. The design should have [line style] and [shading style].
The background must be white.
```

### 3. Text in Images

Clearly state the text content, font style, and overall design.

```
Create a [image type] for [brand/concept] with the text "[text to render]"
in a [font style]. The design should be [style description], with a
[color scheme].
```

### 4. Product & Commercial Photography

For e-commerce, advertising, or branding — crisp, professional product shots.

```
A high-resolution, studio-lit product photograph of a [product description]
on a [background surface/description]. The lighting is a [lighting setup,
e.g., three-point softbox setup] to [lighting purpose]. The camera angle is
a [angle type] to showcase [specific feature]. Ultra-realistic, with sharp
focus on [key detail]. [Aspect ratio].
```

### 5. Minimalist & Negative Space Design

Ideal for creating backgrounds for websites, presentations, or marketing materials.

```
A minimalist composition featuring a single [subject] positioned in the
[bottom-right/top-left/etc.] of the frame. The background is a vast, empty
[color] canvas, creating significant negative space. Soft, subtle lighting.
[Aspect ratio].
```

### 6. Comic Panels / Storyboard

Create panels for visual storytelling based on character consistency and scene description.

```
Make a 3 panel comic in a [style]. Put the character in a [type of scene].
```

## Image Editing Prompt Templates

### 1. Adding & Removing Elements

Provide the image and describe changes. The model will match the original style, lighting, and perspective.

```
Using the provided image of [subject], please [add/remove/modify] [element]
to/from the scene. Ensure the change is [description of how the change should integrate].
```

### 2. Semantic Inpainting

Define a conversational "mask" to modify specific parts while keeping the rest unchanged.

```
Using the provided image, change only the [specific element] to [new
element/description]. Keep everything else in the image exactly the same,
preserving the original style, lighting, and composition.
```

### 3. Style Transfer

Reproduce image content in a different artistic style.

```
Transform the provided photograph of [subject] into the artistic style of
[artist/art style]. Preserve the original composition but render it with
[description of stylistic elements].
```

### 4. Multi-Image Composition

Combine multiple images into a new composite scene. Great for product mockups or creative collages.

```
Create a new image by combining the elements from the provided images. Take
the [element from image 1] and place it with/on the [element from image 2].
The final image should be a [description of the final scene].
```

### 5. High-Fidelity Detail Preservation

Preserve critical details (faces, logos) during editing by describing them thoroughly.

```
Using the provided images, place [element from image 2] onto [element from
image 1]. Ensure that the features of [element from image 1] remain
completely unchanged. The added element should [description of how the
element should integrate].
```

### 6. Sketch to Image

Upload a sketch or doodle and have the model refine it into a finished image.

```
Turn this rough [medium] sketch of a [subject] into a [style description]
photo. Keep the [specific features] from the sketch but add [new details/materials].
```

### 7. 360-Degree Character Consistency

Iteratively prompt different angles to generate a 360-degree view of a character. Include previously generated images in follow-up prompts to maintain consistency.

```
Generate a [character description] from a [angle] view. Maintain consistent
appearance with the provided reference image(s). For complex poses, include
a reference image of the desired pose.
```

## Optimization Workflow

When the user provides a rough description, follow these steps to optimize:

### Step 1: Analyze User Intent
Determine whether this is "new generation" or "image editing", then select the corresponding template category.

### Step 2: Element Check
Verify the user's description includes these key elements:
- **Subject**: Who or what?
- **Action / Expression**: What are they doing?
- **Environment**: Where is this set?
- **Lighting**: What mood or atmosphere?
- **Composition / Camera**: How is it framed?
- **Style**: What visual style?

### Step 3: Enrich & Optimize
- Fill in missing elements using natural narrative language
- Write the final prompt in English for best quality
- Be extremely specific (use "ornate elven plate armor etched with silver leaf patterns" instead of "fantasy armor")
- Provide context and intent (state what the image is for)
- Use "semantic negative prompts" (use "an empty, desolate street" instead of "no cars")
- Use photography and cinematic language to control composition (wide-angle shot, macro shot, low-angle perspective)

### Step 4: Output Optimized Result
Present to the user:
1. **Optimized Prompt** — the complete English prompt
2. **Optimization Notes** — issues found in the original description and improvements made
3. **Suggested Parameters** — recommended aspect_ratio and n values

## Integration with image_tools

After optimization, pass the prompt to the corresponding tool:
- **New Generation** → `generate_image(prompt=..., aspect_ratio=..., n=...)`
- **Image Editing** → `edit_image(image_url=..., prompt=...)`

## Best Practices

- **English Prompts**: Always write the final prompt in English for best quality
- **Be Specific**: The more detail you provide, the more control over the output
- **Iterate**: Leverage the conversational nature for incremental adjustments ("make the lighting warmer", "make the expression more serious")
- **Step-by-Step Instructions**: Break complex scenes into multiple steps (background first, then foreground, then details)
- **Positive Descriptions**: Describe the desired scene to exclude unwanted elements, rather than saying what should not be there

## Limitations

- Best performance languages: English, zh-CN, ja-JP, ko-KR, fr-FR, de-DE, es-MX, pt-BR, ru-RU, it-IT, ar-EG, hi-IN, id-ID, vi-VN, ua-UA
- Audio or video inputs are not supported
- The model may not generate the exact number of images explicitly requested by the user
