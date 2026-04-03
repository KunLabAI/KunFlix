数分钟内完成你的首次 API 调用。

<columns>
<columnsItem zoneid="yYwBlMOVs1">


<card mode="container" href="https://www.volcengine.com/docs/82379/2272060" >

**快速入门(新手版)** 
专为零基础用户设计的快速入门

</card>




</columnsItem>
<columnsItem zoneid="ztHVepV3uP">


<card mode="container" href="https://console.volcengine.com/ark/region:ark+cn-beijing/experience" >

**体验中心**
“0”代码，交互式体验模型能力

</card>




</columnsItem>
<columnsItem zoneid="GuKcRXv7YX">


<card mode="container" href="https://www.volcengine.com/docs/82379/1928261" >

**Coding Plan**
兼容主流 AI 编码工具，助力高效编码开发

</card>




</columnsItem>
</columns>

<span id="da0e9d90"></span>
# 1 获取并配置 API Key

1. 获取 API Key：访问[API Key 管理](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) ，创建你的 API Key。
2. 配置环境变量：在终端中运行下面命令（替换`your_api_key_here` 为你的方舟API Key），配置 API Key 到环境变量。
> 配置持久化环境变量方法参见 [环境变量配置指南](/docs/82379/1820161)。


```mixin-react
return (<Tabs>
<Tabs.TabPane title="MacOS" key="jKB2Z5Uv9I"><RenderMd content={`\`\`\`Bash
export ARK_API_KEY="your_api_key_here"
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Linux" key="jaHSIUv1CP"><RenderMd content={`\`\`\`Bash
export ARK_API_KEY="your_api_key_here"
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Windows_CMD" key="QaotrMwBYV"><RenderMd content={`\`\`\`Bash
setx ARK_API_KEY "your_api_key_here"
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Windows_PowerShell" key="iwjs9oDt8B"><RenderMd content={`\`\`\`PowerShell
$env:ARK_API_KEY = "your_api_key_here"
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```


<span id="1008bfdb"></span>
# 2 开通模型服务
访问 [开通管理页面](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement) 开通模型服务。
<span id="b30fecf4"></span>
# 3 安装 SDK
安装官方或三方 SDK。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="Python" key="hB5KjbMxpL"><RenderMd content={`> 运行环境中需安装 [Python](https://www.python.org/downloads/) 版本 3.7 或以上。

* 安装方舟 SDK：
   \`\`\`Bash
   pip install 'volcengine-python-sdk[ark]'
   \`\`\`
   
* 安装 OpenAI SDK：
   \`\`\`Bash
   pip install openai
   \`\`\`
   
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go" key="QJHMnneke7"><RenderMd content={`> 环境中安装 [Go](https://golang.google.cn/doc/install) 版本 1.18 或以上。

在代码中通过下方方法引入 Go SDK
\`\`\`Go
import (
  "github.com/volcengine/volcengine-go-sdk"
)
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java" key="i9ImXRL8dJ"><RenderMd content={`> 环境中安装 [Java](https://www.java.com/en/download/help/index_installing.html) 版本 1.8 或以上。

在项目的\`pom.xml\`文件中添加以下依赖配置。
\`\`\`XML
<dependency>
  <groupId>com.volcengine</groupId>
  <artifactId>volcengine-java-sdk-ark-runtime</artifactId>
  <version>LATEST</version>
</dependency>
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="f97e77a7"></span>
# 4 发起 API 请求
以下按输入输出类别列举的典型任务，选择任意示例代码体验如何通过 API 调用及体验大模型及方舟平台能力。
<span id="b25b812a"></span>
## 文本生成
传入文本类信息给模型，进行问答、分析、改写、摘要、编程、翻译等任务，并返回文本结果。

<span aceTableMode="list" aceTableWidth="4,4"></span>
|输入 |输出预览 |
|---|---|
|Hello |* 思考：Got it, let's see. The user said "hello". I need to respond in a friendly and welcoming way. Since the system prompt mentions a professional but friendly tone, I should keep it natural. Maybe something like "Hello! How can I assist you today?" That's simple, polite, and open\-ended to encourage the user to share what they need help with.|\
| |* 回答：Hello! How can I assist you today? Whether you have a question, need help with something specific, or just want to chat, feel free to let me know. 😊 |


```mixin-react
return (<Tabs>
<Tabs.TabPane title="Python" key="hTKqBzvt1w"><RenderMd content={`\`\`\`Python
import os
from volcenginesdkarkruntime import Ark

client = Ark(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=os.getenv('ARK_API_KEY'),
)

response = client.responses.create(
    model="doubao-seed-2-0-lite-260215",
    input="hello", # Replace with your prompt
    # thinking={"type": "disabled"}, #  Manually disable deep thinking
)
print(response)
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Curl" key="XWzKCOwadg"><RenderMd content={`\`\`\`Bash
curl https://ark.cn-beijing.volces.com/api/v3/responses \\
  -H "Authorization: Bearer $ARK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
      "model": "doubao-seed-2-0-lite-260215",
      "input": "hello"
  }'
\`\`\`


* 关闭深度思考：配置 \`"thinking":{"type": "disabled"}\`。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go" key="qBbpTiAsc3"><RenderMd content={`\`\`\`Go
package main

import (
    "context"
    "fmt"
    "os"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model/responses"
)

func main() {
    client := arkruntime.NewClientWithApiKey(
        // Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
        os.Getenv("ARK_API_KEY"),
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
    )
    ctx := context.Background()

    resp, err := client.CreateResponses(ctx, &responses.ResponsesRequest{
        Model: "doubao-seed-2-0-lite-260215",
        Input: &responses.ResponsesInput{Union: &responses.ResponsesInput_StringValue{StringValue: "hello"}}, // Replace with your prompt
        // Thinking: &responses.ResponsesThinking{Type: responses.ThinkingType_disabled.Enum()}, // Manually disable deep thinking
    })
    if err != nil {
        fmt.Printf("response error: %v\\n", err)
        return
    }
    fmt.Println(resp)
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java" key="uaScGs0GuJ"><RenderMd content={`\`\`\`Java
package com.ark.sample;

import com.volcengine.ark.runtime.service.ArkService;
import com.volcengine.ark.runtime.model.responses.request.*;
import com.volcengine.ark.runtime.model.responses.response.ResponseObject;

public class demo {
    public static void main(String[] args) {
        String apiKey = System.getenv("ARK_API_KEY");
        // The base URL for model invocation
        ArkService arkService = ArkService.builder().apiKey(apiKey).baseUrl("https://ark.cn-beijing.volces.com/api/v3").build();

        CreateResponsesRequest request = CreateResponsesRequest.builder()
                .model("doubao-seed-2-0-lite-260215")
                .input(ResponsesInput.builder().stringValue("hello").build()) // Replace with your prompt
                // .thinking(ResponsesThinking.builder().type(ResponsesConstants.THINKING_TYPE_DISABLED).build()) //  Manually disable deep thinking
                .build();

        ResponseObject resp = arkService.createResponse(request);
        System.out.println(resp);

        arkService.shutdownExecutor();
    }
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="OpenAI SDK" key="nTVGYVY9kv"><RenderMd content={`\`\`\`Python
import os
from openai import OpenAI

client = OpenAI(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=os.getenv('ARK_API_KEY'),
)

response = client.responses.create(
    model="doubao-seed-2-0-lite-260215",
    input="hello", # Replace with your prompt
    extra_body={
        # "thinking": {"type": "disabled"}, #  Manually disable deep thinking
    },
)

print(response)
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```


* [文本生成](/docs/82379/1399009)：文本生成使用指南。
* [深度思考](/docs/82379/1956279)：深度思考能力使用指南。
* [迁移至 Responses API](/docs/82379/1585128)：新用户推荐，更简洁的上下文管理能力、强大的工具调用能力。
* [Chat API](https://www.volcengine.com/docs/82379/1494384)：存量业务迭代推荐，广泛使用的 API。

<span id="efbfe823"></span>
## 多模态理解
传入图片、视频、PDF文件给模型，进行分析、内容审核、问答、视觉定位等基于多模态理解相关任务，并返回文本结果。

<span aceTableMode="list" aceTableWidth="4,4"></span>
|输入 |输出预览 |
|---|---|
|<span>![图片](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/a31c2edfbe844461a43f5e8f74fbcce4~tplv-goo7wpa0wc-image.image =275x) </span>|* 思考：用户现在需要找支持输入图片的模型系列，看表格里的输入列中的图像列，哪个模型对应的图像输入是√。看表格，Doubao\-1.5\-vision那一行的输入图像列是√，其他两个Doubao\-1.5\-pro和lite的输入图像都是×，所以答案是Doubao\-1.5\-vision。|\
|> 支持输入图片的模型系列是哪个？ |* 回答：支持输入图片的模型系列是Doubao\-1.5\-vision |


```mixin-react
return (<Tabs>
<Tabs.TabPane title="Python" key="Xbz51XeC28"><RenderMd content={`\`\`\`Python
import os
from volcenginesdkarkruntime import Ark

client = Ark(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=os.getenv('ARK_API_KEY'),
)

response = client.responses.create(
    model="doubao-seed-2-0-lite-260215",
    input=[
        {
            "role": "user",
            "content": [
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"
                },
                {
                    "type": "input_text",
                    "text": "支持输入图片的模型系列是哪个？"
                },
            ],
        }
    ]
)

print(response)
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Curl" key="cGe83NpoRv"><RenderMd content={`\`\`\`Bash
curl https://ark.cn-beijing.volces.com/api/v3/responses \\
-H "Authorization: Bearer $ARK_API_KEY" \\
-H 'Content-Type: application/json' \\
-d '{
    "model": "doubao-seed-2-0-lite-260215",
    "input": [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"
                },
                {
                    "type": "input_text",
                    "text": "支持输入图片的模型系列是哪个？"
                }
            ]
        }
    ]
}'
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go" key="E1Nbc6AMyl"><RenderMd content={`\`\`\`Go
package main

import (
    "context"
    "fmt"
    "os"    
    "github.com/samber/lo"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model/responses"
)

func main() {
    client := arkruntime.NewClientWithApiKey(
        // Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
        os.Getenv("ARK_API_KEY"),
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
    )
    ctx := context.Background()

    inputMessage := &responses.ItemInputMessage{
        Role: responses.MessageRole_user,
        Content: []*responses.ContentItem{
            {
                Union: &responses.ContentItem_Image{
                    Image: &responses.ContentItemImage{
                        Type:     responses.ContentItemType_input_image,
                        ImageUrl: lo.ToPtr("https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"),
                    },
                },
            },
            {
                Union: &responses.ContentItem_Text{
                    Text: &responses.ContentItemText{
                        Type: responses.ContentItemType_input_text,
                        Text: "支持输入图片的模型系列是哪个？",
                    },
                },
            },
        },
    }

    resp, err := client.CreateResponses(ctx, &responses.ResponsesRequest{
        Model: "doubao-seed-2-0-lite-260215",
        Input: &responses.ResponsesInput{
            Union: &responses.ResponsesInput_ListValue{
                ListValue: &responses.InputItemList{ListValue: []*responses.InputItem{{
                    Union: &responses.InputItem_InputMessage{
                        InputMessage: inputMessage,
                    },
                }}},
            },
        },
    })
    if err != nil {
        fmt.Printf("response error: %v\\n", err)
        return
    }
    fmt.Println(resp)
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java" key="FfxbbkFitZ"><RenderMd content={`\`\`\`Java
package com.ark.sample;

import com.volcengine.ark.runtime.service.ArkService;
import com.volcengine.ark.runtime.model.responses.request.*;
import com.volcengine.ark.runtime.model.responses.content.*;
import com.volcengine.ark.runtime.model.responses.item.*;
import com.volcengine.ark.runtime.model.responses.response.ResponseObject;
import com.volcengine.ark.runtime.model.responses.constant.ResponsesConstants;

public class demo {
  public static void main(String[] args) {
    String apiKey = System.getenv("ARK_API_KEY");
    ArkService arkService = ArkService.builder().apiKey(apiKey).baseUrl("https://ark.cn-beijing.volces.com/api/v3")
        .build();

    CreateResponsesRequest request = CreateResponsesRequest.builder()
        .model("doubao-seed-2-0-lite-260215")
        .input(ResponsesInput.builder().addListItem(
            ItemEasyMessage.builder().role(ResponsesConstants.MESSAGE_ROLE_USER).content(
                MessageContent.builder()
                    .addListItem(InputContentItemImage.builder()
                        .imageUrl("https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png").build())
                    .addListItem(InputContentItemText.builder().text("支持输入图片的模型系列是哪个？").build())
                    .build())
                .build())
            .build())
        .build();
    ResponseObject resp = arkService.createResponse(request);
    System.out.println(resp);

    arkService.shutdownExecutor();
  }
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="OpenAI SDK" key="HbmPUDWyjH"><RenderMd content={`\`\`\`Python
import os
from openai import OpenAI

client = OpenAI(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=os.getenv('ARK_API_KEY'),
)

response = client.responses.create(
    model="doubao-seed-2-0-lite-260215",
    input=[
        {
            "role": "user",
            "content": [
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"
                },
                {
                    "type": "input_text",
                    "text": "支持输入图片的模型系列是哪个？"
                },
            ],
        }
    ]
)

print(response)
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```


* [多模态理解](/docs/82379/1958521)：多模态理解详细使用指南。
* [视觉定位 Grounding](/docs/82379/1616136)：图片中找到对应目标并返回坐标任务。
* [GUI 任务处理](/docs/82379/1584296)：在计算机/移动设备中完成自动化任务。
* [文件输入(File API)](/docs/82379/1885708)：传入图片、视频、文档接口。

<span id="d481ca5b"></span>
## 图片生成
传入图片、文字给模型，进行以下场景&任务：

* 广告、海报、组图等图片生成；
* 增改元素、颜色更换等图片编辑；
* 油墨、水墨等风格切换。


<span aceTableMode="list" aceTableWidth="4,4"></span>
|提示词 |输出预览 |
|---|---|
|充满活力的特写编辑肖像，模特眼神犀利，头戴雕塑感帽子，色彩拼接丰富，眼部焦点锐利，景深较浅，具有Vogue杂志封面的美学风格，采用中画幅拍摄，工作室灯光效果强烈。 |<span>![图片](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/00fb66006eb84b16965b620b6e1f2d78~tplv-goo7wpa0wc-image.image =275x) </span> |


```mixin-react
return (<Tabs>
<Tabs.TabPane title="Python" key="RvDKXPATgT"><RenderMd content={`\`\`\`Python
import os
# Install SDK:  pip install 'volcengine-python-sdk[ark]' 
from volcenginesdkarkruntime import Ark 

client = Ark(
    # The base URL for model invocation
    base_url="https://ark.cn-beijing.volces.com/api/v3", 
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.getenv('ARK_API_KEY'), 
)
 
imagesResponse = client.images.generate( 
    # Replace with Model ID
    model="doubao-seedream-5-0-260128",
    prompt="充满活力的特写编辑肖像，模特眼神犀利，头戴雕塑感帽子，色彩拼接丰富，眼部焦点锐利，景深较浅，具有Vogue杂志封面的美学风格，采用中画幅拍摄，工作室灯光效果强烈。",
    size="2K",
    response_format="url",
    watermark=False
) 
 
print(imagesResponse.data[0].url)
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Curl" key="RmuE5dOE6b"><RenderMd content={`\`\`\`Bash
curl https://ark.cn-beijing.volces.com/api/v3/images/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ARK_API_KEY" \\
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "充满活力的特写编辑肖像，模特眼神犀利，头戴雕塑感帽子，色彩拼接丰富，眼部焦点锐利，景深较浅，具有Vogue杂志封面的美学风格，采用中画幅拍摄，工作室灯光效果强烈。",
    "size": "2K",
    "watermark": false
}'
\`\`\`


* 您可按需替换 Model ID。Model ID 查询见 [模型列表](/docs/82379/1330310)。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java" key="gsQAbe5k8E"><RenderMd content={`\`\`\`Java
package com.ark.sample;

import com.volcengine.ark.runtime.model.images.generation.*;
import com.volcengine.ark.runtime.service.ArkService;
import okhttp3.ConnectionPool;
import okhttp3.Dispatcher;
import java.util.concurrent.TimeUnit;

public class ImageGenerationsExample { 
    public static void main(String[] args) {
        // Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
        String apiKey = System.getenv("ARK_API_KEY");
        ConnectionPool connectionPool = new ConnectionPool(5, 1, TimeUnit.SECONDS);
        Dispatcher dispatcher = new Dispatcher();
        ArkService service = ArkService.builder()
                .baseUrl("https://ark.cn-beijing.volces.com/api/v3") // The base URL for model invocation
                .dispatcher(dispatcher)
                .connectionPool(connectionPool)
                .apiKey(apiKey)
                .build();
                
        GenerateImagesRequest generateRequest = GenerateImagesRequest.builder()
                .model("doubao-seedream-5-0-260128") // Replace with Model ID
                .prompt("充满活力的特写编辑肖像，模特眼神犀利，头戴雕塑感帽子，色彩拼接丰富，眼部焦点锐利，景深较浅，具有Vogue杂志封面的美学风格，采用中画幅拍摄，工作室灯光效果强烈。")
                .size("2K")
                .sequentialImageGeneration("disabled")
                .responseFormat(ResponseFormat.Url)
                .stream(false)
                .watermark(false)
                .build();
        ImagesResponse imagesResponse = service.generateImages(generateRequest);
        System.out.println(imagesResponse.getData().get(0).getUrl());

        service.shutdownExecutor();
    }
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go" key="BsgTxPmN3m"><RenderMd content={`\`\`\`Go
package main

import (
    "context"
    "fmt"
    "os"
    "strings"    
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

func main() {
    client := arkruntime.NewClientWithApiKey(        
        os.Getenv("ARK_API_KEY"), // Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey        
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"), // The base URL for model invocation
    )    
    ctx := context.Background()

    generateReq := model.GenerateImagesRequest{
       Model:          "doubao-seedream-5-0-260128", // Replace with Model ID
       Prompt:         "充满活力的特写编辑肖像，模特眼神犀利，头戴雕塑感帽子，色彩拼接丰富，眼部焦点锐利，景深较浅，具有Vogue杂志封面的美学风格，采用中画幅拍摄，工作室灯光效果强烈。",
       Size:           volcengine.String("2K"),
       ResponseFormat: volcengine.String(model.GenerateImagesResponseFormatURL),
       Watermark:      volcengine.Bool(false),
    }

    imagesResponse, err := client.GenerateImages(ctx, generateReq)
    if err != nil {
       fmt.Printf("generate images error: %v\\n", err)
       return
    }

    fmt.Printf("%s\\n", *imagesResponse.Data[0].Url)
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="OpenAI" key="dLFbQinSMF"><RenderMd content={`\`\`\`Python
import os
from openai import OpenAI

client = OpenAI(     
    base_url="https://ark.cn-beijing.volces.com/api/v3", # The base URL for model invocation    
    api_key=os.getenv('ARK_API_KEY'),  # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
) 
 
imagesResponse = client.images.generate( 
    # Replace with Model ID
    model="doubao-seedream-5-0-260128",
    prompt="充满活力的特写编辑肖像，模特眼神犀利，头戴雕塑感帽子，色彩拼接丰富，眼部焦点锐利，景深较浅，具有Vogue杂志封面的美学风格，采用中画幅拍摄，工作室灯光效果强烈。",
    size="2K",
    response_format="url",
    extra_body={
        "watermark": False,
    },
) 
 
print(imagesResponse.data[0].url)
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```


* [Seedream 4.0-5.0 教程](/docs/82379/1824121)：主流生图模型能力以及如何通过 API 调用。
* [Seedream 4.0-4.5 提示词指南](/docs/82379/1829186)：使用生图模型时，如何编写提示词。

<span id="18692b80"></span>
## 视频生成
通过文本描述、图像素材、视频素材，快速生成高质量、风格多样的视频内容。

<span aceTableMode="list" aceTableWidth="4,4"></span>
|提示词 |输出画面预览 |
|---|---|
|一位身穿绿色亮片礼服的女性站在粉红色背景前，周围飘落着五彩斑斓的彩纸 |<span>![图片](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/aae3d0c636954bdd9e66e7a23e98c480~tplv-goo7wpa0wc-image.image =275x) </span> |


```mixin-react
return (<Tabs>
<Tabs.TabPane title="Python" key="HQcBpccTKp"><RenderMd content={`\`\`\`Python
import os
import time  
# Install SDK:  pip install 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark 

client = Ark(    
    base_url="https://ark.cn-beijing.volces.com/api/v3", # The base URL for model invocation    
    api_key=os.environ.get("ARK_API_KEY"), # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
)

if __name__ == "__main__":
    print("----- create request -----")
    create_result = client.content_generation.tasks.create(
        model="doubao-seedance-2-0-260128", # Replace with Model ID 
        content=[
            {
                # Combination of text prompt and parameters
                "type": "text",
                "text": "一位身穿绿色亮片礼服的女性站在粉红色背景前，周围飘落着五彩斑斓的彩纸 --wm true --dur 5"
            }
        ]
    )
    print(create_result)

    # Polling query section
    print("----- polling task status -----")
    task_id = create_result.id
    while True:
        get_result = client.content_generation.tasks.get(task_id=task_id)
        status = get_result.status
        if status == "succeeded":
            print("----- task succeeded -----")
            print(get_result)
            break
        elif status == "failed":
            print("----- task failed -----")
            print(f"Error: {get_result.error}")
            break
        else:
            print(f"Current status: {status}, Retrying after 3 seconds...")
            time.sleep(3)
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java" key="yf4coHVoxJ"><RenderMd content={`\`\`\`Java
package com.ark.sample;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import com.volcengine.ark.runtime.model.content.generation.*;
import com.volcengine.ark.runtime.model.content.generation.CreateContentGenerationTaskRequest.Content;
import com.volcengine.ark.runtime.service.ArkService;

public class ContentGenerationTaskExample {
  public static void main(String[] args) {
    String apiKey = System.getenv("ARK_API_KEY");
    ArkService service = ArkService.builder()
        .baseUrl("https://ark.cn-beijing.volces.com/api/v3") // The base URL for model invocation
        .apiKey(apiKey)
        .build();

    System.out.println("----- create request -----");
    List<Content> contents = new ArrayList<>();
    contents.add(Content.builder()
        .type("text")
        .text("一位身穿绿色亮片礼服的女性站在粉红色背景前，周围飘落着五彩斑斓的彩纸 --wm true --dur 5")
        .build());

    // Create a video generation task
    CreateContentGenerationTaskRequest createRequest = CreateContentGenerationTaskRequest.builder()
        .model("doubao-seedance-2-0-260128") // Replace with Model ID
        .content(contents)
        .build();

    CreateContentGenerationTaskResult createResult = service.createContentGenerationTask(createRequest);
    System.out.println(createResult);

    // Get the details of the task
    String taskId = createResult.getId();
    GetContentGenerationTaskRequest getRequest = GetContentGenerationTaskRequest.builder()
        .taskId(taskId)
        .build();

    System.out.println("----- polling task status -----");
    while (true) {
      try {
        GetContentGenerationTaskResponse getResponse = service.getContentGenerationTask(getRequest);
        String status = getResponse.getStatus();
        if ("succeeded".equalsIgnoreCase(status)) {
          System.out.println("----- task succeeded -----");
          System.out.println(getResponse);
          service.shutdownExecutor();
          break;
        } else if ("failed".equalsIgnoreCase(status)) {
          System.out.println("----- task failed -----");
          System.out.println("Error: " + getResponse.getStatus());
          service.shutdownExecutor();
          break;
        } else {
          System.out.printf("Current status: %s, Retrying in 3 seconds...\\n", status);
          TimeUnit.SECONDS.sleep(3);
        }
      } catch (InterruptedException ie) {
        Thread.currentThread().interrupt();
        System.err.println("Polling interrupted");
        service.shutdownExecutor();
        break;
      }
    }
  }
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go" key="DHfLFju6pA"><RenderMd content={`\`\`\`Go
package main

import (
    "context"
    "fmt"
    "os"
    "time"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

func main() {
    client := arkruntime.NewClientWithApiKey(        
        os.Getenv("ARK_API_KEY"), // Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey        
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"), // The base URL for model invocation
    )
    ctx := context.Background()
    // Replace with Model ID
    modelEp := "doubao-seedance-2-0-260128"

    fmt.Println("----- create request -----")
    createReq := model.CreateContentGenerationTaskRequest{
        Model: modelEp,
        Content: []*model.CreateContentGenerationContentItem{
            {
                Type: model.ContentGenerationContentItemTypeText,
                Text: volcengine.String("一位身穿绿色亮片礼服的女性站在粉红色背景前，周围飘落着五彩斑斓的彩纸 --wm true --dur 5"),
            },
        },
    }
    createResp, err := client.CreateContentGenerationTask(ctx, createReq)
    if err != nil {
        fmt.Printf("create content generation error: %v", err)
        return
    }
    taskID := createResp.ID
    fmt.Printf("Task Created with ID: %s", taskID)

    // Polling query section
    fmt.Println("----- polling task status -----")
    for {
        getReq := model.GetContentGenerationTaskRequest{ID: taskID}
        getResp, err := client.GetContentGenerationTask(ctx, getReq)
        if err != nil {
            fmt.Printf("get content generation task error: %v", err)
            return
        }

        status := getResp.Status
        if status == "succeeded" {
            fmt.Println("----- task succeeded -----")
            fmt.Printf("Task ID: %s \\n", getResp.ID)
            fmt.Printf("Model: %s \\n", getResp.Model)
            fmt.Printf("Video URL: %s \\n", getResp.Content.VideoURL)
            fmt.Printf("Completion Tokens: %d \\n", getResp.Usage.CompletionTokens)
            fmt.Printf("Created At: %d, Updated At: %d", getResp.CreatedAt, getResp.UpdatedAt)
            return
        } else if status == "failed" {
            fmt.Println("----- task failed -----")
            if getResp.Error != nil {
                fmt.Printf("Error Code: %s, Message: %s", getResp.Error.Code, getResp.Error.Message)
            }
            return
        } else {
            fmt.Printf("Current status: %s, Retrying in 3 seconds... \\n", status)
            time.Sleep(3 * time.Second)
        }
    }
}
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```


* [视频生成](/docs/82379/1366799)：学习如何使用模型的视频生成能力，包括文本生成视频、首尾帧生视频、首帧生成视频等。
* [Seedance-1.0-pro&pro-fast 提示词指南](/docs/82379/1631633)：使用生视频模型时，如何编写提示词。

<span id="086a3233"></span>
## 工具使用
通过工具/插件让模型具体读取外部数据及函数的能力，包括

* 内置工具：联网搜索、图片处理、知识库检索等已集成至方舟平台的工具。
* 三方工具：兼容MCP 的三方工具。
* 自定义工具：您自行定义及开发的工具。


<span aceTableMode="list" aceTableWidth="4,4"></span>
|输入 |输出预览 |
|---|---|
|What's the weather like in Beijing? |According to the latest weather data as of March 10, 2026, the current weather in Beijing is sunny with a gentle wind (less than level 3). The temperature around 11:30 AM is approximately 9°C, and it is expected to reach a high of 12°C during the day. The weather will remain clear at night with a low temperature of 1°C.|\
| |**Source**: Weather forecasts updated on March 10, 2026, from the Central Meteorological Observatory.|\
| |**Note: Data is accurate as of the latest available update at 05:30 AM on March 10.**  |


```mixin-react
return (<Tabs>
<Tabs.TabPane title="Python" key="Cldhum2k2M"><RenderMd content={`\`\`\`Python
import os
from volcenginesdkarkruntime import Ark

client = Ark(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=os.getenv("ARK_API_KEY"),
)

response = client.responses.create(
    model="doubao-seed-2-0-lite-260215",
    input=[{"role": "user", "content": "What's the weather like in Beijing?"}],
    tools=[
        {
            "type": "web_search",
            "max_keyword": 2,
        }
    ],
)

print(response)
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Curl" key="vyy2pmEicQ"><RenderMd content={`\`\`\`Bash
curl https://ark.cn-beijing.volces.com/api/v3/responses \\
-H "Authorization: Bearer $ARK_API_KEY" \\
-H 'Content-Type: application/json' \\
-d '{
    "model": "doubao-seed-2-0-lite-260215",
    "stream": true,
    "tools": [
        {
            "type": "web_search",
            "max_keyword": 3
        }
    ],
    "input": [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": "What is the weather like in Beijing?"
                }
            ]
        }
    ]
}'
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java" key="lvTZqbVrgZ"><RenderMd content={`\`\`\`Java
package com.ark.sample;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.volcengine.ark.runtime.model.responses.item.*;
import com.volcengine.ark.runtime.model.responses.request.*;
import com.volcengine.ark.runtime.model.responses.response.ResponseObject;
import com.volcengine.ark.runtime.model.responses.constant.ResponsesConstants;
import com.volcengine.ark.runtime.model.responses.content.InputContentItemText;
import com.volcengine.ark.runtime.model.responses.tool.*;
import com.volcengine.ark.runtime.service.ArkService;
import java.util.Arrays;
import java.util.List;

public class demo {
    public static ObjectMapper om = new ObjectMapper();

    public demo() throws JsonProcessingException {
    }

    public static List<ResponsesTool> buildTools() {
        ToolWebSearch t = ToolWebSearch.builder().build();
        System.out.println(Arrays.asList(t));
        return Arrays.asList(t);
    }

    public static void main(String[] args) throws JsonProcessingException {
        String apiKey = System.getenv("ARK_API_KEY");

        ArkService arkService = ArkService.builder().apiKey(apiKey).baseUrl("https://ark.cn-beijing.volces.com/api/v3").build();
        CreateResponsesRequest req = CreateResponsesRequest.builder()
                .model("doubao-seed-2-0-lite-260215")
                .input(ResponsesInput.builder().addListItem(
                        ItemEasyMessage.builder().role(ResponsesConstants.MESSAGE_ROLE_USER).content(
                                MessageContent.builder()
                                        .addListItem(InputContentItemText.builder().text("What's the weather like in Beijing?").build())
                                        .build()
                        ).build()
                ).build())
                .tools(buildTools())
                .build();
        ResponseObject resp = arkService.createResponse(req);
        System.out.println(resp);

        arkService.shutdownExecutor();
    }
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go" key="T7CzYwfQQI"><RenderMd content={`\`\`\`Go
package main
import (
  "context"
  "fmt"
  "os"
  "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
  "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model/responses"
)

func main() {
  client := arkruntime.NewClientWithApiKey(
    os.Getenv("ARK_API_KEY"),
    arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"), // The base URL for model invocation
  )
  ctx := context.Background()
  maxToolCalls := int64(1) // Limit the number of tool calls, adjust it according to your needs.
  
  inputMessage := &responses.ItemInputMessage{
    Role: responses.MessageRole_user,
    Content: []*responses.ContentItem{
      {
        Union: &responses.ContentItem_Text{
          Text: &responses.ContentItemText{
            Type: responses.ContentItemType_input_text,
            Text: "What's the weather like in Beijing?",
          },
        },
      },
    },
  }

  req := &responses.ResponsesRequest{
    Model: "doubao-seed-2-0-lite-260215",
    Input: &responses.ResponsesInput{
      Union: &responses.ResponsesInput_ListValue{
        ListValue: &responses.InputItemList{ListValue: []*responses.InputItem{{
          Union: &responses.InputItem_InputMessage{
            InputMessage: inputMessage,
          },
        }}}},
    },
    Tools: []*responses.ResponsesTool{
      {
        Union: &responses.ResponsesTool_ToolWebSearch{
          ToolWebSearch: &responses.ToolWebSearch{
            Type: responses.ToolType_web_search,
          },
        },
      },
    },
    MaxToolCalls: &maxToolCalls,
  }

  resp, err := client.CreateResponses(ctx, req)
  if err != nil {
    fmt.Printf("Error: %v\\n", err)
    os.Exit(1)
  }

  fmt.Printf("Response: %v\\n", resp)
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="OpenAI SDK" key="pKzLz4If7g"><RenderMd content={`\`\`\`Python
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=os.getenv("ARK_API_KEY"),
)

response = client.responses.create(
    model="doubao-seed-2-0-lite-260215",
    input=[{"role": "user", "content": "What's the weather like in Beijing?"}],
    tools=[
        {
            "type": "web_search",
            "max_keyword": 2,
        }
    ],
)

print(response)
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```


* [工具调用](/docs/82379/1958524)：学习如何让模型使用内置工具，如网页搜索、知识库检索、豆包助手等能力。
* [函数调用 Function Calling](/docs/82379/1262342)：学习如何让模型调用自定义的工具。
* [云部署 MCP / Remote MCP](/docs/82379/1827534)：学习如何让模型使用 MCP 服务。

<span id="ffac0939"></span>
# 5 下一步
现在你已经完成了首次方舟模型服务的 API 调用，你可以探索模型的更多能力，包括：

* [平台能力速览](/docs/82379/1108216)：探索方舟平台提供的提示词优化、权限管理、模型管理等高阶能力。
* [模型列表](/docs/82379/1330310)：快速浏览方舟提供的模型全集以及各个模型所具备的能力，快速根据你的实际场景匹配到合适的模型。



