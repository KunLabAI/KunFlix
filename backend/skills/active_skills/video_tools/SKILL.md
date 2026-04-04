---
name: video_tools
description: "AI video generation and editing. Provides generate_video and edit_video tools for creating and modifying videos."
metadata:
  builtin_skill_version: "1.0"
---
# Video Tools

Use this skill when the user asks to create, generate, produce, edit, extend, or modify videos and animations.

Loading this skill activates the `generate_video` and `edit_video` tools.

**Important:** Video generation is asynchronous and takes 1-5 minutes. The tools return a task ID immediately; the user will be notified when the result is ready.

## Tool: generate_video

Generate a video from a text prompt or reference image using an AI video generation model.

### When to Use

- User asks to create, generate, or produce a video, animation, or motion content.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Detailed description of the video to generate. Be specific about subject, action, style, camera movement, and mood. Write in English for best results. |
| `video_mode` | string | No | Generation mode: "text_to_video" (from text only) or "image_to_video" (from a reference image). Default is "text_to_video". |
| `aspect_ratio` | string | No | Video aspect ratio (e.g. "16:9", "9:16", "1:1"). Default is "16:9". |
| `duration` | integer | No | Video duration in seconds. Available values depend on the model. |
| `quality` | string | No | Video resolution/quality (e.g. "480p", "720p", "1080p"). Default is "720p". |
| `image_url` | string | No | URL of a reference image for image_to_video mode. Required when video_mode is "image_to_video". |

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

Image to video:
```
generate_video(
  prompt="The character in the image starts walking forward with gentle wind blowing",
  video_mode="image_to_video",
  image_url="/api/media/character.jpg",
  duration=6
)
```

## Tool: edit_video

Edit or extend an existing video using AI.

### When to Use

- User asks to modify, stylize, or add effects to an existing video (edit mode).
- User asks to extend a video by generating additional frames (extend mode).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `video_url` | string | Yes | URL of the source video to edit or extend. Can be a public URL or a local path (e.g. `/api/media/filename.mp4`). |
| `prompt` | string | Yes | For edit mode: describe the desired changes. For extend mode: describe what should happen in the extended portion. |
| `mode` | string | Yes | Operation mode: "edit" to modify the video, "extend" to add more frames. |
| `duration` | integer | No | Duration in seconds for the extended portion (extend mode only). Default is 6. |

### Examples

Edit video:
```
edit_video(
  video_url="/api/media/scene.mp4",
  prompt="Add a warm sunset color grading and lens flare effect",
  mode="edit"
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

## Tips

- Always write video prompts in English for best quality.
- Video generation is async — inform the user it will take 1-5 minutes.
- For image_to_video, use a local media path (e.g. `/api/media/xxx.jpg`) from canvas nodes or previous generations.
- Not all models support all modes and durations. The available options are automatically tailored to the configured model.
