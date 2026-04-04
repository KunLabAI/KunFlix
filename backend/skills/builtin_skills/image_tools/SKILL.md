---
name: image_tools
description: "AI image generation and editing. Provides generate_image and edit_image tools for creating and modifying images."
metadata:
  builtin_skill_version: "1.0"
---
# Image Tools

Use this skill when the user asks to create, draw, generate, design, edit, modify, or enhance images.

Loading this skill activates the `generate_image` and `edit_image` tools.

**Important:** The actual available parameters (aspect ratios, quality options, etc.) are determined by the system's configured image provider and model. Always refer to the tool definition's parameter enums for valid options — they reflect the current configuration. The descriptions below are for general guidance only.

## Tool: generate_image

Generate images from a text prompt using an AI image generation model.

### When to Use

- User asks to create, draw, generate, or design an image, illustration, portrait, scene, or any visual content.

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

## Tool: edit_image

Edit an existing image using AI. Modify, stylize, or enhance images based on a text prompt.

### When to Use

- User asks to modify, edit, stylize, enhance, or change an existing image.
- User provides an image and describes desired changes.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image_url` | string | Yes | URL or path of the image to edit. Use the image file path (e.g. `/api/media/filename.jpg`) or a public URL. Do NOT pass inline base64 data. |
| `prompt` | string | Yes | Description of how to edit the image. Be specific about the changes: style transfer, color adjustments, adding/removing elements, etc. |
| `aspect_ratio` | string | No | Output image aspect ratio. Default follows input image. |
| `quality` | string | No | Output image quality/resolution ("standard" or "hd"). Default uses global config. |

### Example

```
edit_image(
  image_url="/api/media/abc123.jpg",
  prompt="Transform this photo into a Studio Ghibli anime style illustration",
  quality="hd"
)
```

The tool returns the edited image URL in markdown format.

## Tips

- Always write image generation prompts in English for best quality.
- For image editing, use the file path from canvas nodes or previous generations — never paste base64 data.
- When the user asks to "regenerate" an image, use `generate_image` with a refined prompt rather than `edit_image`.
- When multiple images are needed, set `n` parameter instead of calling the tool multiple times.
- The image provider and model are configured by the system administrator — you do not need to choose them.
- Parameter options (aspect ratios, quality levels) are automatically tailored to the configured provider. Use only values from the tool definition enums.
