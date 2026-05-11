---
name: music_tools
description: "AI music generation. Provides the generate_music tool for creating music clips and full songs from text prompts with structure tags, timestamps, optional lyrics, and image references using Google Lyria 3 models."
metadata:
  builtin_skill_version: "1.1"
---
# Music Tools

Use this skill when the user asks to create, generate, compose, or produce music, songs, audio tracks, or soundtracks.

Loading this skill activates the `generate_music` tool.

**IMPORTANT**: After loading this skill, you MUST call the `generate_music` tool to perform music operations. Do NOT call `music_tools` directly — it is NOT a tool name.

**Important:** Music generation is asynchronous and takes 30–120 seconds. The tool returns a task ID immediately; the user will be notified when the result is ready.

## Tool: generate_music

Generate a music clip or full song from a text prompt, with optional reference images for style guidance.

### When to Use

- User asks to create, generate, compose, or produce music, a song, an audio track, or a soundtrack.
- User wants background music for a video, scene, or project.
- User wants to generate music inspired by reference images (scene → soundtrack).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Detailed musical description. Include **genre**, **instruments**, **BPM**, **key/scale**, **mood**, and **structure**. Supports section tags (`[Verse]`, `[Chorus]`, `[Bridge]`, `[Intro]`, `[Outro]`), timestamps (`[0:00-0:30]`), and inline lyrics. For instrumental tracks append `Instrumental only, no vocals`. **Prompt language determines the vocal language.** |
| `output_format` | string | No | Audio output format: `mp3` (default, Clip & Pro) or `wav` (Pro only, 48 kHz stereo lossless). |
| `reference_images` | string[] | No | Up to **10** image URLs for multimodal inspiration (mood, colors, atmosphere). Canvas node URLs (e.g. `/api/media/scene.jpg`) or external URLs. |

### Model Capabilities

| Model | Duration | Formats | Notes |
|-------|----------|---------|-------|
| `lyria-3-clip-preview` | Fixed ~30 s clip | MP3 | Fast short clips; lyrics & structure tags supported. |
| `lyria-3-pro-preview` | Full song (~1–2 min, steerable via prompt) | MP3, WAV | Higher quality; best for full songs with verse/chorus structure. |

### Prompt Writing Patterns

**1. Instrumental (no vocals)**
```
Upbeat synthwave instrumental, 120 BPM, A minor, pulsing analog synths,
retro drum machine, warm pads. Instrumental only, no vocals.
```

**2. Structured song with lyrics**
```
Indie folk ballad, 75 BPM, G major, acoustic guitar + soft piano + light strings, melancholic.

[Intro]
(soft fingerpicked guitar, 8 bars)

[Verse 1]
Walking through the autumn leaves,
memories fall like rain.

[Chorus]
And I remember you,
in every shade of blue.

[Bridge]
(strings swell, drums enter)

[Outro]
(fade out with piano)
```

**3. Timestamp-based structure**
```
Cinematic orchestral piece, 90 BPM, D minor, epic and mysterious.
[0:00-0:15] Sparse piano motif, distant strings.
[0:15-0:45] Add low brass swell, timpani hits.
[0:45-1:30] Full orchestra climax with choir.
```

### Examples

Short instrumental clip (Clip model):
```
generate_music(
  prompt="Upbeat electronic dance track, 128 BPM, F# minor, pulsing saw-lead synths, heavy sub bass, four-on-the-floor kick. Instrumental only, no vocals."
)
```

Full song with structured lyrics (Pro model, lossless):
```
generate_music(
  prompt="Melancholic indie folk ballad, 75 BPM, G major, acoustic guitar and soft vocals.\n\n[Verse 1]\nWalking through the autumn leaves,\nmemories fall like rain.\n\n[Chorus]\nAnd I remember you,\nin every shade of blue.\n\n[Outro]\n(fade out)",
  output_format="wav"
)
```

Soundtrack inspired by a canvas scene:
```
generate_music(
  prompt="Cinematic orchestral piece matching this scene — epic and mysterious. [0:00-0:20] Sparse strings. [0:20-1:00] Full orchestra with timpani and choir. Instrumental only, no vocals.",
  reference_images=["/api/media/dark_forest_scene.jpg"]
)
```

## Tips

- Be **specific** about genre, instruments, BPM, key/scale, and mood — vague prompts produce generic music.
- Use **section tags** (`[Verse]`, `[Chorus]`, `[Bridge]`, `[Intro]`, `[Outro]`) to define song structure.
- Use **timestamps** (`[0:00-0:30]`) for precise transition control; works best with the Pro model.
- Write the prompt in the **language you want the lyrics in** (write Chinese prompt → Chinese vocals).
- For instrumental tracks, explicitly append **`Instrumental only, no vocals`**.
- Use `output_format="wav"` with the Pro model when the user needs lossless / studio-grade audio.
- Reference images influence **mood and atmosphere**, not literal content — best for scene-to-soundtrack.
- Tell the user generation takes **30–120 seconds**; the audio node appears on the canvas when ready.

## Canvas Integration

Generated music is automatically added as an audio node on the active canvas. To use canvas images as references:

**Step 1**: Discover available image nodes:
```
list_canvas_nodes(node_type="image")
→ [{id: "uuid-a", name: "Forest Scene"}, ...]
```

**Step 2**: Fetch a node's media URL:
```
get_canvas_node(node_id="uuid-a")
→ data.imageUrl = "/api/media/scene.jpg"
```

**Step 3**: Pass URL(s) to generate_music (max 10):
```
generate_music(
  prompt="Compose ambient background music matching this scene's atmosphere. Instrumental only, no vocals.",
  reference_images=["/api/media/scene.jpg"]
)
```

## Error Handling

| Error | Meaning | How to Handle |
|-------|---------|---------------|
| Safety filter triggered | Content violates safety policies | Tell the user the prompt was rejected. Suggest rephrasing without sensitive content. |
| API timeout | Generation took too long | Inform the user and suggest retrying with a simpler prompt. |
| Empty response | Model returned no audio | Suggest simplifying the prompt or reducing structural complexity. |
| `wav` not supported | `output_format="wav"` requested on Clip model | Retry with `output_format="mp3"`, or switch to the Pro model. |
