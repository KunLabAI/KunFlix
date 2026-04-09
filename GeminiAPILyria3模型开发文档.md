Lyria 3 is Google's family of music generation models, available
through the Gemini API. With Lyria 3, you can generate high-quality, 48kHz
stereo audio from text prompts or from images. These models deliver structural
coherence, including vocals, timed lyrics, and full instrumental arrangements.

The Lyria 3 family includes two models:

| Model | Model ID | Best for | Duration | Output |
|---|---|---|---|---|
| **Lyria 3 Clip** | `lyria-3-clip-preview` | Short clips, loops, previews | 30 seconds | MP3 |
| **Lyria 3 Pro** | `lyria-3-pro-preview` | Full-length songs with verses, choruses, bridges | A couple of minutes (controllable via prompt) | MP3, WAV |

Both models can be used using the standard `generateContent` method and the new
[Interactions API](https://ai.google.dev/gemini-api/docs/interactions), supporting multimodal
inputs (text and images), and produce **48kHz high-fidelity stereo** audio.

> [!NOTE]
> **Note:** Looking for real-time, streaming music generation? See [Real-time music generation with Lyria RealTime](https://ai.google.dev/gemini-api/docs/realtime-music-generation).

## Generate a music clip

The Lyria 3 Clip model always generates a **30-second** clip. To generate a
clip, call the `generateContent` method and set `response_modalities` to
`["AUDIO", "TEXT"]`. Including `TEXT` lets you receive the generated lyrics
or song structure alongside the audio.

### Python

    from google import genai
    from google.genai import types

    client = genai.Client()

    response = client.models.generate_content(
        model="lyria-3-clip-preview",
        contents="Create a 30-second cheerful acoustic folk song with "
                 "guitar and harmonica.",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO", "TEXT"],
        ),
    )

    # Parse the response
    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            with open("clip.mp3", "wb") as f:
                f.write(part.inline_data.data)
            print("Audio saved to clip.mp3")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    const ai = new GoogleGenAI({});

    async function main() {
      const response = await ai.models.generateContent({
        model: "lyria-3-clip-preview",
        contents: "Create a 30-second cheerful acoustic folk song with " +
                  "guitar and harmonica.",
        config: {
          responseModalities: ["AUDIO", "TEXT"],
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const buffer = Buffer.from(part.inlineData.data, "base64");
          fs.writeFileSync("clip.mp3", buffer);
          console.log("Audio saved to clip.mp3");
        }
      }
    }

    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"

        "google.golang.org/genai"
    )

    func main() {
        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }

        config := &genai.GenerateContentConfig{
            ResponseModalities: []string{"AUDIO", "TEXT"},
        }

        result, err := client.Models.GenerateContent(
            ctx,
            "lyria-3-clip-preview",
            genai.Text("Create a 30-second cheerful acoustic folk song " +
                       "with guitar and harmonica."),
            config,
        )
        if err != nil {
            log.Fatal(err)
        }

        for _, part := range result.Candidates[0].Content.Parts {
            if part.Text != "" {
                fmt.Println(part.Text)
            } else if part.InlineData != nil {
                err := os.WriteFile("clip.mp3", part.InlineData.Data, 0644)
                if err != nil {
                    log.Fatal(err)
                }
                fmt.Println("Audio saved to clip.mp3")
            }
        }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Paths;

    public class GenerateMusicClip {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("AUDIO", "TEXT")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "lyria-3-clip-preview",
              "Create a 30-second cheerful acoustic folk song with "
                  + "guitar and harmonica.",
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("clip.mp3"), blob.data().get());
                System.out.println("Audio saved to clip.mp3");
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/lyria-3-clip-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "Create a 30-second cheerful acoustic folk song with guitar and harmonica."}
          ]
        }],
        "generationConfig": {
          "responseModalities": ["AUDIO", "TEXT"]
        }
      }'

### C#

    using System.Threading.Tasks;
    using Google.GenAI;
    using Google.GenAI.Types;
    using System.IO;

    public class GenerateMusicClip {
      public static async Task main() {
        var client = new Client();
        var config = new GenerateContentConfig {
          ResponseModalities = { "AUDIO", "TEXT" }
        };

        var response = await client.Models.GenerateContentAsync(
          model: "lyria-3-clip-preview",
          contents: "Create a 30-second cheerful acoustic folk song with guitar and harmonica.",
          config: config
        );

        foreach (var part in response.Candidates[0].Content.Parts) {
          if (part.Text != null) {
            Console.WriteLine(part.Text);
          } else if (part.InlineData != null) {
            await File.WriteAllBytesAsync("clip.mp3", part.InlineData.Data);
            Console.WriteLine("Audio saved to clip.mp3");
          }
        }
      }
    }

> [!NOTE]
> **Objective:** For more examples, refer to the [Lyria 3 Notebook](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Get_started_Lyria.ipynb) in the Cookbooks repository.

## Generate a full-length song

Use the `lyria-3-pro-preview` model to generate full-length songs that last a
couple of minutes. The Pro model understands musical structure and can create
compositions with distinct verses, choruses, and bridges. You can influence the
duration by specifying it in your prompt (e.g., "create a 2-minute song") or by
using [timestamps](https://ai.google.dev/gemini-api/docs/music-generation#timing) to define the structure.

### Python

    response = client.models.generate_content(
        model="lyria-3-pro-preview",
        contents="An epic cinematic orchestral piece about a journey home. "
                 "Starts with a solo piano intro, builds through sweeping "
                 "strings, and climaxes with a massive wall of sound.",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO", "TEXT"],
            response_mime_type="audio/wav",
        ),
    )

### JavaScript

    const response = await ai.models.generateContent({
      model: "lyria-3-pro-preview",
      contents: "An epic cinematic orchestral piece about a journey home. " +
                "Starts with a solo piano intro, builds through sweeping " +
                "strings, and climaxes with a massive wall of sound.",
      config: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    });

### Go

    result, err := client.Models.GenerateContent(
        ctx,
        "lyria-3-pro-preview",
        genai.Text("An epic cinematic orchestral piece about a journey " +
                   "home. Starts with a solo piano intro, builds through " +
                   "sweeping strings, and climaxes with a massive wall of sound."),
        config,
    )

### Java

    GenerateContentResponse response = client.models.generateContent(
        "lyria-3-pro-preview",
        "An epic cinematic orchestral piece about a journey home. "
            + "Starts with a solo piano intro, builds through sweeping "
            + "strings, and climaxes with a massive wall of sound.",
        config);

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "An epic cinematic orchestral piece about a journey home. Starts with a solo piano intro, builds through sweeping strings, and climaxes with a massive wall of sound."}
          ]
        }],
        "generationConfig": {
          "responseModalities": ["AUDIO", "TEXT"]
        }
      }'

### C#

    var response = await client.Models.GenerateContentAsync(
      model: "lyria-3-pro-preview",
      contents: "An epic cinematic orchestral piece about a journey home. " +
                "Starts with a solo piano intro, builds through sweeping " +
                "strings, and climaxes with a massive wall of sound.",
      config: config
    );

## Select output format

By default, the Lyria 3 models generate audio in **MP3** format. For
Lyria 3 Pro, you can also request the output in **WAV** format by setting
the `response_mime_type` in the `generationConfig`.

### Python

    response = client.models.generate_content(
        model="lyria-3-pro-preview",
        contents="An atmospheric ambient track.",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO", "TEXT"],
            response_mime_type="audio/wav",
        ),
    )

### JavaScript

    const response = await ai.models.generateContent({
      model: "lyria-3-pro-preview",
      contents: "An atmospheric ambient track.",
      config: {
        responseModalities: ["AUDIO", "TEXT"],
        responseMimeType: "audio/wav",
      },
    });

### Go

    config := &genai.GenerateContentConfig{
        ResponseModalities: []string{"AUDIO", "TEXT"},
        ResponseMIMEType:   "audio/wav",
    }

    result, err := client.Models.GenerateContent(
        ctx,
        "lyria-3-pro-preview",
        genai.Text("An atmospheric ambient track."),
        config,
    )

### Java

    GenerateContentConfig config = GenerateContentConfig.builder()
        .responseModalities("AUDIO", "TEXT")
        .responseMimeType("audio/wav")
        .build();

    GenerateContentResponse response = client.models.generateContent(
        "lyria-3-pro-preview",
        "An atmospheric ambient track.",
        config);

### C#

    var config = new GenerateContentConfig {
      ResponseModalities = { "AUDIO", "TEXT" },
      ResponseMimeType = "audio/wav"
    };

    var response = await client.Models.GenerateContentAsync(
      model: "lyria-3-pro-preview",
      contents: "An atmospheric ambient track.",
      config: config
    );

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "An atmospheric ambient track."}
          ]
        }],
        "generationConfig": {
          "responseModalities": ["AUDIO", "TEXT"],
          "responseMimeType": "audio/wav"
        }
      }'

## Parse the response

The response from Lyria 3 contains multiple parts. Text parts contain the
generated lyrics or a JSON description of the song structure. Parts with
`inline_data` contain the audio bytes.

> [!IMPORTANT]
> **Important:** You should not assume the lyrics are always the first part. Always iterate through all parts and check the type of each one.

### Python

    lyrics = []
    audio_data = None

    for part in response.parts:
        if part.text is not None:
            lyrics.append(part.text)
        elif part.inline_data is not None:
            audio_data = part.inline_data.data

    if lyrics:
        print("Lyrics:\n" + "\n".join(lyrics))

    if audio_data:
        with open("output.mp3", "wb") as f:
            f.write(audio_data)

### JavaScript

    const lyrics = [];
    let audioData = null;

    for (const part of response.candidates[0].content.parts) {
      if (part.text) {
        lyrics.push(part.text);
      } else if (part.inlineData) {
        audioData = Buffer.from(part.inlineData.data, "base64");
      }
    }

    if (lyrics.length) {
      console.log("Lyrics:\n" + lyrics.join("\n"));
    }

    if (audioData) {
      fs.writeFileSync("output.mp3", audioData);
    }

### Go

    var lyrics []string
    var audioData []byte

    for _, part := range result.Candidates[0].Content.Parts {
        if part.Text != "" {
            lyrics = append(lyrics, part.Text)
        } else if part.InlineData != nil {
            audioData = part.InlineData.Data
        }
    }

    if len(lyrics) > 0 {
        fmt.Println("Lyrics:\n" + strings.Join(lyrics, "\n"))
    }

    if audioData != nil {
        err := os.WriteFile("output.mp3", audioData, 0644)
        if err != nil {
            log.Fatal(err)
        }
    }

### Java

    List<String> lyrics = new ArrayList<>();
    byte[] audioData = null;

    for (Part part : response.parts()) {
      if (part.text().isPresent()) {
        lyrics.add(part.text().get());
      } else if (part.inlineData().isPresent()) {
        audioData = part.inlineData().get().data().get();
      }
    }

    if (!lyrics.isEmpty()) {
      System.out.println("Lyrics:\n" + String.join("\n", lyrics));
    }

    if (audioData != null) {
      Files.write(Paths.get("output.mp3"), audioData);
    }

### C#

    var lyrics = new List<string>();
    byte[] audioData = null;

    foreach (var part in response.Candidates[0].Content.Parts) {
      if (part.Text != null) {
        lyrics.Add(part.Text);
      } else if (part.InlineData != null) {
        audioData = part.InlineData.Data;
      }
    }

    if (lyrics.Count > 0) {
      Console.WriteLine("Lyrics:\n" + string.Join("\n", lyrics));
    }

    if (audioData != null) {
      await File.WriteAllBytesAsync("output.mp3", audioData);
    }

### REST

    # The output from the REST API is a JSON object containing base64 encoded data.
    # You can extract the text or the audio data using a tool like jq.
    # To extract the audio and save it to a file:
    curl ... | jq -r '.candidates[0].content.parts[] | select(.inlineData) | .inlineData.data' | base64 -d > output.mp3

## Generate music from images

Lyria 3 supports multimodal inputs --- you can provide up to **10 images**
alongside your text prompt and the model will compose music inspired by the
visual content.

### Python

    from PIL import Image

    image = Image.open("desert_sunset.jpg")

    response = client.models.generate_content(
        model="lyria-3-pro-preview",
        contents=[
            "An atmospheric ambient track inspired by the mood and "
            "colors in this image.",
            image,
        ],
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO", "TEXT"],
        ),
    )

### JavaScript

    const imageData = fs.readFileSync("desert_sunset.jpg");
    const base64Image = imageData.toString("base64");

    const response = await ai.models.generateContent({
      model: "lyria-3-pro-preview",
      contents: [
        { text: "An atmospheric ambient track inspired by the mood " +
                "and colors in this image." },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image,
          },
        },
      ],
      config: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    });

### Go

    imgData, err := os.ReadFile("desert_sunset.jpg")
    if err != nil {
        log.Fatal(err)
    }

    parts := []*genai.Part{
        genai.NewPartFromText("An atmospheric ambient track inspired " +
            "by the mood and colors in this image."),
        &genai.Part{
            InlineData: &genai.Blob{
                MIMEType: "image/jpeg",
                Data:     imgData,
            },
        },
    }

    contents := []*genai.Content{
        genai.NewContentFromParts(parts, genai.RoleUser),
    }

    result, err := client.Models.GenerateContent(
        ctx,
        "lyria-3-pro-preview",
        contents,
        config,
    )

### Java

    GenerateContentResponse response = client.models.generateContent(
        "lyria-3-pro-preview",
        Content.fromParts(
            Part.fromText("An atmospheric ambient track inspired by "
                + "the mood and colors in this image."),
            Part.fromBytes(
                Files.readAllBytes(Path.of("desert_sunset.jpg")),
                "image/jpeg")),
        config);

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H 'Content-Type: application/json' \
      -d "{
        \"contents\": [{
          \"parts\":[
              {\"text\": \"An atmospheric ambient track inspired by the mood and colors in this image.\"},
              {
                \"inline_data\": {
                  \"mime_type\":\"image/jpeg\",
                  \"data\": \"<BASE64_IMAGE_DATA>\"
                }
              }
          ]
        }],
        \"generationConfig\": {
          \"responseModalities\": [\"AUDIO\", \"TEXT\"]
        }
      }"

### C#

    var response = await client.Models.GenerateContentAsync(
      model: "lyria-3-pro-preview",
      contents: new List<Part> {
        Part.FromText("An atmospheric ambient track inspired by the mood and colors in this image."),
        Part.FromBytes(await File.ReadAllBytesAsync("desert_sunset.jpg"), "image/jpeg")
      },
      config: config
    );

![](https://storage.googleapis.com/generativeai-downloads/images/desert_sunset.jpg)  

## Provide custom lyrics

You can write your own lyrics and include them in the prompt. Use section tags
like `[Verse]`, `[Chorus]`, and `[Bridge]` to help the model understand the
song structure:

### Python

    prompt = """
    Create a dreamy indie pop song with the following lyrics:

    [Verse 1]
    Walking through the neon glow,
    city lights reflect below,
    every shadow tells a story,
    every corner, fading glory.

    [Chorus]
    We are the echoes in the night,
    burning brighter than the light,
    hold on tight, don't let me go,
    we are the echoes down below.

    [Verse 2]
    Footsteps lost on empty streets,
    rhythms sync to heartbeats,
    whispers carried by the breeze,
    dancing through the autumn leaves.
    """

    response = client.models.generate_content(
        model="lyria-3-pro-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO", "TEXT"],
        ),
    )

### JavaScript

    const prompt = `
    Create a dreamy indie pop song with the following lyrics:

    [Verse 1]
    Walking through the neon glow,
    city lights reflect below,
    every shadow tells a story,
    every corner, fading glory.

    [Chorus]
    We are the echoes in the night,
    burning brighter than the light,
    hold on tight, don't let me go,
    we are the echoes down below.

    [Verse 2]
    Footsteps lost on empty streets,
    rhythms sync to heartbeats,
    whispers carried by the breeze,
    dancing through the autumn leaves.
    `;

    const response = await ai.models.generateContent({
      model: "lyria-3-pro-preview",
      contents: prompt,
      config: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    });

### Go

    prompt := `
    Create a dreamy indie pop song with the following lyrics:

    [Verse 1]
    Walking through the neon glow,
    city lights reflect below,
    every shadow tells a story,
    every corner, fading glory.

    [Chorus]
    We are the echoes in the night,
    burning brighter than the light,
    hold on tight, don't let me go,
    we are the echoes down below.

    [Verse 2]
    Footsteps lost on empty streets,
    rhythms sync to heartbeats,
    whispers carried by the breeze,
    dancing through the autumn leaves.
    `

    result, err := client.Models.GenerateContent(
        ctx,
        "lyria-3-pro-preview",
        genai.Text(prompt),
        config,
    )

### Java

    String prompt = """
        Create a dreamy indie pop song with the following lyrics:

        [Verse 1]
        Walking through the neon glow,
        city lights reflect below,
        every shadow tells a story,
        every corner, fading glory.

        [Chorus]
        We are the echoes in the night,
        burning brighter than the light,
        hold on tight, don't let me go,
        we are the echoes down below.

        [Verse 2]
        Footsteps lost on empty streets,
        rhythms sync to heartbeats,
        whispers carried by the breeze,
        dancing through the autumn leaves.
        """;

    GenerateContentResponse response = client.models.generateContent(
        "lyria-3-pro-preview",
        prompt,
        config);

### C#

    var prompt = @"
    Create a dreamy indie pop song with the following lyrics:

    [Verse 1]
    Walking through the neon glow,
    city lights reflect below,
    every shadow tells a story,
    every corner, fading glory.

    [Chorus]
    We are the echoes in the night,
    burning brighter than the light,
    hold on tight, don't let me go,
    we are the echoes down below.

    [Verse 2]
    Footsteps lost on empty streets,
    rhythms sync to heartbeats,
    whispers carried by the breeze,
    dancing through the autumn leaves.
    ";

    var response = await client.Models.GenerateContentAsync(
      model: "lyria-3-pro-preview",
      contents: prompt,
      config: config
    );

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "Create a dreamy indie pop song with the following lyrics: ..."}
          ]
        }],
        "generationConfig": {
          "responseModalities": ["AUDIO", "TEXT"]
        }
      }'

## Control timing and structure

You can specify exactly what happens at specific moments in the song using
timestamps. This is useful for controlling when instruments enter, when lyrics
are delivered, and how the song progresses:

### Python

    prompt = """
    [0:00 - 0:10] Intro: Begin with a soft lo-fi beat and muffled
                  vinyl crackle.
    [0:10 - 0:30] Verse 1: Add a warm Fender Rhodes piano melody
                  and gentle vocals singing about a rainy morning.
    [0:30 - 0:50] Chorus: Full band with upbeat drums and soaring
                  synth leads. The lyrics are hopeful and uplifting.
    [0:50 - 1:00] Outro: Fade out with the piano melody alone.
    """

    response = client.models.generate_content(
        model="lyria-3-pro-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO", "TEXT"],
        ),
    )

### JavaScript

    const prompt = `
    [0:00 - 0:10] Intro: Begin with a soft lo-fi beat and muffled
                  vinyl crackle.
    [0:10 - 0:30] Verse 1: Add a warm Fender Rhodes piano melody
                  and gentle vocals singing about a rainy morning.
    [0:30 - 0:50] Chorus: Full band with upbeat drums and soaring
                  synth leads. The lyrics are hopeful and uplifting.
    [0:50 - 1:00] Outro: Fade out with the piano melody alone.
    `;

    const response = await ai.models.generateContent({
      model: "lyria-3-pro-preview",
      contents: prompt,
      config: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    });

### Go

    prompt := `
    [0:00 - 0:10] Intro: Begin with a soft lo-fi beat and muffled
                  vinyl crackle.
    [0:10 - 0:30] Verse 1: Add a warm Fender Rhodes piano melody
                  and gentle vocals singing about a rainy morning.
    [0:30 - 0:50] Chorus: Full band with upbeat drums and soaring
                  synth leads. The lyrics are hopeful and uplifting.
    [0:50 - 1:00] Outro: Fade out with the piano melody alone.
    `

    result, err := client.Models.GenerateContent(
        ctx,
        "lyria-3-pro-preview",
        genai.Text(prompt),
        config,
    )

### Java

    String prompt = """
        [0:00 - 0:10] Intro: Begin with a soft lo-fi beat and muffled
                      vinyl crackle.
        [0:10 - 0:30] Verse 1: Add a warm Fender Rhodes piano melody
                      and gentle vocals singing about a rainy morning.
        [0:30 - 0:50] Chorus: Full band with upbeat drums and soaring
                      synth leads. The lyrics are hopeful and uplifting.
        [0:50 - 1:00] Outro: Fade out with the piano melody alone.
        """;

    GenerateContentResponse response = client.models.generateContent(
        "lyria-3-pro-preview",
        prompt,
        config);

### C#

    var prompt = @"
    [0:00 - 0:10] Intro: Begin with a soft lo-fi beat and muffled
                  vinyl crackle.
    [0:10 - 0:30] Verse 1: Add a warm Fender Rhodes piano melody
                  and gentle vocals singing about a rainy morning.
    [0:30 - 0:50] Chorus: Full band with upbeat drums and soaring
                  synth leads. The lyrics are hopeful and uplifting.
    [0:50 - 1:00] Outro: Fade out with the piano melody alone.
    ";

    var response = await client.Models.GenerateContentAsync(
      model: "lyria-3-pro-preview",
      contents: prompt,
      config: config
    );

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "[0:00 - 0:10] Intro: ..."}
          ]
        }],
        "generationConfig": {
          "responseModalities": ["AUDIO", "TEXT"]
        }
      }'

## Generate instrumental tracks

For background music, game soundtracks, or any use case where vocals are not
required, you can prompt the model to produce instrumental-only tracks:

### Python

    response = client.models.generate_content(
        model="lyria-3-clip-preview",
        contents="A bright chiptune melody in C Major, retro 8-bit "
                 "video game style. Instrumental only, no vocals.",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO", "TEXT"],
        ),
    )

### JavaScript

    const response = await ai.models.generateContent({
      model: "lyria-3-clip-preview",
      contents: "A bright chiptune melody in C Major, retro 8-bit " +
                "video game style. Instrumental only, no vocals.",
      config: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    });

### Go

    result, err := client.Models.GenerateContent(
        ctx,
        "lyria-3-clip-preview",
        genai.Text("A bright chiptune melody in C Major, retro 8-bit " +
                   "video game style. Instrumental only, no vocals."),
        config,
    )

### Java

    GenerateContentResponse response = client.models.generateContent(
        "lyria-3-clip-preview",
        "A bright chiptune melody in C Major, retro 8-bit "
            + "video game style. Instrumental only, no vocals.",
        config);

### C#

    var response = await client.Models.GenerateContentAsync(
      model: "lyria-3-clip-preview",
      contents: "A bright chiptune melody in C Major, retro 8-bit " +
                "video game style. Instrumental only, no vocals.",
      config: config
    );

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/lyria-3-clip-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "A bright chiptune melody in C Major, retro 8-bit video game style. Instrumental only, no vocals."}
          ]
        }],
        "generationConfig": {
          "responseModalities": ["AUDIO", "TEXT"]
        }
      }'

> [!TIP]
> **Tip:** For [best results](https://ai.google.dev/gemini-api/docs/music-generation#prompt-guide), include "Instrumental only, no vocals" explicitly in your prompt.

## Generate music in different languages

Lyria 3 generates lyrics in the language of your prompt. To generate a song
with French lyrics, write your prompt in French. The model adapts its vocal
style and pronunciation to match the language.

### Python

    response = client.models.generate_content(
        model="lyria-3-pro-preview",
        contents="Crée une chanson pop romantique en français sur un "
                 "coucher de soleil à Paris. Utilise du piano et de "
                 "la guitare acoustique.",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO", "TEXT"],
        ),
    )

### JavaScript

    const response = await ai.models.generateContent({
      model: "lyria-3-pro-preview",
      contents: "Crée une chanson pop romantique en français sur un " +
                "coucher de soleil à Paris. Utilise du piano et de " +
                "la guitare acoustique.",
      config: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    });

### Go

    result, err := client.Models.GenerateContent(
        ctx,
        "lyria-3-pro-preview",
        genai.Text("Crée une chanson pop romantique en français sur un " +
                   "coucher de soleil à Paris. Utilise du piano et de " +
                   "la guitare acoustique."),
        config,
    )

### Java

    GenerateContentResponse response = client.models.generateContent(
        "lyria-3-pro-preview",
        "Crée une chanson pop romantique en français sur un "
            + "coucher de soleil à Paris. Utilise du piano et de "
            + "la guitare acoustique.",
        config);

### C#

    var response = await client.Models.GenerateContentAsync(
      model: "lyria-3-pro-preview",
      contents: "Crée une chanson pop romantique en français sur un " +
                "coucher de soleil à Paris. Utilise du piano et de " +
                "la guitare acoustique.",
      config: config
    );

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "Crée une chanson pop romantique en français sur un coucher de soleil à Paris. Utilise du piano et de la guitare acoustique."}
          ]
        }],
        "generationConfig": {
          "responseModalities": ["AUDIO", "TEXT"]
        }
      }'

## Model intelligence

Lyria 3 analyzes your prompt process where the
model reasons through musical structure (intro, verse, chorus, bridge, etc.)
based on your prompt.
This happens before the audio is generated and ensures structural coherence and
musicality.

> [!IMPORTANT]
> **Important:** While Lyria 3 uses a prompt rewriter internally to interpret natural language instructions, it does **not** expose intermediate "thought" blocks or thought signatures to the user.

## Interactions API

You can use Lyria 3 models with the [Interactions API](https://ai.google.dev/gemini-api/docs/interactions);
a unified interface for interacting with Gemini models and agents. It simplifies
state management and long-running tasks for complex multimodal use cases.

### Python

    from google import genai

    client = genai.Client()

    interaction = client.interactions.create(
        model="lyria-3-pro-preview",
        input="A melancholic jazz fusion track in D minor, " +
              "featuring a smooth saxophone melody, walking bass line, " +
              "and complex drum rhythms.",
        response_modalities=["AUDIO", "TEXT"]
    )

    for output in interaction.outputs:
        if output.text:
            print(output.text)
        elif output.inline_data:
             with open("interaction_output.mp3", "wb") as f:
                f.write(output.inline_data.data)
             print("Audio saved to interaction_output.mp3")

### JavaScript

    import { GoogleGenAI } from '@google/genai';

    const client = new GoogleGenAI({});

    const interaction = await client.interactions.create({
      model: 'lyria-3-pro-preview',
      input: 'A melancholic jazz fusion track in D minor, ' +
             'featuring a smooth saxophone melody, walking bass line, ' +
             'and complex drum rhythms.',
      responseModalities: ['AUDIO', 'TEXT'],
    });

    for (const output of interaction.outputs) {
      if (output.text) {
        console.log(output.text);
      } else if (output.inlineData) {
        const buffer = Buffer.from(output.inlineData.data, 'base64');
        fs.writeFileSync('interaction_output.mp3', buffer);
        console.log('Audio saved to interaction_output.mp3');
      }
    }

### REST

    curl -X POST "https://generativelanguage.googleapis.com/v1beta/interactions" \
    -H "Content-Type: application/json" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    -d '{
        "model": "lyria-3-pro-preview",
        "input": "A melancholic jazz fusion track in D minor, featuring a smooth saxophone melody, walking bass line, and complex drum rhythms.",
        "responseModalities": ["AUDIO", "TEXT"]
    }'

## Prompting guide

The more specific your prompt, the better the results. Here's what you can
include to guide the generation:

- **Genre**: Specify a genre or blend of genres (e.g., "lo-fi hip hop", "jazz fusion", "cinematic orchestral").
- **Instruments**: Name specific instruments (e.g., "Fender Rhodes piano", "slide guitar", "TR-808 drum machine").
- **BPM**: Set the tempo (e.g., "120 BPM", "slow tempo around 70 BPM").
- **Key/Scale**: Specify a musical key (e.g., "in G major", "D minor").
- **Mood and atmosphere**: Use descriptive adjectives (e.g., "nostalgic", "aggressive", "ethereal", "dreamy").
- **Structure** : Use tags like `[Verse]`, `[Chorus]`, `[Bridge]`, `[Intro]`, `[Outro]` or timestamps to control the song's progression.
- **Duration**: The Clip model always produces 30-second clips. For the Pro model, specify the desired length in your prompt (e.g., "create a 2-minute song") or use timestamps to control duration.

### Example prompts

Here are some examples of effective prompts:

- `"A 30-second lofi hip hop beat with dusty vinyl crackle, mellow Rhodes
  piano chords, a slow boom-bap drum pattern at 85 BPM, and a jazzy upright
  bass line. Instrumental only."`
- `"An upbeat, feel-good pop song in G major at 120 BPM with bright acoustic
  guitar strumming, claps, and warm vocal harmonies about a summer road trip."`
- `"A dark, atmospheric trap beat at 140 BPM with heavy 808 bass, eerie synth
  pads, sharp hi-hats, and a haunting vocal sample. In D minor."`

## Best practices

- **Iterate with Clip first.** Use the faster `lyria-3-clip-preview` model to experiment with prompts before committing to a full-length generation with `lyria-3-pro-preview`.
- **Be specific.** Vague prompts produce generic results. Mention instruments, BPM, key, mood, and structure for the best output.
- **Match your language.** Prompt in the language you want the lyrics in.
- **Use section tags.** `[Verse]`, `[Chorus]`, `[Bridge]` tags give the model clear structure to follow.
- **Separate lyrics from instructions.** When providing custom lyrics, clearly separate them from your musical direction instructions.

## Limitations

- **Safety**: All prompts are checked by safety filters. Prompts that trigger the filters will be blocked. This includes prompts that request specific artist voices or the generation of copyrighted lyrics.
- **Watermarking** : All generated audio includes a [SynthID audio watermark](https://ai.google.dev/responsible/docs/safeguards/synthid) for identification. This watermark is imperceptible to the human ear and does not affect the listening experience.
- **Multi-turn editing**: Music generation is a single-turn process. Iterative editing or refining a generated clip through multiple prompts is not supported in the current version of Lyria 3.
- **Length**: The Clip model always generates 30-second clips. The Pro model generates songs that last a couple of minutes; exact duration can be influenced through your prompt.
- **Determinism**: Results may vary between calls, even with the same prompt.

## What's next

- Check [pricing](https://ai.google.dev/gemini-api/docs/pricing) for Lyria 3 models,
- Try [real-time, streaming music generation](https://ai.google.dev/gemini-api/docs/realtime-music-generation) with Lyria RealTime,
- Generate multi-speaker conversations with the [TTS models](https://ai.google.dev/gemini-api/docs/audio-generation),
- Discover how to generate [images](https://ai.google.dev/gemini-api/docs/image-generation) or [videos](https://ai.google.dev/gemini-api/docs/video),
- Find out how Gemini can [understand audio files](https://ai.google.dev/gemini-api/docs/audio),
- Have a real-time conversation with Gemini using the [Live API](https://ai.google.dev/gemini-api/docs/live).