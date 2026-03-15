> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Create Text-to-Video Generation Task

> Use this API to create a video generation task from text input.



## OpenAPI

````yaml api-reference/video/generation/api/text-to-video.json post /v1/video_generation
openapi: 3.1.0
info:
  title: MiniMax API
  description: MiniMax video generation and file management API
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.minimax.io
security:
  - bearerAuth: []
paths:
  /v1/video_generation:
    post:
      tags:
        - Video
      summary: Video Generation
      operationId: videoGeneration
      parameters:
        - name: Content-Type
          in: header
          required: true
          description: >-
            The media type of the request body. Must be set to
            `application/json` to ensure the data is sent in JSON format.
          schema:
            type: string
            enum:
              - application/json
            default: application/json
      requestBody:
        description: ''
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VideoGenerationReq'
        required: true
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VideoGenerationResp'
components:
  schemas:
    VideoGenerationReq:
      type: object
      required:
        - model
        - prompt
      properties:
        model:
          type: string
          description: >-
            Model name. Supported values:

            `MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-02`, `T2V-01-Director`,
            `T2V-01`.
          enum:
            - MiniMax-Hailuo-2.3
            - MiniMax-Hailuo-02
            - T2V-01-Director
            - T2V-01
        prompt:
          type: string
          description: "Text description of the video, up to 2000 characters.  \r\nFor `MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-02` and `T2V-01-Director` models, camera movement can be controlled using `[command]` syntax.\n- **Supported 15 camera commands**:\n\t- Truck: `[Truck left]`, `[Truck right]`\n\t- Pan: `[Pan left]`, `[Pan right]`\n\t- Push: `[Push in]`, `[Pull out]`\n\t- Pedestal: `[Pedestal up]`, `[Pedestal down]`\n\t- Tilt: `[Tilt up]`, `[Tilt down]`\n\t- Zoom: `[Zoom in]`, `[Zoom out]`\n\t- Shake: `[Shake]`\n\t- Follow: `[Tracking shot]`\n\t- Static: `[Static shot]`\n\r\n- **Usage rules**: \n  - *Combined movements*: Multiple commands inside one `[]` take effect simultaneously (e.g., `[Pan left,Pedestal up]`). Recommended max: 3. \n  - *Sequential movements*: Commands appear in order, e.g., `\"...[Push in], then...[Push out]\"`. \n  - *Natural language*: Free-form descriptions also work, but explicit commands yield more accurate results.  "
        prompt_optimizer:
          type: boolean
          description: >-
            Whether to automatically optimize the `prompt`. Defaults to `true`.
            Set to `false` for more precise control.
        fast_pretreatment:
          type: boolean
          description: >-
            Reduces optimization time when `prompt_optimizer` is enabled.
            Defaults to `false`. Applies only to `MiniMax-Hailuo-2.3` and
            `MiniMax-Hailuo-02`.
        duration:
          type: integer
          description: >-
            Video length (seconds). Default is `6`. Available values depend on
            model and resolution:

            | Model |  720P |768P | 1080P |

            | :--- |:--- |:--- | :--- |

            | MiniMax-Hailuo-2.3 | - | `6` or `10` | `6` |

            | MiniMax-Hailuo-02 | - | `6` or `10` | `6` |

            | Other models | `6` | - |`6` |  
        resolution:
          type: string
          description: >-
            Video resolution. Options depend on model and duration:

            | Model | 6s | 10s |

            | :--- | :--- | :--- |

            | MiniMax-Hailuo-2.3 |  `768P` (default), `1080P` |  `768P`
            (default) |

            | MiniMax-Hailuo-02 |  `768P` (default), `1080P` |  `768P` (default)
            |

            | Other models | `720P` (default) | Not supported |
          enum:
            - 720P
            - 768P
            - 1080P
        callback_url:
          type: string
          description: "A callback URL to receive asynchronous task status updates.\n1. **Validation**: Once configured, MiniMax sends a `POST` request with a `challenge` field. Your server must echo this value within 3s to validate.\n2. **Updates**: After validation, MiniMax pushes status updates when the task changes. Response structure matches the [*Query Video Generation Task* API](/api-reference/video-generation-query).\n\n**Callback `status` values**:\n- `\"processing\"` – Task in progress\n- `\"success\"` – Task completed successfully\n- `\"failed\"` – Task failed\n\n```python\nfrom fastapi import FastAPI, HTTPException, Request\r\nimport json\r\n\r\napp = FastAPI()\r\n\r\n@app.post(\"/get_callback\")\r\nasync def get_callback(request: Request):\r\n    try:\r\n        json_data = await request.json()\r\n        challenge = json_data.get(\"challenge\")\r\n        if challenge is not None:\r\n            # Validation request, echo back challenge\r\n            return {\"challenge\": challenge}\r\n        else:\r\n            # Status update request, handle accordingly\r\n            # {\r\n            #     \"task_id\": \"115334141465231360\",\r\n            #     \"status\": \"success\",\r\n            #     \"file_id\": \"205258526306433\",\r\n            #     \"base_resp\": {\r\n            #         \"status_code\": 0,\r\n            #         \"status_msg\": \"success\"\r\n            #     }\r\n            # }\r\n            return {\"status\": \"success\"}\r\n    except Exception as e:\r\n        raise HTTPException(status_code=500, detail=str(e))\r\n\r\nif __name__ == \"__main__\":\r\n    import uvicorn\r\n    uvicorn.run(\r\n        app,  # Required\r\n        host=\"0.0.0.0\",  # Required\r\n        port=8000,  # Required, port can be customized\r\n        # ssl_keyfile=\"yourname.yourDomainName.com.key\",  # Optional, enable if using SSL\r\n        # ssl_certfile=\"yourname.yourDomainName.com.key\",  # Optional, enable if using SSL\r\n    )\n```"
      example:
        model: MiniMax-Hailuo-2.3
        prompt: A man picks up a book [Pedestal up], then reads [Static shot].
        duration: 6
        resolution: 1080P
    VideoGenerationResp:
      type: object
      properties:
        task_id:
          type: string
          description: The video generation task ID, used for querying status.
        base_resp:
          $ref: '#/components/schemas/BaseResp'
      example:
        task_id: '106916112212032'
        base_resp:
          status_code: 0
          status_msg: success
    BaseResp:
      type: object
      properties:
        status_code:
          type: integer
          description: >-
            The status codes and their meanings are as follows:

            - `0`, Request successful

            - `1002`, Rate limit triggered, please try again later

            - `1004`, Account authentication failed, please check if the API Key
            is correct

            - `1008`, Insufficient account balance

            - `1026`, Sensitive content detected in prompt

            - `2013`, Invalid input parameters, please check if the parameters
            are filled in as required

            - `2049`, Invalid API key


            For more information, please refer to the [Error Code
            Reference](/api-reference/errorcode).  
        status_msg:
          type: string
          description: Status details.
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >-
        `HTTP: Bearer Auth`

        - Security Scheme Type: http

        - HTTP Authorization Scheme: `Bearer API_key`, can be found in [Account
        Management>API
        Keys](https://platform.minimax.io/user-center/basic-information/interface-key).

````


> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Image-to-Video Task

> Use this API to create a video generation task from image, with optional text input.



## OpenAPI

````yaml api-reference/video/generation/api/image-to-video.json post /v1/video_generation
openapi: 3.1.0
info:
  title: MiniMax API
  description: MiniMax video generation and file management API
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.minimax.io
security:
  - bearerAuth: []
paths:
  /v1/video_generation:
    post:
      tags:
        - Video
      summary: Video Generation
      operationId: videoGeneration
      parameters:
        - name: Content-Type
          in: header
          required: true
          description: >-
            The media type of the request body. Must be set to
            `application/json` to ensure the data is sent in JSON format.
          schema:
            type: string
            enum:
              - application/json
            default: application/json
      requestBody:
        description: ''
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VideoGenerationReq'
        required: true
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VideoGenerationResp'
components:
  schemas:
    VideoGenerationReq:
      type: object
      required:
        - model
        - first_frame_image
      properties:
        model:
          type: string
          description: >-
            Model name. Supported values: `MiniMax-Hailuo-2.3`,
            `MiniMax-Hailuo-2.3-Fast`, `MiniMax-Hailuo-02`, `I2V-01-Director`,
            `I2V-01-live`, `I2V-01`.  
          enum:
            - MiniMax-Hailuo-2.3
            - MiniMax-Hailuo-2.3-Fast
            - MiniMax-Hailuo-02
            - I2V-01-Director
            - I2V-01-live
            - I2V-01
        first_frame_image:
          type: string
          description: "Specify an image as the starting frame of the video. Supports public URLs or Base64-encoded [Data URLs](https://developer.mozilla.org/en-US/Web/URI/Reference/Schemes/data) (`data:image/jpeg;base64,...`).  \n\n- Image requirements:\n\t- Formats: JPG, JPEG, PNG, WebP  \n\t- Size: Less than 20MB  \n\t- Dimensions: Short edge > 300px; aspect ratio between 2:5 and 5:2  "
        prompt:
          type: string
          description: "Text description of the video, up to 2000 characters. For `MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-2.3-Fast`, `MiniMax-Hailuo-02` and `I2V-01-Director` models, camera movement can be controlled using `[command]` syntax.\n- **Supported 15 camera commands**:\n\t- Truck: `[Truck left]`, `[Truck right]`\n\t- Pan: `[Pan left]`, `[Pan right]`\n\t- Push: `[Push in]`, `[Pull out]`\n\t- Pedestal: `[Pedestal up]`, `[Pedestal down]`\n\t- Tilt: `[Tilt up]`, `[Tilt down]`\n\t- Zoom: `[Zoom in]`, `[Zoom out]`\n\t- Shake: `[Shake]`\n\t- Follow: `[Tracking shot]`\n\t- Static: `[Static shot]`\n\r\n- **Usage rules**: \n  - *Combined movements*: Multiple commands inside one `[]` take effect simultaneously (e.g., `[Pan left,Pedestal up]`). Recommended max: 3. \n  - *Sequential movements*: Commands appear in order, e.g., `\"...[Push in], then...[Push out]\"`. \n  - *Natural language*: Free-form descriptions also work, but explicit commands yield more accurate results.  "
        prompt_optimizer:
          type: boolean
          description: >-
            Whether to automatically optimize the `prompt`. Defaults to `true`.
            Set to `false` for more precise control.
        fast_pretreatment:
          type: boolean
          description: >-
            Reduces optimization time when `prompt_optimizer` is enabled.
            Defaults to `false`. Applies only to `MiniMax-Hailuo-2.3`,
            `MiniMax-Hailuo-2.3-Fast` and `MiniMax-Hailuo-02`.
        duration:
          type: integer
          description: >-
            Video duration (seconds). Default is `6`. Supported values depend on
            the model and resolution:  


            | Model | 512P | 768P | 1080P |

            | :--- | :--- | :--- | :--- |

            | MiniMax-Hailuo-2.3 | - | `6` or `10` | `6` |

            | MiniMax-Hailuo-2.3-Fast | - | `6` or `10` | `6` |

            | MiniMax-Hailuo-02 | `6` or `10` | `6` or `10` | `6` |


            Notes: The default resolution for other models is 720p.
        resolution:
          type: string
          description: >-
            Video resolution. Options depend on model and duration:

            | Model | 6s | 10s |

            | :--- | :--- | :--- |

            | MiniMax-Hailuo-2.3 | `768P` (default), `1080P` | `768P` (default)
            |

            | MiniMax-Hailuo-2.3-Fast | `768P` (default), `1080P` | `768P`
            (default) |

            | MiniMax-Hailuo-02 | `512P`, `768P` (default), `1080P` | `512P`,
            `768P` (default) |

            | Other models | `720P` (default) | Not supported |
          enum:
            - 512P
            - 720P
            - 768P
            - 1080P
        callback_url:
          type: string
          description: "A callback URL to receive asynchronous task status updates.\n1. **Validation**: Once configured, MiniMax sends a `POST` request with a `challenge` field. Your server must echo this value within 3s to validate.\n2. **Updates**: After validation, MiniMax pushes status updates when the task changes. Response structure matches the [*Query Video Generation Task* API](/api-reference/video-generation-query).\n\n**Callback `status` values**:\n- `\"processing\"` – Task in progress\n- `\"success\"` – Task completed successfully\n- `\"failed\"` – Task failed\n\n```python\nfrom fastapi import FastAPI, HTTPException, Request\r\nimport json\r\n\r\napp = FastAPI()\r\n\r\n@app.post(\"/get_callback\")\r\nasync def get_callback(request: Request):\r\n    try:\r\n        json_data = await request.json()\r\n        challenge = json_data.get(\"challenge\")\r\n        if challenge is not None:\r\n            # Validation request, echo back challenge\r\n            return {\"challenge\": challenge}\r\n        else:\r\n            # Status update request, handle accordingly\r\n            # {\r\n            #     \"task_id\": \"115334141465231360\",\r\n            #     \"status\": \"success\",\r\n            #     \"file_id\": \"205258526306433\",\r\n            #     \"base_resp\": {\r\n            #         \"status_code\": 0,\r\n            #         \"status_msg\": \"success\"\r\n            #     }\r\n            # }\r\n            return {\"status\": \"success\"}\r\n    except Exception as e:\r\n        raise HTTPException(status_code=500, detail=str(e))\r\n\r\nif __name__ == \"__main__\":\r\n    import uvicorn\r\n    uvicorn.run(\r\n        app,  # Required\r\n        host=\"0.0.0.0\",  # Required\r\n        port=8000,  # Required, port can be customized\r\n        # ssl_keyfile=\"yourname.yourDomainName.com.key\",  # Optional, enable if using SSL\r\n        # ssl_certfile=\"yourname.yourDomainName.com.key\",  # Optional, enable if using SSL\r\n    )\n```"
      example:
        prompt: A mouse runs toward the camera, smiling and blinking.
        first_frame_image: >-
          https://cdn.hailuoai.com/prod/2024-09-18-16/user/multi_chat_file/9c0b5c14-ee88-4a5b-b503-4f626f018639.jpeg
        model: MiniMax-Hailuo-2.3
        duration: 6
        resolution: 1080P
    VideoGenerationResp:
      type: object
      properties:
        task_id:
          type: string
          description: The video generation task ID, used for querying status.
        base_resp:
          $ref: '#/components/schemas/BaseResp'
      example:
        task_id: '106916112212032'
        base_resp:
          status_code: 0
          status_msg: success
    BaseResp:
      type: object
      properties:
        status_code:
          type: integer
          description: >-
            The status codes and their meanings are as follows:

            - `0`, Request successful

            - `1002`, Rate limit triggered, please try again later

            - `1004`, Account authentication failed, please check if the API Key
            is correct

            - `1008`, Insufficient account balance

            - `1026`, Sensitive content detected in prompt

            - `2013`, Invalid input parameters, please check if the parameters
            are filled in as required

            - `2049`, Invalid API key


            For more information, please refer to the [Error Code
            Reference](/api-reference/errorcode).  
        status_msg:
          type: string
          description: Status details.
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >-
        `HTTP: Bearer Auth`

        - Security Scheme Type: http

        - HTTP Authorization Scheme: `Bearer API_key`, can be found in [Account
        Management>API
        Keys](https://platform.minimax.io/user-center/basic-information/interface-key).

````

> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Create First & Last Frame Video Generation Task

> Use this API to create a video generation task from start and end frame images, with optional text input.



## OpenAPI

````yaml api-reference/video/generation/api/start-end-to-video.json post /v1/video_generation
openapi: 3.1.0
info:
  title: MiniMax API
  description: MiniMax video generation and file management API
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.minimax.io
security:
  - bearerAuth: []
paths:
  /v1/video_generation:
    post:
      tags:
        - Video
      summary: Video Generation
      operationId: videoGeneration
      parameters:
        - name: Content-Type
          in: header
          required: true
          description: >-
            The media type of the request body. Must be set to
            `application/json` to ensure the data is sent in JSON format.
          schema:
            type: string
            enum:
              - application/json
            default: application/json
      requestBody:
        description: ''
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VideoGenerationReq'
        required: true
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VideoGenerationResp'
components:
  schemas:
    VideoGenerationReq:
      type: object
      required:
        - model
        - last_frame_image
      properties:
        model:
          type: string
          description: >-
            Model name. Supported values: `MiniMax-Hailuo-02`.


            Note: First & last frame generation does not support 512P
            resolution.
          enum:
            - MiniMax-Hailuo-02
        prompt:
          type: string
          description: "Text description of the video, up to 2000 characters.\nFor `MiniMax-Hailuo-02`, you can use `[commands]` syntax for camera movement control.\nCamera movement commands can be embedded in `prompt` using the `[command]` format for precise control.  \n- **Supported 15 camera commands**:\n\t- Truck: `[Truck left]`, `[Truck right]`\n\t- Pan: `[Pan left]`, `[Pan right]`\n\t- Push: `[Push in]`, `[Pull out]`\n\t- Pedestal: `[Pedestal up]`, `[Pedestal down]`\n\t- Tilt: `[Tilt up]`, `[Tilt down]`\n\t- Zoom: `[Zoom in]`, `[Zoom out]`\n\t- Shake: `[Shake]`\n\t- Follow: `[Tracking shot]`\n\t- Static: `[Static shot]`\n\r\n- **Usage rules**: \n  - *Combined movements*: Multiple commands inside one `[]` take effect simultaneously (e.g., `[Pan left,Pedestal up]`). Recommended max: 3. \n  - *Sequential movements*: Commands appear in order, e.g., `\"...[Push in], then...[Push out]\"`. \n  - *Natural language*: Free-form descriptions also work, but explicit commands yield more accurate results. "
        first_frame_image:
          type: string
          description: "Image to be used as the **first frame** of the video. Supports public URLs or Base64-encoded [Data URLs](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data) (`data:image/jpeg;base64,...`).\n\n- Image requirements:\n\t- Formats: JPG, JPEG, PNG, WebP\n\t- Size: < 20MB\n\t- Dimensions: Short side > 300px; Aspect ratio between 2:5 and 5:2\n\n⚠️ Video resolution follows the first frame image"
        last_frame_image:
          type: string
          description: "Image to be used as the **last frame** of the video. Supports public URLs or Base64-encoded [Data URLs](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data) (`data:image/jpeg;base64,...`).\n\n- Image requirements:\n\t- Formats: JPG, JPEG, PNG, WebP\n\t- Size: < 20MB\n\t- Dimensions: Short side > 300px; Aspect ratio between 2:5 and 5:2\n\n⚠️ Video resolution is determined by the first frame. If first and last frames differ in size, the last frame will be cropped to match the first"
        prompt_optimizer:
          type: boolean
          description: >-
            Whether to automatically optimize the `prompt`. Defaults to `true`.
            Set to `false` for more precise control.
        duration:
          type: integer
          description: >-
            Video duration (in seconds). Default: `6`. Available values for
            first & last frame generation depend on resolution:


            | Model | 768P | 1080P |

            | :--- | :--- | :--- |

            | MiniMax-Hailuo-02 | `6` or `10` | `6` |
        resolution:
          type: string
          description: >-
            Video resolution. First & last frame generation supports 768P and
            1080P:


            | Model | 6s | 10s |

            | :--- | :--- | :--- |

            | MiniMax-Hailuo-02 | `768P` (default), `1080P` | `768P` |
          enum:
            - 768P
            - 1080P
        callback_url:
          type: string
          description: "A callback URL to receive asynchronous task status updates.\n1. **Validation**: Once configured, MiniMax sends a `POST` request with a `challenge` field. Your server must echo this value within 3s to validate.\n2. **Updates**: After validation, MiniMax pushes status updates when the task changes. Response structure matches the [*Query Video Generation Task* API](/api-reference/video-generation-query).  \n\n**Callback `status` values**:\n- `\"processing\"` – Task in progress\n- `\"success\"` – Task completed successfully\n- `\"failed\"` – Task failed\n\n```python\nfrom fastapi import FastAPI, HTTPException, Request\r\nimport json\r\n\r\napp = FastAPI()\r\n\r\n@app.post(\"/get_callback\")\r\nasync def get_callback(request: Request):\r\n    try:\r\n        json_data = await request.json()\r\n        challenge = json_data.get(\"challenge\")\r\n        if challenge is not None:\r\n            # Validation request, echo back challenge\r\n            return {\"challenge\": challenge}\r\n        else:\r\n            # Status update request, handle accordingly\r\n            # {\r\n            #     \"task_id\": \"115334141465231360\",\r\n            #     \"status\": \"success\",\r\n            #     \"file_id\": \"205258526306433\",\r\n            #     \"base_resp\": {\r\n            #         \"status_code\": 0,\r\n            #         \"status_msg\": \"success\"\r\n            #     }\r\n            # }\r\n            return {\"status\": \"success\"}\r\n    except Exception as e:\r\n        raise HTTPException(status_code=500, detail=str(e))\r\n\r\nif __name__ == \"__main__\":\r\n    import uvicorn\r\n    uvicorn.run(\r\n        app,  # Required\r\n        host=\"0.0.0.0\",  # Required\r\n        port=8000,  # Required, port can be customized\r\n        # ssl_keyfile=\"yourname.yourDomainName.com.key\",  # Optional, enable if using SSL\r\n        # ssl_certfile=\"yourname.yourDomainName.com.key\",  # Optional, enable if using SSL\r\n    )\n```"
      example:
        prompt: A little girl grow up.
        first_frame_image: >-
          https://filecdn.minimax.chat/public/fe9d04da-f60e-444d-a2e0-18ae743add33.jpeg
        last_frame_image: >-
          https://filecdn.minimax.chat/public/97b7cd08-764e-4b8b-a7bf-87a0bd898575.jpeg
        model: MiniMax-Hailuo-02
        duration: 6
        resolution: 1080P
    VideoGenerationResp:
      type: object
      properties:
        task_id:
          type: string
          description: The video generation task ID, used for querying status.
        base_resp:
          $ref: '#/components/schemas/BaseResp'
      example:
        task_id: '106916112212032'
        base_resp:
          status_code: 0
          status_msg: success
    BaseResp:
      type: object
      properties:
        status_code:
          type: integer
          description: >-
            The status codes and their meanings are as follows:

            - `0`, Request successful

            - `1002`, Rate limit triggered, please try again later

            - `1004`, Account authentication failed, please check if the API Key
            is correct

            - `1008`, Insufficient account balance

            - `1026`, Sensitive content detected in prompt

            - `2013`, Invalid input parameters, please check if the parameters
            are filled in as required

            - `2049`, Invalid API key


            For more information, please refer to the [Error Code
            Reference](/api-reference/errorcode).  
        status_msg:
          type: string
          description: Status details.
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >-
        `HTTP: Bearer Auth`

        - Security Scheme Type: http

        - HTTP Authorization Scheme: `Bearer API_key`, can be found in [Account
        Management>API
        Keys](https://platform.minimax.io/user-center/basic-information/interface-key).

````

> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Subject-Reference to Video Generation Task



## OpenAPI

````yaml api-reference/video/generation/api/subject-reference-to-video.json post /v1/video_generation
openapi: 3.1.0
info:
  title: MiniMax API
  description: MiniMax video generation and file management API
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.minimax.io
security:
  - bearerAuth: []
paths:
  /v1/video_generation:
    post:
      tags:
        - Video
      summary: Video Generation
      operationId: videoGeneration
      parameters:
        - name: Content-Type
          in: header
          required: true
          description: >-
            The media type of the request body. Must be set to
            `application/json` to ensure the data is sent in JSON format.
          schema:
            type: string
            enum:
              - application/json
            default: application/json
      requestBody:
        description: ''
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VideoGenerationReq'
        required: true
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VideoGenerationResp'
components:
  schemas:
    VideoGenerationReq:
      type: object
      required:
        - model
        - subject_reference
      properties:
        model:
          type: string
          description: 'Model name. Supported values: `S2V-01`.  '
          enum:
            - S2V-01
        prompt:
          type: string
          description: Text description of the video, up to 2000 characters.
        prompt_optimizer:
          type: boolean
          description: >-
            Whether to automatically optimize the `prompt`. Defaults to `true`.
            Set to `false` for more precise control.
        subject_reference:
          type: array
          items:
            $ref: '#/components/schemas/SubjectReference'
          description: Subject reference images
        callback_url:
          type: string
          description: "A callback URL to receive asynchronous task status updates.\n1. **Validation**: Once configured, MiniMax sends a `POST` request with a `challenge` field. Your server must echo this value within 3s to validate.\n2. **Updates**: After validation, MiniMax pushes status updates when the task changes. Response structure matches the [*Query Video Generation Task* API](/api-reference/video-generation-query).  \n\n**Callback `status` values**:\n- `\"processing\"` – Task in progress\n- `\"success\"` – Task completed successfully\n- `\"failed\"` – Task failed\n\n```python\nfrom fastapi import FastAPI, HTTPException, Request\r\nimport json\r\n\r\napp = FastAPI()\r\n\r\n@app.post(\"/get_callback\")\r\nasync def get_callback(request: Request):\r\n    try:\r\n        json_data = await request.json()\r\n        challenge = json_data.get(\"challenge\")\r\n        if challenge is not None:\r\n            # Validation request, echo back challenge\r\n            return {\"challenge\": challenge}\r\n        else:\r\n            # Status update request, handle accordingly\r\n            # {\r\n            #     \"task_id\": \"115334141465231360\",\r\n            #     \"status\": \"success\",\r\n            #     \"file_id\": \"205258526306433\",\r\n            #     \"base_resp\": {\r\n            #         \"status_code\": 0,\r\n            #         \"status_msg\": \"success\"\r\n            #     }\r\n            # }\r\n            return {\"status\": \"success\"}\r\n    except Exception as e:\r\n        raise HTTPException(status_code=500, detail=str(e))\r\n\r\nif __name__ == \"__main__\":\r\n    import uvicorn\r\n    uvicorn.run(\r\n        app,  # Required\r\n        host=\"0.0.0.0\",  # Required\r\n        port=8000,  # Required, port can be customized\r\n        # ssl_keyfile=\"yourname.yourDomainName.com.key\",  # Optional, enable if using SSL\r\n        # ssl_certfile=\"yourname.yourDomainName.com.key\",  # Optional, enable if using SSL\r\n    )\n```"
      example:
        prompt: A girl runs toward the camera and winks with a smile.
        subject_reference:
          - type: character
            image:
              - >-
                https://cdn.hailuoai.com/prod/2025-08-12-17/video_cover/1754990600020238321-411603868533342214-cover.jpg
        model: S2V-01
    VideoGenerationResp:
      type: object
      properties:
        task_id:
          type: string
          description: The video generation task ID, used for querying status.
        base_resp:
          $ref: '#/components/schemas/BaseResp'
      example:
        task_id: '106916112212032'
        base_resp:
          status_code: 0
          status_msg: success
    SubjectReference:
      type: object
      required:
        - type
        - image
      properties:
        type:
          type: string
          description: Subject type, currently only `character` (face of a person).
        image:
          type: array
          items:
            type: string
          description: "Array containing the reference image (only one image supported).  \n- Requirements:  \n\t- Formats: JPG, JPEG, PNG, WebP.  \n\t- File size: < 20MB.  \n\t- Resolution: shorter side > 300px; aspect ratio between 2:5 and 5:2.  "
    BaseResp:
      type: object
      properties:
        status_code:
          type: integer
          description: >-
            The status codes and their meanings are as follows:

            - `0`, Request successful

            - `1002`, Rate limit triggered, please try again later

            - `1004`, Account authentication failed, please check if the API Key
            is correct

            - `1008`, Insufficient account balance

            - `1026`, Sensitive content detected in prompt

            - `2013`, Invalid input parameters, please check if the parameters
            are filled in as required

            - `2049`, Invalid API key


            For more information, please refer to the [Error Code
            Reference](/api-reference/errorcode).  
        status_msg:
          type: string
          description: Status details.
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >-
        `HTTP: Bearer Auth`

        - Security Scheme Type: http

        - HTTP Authorization Scheme: `Bearer API_key`, can be found in [Account
        Management>API
        Keys](https://platform.minimax.io/user-center/basic-information/interface-key).

````

> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Query Video Generation Task Status



## OpenAPI

````yaml api-reference/video/generation/api/openapi.json get /v1/query/video_generation
openapi: 3.1.0
info:
  title: MiniMax API
  description: MiniMax video generation and file management API
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.minimax.io
security:
  - bearerAuth: []
paths:
  /v1/query/video_generation:
    get:
      tags:
        - Video
      summary: Query Video Generation Task
      operationId: queryVideoGenerationTask
      parameters:
        - name: task_id
          in: query
          required: true
          description: >-
            The task ID to query. Only tasks created under the current account
            can be queried.
          schema:
            type: string
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/QueryVideoGenerationTaskResp'
components:
  schemas:
    QueryVideoGenerationTaskResp:
      type: object
      properties:
        task_id:
          type: string
          description: The queried task ID.
        status:
          $ref: '#/components/schemas/VideoProcessStatus'
        file_id:
          type: string
          description: >-
            Returned when the task succeeds. Represents the file ID of the
            generated video.
        video_width:
          type: integer
          description: >-
            Returned when the task succeeds. The width of the generated video
            (in pixels).
        video_height:
          type: integer
          description: >-
            Returned when the task succeeds. The height of the generated video
            (in pixels).
        base_resp:
          $ref: '#/components/schemas/QueryVideoGenerationTaskBaseResp'
      example:
        task_id: '176843862716480'
        status: Success
        file_id: '176844028768320'
        video_width: 1920
        video_height: 1080
        base_resp:
          status_code: 0
          status_msg: success
    VideoProcessStatus:
      type: string
      enum:
        - Preparing
        - Queueing
        - Processing
        - Success
        - Fail
      description: |-
        The current status of the task. Possible values:
        - `Preparing` – Preparing
        - `Queueing` – In queue
        - `Processing` – Generating
        - `Success` – Completed successfully
        - `Fail` – Failed
    QueryVideoGenerationTaskBaseResp:
      type: object
      properties:
        status_code:
          type: integer
          description: |-
            The status codes are as follows:
            - `0`, Request successful;
            - `1002`,  Rate limit triggered, retry later
            - `1004`, Authentication failed, check API Key
            - `1026`, Contains sensitive content in the input
            - `1027`, Contains sensitive content in the generated video

             For more information, please refer to the [Error Code Reference](/api-reference/errorcode).
        status_msg:
          type: string
          description: Status message. Returns `success` when successful.
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >-
        `HTTP: Bearer Auth`

        - Security Scheme Type: http

        - HTTP Authorization Scheme: `Bearer API_key`, can be found in [Account
        Management>API
        Keys](https://platform.minimax.io/user-center/basic-information/interface-key).

````

> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Video Download

> Use this API to download generated videos.



## OpenAPI

````yaml api-reference/video/generation/api/openapi.json get /v1/files/retrieve
openapi: 3.1.0
info:
  title: MiniMax API
  description: MiniMax video generation and file management API
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.minimax.io
security:
  - bearerAuth: []
paths:
  /v1/files/retrieve:
    get:
      tags:
        - Files
      summary: Retrieve File
      operationId: retrieveFile
      parameters:
        - name: file_id
          in: query
          required: true
          description: >-
            The unique identifier for the file.

            Supports `file_id` obtained from video generation and asynchronous
            speech synthesis tasks.
          schema:
            type: integer
            format: int64
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/RetrieveFileResp'
components:
  schemas:
    RetrieveFileResp:
      type: object
      properties:
        file:
          $ref: '#/components/schemas/FileObject'
        base_resp:
          $ref: '#/components/schemas/RetrieveFileBaseResp'
      example:
        file:
          file_id: ${file_id}
          bytes: 0
          created_at: 1700469398
          filename: output_aigc.mp4
          purpose: video_generation
          download_url: www.downloadurl.com
        base_resp:
          status_code: 0
          status_msg: success
    FileObject:
      type: object
      properties:
        file_id:
          type: integer
          format: int64
          description: The unique identifier for the file.
        bytes:
          type: integer
          format: int64
          description: The size of the file in bytes.
        created_at:
          type: integer
          format: int64
          description: The Unix timestamp (in seconds) when the file was created.
        filename:
          type: string
          description: The name of the file.
        purpose:
          type: string
          description: The purpose of the file.
        download_url:
          type: string
          format: url
          description: The URL address for downloading the file, valid for 1 hour.
    RetrieveFileBaseResp:
      type: object
      properties:
        status_code:
          type: integer
          description: |-
            The status codes are as follows:
            - 1000, Unknown error;
            - 1001, Timeout;
            - 1002, RPM limit triggered;
            - 1004, Authentication failed;
            - 1008, Insufficient balance;
            - 1013, Internal service error;
            - 1026, Input content error;
            - 1027, Output content error;
            - 1039, TPM limit triggered;
            - 2013, Abnormal input format.

             For more information, please refer to the [Error Code Reference](/api-reference/errorcode).
        status_msg:
          type: string
          description: Status details.
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >-
        `HTTP: Bearer Auth`

        - Security Scheme Type: http

        - HTTP Authorization Scheme: `Bearer API_key`, can be found in [Account
        Management>API
        Keys](https://platform.minimax.io/user-center/basic-information/interface-key).

````