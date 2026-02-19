# 无限剧情游戏系统 (Infinite Narrative Game System)

欢迎来到无限剧情游戏系统的开发者Wiki。本项目致力于构建一个基于多模态AI驱动的无限剧情游戏平台。

## 项目愿景
利用大语言模型（LLM）作为核心叙事引擎，结合多模态生成技术（图像、音频），为玩家提供一个永远没有终点、内容动态生成、高度互动的沉浸式游戏体验。

## 核心功能模块

1.  **世界观与内容生成引擎**
    *   动态生成世界观、剧情和人物。
    *   章节预生成机制（N+2策略）。
    *   剧情一致性与偏离度检测。

2.  **多模态资产生产管线**
    *   实时生成场景图、立绘（Visual）。
    *   实时语音合成与背景音乐生成（Audio）。
    *   资产缓存与去重机制。

3.  **交互式叙事系统**
    *   多样化的交互形式（选择、填空、判断）。
    *   深度NPC互动系统（好感度、信任度）。
    *   实时WebSocket交互。

## 文档导航

*   **[系统架构 (Architecture)](Architecture)**: 了解系统的整体技术架构与数据流向。
*   **[后端开发指南 (Backend Guide)](Backend-Guide)**: Python后端、AgentScope智能体编排、数据库设计与API说明。
*   **[前端开发指南 (Frontend Guide)](Frontend-Guide)**: Next.js架构、Pixi.js渲染与WebSocket通信。
*   **[部署与环境配置 (Deployment)](Deployment)**: 如何在本地（Windows）环境搭建开发环境。
*   **[需求追踪 (Requirements Traceability)](Requirements-Traceability)**: 原始需求与当前实现的对应关系及完成度。

## 快速开始

请参考根目录下的 `README.md` 或 Wiki中的 [部署与环境配置](Deployment) 页面。
