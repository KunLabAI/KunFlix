---
name: image_tools
description: "AI image generation and editing. Provides generate_image and edit_image tools for creating and modifying images."
metadata:
  builtin_skill_version: "1.0"
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
| `prompt` | string | Yes | Detailed description of the image to generate. Be specific about subject, style, composition, lighting, and mood. Write in English for best results. |
| `aspect_ratio` | string | No | Image aspect ratio (e.g. "1:1", "16:9", "9:16", "4:3"). Default is "auto". |
| `n` | integer | No | Number of images to generate (1-4). Default is 1. |

### Example

```
generate_image(
  prompt="A serene Japanese garden with cherry blossoms, koi pond, and a wooden bridge, watercolor painting style",
  aspect_ratio="16:9",
  n=1
)
```

The tool returns image URLs in markdown format. Include them in your response.

## Tool: edit_image (image-to-image)

Generate or edit an image **using a reference image as the visual basis**. The reference image guides the output — the AI sees it and builds upon it.

### When to Use

- **Reference-based generation**: User provides a reference image and asks to create new content based on it (e.g. "use this character to generate a three-view sheet", "put this person in a fantasy world").
- **Character consistency**: User wants to maintain a character's appearance across different scenes or poses — provide the existing character image as reference.
- **Style transfer**: User wants to transform an image into a different art style while preserving the content.
- **Image modification**: User asks to modify, enhance, add/remove elements from an existing image.

**Key decision rule**: Whenever a reference image exists (from canvas, chat history, or user upload) and the user wants the output to visually relate to it, use `edit_image`. Only use `generate_image` when creating from pure text with no visual reference.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image_url` | string | Yes | URL or path of the reference/source image. Use the image file path (e.g. `/api/media/filename.jpg`) or a public URL. Do NOT pass inline base64 data. |
| `prompt` | string | Yes | Description of the desired output. For reference-based generation, describe the full target scene while noting which elements to preserve from the reference. For editing, describe the specific changes. |
| `aspect_ratio` | string | No | Output image aspect ratio. Default follows input image. |
| `quality` | string | No | Output image quality/resolution ("standard" or "hd"). Default uses global config. |

### Examples

**Reference-based generation** (character in new scene):
```
edit_image(
  image_url="/api/media/character-ref.png",
  prompt="The same woman from the reference image, now standing in an ancient Chinese xianxia world on a floating mountain path, wearing flowing immortal robes, cinematic lighting, 8k",
  aspect_ratio="16:9"
)
```

**Style transfer**:
```
edit_image(
  image_url="/api/media/abc123.jpg",
  prompt="Transform this photo into a Studio Ghibli anime style illustration",
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
| "Change the background to sunset" (has image) | `edit_image` | Modifying an existing image |
| "Regenerate with a better prompt" (starting over) | `generate_image` | Discarding previous result, fresh generation |
| "Make this image anime style" | `edit_image` | Style transfer on existing image |

## Tips

- Always write prompts in English for best quality.
- For `edit_image`, use the file path from canvas nodes or previous generations — never paste base64 data.
- When multiple images are needed, set `n` parameter on `generate_image` instead of calling the tool multiple times.
