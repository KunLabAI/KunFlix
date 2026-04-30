<div align="center">

<img src="frontend/public/kunflix_logo_favicon.svg" alt="KunFlix Logo" width="64" height="64" />

# KunFlix

**AI驱动的影视广告创作平台**

*你的创意，瞬间变成专业级短剧、广告、MV、品牌影片*

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg?logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)

[🚀 快速开始](#-快速开始) · [✨ 核心特性](#-核心特性) · [📖 文档](#-技术架构) · [🗺️ 路线图](#-路线图-roadmap) · [🤝 贡献](#-社区与支持)

> 📚 [技术文档](.qoder/repowiki/zh/content/) | [Technical Docs](.qoder/repowiki/en/content/)（可能需重写，仅供参考）

[English](./README_EN.md) | 简体中文

---

</div>

## 📖 项目简介

KunFlix 是一款**专注于影视广告的AI内容创作Agent平台**，将剧本写作、角色设计、视音频生成、资产管理和智能剪辑全链路打通，让创作者、广告公司和品牌方像拥有一个"私人好莱坞团队"一样，高效完成从0到1的完整影视作品。

## ✨ 核心特性

<table>
<tr>
<td width="50%">

### 🎭 无限画布
人机协作或由智能体创作，无需人工干预

</td>
<td width="50%">

### 🤖 多Agent协作
对话驱动的多智能体协作，复杂任务化繁为简

</td>
</tr>
<tr>
<td width="50%">

### 🔧 Skills系统
内置专用Skills，支持自定义扩展

</td>
<td width="50%">

### 🎨 全链路多模态
剧本 → 角色 → 视音频 → 成片的无缝转化

</td>
</tr>
<tr>
<td width="50%">

### 💰 智能计费
基于积分的精细化消费，灵活定价

</td>
<td width="50%">

### 📊 可视化管理
完整的用户管理、Agent监控、数据分析

</td>
</tr>
</table>

## 🎯 平台定位

KunFlix 专为**影视广告与短剧创作**打造的开放式AI内容创作生态：

| 模块 | 能力 |
|:---:|:---|
| 📝 **剧本创作** | 短剧脚本、广告文案、分镜脚本、角色 backstory |
| 🎭 **角色构建** | 一致性角色形象、服装、表情、动作、场景设计 |
| 🎨 **视觉设计** | 高清图片、海报、场景图、漫画风格素材 |
| 🎬 **多媒体制作** | 视频生成、动画短片、短剧成片、广告宣传片 |
| 🔊 **音频制作** | AI原声配音、背景音乐、音效、旁白同步生成 |
| ✂️ **资产管理** | 生成内容自动存为可复用资产 |

## 🏗️ 技术架构

### 核心技术栈

<table>
<tr>
<th>类别</th>
<th>技术</th>
</tr>
<tr>
<td>后端框架</td>
<td><img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" alt="Python"/> <img src="https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white" alt="FastAPI"/></td>
</tr>
<tr>
<td>AI编排</td>
<td>AgentScope 多智能体框架</td>
</tr>
<tr>
<td>数据库</td>
<td>SQLite (开发) / PostgreSQL (生产) + SQLAlchemy</td>
</tr>
<tr>
<td>前端框架</td>
<td><img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white" alt="Next.js"/> <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/> <img src="https://img.shields.io/badge/Tailwind CSS-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind"/></td>
</tr>
<tr>
<td>实时通信</td>
<td>WebSocket + Server-Sent Events</td>
</tr>
<tr>
<td>状态管理</td>
<td>Zustand + React Context</td>
</tr>
</table>

## 🚀 快速开始

### 环境要求

- Python 3.10+
- Node.js 20+
- SQLite（开发）/ PostgreSQL（生产）

### 安装步骤

<summary><b>📦 克隆项目</b></summary>

```bash
git clone https://github.com/KunLabAI/KunFlix.git
cd KunFlix
```

### 🎯 开发模式一键启动

```bash
python dev.py
```

### 🎯 生产模式一键启动(推荐)

```bash
python start.py
```

### 或者 手动安装

<details>
<summary><b>⚙️ 1. 后端配置</b></summary>

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt  #安装所有依赖项
python scripts/seed_db.py  # 初始化数据库
python main.py     # 启动后端服务
```
</details>

<details>
<summary><b>🎨 2. 前端配置</b></summary>

```bash
cd frontend
npm install
cp .env.local.example .env.local
# 编辑 .env.local 配置API地址
npm run dev
```
</details>

<details>
<summary><b>📊 3. 管理后台配置</b></summary>

```bash
cd backend/admin
npm install
npm run dev
```
</details>

### 访问地址

| 服务 | 地址 |
|:---:|:---:|
| 🎭 剧场客户端 | http://localhost:3666 |
| 📊 管理后台 | http://localhost:3888 |
| 📖 API文档 | http://localhost:8000/docs |

## 📋 简单使用流程

### 1. 配置 AI 供应商

进入后台管理端（http://localhost:3888），在 **AI 供应商模块** 输入对应 API Key：

- OpenAI/ Azure OpenAI
- Google Gemini 
- xAI Grok
- MiniMax
- DeepSeek
- Dashscope（阿里百炼）
- 火山引擎/火山方舟
- 其他供应商后续支持

### 2. 创建智能体

在 **智能体管理页面** 创建智能体：

1. 填写智能体名称和描述
2. 选择底层模型（如 Grok、Gemini等）建议使用多模态，目前发现Gemini对于艺术类支持很友善
3. **开启预设能力（Skills）**：根据需求启用图像生成、视频生成、音乐生成等技能
4. **工具模块**：开启 Skills 后，工具模块可以默认关闭

### 3. 开始使用

创建完成后，前端用户即可在 **无限画布** 中使用该智能体进行创作：

- 与智能体对话，描述创作需求
- 智能体自动调用已开启的技能生成内容
- 生成的图片、视频、音乐自动保存为可复用资产

## 💡 应用场景

<table>
<tr>
<th>🎬 影视创作者</th>
<th>📢 广告与营销团队</th>
<th>🏢 企业与个人创作者</th>
</tr>
<tr>
<td>

- 短剧/微短剧全流程创作
- 品牌广告片、TVC快速生成
- MV、动画短片制作

</td>
<td>

- 30秒/15秒竖屏广告一键生成
- 社交媒体短视频批量生产
- 品牌IP形象视频创作

</td>
<td>

- 个人创意短视频升级
- Vlog专业级影片制作
- 私人影视资产永久保存

</td>
</tr>
</table>



## 📂 目录结构

```bash
KunFlix/
├── backend/                   # Python 后端服务
│   ├── admin/                 # 后台管理系统 (Next.js)
│   ├── routers/               # API 路由模块
│   ├── services/              # 核心业务服务
│   ├── skills/                # 技能目录
│   └── ...
├── frontend/                  # 剧场客户端前端
└── ...
```

## 🗺️ 路线图 (Roadmap)

我们正在持续迭代 KunFlix，以下是即将推出的核心功能：

| 优先级 | 功能 | 状态 | 描述 |
|:---:|:---|:---:|:---|
| 🔴 高 | 画布节点工具化 | 🚧 进行中 | 将画布中的内容节点（图片、视频、音频）工具化，支持智能体直接引用和二次创作 |
| 🔴 高 | TTS 供应商补齐 | 📋 规划中 | 接入更多 TTS 供应商（Azure TTS、ElevenLabs、火山引擎等），提供更多音色选择 |
| 🟡 中 | TTS 节点功能 | 📋 规划中 | 在画布中增加 TTS 专用节点，支持文本转语音、语音克隆、多角色配音等功能 |
| 🟡 中 | 多智能体模块优化 | 🚧 进行中 | 优化多智能体协作的稳定性、任务分派逻辑和事件流显示 |

> 💡 欢迎通过 [GitHub Issues](https://github.com/KunLabAI/KunFlix/issues) 提交功能建议或投票支持你最期待的功能！

## 🤝 社区与支持

### 参与贡献

欢迎各种形式的贡献！

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://makeapullrequest.com)

```
Fork → Branch → Commit → Push → Pull Request
```

### 交流渠道

| 渠道 | 地址 |
|:---:|:---:|
| 📧 邮件支持 | zack@kunpuai.com |
| 💬 GitHub Discussions | 社区讨论和技术交流 |
| 📚 文档中心 | 详细的使用指南和API文档 |

## 📄 许可证

本项目基于 **Apache License 2.0** 许可证，并附带附加条款。详见 [license](license) 文件。

### 商业使用

> **免费商用**：在未修改源代码的前提下，可将本软件用于商业目的，无需支付费用。如果这款软件有帮助到您赚到了钱，不妨请开发者喝一杯咖啡，哈哈。☕

**需商业授权的情形：**

- 📦 对本软件进行二次开发、修改或衍生
- 👥 向企业客户提供支持 10 人或以上用户的多租户服务
- 🔧 将本软件预装或集成至硬件设备进行捆绑销售
- 🏛️ 向政府或教育机构提供大规模采购服务

如需申请商业授权，请联系：📧 zack@kunpuai.com

### 贡献者协议

贡献的代码可能会被用于商业用途（包括云端服务等）。开发团队保留调整开源协议的权利。

### 第三方服务

使用本平台需遵守各AI服务提供商的使用条款：OpenAI · Google Gemini · xAI Grok · 火山引擎

---

<div align="center">

**[⬆ 回到顶部](#-kunflix)**

Made with ❤️ by KunpuAI

</div>
