---
name: video_tools
description: "AI video generation and editing. Provides generate_video and edit_video tools for creating, editing, extending, and combining videos with multimodal inputs."
metadata:
  builtin_skill_version: "1.0"
---
# Video Tools

Use this skill when the user asks to create, generate, produce, edit, extend, or modify videos and animations.

Loading this skill activates the `generate_video` and `edit_video` tools.

**IMPORTANT**: After loading this skill, you MUST call either `generate_video` or `edit_video` tool to perform video operations. Do NOT call `video_tools` directly - it is NOT a tool name.

**Important:** Video generation is asynchronous and takes 1-5 minutes. The tools return a task ID immediately; the user will be notified when the result is ready.

## Tool: generate_video

Generate a video from text, images, videos, audio references, or any combination using an AI video generation model.

### When to Use

- User asks to create, generate, or produce a video, animation, or motion content.
- User wants to generate a video using reference images, videos, or audio as creative inputs.

### Mode Selection Guide

Choose the correct `video_mode` based on the user's input:

| User Input | Correct Mode | Key Parameter |
|---|---|---|
| Text description only | `text_to_video` | `prompt` |
| 1 image as starting frame | `image_to_video` | `image_url` |
| 1 image (first) + 1 image (last) | `image_to_video` | `image_url` + `last_frame_image` |
| **2+ images as character/scene references** | **`reference_images`** | **`reference_images=[]`** |
| Images + videos + audios combined | `reference_images` | `reference_images=[]` + `reference_videos=[]` + `reference_audios=[]` |

**CRITICAL**: When the user provides **2 or more images** as references (e.g. "use image A and image B to generate a video"), you **MUST** use `video_mode="reference_images"` with the `reference_images` array. Do NOT use `image_to_video` — that mode only accepts a single first-frame image and will ignore all other images.

### Audio Generation (Dialogue, Narration, Sound Effects)

**IMPORTANT**: Many video models (e.g. Gemini Veo 3.0/3.1, Seedance 2.0) are **fully multimodal** — they can generate videos **with audio** including:
- **Dialogue** — characters speaking lines
- **Narration/Voiceover** — off-screen narrator voice
- **Sound effects** — environmental sounds, footsteps, etc.
- **Ambient audio** — background atmosphere

**You do NOT need reference audio to generate videos with dialogue.** Simply describe the dialogue, narration, or sound effects in the `prompt`, and the model will generate them automatically.

**Example prompts with audio:**
```
# Dialogue example
prompt="A woman walks into the coffee shop and says 'Good morning!' to the barista with a warm smile, ambient coffee shop sounds, cinematic lighting"

# Narration example  
prompt="A documentary-style shot of a cheetah running across the savanna, narrator voice describing 'The cheetah can reach speeds of 70 miles per hour', dramatic music builds"

# Sound effects example
prompt="A car speeds through a rainy city street at night, tires splashing through puddles, engine roaring, rain pattering on the windshield"
```

When to use `reference_audios`:
- To **clone a specific voice style** or tone from an existing audio sample
- To **match music genre/mood** from a reference track
- The model will inherit voice characteristics or musical style from the reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Detailed description of the video to generate. Be specific about subject, action, style, camera movement, and mood. Refer to input media as 图片1/图片2, 视频1/视频2, 音频1/音频2 in the prompt. |
| `video_mode` | string | No | Generation mode: "text_to_video" (from text only), "image_to_video" (from a first frame image), "reference_images" (multimodal reference with images/videos/audios). Default is "text_to_video". |
| `aspect_ratio` | string | No | Video aspect ratio (e.g. "16:9", "9:16", "1:1", "adaptive"). "adaptive" lets the model auto-select. Default is "16:9". |
| `duration` | integer | No | Video duration in seconds. Use -1 to let the model auto-select duration. Available values depend on the model. |
| `quality` | string | No | Video resolution/quality (e.g. "480p", "720p"). Default is "720p". |
| `image_url` | string | No | URL of a first frame image for image_to_video mode. Required when video_mode is "image_to_video". |
| `last_frame_image` | string | No | URL of the last frame image. Creates a video transitioning from first frame to last frame. |
| `reference_images` | string[] | No | Array of reference image URLs for multimodal generation (max 9). Use with video_mode="reference_images". |
| `reference_videos` | string[] | No | Array of reference video URLs for multimodal generation or video extension (max 3). |
| `reference_audios` | string[] | No | (Optional) Reference audio URLs (wav/mp3, 2-15s each, max 3) for voice cloning or style matching. **Not required for dialogue/narration** — just describe audio in the prompt. |
| `return_last_frame` | boolean | No | If true, returns the last frame image URL of the generated video (useful for chaining consecutive videos). |

### Examples

Text to video:
```
generate_video(
  prompt="A golden retriever running through a sunlit meadow with wildflowers, cinematic slow motion",
  aspect_ratio="16:9",
  duration=6,
  quality="720p"
)
```

Image to video (first frame):
```
generate_video(
  prompt="The character in the image starts walking forward with gentle wind blowing",
  video_mode="image_to_video",
  image_url="/api/media/character.jpg",
  duration=6
)
```

First + last frame video:
```
generate_video(
  prompt="Camera slowly zooms in from the first frame scene to the last frame close-up",
  video_mode="image_to_video",
  image_url="/api/media/scene_wide.jpg",
  last_frame_image="/api/media/scene_closeup.jpg",
  duration=8
)
```

Multimodal reference (2 images — most common scenario):
```
generate_video(
  prompt="图片1中的男生牵着图片2中的女生的手，在赛博朋克城市街道上奔跑，霓虹灯闪烁，雨水反射灯光",
  video_mode="reference_images",
  reference_images=["/api/media/boy.jpg", "/api/media/girl.jpg"],
  duration=8,
  aspect_ratio="16:9"
)
```

Multimodal reference (images + video + audio):
```
generate_video(
  prompt="使用视频1的第一视角构图，使用音频1作为背景音乐。图片1中的角色走进图片2的场景",
  video_mode="reference_images",
  reference_images=["/api/media/character.jpg", "/api/media/scene.jpg"],
  reference_videos=["/api/media/camera_movement.mp4"],
  reference_audios=["https://example.com/bgm.mp3"],
  duration=10,
  aspect_ratio="16:9"
)
```

## Tool: edit_video

Edit, modify, or extend an existing video using AI. Supports replacing objects, changing styles, extending footage, and concatenating multiple video clips.

### When to Use

- User asks to modify, stylize, replace objects, or add effects to an existing video (edit mode).
- User asks to extend a video by generating additional frames (extend mode).
- User asks to concatenate multiple video clips into one continuous video (extend mode with additional_videos).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `video_url` | string | Yes | URL of the source video to edit or extend. Can be a public URL or a local path (e.g. `/api/media/filename.mp4`). |
| `prompt` | string | Yes | For edit mode: describe the desired changes. For extend mode: describe what should happen in the extended portion. Refer to media as 视频1, 图片1, 音频1. |
| `mode` | string | Yes | Operation mode: "edit" to modify the video, "extend" to add more frames or concatenate videos. |
| `duration` | integer | No | Duration in seconds for the output video. Default is 6. |
| `reference_images` | string[] | No | Reference image URLs for editing (e.g. to replace objects in the video). |
| `reference_audios` | string[] | No | Reference audio URLs for editing (e.g. to replace or add audio tracks). |
| `additional_videos` | string[] | No | Additional video URLs for extension/concatenation (up to 3 total including video_url). |

### Examples

Edit video (replace object):
```
edit_video(
  video_url="/api/media/product_ad.mp4",
  prompt="将视频1中的香水替换成图片1中的面霜，运镜不变",
  mode="edit",
  reference_images=["https://example.com/cream.jpg"],
  duration=5
)
```

Extend video:
```
edit_video(
  video_url="/api/media/scene.mp4",
  prompt="The camera slowly pans to reveal a mountain landscape in the background",
  mode="extend",
  duration=6
)
```

Concatenate multiple videos:
```
edit_video(
  video_url="/api/media/clip1.mp4",
  prompt="视频1中的窗户打开，进入室内，接视频2，之后镜头进入画内，接视频3",
  mode="extend",
  additional_videos=["/api/media/clip2.mp4", "/api/media/clip3.mp4"],
  duration=8
)
```

## Tips

- Always write video prompts in English for best quality, except when using Chinese-specific features (refer to media as 图片1, 视频1, 音频1).
- Video generation is async — inform the user it will take 1-5 minutes.
- For image_to_video, use a local media path (e.g. `/api/media/xxx.jpg`) from canvas nodes or previous generations.
- For multimodal reference, you can combine images, videos, and audio freely. The model will inherit visual style, camera movement, and audio characteristics from the references.
- First frame/last frame mode and multimodal reference mode are mutually exclusive — do not mix them.
- Use `return_last_frame=true` to chain consecutive video generations (last frame becomes next first frame).
- Duration of -1 lets the model auto-select the optimal duration.
- Not all models support all modes and parameters. The available options are automatically tailored to the configured model.

## Error Handling

When the video generation API returns an error, the error message will be passed back to you. Handle these common errors:

| Error Code | Meaning | How to Handle |
|---|---|---|
| `InputImageSensitiveContentDetected.PrivacyInformation` | Input image contains a real person's face | **STOP immediately.** Tell the user: "The image contains a real person's face, which is rejected by the platform's content safety policy." Then call `list_virtual_human_presets` to offer preset virtual humans as alternatives. Do NOT retry with the same image. |
| `InputImageSensitiveContentDetected` | Input image has sensitive content | **STOP immediately.** Tell the user the image was rejected due to content policy. Do NOT retry. |
| Other 400 errors | Various API validation failures | Tell the user the specific error and suggest corrections. Do NOT blindly retry more than once. |

**CRITICAL**: When you receive a content safety rejection error, you MUST:
1. Stop all retry attempts immediately
2. Explain the specific reason to the user clearly
3. Suggest alternatives (e.g. use AI-generated character images instead of real photos)
4. Wait for the user to provide new input before trying again

## Virtual Human Presets (Seedance 2.0 Only)

Seedance 2.0 **does NOT support uploading real human face images/videos** — they will be rejected by content safety review. To generate realistic human videos, use the platform's **preset virtual human library**.

### Tool: list_virtual_human_presets

Lists available virtual human presets with their asset URIs.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `gender` | string | No | Filter by gender: "male" or "female". Omit to list all. |
| `style` | string | No | Filter by style tag (e.g. "realistic"). Omit to list all. |

### When to Use

When the user asks to generate a video featuring a **realistic human character** using Seedance 2.0:

1. Call `list_virtual_human_presets` to show available virtual humans
2. Present the options to the user (show preview images and descriptions)
3. After the user selects a virtual human, use its `asset_uri` (e.g. `asset://asset-20260401123823-6d4x2`) as an element in `reference_images`

### Usage Example

```
# Step 1: List available virtual humans
list_virtual_human_presets(gender="female")

# Step 2: User selects one, then generate video
generate_video(
  prompt="图片1中的女生面带笑容，向镜头介绍图片2中的产品，说'这款面霜真的超好用'，自然光线，近景镜头",
  video_mode="reference_images",
  reference_images=["asset://asset-20260401123823-6d4x2", "/api/media/product.jpg"],
  duration=8,
  aspect_ratio="9:16"
)
```

### Important Rules

- **Asset URI format**: Always use `asset://<asset_id>` — do NOT modify or truncate the asset ID.
- **Prompt referencing**: In the prompt, reference virtual humans using the standard numbering format (图片1, 图片2, etc.) based on their position in the `reference_images` array. **NEVER use asset IDs in the prompt.**
- **Combining with other images**: You can mix virtual human asset URIs with regular image URLs in `reference_images`. For example, `reference_images=["asset://...", "/api/media/product.jpg"]` — the virtual human is 图片1, the product is 图片2.
- **Content safety**: Virtual human presets are pre-approved and will NOT trigger face detection rejection, unlike uploaded real human photos.

## Script and Storyboard Workflow

When the user provides a script file or storyboard description, follow these principles:

### Core Principles
- **One script generates one video by default** (not one video per shot)
- Describe the complete shot sequence in a single `generate_video` call through the prompt

### Multi-Shot Prompt Construction
Combine multiple shots into a coherent prompt using shot transition descriptions:

```
[Opening shot] → [Transition/camera movement] → [Middle shot] → [Transition/camera movement] → [Ending shot]

Example:
"A woman walks into a coffee shop (opening shot), 
 the camera follows her as she approaches the counter (tracking shot), 
 she smiles and orders a latte (close-up), 
 camera pulls back to show the bustling cafe atmosphere (wide shot)"
```

### When to Split Into Multiple Videos

| Scenario | Approach | Notes |
|----------|----------|-------|
| Continuous action in same time/space | **Single video** | Use prompt to describe shot transitions |
| Different scenes/time periods | **Multiple videos** | One video per scene, concatenate later with `edit_video` |
| Need precise control per shot parameters | **Multiple videos** | Generate separately then concatenate |

### Strict Script Adherence
- **Do NOT add content outside the script** — only generate what is explicitly described
- **Do NOT expand the plot** — even if the script is short, do not add your own storyline
- **Maintain character/scene consistency** — use `reference_images` to provide character/scene references

---

## Canvas Node → Multimodal Reference Workflow

Canvas nodes are identified by UUIDs. To use canvas media as multimodal references:

**Step 1**: Call `list_canvas_nodes` to discover available image/video nodes:
```
list_canvas_nodes(node_type="image")  → returns [{id: "uuid-a", name: "角色A"}, ...]
list_canvas_nodes(node_type="video")  → returns [{id: "uuid-x", name: "片段1"}, ...]
```

**Step 2**: Call `get_canvas_node(node_id="uuid-a")` to get the media URL:
- Image nodes → `data.imageUrl` (e.g. `/api/media/character.jpg`)
- Video nodes → `data.videoUrl` (e.g. `/api/media/clip1.mp4`)

**Step 3**: Pass URLs to generate_video/edit_video in the desired order. The **array order determines the number** in the prompt:

| Array Position | Prompt Reference |
|---|---|
| `reference_images[0]` | 图片1 |
| `reference_images[1]` | 图片2 |
| `reference_videos[0]` | 视频1 |
| `reference_videos[1]` | 视频2 |
| `reference_audios[0]` | 音频1 |

**Example**: User says "用角色A和场景B生成视频，参考片段C的运镜"
```
# 1. Get media URLs from canvas nodes
角色A_url = get_canvas_node("uuid-a").data.imageUrl  → /api/media/characterA.jpg
场景B_url = get_canvas_node("uuid-b").data.imageUrl  → /api/media/sceneB.jpg
片段C_url = get_canvas_node("uuid-c").data.videoUrl  → /api/media/clipC.mp4

# 2. Call generate_video with ordered arrays
generate_video(
  prompt="图片1中的角色走进图片2的场景中，使用视频1的运镜方式",
  video_mode="reference_images",
  reference_images=[角色A_url, 场景B_url],   # index 0=图片1, index 1=图片2
  reference_videos=[片段C_url],              # index 0=视频1
  duration=8
)
```
