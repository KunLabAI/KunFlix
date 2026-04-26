import React from 'react';
import { Server } from 'lucide-react';

const MCPClients: React.FC<{ disabled?: boolean }> = () => {
  return (
    <div className="mt-6 border-t pt-4">
      <h4 className="text-sm font-medium mb-3 flex items-center">
        <Server className="w-4 h-4 mr-2 text-muted-foreground" />
        MCP 客户端 (Model Context Protocol)
      </h4>
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">功能开发中，敬请期待</p>
      </div>
    </div>
  );
};

export default MCPClients;
