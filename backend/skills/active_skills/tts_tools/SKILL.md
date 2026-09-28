---
name: tts_tools
description: "AI text-to-speech. Provides the generate_tts tool for converting text into natural spoken audio with selectable voices, delivery styles, and two-speaker dialogue using Google Gemini TTS models."
metadata:
  builtin_skill_version: "1.0"
---
# TTS Tools

Use this skill when the user asks to convert text to speech, generate voiceover, narration, dubbing, podcast dialogue, or read text aloud.

Loading this skill activates the `generate_tts` tool.

**IMPORTANT**: After loading this skill, you MUST call the `generate_tts` tool to perform speech operations. Do NOT call `tts_tools` directly - it is NOT a tool name.

**Important:** Speech generation is asynchronous and takes 10-60 seconds. The tool returns a task ID immediately; the user will be notified when the result is ready.

## Tool: generate_tts

Convert text into natural-sounding speech audio, with fine-grained control over voice, style, and multi-speaker dialogue.

### When to Use

- User asks to convert text/script/dialogue into speech or audio.
- User wants voiceover, narration, audiobook segments, or podcast dialogue.
- User wants a character in the canvas/story to "speak" their lines.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Single-speaker mode | The verbatim transcript to speak. Never put stage directions here. Inline vocal tags `<laugh>`, `<sigh>`, `<cough>`, `<breath>`, `<short pause>` are allowed. |
| `voice` | string | No | Prebuilt voice name. Use `"auto"` (default) to let the model pick a suitable voice. e.g. Kore (firm), Puck (upbeat), Zephyr (bright), Charon (informative), Leda (youthful), Aoede (breezy), Sulafat (warm). |
| `style` | string | No | Sustained turn-level delivery: emotion, pace, tone. e.g. "cheerful and friendly", "whispered urgently", "calm and relaxed". |
| `speakers` | object[] | Dialogue mode | Max 2 speakers. Each item: `{speaker, voice, text, style?}` — one item per dialogue turn. Overrides top-level `text`/`voice`/`style`. |

### Style vs Inline Tags

- **Sustained delivery** (emotion, pace, tone across the whole turn) → `style` parameter.
- **Point-in-time events** (a laugh, a sigh, a pause inside a sentence) → inline tags in `text`, e.g. `"Wait... <short pause> did you hear that? <sigh>"`.

### Examples

Single-speaker narration:
```
generate_tts(
  text="In the heart of the ancient forest, a legend was about to awaken.",
  voice="Charon",
  style="slow, mysterious narrator tone"
)
```

Expressive voiceover with inline tags:
```
generate_tts(
  text="Excuse me <cough> as I was saying... this changes everything! <laugh>",
  voice="Puck",
  style="energetic and playful"
)
```

Two-speaker dialogue:
```
generate_tts(
  speakers=[
    {"speaker": "Joe", "voice": "Puck", "text": "How's it going today Jane?", "style": "cheerful and friendly"},
    {"speaker": "Jane", "voice": "Kore", "text": "Not too bad, how about you?", "style": "calm and relaxed"}
  ]
)
```

## Tips

- The speech language follows the input text language automatically — write the text in the target language.
- Keep `text` strictly verbatim: anything written there will be read aloud.
- When the user does not specify a voice, use `voice="auto"` and let the model choose.
- Use different `style` per dialogue turn for more natural conversation.
- Speech generation is async — inform the user it will take 10-60 seconds.
- The generated audio will automatically be added as a TTS node on the canvas.

## Canvas Integration

Generated speech is automatically created as a TTS node on the active canvas. To speak text from an existing canvas text node:

**Step 1**: Call `list_canvas_nodes(node_type="text")` to discover text nodes.

**Step 2**: Call `get_canvas_node(node_id=...)` and read the text content from `data.content`.

**Step 3**: Pass the text to generate_tts:
```
generate_tts(
  text="<content of the text node>",
  voice="Kore",
  style="warm and friendly"
)
```

## Error Handling

| Error | Meaning | How to Handle |
|-------|---------|---------------|
| Safety filter triggered | Content violates safety policies | Tell the user the text was rejected due to content policy. Suggest rephrasing. |
| API timeout | Generation took too long | Inform the user and suggest retrying. |
| Empty response | Model returned no audio | Suggest shortening or rephrasing the text. |
