# AI创想工坊 (AI Creation Workshop)

这是一个基于 **AgentScope** 多智能体框架构建的通用AI内容创作和交互平台。利用先进的LLM技术和多模态生成能力，为创作者、开发者和企业提供强大的AI辅助创作工具。

## 平台定位

AI创想工坊是一个**开放式的AI内容创作生态系统**，支持：
- 📝 **文本创作**：文章写作、短剧/慢剧故事写作、文档处理
- 🎨 **视觉设计**：图像生成、场景构建、角色设计、场景设计
- 🎬 **多媒体制作**：视频生成、动画制作、漫画制作、短剧制作
- 🤖 **智能代理**：自动化任务处理、智能客服、数据分析
- 📊 **商业应用**：营销文案、产品设计、海报设计、物料设计

## 核心特性

- **智能代理编排**：基于 AgentScope 的多智能体协作系统，支持动态任务分配和复杂工作流
- **插件化技能体系**：可扩展的技能插件架构，支持自定义功能开发和第三方集成
- **多模态内容生成**：集成多种AI服务商（OpenAI、Anthropic、Google、XAI等）的文本、图像、视频生成能力
- **实时交互引擎**：基于WebSocket和Server-Sent Events的低延迟双向通信
- **动态配置管理**：支持运行时切换LLM提供商和服务配置，无需重启服务
- **智能计费系统**：基于积分的精细化消费模式，支持订阅套餐和灵活定价
- **可视化管理后台**：提供完整的用户管理、代理监控、资源配置和数据分析界面
- **开放扩展架构**：模块化设计，支持技能插件、自定义代理和第三方服务集成

## 技术架构

### 核心技术栈
- **后端框架**：Python 3.10+ / FastAPI (异步高性能)
- **AI编排**：AgentScope 多智能体框架
- **数据库**：SQLite (开发) / PostgreSQL (生产) + SQLAlchemy 异步ORM
- **前端框架**：Next.js 16 + TypeScript + Tailwind CSS
- **实时通信**：WebSocket + Server-Sent Events
- **状态管理**：Zustand + React Context
- **数据库迁移**：Alembic

### 系统组件
- **智能代理引擎**：基于AgentScope的分布式智能体系统
- **技能插件系统**：可扩展的功能模块架构
- **多模态处理器**：文本、图像、视频等多格式内容处理
- **实时通信层**：低延迟的双向数据传输
- **计费管理系统**：精细化的消费和订阅管理
- **可视化控制台**：Web-based管理界面

## 应用场景

### 创作者工具
- ✍️ **内容写作**：文章、博客、小说、剧本创作
- 🎨 **视觉设计**：Logo设计、插画创作、UI界面设计
- 🎵 **音频制作**：配音、音效、背景音乐生成
- 🎬 **视频制作**：短视频、宣传片、教学视频创作

### 商业应用
- 💼 **营销推广**：广告文案、社交媒体内容、品牌宣传
- 📊 **数据分析**：报告生成、趋势分析、可视化展示
- 🛍️ **电商运营**：商品描述、客服对话、用户画像
- 🏢 **企业服务**：文档处理、会议纪要、知识管理

### 开发工具
- 💻 **代码辅助**：编程、调试、文档生成
- 🔧 **自动化工具**：任务调度、数据处理、系统运维
- 🧪 **测试工具**：单元测试、集成测试、性能测试
- 📦 **部署工具**：CI/CD、容器化、云服务管理

### 教育培训
- 🎓 **在线教育**：课程内容、练习题、学习资料
- 👨‍🏫 **智能辅导**：个性化教学、答疑解惑、学习评估
- 📚 **知识管理**：知识库建设、信息整理、内容检索
- 🎪 **互动教学**：虚拟实验、情景模拟、游戏化学习

## 目录结构

```bash
Infinite Game/
├── backend/                    # Python 后端服务
│   ├── admin/                  # 后台管理系统 (Next.js 前端)
│   │   ├── src/                # 管理后台源码
│   │   │   ├── app/           # 页面路由
│   │   │   ├── components/    # 管理组件
│   │   │   └── hooks/         # 自定义钩子
│   │   └── package.json       # 管理后台依赖
│   ├── routers/                # API 路由模块
│   │   ├── admin.py           # 管理员 API
│   │   ├── admin_auth.py      # 管理员认证
│   │   ├── agents.py          # 智能体管理 API
│   │   ├── chats.py           # 聊天交互 API
│   │   ├── llm_config.py      # LLM 配置 API
│   │   ├── media.py           # 媒体资源 API
│   │   ├── orchestrate.py     # 多智能体编排 API
│   │   ├── prompt_templates.py # 提示词模板 API
│   │   ├── skills_api.py      # 技能管理 API
│   │   ├── subscriptions.py   # 订阅管理 API
│   │   ├── theaters.py        # 剧院系统 API
│   │   └── videos.py          # 视频生成 API
│   ├── services/               # 核心业务服务
│   │   ├── agent_executor.py  # 智能体执行器
│   │   ├── billing.py         # 计费系统
│   │   ├── canvas_tools.py    # 画布工具
│   │   ├── image_gen_tools.py # 图像生成工具
│   │   ├── llm_stream.py      # LLM 流式处理
│   │   ├── orchestrator.py    # 编排服务
│   │   ├── theater.py         # 剧院核心服务
│   │   └── video_generation.py # 视频生成服务
│   ├── migrations/             # 数据库迁移文件
│   │   └── versions/          # 具体迁移脚本
│   ├── media/                  # 媒体资源存储目录
│   ├── skills/                 # 技能插件目录
│   ├── agents.py              # AgentScope 智能体定义
│   ├── main.py                # FastAPI 应用入口
│   ├── models.py              # 数据库模型定义
│   ├── schemas.py             # Pydantic 数据模型
│   ├── config.py              # 配置管理
│   ├── database.py            # 数据库连接
│   ├── requirements.txt       # Python 依赖
│   └── alembic.ini            # 数据库迁移配置
├── frontend/                   # 剧场客户端前端
│   ├── src/                   # 前端源码
│   │   ├── app/               # 应用页面
│   │   ├── components/        # UI 组件
│   │   ├── hooks/             # 自定义钩子
│   │   ├── store/             # 状态管理
│   │   └── lib/               # 工具库
│   ├── public/                # 静态资源
│   └── package.json           # 前端依赖
├── docs/                       # 项目文档
│   └── wiki/                  # 详细开发文档
└── README.md                  # 项目说明文档
```

## 快速开始

### 系统要求
- Python 3.10+
- Node.js 18+
- (可选) PostgreSQL 数据库
- (可选) Redis 缓存服务

### 安装部署

#### 1. 后端服务部署

```bash
cd backend

# 创建虚拟环境
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑配置API密钥和数据库连接

# 初始化数据库
python manage_db.py upgrade

# 启动服务
python main.py
# 服务地址: http://localhost:8000
```

#### 2. 前端控制台

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务
npm run dev
# 访问地址: http://localhost:3000
```

#### 3. 管理后台

```bash
cd backend/admin

# 安装依赖
npm install

# 启动服务
npm run dev
# 管理地址: http://localhost:3001

# 默认管理员账号
# 邮箱: admin@infinite.theater
# 密码: admin123
```

## 核心功能详解

### 1. 智能代理系统
基于 AgentScope 构建的分布式智能体架构：
- **任务分解**：复杂任务自动拆分为子任务
- **代理协作**：多个代理协同完成工作
- **动态调度**：根据负载和能力智能分配任务
- **状态同步**：实时共享上下文和进度信息

### 2. 技能插件体系
高度可扩展的功能架构：
- **内置技能**：文件读取、目录浏览、代码分析等基础能力
- **自定义技能**：支持开发者创建专用功能模块
- **技能商店**：第三方技能插件的发现和安装
- **热插拔机制**：运行时启用/禁用技能无需重启

### 3. 多模态处理
统一的内容处理框架：
- **文本处理**：自然语言理解、生成、翻译、摘要
- **图像生成**：支持多种AI绘画服务集成
- **视频制作**：视频生成、剪辑、特效处理
- **音频合成**：语音合成、音效生成、背景音乐

### 4. 实时交互引擎
低延迟的双向通信系统：
- **流式响应**：逐字输出，即时反馈
- **状态推送**：任务进度、系统状态实时更新
- **多人协作**：支持多用户同时在线交互
- **会话管理**：持久化对话历史和上下文

## 开发者指南

### 技能插件开发

创建自定义技能插件：

```bash
# 在 customized_skills 目录下创建技能
mkdir backend/skills/customized_skills/my_skill

# 创建技能描述文件
cat > backend/skills/customized_skills/my_skill/SKILL.md << 'EOF'
---
name: my_skill
description: "我的自定义技能功能描述"
---
# My Custom Skill

这里是技能的详细使用说明...
EOF

# 启用技能
python -c "from skills_manager import SkillService; s = SkillService(Path('.')); s.enable_skill('my_skill')"
```

### 智能代理配置

通过管理后台或API配置自定义代理：

```python
{
  "name": "内容审核代理",
  "description": "专门处理内容质量和合规性检查",
  "model": "gpt-4-turbo",
  "temperature": 0.3,
  "skills": ["content_analysis", "fact_checking"],
  "system_prompt": "你是一个专业的内容审核专家..."
}
```

### API集成

平台提供完整的RESTful API：

```javascript
// 发起聊天请求
const response = await fetch('/api/chats/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '帮我写一篇关于AI的文章',
    agent_id: 'writing_assistant',
    session_id: 'session_123'
  })
});

// 处理流式响应
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // 处理实时文本流
}
```

## 部署与运维

### 生产环境部署

推荐使用Docker容器化部署：

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 性能优化建议

- **数据库优化**：生产环境建议使用PostgreSQL并配置连接池
- **缓存策略**：启用Redis缓存频繁访问的数据
- **负载均衡**：多实例部署配合反向代理
- **监控告警**：集成Prometheus/Grafana进行系统监控

### 安全配置

- 修改默认管理员密码
- 配置HTTPS证书
- 设置适当的API访问频率限制
- 定期备份数据库和重要配置

## 社区与支持

### 参与贡献

欢迎各种形式的贡献：
- 🐛 报告bug和问题
- 💡 提出功能建议
- 🔧 提交代码改进
- 📖 完善文档说明
- 🎨 设计UI/UX改进
- 🧪 编写测试用例

### 开发流程

1. Fork 项目仓库
2. 创建功能分支
3. 编写代码和测试
4. 提交Pull Request
5. 代码审查和合并

### 交流渠道

- 📧 邮件支持：support@aicreation.workshop
- 💬 GitHub Discussions：社区讨论和技术交流
- 📚 文档中心：详细的使用指南和API文档
- 🎥 视频教程：YouTube/B站官方频道

## 许可证与法律

本项目采用 MIT 许可证，详细条款请查看 [LICENSE](LICENSE) 文件。

### 商业使用
- 个人和商业用途均可免费使用
- 修改和分发源代码允许
- 请在分发时保留原版权信息
- 不提供任何形式的担保

### 第三方服务
使用本平台需遵守各AI服务提供商的使用条款：
- OpenAI API使用政策
- Anthropic Claude使用协议
- Google Gemini服务条款
- 其他集成服务的相关规定
