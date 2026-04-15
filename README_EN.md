<div align="center">

<img src="frontend/public/kunflix_logo_favicon.svg" alt="KunFlix Logo" width="64" height="64" />

# KunFlix

**AI-Powered Film & Advertising Content Creation Platform**

*Transform your ideas into professional short films, commercials, music videos, and brand content—instantly*

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg?logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)

[🚀 Quick Start](#-quick-start) · [✨ Features](#-core-features) · [📖 Docs](#-tech-stack) · [🗺️ Roadmap](#-roadmap) · [🤝 Contributing](#-community--support)

> 📚 [技术文档](.qoder/repowiki/zh/content/) | [Technical Docs](.qoder/repowiki/en/content/) (May need rewriting, for reference only)

English | [简体中文](./README.md)

---

</div>

## 📖 About

KunFlix is an **AI content creation agent platform focused on film advertising and video production**. It seamlessly integrates scriptwriting, character design, audio/video generation, asset management, and intelligent editing—empowering creators, agencies, and brands to produce complete video works from scratch, just like having a "private Hollywood team" at your fingertips.

## ✨ Core Features

<table>
<tr>
<td width="50%">

### 🎭 Infinite Canvas
Human-AI collaboration or fully autonomous agent creation

</td>
<td width="50%">

### 🤖 Multi-Agent Collaboration
Dialogue-driven multi-agent system that simplifies complex tasks

</td>
</tr>
<tr>
<td width="50%">

### 🔧 Skills System
Built-in specialized skills with custom extension support

</td>
<td width="50%">

### 🎨 End-to-End Multimodal
Seamlessly transforming scripts → characters → audio/video → final productions

</td>
</tr>
<tr>
<td width="50%">

### 💰 Smart Billing
Credit-based consumption model with flexible pricing

</td>
<td width="50%">

### 📊 Visual Dashboard
Complete user management, agent monitoring, and data analytics

</td>
</tr>
</table>

## 🎯 Platform Positioning

KunFlix is an open AI content creation ecosystem designed for **film advertising and short drama production**:

| Module | Capabilities |
|:---:|:---|
| 📝 **Script Creation** | Short drama scripts, ad copy, storyboards, character backstories |
| 🎭 **Character Building** | Consistent character designs, costumes, expressions, movements, scenes |
| 🎨 **Visual Design** | HD images, posters, scene illustrations, comic-style assets |
| 🎬 **Multimedia Production** | Video generation, animated shorts, drama productions, promos |
| 🔊 **Audio Production** | AI voice-over, background music, sound effects, narration |
| ✂️ **Asset Management** | Generated content automatically saved as reusable assets |

## 🏗️ Tech Stack

### Core Technologies

<table>
<tr>
<th>Category</th>
<th>Technology</th>
</tr>
<tr>
<td>Backend</td>
<td><img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" alt="Python"/> <img src="https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white" alt="FastAPI"/></td>
</tr>
<tr>
<td>AI Orchestration</td>
<td>AgentScope Multi-Agent Framework</td>
</tr>
<tr>
<td>Database</td>
<td>SQLite (Dev) / PostgreSQL (Prod) + SQLAlchemy</td>
</tr>
<tr>
<td>Frontend</td>
<td><img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white" alt="Next.js"/> <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/> <img src="https://img.shields.io/badge/Tailwind CSS-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind"/></td>
</tr>
<tr>
<td>Real-time Communication</td>
<td>WebSocket + Server-Sent Events</td>
</tr>
<tr>
<td>State Management</td>
<td>Zustand + React Context</td>
</tr>
</table>

## 🚀 Quick Start

### Prerequisites

- Python 3.10+
- Node.js 20+
- SQLite (Development) / PostgreSQL (Production)

### Installation

<summary><b>📦 Clone Repository</b></summary>

```bash
git clone https://github.com/KunLabAI/KunFlix.git
cd KunFlix
```

### 🎯 One-Command Start

```bash
python dev.py
```

<details>
<summary><b>⚙️ 1. Backend Setup</b></summary>

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python seed_db.py
python main.py
```
</details>

<details>
<summary><b>🎨 2. Frontend Setup</b></summary>

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local to configure API address
npm run dev
```
</details>

<details>
<summary><b>📊 3. Admin Dashboard Setup</b></summary>

```bash
cd backend/admin
npm install
npm run dev
```
</details>

### Access URLs

| Service | URL |
|:---:|:---:|
| 🎭 Theater Client | http://localhost:3666 |
| 📊 Admin Dashboard | http://localhost:3888 |
| 📖 API Docs | http://localhost:8000/docs |

## 📋 Quick Start Guide

### 1. Configure AI Providers

Enter the Admin Dashboard (http://localhost:3888) and input the corresponding API Key in the **AI Providers module**:

- OpenAI
- Google Gemini
- xAI Grok
- Volcengine
- MiniMax
- DeepSeek
- Dashscope (Alibaba Bailian)
- Other providers will be supported in future updates

### 2. Create an Agent

Create an agent in the **Agent Management page**:

1. Enter the agent name and description
2. Select the underlying model (e.g., Grok, Gemini, etc.). We recommend using multimodal models; currently, Gemini shows excellent support for artistic content
3. **Enable Preset Capabilities (Skills)**: Enable image generation, video generation, music generation, and other skills based on your needs
4. **Tools Module**: After enabling Skills, the Tools module can be left disabled by default

### 3. Start Creating

Once created, frontend users can use this agent in the **Infinite Canvas** for creation:

- Chat with the agent to describe your creative needs
- The agent automatically invokes enabled skills to generate content
- Generated images, videos, and music are automatically saved as reusable assets

## 💡 Use Cases

<table>
<tr>
<th>🎬 Film Creators</th>
<th>📢 Marketing Teams</th>
<th>🏢 Enterprises & Individuals</th>
</tr>
<tr>
<td>

- End-to-end short drama production
- Brand commercials, TVC rapid generation
- Music videos, animated shorts

</td>
<td>

- One-click 30s/15s vertical video ads
- Batch social media video production
- Brand IP video content creation

</td>
<td>

- Upgrade personal creative videos
- Professional vlog production
- Permanent private video assets

</td>
</tr>
</table>

## 📂 Directory Structure

```bash
KunFlix/
├── backend/                   # Python backend service
│   ├── admin/                 # Admin dashboard (Next.js)
│   ├── routers/               # API route modules
│   ├── services/              # Core business services
│   ├── skills/                # Skills directory
│   └── ...
├── frontend/                  # Theater client frontend
└── ...
```

## 🗺️ Roadmap

We are continuously iterating on KunFlix. Here are the upcoming core features:

| Priority | Feature | Status | Description |
|:---:|:---|:---:|:---|
| 🔴 High | Canvas Node Toolization | 🚧 In Progress | Transform content nodes (images, videos, audio) in the canvas into tools, enabling agents to directly reference and remix them |
| 🔴 High | TTS Provider Expansion | 📋 Planned | Integrate more TTS providers (Azure TTS, ElevenLabs, Volcano Engine, etc.) for more voice options |
| 🟡 Medium | TTS Node Features | 📋 Planned | Add dedicated TTS nodes in the canvas, supporting text-to-speech, voice cloning, multi-character dubbing, and more |
| 🟡 Medium | Multi-Agent Module Optimization | 🚧 In Progress | Optimize multi-agent collaboration stability, task dispatch logic, and event stream display |

> 💡 Welcome to submit feature requests or vote for your most anticipated features via [GitHub Issues](https://github.com/KunLabAI/KunFlix/issues)!

## 🤝 Community & Support

### Contributing

All forms of contributions are welcome!

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://makeapullrequest.com)

```
Fork → Branch → Commit → Push → Pull Request
```

### Contact

| Channel | Address |
|:---:|:---:|
| 📧 Email | zack@kunpuai.com |
| 💬 GitHub Discussions | Community discussions and technical exchange |
| 📚 Documentation | Detailed user guides and API documentation |

## 📄 License

This project is based on **Apache License 2.0** with additional terms. See the [license](license) file for details.

### Commercial Use

> **Free Commercial Use**: You may use this software for commercial purposes without modifying the source code and without paying any fees. If this software has helped you make money, consider buying the developers a coffee! ☕

**Commercial Authorization Required:**

- 📦 Secondary development, modification, or derivation of this software
- 👥 Providing multi-tenant services to enterprise clients supporting 10+ users
- 🔧 Pre-installing or integrating this software into hardware devices for bundled sales
- 🏛️ Providing large-scale procurement services to government or educational institutions

For commercial authorization inquiries, contact: 📧 zack@kunpuai.com

### Contributor Agreement

Contributed code may be used for commercial purposes (including cloud services, etc.). The development team reserves the right to adjust the open-source license.

### Third-Party Services

Use of this platform requires compliance with the terms of service of each AI provider: OpenAI · Google Gemini · xAI Grok · Volcano Engine

---

<div align="center">

**[⬆ Back to Top](#-kunflix)**

Made with ❤️ by KunpuAI

</div>
