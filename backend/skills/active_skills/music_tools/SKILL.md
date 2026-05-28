---
name: music_tools
description: "AI music generation. Provides the generate_music tool for creating music clips and full songs from text prompts with optional image references using Google Lyria 3 models."
metadata:
  builtin_skill_version: "1.0"
---
# Music Tools

Use this skill when the user asks to create, generate, compose, or produce music, songs, audio tracks, or soundtracks.

Loading this skill activates the `generate_music` tool.

**IMPORTANT**: After loading this skill, you MUST call the `generate_music` tool to perform music operations. Do NOT call `music_tools` directly - it is NOT a tool name.

**Important:** Music generation is asynchronous and takes 30-120 seconds. The tool returns a task ID immediately; the user will be notified when the result is ready.

## Tool: generate_music

Generate a music clip or full song from a text prompt, with optional reference images for style guidance.

### When to Use

- User asks to create, generate, compose, or produce music, a song, an audio track, or a soundtrack.
- User wants background music for a video, scene, or project.
- User wants to generate music inspired by reference images.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Detailed description of the music to generate. Include genre, mood, instruments, tempo, and any specific musical direction. For songs with lyrics, include the lyrics or lyrical theme in the prompt. |
| `output_format` | string | No | Audio output format: "mp3" (default, Clip & Pro) or "wav" (Pro only, higher quality). |
| `reference_images` | string[] | No | Array of reference image URLs to guide the musical style or mood. Images can be canvas node URLs (e.g. `/api/media/scene.jpg`) or external URLs. |

### Model Capabilities

| Model | Duration | Formats | Features |
|-------|----------|---------|----------|
| `lyria-3-clip-preview` | ~30 seconds | MP3 only | Short music clips, fast generation |
| `lyria-3-pro-preview` | Full songs (3-5 min) | MP3, WAV | Full songs with lyrics, higher quality |

### Examples

Generate a short music clip:
```
generate_music(
  prompt="An upbeat electronic dance track with pulsing synths, heavy bass drops, and energetic drums at 128 BPM"
)
```

Generate a full song with lyrics (Pro model):
```
generate_music(
  prompt="A melancholic indie folk ballad with acoustic guitar and soft vocals. Lyrics: 'Walking through the autumn leaves, memories fall like rain...'",
  output_format="wav"
)
```

Generate music inspired by an image:
```
generate_music(
  prompt="Compose a cinematic orchestral piece that matches the mood of this scene - epic and mysterious",
  reference_images=["/api/media/dark_forest_scene.jpg"]
)
```

## Tips

- Write detailed prompts describing genre, mood, instruments, tempo, and style for best results.
- For songs with lyrics, include the full lyrics in the prompt. The model will generate vocals.
- Use `output_format="wav"` with Pro model for higher audio quality (lossless).
- Reference images can influence the musical mood and style - use scene images for soundtrack generation.
- Music generation is async - inform the user it will take 30-120 seconds.
- The generated audio will automatically be added as an audio node on the canvas.

## Canvas Integration

Generated music is automatically created as an audio node on the active canvas. To use canvas images as references:

**Step 1**: Call `list_canvas_nodes` to discover available image nodes:
```
list_canvas_nodes(node_type="image")  -> returns [{id: "uuid-a", name: "Scene"}, ...]
```

**Step 2**: Call `get_canvas_node(node_id="uuid-a")` to get the media URL:
- Image nodes -> `data.imageUrl` (e.g. `/api/media/scene.jpg`)

**Step 3**: Pass URLs to generate_music:
```
generate_music(
  prompt="Compose background music matching the atmosphere of this scene",
  reference_images=["/api/media/scene.jpg"]
)
```

## Error Handling

| Error | Meaning | How to Handle |
|-------|---------|---------------|
| Safety filter triggered | Content violates safety policies | Tell the user the prompt was rejected due to content policy. Suggest rephrasing. |
| API timeout | Generation took too long | Inform the user and suggest retrying. |
| Empty response | Model returned no audio | Suggest simplifying or rephrasing the prompt. |
