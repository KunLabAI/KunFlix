'use client';

import React from 'react';
import { ServerCog } from 'lucide-react';

export default function MCPPage() {
  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">MCP 客户端管理</h2>
          <p className="text-muted-foreground mt-2">
            Model Context Protocol (MCP) 允许 Agent 动态连接到外部工具和数据源。支持无感热重载。
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 py-20">
        <ServerCog className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-1">功能开发中</h3>
        <p className="text-sm text-muted-foreground/60">MCP 客户端管理功能尚未实装，敬请期待</p>
      </div>
    </div>
  );
}
