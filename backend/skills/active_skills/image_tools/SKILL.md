---
name: image_tools
description: "AI image generation and editing. Provides generate_image and edit_image tools for creating and modifying images."
metadata:
  builtin_skill_version: "1.2"
---
# Image Tools

Use this skill when the user asks to create, draw, generate, design, edit, modify, or enhance images.

Loading this skill activates the `generate_image` and `edit_image` tools.

**IMPORTANT**: After loading this skill, you MUST call either `generate_image` or `edit_image` tool to perform image operations. Do NOT call `image_tools` directly - it is NOT a tool name.

## Tool: generate_image (text-to-image)

Generate images **from scratch** using only a text prompt. No reference image is used.

### When to Use

- User asks to create a **brand new** image with no reference image.
- User asks to "regenerate" an image with a refined prompt (starting over, not editing).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Detailed English description of the image. See [Prompt Writing Guide](#prompt-writing-guide) below. |
| `aspect_ratio` | string | No | Image aspect ratio (e.g. "1:1", "16:9", "9:16", "4:3"). Default is "auto". |
| `n` | integer | No | Number of images to generate (1-4). Default is 1. |

### Example

```
generate_image(
  prompt="A serene Japanese garden with cherry blossoms, koi pond, and a wooden bridge, watercolor painting style, soft morning light filtering through branches",
  aspect_ratio="16:9",
  n=1
)
```

The tool returns image URLs in markdown format. Include them in your response.

## Tool: edit_image (image-to-image)

Edit or generate an image **using one or more reference images as the visual basis**. The reference images guide the output — the AI sees them and builds upon them.

### When to Use

- **Reference-based generation**: User provides a reference image and asks to create new content based on it (e.g. "use this character to generate a three-view sheet", "put this person in a fantasy world").
- **Character consistency**: User wants to maintain a character's appearance across different scenes or poses.
- **Style transfer**: Transform an image into a different art style while preserving the content.
- **Inpainting / Partial edit**: Modify a specific region of an image while keeping everything else unchanged (e.g. "change the sofa color", "remove the person in the background").
- **Multi-image composition**: Combine elements from multiple reference images (up to 10) into a new scene (e.g. "put the dress from image 1 on the person in image 2").
- **High-fidelity preservation**: Preserve critical details (face, logo, text) while making other changes.

**Key decision rule**: Whenever a reference image exists (from canvas, chat history, or user upload) and the user wants the output to visually relate to it, use `edit_image`. Only use `generate_image` when creating from pure text with no visual reference.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image_url` | string | No* | Single reference image URL/path (e.g. `/api/media/filename.jpg`). Do NOT pass base64. |
| `image_urls` | string[] | No* | Multiple reference image URLs/paths (up to 10). Use for multi-image composition. |
| `prompt` | string | Yes | Description of the desired output. See [Edit Prompt Patterns](#edit-prompt-patterns) below for templates. |
| `aspect_ratio` | string | No | Output aspect ratio. Single-image edit follows input; multi-image defaults to first image (can be overridden). |
| `quality` | string | No | Output quality ("standard" or "hd"). Default uses global config. |

\* Either `image_url` or `image_urls` must be provided. `image_urls` takes precedence.

### Examples

**Single-image reference** (character in new scene):
```
edit_image(
  image_url="/api/media/character-ref.png",
  prompt="The same woman from the reference image, now standing in an ancient Chinese xianxia world on a floating mountain path, wearing flowing white immortal robes with jade accessories, cinematic golden-hour lighting, volumetric fog, 8k ultra-detailed",
  aspect_ratio="16:9"
)
```

**Multi-image composition** (combine elements):
```
edit_image(
  image_urls=[
    "/api/media/character-sheet-1.png",
    "/api/media/character-sheet-2.png"
  ],
  prompt="An epic battle scene between the two characters from the reference images. Character 1 (from first image) leaping with a light sword overhead strike, Character 2 (from second image) blocking with dual axes, energy collision sparks. Rain-soaked cyberpunk street at night, neon reflections on wet ground, low-angle cinematic shot, 8k",
  aspect_ratio="16:9"
)
```

**Inpainting** (partial edit):
```
edit_image(
  image_url="/api/media/living-room.png",
  prompt="Using the provided image, change only the blue sofa to a vintage brown leather chesterfield sofa. Keep everything else exactly the same, preserving the original lighting, shadows, and composition"
)
```

**Style transfer**:
```
edit_image(
  image_url="/api/media/city-photo.jpg",
  prompt="Transform this photograph into the artistic style of Vincent van Gogh's Starry Night. Preserve the original composition of buildings and streets, but render all elements with swirling impasto brushstrokes and a dramatic palette of deep blues and bright yellows",
  quality="hd"
)
```

The tool returns the edited/generated image URL in markdown format.

## Decision Guide

| Scenario | Tool | Reason |
|----------|------|--------|
| "Draw me a cat" (no reference) | `generate_image` | Pure text-to-image |
| "Put this character in a forest" (has reference) | `edit_image` | Reference image guides character appearance |
| "Generate a three-view sheet based on this image" | `edit_image` | Reference image provides the character to replicate |
| "Change only the background to sunset" (has image) | `edit_image` | Inpainting — partial edit |
| "Regenerate with a better prompt" (starting over) | `generate_image` | Discarding previous result, fresh generation |
| "Make this image anime style" | `edit_image` | Style transfer on existing image |
| "Put dress from image A on person from image B" | `edit_image` + `image_urls` | Multi-image composition |
| "Add this logo to her t-shirt" (2 images) | `edit_image` + `image_urls` | High-fidelity detail merging |
| "Refer to my original two character sheets" | `edit_image` + `image_urls` | Combining elements from multiple sources |

---

## Reference Image Categories (Gemini 3)

Gemini 3 image models support mixing up to 10 reference images in a single `edit_image` call. Reference images fall into two semantic categories, and the model handles each differently:

| Category | Purpose | Best For | Examples |
|----------|---------|----------|----------|
| **Object reference (high-fidelity)** | Preserve the exact appearance of a specific object | Products, logos, clothing, props, text, branding | "use the bag from image 1", "put this logo on the shirt", "place the product in the scene" |
| **Character reference (consistency)** | Keep a character's identity consistent across scenes/poses | People, creatures, stylized characters — faces, hair, outfits | "the same woman from image 2 now in a forest", "these 3 people making funny faces" |

**Recommended mix in a single call** (aligned with Gemini 3's internal routing):

- Up to ~6 object-reference images for high-fidelity embedding (logos, products, outfits to preserve pixel-accurately)
- Up to ~5 character-reference images for identity consistency (faces and features that must stay recognizable)
- Combined total must stay within the `image_urls` cap of 10

### Referencing Tips

- **Be explicit about roles**: in the prompt, refer to each image by order, e.g. *"Take the dress from image 1, the handbag from image 2, and put them on the woman from image 3"*.
- **Declare intent per image**: object-reference → use verbs like "use", "include", "place"; character-reference → use "the same person/character from image X".
- **Group photos of multiple characters**: pass each character's reference separately (e.g. person1.png … person5.png) and describe the scene — e.g. *"An office group photo of these 5 people making funny faces"*.
- **Aspect ratio**: defaults to the first image; pass `aspect_ratio` explicitly to override.

---

## Prompt Writing Guide

**Core principle: Describe the scene narratively, don't just list keywords.**

The model's strength is language understanding. A descriptive paragraph always produces better results than a keyword list.

### Structure Template

Build prompts in this order:

1. **Subject** — Who/what is the main focus?
2. **Action/Pose** — What are they doing?
3. **Setting/Background** — Where is this happening?
4. **Style** — What visual style? (photorealistic, anime, oil painting, pencil sketch, etc.)
5. **Technical details** — Lighting, camera angle, resolution.

**Good prompt:**
> "A weathered old fisherman mending nets on a wooden dock at golden hour, Mediterranean fishing village in the background with whitewashed buildings and blue shutters, oil painting style with visible brushstrokes, warm amber lighting, eye-level composition"

**Bad prompt (keyword soup):**
> "fisherman, dock, sunset, Mediterranean, oil painting, detailed, 8k"

### Style Keywords Reference

| Category | Examples |
|----------|----------|
| Photorealistic | "photograph", "studio-lit product photo", "DSLR shot", "street photography" |
| Illustration | "digital illustration", "concept art", "storybook illustration" |
| Painting | "oil painting", "watercolor", "acrylic on canvas", "impressionist" |
| Anime/Manga | "anime style", "cel-shaded", "manga illustration", "Studio Ghibli style" |
| 3D/CG | "3D render", "Pixar style", "Unreal Engine", "isometric" |
| Sketch | "pencil sketch", "charcoal drawing", "ink wash", "line art" |
| Design | "vector icon", "flat design", "minimalist", "infographic" |

### Aspect Ratio Guide

| Ratio | Best for |
|-------|----------|
| `1:1` | Avatars, icons, social media thumbnails |
| `16:9` / `9:16` | Widescreen scenes, mobile wallpapers, stories |
| `4:3` / `3:4` | Presentations, classic portraits |
| `3:2` / `2:3` | Photography, movie stills |
| `2:1` / `1:2` | Banners, panoramic headers |
| `auto` | Let model choose the best ratio for the prompt |

---

## Edit Prompt Patterns

When using `edit_image`, use these proven prompt patterns for best results:

### Pattern 1: Inpainting (Partial Edit)

Change a specific element while preserving everything else.

**Template:**
> "Using the provided image, change only the [specific element] to [new description]. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition."

**Examples:**
- "Using the provided image, change only the blue car to a red vintage Mustang. Keep the street, buildings, and sky unchanged."
- "Remove the person standing in the background. Fill the area with the surrounding environment naturally."

### Pattern 2: Style Transfer

Recreate the content in a different artistic style.

**Template:**
> "Transform the provided [subject description] into the artistic style of [target style]. Preserve the original composition but render it with [description of stylistic elements]."

**Examples:**
- "Transform this city photograph into a Studio Ghibli anime scene with soft pastel colors and hand-painted textures."
- "Render this portrait as a Renaissance oil painting with dramatic chiaroscuro lighting and rich earth tones."

### Pattern 3: Character in New Scene

Place a character from reference into a completely new environment.

**Template:**
> "The same [character description from reference] from the reference image, now [action/pose] in [new environment]. Preserve the character's [key features to keep]. [Style and technical details]."

**Examples:**
- "The same silver-haired cyberpunk woman from the reference, now fighting in a neon-lit rain-soaked alley. Preserve her chrome dress, blue plasma lines, and cybernetic spine interface. Low-angle cinematic shot, 8k."

### Pattern 4: Multi-Image Composition

Combine elements from multiple reference images.

**Template:**
> "Create a new image by combining elements from the provided images. Take the [element from image 1] and [action] with the [element from image 2]. The final image should be [description of final scene]. Adjust lighting and shadows to create a cohesive result."

**Examples:**
- "Take the blue floral dress from the first image and put it on the woman from the second image. Generate a realistic full-body e-commerce fashion photo with studio lighting."
- "Place the product from image 1 into the kitchen scene from image 2, matching the lighting and perspective naturally."

### Pattern 5: High-Fidelity Preservation

When critical details (face, logo, text) MUST be preserved exactly.

**Template:**
> "Using the provided image(s), [edit description]. Ensure that [critical element] remains completely unchanged. The [modified element] should [integration description]."

**Examples:**
- "Add the logo from the second image onto her black t-shirt. Ensure the woman's face and features remain completely unchanged. The logo should look naturally printed on the fabric, following the folds."
- "Change the background to a tropical beach. The person's face, hair, clothing, and pose must remain pixel-perfect identical."

### Pattern 6: Three-View / Character Sheet

Generate a character reference sheet from a single image.

**Template:**
> "Create a professional character reference sheet showing [character from reference] in three views: front view, right side view, and back view. Neutral standing pose, pure white background, consistent proportions across all views, character design sheet style."

---

## Tips

- **Always write prompts in English** for best quality, even when the user speaks another language.
- For `edit_image`, use the file path from canvas nodes or previous generations — never paste base64 data.
- When multiple images are needed from the same prompt, set `n` parameter on `generate_image` instead of calling multiple times.
- **Multi-image editing**: When the user references multiple images (e.g. "refer to the two character images I sent earlier"), use `image_urls` array. Up to 10 images supported.
- **Single vs multi aspect ratio**: Single-image edit always follows the input image's aspect ratio (cannot be overridden). Multi-image edit defaults to the first image but can be overridden with `aspect_ratio`.
- **Iterative refinement**: Use each edit output as the input for the next edit to progressively refine — describe only the incremental changes needed.
- **Accurate text in images**: To render text in generated images, put the desired text in quotes and describe its placement clearly (e.g. 'the word "HELLO" in bold serif font centered on the banner').
