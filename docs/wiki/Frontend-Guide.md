# 前端开发指南 (Frontend Guide)

## 目录结构
```bash
frontend/
├── src/
│   ├── app/                # Next.js 16 App Router
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx        # 首页入口
│   ├── components/         # 页面组件
│   │   ├── GameCanvas.tsx  # Pixi.js 游戏画布
│   │   ├── ui/             # 通用UI组件 (shadcn/ui等)
│   ├── hooks/              # 自定义Hooks
│   │   ├── useSocket.ts    # WebSocket通信hook
│   ├── lib/                # 工具函数
├── next.config.ts          # Next.js 配置
├── tailwind.config.ts      # Tailwind CSS 配置
├── package.json
```

## 核心组件

### 1. GameCanvas (Pixi.js)
*   **位置**: `src/components/GameCanvas.tsx`
*   **功能**:
    *   负责渲染动态场景、角色立绘和UI元素。
    *   动态加载Pixi.js资源（使用`dynamic` import实现SSR兼容）。
    *   `width`, `height`: 画布尺寸参数。
*   **状态管理**:
    *   内部管理Pixi Application实例。
    *   监听外部props变化以更新渲染内容。

### 2. useSocket Hook (WebSocket)
*   **位置**: `src/hooks/useSocket.ts`
*   **功能**:
    *   建立与后端的WebSocket连接（`ws://localhost:8000/ws/{player_id}`）。
    *   处理消息接收与发送（JSON格式）。
    *   维护连接状态（isConnected）。
*   **使用示例**:
    ```typescript
    const { isConnected, messages, sendMessage } = useSocket(playerId);
    ```

### 3. Home Page (Page.tsx)
*   **位置**: `src/app/page.tsx`
*   **功能**:
    *   玩家登录/创建入口。
    *   游戏主界面布局（Canvas + Story Log）。
    *   触发剧情初始化API调用。
    *   展示WebSocket实时接收的剧情文本。

## 样式与交互
*   **Tailwind CSS**: 采用原子化CSS框架快速构建UI。
*   **React State**: 管理当前玩家ID、输入框状态等。
*   **动态加载**: `GameCanvas` 组件使用 `next/dynamic` 且 `ssr: false`，确保仅在客户端加载Pixi.js。

## 调试与运行

1.  确保后端API已启动（默认端口8000）。
2.  在前端根目录下运行:
    ```bash
    npm run dev
    ```
3.  访问 `http://localhost:3000`。
4.  输入用户名并点击 "Start Adventure"。
5.  观察控制台和UI上的 WebSocket 连接状态与消息。
