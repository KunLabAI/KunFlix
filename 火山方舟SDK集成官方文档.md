方舟提供了 Python 、 Go 和 Java 的 SDK ，方便使用对应编程语言快速调用方舟的模型服务。
<span id="2708d57e"></span>
# Python SDK
<span id="f2baa8aa"></span>
## 前提条件
本地已经安装了Python ，且版本不低于 3.7。
> 可在终端中通过命令确认 Python 版本。如需安装，参考[Python安装教程](https://wiki.python.org/moin/BeginnersGuide/Download)，注意选择3.7及以上版本。

```Bash
python -V
```

<span id="bb014324"></span>
## 安装 Python SDK
在终端中执行命令安装 Python SDK。
```Bash
pip install 'volcengine-python-sdk[ark]'
```

:::tip
* 如本地安装错误，可尝试下面方法：
   * [Windows系统安装SDK失败，ERROR: Failed building wheel for volcengine-python-sdk](/docs/82379/1359411#b74e8ad6)
   * 尝试使用下面命令`pip install volcengine-python-sdk[ark]`
* 如需源码安装，可下载&解压对应版本 SDK 包，进入目录执行命令：`python setup.py install --user`。
:::
<span id="d6b883b8"></span>
## 升级 Python SDK
如需使用方舟提供的最新能力，请升级 SDK 至最新版本。
```Bash
pip install 'volcengine-python-sdk[ark]' -U
```

<span id="f116fb9f"></span>
# Go SDK
<span id="0fa8c2bc"></span>
## 前提条件
检查 Go 版本，需 1.18 或以上。
```Bash
go version
```

如未安装或版本不满足，可访问 [Go 语言官方网站](https://golang.google.cn/dl/)下载并安装，请选择 1.18 或以上版本。
<span id="ae8b42ab"></span>
## 安装 Go SDK

1. Go SDK 使用 go mod 管理，可运行以下命令初始化 go mod。`<your-project-name>` 替换为项目名称。

```Bash
# 如在文件夹 ark-demo 下打开终端窗口，运行命令go mod init ark-demo
go mod init <your-project-name>
```


2. 在本地初始化 go mod 后，运行以下命令安装最新版 SDK。

```Bash
go get -u github.com/volcengine/volcengine-go-sdk 
```

:::tip
如需安装特定版本的SDK，可使用命令：
`go get -u github.com/volcengine/volcengine-go-sdk@<VERSION>`
其中`<VERSION>`替换为版本号。SDK 版本可查询： https://github.com/volcengine/volcengine-go-sdk/releases
:::

3. 在代码中引入 SDK 使用。

```Go
import "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
```


4. 更新依赖后，使用命令整理依赖。

```Bash
go mod tidy
```

<span id="f0739bb0"></span>
## 升级 Go SDK
步骤与安装 Go SDK相同，可参考[安装 Go SDK](/docs/82379/1541595#ae8b42ab)，第1，2步升级至最新/指定版本SDK。

* 升级至最新版本

```Bash
go get -u github.com/volcengine/volcengine-go-sdk
```


* 升级至指定版本

```Bash
go get -u github.com/volcengine/volcengine-go-sdk@<VERSION>
```

<span id="e7ae2925"></span>
# Java SDK
<span id="41f31f3c"></span>
## 适用范围
本 SDK 仅适用于 Java 服务端开发，暂不支持 Android 平台。若需在 Android 平台使用相关功能，需由客户自行开发适配方案。
<span id="e3518e9f"></span>
## 前提条件

1. 检查并安装 Java 版本，Java 版本需 1.8 或以上。

```Bash
java -version
```

如未安装 Java 或者版本不满足要求，可访问 [Oracle 官方网站](https://www.java.com/en/download/help/index_installing.html)下载并安装适合操作系统的 Java 版本。请确保选择 1.8 或以上版本。
<span id="ae8db863"></span>
## 安装 Java SDK
火山方舟 Java SDK 支持通过 Maven 安装、通过 Gradle 安装两种方式。
<span id="db12484d"></span>
### 通过 Maven 安装
在 `pom.xml` 文件中进行如下配置，完整配置可参考[Maven Central](https://central.sonatype.com/artifact/com.volcengine/volcengine-java-sdk-ark-runtime)：
```XML
...
<dependency>
  <groupId>com.volcengine</groupId>
  <artifactId>volcengine-java-sdk-ark-runtime</artifactId>
  <version>LATEST</version>
</dependency>
...
```

<span id="4858e8c3"></span>
### 通过 Gradle 安装
在 `build.gradle` 文件中进行如下配置，在 `dependencies` 中添加依赖。
```Plain Text
implementation 'com.volcengine:volcengine-java-sdk-ark-runtime:LATEST'
```

<span id="4ab4182d"></span>
## 升级 Java SDK
:::tip
获取 SDK 版本信息，替换'LATEST' 为指定/最新版本号。SDK版本号可查询：[https://github.com/volcengine/volcengine-java-sdk/releases](https://github.com/volcengine/volcengine-java-sdk/releases)
:::
同安装 Java SDK，指定需升级的版本号即可。
<span id="6f32c555"></span>
# 第三方SDK
火山方舟模型调用 API 与 OpenAI API 协议兼容，可使用兼容 OpenAI API 协议的多语言社区 SDK 调用火山方舟大模型或应用。可很方便地迁移模型服务至方舟平台以及 Doubao 大模型。具体使用方法请参考[兼容 OpenAI SDK](/docs/82379/1330626)。
<span id="4b8511f6"></span>
# 相关文档
[SDK 常见使用示例](/docs/82379/1544136)：包含SDK的常见用法。



火山方舟API分为模型调用的API（数据面 API），及管理推理接入点等管控相关的管控面 API。他们支持的鉴权方式有所不同，下面介绍方舟API的鉴权方式。
<span id="28e0db57"></span>
# 概念解释

* **数据面 API**：是直接面向**业务数据传输、实时交互、用户请求处理**的接口，聚焦于 “实际业务数据的流转与处理”，是系统对外提供核心服务能力的载体。请求大模型服务的 Chat API、Responses API 均为数据面 API。
* **管控面 API**：用于**系统资源管理、配置控制和状态监控**的接口。它专注于管理和调度数据面及系统资源，是保障系统稳定运行的“控制中枢”。例如，在方舟中用于管理 API Key、基础模型等接口，均属于管控面 API。
* **Base URL**：是构建完整 API 请求 URL 的 “基础模板”，包含**协议（如 http/https）、host（主机域名或 IP）、端口（可选）和基础路径（可选）** ，是所有具体接口路径的 “公共前缀”。你可以根据Base URL 加接口/版本等参数拼接出完整接口 URL ，典型结构：`[协议]://[host]/[基础路径（可选）]`

<span id="b77a3928"></span>
# Base URL
:::warning
下面给到的数据面 API 与 Coding Plan 支持的 Base URL 不同。Coding Plan 用户请使用正确的 Base URL，避免因地址错误产生额外费用，具体参见 [Base URL](/docs/82379/1928261#7fd1eee7)。
:::
各接口类型对应的 Base URL。

* 数据面 API：https://ark.cn\-beijing.volces.com/api/v3
* 管控面 API：https://ark.cn\-beijing.volcengineapi.com/

<span id="0fed4817"></span>
# 数据面 API 鉴权
支持两种鉴权方式，API Key 鉴权（简单方便），与 Access Key 鉴权（传统云上资源权限管控，可以分资源组云产品等维度管理，面向企业精细化管理）。
<span id="60db1ed6"></span>
## API Key 签名鉴权
<span id="6011c5a5"></span>
### 前提条件
:::tip
方舟平台的新用户？获取 API Key 及 开通模型等准备工作，请参见 [快速入门](/docs/82379/1399008)。
:::
<span id="d44d13a6"></span>
### 签名构造
在 HTTP 请求 header 中按如下方式添加 `Authorization` header:
```Shell
Authorization: Bearer $ARK_API_KEY
```

示例如下
```Shell
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "Hello!"
        }
    ]
  }'
```


* 可按需替换 Model ID。查询 Model ID见 [模型列表](/docs/82379/1330310)。

<span id="21bff83b"></span>
## Access Key 签名鉴权
<span id="3ad1c414"></span>
### 前提条件
你已获取到Access Key。如需创建/查看Access Key，请参见[API访问密钥管理](https://www.volcengine.com/docs/6257/64983)。
> 由于主账号的Access Key拥有较大权限，建议你创建IAM用户并授予方舟等权限，然后使用IAM用户的 Access Key 来进行操作，具体请参见[使用 IAM 管理权限](/docs/82379/1263493)。

<span id="d03b2bb1"></span>
### 使用示例
见 [使用Access Key鉴权](/docs/82379/1544136#fa44b913)。
> 通过Access Key 鉴权，model 字段 需配置为 Endpoint ID。

<span id="bdd329d5"></span>
# 管控面 API 鉴权
管控面的API，如管理API Key、管理推理接入点等接口。
<span id="50f355e8"></span>
## Access Key 签名鉴权
获取Access Key。如需创建/查看Access Key，请参见[API访问密钥管理](https://www.volcengine.com/docs/6257/64983)。
<span id="c04e9b57"></span>
### 方法：使用示例/说明（简单，推荐）
参见[SDK 接入指南](https://api.volcengine.com/api-sdk/view?serviceCode=ark&version=2024-01-01&language=Java)。
<span id="101d062c"></span>
### 方法：自行实现签名（实现成本高，不推荐）

1. 使用 Access Key 构造签名。具体方法请参见[签名方法](https://www.volcengine.com/docs/6369/67269)。
> 签名用到的方舟相关字段信息：
> * Service：`ark`
> * Region：`cn-beijing`
2. 使用cURL发起请求，请求示例如下：

```Shell
curl -X POST \
  'https://ark.cn-beijing.volcengineapi.com/?Action=ListEndpoints&Version=2024-01-01' \
  -H 'Authorization: HMAC-SHA256 Credential=AKL**/20240710/cn-beijing/ark/request, SignedHeaders=host;x-content-sha256;x-date, Signature=a7a****' \
  -H 'Content-Type: application/json' \
  -H 'Host: ark.cn-beijing.volcengineapi.com' \
  -H 'X-Content-Sha256: 44***' \
  -H 'X-Date: 20240710T042925Z' \
  -d '{}'
```



